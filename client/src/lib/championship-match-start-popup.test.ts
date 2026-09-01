/**
 * Championship match-start popup queue tests.
 *
 * Run with: npx tsx client/src/lib/championship-match-start-popup.test.ts
 */
import assert from "node:assert/strict";
import {
  championshipMatchIdFromLifecycleEvent,
  championshipNameFromCaches,
  clearMatchStartPopupForMatch,
  dismissMatchStartPopup,
  emptyMatchStartPopupState,
  enqueueMatchStartPopup,
  isAdminAppPath,
  isPlayerMatchStartRecipient,
  isPublicWatchPath,
  markMatchStartPopupSeen,
  matchStartPopupCopy,
  matchStartPopupIdentity,
  matchStatusFromChampionshipCaches,
  sanitizeChampionshipName,
  shouldHideMatchStartPopupOnPath,
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

const memberEvent = {
  notificationId: "champ-match-start-m1-13",
  matchId: "m1",
  championshipId: "c1",
  championshipName: "Giroud Cup",
  teamAName: "Team B",
  teamBName: "Team A",
  role: "player" as const,
  message: "Team B vs Team A has started. Join now to play.",
};

const unrelatedPlayerEvent = {
  notificationId: "champ-match-start-m1-99",
  matchId: "m1",
  championshipId: "c1",
  role: "spectator" as const,
  teamAName: "Team B",
  teamBName: "Team A",
};

console.log("championship match-start popup");

test("player receives match-start popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  assert.equal(state.current?.role, "player");
  assert.equal(state.current?.matchId, "m1");
  assert.equal(state.current?.championshipName, "Giroud Cup");
});

test("team captain receives popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  assert.equal(state.current?.role, "player");
  assert.match(state.current?.message ?? "", /Join now to play/);
});

test("team member receives popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), memberEvent);
  assert.equal(state.current?.role, "player");
  assert.equal(state.current?.id, "champ-match-start-m1-13");
});

test("unrelated player does not receive popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), unrelatedPlayerEvent);
  assert.equal(state.current, null);
  assert.equal(state.queue.length, 0);
});

test("admin does not receive the actionable popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), adminEvent);
  assert.equal(state.current, null);
  assert.equal(state.queue.length, 0);
  assert.ok(state.seen.includes("champ-match-start-m1-1"));
  assert.ok(state.seen.includes("match:m1"));
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
  assert.equal(championshipNameFromCaches(undefined, {
    dashboard: { championship: { id: "c1", name: "My Cup" } },
  }), "My Cup");
});

test("one event produces one popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  assert.equal(state.queue.length, 0);
  assert.ok(state.current);
});

test("duplicate event does not create a second popup", () => {
  const first = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const second = enqueueMatchStartPopup(first, captainEvent);
  assert.equal(second.current?.id, first.current?.id);
  assert.equal(second.queue.length, 0);
  assert.deepEqual(second.seen, ["champ-match-start-m1-11", "match:m1"]);
});

test("the same match does not queue twice under different identities", () => {
  const first = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const replay = enqueueMatchStartPopup(first, {
    matchId: "m1",
    role: "player",
    teamAName: "Team B",
    teamBName: "Team A",
  });
  assert.equal(replay.queue.length, 0);
  assert.equal(replay.current?.id, first.current?.id);
});

test("a later match is queued instead of stacking", () => {
  const first = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const second = enqueueMatchStartPopup(first, { ...captainEvent, notificationId: "champ-match-start-m2-11", matchId: "m2" });
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

test("Watch Live, Overlay, and Admin UI hide the private popup", () => {
  assert.equal(isPublicWatchPath("/watch/m1"), true);
  assert.equal(isPublicWatchPath("/overlay/m1"), true);
  assert.equal(isPublicWatchPath("/admin/dashboard"), false);
  assert.equal(isPublicWatchPath("/my-championship"), false);
  assert.equal(isAdminAppPath("/admin/dashboard"), true);
  assert.equal(shouldHideMatchStartPopupOnPath("/admin/dashboard"), true);
  assert.equal(shouldHideMatchStartPopupOnPath("/my-championship"), false);
  assert.equal(shouldHideMatchStartPopupOnPath("/watch/m1"), true);
});

test("only participating players enqueue a popup; admins and spectator paths do not", () => {
  assert.equal(isPlayerMatchStartRecipient("player"), true);
  assert.equal(isPlayerMatchStartRecipient("admin"), false);
  assert.equal(shouldSuppressMatchStartPopup(captainEvent, { pathname: "/my-championship" }), false);
  assert.equal(shouldSuppressMatchStartPopup(adminEvent, { pathname: "/admin/dashboard" }), true);
  assert.equal(shouldSuppressMatchStartPopup(adminEvent, { pathname: "/my-championship" }), true);
  assert.equal(shouldSuppressMatchStartPopup(captainEvent, { pathname: "/watch/m1" }), true);
  assert.equal(shouldSuppressMatchStartPopup(captainEvent, { pathname: "/overlay/m1" }), true);
  assert.equal(shouldSuppressMatchStartPopup(captainEvent, { pathname: "/admin/dashboard" }), false);
});

test("suppressed popups are still marked seen so reconnect does not replay them", () => {
  const state = markMatchStartPopupSeen(emptyMatchStartPopupState(), "champ-match-start-m1-11");
  const replay = enqueueMatchStartPopup(state, captainEvent);
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

test("match starts then popup is shown", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  assert.equal(state.current?.matchId, "m1");
  assert.equal(state.current?.role, "player");
  assert.equal(state.current?.id, "champ-match-start-m1-11");
});

test("match ends while popup is showing then popup closes", () => {
  const shown = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const closed = clearMatchStartPopupForMatch(shown, "m1");
  assert.equal(closed.current, null);
  assert.equal(closed.queue.length, 0);
  assert.ok(closed.seen.includes("match:m1"));
  assert.ok(closed.seen.includes("champ-match-start-m1-11"));
});

test("match ends while popup is queued then queued popup is removed", () => {
  const first = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const queued = enqueueMatchStartPopup(first, { ...captainEvent, notificationId: "champ-match-start-m2-11", matchId: "m2" });
  assert.equal(queued.current?.matchId, "m1");
  assert.equal(queued.queue[0].matchId, "m2");
  const afterM2Ends = clearMatchStartPopupForMatch(queued, "m2");
  assert.equal(afterM2Ends.current?.matchId, "m1");
  assert.equal(afterM2Ends.queue.length, 0);
});

test("completed match notification replay does not show a popup", () => {
  const replay = enqueueMatchStartPopup(emptyMatchStartPopupState(), {
    ...captainEvent,
    matchStatus: "completed",
  });
  assert.equal(replay.current, null);
  assert.equal(replay.queue.length, 0);
  assert.ok(replay.seen.includes("champ-match-start-m1-11"));
  assert.ok(replay.seen.includes("match:m1"));
});

test("Later then reconnect replay does not reopen the old popup", () => {
  const shown = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const dismissed = dismissMatchStartPopup(shown);
  assert.equal(dismissed.current, null);
  const replay = enqueueMatchStartPopup(dismissed, captainEvent);
  assert.equal(replay.current, null);
  assert.equal(replay.queue.length, 0);
  const replayWithoutNotificationId = enqueueMatchStartPopup(dismissed, {
    matchId: "m1",
    role: "player",
    teamAName: "Team B",
    teamBName: "Team A",
  });
  assert.equal(replayWithoutNotificationId.current, null);
});

test("new match after previous match completed still shows a popup", () => {
  const first = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const afterEnd = clearMatchStartPopupForMatch(first, "m1");
  const next = enqueueMatchStartPopup(afterEnd, {
    ...captainEvent,
    notificationId: "champ-match-start-m2-11",
    matchId: "m2",
  });
  assert.equal(next.current?.matchId, "m2");
  assert.equal(next.queue.length, 0);
});

test("Match A ending while Match B is queued removes A and keeps B", () => {
  const first = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const queued = enqueueMatchStartPopup(first, { ...captainEvent, notificationId: "champ-match-start-m2-11", matchId: "m2" });
  const afterAEnds = clearMatchStartPopupForMatch(queued, "m1");
  assert.equal(afterAEnds.current?.matchId, "m2");
  assert.equal(afterAEnds.queue.length, 0);
  assert.ok(afterAEnds.seen.includes("match:m1"));
  assert.equal(afterAEnds.seen.includes("match:m2"), true);
});

test("admin event never becomes a live popup even if the match later ends", () => {
  const shown = enqueueMatchStartPopup(emptyMatchStartPopupState(), adminEvent);
  assert.equal(shown.current, null);
  const closed = clearMatchStartPopupForMatch(shown, "m1");
  assert.equal(closed.current, null);
});

test("admin-role replay after a live match still does not show a popup", () => {
  const replay = enqueueMatchStartPopup(emptyMatchStartPopupState(), { ...adminEvent, matchStatus: "live" });
  assert.equal(replay.current, null);
});

test("clearing a live popup does not invent a notification delete", () => {
  const shown = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const closed = clearMatchStartPopupForMatch(shown, "m1");
  assert.ok(closed.seen.includes("champ-match-start-m1-11"));
  assert.equal("deletedNotifications" in closed, false);
});

test("match_ended payload yields the championship match id", () => {
  assert.equal(championshipMatchIdFromLifecycleEvent({ match: { id: "m1", status: "completed" } }), "m1");
  assert.equal(championshipMatchIdFromLifecycleEvent({ matchId: "m9" }), "m9");
});

test("championship team battle finish payload yields the match id", () => {
  assert.equal(championshipMatchIdFromLifecycleEvent({
    yourTeam: { teamBattleId: "championship-m1" },
    finalScores: [{ teamBattleId: "championship-m1" }],
  }), "m1");
  assert.equal(championshipMatchIdFromLifecycleEvent({
    finalScores: [{ teamBattleId: "ordinary-uuid" }],
  }), undefined);
});

test("regular team battle finish does not clear a championship popup", () => {
  const shown = enqueueMatchStartPopup(emptyMatchStartPopupState(), captainEvent);
  const matchId = championshipMatchIdFromLifecycleEvent({
    gameId: "session-1",
    yourTeam: { teamBattleId: "3f1c8e2a-9b44-4d11-a111-222233334444" },
  } as { yourTeam: { teamBattleId: string } });
  assert.equal(matchId, undefined);
  const unchanged = clearMatchStartPopupForMatch(shown, matchId);
  assert.equal(unchanged.current?.matchId, "m1");
});

test("cache completed status is readable without treating upcoming as ended", () => {
  assert.equal(matchStatusFromChampionshipCaches("m1", {
    dashboard: { matches: [{ id: "m1", status: "completed" }] },
  }), "completed");
  assert.equal(matchStatusFromChampionshipCaches("m1", {
    dashboard: { matches: [{ id: "m1", status: "upcoming" }] },
  }), "upcoming");
  assert.equal(matchStatusFromChampionshipCaches("m2", {
    dashboard: { matches: [{ id: "m1", status: "completed" }] },
  }), undefined);
});

test("playing-admin recipient with player role still gets the player popup", () => {
  const state = enqueueMatchStartPopup(emptyMatchStartPopupState(), {
    ...captainEvent,
    notificationId: "champ-match-start-m1-1",
    role: "player",
  });
  assert.equal(state.current?.role, "player");
  assert.equal(isPlayerMatchStartRecipient("player"), true);
});

test("late start event after match end does not reopen the popup", () => {
  const ended = clearMatchStartPopupForMatch(emptyMatchStartPopupState(), "m1");
  const late = enqueueMatchStartPopup(ended, captainEvent);
  assert.equal(late.current, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
