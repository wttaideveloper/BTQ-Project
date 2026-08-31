/**
 * Broadcast / commentator desk tests.
 *
 * Run with: npx tsx client/src/lib/championship-broadcast.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  appendBroadcastEvent,
  broadcastPhase,
  broadcastResultCopy,
  broadcastStateLine,
  broadcastStateParts,
  broadcastStatusLabel,
  isBroadcastCleanMode,
  publicMatchExposesSession,
  spectatorOptionsLeakCorrectness,
} from "./championship-broadcast.ts";

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
const app = readFileSync(resolve(root, "client/src/App.tsx"), "utf8");
const page = readFileSync(resolve(root, "client/src/pages/BroadcastMatch.tsx"), "utf8");
const desk = readFileSync(resolve(root, "client/src/components/broadcast/BroadcastDesk.tsx"), "utf8");
const hook = readFileSync(resolve(root, "client/src/hooks/useChampionshipSpectator.ts"), "utf8");
const watchMatch = readFileSync(resolve(root, "client/src/pages/WatchMatch.tsx"), "utf8");
const css = readFileSync(resolve(root, "client/src/index.css"), "utf8");
const queryClient = readFileSync(resolve(root, "client/src/lib/queryClient.ts"), "utf8");
const socketServer = readFileSync(resolve(root, "server/socket.ts"), "utf8");
const championshipRoutes = readFileSync(resolve(root, "server/championship-routes.ts"), "utf8");
const watchQuestion = readFileSync(resolve(root, "client/src/components/watch/WatchQuestionPanel.tsx"), "utf8");

const overlayStart = watchMatch.indexOf("if (overlay) return (");
const overlayEnd = watchMatch.indexOf("Everything below is read from the match payload", overlayStart);
const overlayBlock = watchMatch.slice(overlayStart, overlayEnd);

console.log("championship broadcast / commentator desk");

test("route /broadcast/:matchId is registered as a public spectator page", () => {
  assert.match(app, /path="\/broadcast\/:matchId"/);
  assert.match(app, /location\.startsWith\("\/broadcast\/"\)/);
  assert.match(app, /<BroadcastMatch \/>/);
});

test("existing Watch Live and Overlay routes remain intact", () => {
  assert.match(app, /path="\/watch\/:matchId"/);
  assert.match(app, /<WatchMatch \/>/);
  assert.match(app, /path="\/overlay\/:matchId"/);
  assert.match(app, /<WatchMatch overlay \/>/);
});

test("broadcast is a public route so OBS is not bounced to login", () => {
  assert.match(queryClient, /pathname\.startsWith\("\/broadcast\/"\)/);
});

test("match information, teams, icons, and score render on the desk", () => {
  assert.match(desk, /FAITHIQ LIVE/);
  assert.match(desk, /championshipName/);
  assert.match(desk, /teamA\?\.name/);
  assert.match(desk, /teamB\?\.name/);
  assert.match(desk, /TeamAvatar/);
  assert.match(desk, /teamA\?\.logoUrl/);
  assert.match(desk, /teamA\?\.emoticon/);
  assert.match(desk, /teamB\?\.logoUrl/);
  assert.match(desk, /teamB\?\.emoticon/);
  assert.match(desk, /teamAScore/);
  assert.match(desk, /teamBScore/);
  assert.match(desk, /aria-label="Match score"/);
});

test("current question, active team, and answer options render", () => {
  assert.match(desk, /WatchQuestionPanel/);
  assert.match(desk, /variant="broadcast"/);
  assert.match(desk, /question\.answeringTeamId/);
  assert.match(desk, /question\.answeringTeamName/);
  assert.match(watchQuestion, /question\.questionText/);
  assert.match(watchQuestion, /question\.options\.map/);
  assert.match(watchQuestion, /LETTERS/);
  assert.match(watchQuestion, /break-words/);
});

test("correct answer is not leaked before resolution", () => {
  assert.equal(spectatorOptionsLeakCorrectness([{ id: "a", text: "Fisherman" }]), false);
  assert.equal(spectatorOptionsLeakCorrectness([{ id: "a", text: "Fisherman", isCorrect: true }]), true);
  const spectatorFn = socketServer.slice(
    socketServer.indexOf("function toSpectatorOptions"),
    socketServer.indexOf("async function championshipMatchForSession"),
  );
  assert.match(spectatorFn, /id: answer\.id/);
  assert.match(spectatorFn, /text: answer\.text/);
  assert.match(spectatorFn, /isCorrect is deliberately NOT copied/);
  assert.doesNotMatch(spectatorFn, /isCorrect: answer/);
  assert.match(watchQuestion, /correctness only exists here once `result` has arrived/);
  assert.match(desk, /questionResult/);
});

test("resolved result copy uses existing points, not invented scoring", () => {
  const correct = broadcastResultCopy({ answeringTeamName: "Team A", isCorrect: true, pointsAwarded: 100 });
  assert.equal(correct.headline, "TEAM A ANSWERED CORRECTLY");
  assert.equal(correct.points, "+100 POINTS");
  const wrong = broadcastResultCopy({ answeringTeamName: "Team B", isCorrect: false, pointsAwarded: 0 });
  assert.equal(wrong.headline, "TEAM B ANSWERED INCORRECTLY");
  assert.equal(wrong.points, "+0 POINTS");
  assert.match(desk, /broadcastResultCopy/);
  assert.match(hook, /pointsAwarded: e\.pointsAwarded \?\? 0/);
});

test("live events append from existing spectator events and stay capped", () => {
  const first = appendBroadcastEvent([], { tone: "question", label: "Question 7", detail: "Team A is answering" });
  const second = appendBroadcastEvent(first, { tone: "score", label: "Team A +100" });
  assert.equal(second[0].label, "Team A +100");
  assert.equal(second[1].label, "Question 7");
  let events = [];
  for (let i = 0; i < 12; i += 1) events = appendBroadcastEvent(events, { tone: "live", label: `e${i}` });
  assert.equal(events.length, 8);
  assert.match(hook, /type: "watch_match"/);
  assert.match(hook, /onEvent\("question_started"/);
  assert.match(hook, /onEvent\("question_answered"/);
  assert.match(hook, /onEvent\("match_updated"/);
  assert.match(hook, /onEvent\("match_ended"/);
  assert.match(desk, /Recent events/);
});

test("completed match renders winner / final state", () => {
  assert.equal(broadcastPhase({ status: "completed", gameplayStarted: false, toss: null, question: null }), "completed");
  assert.equal(
    broadcastStateLine({ phase: "completed", winnerName: "Faith Titans", isDraw: false }),
    "MATCH COMPLETE · FAITH TITANS WINS",
  );
  assert.equal(broadcastStateLine({ phase: "completed", isDraw: true }), "MATCH COMPLETE · DRAW");
  assert.match(desk, /Match complete/);
  assert.match(desk, /winnerName/);
});

test("status labels use existing match status", () => {
  assert.equal(broadcastStatusLabel("live", "question"), "LIVE");
  assert.equal(broadcastStatusLabel("upcoming", "upcoming"), "WAITING");
  assert.equal(broadcastStatusLabel("completed", "completed"), "COMPLETED");
  assert.equal(broadcastStatusLabel("cancelled", "waiting"), "CANCELLED");
  assert.equal(
    broadcastStateLine({
      phase: "question",
      question: { questionId: "q1", questionNumber: 8, totalQuestions: 20, options: [], answeringTeamName: "Team B" },
      answeringTeamName: "Team B",
    }),
    "QUESTION 8 / 20 · TEAM B'S TURN",
  );
  assert.equal(broadcastStateLine({ phase: "toss" }), "TOSS QUESTION");
  const questionState = broadcastStateParts({
    phase: "question",
    question: { questionId: "q1", questionNumber: 2, totalQuestions: 10, options: [] },
    answeringTeamName: "Team A",
  });
  assert.equal(questionState.kicker, "QUESTION 2 / 10");
  assert.equal(questionState.headline, "TEAM A'S TURN");
  assert.equal(broadcastStateParts({ phase: "toss" }).headline, "TOSS QUESTION");
});

test("no gameplay controls, answer submission, or score mutation exist", () => {
  for (const source of [page, desk, hook]) {
    assert.doesNotMatch(source, /Start Match/);
    assert.doesNotMatch(source, /End Match/);
    assert.doesNotMatch(source, /submit_team_answer/);
    assert.doesNotMatch(source, /start_team_battle/);
    assert.doesNotMatch(source, /end_match/);
    assert.doesNotMatch(source, /skip_question/);
    assert.doesNotMatch(source, /captain_ready/);
    assert.doesNotMatch(source, /type:\s*"toss"/);
    assert.doesNotMatch(source, /<button/i);
    assert.doesNotMatch(source, /onClick=\{/);
  }
  assert.doesNotMatch(desk, /<Button/);
  assert.doesNotMatch(hook, /sendGameEvent\(\{ type: "(?!watch_match)/);
});

test("no HLS stream, camera, or microphone is mounted on broadcast", () => {
  assert.doesNotMatch(page, /Hls/);
  assert.doesNotMatch(page, /<video/);
  assert.doesNotMatch(desk, /<video/);
  assert.doesNotMatch(page, /getUserMedia/);
  assert.doesNotMatch(desk, /getUserMedia/);
  assert.doesNotMatch(page, /WatchSoundControl/);
});

test("internal gameSessionId is not exposed on the public match or broadcast page", () => {
  assert.equal(publicMatchExposesSession({}), false);
  assert.equal(publicMatchExposesSession({ gameSessionId: "secret" }), true);
  assert.match(championshipRoutes, /const \{ gameSessionId: _internal, \.\.\.publicFields \} = match/);
  assert.doesNotMatch(page, /gameSessionId/);
  assert.doesNotMatch(desk, /gameSessionId/);
  assert.doesNotMatch(hook, /gameSessionId/);
});

test("optional clean mode hides the events rail for OBS", () => {
  assert.equal(isBroadcastCleanMode("?clean=1"), true);
  assert.equal(isBroadcastCleanMode("clean=1"), true);
  assert.equal(isBroadcastCleanMode(""), false);
  assert.match(page, /isBroadcastCleanMode/);
  assert.match(desk, /!clean &&/);
  assert.match(desk, /broadcast-body-clean/);
  assert.match(desk, /broadcast-events/);
});

test("responsive structure avoids fixed-width overflow", () => {
  assert.match(page, /overflow-x-hidden/);
  assert.match(desk, /overflow-x-hidden/);
  assert.match(desk, /broadcast-scoreboard/);
  assert.match(desk, /broadcast-header/);
  assert.match(css, /\.broadcast-desk \{/);
  assert.match(css, /width: min\(100%, 90rem\)/);
  assert.match(css, /broadcast-score-flash/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(min-width: 1280px\)/);
  assert.match(css, /@media \(max-width: 479px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("Watch Live question panel stays on the default watch variant", () => {
  assert.match(watchMatch, /<WatchQuestionPanel/);
  assert.doesNotMatch(watchMatch, /variant="broadcast"/);
  assert.match(watchQuestion, /variant = "watch"/);
  assert.match(watchQuestion, /truncate text-sm/);
});

test("existing overlay route remains a transparent score bar", () => {
  assert.ok(overlayStart > 0);
  assert.match(overlayBlock, /bg-transparent/);
  assert.doesNotMatch(overlayBlock, /BroadcastDesk/);
  assert.doesNotMatch(overlayBlock, /<video/);
});

test("Watch Live still plays HLS independently of broadcast", () => {
  assert.match(watchMatch, /new Hls\(/);
  assert.match(watchMatch, /WatchSoundControl/);
  assert.doesNotMatch(page, /streamUrl/);
});

test("spectator hook reuses watch_match and does not open a second socket API", () => {
  assert.match(hook, /setupGameSocket\(\)/);
  assert.match(hook, /sendGameEvent\(\{ type: "watch_match", matchId \}\)/);
  assert.match(hook, /\/api\/championship-matches/);
  assert.doesNotMatch(hook, /new WebSocket/);
  assert.doesNotMatch(hook, /setInterval/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
