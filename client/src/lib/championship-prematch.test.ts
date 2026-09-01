/**
 * Championship pre-match helpers.
 *
 * Run with: npx tsx client/src/lib/championship-prematch.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canCaptainToggleReady,
  championshipPrematchCopy,
  isRosterMemberJoined,
  prematchMembersFromTeam,
} from "./championship-prematch.ts";

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

const prematchUi = read("client/src/components/championship/game/ChampionshipPreMatch.tsx");
const teamBattleGame = read("client/src/pages/TeamBattleGame.tsx");

console.log("championship pre-match helpers");

test("1v1 roster is just the two captains", () => {
  const teamA = prematchMembersFromTeam({
    captainId: 1,
    members: [{ userId: 1, username: "Captain A", role: "captain" }],
  });
  const teamB = prematchMembersFromTeam({
    captainId: 2,
    members: [{ userId: 2, username: "Captain B", role: "captain" }],
  });
  assert.equal(teamA.length, 1);
  assert.equal(teamB.length, 1);
  assert.equal(teamA[0].role, "captain");
});

test("2v2 roster uses the actual members, not a padded 3v3 grid", () => {
  const teamA = prematchMembersFromTeam({
    captainId: 1,
    members: [
      { userId: 1, username: "Captain A", role: "captain" },
      { userId: 3, username: "Member A2", role: "member" },
    ],
  });
  assert.equal(teamA.length, 2);
  assert.equal(teamA[1].role, "member");
});

test("3v3 roster lists captain plus both members", () => {
  const teamA = prematchMembersFromTeam({
    captainId: 1,
    members: [
      { userId: 1, username: "Captain A", role: "captain" },
      { userId: 3, username: "Member A2", role: "member" },
      { userId: 4, username: "Member A3", role: "member" },
    ],
  });
  assert.equal(teamA.length, 3);
});

test("presence is unknown until presentUserIds arrives — never faked as joined", () => {
  assert.equal(isRosterMemberJoined(1, null), null);
  assert.equal(isRosterMemberJoined(1, undefined), null);
  assert.equal(isRosterMemberJoined(1, []), false);
  assert.equal(isRosterMemberJoined(1, [1, 2]), true);
  assert.equal(isRosterMemberJoined(9, [1, 2]), false);
});

test("only that team's captain can toggle ready", () => {
  assert.equal(canCaptainToggleReady({ currentUserId: 1, captainId: 1, countdown: null }), true);
  assert.equal(canCaptainToggleReady({ currentUserId: 3, captainId: 1, countdown: null }), false);
  assert.equal(canCaptainToggleReady({ currentUserId: 1, captainId: 2, countdown: null }), false);
  assert.equal(canCaptainToggleReady({ currentUserId: 1, captainId: 1, countdown: 4 }), false);
});

test("copy distinguishes waiting vs both ready vs countdown", () => {
  const waiting = championshipPrematchCopy({
    teamAName: "Team A",
    teamBName: "Team B",
    teamAReady: false,
    teamBReady: false,
    countdown: null,
  });
  assert.match(waiting.title, /Waiting for captains/);

  const aReady = championshipPrematchCopy({
    teamAName: "Lions",
    teamBName: "Eagles",
    teamAReady: true,
    teamBReady: false,
    countdown: null,
  });
  assert.equal(aReady.title, "Waiting for Eagles");
  assert.match(aReady.description, /Lions is ready/);

  const both = championshipPrematchCopy({
    teamAName: "Lions",
    teamBName: "Eagles",
    teamAReady: true,
    teamBReady: true,
    countdown: 5,
  });
  assert.equal(both.title, "Both captains ready");
  assert.match(both.description, /5/);
});

test("pre-match UI has no manual Start match button", () => {
  assert.doesNotMatch(prematchUi, /Start match/);
  assert.doesNotMatch(prematchUi, /start_team_battle/);
  assert.doesNotMatch(prematchUi, /onStart/);
  assert.match(prematchUi, /I'm Ready!/);
  assert.match(prematchUi, /Waiting for your captain/);
  assert.match(prematchUi, /Cancel Ready/);
  assert.match(prematchUi, /Joined/);
  assert.match(prematchUi, /Not joined/);
});

test("game page sends existing team_battle_ready and does not start from the client", () => {
  assert.match(teamBattleGame, /type: "team_battle_ready"/);
  assert.match(teamBattleGame, /type: "team_battle_unready"/);
  assert.match(teamBattleGame, /type: "get_ready_state"/);
  assert.doesNotMatch(teamBattleGame, /type: "start_team_battle"/);
  assert.match(teamBattleGame, /Presence only/);
  assert.match(teamBattleGame, /case "team_ready_status"/);
  assert.match(teamBattleGame, /case "team_battle_countdown"/);
});

test("captains_ready is not stored as championship READY", () => {
  assert.doesNotMatch(teamBattleGame, /setChampionshipReady\(\{\s*teamAReady: !!data\.teamACaptainReady/);
  const readyCase = teamBattleGame.indexOf('case "team_ready_status"');
  const captainsCase = teamBattleGame.indexOf('case "captains_ready"');
  assert.ok(readyCase > 0 && captainsCase > 0);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
