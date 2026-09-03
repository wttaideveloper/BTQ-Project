/**
 * Championship question TTS must stay off; Regular Team Battle and Rapid Fire
 * keep cloned-voice narration. Run with:
 * npx tsx client/src/lib/championship-question-tts.test.ts
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

const board = read("client/src/components/TeamBattleQuestionBoard.tsx");
const game = read("client/src/pages/TeamBattleGame.tsx");
const championshipBoard = read(
  "client/src/components/championship/game/ChampionshipQuestionBoard.tsx",
);
const liveVideo = read(
  "client/src/components/championship/game/ChampionshipLiveVideo.tsx",
);
const commentary = read(
  "client/src/components/commentary/PlayerCommentaryReceiver.tsx",
);

const voiceEffect = board.slice(
  board.indexOf("// Voice narration effect"),
  board.indexOf("// Timer effect"),
);

console.log("championship question TTS");

test("Championship detection is the existing championship- battle id helper", () => {
  assert.match(game, /const CHAMPIONSHIP_BATTLE_PREFIX = "championship-"/);
  assert.match(game, /function isChampionshipTeamBattle/);
  assert.match(game, /teamBattleId\?\.startsWith\(CHAMPIONSHIP_BATTLE_PREFIX\)/);
  assert.match(game, /variant=\{isChampionshipMatch \? "championship" : "default"\}/);
});

test("Championship variant cancels pending TTS and never speaks cloned voice", () => {
  assert.match(voiceEffect, /if \(variant === "championship"\)/);
  assert.match(voiceEffect, /voiceService\.stopAllAudio\(false\)/);
  assert.match(voiceEffect, /return;/);

  const championshipGuard = voiceEffect.slice(
    voiceEffect.indexOf('if (variant === "championship")'),
    voiceEffect.indexOf("if (isReadOnly || isPaused)"),
  );
  assert.doesNotMatch(championshipGuard, /speakWithClonedVoice/);
  assert.doesNotMatch(championshipGuard, /startNewSession/);
  assert.doesNotMatch(championshipGuard, /getVoiceStatus/);
});

test("Regular Team Battle still triggers cloned/TTS question voice", () => {
  assert.match(voiceEffect, /speakWithClonedVoice/);
  assert.match(voiceEffect, /startNewSession/);
  assert.match(voiceEffect, /teambattle-q/);
  assert.ok(
    voiceEffect.indexOf('if (variant === "championship")') <
      voiceEffect.indexOf("speakWithClonedVoice"),
  );
});

test("Rapid Fire uses the default board skin, so TTS stays enabled", () => {
  const rapidFn = game.slice(
    game.indexOf("const renderRapidQuestionPhase"),
    game.indexOf("const renderTossPhase"),
  );
  assert.match(rapidFn, /<TeamBattleQuestionBoard/);
  assert.doesNotMatch(rapidFn, /variant=/);
  assert.doesNotMatch(rapidFn, /championship/);
});

test("Championship presentation board and live audio paths do not add TTS", () => {
  assert.doesNotMatch(championshipBoard, /voiceService/);
  assert.doesNotMatch(championshipBoard, /speakWithClonedVoice/);
  assert.doesNotMatch(liveVideo, /speakWithClonedVoice/);
  assert.doesNotMatch(liveVideo, /voiceService/);
  assert.match(commentary, /commentary_listen/);
  assert.doesNotMatch(commentary, /speakWithClonedVoice/);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
