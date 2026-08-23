import { and, eq, isNotNull, ne } from "drizzle-orm";
import { championships } from "@shared/schema";
import { database } from "./database";

// Championship dates are calendar dates, so lifecycle decisions must use one
// explicit business timezone rather than the host machine's local timezone.
export const CHAMPIONSHIP_TIME_ZONE = process.env.CHAMPIONSHIP_TIME_ZONE || "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHAMPIONSHIP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const localDateString = (date: Date) => {
  const parts = dateFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

export const hasChampionshipEndDatePassed = (endDate: Date | null | undefined, now = new Date()) =>
  !!endDate && localDateString(now) > localDateString(endDate);

/** Persist completion once the business-local day after endDate begins. */
export async function completeExpiredChampionships(now = new Date()) {
  const expirable = await database.db.select({ id: championships.id, endDate: championships.endDate })
    .from(championships)
    .where(and(isNotNull(championships.endDate), ne(championships.status, "completed")));
  const expired = expirable.filter(championship => hasChampionshipEndDatePassed(championship.endDate, now));

  await Promise.all(expired.map(championship =>
    database.db.update(championships)
      .set({ status: "completed", updatedAt: now })
      .where(and(eq(championships.id, championship.id), ne(championships.status, "completed"))),
  ));

  return expired.length;
}

const lifecycleTimerKey = Symbol.for("bibletriv.championshipLifecycleTimer");

/** Register at most one periodic sweep for this Node process. */
export function startChampionshipLifecycle() {
  const lifecycleState = globalThis as typeof globalThis & {
    [lifecycleTimerKey]?: ReturnType<typeof setInterval>;
  };
  if (lifecycleState[lifecycleTimerKey]) return;

  lifecycleState[lifecycleTimerKey] = setInterval(() => {
    void completeExpiredChampionships().catch(error =>
      console.error("[Championship lifecycle] Automatic completion failed:", error),
    );
  }, 15 * 60 * 1000);
}
