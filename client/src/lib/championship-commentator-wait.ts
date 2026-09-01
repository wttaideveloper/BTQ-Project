/**
 * Championship players wait for the commentator after a scored question.
 * Regular Team Battle auto-advances; Rapid Fire is unchanged.
 */
export function championshipShouldWaitAfterResults(opts: {
  isChampionship: boolean;
  isRapidFire?: boolean;
  questionNumber?: number | null;
  totalQuestions?: number | null;
}): boolean {
  if (!opts.isChampionship || opts.isRapidFire) return false;
  const questionNumber = opts.questionNumber ?? 0;
  const totalQuestions = opts.totalQuestions ?? 0;
  if (questionNumber <= 0 || totalQuestions <= 0) return false;
  return questionNumber < totalQuestions;
}

export function shouldShowChampionshipCommentatorWait(opts: {
  isChampionship: boolean;
  waitingForCommentator: boolean;
  phase: string;
  isToss?: boolean;
}): boolean {
  if (!opts.isChampionship) return false;
  if (!opts.waitingForCommentator) return false;
  if (opts.isToss || opts.phase === "toss") return false;
  if (opts.phase === "finished" || opts.phase === "results") return false;
  return opts.phase === "question";
}
