/**
 * Championship commentator-wait player status tests.
 *
 * Run with: npx tsx client/src/lib/championship-commentator-wait.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  championshipShouldWaitAfterResults,
  shouldShowChampionshipCommentatorWait,
} from "./championship-commentator-wait.ts";

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

console.log("championship commentator wait");

test("championship scored question with more questions remaining waits", () => {
  assert.equal(
    championshipShouldWaitAfterResults({
      isChampionship: true,
      questionNumber: 2,
      totalQuestions: 10,
    }),
    true,
  );
});

test("last championship question does not wait for commentator", () => {
  assert.equal(
    championshipShouldWaitAfterResults({
      isChampionship: true,
      questionNumber: 10,
      totalQuestions: 10,
    }),
    false,
  );
});

test("regular Team Battle never waits for commentator", () => {
  assert.equal(
    championshipShouldWaitAfterResults({
      isChampionship: false,
      questionNumber: 2,
      totalQuestions: 10,
    }),
    false,
  );
});

test("Rapid Fire never waits for commentator", () => {
  assert.equal(
    championshipShouldWaitAfterResults({
      isChampionship: true,
      isRapidFire: true,
      questionNumber: 2,
      totalQuestions: 10,
    }),
    false,
  );
});

test("waiting banner only while championship question phase after results", () => {
  assert.equal(
    shouldShowChampionshipCommentatorWait({
      isChampionship: true,
      waitingForCommentator: true,
      phase: "question",
    }),
    true,
  );
});

test("do not show while still answering / before results", () => {
  assert.equal(
    shouldShowChampionshipCommentatorWait({
      isChampionship: true,
      waitingForCommentator: false,
      phase: "question",
    }),
    false,
  );
});

test("do not show during toss", () => {
  assert.equal(
    shouldShowChampionshipCommentatorWait({
      isChampionship: true,
      waitingForCommentator: true,
      phase: "toss",
      isToss: true,
    }),
    false,
  );
});

test("do not show after match completed", () => {
  assert.equal(
    shouldShowChampionshipCommentatorWait({
      isChampionship: true,
      waitingForCommentator: true,
      phase: "finished",
    }),
    false,
  );
});

test("next question arrival clears the wait (waiting flag false)", () => {
  assert.equal(
    shouldShowChampionshipCommentatorWait({
      isChampionship: true,
      waitingForCommentator: false,
      phase: "question",
    }),
    false,
  );
});

const teamBattleGame = read("client/src/pages/TeamBattleGame.tsx");
const questionBoard = read("client/src/components/championship/game/ChampionshipQuestionBoard.tsx");
const answerResult = read("client/src/components/championship/game/ChampionshipAnswerResult.tsx");
const waitUi = read("client/src/components/championship/game/ChampionshipCommentatorWait.tsx");
const teamBattleBoard = read("client/src/components/TeamBattleQuestionBoard.tsx");
const commentatorDesk = read("client/src/pages/CommentatorMatchDesk.tsx");

test("player UI has no Next question control", () => {
  assert.doesNotMatch(waitUi, />\s*Next question\s*</);
  assert.doesNotMatch(questionBoard, />\s*Next question\s*</);
  assert.doesNotMatch(answerResult, />\s*Next question\s*</);
  assert.match(commentatorDesk, /"Next question"/);
});

test("player wait copy and microphone are present", () => {
  assert.match(waitUi, /Waiting for commentator/);
  assert.match(waitUi, /The commentator will start the next question shortly/);
  assert.match(waitUi, /<Mic /);
});

test("TeamBattleGame latches wait on results and clears on the next question", () => {
  assert.match(teamBattleGame, /setChampionshipWaitingForCommentator/);
  assert.match(teamBattleGame, /championshipShouldWaitAfterResults/);
  assert.match(teamBattleGame, /applyBattleQuestionFromEvent/);
  assert.match(teamBattleGame, /waitingForCommentator=\{showChampionshipCommentatorWait\}/);
});

test("regular TeamBattleQuestionBoard default skin does not import commentator wait UI", () => {
  assert.doesNotMatch(teamBattleBoard, /ChampionshipCommentatorWait/);
  assert.match(teamBattleBoard, /waitingForCommentator=\{waitingForCommentator\}/);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
