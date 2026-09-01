/**
 * Championship-only question advance rules.
 *
 * Regular Team Battle still auto-advances after 3 seconds. Championship
 * matches wait for a commentator after a scored question, then reuse
 * sendTeamBattleQuestion() — this module only decides WHETHER that wait
 * applies and WHETHER a NEXT QUESTION request is legal.
 */

export class CommentatorAdvanceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CommentatorAdvanceError";
    this.status = status;
  }
}

export function isChampionshipTeamBattleId(battleId: string | null | undefined): battleId is string {
  return typeof battleId === "string" && battleId.startsWith("championship-");
}

export function championshipMatchIdFromBattleId(battleId: string | null | undefined): string | null {
  if (!isChampionshipTeamBattleId(battleId)) return null;
  return battleId.slice("championship-".length);
}

export function sessionLooksLikeChampionship(teams: Array<{ teamBattleId?: string | null }> | null | undefined): boolean {
  return (teams ?? []).some(team => isChampionshipTeamBattleId(team.teamBattleId));
}

/**
 * After processTeamBattleAnswers has already incremented currentQuestionIndex,
 * remainingQuestions > 0 means a next scored question exists.
 * The last question must still auto-complete — do not wait for NEXT QUESTION.
 */
export function shouldWaitForCommentatorAdvance(options: {
  isChampionship: boolean;
  remainingQuestions: number;
}): boolean {
  return options.isChampionship && options.remainingQuestions > 0;
}

export type CommentatorAdvanceState = {
  matchStatus: string;
  gameplayStarted: boolean;
  phase?: string | null;
  isProcessingAnswers: boolean;
  inFlight: boolean;
  waitingForCommentator: boolean;
  hasQuestionTimeout: boolean;
  nextIndex: number;
  questionCount: number;
};

export function evaluateCommentatorAdvance(state: CommentatorAdvanceState): { ok: true } | { ok: false; status: number; message: string } {
  if (state.matchStatus !== "live") {
    return { ok: false, status: 409, message: "Only a live match can be advanced" };
  }
  if (!state.gameplayStarted) {
    return { ok: false, status: 409, message: "Gameplay has not started yet" };
  }
  if (state.phase === "toss") {
    return { ok: false, status: 409, message: "The toss is still in progress" };
  }
  if (state.isProcessingAnswers) {
    return { ok: false, status: 409, message: "The current question is still being scored" };
  }
  if (state.inFlight) {
    return { ok: false, status: 409, message: "Next question is already in progress" };
  }
  if (state.hasQuestionTimeout && !state.waitingForCommentator) {
    return { ok: false, status: 409, message: "A team is still answering this question" };
  }
  if (!state.waitingForCommentator) {
    return { ok: false, status: 409, message: "Wait until the current question has been scored before advancing" };
  }
  if (state.questionCount <= 0 || state.nextIndex >= state.questionCount) {
    return { ok: false, status: 409, message: "There is no next question" };
  }
  return { ok: true };
}
