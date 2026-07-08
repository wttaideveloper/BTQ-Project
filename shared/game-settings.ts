export interface GameSettingsConfig {
  timePerQuestion: number;
  timeBasedDurationOptions: number[];
  defaultTimeBasedDuration: number;
  questionsPerGame: number;
  maxPlayersPerGame: number;
  minPlayersPerGame: number;
}

/** Fixed for local multiplayer — not admin-configurable. */
export const MIN_PLAYERS_PER_GAME = 2;

export const DEFAULT_GAME_SETTINGS: GameSettingsConfig = {
  timePerQuestion: 20,
  timeBasedDurationOptions: [5, 10, 15],
  defaultTimeBasedDuration: 5,
  questionsPerGame: 10,
  maxPlayersPerGame: 4,
  minPlayersPerGame: MIN_PLAYERS_PER_GAME,
};

export const GAME_SETTINGS_LIMITS = {
  timePerQuestion: { min: 5, max: 60 },
  questionsPerGame: { min: 5, max: 20 },
  maxPlayersPerGame: { min: MIN_PLAYERS_PER_GAME, max: 8 },
  timeBasedDuration: { min: 1, max: 30 },
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeDurationOptions(
  options: unknown,
  fallback = DEFAULT_GAME_SETTINGS.timeBasedDurationOptions
): number[] {
  const raw = Array.isArray(options)
    ? options
    : typeof options === "string"
      ? options.split(",").map((part) => parseInt(part.trim(), 10))
      : fallback;

  const normalized = [...new Set(
    raw
      .map((value) =>
        clamp(
          Number(value),
          GAME_SETTINGS_LIMITS.timeBasedDuration.min,
          GAME_SETTINGS_LIMITS.timeBasedDuration.max
        )
      )
      .filter((value) => Number.isFinite(value))
  )].sort((a, b) => a - b);

  return normalized.length > 0 ? normalized : [...fallback];
}

export function normalizeGameSettings(
  input: Partial<GameSettingsConfig> | null | undefined
): GameSettingsConfig {
  const durationOptions = normalizeDurationOptions(
    input?.timeBasedDurationOptions
  );

  const defaultDuration = clamp(
    Number(input?.defaultTimeBasedDuration ?? DEFAULT_GAME_SETTINGS.defaultTimeBasedDuration),
    GAME_SETTINGS_LIMITS.timeBasedDuration.min,
    GAME_SETTINGS_LIMITS.timeBasedDuration.max
  );

  const resolvedDefault = durationOptions.includes(defaultDuration)
    ? defaultDuration
    : durationOptions[0];

  const maxPlayers = clamp(
    Number(input?.maxPlayersPerGame ?? DEFAULT_GAME_SETTINGS.maxPlayersPerGame),
    MIN_PLAYERS_PER_GAME,
    GAME_SETTINGS_LIMITS.maxPlayersPerGame.max
  );

  return {
    timePerQuestion: clamp(
      Number(input?.timePerQuestion ?? DEFAULT_GAME_SETTINGS.timePerQuestion),
      GAME_SETTINGS_LIMITS.timePerQuestion.min,
      GAME_SETTINGS_LIMITS.timePerQuestion.max
    ),
    timeBasedDurationOptions: durationOptions,
    defaultTimeBasedDuration: resolvedDefault,
    questionsPerGame: clamp(
      Number(input?.questionsPerGame ?? DEFAULT_GAME_SETTINGS.questionsPerGame),
      GAME_SETTINGS_LIMITS.questionsPerGame.min,
      GAME_SETTINGS_LIMITS.questionsPerGame.max
    ),
    maxPlayersPerGame: maxPlayers,
    minPlayersPerGame: MIN_PLAYERS_PER_GAME,
  };
}

export function parseTimeBasedDurationMinutes(
  value: string | null | undefined,
  options: number[],
  fallback: number
): number {
  const parsed = parseInt(value ?? "", 10);
  if (options.includes(parsed)) {
    return parsed;
  }
  return options.includes(fallback) ? fallback : options[0];
}

export function getQuestionCountForGame(
  questionsPerGame: number,
  gameMode: string,
  playerCount: number
): number {
  if (gameMode !== "multi" || playerCount <= 1) {
    return questionsPerGame;
  }
  return Math.ceil(questionsPerGame / playerCount) * playerCount;
}

export function formatDurationOptionsLabel(options: number[]): string {
  if (options.length === 0) return "";
  if (options.length === 1) return `${options[0]} min`;
  const last = options[options.length - 1];
  const rest = options.slice(0, -1).join(", ");
  return `${rest}, or ${last} min`;
}

export function formatQuestionBasedSummary(
  settings: Pick<GameSettingsConfig, "questionsPerGame" | "timePerQuestion">
): string {
  return `${settings.questionsPerGame} questions, ${settings.timePerQuestion} sec per question`;
}

export function formatTimeBasedRoundSummary(options: number[]): string {
  const label = formatDurationOptionsLabel(options);
  if (!label) return "a timed round";
  if (options.length === 1) return `a ${label} round`;
  return `${label} rounds`;
}

export function formatMultiplayerPlayerRange(
  settings: Pick<GameSettingsConfig, "minPlayersPerGame" | "maxPlayersPerGame">
): string {
  const min = settings.minPlayersPerGame;
  const max = settings.maxPlayersPerGame;
  if (min === max) return `${min} players`;
  return `${min}–${max} players`;
}

export function timePerQuestionToMs(seconds: number): number {
  return Math.max(1, seconds) * 1000;
}

/** Team battle alternates 2 teams — round up to an even question count. */
export function getTeamBattleQuestionCount(questionsPerGame: number): number {
  const count = clamp(
    questionsPerGame,
    GAME_SETTINGS_LIMITS.questionsPerGame.min,
    GAME_SETTINGS_LIMITS.questionsPerGame.max
  );
  return count % 2 === 0 ? count : count + 1;
}

export const PLATFORM_GAME_MODES = [
  {
    id: "solo",
    label: "Solo Quiz",
    usesQuestionsPerGame: true,
    usesTimePerQuestion: true,
  },
  {
    id: "multiplayer",
    label: "Local Multiplayer",
    usesQuestionsPerGame: true,
    usesTimePerQuestion: true,
  },
  {
    id: "teamBattle",
    label: "Team Battle",
    usesQuestionsPerGame: true,
    usesTimePerQuestion: true,
    note: "Question count rounds up to an even number for fair team turns",
  },
  {
    id: "rapidFire",
    label: "Rapid Fire",
    usesQuestionsPerGame: true,
    usesTimePerQuestion: true,
  },
  {
    id: "timeBased",
    label: "Time-Based Quiz",
    usesQuestionsPerGame: false,
    usesTimePerQuestion: true,
    note: "Uses duration options instead of a fixed question count",
  },
] as const;
