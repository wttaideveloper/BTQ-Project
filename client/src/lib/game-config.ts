export const TIME_BASED_DURATION_OPTIONS = [5, 10, 15] as const;

export type TimeBasedDurationMinutes =
  (typeof TIME_BASED_DURATION_OPTIONS)[number];

export const DEFAULT_TIME_BASED_DURATION: TimeBasedDurationMinutes = 5;

export function parseTimeBasedDurationMinutes(
  value: string | null | undefined
): TimeBasedDurationMinutes {
  const parsed = parseInt(value ?? "", 10);
  if (
    TIME_BASED_DURATION_OPTIONS.includes(parsed as TimeBasedDurationMinutes)
  ) {
    return parsed as TimeBasedDurationMinutes;
  }
  return DEFAULT_TIME_BASED_DURATION;
}

export function timeBasedDurationToSeconds(
  minutes: TimeBasedDurationMinutes
): number {
  return minutes * 60;
}
