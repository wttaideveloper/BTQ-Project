/**
 * Championship match-start popup queue tests.
 *
 * Run with: npx tsx client/src/lib/championship-match-start-popup.test.ts
 */
import assert from "node:assert/strict";
import {
  dismissMatchStartPopup,
  emptyMatchStartPopupState,
  enqueueMatchStartPopup,
  isAdminAppPath,
  isPublicWatchPath,
  markMatchStartPopupSeen,
  matchStartPopupIdentity,
  shouldSuppressMatchStartPopup,
} from "./championship-match-start-popup.ts";

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

const adminEvent = {
  notificationId: "champ-match-start-m1-1",
  matchId: "m1",
  championshipId: "c1",
  teamAName: "Team B",
  teamBName: "Team A",
  role: "admin" as const,
  message: "Team B vs Team A is now LIVE.",
};

const captainEvent = {
  notificationId: "champ-match-start-m1-11",
  matchId: "m1",
  championshipId: "c1",
  teamAName: "Team B",
  teamBName: "Team A",
  role: "player" as const,
  message: "Team B vs Team A has started. Join now to play.",
};

console.log("championship match-start popup");

test("admin event becomes an admin popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), adminEvent);
  assert.equal(state.current?.role, "admin");
  assert.equal(state.current?.message, "Team B vs Team A is now LIVE.");
  assert.equal(state.current?.championshipId, "c1");
  assert.equal(state.current?.matchId, "m1");
});

test("captain event becomes a player popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  assert.equal(state.current?.role, "player");
  assert.match(state.current?.message ?? "", /Join now to play/);
});

test("one event produces one popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), adminEvent);
  assert.equal(state.queue.length, 0);
  assert.ok(state.current);
});

test("duplicate event does not create a second popup", () => {
  const first = enqueueMatchStartPopup(emptyMatchStartPopupState(), adminEvent);
  const second = enqueueMatchStartPopup(first, adminEvent);
  assert.equal(second.current?.id, first.current?.id);
  assert.equal(second.queue.length, 0);
  assert.equal(second.seen.length, 1);
});

test("a later match is queued instead of stacking", () => {
  const first = enqueueMatchStartPopup(emptyMatchStartPopupState(), adminEvent);
  const second = enqueueMatchStartPopup(first, { ...adminEvent, notificationId: "champ-match-start-m2-1", matchId: "m2" });
  assert.equal(second.current?.matchId, "m1");
  assert.equal(second.queue.length, 1);
  assert.equal(second.queue[0].matchId, "m2");
  const afterDismiss = dismissMatchStartPopup(second);
  assert.equal(afterDismiss.current?.matchId, "m2");
  assert.equal(afterDismiss.queue.length, 0);
});

test("Later/Close dismisses the current popup", () => {
  const afterDismiss = dismissMatchStartPopup(enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent));
  assert.equal(afterDismiss.current, null);
});

test("Watch Live and Overlay paths are public spectator routes", () => {
  assert.equal(isPublicWatchPath("/watch/m1"), true);
  assert.equal(isPublicWatchPath("/overlay/m1"), true);
  assert.equal(isPublicWatchPath("/admin/dashboard"), false);
  assert.equal(isPublicWatchPath("/my-championship"), false);
});

test("admin app paths never show the match-start popup", () => {
  assert.equal(isAdminAppPath("/admin"), true);
  assert.equal(isAdminAppPath("/admin/dashboard"), true);
  assert.equal(isAdminAppPath("/admin/login"), true);
  assert.equal(isAdminAppPath("/my-championship"), false);
  assert.equal(shouldSuppressMatchStartPopup(adminEvent, { pathname: "/admin/dashboard", liveDeskPresent: false }), true);
  assert.equal(shouldSuppressMatchStartPopup(captainEvent, { pathname: "/admin/dashboard", liveDeskPresent: false }), true);
  assert.equal(shouldSuppressMatchStartPopup(captainEvent, { pathname: "/my-championship", liveDeskPresent: false }), false);
  assert.equal(shouldSuppressMatchStartPopup(adminEvent, { pathname: "/watch/m1", liveDeskPresent: false }), true);
});

test("suppressed popups are still marked seen so reconnect does not replay them", () => {
  const state = markMatchStartPopupSeen(emptyMatchStartPopupState(), "champ-match-start-m1-1");
  const replay = enqueueMatchStartPopup(state, adminEvent);
  assert.equal(replay.current, null);
  assert.equal(replay.seen.length, 1);
});

test("popup identity prefers the deterministic notification id", () => {
  assert.equal(matchStartPopupIdentity(adminEvent), "champ-match-start-m1-1");
  assert.equal(matchStartPopupIdentity({ matchId: "m1" }), "match:m1");
  assert.equal(matchStartPopupIdentity({}), null);
});

test("unrelated empty events are ignored", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), {});
  assert.equal(state.current, null);
  assert.equal(state.queue.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
