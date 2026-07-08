import {
  DEFAULT_GAME_SETTINGS,
  normalizeDurationOptions,
} from "@shared/game-settings";

export {
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_LIMITS,
  PLATFORM_GAME_MODES,
  formatDurationOptionsLabel,
  formatQuestionBasedSummary,
  getQuestionCountForGame,
  getTeamBattleQuestionCount,
  normalizeDurationOptions,
  normalizeGameSettings,
  parseTimeBasedDurationMinutes,
  timePerQuestionToMs,
  type GameSettingsConfig,
} from "@shared/game-settings";

export type TimeBasedDurationMinutes = number;

export const TIME_BASED_DURATION_OPTIONS =
  DEFAULT_GAME_SETTINGS.timeBasedDurationOptions;

export const DEFAULT_TIME_BASED_DURATION =
  DEFAULT_GAME_SETTINGS.defaultTimeBasedDuration;

export function timeBasedDurationToSeconds(minutes: number): number {
  return minutes * 60;
}

export function resolveTimeBasedDurationOptions(
  options?: number[]
): number[] {
  return normalizeDurationOptions(options);
}

export function resolveDefaultTimeBasedDuration(
  options: number[],
  preferred?: number
): number {
  if (preferred && options.includes(preferred)) {
    return preferred;
  }
  if (options.includes(DEFAULT_TIME_BASED_DURATION)) {
    return DEFAULT_TIME_BASED_DURATION;
  }
  return options[0] ?? DEFAULT_TIME_BASED_DURATION;
}
