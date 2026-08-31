import type { CommentaryEntry } from "@/components/watch/WatchCommentary";
import type { WatchQuestion } from "@/components/watch/WatchQuestionPanel";
import type { WatchToss } from "@/components/watch/WatchTossPanel";

export type BroadcastPhase = "upcoming" | "waiting" | "toss" | "question" | "between" | "completed";

export type BroadcastSpectatorOption = { id: string; text: string; isCorrect?: unknown };

/**
 * Which presenter state the commentator desk should show.
 * Derived only from spectator-safe match + event state — never from gameplay internals.
 */
export function broadcastPhase(input: {
  status: string;
  gameplayStarted: boolean;
  toss: WatchToss | null;
  question: WatchQuestion | null;
}): BroadcastPhase {
  if (input.status === "completed") return "completed";
  if (input.status === "upcoming") return "upcoming";
  if (input.status !== "live") return "waiting";
  if (input.toss) return "toss";
  if (input.question) return "question";
  if (input.gameplayStarted) return "between";
  return "waiting";
}

export function broadcastStatusLabel(status: string, phase: BroadcastPhase): string {
  if (status === "cancelled") return "CANCELLED";
  if (status === "completed" || phase === "completed") return "COMPLETED";
  if (phase === "upcoming" || phase === "waiting") return "WAITING";
  return "LIVE";
}

export function broadcastStateParts(input: {
  phase: BroadcastPhase;
  question?: WatchQuestion | null;
  answeringTeamName?: string | null;
  winnerName?: string | null;
  isDraw?: boolean;
}): { kicker: string; headline: string } {
  if (input.phase === "completed") {
    if (input.isDraw) return { kicker: "MATCH COMPLETE", headline: "DRAW" };
    if (input.winnerName) return { kicker: "MATCH COMPLETE", headline: `${input.winnerName.toUpperCase()} WINS` };
    return { kicker: "MATCH COMPLETE", headline: "FINAL SCORE" };
  }
  if (input.phase === "toss") return { kicker: "TOSS", headline: "TOSS QUESTION" };
  if (input.phase === "question") {
    const n = input.question?.questionNumber;
    const total = input.question?.totalQuestions;
    const kicker = n ? (total ? `QUESTION ${n} / ${total}` : `QUESTION ${n}`) : "QUESTION IN PLAY";
    const headline = input.answeringTeamName ? `${input.answeringTeamName.toUpperCase()}'S TURN` : "IN PLAY";
    return { kicker, headline };
  }
  if (input.phase === "between") return { kicker: "STAND BY", headline: "WAITING FOR THE NEXT QUESTION" };
  if (input.phase === "waiting") return { kicker: "WAITING", headline: "WAITING FOR THE MATCH TO START" };
  return { kicker: "WAITING", headline: "WAITING" };
}

export function broadcastStateLine(input: {
  phase: BroadcastPhase;
  question?: WatchQuestion | null;
  answeringTeamName?: string | null;
  winnerName?: string | null;
  isDraw?: boolean;
}): string {
  const { kicker, headline } = broadcastStateParts(input);
  if (input.phase === "completed") {
    return headline === "FINAL SCORE" ? kicker : `${kicker} · ${headline}`;
  }
  if (input.phase === "toss") return headline;
  if (input.phase === "question") {
    return headline === "IN PLAY" ? kicker : `${kicker} · ${headline}`;
  }
  return headline;
}

export function appendBroadcastEvent(
  current: CommentaryEntry[],
  entry: Omit<CommentaryEntry, "id" | "at">,
  cap = 8,
): CommentaryEntry[] {
  return [{ ...entry, id: Date.now() + Math.random(), at: Date.now() }, ...current].slice(0, cap);
}

/** Spectator options must not carry correctness before the server result. */
export function spectatorOptionsLeakCorrectness(options: BroadcastSpectatorOption[]): boolean {
  return options.some(option => Object.prototype.hasOwnProperty.call(option, "isCorrect"));
}

export function publicMatchExposesSession(match: { gameSessionId?: unknown } | null | undefined): boolean {
  return !!match && Object.prototype.hasOwnProperty.call(match, "gameSessionId");
}

export function isBroadcastCleanMode(search: string): boolean {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("clean") === "1";
}

/** Commentator-facing result copy. Uses the spectator result only — never guessed. */
export function broadcastResultCopy(input: {
  answeringTeamName?: string | null;
  isCorrect: boolean;
  pointsAwarded: number;
}): { headline: string; points: string } {
  const team = (input.answeringTeamName || "TEAM").toUpperCase();
  return {
    headline: `${team} ANSWERED ${input.isCorrect ? "CORRECTLY" : "INCORRECTLY"}`,
    points: `+${input.pointsAwarded} POINTS`,
  };
}
