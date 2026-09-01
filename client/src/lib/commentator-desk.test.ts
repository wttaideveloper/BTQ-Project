/**
 * Commentator Desk freshness: 15s polling, manual Refresh, live/recent updates.
 *
 * Run with: npx tsx client/src/lib/commentator-desk.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMMENTATOR_DASHBOARD_QUERY_KEY,
  COMMENTATOR_DESK_POLL_MS,
  commentatorDeskLists,
  commentatorDeskVisibleData,
  formatCommentatorDeskUpdatedAt,
  shouldAcceptCommentatorDeskRefresh,
  type CommentatorDeskPayload,
} from "./commentator-desk.ts";

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

const root = process.cwd();
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");
const dashboardSource = read("client/src/pages/CommentatorDashboard.tsx");
const queryClientSource = read("client/src/lib/queryClient.ts");
const gateSource = read("client/src/components/ProtectedRoute.tsx");
const appSource = read("client/src/App.tsx");

const match = (id: string, status: "live" | "upcoming" | "completed") => ({ id, status });

type DeskItem = { id: string; status: string };

const payload = (
  live: DeskItem[],
  upcoming: DeskItem[] = [],
  recent: DeskItem[] = [],
): CommentatorDeskPayload<DeskItem> => ({
  liveMatches: live,
  upcomingMatches: upcoming,
  recentMatches: recent,
});

console.log("commentator desk freshness");

test("A. initial load with no live match shows the empty-live desk, not a live card", () => {
  const initial = commentatorDeskLists(payload([], [match("soon", "upcoming")]));
  assert.equal(initial.hasLiveMatch, false);
  assert.equal(initial.showsNoLiveMatchCurrently, true);
  assert.equal(initial.isEmpty, false);
  assert.match(dashboardSource, /No live match currently/);
  assert.match(dashboardSource, /liveMatches\.length === 0/);
});

test("B. existing dashboard query refetches every 15 seconds", () => {
  assert.equal(COMMENTATOR_DESK_POLL_MS, 15_000);
  assert.deepEqual([...COMMENTATOR_DASHBOARD_QUERY_KEY], ["/api/commentator/dashboard"]);
  assert.match(dashboardSource, /queryKey:\s*\[\s*"\/api\/commentator\/dashboard"\s*\]/);
  assert.match(dashboardSource, /refetchInterval:\s*COMMENTATOR_DESK_POLL_MS/);
  assert.doesNotMatch(dashboardSource, /refetchInterval:\s*(1000|2000|1_000|2_000)\b/);
  assert.match(queryClientSource, /refetchInterval:\s*false/);
  assert.match(queryClientSource, /staleTime:\s*Infinity/);
  assert.equal((queryClientSource.match(/refetchInterval:\s*15_000/g) ?? []).length, 0);
});

test("C. upcoming → live appears after refetch of the same query", () => {
  const before = commentatorDeskLists(payload([], [match("m1", "upcoming")]));
  const after = commentatorDeskLists(payload([match("m1", "live")]));
  assert.equal(before.hasLiveMatch, false);
  assert.equal(before.upcomingMatches[0]?.id, "m1");
  assert.equal(after.hasLiveMatch, true);
  assert.equal(after.liveMatches[0]?.id, "m1");
  assert.match(dashboardSource, /Open match/);
});

test("D. live → completed leaves the live area and is not kept as live", () => {
  const before = commentatorDeskLists(payload([match("m1", "live")]));
  const after = commentatorDeskLists(payload([], [], [match("m1", "completed")]));
  assert.equal(before.hasLiveMatch, true);
  assert.equal(after.hasLiveMatch, false);
  assert.equal(after.showsNoLiveMatchCurrently, true);
  assert.equal(after.recentMatches[0]?.id, "m1");
});

test("E. manual Refresh calls the existing query refetch and does not reload the page", () => {
  assert.match(dashboardSource, /handleRefresh/);
  assert.match(dashboardSource, /await refetch\(\)/);
  assert.match(dashboardSource, /aria-label="Refresh commentator desk"/);
  assert.match(dashboardSource, /RefreshCw/);
  assert.doesNotMatch(dashboardSource, /location\.reload|window\.location\.href|window\.location\.replace/);
});

test("F. multiple Refresh clicks do not start a second request while one is in flight", () => {
  assert.equal(shouldAcceptCommentatorDeskRefresh(false), true);
  assert.equal(shouldAcceptCommentatorDeskRefresh(true), false);
  assert.match(dashboardSource, /shouldAcceptCommentatorDeskRefresh\(refreshInFlightRef\.current\)/);
  assert.match(dashboardSource, /disabled=\{refreshing\}/);
});

test("G. background polling error keeps the last successful data", () => {
  const last = payload([match("m1", "live")]);
  assert.equal(commentatorDeskVisibleData(last, true), last);
  assert.equal(commentatorDeskVisibleData(last, false), last);
  assert.match(dashboardSource, /commentatorDeskVisibleData\(data, isError\)/);
  assert.doesNotMatch(dashboardSource, /if \(isError\) return/);
  assert.doesNotMatch(dashboardSource, /AlertDialog|window\.alert/);
});

test("H. authentication gate is unchanged and the desk query is not extra-disabled", () => {
  assert.match(gateSource, /export function CommentatorGate/);
  assert.match(gateSource, /!user\?\.isCommentator \|\| user\.isAdmin/);
  assert.match(appSource, /CommentatorGate/);
  const queryBlockStart = dashboardSource.indexOf("useQuery<CommentatorDashboardPayload>");
  const queryBlock = dashboardSource.slice(queryBlockStart, queryBlockStart + 700);
  assert.doesNotMatch(queryBlock, /enabled:/);
  assert.match(queryBlock, /refetchInterval:\s*COMMENTATOR_DESK_POLL_MS/);
});

test("I. Recent Results come from the same polled payload after refetch", () => {
  const before = commentatorDeskLists(payload([match("m1", "live")], [], [match("old", "completed")]));
  const after = commentatorDeskLists(payload([], [], [match("m1", "completed"), match("old", "completed")]));
  assert.deepEqual(before.recentMatches.map(item => item.id), ["old"]);
  assert.deepEqual(after.recentMatches.map(item => item.id), ["m1", "old"]);
  assert.match(dashboardSource, /recentMatches/);
  assert.match(dashboardSource, /Recent results/);
  assert.equal((dashboardSource.match(/refetchInterval/g) ?? []).length, 1);
});

test("freshness label uses just-now inside the poll window", () => {
  const now = Date.parse("2026-09-02T00:31:00");
  assert.equal(formatCommentatorDeskUpdatedAt(now - 3_000, now), "Updated just now");
  assert.match(formatCommentatorDeskUpdatedAt(now - 60_000, now) ?? "", /Last updated/);
  assert.equal(formatCommentatorDeskUpdatedAt(0, now), null);
});

test("desk does not subscribe commentators to every match", () => {
  assert.doesNotMatch(dashboardSource, /watch_match/);
  assert.doesNotMatch(dashboardSource, /sendGameEvent/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
