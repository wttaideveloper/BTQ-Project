/**
 * Championship match reschedule validation tests.
 *
 * Run with: npx tsx server/championship-match-reschedule.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAST_START_MESSAGE } from "./championship-schedule.ts";
import {
  COMPLETED_MATCH_EDIT_MESSAGE,
  INVALID_MATCH_TIME_MESSAGE,
  LIVE_MATCH_RESCHEDULE_MESSAGE,
  rescheduleMatchError,
} from "./championship-match-reschedule.ts";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(error);
  }
}

const now = new Date(2026, 7, 27, 12, 0, 0, 0);
const future = new Date(2026, 7, 27, 16, 0, 0, 0);
const later = new Date(2026, 7, 27, 18, 30, 0, 0);
const past = new Date(2026, 7, 27, 10, 0, 0, 0);
const otherPast = new Date(2026, 7, 27, 11, 0, 0, 0);

const routesSource = readFileSync(new URL("./championship-routes.ts", import.meta.url), "utf8");
const patchSource = routesSource.slice(
  routesSource.indexOf('app.patch("/api/championship-matches/:id"'),
  routesSource.indexOf('app.post("/api/championship-matches/:id/start"'),
);

console.log("championship match reschedule");

await test("upcoming match can be rescheduled to a later valid time", () => {
  assert.equal(rescheduleMatchError("upcoming", later, future, now), null);
});

await test("live match cannot be rescheduled", () => {
  assert.equal(rescheduleMatchError("live", later, future, now), LIVE_MATCH_RESCHEDULE_MESSAGE);
});

await test("completed match cannot be rescheduled", () => {
  assert.equal(rescheduleMatchError("completed", later, future, now), COMPLETED_MATCH_EDIT_MESSAGE);
});

await test("invalid date is rejected", () => {
  assert.equal(
    rescheduleMatchError("upcoming", new Date("not-a-date"), future, now),
    INVALID_MATCH_TIME_MESSAGE,
  );
});

await test("past date follows existing validation", () => {
  assert.equal(rescheduleMatchError("upcoming", past, future, now), PAST_START_MESSAGE);
});

await test("keeping an already-past scheduledAt is allowed (Ready to start)", () => {
  assert.equal(rescheduleMatchError("upcoming", past, past, now), null);
});

await test("changing a Ready to start time to a different past time is rejected", () => {
  assert.equal(rescheduleMatchError("upcoming", otherPast, past, now), PAST_START_MESSAGE);
});

await test("Ready to start may be moved to a future time", () => {
  assert.equal(rescheduleMatchError("upcoming", later, past, now), null);
});

await test("null scheduledAt follows existing Edit behavior (clearing is allowed)", () => {
  assert.equal(rescheduleMatchError("upcoming", null, future, now), null);
});

await test("PATCH match route stays admin-only and notifies Auto Start", () => {
  assert.match(patchSource, /ensureAdmin/);
  assert.match(patchSource, /rescheduleMatchError/);
  assert.match(patchSource, /notifyChampionshipScheduleChanged\(\)/);
  assert.match(patchSource, /where\(eq\(championshipMatches\.id, existing\.id\)\)/);
});

await test("reschedule does not regenerate Auto Schedule or start the match", () => {
  assert.doesNotMatch(patchSource, /buildRoundRobinSchedule/);
  assert.doesNotMatch(patchSource, /startChampionshipMatch/);
  assert.doesNotMatch(patchSource, /planAutoSchedule/);
});

await test("existing create-match past validation message is reused", () => {
  assert.match(routesSource, /Match date and time cannot be in the past/);
  assert.equal(PAST_START_MESSAGE, "Match date and time cannot be in the past");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
