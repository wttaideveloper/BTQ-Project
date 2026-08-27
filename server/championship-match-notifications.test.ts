/**
 * Championship match-start notification tests.
 *
 * Run with: npx tsx server/championship-match-notifications.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_MATCH_START_HREF,
  CHAMPIONSHIP_MATCH_STARTED_TYPE,
  PLAYER_MATCH_START_HREF,
  championshipMatchStartCopy,
  matchStartActionHref,
  matchStartNotificationId,
  resolveMatchStartRecipients,
} from "./championship-match-notifications.ts";

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

const startSource = readFileSync(new URL("./championship-match-start.ts", import.meta.url), "utf8");
const autoSource = readFileSync(new URL("./championship-autostart.ts", import.meta.url), "utf8");
const routesSource = readFileSync(new URL("./championship-routes.ts", import.meta.url), "utf8");
const socketSource = readFileSync(new URL("./socket.ts", import.meta.url), "utf8");
const notifySource = readFileSync(new URL("./championship-match-notifications.ts", import.meta.url), "utf8");
const popupSource = readFileSync(new URL("../client/src/components/championship/ChampionshipMatchStartPopup.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../client/src/lib/championship-match-start-popup.ts", import.meta.url), "utf8");

console.log("championship match-start notifications");

test("admin copy names both teams and marks the match live", () => {
  const copy = championshipMatchStartCopy("admin", "Lions", "Eagles");
  assert.equal(copy.title, "Match Started");
  assert.equal(copy.message, "Lions vs Eagles is now LIVE.");
});

test("player copy asks the participant to join", () => {
  const copy = championshipMatchStartCopy("player", "Lions", "Eagles");
  assert.equal(copy.title, "Your Match Is Live");
  assert.equal(copy.message, "Lions vs Eagles has started. Join now to play.");
});

test("admin deep link is the existing admin dashboard", () => {
  assert.equal(matchStartActionHref("admin"), ADMIN_MATCH_START_HREF);
  assert.equal(ADMIN_MATCH_START_HREF, "/admin/dashboard");
});

test("player deep link is the existing My Championship page", () => {
  assert.equal(matchStartActionHref("player"), PLAYER_MATCH_START_HREF);
  assert.equal(PLAYER_MATCH_START_HREF, "/my-championship");
});

test("admins, both captains, and roster members are notified", () => {
  const recipients = resolveMatchStartRecipients({
    teamACaptainId: 11,
    teamBCaptainId: 22,
    teamAMemberIds: [11, 13],
    teamBMemberIds: [22, 24],
    adminIds: [1],
  });
  const byId = Object.fromEntries(recipients.map(item => [item.userId, item.role]));
  assert.equal(byId[1], "admin");
  assert.equal(byId[11], "player");
  assert.equal(byId[22], "player");
  assert.equal(byId[13], "player");
  assert.equal(byId[24], "player");
  assert.equal(recipients.length, 5);
});

test("unrelated users and spectators are not recipients", () => {
  const recipients = resolveMatchStartRecipients({
    teamACaptainId: 11,
    teamBCaptainId: 22,
    teamAMemberIds: [],
    teamBMemberIds: [],
    adminIds: [1],
  });
  const ids = recipients.map(item => item.userId);
  assert.deepEqual(ids.sort((a, b) => a - b), [1, 11, 22]);
  assert.ok(!ids.includes(99));
});

test("a playing admin receives the player message once, not both", () => {
  const recipients = resolveMatchStartRecipients({
    teamACaptainId: 1,
    teamBCaptainId: 22,
    teamAMemberIds: [1],
    teamBMemberIds: [],
    adminIds: [1, 8],
  });
  const adminPlayer = recipients.filter(item => item.userId === 1);
  assert.equal(adminPlayer.length, 1);
  assert.equal(adminPlayer[0].role, "player");
  assert.equal(recipients.find(item => item.userId === 8)?.role, "admin");
});

test("duplicate notification ids are deterministic per match and user", () => {
  assert.equal(
    matchStartNotificationId("match-1", 11),
    matchStartNotificationId("match-1", 11),
  );
  assert.notEqual(
    matchStartNotificationId("match-1", 11),
    matchStartNotificationId("match-1", 22),
  );
  assert.notEqual(
    matchStartNotificationId("match-1", 11),
    matchStartNotificationId("match-2", 11),
  );
});

test("startChampionshipMatch notifies after a successful upcoming → live flip", () => {
  assert.match(startSource, /broadcastChampionshipEvent\(\{ type: "match_started"/);
  assert.match(startSource, /notifyChampionshipMatchStarted\(row\)/);
  assert.match(startSource, /eq\(championshipMatches\.status, "upcoming"\)/);
  const notifyIndex = startSource.indexOf("notifyChampionshipMatchStarted(row)");
  const updateIndex = startSource.indexOf('eq(championshipMatches.status, "upcoming")');
  assert.ok(notifyIndex > updateIndex);
});

test("manual Start Match and Auto Start share startChampionshipMatch", () => {
  assert.match(routesSource, /startChampionshipMatch\(req\.params\.id\)/);
  assert.match(autoSource, /startChampionshipMatch/);
  assert.doesNotMatch(autoSource, /notifyChampionshipMatchStarted/);
  assert.doesNotMatch(routesSource, /notifyChampionshipMatchStarted/);
});

test("private notifications use sendToUser, not the public spectator broadcast", () => {
  assert.match(notifySource, /sendToUser\(recipient\.userId/);
  assert.doesNotMatch(notifySource, /broadcastChampionshipEvent/);
  assert.doesNotMatch(notifySource, /gameSessionId/);
  assert.match(socketSource, /watchMatchId === matchId/);
});

test("client popup ignores public Watch Live paths and public match_started", () => {
  assert.match(popupSource, /championship_match_started/);
  assert.match(popupSource, /role="dialog"/);
  assert.doesNotMatch(popupSource, /onEvent\("match_started"/);
  assert.doesNotMatch(popupSource, /duration: 8000/);
  assert.match(popupSource, /isPublicWatchPath/);
  assert.match(hookSource, /Join Match/);
  assert.match(hookSource, /Open Match/);
  assert.match(popupSource, /copy\.action/);
  assert.match(popupSource, /joinPlayerMatch/);
  assert.match(popupSource, /openAdminMatch/);
  assert.match(popupSource, /\/my-championship/);
  assert.match(popupSource, /\/admin\/dashboard/);
  assert.match(popupSource, /\/api\/championship-matches\/\$\{current\.matchId\}\/join/);
  assert.match(notifySource, /database\.createNotification/);
  assert.match(notifySource, /championshipName/);
  assert.match(hookSource, /enqueueMatchStartPopup/);
});

test("persistent notification type matches the existing notifications table", () => {
  assert.equal(CHAMPIONSHIP_MATCH_STARTED_TYPE, "championship_match_started");
  assert.match(notifySource, /database\.createNotification/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
