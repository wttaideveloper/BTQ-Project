/**
 * Championship pre-match reuses Team Battle READY. Arrival is not READY.
 *
 * Run with: npx tsx server/championship-prematch.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { championshipDbReadyAllowsStart } from "./championship-prematch.ts";

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

const socketSource = read("server/socket.ts");
const startSource = read("server/championship-match-start.ts");
const autoSource = read("server/championship-autostart.ts");
const notifySource = read("server/championship-match-notifications.ts");
const popupSource = read("client/src/components/championship/ChampionshipMatchStartPopup.tsx");
const adminPanel = read("client/src/components/admin/ChampionshipManagementPanel.tsx");
const readyHandler = socketSource.slice(
  socketSource.indexOf("async function handleTeamBattleReady"),
  socketSource.indexOf("async function handleTeamBattleUnready"),
);
const startHandler = socketSource.slice(
  socketSource.indexOf("async function handleStartTeamBattle"),
  socketSource.indexOf("async function handleStartTeamBattle") + 8000,
);
const presenceHandler = socketSource.slice(
  socketSource.indexOf("A championship roster member has opened"),
  socketSource.indexOf("async function broadcastChampionshipToss"),
);

console.log("championship pre-match server");

test("only both DB ready timestamps allow Championship start", () => {
  assert.equal(championshipDbReadyAllowsStart(null), false);
  assert.equal(championshipDbReadyAllowsStart({ teamAReady: true, teamBReady: false }), false);
  assert.equal(championshipDbReadyAllowsStart({ teamAReady: false, teamBReady: true }), false);
  assert.equal(championshipDbReadyAllowsStart({ teamAReady: true, teamBReady: true }), true);
});

test("Championship captain A ready is the existing markTeamReady path", () => {
  assert.match(readyHandler, /Only team captain can mark team as ready/);
  assert.match(readyHandler, /database\.markTeamReady\(battle\.id, event\.teamSide\)/);
  assert.match(readyHandler, /event\.teamSide === "A" && battle\.teamACaptainId !== client\.userId/);
  assert.match(readyHandler, /event\.teamSide === "B" && battle\.teamBCaptainId !== client\.userId/);
  assert.doesNotMatch(readyHandler, /isChampionshipBattle/);
});

test("non-captain cannot mark ready and captain cannot mark opponent ready", () => {
  assert.match(readyHandler, /Only team captain can mark team as ready/);
  assert.match(
    readyHandler,
    /\(event\.teamSide === "A" && battle\.teamACaptainId !== client\.userId\) \|\|[\s\S]*event\.teamSide === "B" && battle\.teamBCaptainId !== client\.userId/,
  );
});

test("duplicate READY is safe and does not start a second countdown", () => {
  assert.match(readyHandler, /Your team is already marked as ready/);
  assert.match(readyHandler, /bothReady && !wasBothReady/);
  assert.match(readyHandler, /broadcastCountdown/);
  assert.match(readyHandler, /countdownSeconds = 5/);
  assert.match(readyHandler, /handleStartTeamBattle/);
});

test("teammate presence is not required to mark ready", () => {
  assert.doesNotMatch(readyHandler, /teammate.*join/i);
  assert.doesNotMatch(readyHandler, /all members/i);
  assert.doesNotMatch(readyHandler, /presentUserIds/);
});

test("arrival ping cannot mark a captain READY", () => {
  assert.doesNotMatch(presenceHandler, /markTeamReady/);
  assert.doesNotMatch(presenceHandler, /clearTeamReady/);
  assert.match(presenceHandler, /team_battle_ready/);
  assert.match(presenceHandler, /presentUserIds/);
  assert.match(presenceHandler, /getTeamReadyState/);
  assert.match(presenceHandler, /canStart: false/);
});

test("Championship start guard uses DB ready, not arrival", () => {
  assert.match(startHandler, /championshipDbReadyAllowsStart/);
  assert.match(startHandler, /getTeamReadyState/);
  assert.doesNotMatch(startHandler, /championshipCaptainArrivals/);
  assert.doesNotMatch(startHandler, /Waiting for both team captains to join/);
  assert.match(startHandler, /Both captains must mark ready before the match can start/);
});

test("refresh\/reconnect restores ready from DB", () => {
  assert.match(socketSource, /case "get_ready_state"/);
  assert.match(socketSource, /async function handleGetReadyState/);
  assert.match(presenceHandler, /type: "team_ready_status"/);
  assert.match(socketSource, /client\.gameSessionId = event\.gameSessionId/);
});

test("Auto Start still only makes the Championship match LIVE", () => {
  assert.match(startSource, /status: "forming"/);
  assert.doesNotMatch(startSource, /handleStartTeamBattle/);
  assert.doesNotMatch(autoSource, /handleStartTeamBattle/);
  assert.doesNotMatch(autoSource, /team_battle_ready/);
  assert.doesNotMatch(startSource, /markTeamReady/);
});

test("player match-start popup and admin panel are not given a new ready flow", () => {
  assert.match(notifySource, /shouldEmitMatchStartPopupEvent/);
  assert.match(popupSource, /copy\.action/);
  assert.match(read("client/src/lib/championship-match-start-popup.ts"), /Join Match/);
  assert.doesNotMatch(adminPanel, /I'm Ready!/);
  assert.doesNotMatch(adminPanel, /Your Match Is Live/);
});

test("fixture is not deleted on championship disconnect", () => {
  const champIf = socketSource.match(
    /if \(isChampionshipBattle\(battle\.id\)\) \{[\s\S]*?void broadcastChampionshipLobbyPresence\(battle\);[\s\S]*?\}/,
  );
  assert.ok(champIf);
  assert.doesNotMatch(champIf[0], /deleteBattle: true/);
  assert.doesNotMatch(champIf[0], /resetBattleState/);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
