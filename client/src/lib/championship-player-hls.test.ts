/**
 * Championship player HLS is a presentation reuse of Watch Live, not a second
 * streaming system. Run with: npx tsx client/src/lib/championship-player-hls.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  championshipHlsHttpFailureMessage,
  HLS_EXTERNAL_HTTP_FAILURE,
  HLS_EXTERNAL_NOT_FOUND,
  HLS_GENERIC_PLAYBACK_FAILURE,
  isHlsManifestUrl,
  isNonRetryableHlsHttpStatus,
  PROGRESSIVE_PLAYBACK_FAILURE,
} from "./championship-hls.ts";

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
  assert.match(teamBattleGame, /isChampionshipMatch/);
  assert.match(teamBattleGame, /liveVideo=\{championshipMatchId \? <ChampionshipLiveVideo matchId=\{championshipMatchId\} \/> : null\}/);
  assert.equal((teamBattleGame.match(/<ChampionshipLiveVideo /g) || []).length, 1);
});

test("regular Team Battle and Rapid Fire do not import the HLS player", () => {
  assert.doesNotMatch(gamePage, /ChampionshipLiveVideo/);
  assert.doesNotMatch(gamePage, /attachChampionshipHls/);
  assert.match(teamBattleGame, /!isChampionshipMatch && \(/);
});

test("player HLS reuses Watch Live attach helper and stream URL", () => {
  assert.match(liveVideo, /attachChampionshipHls/);
  assert.match(liveVideo, /streamUrl/);
  assert.match(liveVideo, /playsInline/);
  assert.match(liveVideo, /WatchSoundControl/);
  assert.match(watchMatch, /attachChampionshipHls/);
  assert.match(helper, /new Hls\(/);
  assert.match(helper, /liveSyncDurationCount:\s*2/);
  assert.match(helper, /maxBufferLength:\s*10/);
  assert.match(helper, /enableWorker:\s*false/);
  const mseIdx = helper.indexOf("if (Hls.isSupported())");
  const nativeIdx = helper.indexOf("video.canPlayType(");
  assert.ok(mseIdx > 0 && nativeIdx > mseIdx, "hls.js MSE path must run before native HLS fallback");
  assert.match(helper, /isNonRetryableHlsHttpStatus\(status\)/);
  assert.match(helper, /hls\.stopLoad\(\)/);
  assert.match(watchMatch, /streamError && \(/);
  assert.match(liveVideo, /streamError && \(/);
});

test("player HLS does not subscribe as a spectator or mix commentator audio", () => {
  assert.doesNotMatch(liveVideo, /watch_match/);
  assert.doesNotMatch(liveVideo, /commentary_listen/);
  assert.doesNotMatch(liveVideo, /getUserMedia/);
  assert.match(liveVideo, /Live video unavailable/);
  assert.match(commentary, /commentary_listen/);
  assert.doesNotMatch(teamBattleGame, /PlayerCommentaryReceiver/);
});

test("fatal HLS HTTP/CORS failures do not retry and surface Live video unavailable", () => {
  assert.equal(isNonRetryableHlsHttpStatus(0), true);
  assert.equal(isNonRetryableHlsHttpStatus(403), true);
  assert.equal(isNonRetryableHlsHttpStatus(404), true);
  assert.equal(isNonRetryableHlsHttpStatus(500), false);
  assert.equal(isNonRetryableHlsHttpStatus(undefined), false);
  assert.equal(championshipHlsHttpFailureMessage(403), HLS_EXTERNAL_HTTP_FAILURE);
  assert.equal(championshipHlsHttpFailureMessage(0), HLS_EXTERNAL_HTTP_FAILURE);
  assert.equal(championshipHlsHttpFailureMessage(404), HLS_EXTERNAL_NOT_FOUND);
  assert.match(HLS_EXTERNAL_HTTP_FAILURE, /Live video unavailable/);
  assert.match(HLS_EXTERNAL_HTTP_FAILURE, /HTTP 403 \/ CORS/);
  assert.match(HLS_GENERIC_PLAYBACK_FAILURE, /Live video unavailable/);
  assert.notEqual(HLS_EXTERNAL_HTTP_FAILURE, HLS_GENERIC_PLAYBACK_FAILURE);
});

test("an mp4 is played by the element itself and never handed to hls.js", () => {
  assert.equal(isHlsManifestUrl("https://quiz.example.com/media/promo.mp4"), false);
  assert.equal(isHlsManifestUrl("https://quiz.example.com/media/promo.webm"), false);
  assert.equal(isHlsManifestUrl("https://stream.example.com/live.m3u8"), true);
  assert.equal(isHlsManifestUrl("https://stream.example.com/live.mpd"), true);
  // A signed or cache-busted manifest is still a manifest.
  assert.equal(isHlsManifestUrl("https://stream.example.com/live.m3u8?token=abc"), true);
  assert.equal(isHlsManifestUrl("https://stream.example.com/LIVE.M3U8"), true);
  // The .mp4 file itself must never reach loadSource, which reads a playlist.
  const guard = helper.indexOf("if (!isHlsManifestUrl(url))");
  const mse = helper.indexOf("if (Hls.isSupported())");
  assert.ok(guard > 0, "progressive branch must exist");
  assert.ok(mse > guard, "the progressive branch must run before hls.js is constructed");
  assert.match(PROGRESSIVE_PLAYBACK_FAILURE, /Live video unavailable/);
});

test("a clip that ends starts again, so video outlasts the match", () => {
  assert.match(helper, /video\.loop = true/);
  // Set before either branch: a clip has to loop and a live stream never
  // reaches an end to loop from, so neither path wants it off.
  const loop = helper.indexOf("video.loop = true");
  assert.ok(loop > 0 && loop < helper.indexOf("if (!isHlsManifestUrl(url))"));
});

test("the championship video ships with the client and is served same-origin", () => {
  const video = resolve(root, "client/public/media/hbtv-ai-cloud-gaming.mp4");
  const { size } = statSync(video);
  assert.ok(size > 1_000_000, "the clip must be the real file, not a placeholder");
  // A manifest here would be played once and never looped by the mixer.
  assert.match(video, /\.mp4$/);
});

test("Watch Live layout is not replaced by the compact player component", () => {
  assert.doesNotMatch(watchMatch, /ChampionshipLiveVideo/);
  assert.match(watchMatch, /WatchStage/);
});

test("player video sits in the top scoreboard row, not below the question", () => {
  const scoreboard = read("client/src/components/championship/game/ChampionshipScoreboard.tsx");
  const videoIdx = teamBattleGame.indexOf("<ChampionshipLiveVideo");
  const scoreboardIdx = teamBattleGame.indexOf("<ChampionshipScoreboard");
  const lastQuestionIdx = teamBattleGame.lastIndexOf("renderQuestionPhase()");
  assert.ok(videoIdx > 0);
  assert.ok(scoreboardIdx > 0);
  assert.ok(videoIdx > scoreboardIdx);
  assert.ok(videoIdx < lastQuestionIdx);
  assert.match(scoreboard, /liveVideo/);
  assert.match(scoreboard, /md:items-stretch/);
  assert.match(scoreboard, /md:h-full/);
  assert.match(scoreboard, /md:flex-row/);
  assert.doesNotMatch(liveVideo, /max-w-3xl/);
  assert.match(liveVideo, /w-\[200px\]/);
  assert.match(liveVideo, /md:w-\[260px\]/);
  assert.match(liveVideo, /lg:w-\[300px\]/);
  assert.match(liveVideo, /aspect-video/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
