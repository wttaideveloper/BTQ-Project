import type { Express, RequestHandler } from "express";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { database } from "./database";
import {
  championships, championshipMatches, championshipTeams, users,
} from "@shared/schema";
import { broadcastChampionshipEvent } from "./socket";

const championshipFields = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullish(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  status: z.enum(["draft", "active", "completed"]).default("draft"),
});
const championshipInput = championshipFields.refine(value => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
  message: "End date must be on or after the start date",
});
const teamInput = z.object({
  championshipId: z.string().min(1), name: z.string().trim().min(1).max(80),
  captainId: z.coerce.number().int().positive(),
  memberIds: z.array(z.coerce.number().int().positive()).default([]),
  emoticon: z.string().min(1).max(300).default("👏"),
});
const matchInput = z.object({
  championshipId: z.string().min(1), teamAId: z.string().min(1), teamBId: z.string().min(1),
  scheduledAt: z.coerce.date().nullish(), streamUrl: z.string().url().nullish(),
});

export function registerChampionshipRoutes(app: Express, ensureAdmin: RequestHandler) {
  const db = database.db;
  const fail = (res: any, error: unknown) => {
    console.error("[Championship]", error);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
  };

  /**
   * Reject member id lists that reference users which do not exist.
   *
   * championship_teams.member_ids is a JSON integer array with no foreign key,
   * so nothing at the database level validates it (captain_id, by contrast, IS
   * a real FK to users). POST /api/championship-teams/:id/members already
   * checks the user exists; team create and team edit did not, so a phantom id
   * could be stored. It never crashed a read - GET /api/championship-teams/:id
   * substitutes a "User {id}" placeholder and getTeamsForTeamBattleSession()
   * silently drops unresolvable teammates - but it produced teams whose roster
   * shows members that can never log in or play. This makes all three paths
   * consistent.
   */
  /**
   * Strip the internal Team Battle session key from a match before it leaves
   * through a read endpoint.
   *
   * game_session_id is the join key between championship_matches and
   * team_battles. It was being returned by the public spectator endpoints and
   * broadcast to every anonymous watcher, which turned an engine-internal
   * weakness into a publicly reachable one:
   *
   *   1. spectator reads game_session_id from the public match payload
   *   2. sends the WebSocket event `get_game_state` with it
   *   3. handleGetGameState() requires only client.userId - never membership -
   *      and falls back to sessionTeams[0] for non-members, so it replies with
   *      `game_state_update` carrying gameState.currentQuestion: the whole
   *      question object, including answers[].isCorrect
   *
   * i.e. the correct answer, live, to anyone who opened the watch page. The
   * session id is a v4 uuid, so withholding it closes the chain. Participants
   * are unaffected: they receive game_session_id from
   * POST /api/championship-matches/:id/join, which does check membership.
   *
   * The underlying missing membership check inside handleGetGameState is a
   * Team Battle engine concern and is left for a later phase - see the report.
   */
  const toPublicMatch = <T extends { gameSessionId?: string | null }>(match: T) => {
    const { gameSessionId: _internal, ...publicFields } = match;
    return publicFields;
  };

  const assertUsersExist = async (ids: number[]) => {
    if (!ids.length) return;
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
    const missing = ids.filter(id => !found.some(user => user.id === id));
    if (missing.length) {
      throw new Error(`Unknown user id(s): ${missing.join(", ")}`);
    }
  };

  app.get("/api/championships", async (_req, res) =>
    res.json(await db.select().from(championships)));
  app.get("/api/championships/me/dashboard", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) return res.status(401).json({ message: "Authentication required" });
    const active = await db.select().from(championships).where(eq(championships.status, "active"));
    const championship = active[0] ?? null;
    if (!championship) return res.json({ championship: null, team: null, matches: [] });
    const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, championship.id));
    const team = teams.find(item => (item.memberIds ?? []).includes(req.user!.id)) ?? null;
    const matches = await db.select().from(championshipMatches).where(eq(championshipMatches.championshipId, championship.id));
    // Participants obtain the Team Battle session key from
    // POST /api/championship-matches/:id/join, which checks membership, so it
    // is withheld here too. See toPublicMatch.
    const visible = team ? matches.filter(match => match.teamAId === team.id || match.teamBId === team.id) : matches;
    res.json({ championship, team, teams, matches: visible.map(toPublicMatch) });
  });
  app.post("/api/championships", ensureAdmin, async (req, res) => {
    try {
      const data = championshipInput.parse(req.body);
      // "active" denotes the single current championship: /me/dashboard takes
      // active[0], and POST /api/championship-matches/:id/start refuses any
      // championship that is not active. PATCH already demotes every other
      // active row when one is activated, but creating a championship directly
      // with status:"active" bypassed that rule entirely. Two active
      // championships means two simultaneously live matches, which in turn lets
      // one user be pulled into two Team Battles at once.
      //
      // This mirrors the PATCH branch exactly. Draft creation - what the admin
      // UI always sends - is unaffected because the branch does not run.
      if (data.status === "active") {
        await db.update(championships).set({ status: "draft", updatedAt: new Date() })
          .where(eq(championships.status, "active"));
      }
      const [row] = await db.insert(championships).values({ id: uuid(), ...data }).returning();
      res.status(201).json(row);
    } catch (e) { fail(res, e); }
  });
  app.patch("/api/championships/:id", ensureAdmin, async (req, res) => {
    try {
      const data = championshipFields.partial().refine(value => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
        message: "End date must be on or after the start date",
      }).parse(req.body);
      if (data.status === "active") {
        await db.update(championships).set({ status: "draft", updatedAt: new Date() })
          .where(and(eq(championships.status, "active"), ne(championships.id, req.params.id)));
      }
      const [row] = await db.update(championships).set({ ...data, updatedAt: new Date() })
        .where(eq(championships.id, req.params.id)).returning();
      row ? res.json(row) : res.status(404).json({ message: "Championship not found" });
    } catch (e) { fail(res, e); }
  });
  app.delete("/api/championships/:id", ensureAdmin, async (req, res) => {
    try {
      const [championship] = await db.select().from(championships).where(eq(championships.id, req.params.id));
      if (!championship) return res.status(404).json({ message: "Championship not found" });
      const liveMatches = await db.select().from(championshipMatches).where(and(
        eq(championshipMatches.championshipId, championship.id),
        eq(championshipMatches.status, "live"),
      ));
      if (liveMatches.length) return res.status(409).json({ message: "End the live match before deleting this championship" });
      await db.delete(championshipMatches).where(eq(championshipMatches.championshipId, championship.id));
      await db.delete(championshipTeams).where(eq(championshipTeams.championshipId, championship.id));
      await db.delete(championships).where(eq(championships.id, championship.id));
      broadcastChampionshipEvent({ type: "championship_deleted", championshipId: championship.id });
      res.status(204).end();
    } catch (error) { fail(res, error); }
  });

  app.get("/api/championships/:id", async (req, res) => {
    const [championship] = await db.select().from(championships).where(eq(championships.id, req.params.id));
    if (!championship) return res.status(404).json({ message: "Championship not found" });
    const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, req.params.id));
    const matches = await db.select().from(championshipMatches).where(eq(championshipMatches.championshipId, req.params.id));
    // Standings.
    //
    // A completed match records winnerTeamId = null when the two teams finished
    // level (endTeamBattle and POST /:id/end both do this), so "completed and
    // nobody won it" IS the draw signal. Previously losses were derived as
    // `played - wins`, which counted every draw as a loss for both teams.
    //
    // Points rule is unchanged: 2 per win. The SOW does not define a points
    // value for a draw, so none is invented here — a draw scores 0 and is
    // simply no longer misreported as a loss. `draws` is added as a new field;
    // played/wins/losses/points keep their existing names and meanings, so all
    // current consumers (Championship.tsx, ChampionshipManagementPanel) stay
    // valid without changes.
    const standings = teams.map(team => {
      const completed = matches.filter(m => m.status === "completed" && (m.teamAId === team.id || m.teamBId === team.id));
      const wins = completed.filter(m => m.winnerTeamId === team.id).length;
      const draws = completed.filter(m => !m.winnerTeamId).length;
      return { ...team, played: completed.length, wins, draws, losses: completed.length - wins - draws, points: wins * 2 };
    }).sort((a, b) => b.points - a.points);

    // Champion: "the team with the highest points is the Championship winner".
    // standings is already sorted by points descending, so standings[0] is that
    // team. No tie-break is applied — none is defined — so an equal-points tie
    // still resolves to whichever team sorts first, exactly as before.
    //
    // The completion condition is UNCHANGED from the original implementation:
    // the championship is finished when an admin marks it "completed" OR when
    // every match has been played. Requiring all matches to be completed before
    // a champion can exist is NOT a documented requirement, so it is not
    // imposed here.
    //
    // The ONLY fix is the `hasMatches` guard: `[].every(...)` returns true, so a
    // championship with no matches at all previously satisfied the completion
    // condition and crowned standings[0] — a team with 0 played, 0 wins,
    // 0 points. A championship with zero matches can never have a winner.
    const hasMatches = matches.length > 0;
    const championshipFinished =
      championship.status === "completed" || matches.every(m => m.status === "completed");
    // This endpoint is public (it backs /championships/:id), so matches are
    // returned without the internal Team Battle session key. See toPublicMatch.
    res.json({ championship, teams, matches: matches.map(toPublicMatch), standings,
      champion: hasMatches && championshipFinished ? standings[0] ?? null : null });
  });

  /**
   * Championship teams are created by an administrator only.
   *
   * The route previously accepted any authenticated user and silently forced
   * captainId to the requester, so a player could create a championship team
   * for themselves by calling it directly. Team composition decides who plays
   * the fixtures an admin schedules, so it belongs with the rest of the
   * admin-gated championship routes here (create/edit/delete championship,
   * PATCH/DELETE team, all match management).
   *
   * This is the SAME ensureAdmin used by those routes - 403 with the project's
   * standard message - so there is no new authorization path. Admin behaviour is
   * byte-for-byte what it was: the previous `isAdmin ? requested : ...` branch
   * already used the body verbatim for an admin, and the admin panel has always
   * sent an explicit captainId.
   *
   * NOTE: this is the Championship team endpoint. Ordinary ad-hoc Team Battle
   * teams are created by POST /api/teams in server/routes.ts, which is gated by
   * ensureAuthenticated and is deliberately left untouched.
   */
  app.post("/api/championship-teams", ensureAdmin, async (req, res) => {
    try {
      const data = teamInput.parse(req.body);
      const members = [...new Set([data.captainId, ...data.memberIds])];
      await assertUsersExist(members);
      const conflicting = await db.select().from(championshipTeams)
        .where(eq(championshipTeams.championshipId, data.championshipId));
      if (conflicting.some(t => (t.memberIds ?? []).some(id => members.includes(id))))
        throw new Error("A user can only belong to one team per championship");
      const [row] = await db.insert(championshipTeams).values({ id: uuid(), ...data, memberIds: members }).returning();
      res.status(201).json(row);
    } catch (e) { fail(res, e); }
  });
  /**
   * Roster assignment is an administrator action, exactly like team creation
   * above. The route used to accept the team's own captain as well; that branch
   * is gone because ensureAdmin now rejects every non-admin before the handler
   * runs, captain included.
   *
   * Only the authorization changed. The request body, the 404/409 checks (unknown
   * user, roster locked during a live match, one team per championship) and the
   * updated-team response are untouched.
   */
  app.post("/api/championship-teams/:id/members", ensureAdmin, async (req, res) => {
    try {
      const input = z.object({ userId: z.coerce.number().int().positive() }).parse(req.body);
      const [team] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, req.params.id));
      if (!team) return res.status(404).json({ message: "Team not found" });
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
      if (!user) return res.status(404).json({ message: "User not found" });
      const live = await db.select().from(championshipMatches).where(and(eq(championshipMatches.championshipId, team.championshipId), eq(championshipMatches.status, "live")));
      if (live.some(match => match.teamAId === team.id || match.teamBId === team.id)) return res.status(409).json({ message: "Team membership is locked during a live match" });
      const siblings = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, team.championshipId));
      if (siblings.some(item => item.id !== team.id && (item.memberIds ?? []).includes(user.id))) return res.status(409).json({ message: "This user already belongs to another team in the championship" });
      const memberIds = [...new Set([...(team.memberIds ?? []), user.id])];
      const [updated] = await db.update(championshipTeams).set({ memberIds, updatedAt: new Date() }).where(eq(championshipTeams.id, team.id)).returning();
      res.json(updated);
    } catch (error) { fail(res, error); }
  });
  app.get("/api/championship-teams/:id", async (req, res) => {
    const [team] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, req.params.id));
    if (!team) return res.status(404).json({ message: "Team not found" });
    const memberIds = team.memberIds ?? [];
    const foundMembers = memberIds.length
      ? await db.select({ id: users.id, username: users.username, fullName: users.fullName, profileImage: users.profileImage })
          .from(users).where(inArray(users.id, memberIds))
      : [];
    const members = memberIds.map(id => foundMembers.find(member => member.id === id) ?? {
      id, username: `User ${id}`, fullName: null, profileImage: null,
    });
    const matches = await db.select().from(championshipMatches).where(eq(championshipMatches.championshipId, team.championshipId));
    res.json({ team, members, matches: matches.filter(match => match.teamAId === team.id || match.teamBId === team.id) });
  });
  app.patch("/api/championship-teams/:id", ensureAdmin, async (req, res) => {
    try {
      const data = teamInput.omit({ championshipId: true }).partial().parse(req.body);
      const [team] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, req.params.id));
      if (!team) return res.status(404).json({ message: "Team not found" });
      const live = await db.select().from(championshipMatches).where(and(
        eq(championshipMatches.championshipId, team.championshipId), eq(championshipMatches.status, "live")));
      if (live.some(m => m.teamAId === team.id || m.teamBId === team.id)) throw new Error("Team is locked during a live match");
      const captainId = data.captainId ?? team.captainId;
      // Recompute membership whenever the captain OR the member list changes.
      //
      // Previously this ran only when memberIds was supplied, which left two
      // holes on a captain-only edit:
      //   1. The new captain was never added to member_ids. Every membership
      //      check reads member_ids - GET /api/championships/me/dashboard finds
      //      the user's team with memberIds.includes(), and
      //      POST /api/championship-matches/:id/join refuses anyone not in it -
      //      so a captain outside member_ids could not see or join their own
      //      team's match. POST already guarantees captain is a member; PATCH
      //      now matches it.
      //   2. The "one team per championship" rule was not checked, so the new
      //      captain could already be a member of a sibling team.
      const memberIds = data.memberIds !== undefined || data.captainId !== undefined
        ? [...new Set([captainId, ...(data.memberIds ?? team.memberIds ?? [])])]
        : undefined;
      if (memberIds) {
        await assertUsersExist(memberIds);
        const siblingTeams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, team.championshipId));
        if (siblingTeams.some(item => item.id !== team.id && (item.memberIds ?? []).some(id => memberIds.includes(id)))) throw new Error("A selected user already belongs to another team in this championship");
      }
      const [row] = await db.update(championshipTeams).set({ ...data, memberIds, updatedAt: new Date() })
        .where(eq(championshipTeams.id, team.id)).returning();
      res.json(row);
    } catch (e) { fail(res, e); }
  });
  app.delete("/api/championship-teams/:id", ensureAdmin, async (req, res) => {
    // A team referenced by ANY match cannot be deleted.
    //
    // The previous guard only looked at completed matches, so deleting a team
    // that was still scheduled in an upcoming or live match fell through to the
    // DELETE. The database foreign keys (championship_matches_team_a_id_fkey /
    // _team_b_id_fkey, both NO ACTION) correctly refused it, so no history was
    // ever lost - but the route had no try/catch, so the driver error escaped to
    // the generic Express handler and the admin got an opaque 500 instead of a
    // usable message. Match rows are historical data and are never cascaded
    // away; the fix is to detect the reference first and explain it.
    try {
      const [team] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, req.params.id));
      if (!team) return res.status(404).json({ message: "Team not found" });
      const referencing = await db.select().from(championshipMatches).where(or(
        eq(championshipMatches.teamAId, team.id),
        eq(championshipMatches.teamBId, team.id),
      ));
      if (referencing.length) {
        const completed = referencing.some(match => match.status === "completed");
        return res.status(409).json({
          message: completed
            ? "A team in a completed match cannot be deleted"
            : "Delete or reassign this team's scheduled matches before deleting the team",
        });
      }
      await db.delete(championshipTeams).where(eq(championshipTeams.id, team.id));
      res.status(204).end();
    } catch (error) { fail(res, error); }
  });

  app.post("/api/championship-matches", ensureAdmin, async (req, res) => {
    try {
      const data = matchInput.parse(req.body);
      if (data.teamAId === data.teamBId) throw new Error("A team cannot play itself");
      const selected = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, data.championshipId));
      if (!selected.some(t => t.id === data.teamAId) || !selected.some(t => t.id === data.teamBId))
        throw new Error("Both teams must belong to the championship");
      const [row] = await db.insert(championshipMatches).values({ id: uuid(), ...data }).returning();
      res.status(201).json(row);
    } catch (e) { fail(res, e); }
  });
  app.patch("/api/championship-matches/:id", ensureAdmin, async (req, res) => {
    try {
      const data = matchInput.omit({ championshipId: true }).partial().extend({
        teamAScore: z.coerce.number().int().min(0).optional(), teamBScore: z.coerce.number().int().min(0).optional(),
        winnerTeamId: z.string().nullish(),
      }).parse(req.body);
      const [existing] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
      if (!existing) return res.status(404).json({ message: "Match not found" });
      if (existing.status === "completed") throw new Error("Completed matches cannot be edited");
      const teamAId = data.teamAId ?? existing.teamAId;
      const teamBId = data.teamBId ?? existing.teamBId;
      // Team A/B are snapshotted into the team_battles row the moment a match
      // starts, so swapping them on a live match desyncs the fixture from the
      // game actually being played (and from the rosters the engine already
      // loaded). Editing an upcoming match stays supported - the admin panel
      // exposes team selectors only for upcoming matches.
      const changingTeams =
        (data.teamAId !== undefined && data.teamAId !== existing.teamAId) ||
        (data.teamBId !== undefined && data.teamBId !== existing.teamBId);
      if (changingTeams && existing.status !== "upcoming") {
        return res.status(409).json({ message: "Teams cannot be changed once the match is live" });
      }
      if (teamAId === teamBId) throw new Error("A team cannot play itself");
      const validTeams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, existing.championshipId));
      if (!validTeams.some(team => team.id === teamAId) || !validTeams.some(team => team.id === teamBId)) throw new Error("Both teams must belong to this championship");
      // A recorded winner must be one of the two teams playing, or null for a
      // draw. The winner_team_id foreign key only requires *some*
      // championship_teams row, so without this check an unrelated team - even
      // one from another championship - could be stored as the winner. Standings
      // count wins with `winnerTeamId === team.id`, so such a value would
      // silently score as a draw for both sides instead of erroring.
      if (data.winnerTeamId != null && data.winnerTeamId !== teamAId && data.winnerTeamId !== teamBId) {
        throw new Error("The winner must be one of the two teams in this match");
      }
      const [row] = await db.update(championshipMatches).set({ ...data, updatedAt: new Date() })
        .where(eq(championshipMatches.id, existing.id)).returning();
      broadcastChampionshipEvent({ type: "match_updated", match: row });
      res.json(row);
    } catch (e) { fail(res, e); }
  });
  app.post("/api/championship-matches/:id/start", ensureAdmin, async (req, res) => {
    // Previously this route had no try/catch, so any driver error (see the
    // duplicate-key case below) surfaced as an opaque 500.
    try {
      const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
      if (!match) return res.status(404).json({ message: "Match not found" });
      const [championship] = await db.select().from(championships).where(eq(championships.id, match.championshipId));
      if (championship?.status !== "active") return res.status(409).json({ message: "Only active championships can play matches" });
      const otherLive = await db.select().from(championshipMatches).where(and(
        eq(championshipMatches.championshipId, match.championshipId), eq(championshipMatches.status, "live"), ne(championshipMatches.id, match.id)));
      if (otherLive.length) return res.status(409).json({ message: "Another match is already live in this championship" });
      const [teamA] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, match.teamAId));
      const [teamB] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, match.teamBId));
      if (!teamA || !teamB) return res.status(409).json({ message: "Both championship teams are required" });
      // Defence in depth. Match create/edit already guarantee both of these,
      // and the database enforces team_a_id <> team_b_id, but the rosters are
      // about to be copied into a Team Battle so they are re-checked at the
      // last moment before that snapshot is taken.
      if (teamA.championshipId !== match.championshipId || teamB.championshipId !== match.championshipId) {
        return res.status(409).json({ message: "Both teams must belong to this championship" });
      }
      if (teamA.id === teamB.id) return res.status(409).json({ message: "A team cannot play itself" });

      // ONE match : ONE Team Battle, keyed by a deterministic battle id.
      //
      // The battle used to be located by querying team_battles for the session
      // id, where the session id was `match.gameSessionId ?? uuid()`. That left
      // a reachable failure loop: if a previous attempt created the battle but
      // the guarded UPDATE below did not match a row (so gameSessionId was
      // never persisted on the match), a retry minted a NEW uuid, found no
      // battle under it, and tried to INSERT a second row with the same
      // `championship-{matchId}` primary key - a duplicate-key error that
      // escaped as a 500 and left the match permanently unstartable.
      //
      // Looking the battle up by its deterministic id instead makes this route
      // idempotent: a retry reuses the existing battle and its session id.
      const battleId = `championship-${match.id}`;
      const existingBattle = await database.getTeamBattle(battleId);
      const gameSessionId = existingBattle?.gameSessionId || match.gameSessionId || uuid();
      // Ordering is deliberate: create the battle FIRST, then flip the match to
      // live. If the UPDATE does not match (concurrent start, or the match is
      // no longer upcoming) we are left with an unused forming battle, which a
      // retry reuses. The reverse order would risk a live match with no battle
      // behind it, which nothing can recover from because /start then refuses
      // the match for no longer being upcoming.
      if (!existingBattle) {
        await database.createTeamBattle({
          id: battleId, gameSessionId, gameType: "question", category: "All Categories", difficulty: "Mixed", status: "forming",
          teamACaptainId: teamA.captainId, teamAName: teamA.name, teamATeammates: (teamA.memberIds ?? []).filter(id => id !== teamA.captainId),
          teamBCaptainId: teamB.captainId, teamBName: teamB.name, teamBTeammates: (teamB.memberIds ?? []).filter(id => id !== teamB.captainId),
          teamAScore: 0, teamBScore: 0, teamACorrectAnswers: 0, teamBCorrectAnswers: 0, teamAIncorrectAnswers: 0, teamBIncorrectAnswers: 0,
        });
      }
      const [row] = await db.update(championshipMatches).set({
        status: "live", startedAt: new Date(), gameSessionId, updatedAt: new Date(),
      }).where(and(eq(championshipMatches.id, match.id), eq(championshipMatches.status, "upcoming"))).returning();
      if (!row) return res.status(409).json({ message: "Only upcoming matches can be started" });
      broadcastChampionshipEvent({ type: "match_started", match: row });
      res.json(row);
    } catch (error) { fail(res, error); }
  });
  app.post("/api/championship-matches/:id/join", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) return res.status(401).json({ message: "Authentication required" });
    const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
    if (!match || match.status !== "live" || !match.gameSessionId) return res.status(409).json({ message: "This match is not currently live" });
    const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, match.championshipId));
    const team = teams.find(item => (item.id === match.teamAId || item.id === match.teamBId) && (item.memberIds ?? []).includes(req.user!.id));
    if (!team) return res.status(403).json({ message: "You are not a member of either participating team" });
    res.json({ matchId: match.id, gameSessionId: match.gameSessionId, teamId: team.id, isCaptain: team.captainId === req.user.id });
  });
  app.post("/api/championship-matches/:id/end", ensureAdmin, async (req, res) => {
    // Previously this route had no try/catch, so a malformed body made
    // .parse() throw a ZodError straight past the handler and the admin got a
    // generic 500 instead of the validation message.
    try {
      const scores = z.object({ teamAScore: z.coerce.number().int().min(0), teamBScore: z.coerce.number().int().min(0), winnerTeamId: z.string().nullish() }).parse(req.body);
      const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
      if (!match || match.status !== "live") return res.status(409).json({ message: "Only a live match can be ended" });
      // Same rule as PATCH: an explicit winner must be one of the two teams
      // playing. Omitting it (or sending null) keeps the existing behaviour -
      // the winner is derived from the scores, and equal scores stay a draw
      // (winnerTeamId = null), which is a valid result and not an error.
      //
      // NOTE: an explicit winner that contradicts the scores is still accepted.
      // The admin panel deliberately offers a winner override next to the score
      // fields, so that is treated as an intentional administrative decision
      // rather than a bug. See the report for this product decision.
      if (scores.winnerTeamId != null && scores.winnerTeamId !== match.teamAId && scores.winnerTeamId !== match.teamBId) {
        throw new Error("The winner must be one of the two teams in this match");
      }
      const winnerTeamId = scores.winnerTeamId ?? (scores.teamAScore === scores.teamBScore ? null :
        scores.teamAScore > scores.teamBScore ? match.teamAId : match.teamBId);
      const [row] = await db.update(championshipMatches).set({
        ...scores, winnerTeamId, status: "completed", completedAt: new Date(), updatedAt: new Date(),
      }).where(eq(championshipMatches.id, match.id)).returning();
      broadcastChampionshipEvent({ type: "match_ended", match: row });
      res.json(row);
    } catch (error) { fail(res, error); }
  });
  app.post("/api/championship-matches/:id/question", ensureAdmin, async (req, res) => {
    try {
      const event = z.object({
        questionId: z.string().min(1),
        questionNumber: z.coerce.number().int().positive().optional(),
        phase: z.enum(["started", "ended"]),
      }).parse(req.body);
      const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
      if (!match || match.status !== "live") return res.status(409).json({ message: "Question events require a live match" });
      broadcastChampionshipEvent({
        type: event.phase === "started" ? "question_started" : "question_ended",
        matchId: match.id, ...event,
      });
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  });
  // Public spectator endpoint - no authentication, by design.
  app.get("/api/championship-matches/:id", async (req, res) => {
    const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
    if (!match) return res.status(404).json({ message: "Match not found" });
    const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, match.championshipId));
    res.json({ match: toPublicMatch(match), teamA: teams.find(t => t.id === match.teamAId), teamB: teams.find(t => t.id === match.teamBId) });
  });
}
