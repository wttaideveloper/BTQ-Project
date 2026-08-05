import type { Express, RequestHandler } from "express";
import { and, eq, inArray, ne } from "drizzle-orm";
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
    res.json({ championship, team, teams, matches: team ? matches.filter(match => match.teamAId === team.id || match.teamBId === team.id) : matches });
  });
  app.post("/api/championships", ensureAdmin, async (req, res) => {
    try {
      const data = championshipInput.parse(req.body);
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
    const standings = teams.map(team => {
      const completed = matches.filter(m => m.status === "completed" && (m.teamAId === team.id || m.teamBId === team.id));
      const wins = completed.filter(m => m.winnerTeamId === team.id).length;
      return { ...team, played: completed.length, wins, losses: completed.length - wins, points: wins * 2 };
    }).sort((a, b) => b.points - a.points);
    res.json({ championship, teams, matches, standings,
      champion: (championship.status === "completed" || matches.every(m => m.status === "completed")) ? standings[0] ?? null : null });
  });

  app.post("/api/championship-teams", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.id) return res.status(401).json({ message: "Authentication required" });
      const requested = teamInput.parse(req.body);
      const data = req.user.isAdmin ? requested : { ...requested, captainId: req.user.id };
      const members = [...new Set([data.captainId, ...data.memberIds])];
      const conflicting = await db.select().from(championshipTeams)
        .where(eq(championshipTeams.championshipId, data.championshipId));
      if (conflicting.some(t => (t.memberIds ?? []).some(id => members.includes(id))))
        throw new Error("A user can only belong to one team per championship");
      const [row] = await db.insert(championshipTeams).values({ id: uuid(), ...data, memberIds: members }).returning();
      res.status(201).json(row);
    } catch (e) { fail(res, e); }
  });
  app.post("/api/championship-teams/:id/members", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user?.id) return res.status(401).json({ message: "Authentication required" });
      const input = z.object({ userId: z.coerce.number().int().positive() }).parse(req.body);
      const [team] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, req.params.id));
      if (!team) return res.status(404).json({ message: "Team not found" });
      if (!req.user.isAdmin && team.captainId !== req.user.id) return res.status(403).json({ message: "Only this team captain or an admin can add members" });
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
      const memberIds = data.memberIds ? [...new Set([captainId, ...data.memberIds])] : undefined;
      if (memberIds) {
        const siblingTeams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, team.championshipId));
        if (siblingTeams.some(item => item.id !== team.id && (item.memberIds ?? []).some(id => memberIds.includes(id)))) throw new Error("A selected user already belongs to another team in this championship");
      }
      const [row] = await db.update(championshipTeams).set({ ...data, memberIds, updatedAt: new Date() })
        .where(eq(championshipTeams.id, team.id)).returning();
      res.json(row);
    } catch (e) { fail(res, e); }
  });
  app.delete("/api/championship-teams/:id", ensureAdmin, async (req, res) => {
    const completed = await db.select().from(championshipMatches).where(eq(championshipMatches.status, "completed"));
    if (completed.some(m => m.teamAId === req.params.id || m.teamBId === req.params.id))
      return res.status(409).json({ message: "A team in a completed match cannot be deleted" });
    await db.delete(championshipTeams).where(eq(championshipTeams.id, req.params.id));
    res.status(204).end();
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
      if (teamAId === teamBId) throw new Error("A team cannot play itself");
      const validTeams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, existing.championshipId));
      if (!validTeams.some(team => team.id === teamAId) || !validTeams.some(team => team.id === teamBId)) throw new Error("Both teams must belong to this championship");
      const [row] = await db.update(championshipMatches).set({ ...data, updatedAt: new Date() })
        .where(eq(championshipMatches.id, existing.id)).returning();
      broadcastChampionshipEvent({ type: "match_updated", match: row });
      res.json(row);
    } catch (e) { fail(res, e); }
  });
  app.post("/api/championship-matches/:id/start", ensureAdmin, async (req, res) => {
    const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
    if (!match) return res.status(404).json({ message: "Match not found" });
    const [championship] = await db.select().from(championships).where(eq(championships.id, match.championshipId));
    if (championship?.status !== "active") return res.status(409).json({ message: "Only active championships can play matches" });
    const otherLive = await db.select().from(championshipMatches).where(and(
      eq(championshipMatches.championshipId, match.championshipId), eq(championshipMatches.status, "live"), ne(championshipMatches.id, match.id)));
    if (otherLive.length) return res.status(409).json({ message: "Another match is already live in this championship" });
    const gameSessionId = match.gameSessionId ?? uuid();
    const [teamA] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, match.teamAId));
    const [teamB] = await db.select().from(championshipTeams).where(eq(championshipTeams.id, match.teamBId));
    if (!teamA || !teamB) return res.status(409).json({ message: "Both championship teams are required" });
    const existingBattles = await database.getTeamBattlesByGameSession(gameSessionId);
    if (!existingBattles.length) {
      await database.createTeamBattle({
        id: `championship-${match.id}`, gameSessionId, gameType: "question", category: "All Categories", difficulty: "Mixed", status: "forming",
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
    const scores = z.object({ teamAScore: z.coerce.number().int().min(0), teamBScore: z.coerce.number().int().min(0), winnerTeamId: z.string().nullish() }).parse(req.body);
    const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
    if (!match || match.status !== "live") return res.status(409).json({ message: "Only a live match can be ended" });
    const winnerTeamId = scores.winnerTeamId ?? (scores.teamAScore === scores.teamBScore ? null :
      scores.teamAScore > scores.teamBScore ? match.teamAId : match.teamBId);
    const [row] = await db.update(championshipMatches).set({
      ...scores, winnerTeamId, status: "completed", completedAt: new Date(), updatedAt: new Date(),
    }).where(eq(championshipMatches.id, match.id)).returning();
    broadcastChampionshipEvent({ type: "match_ended", match: row });
    res.json(row);
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
  app.get("/api/championship-matches/:id", async (req, res) => {
    const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, req.params.id));
    if (!match) return res.status(404).json({ message: "Match not found" });
    const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, match.championshipId));
    res.json({ match, teamA: teams.find(t => t.id === match.teamAId), teamB: teams.find(t => t.id === match.teamBId) });
  });
}
