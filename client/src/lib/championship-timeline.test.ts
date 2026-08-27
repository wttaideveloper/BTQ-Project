/**
 * Championship schedule timeline grouping tests.
 *
 * Run with: npx tsx client/src/lib/championship-timeline.test.ts
 */
import assert from "node:assert/strict";
import {
  formatKickoffTime,
  groupMatchesForScheduleTimeline,
  UNSCHEDULED_SCHEDULE_KEY,
  type ChampionshipMatchSummary,
} from "./championship.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(error);
  }
}

const now = new Date(2026, 7, 27, 12, 0, 0, 0);

const fixture = (
  id: string,
  scheduledAt: Date | null,
  status: ChampionshipMatchSummary["status"] = "upcoming",
  extra: Partial<ChampionshipMatchSummary> = {},
): ChampionshipMatchSummary => ({
  id,
  championshipId: "c1",
  teamAId: "a",
  teamBId: "b",
  status,
  scheduledAt,
  teamAScore: extra.teamAScore ?? 0,
  teamBScore: extra.teamBScore ?? 0,
  ...extra,
});

console.log("championship schedule timeline");

test("0 matches → no groups", () => {
  assert.deepEqual(groupMatchesForScheduleTimeline([], now), []);
});

test("1 match is grouped on its local date", () => {
  const match = fixture("m1", new Date(2026, 7, 27, 14, 0, 0, 0));
  const groups = groupMatchesForScheduleTimeline([match], now);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Today");
  assert.deepEqual(groups[0].matches.map(item => item.id), ["m1"]);
});

test("2 matches on the same day stay in one group in timestamp order", () => {
  const later = fixture("m-later", new Date(2026, 7, 27, 15, 20, 0, 0));
  const earlier = fixture("m-earlier", new Date(2026, 7, 27, 14, 0, 0, 0));
  const groups = groupMatchesForScheduleTimeline([later, earlier], now);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].matches.map(item => item.id), ["m-earlier", "m-later"]);
});

test("matches across multiple days are grouped and ordered by actual timestamps", () => {
  const tomorrow = fixture("m-tom", new Date(2026, 7, 28, 14, 0, 0, 0));
  const todayLate = fixture("m-today", new Date(2026, 7, 27, 16, 0, 0, 0));
  const yesterday = fixture("m-yest", new Date(2026, 7, 26, 19, 0, 0, 0), "completed");
  const groups = groupMatchesForScheduleTimeline([tomorrow, todayLate, yesterday], now);
  assert.deepEqual(groups.map(group => group.label), ["Yesterday", "Today", "Tomorrow"]);
  assert.deepEqual(groups.map(group => group.matches[0].id), ["m-yest", "m-today", "m-tom"]);
});

test("upcoming, live, and completed matches stay on their scheduled day", () => {
  const upcoming = fixture("u", new Date(2026, 7, 27, 14, 0, 0, 0), "upcoming");
  const live = fixture("l", new Date(2026, 7, 27, 14, 40, 0, 0), "live");
  const completed = fixture("c", new Date(2026, 7, 27, 13, 20, 0, 0), "completed", { teamAScore: 120, teamBScore: 100 });
  const groups = groupMatchesForScheduleTimeline([upcoming, live, completed], now);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].matches.map(item => item.id), ["c", "u", "l"]);
  assert.equal(groups[0].matches[0].teamAScore, 120);
});

test("null scheduledAt goes to Unscheduled and is not given a invented time", () => {
  const dated = fixture("dated", new Date(2026, 7, 27, 14, 0, 0, 0));
  const open = fixture("open", null);
  const groups = groupMatchesForScheduleTimeline([open, dated], now);
  assert.equal(groups.length, 2);
  assert.equal(groups[1].key, UNSCHEDULED_SCHEDULE_KEY);
  assert.equal(groups[1].label, "Unscheduled");
  assert.deepEqual(groups[1].matches.map(item => item.id), ["open"]);
  assert.equal(formatKickoffTime(null), null);
});

test("sort uses timestamps, not formatted strings", () => {
  const nine = fixture("nine", new Date(2026, 7, 27, 9, 0, 0, 0));
  const two = fixture("two", new Date(2026, 7, 27, 14, 0, 0, 0));
  const groups = groupMatchesForScheduleTimeline([two, nine], now);
  assert.deepEqual(groups[0].matches.map(item => item.id), ["nine", "two"]);
  assert.ok((groups[0].matches[0].scheduledAt as Date).getTime() < (groups[0].matches[1].scheduledAt as Date).getTime());
});

test("6+ matches on one day keep timestamp order and are not duplicated", () => {
  const matches = [0, 1, 2, 3, 4, 5].map(index =>
    fixture(`m${index}`, new Date(2026, 7, 27, 14, index * 10, 0, 0)),
  );
  const shuffled = [matches[4], matches[1], matches[5], matches[0], matches[3], matches[2]];
  const groups = groupMatchesForScheduleTimeline(shuffled, now);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].matches.map(item => item.id), ["m0", "m1", "m2", "m3", "m4", "m5"]);
  assert.equal(new Set(groups[0].matches.map(item => item.id)).size, 6);
});

test("long team names are not required for grouping and ids stay unique", () => {
  const match = fixture("long", new Date(2026, 7, 27, 14, 0, 0, 0));
  match.teamAId = "very-long-team-name-id";
  const groups = groupMatchesForScheduleTimeline([match], now);
  assert.equal(groups[0].matches[0].id, "long");
});

test("rescheduling a match moves it to the new local day without duplicating others", () => {
  const kept = fixture("kept", new Date(2026, 7, 27, 15, 0, 0, 0));
  const moved = fixture("moved", new Date(2026, 7, 27, 14, 0, 0, 0));
  const before = groupMatchesForScheduleTimeline([kept, moved], now);
  assert.equal(before.length, 1);
  assert.deepEqual(before[0].matches.map(item => item.id), ["moved", "kept"]);
  const after = groupMatchesForScheduleTimeline([
    kept,
    fixture("moved", new Date(2026, 7, 28, 18, 0, 0, 0)),
  ], now);
  assert.deepEqual(after.map(group => group.label), ["Today", "Tomorrow"]);
  assert.deepEqual(after[0].matches.map(item => item.id), ["kept"]);
  assert.deepEqual(after[1].matches.map(item => item.id), ["moved"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
