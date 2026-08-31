import type { Express, Request, RequestHandler } from "express";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { database } from "./database";
import { completeExpiredChampionships, hasChampionshipEndDatePassed } from "./championship-lifecycle";
import {
  championships, championshipMatches, championshipTeams, users,
} from "@shared/schema";
import { broadcastChampionshipEvent } from "./socket";
import {
  buildRoundRobinSchedule,
  localDateString,
  localDateTimeString,
  possibleMatchCount,
} from "./championship-schedule";
import { ChampionshipMatchStartError, startChampionshipMatch } from "./championship-match-start";
import { isChampionshipAutoStartEnabled, notifyChampionshipScheduleChanged } from "./championship-autostart";
import { rescheduleMatchError } from "./championship-match-reschedule";
import { deleteManagedTeamLogo, hasAllowedImageSignature, teamLogoUpload } from "./team-logo-upload";

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
const managedTeamLogoUrl = z.string()
  .regex(/^\/uploads\/team-logos\/[a-z0-9][a-z0-9._-]*\.(jpg|png|webp|avif)$/i, "Invalid managed team logo URL");
const teamInput = z.object({
  championshipId: z.string().min(1), name: z.string().trim().min(1).max(80),
  captainId: z.coerce.number().int().positive(),
  memberIds: z.array(z.coerce.number().int().positive()).default([]),
  emoticon: z.string().min(1).max(300).default("👏"),
  // URLs are server-owned: handlers only add a string after saving a verified
  // upload. Clients may request removal with null or omit this field.
  logoUrl: managedTeamLogoUrl.nullable().optional(),
});
const matchInput = z.object({
  championshipId: z.string().min(1), teamAId: z.string().min(1), teamBId: z.string().min(1),
  scheduledAt: z.coerce.date().nullish(), streamUrl: z.string().url().nullish(),
});
const autoScheduleInput = z.object({
  startAt: z.coerce.date(),
  breakMinutes: z.coerce.number().int().min(0).max(1440),
  matchesPerDay: z.coerce.number().int().min(1).max(48),
});
const COMPLETED_CHAMPIONSHIP_MESSAGE = "Auto Schedule is not available for a completed championship.";
const normalizeChampionshipName = (value: string) => value.trim().toLowerCase();

export function registerChampionshipRoutes(app: Express, ensureAdmin: RequestHandler) {
  const db = database.db;
  type TeamLogoRequest = Request & { file?: Express.Multer.File };
  const readTeamInput = (body: Record<string, unknown>) => {
    const input = { ...body } as Record<string, unknown>;
    if (typeof input.memberIds === "string") {
      try { input.memberIds = JSON.parse(input.memberIds); } catch { throw new Error("memberIds must be valid JSON"); }
    }
    if (input.logoUrl !== undefined && input.logoUrl !== null) {
      throw new Error("logoUrl is server-managed; upload a logo file instead");
    }
    return input;
  };
  const uploadedLogoUrl = (req: TeamLogoRequest) => {
    if (!req.file) return undefined;
    if (!hasAllowedImageSignature(req.file.path, req.file.mimetype)) {
      deleteManagedTeamLogo(`/uploads/team-logos/${req.file.filename}`);
      throw new Error("The uploaded team logo does not match its declared image type");
    }
    return `/uploads/team-logos/${req.file.filename}`;
  };
  const uploadTeamLogo: RequestHandler = (req, res, next) => {
    teamLogoUpload.single("logo")(req, res, error => {
      if (!error) return next();
      return res.status(400).json({ message: error.message || "Invalid team logo upload" });
    });
  };
  const fail = (res: any, error: unknown) => {
    // Do not pass framework/database objects to console.error: Node's inspector
    // can itself throw while traversing unusual error shapes.
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[Championship] ${message}`);
    if (stack) console.error(`[Championship stack]\n${stack}`);
    return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
  };

  const assertTeamsPlayable = (teamAId: string, teamBId: string, roster: { id: string }[]) => {
    if (teamAId === teamBId) throw new Error("A team cannot play itself");
    if (!roster.some(team => team.id === teamAId) || !roster.some(team => team.id === teamBId)) {
      throw new Error("Both teams must belong to the championship");
    }
  };

  const loadChampionshipScheduleContext = async (championshipId: string, client: typeof db | { select: typeof db.select } = db) => {
    const [championship] = await client.select().from(championships).where(eq(championships.id, championshipId));
    if (!championship) return null;
    const teams = await client.select().from(championshipTeams).where(eq(championshipTeams.championshipId, championshipId));
    const matches = await client.select().from(championshipMatches).where(eq(championshipMatches.championshipId, championshipId));
    return { championship, teams, matches };
  };

  const planAutoSchedule = (
    ctx: NonNullable<Awaited<ReturnType<typeof loadChampionshipScheduleContext>>>,
    settings: z.infer<typeof autoScheduleInput>,
  ) => {
    if (ctx.championship.status === "completed") {
      return {
        summary: {
          teamCount: ctx.teams.length,
          possibleMatches: possibleMatchCount(ctx.teams.length),
          newMatches: 0,
          skippedMatches: 0,
        },
        matches: [],
        skipped: [],
        errors: [COMPLETED_CHAMPIONSHIP_MESSAGE],
      };
    }
    return buildRoundRobinSchedule(
      ctx.teams.map(team => ({ id: team.id, name: team.name, createdAt: team.createdAt })),
      ctx.matches.map(match => ({ teamAId: match.teamAId, teamBId: match.teamBId })),
      {
        startAt: settings.startAt,
        breakMinutes: settings.breakMinutes,
        matchesPerDay: settings.matchesPerDay,
        endDate: ctx.championship.endDate,
      },
    );
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

  const toPublicChampionship = <T extends { commentatorUserId?: number | null }>(championship: T, includeAssignment: boolean) => {
    if (includeAssignment) return championship;
    const { commentatorUserId: _hidden, ...publicFields } = championship;
    return publicFields;
  };

  const isAdminRequest = (req: { isAuthenticated?: () => boolean; user?: { isAdmin?: boolean | null } }) =>
    !!req.isAuthenticated?.() && !!req.user?.isAdmin;

  const assertUsersExist = async (ids: number[]) => {
    if (!ids.length) return;
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
    const missing = ids.filter(id => !found.some(user => user.id === id));
    if (missing.length) {
      throw new Error(`Unknown user id(s): ${missing.join(", ")}`);
    }
  };

  app.get("/api/championships", async (req, res) => {
    await completeExpiredChampionships();
    const rows = await db.select().from(championships);
    res.json(rows.map(row => toPublicChampionship(row, isAdminRequest(req))));
  });
  app.get("/api/championships/me/dashboard", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) return res.status(401).json({ message: "Authentication required" });
    await completeExpiredChampionships();
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
    res.json({ championship: toPublicChampionship(championship, false), team, teams, matches: visible.map(toPublicMatch) });
  });
  app.get("/api/championships/features", ensureAdmin, (_req, res) => {
    res.json({ autoStartEnabled: isChampionshipAutoStartEnabled() });
  });
  app.post("/api/championships", ensureAdmin, async (req, res) => {
    try {
      const data = championshipInput.parse(req.body);
      if (data.startDate && localDateString(data.startDate) < localDateString(new Date())) {
        return res.status(400).json({ message: "Start date cannot be in the past" });
      }
      const normalizedName = normalizeChampionshipName(data.name);
      const existing = await db.select({ id: championships.id, name: championships.name }).from(championships);
      if (existing.some(championship => normalizeChampionshipName(championship.name) === normalizedName)) {
        return res.status(409).json({ message: "A championship with this name already exists." });
      }
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
      await completeExpiredChampionships();
      if (data.name !== undefined) {
        const normalizedName = normalizeChampionshipName(data.name);
        const existing = await db.select({ id: championships.id, name: championships.name }).from(championships);
        if (existing.some(championship => championship.id !== req.params.id && normalizeChampionshipName(championship.name) === normalizedName)) {
          return res.status(409).json({ message: "A championship with this name already exists." });
        }
      }
      if (data.status === "active") {
        const [existing] = await db.select({ endDate: championships.endDate }).from(championships)
          .where(eq(championships.id, req.params.id));
        const effectiveEndDate = data.endDate === undefined ? existing?.endDate : data.endDate;
        if (hasChampionshipEndDatePassed(effectiveEndDate)) {
          return res.status(400).json({ message: "An ended championship cannot be activated." });
        }
        await db.update(championships).set({ status: "draft", updatedAt: new Date() })
          .where(and(eq(championships.status, "active"), ne(championships.id, req.params.id)));
      }
      const [row] = await db.update(championships).set({ ...data, updatedAt: new Date() })
        .where(eq(championships.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ message: "Championship not found" });
      notifyChampionshipScheduleChanged();
      res.json(row);
    } catch (e) { fail(res, e); }
  });
  app.put("/api/championships/:id/commentator", ensureAdmin, async (req, res) => {
    try {
      const body = z.object({
        commentatorUserId: z.number().int().positive().nullable(),
      }).parse(req.body);
      const [championship] = await db.select().from(championships).where(eq(championships.id, req.params.id));
      if (!championship) return res.status(404).json({ message: "Championship not found" });

      if (body.commentatorUserId == null) {
        const [row] = await db.update(championships).set({
          commentatorUserId: null,
          updatedAt: new Date(),
        }).where(eq(championships.id, championship.id)).returning();
        return res.json(row);
      }

      const [commentator] = await db.select().from(users).where(eq(users.id, body.commentatorUserId));
      if (!commentator) return res.status(404).json({ message: "User not found" });
      if (commentator.isAdmin) {
        return res.status(400).json({ message: "An admin account cannot be assigned as commentator" });
      }

      await db.update(users).set({ isCommentator: true }).where(eq(users.id, commentator.id));
      const [row] = await db.update(championships).set({
        commentatorUserId: commentator.id,
        updatedAt: new Date(),
      }).where(eq(championships.id, championship.id)).returning();
      res.json(row);
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
      notifyChampionshipScheduleChanged();
      res.status(204).end();
    } catch (error) { fail(res, error); }
  });

  app.get("/api/championships/:id", async (req, res) => {
    await completeExpiredChampionships();
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
    res.json({ championship: toPublicChampionship(championship, isAdminRequest(req)), teams, matches: matches.map(toPublicMatch), standings,
      champion: hasMatches && championshipFinished ? standings[0] ?? null : null });
  });

  app.post("/api/championships/:id/auto-schedule/preview", ensureAdmin, async (req, res) => {
    try {
      const settings = autoScheduleInput.parse(req.body);
      const ctx = await loadChampionshipScheduleContext(req.params.id);
      if (!ctx) return res.status(404).json({ message: "Championship not found" });
      res.json(planAutoSchedule(ctx, settings));
    } catch (error) { fail(res, error); }
  });

  app.post("/api/championships/:id/auto-schedule", ensureAdmin, async (req, res) => {
    try {
      const settings = autoScheduleInput.parse(req.body);
      const result = await db.transaction(async tx => {
        await tx.execute(sql`select id from championships where id = ${req.params.id} for update`);
        const ctx = await loadChampionshipScheduleContext(req.params.id, tx);
        if (!ctx) return { status: 404 as const, message: "Championship not found" };
        const plan = planAutoSchedule(ctx, settings);
        if (plan.errors.length) return { status: 400 as const, message: plan.errors[0], plan };
        if (!plan.matches.length) return { status: 200 as const, plan, created: [] };
        for (const match of plan.matches) assertTeamsPlayable(match.teamAId, match.teamBId, ctx.teams);
        const created = await tx.insert(championshipMatches).values(
          plan.matches.map(match => ({
            id: uuid(),
            championshipId: ctx.championship.id,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            scheduledAt: match.scheduledAt,
          })),
        ).returning();
        return { status: 201 as const, plan, created };
      });
      if (result.status === 404) return res.status(404).json({ message: result.message });
      if (result.status === 400) return res.status(400).json({ message: result.message, ...result.plan });
      notifyChampionshipScheduleChanged();
      res.status(result.status).json({ ...result.plan, created: result.created });
    } catch (error) { fail(res, error); }
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
  app.post("/api/championship-teams", ensureAdmin, uploadTeamLogo, async (req: TeamLogoRequest, res) => {
    try {
      const logoUrl = uploadedLogoUrl(req);
      const data = teamInput.parse({ ...readTeamInput(req.body), ...(logoUrl ? { logoUrl } : {}) });
      const members = [...new Set([data.captainId, ...data.memberIds])];
      await assertUsersExist(members);
      const conflicting = await db.select().from(championshipTeams)
        .where(eq(championshipTeams.championshipId, data.championshipId));
      if (conflicting.some(t => (t.memberIds ?? []).some(id => members.includes(id))))
        throw new Error("A user can only belong to one team per championship");
      const [row] = await db.insert(championshipTeams).values({ id: uuid(), ...data, memberIds: members }).returning();
      res.status(201).json(row);
    } catch (e) {
      if (req.file) deleteManagedTeamLogo(`/uploads/team-logos/${req.file.filename}`);
      fail(res, e);
    }
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
  app.patch("/api/championship-teams/:id", ensureAdmin, uploadTeamLogo, async (req: TeamLogoRequest, res) => {
    try {
      const logoUrl = uploadedLogoUrl(req);
      const data = teamInput.omit({ championshipId: true }).partial().parse({
        ...readTeamInput(req.body), ...(logoUrl ? { logoUrl } : {}),
      });
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
      if (logoUrl || data.logoUrl === null) deleteManagedTeamLogo(team.logoUrl);
      res.json(row);
    } catch (e) {
      if (req.file) deleteManagedTeamLogo(`/uploads/team-logos/${req.file.filename}`);
      fail(res, e);
    }
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
      if (data.scheduledAt && localDateTimeString(data.scheduledAt) < localDateTimeString(new Date())) {
        return res.status(400).json({ message: "Match date and time cannot be in the past" });
      }
      const selected = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, data.championshipId));
      assertTeamsPlayable(data.teamAId, data.teamBId, selected);
      const [row] = await db.insert(championshipMatches).values({ id: uuid(), ...data }).returning();
      notifyChampionshipScheduleChanged();
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
      if (data.scheduledAt !== undefined) {
        const scheduleError = rescheduleMatchError(
          existing.status,
          data.scheduledAt,
          existing.scheduledAt,
        );
        if (scheduleError) {
          return res.status(existing.status === "upcoming" ? 400 : 409).json({ message: scheduleError });
        }
      }
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
      notifyChampionshipScheduleChanged();
      res.json(row);
    } catch (e) { fail(res, e); }
  });
  app.post("/api/championship-matches/:id/start", ensureAdmin, async (req, res) => {
    // Operator override: scheduledAt is not required and may still be in the future.
    try {
      const row = await startChampionshipMatch(req.params.id);
      res.json(row);
    } catch (error) {
      if (error instanceof ChampionshipMatchStartError) {
        return res.status(error.status).json({ message: error.message });
      }
      fail(res, error);
    }
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
      notifyChampionshipScheduleChanged();
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
