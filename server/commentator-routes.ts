import type { Express, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { championships, championshipMatches, championshipTeams } from "@shared/schema";
import { database } from "./database";
import { CommentatorAdvanceError } from "./commentator-advance";
import { advanceChampionshipQuestion } from "./socket";

const toPublicMatch = <T extends { gameSessionId?: string | null }>(match: T) => {
  const { gameSessionId: _internal, ...publicFields } = match;
  return publicFields;
};

export function registerCommentatorRoutes(app: Express, ensureCommentator: RequestHandler) {
  const db = database.db;

  const assignedChampionship = async (userId: number) => {
    const assigned = await db.select().from(championships).where(eq(championships.commentatorUserId, userId));
    return assigned.find(item => item.status === "active") ?? assigned[0] ?? null;
  };

  const assertAssignedMatch = async (userId: number, matchId: string) => {
    const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, matchId));
    if (!match) {
      const error = new CommentatorAdvanceError(404, "Match not found");
      throw error;
    }
    const [championship] = await db.select().from(championships).where(eq(championships.id, match.championshipId));
    if (!championship || championship.commentatorUserId !== userId) {
      throw new CommentatorAdvanceError(403, "You are not assigned to this championship");
    }
    return { match, championship };
  };

  app.get("/api/commentator/dashboard", ensureCommentator, async (req, res) => {
    const userId = req.user!.id;
    const championship = await assignedChampionship(userId);
    if (!championship) {
      return res.json({ championship: null, liveMatch: null, teamA: null, teamB: null });
    }
    const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, championship.id));
    const matches = await db.select().from(championshipMatches).where(eq(championshipMatches.championshipId, championship.id));
    const live = matches.find(item => item.status === "live") ?? null;
    const teamA = live ? teams.find(team => team.id === live.teamAId) ?? null : null;
    const teamB = live ? teams.find(team => team.id === live.teamBId) ?? null : null;
    res.json({
      championship,
      liveMatch: live ? toPublicMatch(live) : null,
      teamA,
      teamB,
      teams,
    });
  });

  app.get("/api/commentator/matches/:id", ensureCommentator, async (req, res) => {
    try {
      const { match, championship } = await assertAssignedMatch(req.user!.id, req.params.id);
      const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, match.championshipId));
      res.json({
        championship: { id: championship.id, name: championship.name, status: championship.status },
        match: toPublicMatch(match),
        teamA: teams.find(team => team.id === match.teamAId) ?? null,
        teamB: teams.find(team => team.id === match.teamBId) ?? null,
      });
    } catch (error) {
      if (error instanceof CommentatorAdvanceError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("[Commentator] Failed to load match:", error);
      res.status(500).json({ message: "Failed to load match" });
    }
  });

  app.post("/api/commentator/matches/:id/next-question", ensureCommentator, async (req, res) => {
    try {
      await assertAssignedMatch(req.user!.id, req.params.id);
      const result = await advanceChampionshipQuestion(req.params.id);
      res.json(result);
    } catch (error) {
      if (error instanceof CommentatorAdvanceError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("[Commentator] NEXT QUESTION failed:", error);
      res.status(500).json({ message: "Could not advance to the next question" });
    }
  });
}
