export function escapeCsvValue(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildLeaderboardCsv(
  players: Array<{
    name: string;
    score: number;
    gamesPlayed: number;
    correctAnswers: number;
    incorrectAnswers: number;
    accuracy: number;
  }>,
  gameType: string
): string {
  const header = [
    "Rank",
    "Player",
    "Score",
    "Games Played",
    "Correct",
    "Incorrect",
    "Accuracy (%)",
    "Game Type Filter",
  ];

  const rows = players.map((player, index) =>
    [
      index + 1,
      player.name,
      player.score,
      player.gamesPlayed,
      player.correctAnswers,
      player.incorrectAnswers,
      player.accuracy,
      gameType,
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  return [header.join(","), ...rows].join("\r\n");
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
