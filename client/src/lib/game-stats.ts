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

export type ScoreHistoryRow = {
  category?: string;
  difficulty?: string;
};

export function getScoreCategory(score: ScoreHistoryRow): string {
  const value = score.category;
  return typeof value === "string" ? value.trim() : "";
}

export function getScoreDifficulty(score: ScoreHistoryRow): string {
  const value = score.difficulty;
  return typeof value === "string" ? value.trim() : "";
}

/** Most-played label from game history; ties favor the most recent game. */
export function mostPlayedLabel(
  games: ScoreHistoryRow[],
  field: "category" | "difficulty"
): { label: string; count: number } {
  if (games.length === 0) return { label: "—", count: 0 };

  const read =
    field === "category" ? getScoreCategory : getScoreDifficulty;

  const counts = new Map<string, number>();
  for (const game of games) {
    const value = read(game);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  if (counts.size === 0) return { label: "—", count: 0 };

  const maxCount = Math.max(...counts.values());
  const tied = [...counts.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([value]) => value);

  if (tied.length === 1) {
    return { label: tied[0], count: maxCount };
  }

  for (const game of games) {
    const value = read(game);
    if (value && tied.includes(value)) {
      return { label: value, count: counts.get(value) ?? 0 };
    }
  }

  return { label: tied[0], count: maxCount };
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
