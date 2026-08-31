import type { Express, RequestHandler } from "express";
import { eq, inArray } from "drizzle-orm";
import { championships, championshipMatches, championshipTeams } from "@shared/schema";
import { database } from "./database";
import { CommentatorAdvanceError } from "./commentator-advance";
import { advanceChampionshipQuestion } from "./socket";
import {
  ACTIVE_CHAMPIONSHIP_STATUS,
  groupCommentatorDeskMatches,
  isActiveChampionshipStatus,
  toPublicCommentatorChampionship,
  toPublicCommentatorTeam,
} from "./commentator-access";

const toPublicMatch = <T extends { gameSessionId?: string | null }>(match: T) => {
  const { gameSessionId: _internal, ...publicFields } = match;
  return publicFields;
};

export function registerCommentatorRoutes(app: Express, ensureCommentator: RequestHandler) {
  const db = database.db;

  const assertChampionshipMatch = async (matchId: string) => {
    const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, matchId));
    if (!match) {
      throw new CommentatorAdvanceError(404, "Match not found");
    }
    const [championship] = await db.select().from(championships).where(eq(championships.id, match.championshipId));
    if (!championship) {
      throw new CommentatorAdvanceError(404, "Championship not found");
    }
    if (!isActiveChampionshipStatus(championship.status)) {
      throw new CommentatorAdvanceError(403, "This championship is not active.");
    }
    return { match, championship };
  };

  app.get("/api/commentator/dashboard", ensureCommentator, async (_req, res) => {
    const rows = await db
      .select({
        match: championshipMatches,
        championship: championships,
      })
      .from(championshipMatches)
      .innerJoin(championships, eq(championshipMatches.championshipId, championships.id))
      .where(eq(championships.status, ACTIVE_CHAMPIONSHIP_STATUS));

    const championshipById = new Map(rows.map(row => [row.championship.id, row.championship]));
    const championshipIds = [...championshipById.keys()];
    const teams = championshipIds.length
      ? await db.select().from(championshipTeams).where(inArray(championshipTeams.championshipId, championshipIds))
      : [];
    const teamById = new Map(teams.map(item => [item.id, item]));
    const grouped = groupCommentatorDeskMatches(rows.map(row => row.match));

    const toDeskItem = (match: (typeof rows)[number]["match"]) => {
      const championship = championshipById.get(match.championshipId);
      if (!championship) return null;
      return {
        championship: toPublicCommentatorChampionship(championship),
        match: toPublicMatch(match),
        teamA: toPublicCommentatorTeam(teamById.get(match.teamAId)),
        teamB: toPublicCommentatorTeam(teamById.get(match.teamBId)),
      };
    };

    res.json({
      liveMatches: grouped.live.map(toDeskItem).filter(Boolean),
      upcomingMatches: grouped.upcoming.map(toDeskItem).filter(Boolean),
      recentMatches: grouped.recent.map(toDeskItem).filter(Boolean),
    });
  });

  app.get("/api/commentator/matches/:id", ensureCommentator, async (req, res) => {
    try {
      const { match, championship } = await assertChampionshipMatch(req.params.id);
      const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, match.championshipId));
      res.json({
        championship: toPublicCommentatorChampionship(championship),
        match: toPublicMatch(match),
        teamA: toPublicCommentatorTeam(teams.find(team => team.id === match.teamAId) ?? null),
        teamB: toPublicCommentatorTeam(teams.find(team => team.id === match.teamBId) ?? null),
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
      await assertChampionshipMatch(req.params.id);
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
