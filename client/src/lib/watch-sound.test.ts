/**
 * Watch Live commentary sound control tests.
 *
 * Run with: npx tsx client/src/lib/watch-sound.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyWatchSound,
  emptyWatchSoundState,
  isAutoplayBlocked,
  shouldShowWatchSoundControl,
  streamHasAudioTrack,
  watchSoundCopy,
  watchSoundKind,
} from "./watch-sound.ts";

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
const watchMatch = readFileSync(resolve(root, "client/src/pages/WatchMatch.tsx"), "utf8");
const overlay = readFileSync(resolve(root, "client/src/pages/WatchMatch.tsx"), "utf8");
const overlayStart = overlay.indexOf("if (overlay) return (");
const overlayEnd = overlay.indexOf("Everything below is read from the match payload", overlayStart);
const overlayBlock = overlay.slice(overlayStart, overlayEnd);

console.log("watch live commentary sound");

test("initial state is muted autoplay, not Sound On", () => {
  const state = emptyWatchSoundState();
  assert.equal(state.soundOn, false);
  assert.equal(watchSoundKind(state), "enable");
  assert.equal(watchSoundCopy("enable").label, "Enable Sound");
  assert.equal(watchSoundCopy("enable").aria, "Enable sound");
  assert.equal(watchSoundCopy("enable").disabled, false);
});

test("Enable Sound becomes Sound On", () => {
  const kind = watchSoundKind({ soundOn: true, everEnabled: true, playbackBlocked: false, audioAvailable: null });
  assert.equal(kind, "on");
  assert.equal(watchSoundCopy(kind).label, "Sound On");
  assert.match(watchSoundCopy(kind).aria, /Sound on/i);
});

test("Mute after enabling shows Muted, not Enable Sound", () => {
  const kind = watchSoundKind({ soundOn: false, everEnabled: true, playbackBlocked: false, audioAvailable: null });
  assert.equal(kind, "muted");
  assert.equal(watchSoundCopy(kind).label, "Muted");
});

test("play() NotAllowedError surfaces Tap to enable sound", () => {
  assert.equal(isAutoplayBlocked({ name: "NotAllowedError" }), true);
  assert.equal(isAutoplayBlocked({ name: "AbortError" }), false);
  assert.equal(isAutoplayBlocked(undefined), false);
  const kind = watchSoundKind({ soundOn: false, everEnabled: false, playbackBlocked: true, audioAvailable: null });
  assert.equal(kind, "tap");
  assert.equal(watchSoundCopy("tap").label, "Tap to enable sound");
});

test("accessibility labels are not icon-only", () => {
  for (const kind of ["enable", "tap", "on", "muted", "none"] as const) {
    const copy = watchSoundCopy(kind);
    assert.ok(copy.aria.trim().length > 0);
    assert.ok(copy.label.trim().length > 0);
  }
  assert.equal(watchSoundCopy("none").disabled, true);
  assert.match(watchSoundCopy("none").aria, /no audio/i);
});

test("no video means no sound control", () => {
  assert.equal(shouldShowWatchSoundControl(false), false);
  assert.equal(shouldShowWatchSoundControl(true), true);
});

test("Enable Sound unmutes the existing video element", async () => {
  const video = { muted: true, volume: 0.2, play: async () => undefined };
  await applyWatchSound(video, true);
  assert.equal(video.muted, false);
  assert.equal(video.volume, 1);
});

test("Mute sets muted on the same video element", async () => {
  const video = { muted: false, volume: 1, play: async () => undefined };
  await applyWatchSound(video, false);
  assert.equal(video.muted, true);
});

test("a reported empty audioTracks list is No audio, not Sound On", () => {
  assert.equal(streamHasAudioTrack({ audioTracks: { length: 0 } }), false);
  assert.equal(streamHasAudioTrack({ audioTracks: { length: 1 } }), true);
  assert.equal(streamHasAudioTrack({}), null);
  assert.equal(
    watchSoundKind({ soundOn: true, everEnabled: true, playbackBlocked: false, audioAvailable: false }),
    "none",
  );
  assert.equal(watchSoundCopy("none").label, "No audio");
});

test("WatchMatch still uses the saved HLS URL and both players", () => {
  assert.match(watchMatch, /data\.match\.streamUrl/);
  assert.match(watchMatch, /new Hls\(/);
  assert.match(watchMatch, /application\/vnd\.apple\.mpegurl/);
  assert.match(watchMatch, /playsInline/);
  assert.match(watchMatch, /hls\.destroy\(\)/);
  assert.match(watchMatch, /WatchSoundControl/);
  assert.match(watchMatch, /isAutoplayBlocked/);
});

test("overlay mode does not mount the sound control or video", () => {
  assert.ok(overlayStart > 0);
  assert.equal(overlayBlock.includes("WatchSoundControl"), false);
  assert.equal(overlayBlock.includes("<video"), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
