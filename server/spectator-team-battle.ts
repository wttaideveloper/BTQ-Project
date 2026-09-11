/**
 * Team battles and rapid fire, as something a viewer can watch.
 *
 * Championship matches reach the stream through their own older path. This
 * covers every other battle: the ad hoc ones two players start between
 * themselves, in either question mode or rapid fire. The events go out through
 * server/spectator.ts, which rebuilds each one from a whitelist, so nothing
 * here can leak a correct answer or a session key even by accident.
 *
 * Championship battles are skipped. They already publish through
 * broadcastChampionshipEvent, and sending both would double every event for the
 * same underlying row.
 */
import {
  publicOptions,
  publishSpectatorEvent,
  registerSpectatorKind,
  type PublicSide,
  type SpectatorChannel,
} from "./spectator";
import { database } from "./database";

export const TEAM_BATTLE_KIND = "team-battle";

/** Championship battles carry this prefix and belong to the other path. */
const isChampionship = (id: string | null | undefined): boolean =>
  typeof id === "string" && id.startsWith("championship-");

/**
 * The battle row id behind an in-memory session.
 *
 * The session is keyed by gameSessionId, which is not the battle id. Every team
 * on the session carries the battle it belongs to, so take it from there.
 */
export function battleIdForSession(gameSession: any): string | null {
  const teams = Array.isArray(gameSession?.teams) ? gameSession.teams : [];
  for (const team of teams) {
    if (typeof team?.teamBattleId === "string" && team.teamBattleId) return team.teamBattleId;
  }
  return null;
}

/** The channel for a session, or null when it is not ours to publish. */
function channelFor(gameSession: any): SpectatorChannel | null {
  const battleId = battleIdForSession(gameSession);
  if (!battleId || isChampionship(battleId)) return null;
  return { kind: TEAM_BATTLE_KIND, id: battleId };
}

/** The two sides, in A then B order, reduced to what a viewer may see. */
function sidesOf(gameSession: any): PublicSide[] {
  const teams = Array.isArray(gameSession?.teams) ? gameSession.teams : [];
  const order = (t: any) => (t?.teamSide === "A" ? 0 : t?.teamSide === "B" ? 1 : 2);
  return [...teams]
    .sort((a, b) => order(a) - order(b))
    .map((t: any) => ({ id: String(t?.id ?? ""), name: String(t?.name ?? ""), score: Number(t?.score ?? 0) }));
}

export function spectatorBattleStarted(gameSession: any): void {
  const channel = channelFor(gameSession);
  if (!channel) return;
  publishSpectatorEvent(channel, { type: "started", sides: sidesOf(gameSession) });
}

export function spectatorBattleQuestion(
  gameSession: any,
  question: any,
  questionNumber: number,
  answeringTeam?: any,
): void {
  const channel = channelFor(gameSession);
  if (!channel) return;
  publishSpectatorEvent(channel, {
    type: "question",
    questionId: String(question?.id),
    questionNumber,
    totalQuestions: Array.isArray(gameSession?.questions) ? gameSession.questions.length : undefined,
    questionText: question?.text,
    options: publicOptions(question),
    answeringSideId: answeringTeam?.id ?? null,
    answeringSideName: answeringTeam?.name ?? null,
  });
}

/**
 * The result of a question.
 *
 * Called only after the score has been committed, so correctness is read from
 * an already evaluated result rather than recomputed from the question. That
 * ordering is what keeps the answer off the wire while the round is still open.
 */
export function spectatorBattleAnswered(
  gameSession: any,
  result: {
    questionId?: string;
    questionNumber?: number;
    answeringTeam?: any;
    selectedAnswerId?: string | null;
    correctAnswerId?: string | null;
    isCorrect?: boolean;
    pointsAwarded?: number;
  },
): void {
  const channel = channelFor(gameSession);
  if (!channel) return;
  publishSpectatorEvent(channel, {
    type: "answered",
    questionId: result.questionId,
    questionNumber: result.questionNumber,
    answeringSideId: result.answeringTeam?.id ?? null,
    answeringSideName: result.answeringTeam?.name ?? null,
    selectedAnswerId: result.selectedAnswerId ?? null,
    correctAnswerId: result.correctAnswerId ?? null,
    isCorrect: !!result.isCorrect,
    pointsAwarded: Number(result.pointsAwarded ?? 0),
  });
}

export function spectatorBattleScore(gameSession: any): void {
  const channel = channelFor(gameSession);
  if (!channel) return;
  publishSpectatorEvent(channel, { type: "score", sides: sidesOf(gameSession) });
}

export function spectatorBattleToss(gameSession: any, question: any): void {
  const channel = channelFor(gameSession);
  if (!channel) return;
  publishSpectatorEvent(channel, {
    type: "toss",
    questionId: String(question?.id),
    questionText: question?.text,
    options: publicOptions(question),
  });
}

export function spectatorBattleTossResolved(
  gameSession: any,
  winnerTeam: any,
  correctAnswerId?: string | null,
): void {
  const channel = channelFor(gameSession);
  if (!channel) return;
  publishSpectatorEvent(channel, {
    type: "toss_resolved",
    winnerSideId: winnerTeam?.id ?? null,
    winnerSideName: winnerTeam?.name ?? null,
    correctAnswerId: correctAnswerId ?? null,
  });
}

export function spectatorBattleEnded(
  gameSession: any,
  outcome?: { winnerSideId?: string | null; isDraw?: boolean },
): void {
  const channel = channelFor(gameSession);
  if (!channel) return;
  publishSpectatorEvent(channel, {
    type: "ended",
    sides: sidesOf(gameSession),
    winnerSideId: outcome?.winnerSideId ?? null,
    isDraw: !!outcome?.isDraw,
  });
}

/**
 * What a viewer arriving cold is told about a battle.
 *
 * Deliberately thin: the two side names and their scores. `gameSessionId` is
 * never included, for the same reason the championship endpoint strips it.
 */
async function loadBattle(id: string): Promise<unknown | null> {
  if (isChampionship(id)) return null;
  const battle: any = await (database as any).getTeamBattle?.(id);
  if (!battle) return null;
  const status =
    battle.status === "playing" ? "live" : battle.status === "finished" ? "finished" : "pending";
  return {
    kind: TEAM_BATTLE_KIND,
    id: battle.id,
    title: `${battle.teamAName ?? "Team A"} v ${battle.teamBName ?? "Team B"}`,
    status,
    sides: [
      { id: `${battle.id}-team-a`, name: String(battle.teamAName ?? "Team A"), score: Number(battle.teamAScore ?? 0) },
      { id: `${battle.id}-team-b`, name: String(battle.teamBName ?? "Team B"), score: Number(battle.teamBScore ?? 0) },
    ],
  };
}

registerSpectatorKind({ kind: TEAM_BATTLE_KIND, load: loadBattle });
