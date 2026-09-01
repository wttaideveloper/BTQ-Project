/**
 * Championship Auto Schedule planner tests.
 *
 * Run with: npx tsx server/championship-schedule.test.ts
 */
import assert from "node:assert/strict";
import {
  AUTO_SCHEDULE_DEFAULTS,
  END_DATE_OVERFLOW_MESSAGE,
  INVALID_REST_MESSAGE,
  MIN_TEAMS_MESSAGE,
  PAST_START_MESSAGE,
  SKIPPED_REASON,
  buildRoundRobinSchedule,
  pairingKey,
  possibleMatchCount,
  roundRobinPairs,
  sortTeams,
  type ExistingMatch,
  type PlannedMatch,
  type ScheduleTeam,
} from "./championship-schedule.ts";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (error) { failed += 1; console.error(`  FAIL  ${name}`); console.error(error); }
}

const at = (year: number, month: number, day: number, hour = 18, minute = 0) => new Date(year, month, day, hour, minute, 0, 0);
const team = (id: string, name: string, createdAt: Date): ScheduleTeam => ({ id, name, createdAt });
const teams = (...items: ScheduleTeam[]) => items;
const A = team("a", "Team A", at(2026, 0, 1));
const B = team("b", "Team B", at(2026, 0, 2));
const C = team("c", "Team C", at(2026, 0, 3));
const D = team("d", "Team D", at(2026, 0, 4));
const E = team("e", "Team E", at(2026, 0, 5));
const start = at(2026, 7, 25, 12, 0);
const now = at(2026, 7, 24, 12, 0);

function plan(inputTeams: ScheduleTeam[], existing: ExistingMatch[] = [], extra: Partial<Parameters<typeof buildRoundRobinSchedule>[2]> = {}) {
  return buildRoundRobinSchedule(inputTeams, existing, {
    startAt: start,
    minimumTeamRestMinutes: 30,
    matchesPerDay: 6,
    now,
    ...extra,
  });
}

function assertMinimumRest(matches: PlannedMatch[], restMinutes: number, existing: ExistingMatch[] = []) {
  const byTeam = new Map<string, number[]>();
  for (const match of [...existing, ...matches]) {
    if (!match.scheduledAt) continue;
    const value = new Date(match.scheduledAt).getTime();
    for (const id of [match.teamAId, match.teamBId]) byTeam.set(id, [...(byTeam.get(id) ?? []), value]);
  }
  for (const times of byTeam.values()) {
    times.sort((a, b) => a - b);
    for (let index = 1; index < times.length; index++) {
      assert.ok(times[index] - times[index - 1] >= restMinutes * 60_000, "team rest was violated");
    }
  }
}

console.log("championship auto schedule");

test("defaults expose minimum rest and no match duration", () => {
  assert.equal("durationMinutes" in AUTO_SCHEDULE_DEFAULTS, false);
  assert.equal("breakMinutes" in AUTO_SCHEDULE_DEFAULTS, false);
  assert.equal(AUTO_SCHEDULE_DEFAULTS.minimumTeamRestMinutes, 30);
});

test("round robin creates every fixture exactly once without self matches", () => {
  const result = plan(teams(A, B, C, D));
  assert.equal(possibleMatchCount(4), 6);
  assert.equal(result.matches.length, 6);
  assert.equal(new Set(result.matches.map(match => pairingKey(match.teamAId, match.teamBId))).size, 6);
  assert.ok(result.matches.every(match => match.teamAId !== match.teamBId));
  assert.ok(roundRobinPairs(teams(A, B, C, D)).every(([left, right]) => left.id !== right.id));
});

test("team rosters do not affect fixture generation (1v1, 2v2, and 3v3 teams)", () => {
  const oneVOne = plan(teams(A, B));
  const twoVTwo = plan(teams({ ...A, memberIds: [1, 2] } as ScheduleTeam, { ...B, memberIds: [3, 4] } as ScheduleTeam));
  const threeVThree = plan(teams({ ...A, memberIds: [1, 2, 3] } as ScheduleTeam, { ...B, memberIds: [4, 5, 6] } as ScheduleTeam));
  assert.equal(oneVOne.matches.length, 1);
  assert.deepEqual(twoVTwo.matches.map(match => pairingKey(match.teamAId, match.teamBId)), oneVOne.matches.map(match => pairingKey(match.teamAId, match.teamBId)));
  assert.deepEqual(threeVThree.matches.map(match => pairingKey(match.teamAId, match.teamBId)), oneVOne.matches.map(match => pairingKey(match.teamAId, match.teamBId)));
});

test("fair ordering avoids a consecutive team when another fixture is available", () => {
  const result = plan(teams(A, B, C, D));
  assert.deepEqual(result.matches.map(match => `${match.teamAId}${match.teamBId}`), ["ab", "cd", "ac", "bd", "ad", "bc"]);
  for (let index = 1; index < result.matches.length; index++) {
    const previous = result.matches[index - 1];
    const current = result.matches[index];
    const alternatives = result.matches.slice(index).filter(match =>
      match.teamAId !== previous.teamAId && match.teamAId !== previous.teamBId
      && match.teamBId !== previous.teamAId && match.teamBId !== previous.teamBId,
    );
    if (alternatives.length) {
      assert.notEqual([current.teamAId, current.teamBId].some(id => id === previous.teamAId || id === previous.teamBId), true);
    }
  }
});

test("minimum rest is a hard constraint and first match uses the requested time", () => {
  const result = plan(teams(A, B, C, D));
  assert.equal(result.matches[0].scheduledAt.getTime(), start.getTime());
  assertMinimumRest(result.matches, 30);
  assert.deepEqual(result.matches.map(match => match.scheduledAt.getTime()), [0, 30, 60, 90, 120, 150].map(minutes => start.getTime() + minutes * 60_000));
});

test("existing fixtures are skipped and contribute to team availability", () => {
  const existingAt = at(2026, 7, 25, 12, 0);
  const existing: ExistingMatch[] = [{ teamAId: A.id, teamBId: B.id, scheduledAt: existingAt, status: "upcoming" }];
  const result = plan(teams(A, B, C), existing, { startAt: existingAt });
  assert.equal(result.summary.skippedMatches, 1);
  assert.equal(result.skipped[0].reason, SKIPPED_REASON);
  assert.ok(result.matches.every(match => pairingKey(match.teamAId, match.teamBId) !== pairingKey(A.id, B.id)));
  assertMinimumRest(result.matches, 30, existing);
});

test("completed and live fixtures are never regenerated or modified", () => {
  const existing: ExistingMatch[] = [
    { teamAId: A.id, teamBId: B.id, scheduledAt: start, status: "completed" },
    { teamAId: C.id, teamBId: D.id, scheduledAt: at(2026, 7, 25, 13), status: "live" },
  ];
  const result = plan(teams(A, B, C, D), existing);
  assert.equal(result.summary.skippedMatches, 2);
  assert.ok(result.matches.every(match => ![pairingKey(A.id, B.id), pairingKey(C.id, D.id)].includes(pairingKey(match.teamAId, match.teamBId))));
});

test("matches per day is a maximum and rolls remaining fixtures to the next day", () => {
  const result = plan(teams(A, B, C, D), [], { matchesPerDay: 2 });
  assert.deepEqual(result.matches.map(match => match.scheduledAt.getDate()), [25, 25, 26, 26, 27, 27]);
  assert.deepEqual(result.matches.map(match => match.scheduledAt.getHours()), [12, 12, 12, 12, 12, 12]);
  assertMinimumRest(result.matches, 30);
});

test("an existing fixture counts against the daily match limit", () => {
  const existing: ExistingMatch[] = [{ teamAId: A.id, teamBId: B.id, scheduledAt: at(2026, 7, 25, 14), status: "upcoming" }];
  const result = plan(teams(A, B, C), existing, { matchesPerDay: 2 });
  assert.equal(result.matches[0].scheduledAt.getDate(), 25);
  assert.equal(result.matches[1].scheduledAt.getDate(), 26);
});

test("the same input always produces the same result and team sorting remains stable", () => {
  const lateA = team("z", "Zeta", at(2026, 0, 10));
  const earlyB = team("y", "Alpha", at(2026, 0, 1));
  assert.deepEqual(sortTeams([lateA, earlyB]).map(item => item.id), ["y", "z"]);
  const first = plan(teams(A, B, C, D));
  const second = plan(teams(D, C, B, A));
  assert.deepEqual(first.matches.map(match => [match.teamAId, match.teamBId, match.scheduledAt.getTime()]), second.matches.map(match => [match.teamAId, match.teamBId, match.scheduledAt.getTime()]));
});

test("minimum rest is applied across midnight and the daily window", () => {
  const lateStart = at(2026, 7, 25, 23, 45);
  const result = plan(teams(A, B, C, D), [], { startAt: lateStart, minimumTeamRestMinutes: 30, matchesPerDay: 6 });
  assert.equal(result.matches[0].scheduledAt.getTime(), lateStart.getTime());
  assert.ok(result.matches.some(match => match.scheduledAt.getDate() === 26));
  assertMinimumRest(result.matches, 30);
});

test("invalid rest, insufficient teams, past start, and end-date overflow are rejected", () => {
  assert.ok(plan(teams(A, B), [], { minimumTeamRestMinutes: -1 }).errors.includes(INVALID_REST_MESSAGE));
  assert.ok(plan(teams(A), []).errors.includes(MIN_TEAMS_MESSAGE));
  assert.ok(plan(teams(A, B), [], { startAt: at(2026, 7, 23, 18), now }).errors.includes(PAST_START_MESSAGE));
  assert.deepEqual(plan(teams(A, B, C), [], { matchesPerDay: 1, endDate: at(2026, 7, 25) }).errors, [END_DATE_OVERFLOW_MESSAGE]);
});

test("legacy breakMinutes remains safely accepted for existing API callers", () => {
  const result = buildRoundRobinSchedule(teams(A, B), [], {
    startAt: start, breakMinutes: 10, matchesPerDay: 1, now,
  });
  assert.equal(result.errors.length, 0);
  assert.equal(result.summary.minimumTeamRestMinutes, 10);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
