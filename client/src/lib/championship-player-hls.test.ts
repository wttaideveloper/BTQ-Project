/**
 * Championship player HLS is a presentation reuse of Watch Live, not a second
 * streaming system. Run with: npx tsx client/src/lib/championship-player-hls.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const teamBattleGame = read("client/src/pages/TeamBattleGame.tsx");
const liveVideo = read("client/src/components/championship/game/ChampionshipLiveVideo.tsx");
const watchMatch = read("client/src/pages/WatchMatch.tsx");
const helper = read("client/src/lib/championship-hls.ts");
const commentary = read("client/src/components/commentary/PlayerCommentaryReceiver.tsx");
const gamePage = read("client/src/pages/Game.tsx");

console.log("championship player HLS");

test("player screen mounts live video only for championship matches", () => {
  assert.match(teamBattleGame, /ChampionshipLiveVideo/);
  assert.match(teamBattleGame, /isChampionshipMatch && championshipMatchId/);
  assert.match(teamBattleGame, /<ChampionshipLiveVideo matchId=\{championshipMatchId\} \/>/);
});

test("regular Team Battle and Rapid Fire do not import the HLS player", () => {
  assert.doesNotMatch(gamePage, /ChampionshipLiveVideo/);
  assert.doesNotMatch(gamePage, /attachChampionshipHls/);
  const mount = teamBattleGame.slice(
    teamBattleGame.indexOf("isChampionshipMatch && championshipMatchId && gameState.phase !== \"waiting\""),
    teamBattleGame.indexOf("ChampionshipLiveVideo matchId") + 80,
  );
  assert.match(mount, /isChampionshipMatch && championshipMatchId/);
});

test("player HLS reuses Watch Live attach helper and stream URL", () => {
  assert.match(liveVideo, /attachChampionshipHls/);
  assert.match(liveVideo, /streamUrl/);
  assert.match(liveVideo, /playsInline/);
  assert.match(liveVideo, /WatchSoundControl/);
  assert.match(watchMatch, /attachChampionshipHls/);
  assert.match(helper, /new Hls\(/);
  assert.match(helper, /liveSyncDurationCount:\s*2/);
});

test("player HLS does not subscribe as a spectator or mix commentator audio", () => {
  assert.doesNotMatch(liveVideo, /watch_match/);
  assert.doesNotMatch(liveVideo, /commentary_listen/);
  assert.doesNotMatch(liveVideo, /getUserMedia/);
  assert.match(liveVideo, /Live video unavailable/);
  assert.match(commentary, /commentary_listen/);
  assert.match(teamBattleGame, /PlayerCommentaryReceiver/);
});

test("Watch Live layout is not replaced by the compact player component", () => {
  assert.doesNotMatch(watchMatch, /ChampionshipLiveVideo/);
  assert.match(watchMatch, /WatchStage/);
});

test("player video sits below the question, not between scoreboard and question", () => {
  const videoIdx = teamBattleGame.indexOf("<ChampionshipLiveVideo");
  const waitingIdx = teamBattleGame.indexOf("{gameState.phase === \"waiting\" && renderWaitingPhase()}");
  const questionIdx = teamBattleGame.indexOf("renderQuestionPhase()");
  const lastQuestionIdx = teamBattleGame.lastIndexOf("renderQuestionPhase()");
  assert.ok(videoIdx > waitingIdx);
  assert.ok(videoIdx > lastQuestionIdx);
  assert.ok(videoIdx > questionIdx);
  assert.doesNotMatch(liveVideo, /max-w-3xl/);
  assert.match(liveVideo, /w-\[200px\]/);
  assert.match(liveVideo, /sm:w-\[280px\]/);
  assert.match(liveVideo, /lg:w-\[320px\]/);
  assert.match(liveVideo, /aspect-video/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
