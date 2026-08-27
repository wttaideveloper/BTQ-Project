import { and, eq, ne, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import {
  championshipMatches,
  championships,
  championshipTeams,
  teamBattles,
  type ChampionshipMatch,
} from "@shared/schema";
import { database } from "./database";
import { completeExpiredChampionships } from "./championship-lifecycle";
import { broadcastChampionshipEvent } from "./socket";
import { notifyChampionshipScheduleChanged } from "./championship-autostart";

export class ChampionshipMatchStartError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ChampionshipMatchStartError";
    this.status = status;
  }
}

/**
 * Start a championship match the same way the admin Start Match action does:
 * flip upcoming → live, create/reuse the forming Team Battle, and broadcast
 * match_started. Does not start toss, questions, or gameplay.
 *
 * Manual callers may start before scheduledAt. Auto-start is responsible for
 * only invoking this when a match is due.
 */
export async function startChampionshipMatch(matchId: string): Promise<ChampionshipMatch> {
  await completeExpiredChampionships();

  const row = await database.db.transaction(async tx => {
    const [initial] = await tx.select().from(championshipMatches).where(eq(championshipMatches.id, matchId));
    if (!initial) throw new ChampionshipMatchStartError(404, "Match not found");

    await tx.execute(sql`select id from championships where id = ${initial.championshipId} for update`);

    const [match] = await tx.select().from(championshipMatches).where(eq(championshipMatches.id, matchId));
    if (!match) throw new ChampionshipMatchStartError(404, "Match not found");

    const [championship] = await tx.select().from(championships).where(eq(championships.id, match.championshipId));
    if (championship?.status !== "active") {
      throw new ChampionshipMatchStartError(409, "Only active championships can play matches");
    }

    const otherLive = await tx.select({ id: championshipMatches.id }).from(championshipMatches).where(and(
      eq(championshipMatches.championshipId, match.championshipId),
      eq(championshipMatches.status, "live"),
      ne(championshipMatches.id, match.id),
    ));
    if (otherLive.length) {
      throw new ChampionshipMatchStartError(409, "Another match is already live in this championship");
    }

    const [teamA] = await tx.select().from(championshipTeams).where(eq(championshipTeams.id, match.teamAId));
    const [teamB] = await tx.select().from(championshipTeams).where(eq(championshipTeams.id, match.teamBId));
    if (!teamA || !teamB) {
      throw new ChampionshipMatchStartError(409, "Both championship teams are required");
    }
    // Defence in depth. Match create/edit already guarantee both of these,
    // and the database enforces team_a_id <> team_b_id, but the rosters are
    // about to be copied into a Team Battle so they are re-checked at the
    // last moment before that snapshot is taken.
    if (teamA.championshipId !== match.championshipId || teamB.championshipId !== match.championshipId) {
      throw new ChampionshipMatchStartError(409, "Both teams must belong to this championship");
    }
    if (teamA.id === teamB.id) {
      throw new ChampionshipMatchStartError(409, "A team cannot play itself");
    }

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
    // Looking the battle up by its deterministic id instead makes this
    // function idempotent: a retry reuses the existing battle and its session id.
    const battleId = `championship-${match.id}`;
    const [existingBattle] = await tx.select({
      id: teamBattles.id,
      gameSessionId: teamBattles.gameSessionId,
    }).from(teamBattles).where(eq(teamBattles.id, battleId));
    const gameSessionId = existingBattle?.gameSessionId || match.gameSessionId || uuid();
    // Ordering is deliberate: create the battle FIRST, then flip the match to
    // live. If the UPDATE does not match (concurrent start, or the match is
    // no longer upcoming) we are left with an unused forming battle, which a
    // retry reuses. The reverse order would risk a live match with no battle
    // behind it, which nothing can recover from because start then refuses
    // the match for no longer being upcoming.
    if (!existingBattle) {
      await tx.insert(teamBattles).values({
        id: battleId,
        gameSessionId,
        gameType: "question",
        category: "All Categories",
        difficulty: "Mixed",
        status: "forming",
        teamACaptainId: teamA.captainId,
        teamAName: teamA.name,
        teamATeammates: (teamA.memberIds ?? []).filter(id => id !== teamA.captainId),
        teamBCaptainId: teamB.captainId,
        teamBName: teamB.name,
        teamBTeammates: (teamB.memberIds ?? []).filter(id => id !== teamB.captainId),
        teamAScore: 0,
        teamBScore: 0,
        teamACorrectAnswers: 0,
        teamBCorrectAnswers: 0,
        teamAIncorrectAnswers: 0,
        teamBIncorrectAnswers: 0,
      });
    }

    const [updated] = await tx.update(championshipMatches).set({
      status: "live",
      startedAt: new Date(),
      gameSessionId,
      updatedAt: new Date(),
    }).where(and(
      eq(championshipMatches.id, match.id),
      eq(championshipMatches.status, "upcoming"),
    )).returning();
    if (!updated) {
      throw new ChampionshipMatchStartError(409, "Only upcoming matches can be started");
    }
    return updated;
  });

  broadcastChampionshipEvent({ type: "match_started", match: row });
  notifyChampionshipScheduleChanged();
  return row;
}
