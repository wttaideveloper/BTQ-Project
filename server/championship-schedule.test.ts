/**
 * Championship Auto Schedule planner tests.
 *
 * Run with: npx tsx server/championship-schedule.test.ts
 */
import assert from "node:assert/strict";
import {
  END_DATE_OVERFLOW_MESSAGE,
  MIN_TEAMS_MESSAGE,
  PAST_START_MESSAGE,
  SKIPPED_REASON,
  buildRoundRobinSchedule,
  pairingKey,
  possibleMatchCount,
  roundRobinPairs,
  sortTeams,
  type ExistingMatch,
  type ScheduleTeam,
} from "./championship-schedule.ts";

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

const at = (year: number, month: number, day: number, hour = 18, minute = 0) =>
  new Date(year, month, day, hour, minute, 0, 0);

const team = (id: string, name: string, createdAt: Date): ScheduleTeam => ({ id, name, createdAt });

const teams = (...items: ScheduleTeam[]) => items;
const A = team("a", "Team A", at(2026, 0, 1));
const B = team("b", "Team B", at(2026, 0, 2));
const C = team("c", "Team C", at(2026, 0, 3));
const D = team("d", "Team D", at(2026, 0, 4));
const E = team("e", "Team E", at(2026, 0, 5));

const start = at(2026, 7, 25, 18, 0);
const now = at(2026, 7, 24, 12, 0);

function plan(inputTeams: ScheduleTeam[], existing: ExistingMatch[] = [], extra: Partial<Parameters<typeof buildRoundRobinSchedule>[2]> = {}) {
  return buildRoundRobinSchedule(inputTeams, existing, {
    startAt: start,
    durationMinutes: 30,
    breakMinutes: 10,
    matchesPerDay: 1,
    now,
    ...extra,
  });
}

console.log("championship auto schedule");

test("2 teams → 1 match", () => {
  const result = plan(teams(A, B));
  assert.equal(possibleMatchCount(2), 1);
  assert.equal(result.summary.possibleMatches, 1);
  assert.equal(result.matches.length, 1);
  assert.equal(result.errors.length, 0);
});

test("3 teams → 3 matches", () => {
  const result = plan(teams(A, B, C));
  assert.equal(possibleMatchCount(3), 3);
  assert.equal(result.matches.length, 3);
});

test("4 teams → 6 matches", () => {
  const result = plan(teams(A, B, C, D));
  assert.equal(possibleMatchCount(4), 6);
  assert.equal(result.matches.length, 6);
});

test("5 teams → 10 matches", () => {
  const result = plan(teams(A, B, C, D, E));
  assert.equal(possibleMatchCount(5), 10);
  assert.equal(result.matches.length, 10);
});

test("no self-pairing", () => {
  const result = plan(teams(A, B, C, D));
  for (const match of result.matches) {
    assert.notEqual(match.teamAId, match.teamBId);
  }
  for (const pair of roundRobinPairs(teams(A, B, C, D))) {
    assert.notEqual(pair[0].id, pair[1].id);
  }
});

test("deterministic ordering uses createdAt then id", () => {
  const lateA = team("z", "Zeta", at(2026, 0, 10));
  const earlyB = team("y", "Alpha", at(2026, 0, 1));
  const sorted = sortTeams([lateA, earlyB]);
  assert.equal(sorted[0].id, "y");
  assert.equal(sorted[1].id, "z");

  const first = plan([lateA, earlyB]).matches[0];
  const second = plan([earlyB, lateA]).matches[0];
  assert.equal(first.teamAId, second.teamAId);
  assert.equal(first.teamBId, second.teamBId);
  assert.equal(first.teamAId, "y");
  assert.equal(first.teamBId, "z");
});

test("existing A-B skipped", () => {
  const result = plan(teams(A, B, C), [{ teamAId: A.id, teamBId: B.id }]);
  assert.equal(result.summary.skippedMatches, 1);
  assert.equal(result.summary.newMatches, 2);
  assert.equal(result.skipped[0].reason, SKIPPED_REASON);
  assert.equal(pairingKey(A.id, B.id), pairingKey(B.id, A.id));
  assert.ok(result.matches.every(match => pairingKey(match.teamAId, match.teamBId) !== pairingKey(A.id, B.id)));
});

test("existing B-A skipped", () => {
  const result = plan(teams(A, B, C), [{ teamAId: B.id, teamBId: A.id }]);
  assert.equal(result.summary.skippedMatches, 1);
  assert.equal(result.summary.newMatches, 2);
  assert.ok(result.matches.every(match => pairingKey(match.teamAId, match.teamBId) !== pairingKey(A.id, B.id)));
});

test("completed match counts as existing", () => {
  const result = plan(teams(A, B), [{ teamAId: A.id, teamBId: B.id }]);
  assert.equal(result.matches.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.errors.length, 0);
});

test("upcoming match counts as existing", () => {
  const result = plan(teams(A, B, C, D), [{ teamAId: C.id, teamBId: D.id }]);
  assert.equal(result.summary.possibleMatches, 6);
  assert.equal(result.summary.skippedMatches, 1);
  assert.equal(result.summary.newMatches, 5);
});

test("duration + break calculation", () => {
  const result = plan(teams(A, B, C, D), [], { matchesPerDay: 4, durationMinutes: 30, breakMinutes: 10 });
  assert.equal(result.matches[0].scheduledAt.getTime(), at(2026, 7, 25, 18, 0).getTime());
  assert.equal(result.matches[1].scheduledAt.getTime(), at(2026, 7, 25, 18, 40).getTime());
  assert.equal(result.matches[2].scheduledAt.getTime(), at(2026, 7, 25, 19, 20).getTime());
  assert.equal(result.matches[3].scheduledAt.getTime(), at(2026, 7, 25, 20, 0).getTime());
});

test("matches-per-day keeps the same clock time", () => {
  const result = plan(teams(A, B, C), [], { matchesPerDay: 1 });
  assert.equal(result.matches[0].scheduledAt.getTime(), at(2026, 7, 25, 18, 0).getTime());
  assert.equal(result.matches[1].scheduledAt.getTime(), at(2026, 7, 26, 18, 0).getTime());
  assert.equal(result.matches[2].scheduledAt.getTime(), at(2026, 7, 27, 18, 0).getTime());
});

test("next-day rollover after filling a day", () => {
  const result = plan(teams(A, B, C, D), [], { matchesPerDay: 3, durationMinutes: 30, breakMinutes: 10 });
  assert.equal(result.matches.length, 6);
  assert.equal(result.matches[0].scheduledAt.getTime(), at(2026, 7, 25, 18, 0).getTime());
  assert.equal(result.matches[1].scheduledAt.getTime(), at(2026, 7, 25, 18, 40).getTime());
  assert.equal(result.matches[2].scheduledAt.getTime(), at(2026, 7, 25, 19, 20).getTime());
  assert.equal(result.matches[3].scheduledAt.getTime(), at(2026, 7, 26, 18, 0).getTime());
  assert.equal(result.matches[4].scheduledAt.getTime(), at(2026, 7, 26, 18, 40).getTime());
  assert.equal(result.matches[5].scheduledAt.getTime(), at(2026, 7, 26, 19, 20).getTime());
});

test("end-date overflow returns no matches", () => {
  const result = plan(teams(A, B, C), [], { matchesPerDay: 1, endDate: at(2026, 7, 26) });
  assert.deepEqual(result.errors, [END_DATE_OVERFLOW_MESSAGE]);
  assert.equal(result.matches.length, 0);
  assert.equal(result.summary.newMatches, 0);
});

test("past start time is rejected", () => {
  const result = plan(teams(A, B), [], { startAt: at(2026, 7, 23, 18, 0), now: at(2026, 7, 24, 12, 0) });
  assert.ok(result.errors.includes(PAST_START_MESSAGE));
  assert.equal(result.matches.length, 0);
});

test("zero remaining matches is not an error", () => {
  const result = plan(teams(A, B), [{ teamAId: B.id, teamBId: A.id }]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.matches.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, SKIPPED_REASON);
});

test("fewer than two teams is an error", () => {
  const result = plan(teams(A));
  assert.ok(result.errors.includes(MIN_TEAMS_MESSAGE));
  assert.equal(result.matches.length, 0);
  assert.equal(possibleMatchCount(0), 0);
  assert.equal(possibleMatchCount(1), 0);
});

test("a match on the championship end date is allowed", () => {
  const result = plan(teams(A, B), [], { matchesPerDay: 1, endDate: at(2026, 7, 25) });
  assert.equal(result.errors.length, 0);
  assert.equal(result.matches.length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
