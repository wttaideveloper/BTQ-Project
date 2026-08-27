/**
 * Championship match-start popup queue tests.
 *
 * Run with: npx tsx client/src/lib/championship-match-start-popup.test.ts
 */
import assert from "node:assert/strict";
import {
  championshipNameFromCaches,
  dismissMatchStartPopup,
  emptyMatchStartPopupState,
  enqueueMatchStartPopup,
  isAdminAppPath,
  isPublicWatchPath,
  markMatchStartPopupSeen,
  matchStartPopupCopy,
  matchStartPopupIdentity,
  sanitizeChampionshipName,
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
  championshipName: "Giroud Cup",
  teamAName: "Team B",
  teamBName: "Team A",
  role: "admin" as const,
  message: "Team B vs Team A is now LIVE.",
};

const captainEvent = {
  notificationId: "champ-match-start-m1-11",
  matchId: "m1",
  championshipId: "c1",
  championshipName: "Giroud Cup",
  teamAName: "Team B",
  teamBName: "Team A",
  role: "player" as const,
  message: "Team B vs Team A has started. Join now to play.",
};

console.log("championship match-start popup");

test("admin event becomes an admin popup with championship name", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), adminEvent);
  assert.equal(state.current?.role, "admin");
  assert.equal(state.current?.championshipName, "Giroud Cup");
  assert.equal(state.current?.teamAName, "Team B");
  assert.equal(state.current?.teamBName, "Team A");
  assert.equal(state.current?.championshipId, "c1");
  assert.equal(state.current?.matchId, "m1");
});

test("captain event becomes a player popup with championship name", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  assert.equal(state.current?.role, "player");
  assert.equal(state.current?.championshipName, "Giroud Cup");
  assert.match(state.current?.message ?? "", /Join now to play/);
});

test("admin and player copy stay distinct and do not repeat the fixture", () => {
  const admin = matchStartPopupCopy("admin");
  const player = matchStartPopupCopy("player");
  assert.equal(admin.title, "Match Started");
  assert.equal(admin.body, "This match is now live.");
  assert.equal(admin.action, "Open Match");
  assert.equal(admin.dismiss, "Close");
  assert.equal(player.title, "Your Match Is Live!");
  assert.equal(player.body, "Your match has started. Join now to play.");
  assert.equal(player.action, "Join Match");
  assert.equal(player.dismiss, "Later");
  assert.doesNotMatch(admin.body, /vs/i);
  assert.doesNotMatch(player.body, /vs/i);
});

test("missing championship name does not break the popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), {
    ...captainEvent,
    championshipName: undefined,
  });
  assert.equal(state.current?.championshipName, undefined);
  assert.equal(state.current?.teamAName, "Team B");
  assert.ok(state.current);
});

test("UUID and blank championship names are omitted", () => {
  assert.equal(sanitizeChampionshipName(""), undefined);
  assert.equal(sanitizeChampionshipName("   "), undefined);
  assert.equal(sanitizeChampionshipName("9459cd6b-e181-4004-b25f-9afd315a2dcd"), undefined);
  assert.equal(sanitizeChampionshipName(" Bible Trivia Championship 2026 "), "Bible Trivia Championship 2026");
  const longName = `${"International ".repeat(8)}Cup`;
  assert.equal(sanitizeChampionshipName(longName), longName.trim());
});

test("long team names are preserved for the UI to wrap", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), {
    ...captainEvent,
    teamAName: "St. Thomas Mount Super Kings Extra Long",
    teamBName: "Our Lady of Perpetual Help United",
  });
  assert.match(state.current?.teamAName ?? "", /Super Kings/);
  assert.match(state.current?.teamBName ?? "", /Perpetual Help/);
});

test("cache lookup uses the matching championship id", () => {
  assert.equal(championshipNameFromCaches("c1", {
    list: [{ id: "c9", name: "Wrong Cup" }, { id: "c1", name: "Giroud Cup" }],
  }), "Giroud Cup");
  assert.equal(championshipNameFromCaches("c1", {
    detail: { championship: { id: "c1", name: "Detail Cup" } },
  }), "Detail Cup");
  assert.equal(championshipNameFromCaches("c1", {
    dashboard: { championship: { id: "c1", name: "My Cup" } },
  }), "My Cup");
  assert.equal(championshipNameFromCaches("c1", {
    dashboard: { championship: { id: "other", name: "Other Cup" } },
  }), undefined);
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

test("only Watch Live and Overlay suppress the private popup", () => {
  assert.equal(isAdminAppPath("/admin/dashboard"), true);
  assert.equal(shouldSuppressMatchStartPopup(adminEvent, { pathname: "/admin/dashboard" }), false);
  assert.equal(shouldSuppressMatchStartPopup(captainEvent, { pathname: "/my-championship" }), false);
  assert.equal(shouldSuppressMatchStartPopup(adminEvent, { pathname: "/watch/m1" }), true);
  assert.equal(shouldSuppressMatchStartPopup(adminEvent, { pathname: "/overlay/m1" }), true);
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
