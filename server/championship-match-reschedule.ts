/**
 * Shared rules for changing a championship match's scheduledAt.
 *
 * Used by PATCH /api/championship-matches/:id so Auto Start sees the new time
 * through the existing notifyChampionshipScheduleChanged() hook. This does not
 * start matches, regenerate Auto Schedule, or touch gameplay.
 */
import { isDateTimeInPast, localDateTimeString, PAST_START_MESSAGE } from "./championship-schedule";

export const LIVE_MATCH_RESCHEDULE_MESSAGE = "Live matches cannot be rescheduled";
export const COMPLETED_MATCH_EDIT_MESSAGE = "Completed matches cannot be edited";
export const INVALID_MATCH_TIME_MESSAGE = "Match date and time is invalid";

export function rescheduleMatchError(
  status: string,
  submittedScheduledAt: Date | null | undefined,
  existingScheduledAt: Date | string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (status === "live") return LIVE_MATCH_RESCHEDULE_MESSAGE;
  if (status === "completed") return COMPLETED_MATCH_EDIT_MESSAGE;
  if (submittedScheduledAt == null) return null;
  if (Number.isNaN(submittedScheduledAt.getTime())) return INVALID_MATCH_TIME_MESSAGE;
  const submittedAt = localDateTimeString(submittedScheduledAt);
  const existingDate = existingScheduledAt ? new Date(existingScheduledAt) : null;
  const existingAt = existingDate && !Number.isNaN(existingDate.getTime())
    ? localDateTimeString(existingDate)
    : null;
  if (isDateTimeInPast(submittedScheduledAt, now) && submittedAt !== existingAt) {
    return PAST_START_MESSAGE;
  }
  return null;
}
