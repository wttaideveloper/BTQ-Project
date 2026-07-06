export function calculateAverageAnswerTime(
  totalTimeSpent: number,
  answeredCount: number
): number {
  if (answeredCount <= 0 || totalTimeSpent <= 0) return 0;
  return totalTimeSpent / answeredCount;
}

export function formatAverageAnswerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0.0s";
  return `${seconds.toFixed(1)}s`;
}

export function getAnsweredQuestionCount(
  correctAnswers: number,
  incorrectAnswers: number
): number {
  return correctAnswers + incorrectAnswers;
}

export function normalizePlayerAvgTime(player: {
  avgTime?: number;
  averageTime?: number;
  totalTimeSpent?: number;
  correctAnswers?: number;
  incorrectAnswers?: number;
}): number {
  const answered = getAnsweredQuestionCount(
    player.correctAnswers ?? 0,
    player.incorrectAnswers ?? 0
  );

  if (typeof player.totalTimeSpent === "number" && answered > 0) {
    return calculateAverageAnswerTime(player.totalTimeSpent, answered);
  }

  if (typeof player.avgTime === "number" && Number.isFinite(player.avgTime)) {
    return player.avgTime;
  }

  if (
    typeof player.averageTime === "number" &&
    Number.isFinite(player.averageTime)
  ) {
    return player.averageTime;
  }

  return 0;
}
