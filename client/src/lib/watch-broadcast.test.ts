/**
 * Watch Live broadcast layout: in-video scoreboard overlay.
 *
 * Run with: npx tsx client/src/lib/watch-broadcast.test.ts
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

const watchMatch = read("client/src/pages/WatchMatch.tsx");
const stage = read("client/src/components/watch/WatchStage.tsx");
const scoreboard = read("client/src/components/watch/WatchScoreboard.tsx");
const question = read("client/src/components/watch/WatchQuestionPanel.tsx");
const css = read("client/src/index.css");
const hls = read("client/src/lib/championship-hls.ts");
const liveVideo = read("client/src/components/championship/game/ChampionshipLiveVideo.tsx");
const teamBattleGame = read("client/src/pages/TeamBattleGame.tsx");
const commentatorDesk = read("client/src/pages/CommentatorMatchDesk.tsx");

console.log("watch live broadcast overlay");

test("scoreboard is an in-video lower-third, not a floor card under the video", () => {
  assert.match(watchMatch, /lowerThird=\{/);
  assert.match(watchMatch, /<WatchScoreboard/);
  const floorStart = watchMatch.indexOf("watch-floor");
  const floor = floorStart >= 0 ? watchMatch.slice(floorStart, floorStart + 700) : "";
  assert.doesNotMatch(floor, /<WatchScoreboard/);
  assert.match(stage, /\{lowerThird\}/);
  assert.match(scoreboard, /watch-lower-third/);
  assert.match(scoreboard, /watch-bug/);
  assert.match(css, /\.watch-lower-third/);
  assert.match(css, /position:\s*absolute/);
});

test("HLS video element and attachChampionshipHls wiring are unchanged", () => {
  assert.match(watchMatch, /attachChampionshipHls\(video, data\.match\.streamUrl/);
  assert.match(watchMatch, /<video/);
  assert.match(watchMatch, /playsInline/);
  assert.match(watchMatch, /autoPlay/);
  assert.match(watchMatch, /WatchSoundControl/);
  assert.match(hls, /export function attachChampionshipHls/);
});

test("overlay uses live match scores and question numbers, not hardcoded teams", () => {
  assert.match(scoreboard, /\{teamAScore\}/);
  assert.match(scoreboard, /\{teamBScore\}/);
  assert.match(scoreboard, /team\?\.name \?\? fallback/);
  assert.doesNotMatch(scoreboard, /Faith Titans/);
  assert.match(watchMatch, /liveQuestion=\{liveQuestion\}/);
  assert.match(watchMatch, /totalQuestions=\{liveQuestionDetail\?\.totalQuestions\}/);
  assert.match(watchMatch, /answeringTeamName=\{questionResult \? undefined : liveQuestionDetail\?\.answeringTeamName\}/);
});

test("question panel stays display-only and shows commentator wait after a scored question", () => {
  assert.match(question, /WatchQuestionPanel/);
  assert.doesNotMatch(question, /<button/);
  assert.match(question, /Question \{question\.questionNumber\}/);
  assert.match(question, /championshipShouldWaitAfterResults/);
  assert.match(question, /ChampionshipCommentatorWait/);
  assert.match(question, /is answering/);
});

test("reactions still render on the scoreboard overlay, once", () => {
  assert.match(watchMatch, /particles=\{reactions\}/);
  assert.equal((scoreboard.match(/data-watch-reaction-layer/g) ?? []).length, 1);
  assert.equal(stage.includes("watch-burst"), false);
});

test("OBS overlay path does not use the spectator scoreboard", () => {
  const overlayStart = watchMatch.indexOf("if (overlay) return (");
  const overlayEnd = watchMatch.indexOf("Everything below is read from the match payload", overlayStart);
  const overlayBlock = watchMatch.slice(overlayStart, overlayEnd);
  assert.equal(overlayBlock.includes("WatchScoreboard"), false);
  assert.equal(overlayBlock.includes("WatchStage"), false);
});

test("player gameplay and commentator desk are not rewritten", () => {
  assert.match(teamBattleGame, /ChampionshipScoreboard/);
  assert.match(liveVideo, /attachChampionshipHls/);
  assert.match(commentatorDesk, /watch_match/);
  assert.doesNotMatch(teamBattleGame, /watch-lower-third/);
  assert.doesNotMatch(commentatorDesk, /watch-lower-third/);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
