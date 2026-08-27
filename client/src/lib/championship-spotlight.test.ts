/**
 * Admin Next Match / Live Match spotlight selection tests.
 *
 * Run with: npx tsx client/src/lib/championship-spotlight.test.ts
 */
import assert from "node:assert/strict";
import {
  formatKickoffSpotlight,
  isMatchReadyToStart,
  matchDisplayState,
  pickAdminMatchSpotlight,
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

const fixture = (
  id: string,
  scheduledAt: Date | string | null,
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

console.log("championship admin match spotlight");

test("no matches → empty", () => {
  assert.deepEqual(pickAdminMatchSpotlight([]), { type: "empty" });
});

test("only completed matches → all-completed", () => {
  const spotlight = pickAdminMatchSpotlight([
    fixture("c1", new Date(2026, 7, 26, 14, 0, 0, 0), "completed"),
    fixture("c2", new Date(2026, 7, 27, 10, 0, 0, 0), "completed"),
  ]);
  assert.equal(spotlight.type, "all-completed");
});

test("live match wins priority over earlier upcoming", () => {
  const upcoming = fixture("u", new Date(2026, 7, 27, 14, 0, 0, 0), "upcoming");
  const live = fixture("l", new Date(2026, 7, 27, 13, 0, 0, 0), "live", {
    startedAt: new Date(2026, 7, 27, 13, 5, 0, 0),
    teamAScore: 120,
    teamBScore: 100,
  });
  const spotlight = pickAdminMatchSpotlight([upcoming, live]);
  assert.equal(spotlight.type, "live");
  if (spotlight.type === "live") assert.equal(spotlight.match.id, "l");
});

test("earliest upcoming by actual timestamp is selected, not matches[0]", () => {
  const later = fixture("later", new Date(2026, 7, 27, 16, 0, 0, 0));
  const earlier = fixture("earlier", new Date(2026, 7, 27, 14, 40, 0, 0));
  const spotlight = pickAdminMatchSpotlight([later, earlier]);
  assert.equal(spotlight.type, "next");
  if (spotlight.type === "next") assert.equal(spotlight.match.id, "earlier");
});

test("completed matches are ignored when selecting next", () => {
  const done = fixture("done", new Date(2026, 7, 27, 10, 0, 0, 0), "completed");
  const next = fixture("next", new Date(2026, 7, 27, 15, 20, 0, 0));
  const spotlight = pickAdminMatchSpotlight([done, next]);
  assert.equal(spotlight.type, "next");
  if (spotlight.type === "next") assert.equal(spotlight.match.id, "next");
});

test("null scheduledAt is skipped when a dated upcoming exists", () => {
  const undated = fixture("open", null);
  const dated = fixture("dated", new Date(2026, 7, 29, 18, 0, 0, 0));
  const spotlight = pickAdminMatchSpotlight([undated, dated]);
  assert.equal(spotlight.type, "next");
  if (spotlight.type === "next") assert.equal(spotlight.match.id, "dated");
});

test("only undated upcoming is selected and formatKickoffSpotlight invents no time", () => {
  const undated = fixture("open", null);
  const spotlight = pickAdminMatchSpotlight([undated]);
  assert.equal(spotlight.type, "next");
  if (spotlight.type === "next") {
    assert.equal(spotlight.match.id, "open");
    assert.equal(formatKickoffSpotlight(spotlight.match.scheduledAt), null);
  }
});

test("sort uses timestamps, not formatted strings", () => {
  const nine = fixture("nine", new Date(2026, 7, 27, 9, 0, 0, 0));
  const twoPm = fixture("two", new Date(2026, 7, 27, 14, 0, 0, 0));
  const spotlight = pickAdminMatchSpotlight([twoPm, nine]);
  assert.equal(spotlight.type, "next");
  if (spotlight.type === "next") assert.equal(spotlight.match.id, "nine");
});

test("same scheduledAt is deterministic by match id", () => {
  const when = new Date(2026, 7, 27, 14, 40, 0, 0);
  const b = fixture("m-b", when);
  const a = fixture("m-a", when);
  const spotlight = pickAdminMatchSpotlight([b, a]);
  assert.equal(spotlight.type, "next");
  if (spotlight.type === "next") assert.equal(spotlight.match.id, "m-a");
});

test("live + upcoming still returns the live match", () => {
  const live = fixture("live", new Date(2026, 7, 27, 14, 0, 0, 0), "live");
  const next = fixture("next", new Date(2026, 7, 27, 15, 20, 0, 0));
  const extra = fixture("extra", new Date(2026, 7, 27, 16, 0, 0, 0));
  const spotlight = pickAdminMatchSpotlight([extra, live, next]);
  assert.equal(spotlight.type, "live");
  if (spotlight.type === "live") assert.equal(spotlight.match.id, "live");
});

test("upcoming → live after refreshed data", () => {
  const id = "m1";
  const when = new Date(2026, 7, 27, 14, 40, 0, 0);
  const before = pickAdminMatchSpotlight([fixture(id, when, "upcoming")]);
  const after = pickAdminMatchSpotlight([fixture(id, when, "live", { startedAt: when })]);
  assert.equal(before.type, "next");
  assert.equal(after.type, "live");
});

test("completed live → next upcoming after refreshed data", () => {
  const when = new Date(2026, 7, 27, 14, 40, 0, 0);
  const later = new Date(2026, 7, 27, 15, 20, 0, 0);
  const before = pickAdminMatchSpotlight([
    fixture("live", when, "live"),
    fixture("next", later),
  ]);
  const after = pickAdminMatchSpotlight([
    fixture("live", when, "completed"),
    fixture("next", later),
  ]);
  assert.equal(before.type, "live");
  assert.equal(after.type, "next");
  if (after.type === "next") assert.equal(after.match.id, "next");
});

test("ready-to-start uses existing helper, not a new status", () => {
  const past = fixture("ready", new Date(2026, 7, 27, 10, 0, 0, 0), "upcoming");
  const now = new Date(2026, 7, 27, 12, 0, 0, 0).getTime();
  assert.equal(past.status, "upcoming");
  assert.equal(isMatchReadyToStart(past, now), true);
  assert.equal(matchDisplayState(past, now), "ready");
  const spotlight = pickAdminMatchSpotlight([past]);
  assert.equal(spotlight.type, "next");
});

test("formatKickoffSpotlight uses Today / Tomorrow / month day with local wall clock", () => {
  const now = new Date(2026, 7, 27, 12, 0, 0, 0);
  const today = formatKickoffSpotlight(new Date(2026, 7, 27, 14, 40, 0, 0), now);
  const tomorrow = formatKickoffSpotlight(new Date(2026, 7, 28, 18, 0, 0, 0), now);
  const later = formatKickoffSpotlight(new Date(2026, 7, 29, 18, 0, 0, 0), now);
  assert.ok(today?.startsWith("Today · "));
  assert.ok(tomorrow?.startsWith("Tomorrow · "));
  assert.ok(later?.startsWith("Aug 29 · "));
  assert.equal(formatKickoffSpotlight(null, now), null);
});

test("rescheduling the current next match later lets an earlier sibling become next", () => {
  const first = fixture("first", new Date(2026, 7, 27, 14, 0, 0, 0));
  const second = fixture("second", new Date(2026, 7, 27, 15, 0, 0, 0));
  const before = pickAdminMatchSpotlight([first, second]);
  const after = pickAdminMatchSpotlight([
    fixture("first", new Date(2026, 7, 27, 16, 0, 0, 0)),
    second,
  ]);
  assert.equal(before.type, "next");
  if (before.type === "next") assert.equal(before.match.id, "first");
  assert.equal(after.type, "next");
  if (after.type === "next") assert.equal(after.match.id, "second");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
