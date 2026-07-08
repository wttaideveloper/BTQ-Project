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

type QuestionForCsv = {
  id: string;
  text: string;
  context?: string;
  category: string;
  difficulty: string;
  answers: Array<{ text: string; isCorrect: boolean }>;
};

export function buildQuestionsCsv(questions: QuestionForCsv[]): string {
  const header = [
    "ID",
    "Question",
    "Context",
    "Category",
    "Difficulty",
    "Option A",
    "Option B",
    "Option C",
    "Option D",
    "Correct Answer",
  ];

  const rows = questions.map((q) => {
    const options = q.answers.slice(0, 4);
    while (options.length < 4) {
      options.push({ text: "", isCorrect: false });
    }
    const correctAnswer =
      options.find((a) => a.isCorrect)?.text ?? options[0]?.text ?? "";

    return [
      q.id,
      q.text,
      q.context ?? "",
      q.category,
      q.difficulty,
      options[0]?.text ?? "",
      options[1]?.text ?? "",
      options[2]?.text ?? "",
      options[3]?.text ?? "",
      correctAnswer,
    ]
      .map(escapeCsvValue)
      .join(",");
  });

  return [header.join(","), ...rows].join("\r\n");
}

type UserForCsv = {
  id: number;
  username: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  country: string | null;
  isAdmin: boolean;
  isEmailVerified: boolean | null;
  isOnline: boolean | null;
  isInTeamBattle: boolean | null;
  lastSeen: string | null;
  lastLoginAt: string | null;
  totalGames: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
};

export function buildUsersCsv(users: UserForCsv[]): string {
  const header = [
    "ID",
    "Username",
    "Full Name",
    "Email",
    "Phone",
    "Country",
    "Admin",
    "Email Verified",
    "Online",
    "In Team Battle",
    "Total Games",
    "Wins",
    "Losses",
    "Draws",
    "Last Seen",
    "Last Login",
  ];

  const rows = users.map((user) =>
    [
      user.id,
      user.username,
      user.fullName ?? "",
      user.email ?? "",
      user.phone ?? "",
      user.country ?? "",
      user.isAdmin ? "Yes" : "No",
      user.isEmailVerified ? "Yes" : "No",
      user.isOnline ? "Yes" : "No",
      user.isInTeamBattle ? "Yes" : "No",
      user.totalGames ?? 0,
      user.wins ?? 0,
      user.losses ?? 0,
      user.draws ?? 0,
      user.lastSeen ?? "",
      user.lastLoginAt ?? "",
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  return [header.join(","), ...rows].join("\r\n");
}

type DashboardStatsForCsv = {
  totalUsers: number;
  totalQuestions: number;
  soloGames: number;
  multiGames: number;
  teamBattlesTotal: number;
  teamBattlesFinished: number;
  teamBattlesActive: number;
  avgSoloScore: number;
  soloGamesLast24h: number;
  leaderboardPlayers: number;
};

type ActivityItemForCsv = {
  type: string;
  title: string;
  subtitle: string;
  timestamp: string;
  meta: Record<string, string | number | null>;
};

export function buildGameStatsCsv(
  stats: DashboardStatsForCsv,
  activity: ActivityItemForCsv[]
): string {
  const overviewHeader = ["Metric", "Value"];
  const overviewRows = [
    ["Registered Users", stats.totalUsers],
    ["Leaderboard Players", stats.leaderboardPlayers],
    ["Questions in Bank", stats.totalQuestions],
    ["Solo Games Played", stats.soloGames],
    ["Multiplayer Games Played", stats.multiGames],
    ["Total Quiz Games", stats.soloGames + stats.multiGames],
    ["Average Solo Score", stats.avgSoloScore],
    ["Solo Games (Last 24h)", stats.soloGamesLast24h],
    ["Team Battles Total", stats.teamBattlesTotal],
    ["Team Battles Finished", stats.teamBattlesFinished],
    ["Team Battles Active", stats.teamBattlesActive],
  ].map((row) => row.map(escapeCsvValue).join(","));

  const activityHeader = [
    "Type",
    "Title",
    "Subtitle",
    "Timestamp",
    "Details",
  ];
  const activityRows = activity.map((item) =>
    [
      item.type,
      item.title,
      item.subtitle,
      item.timestamp,
      JSON.stringify(item.meta),
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  return [
    overviewHeader.join(","),
    ...overviewRows,
    "",
    activityHeader.join(","),
    ...activityRows,
  ].join("\r\n");
}
