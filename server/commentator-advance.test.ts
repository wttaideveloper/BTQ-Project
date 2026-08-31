/**
 * Commentator role, assignment, and NEXT QUESTION engine tests.
 *
 * Run with: npx tsx server/commentator-advance.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateCommentatorAdvance,
  isChampionshipTeamBattleId,
  sessionLooksLikeChampionship,
  shouldWaitForCommentatorAdvance,
} from "./commentator-advance.ts";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
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

await test("championship battle ids are detected without treating regular Team Battle uuids as championship", () => {
  assert.equal(isChampionshipTeamBattleId("championship-abc"), true);
  assert.equal(isChampionshipTeamBattleId("3f1c8e2a-9b44-4d11-a111-222233334444"), false);
  assert.equal(sessionLooksLikeChampionship([{ teamBattleId: "championship-m1" }]), true);
  assert.equal(sessionLooksLikeChampionship([{ teamBattleId: "3f1c8e2a-9b44-4d11-a111-222233334444" }]), false);
});

await test("championship matches wait for commentator only when a next question exists", () => {
  assert.equal(shouldWaitForCommentatorAdvance({ isChampionship: true, remainingQuestions: 3 }), true);
  assert.equal(shouldWaitForCommentatorAdvance({ isChampionship: true, remainingQuestions: 0 }), false);
  assert.equal(shouldWaitForCommentatorAdvance({ isChampionship: false, remainingQuestions: 3 }), false);
});

await test("NEXT QUESTION is rejected while toss is active", () => {
  const decision = evaluateCommentatorAdvance({
    matchStatus: "live",
    gameplayStarted: true,
    phase: "toss",
    isProcessingAnswers: false,
    inFlight: false,
    waitingForCommentator: true,
    hasQuestionTimeout: false,
    nextIndex: 0,
    questionCount: 10,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.message, /toss/i);
});

await test("NEXT QUESTION is rejected while a team is still answering", () => {
  const decision = evaluateCommentatorAdvance({
    matchStatus: "live",
    gameplayStarted: true,
    phase: "question",
    isProcessingAnswers: false,
    inFlight: false,
    waitingForCommentator: false,
    hasQuestionTimeout: true,
    nextIndex: 0,
    questionCount: 10,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.message, /answering/i);
});

await test("NEXT QUESTION is enabled only after the current question is scored", () => {
  const waiting = evaluateCommentatorAdvance({
    matchStatus: "live",
    gameplayStarted: true,
    phase: "question",
    isProcessingAnswers: false,
    inFlight: false,
    waitingForCommentator: true,
    hasQuestionTimeout: false,
    nextIndex: 1,
    questionCount: 10,
  });
  assert.deepEqual(waiting, { ok: true });
});

await test("double NEXT QUESTION is rejected while an advance is in flight", () => {
  const decision = evaluateCommentatorAdvance({
    matchStatus: "live",
    gameplayStarted: true,
    phase: "question",
    isProcessingAnswers: false,
    inFlight: true,
    waitingForCommentator: true,
    hasQuestionTimeout: false,
    nextIndex: 1,
    questionCount: 10,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.message, /already in progress/i);
});

await test("NEXT QUESTION cannot skip past the last question", () => {
  const decision = evaluateCommentatorAdvance({
    matchStatus: "live",
    gameplayStarted: true,
    phase: "question",
    isProcessingAnswers: false,
    inFlight: false,
    waitingForCommentator: true,
    hasQuestionTimeout: false,
    nextIndex: 10,
    questionCount: 10,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.message, /no next question/i);
});

await test("NEXT QUESTION is rejected when the match is not live", () => {
  const decision = evaluateCommentatorAdvance({
    matchStatus: "completed",
    gameplayStarted: true,
    waitingForCommentator: true,
    isProcessingAnswers: false,
    inFlight: false,
    hasQuestionTimeout: false,
    nextIndex: 1,
    questionCount: 10,
  });
  assert.equal(decision.ok, false);
});

import {
  ACTIVE_CHAMPIONSHIP_STATUS,
  filterMatchesForActiveChampionships,
  groupCommentatorDeskMatches,
  isActiveChampionshipStatus,
  toPublicCommentatorTeam,
} from "./commentator-access.ts";

const socketSource = read("server/socket.ts");
const routesSource = read("server/routes.ts");
const championshipRoutesSource = read("server/championship-routes.ts");
const commentatorRoutesSource = read("server/commentator-routes.ts");
const schemaSource = read("shared/schema.ts");
const dashboardSource = read("client/src/pages/CommentatorDashboard.tsx");
const matchDeskSource = read("client/src/pages/CommentatorMatchDesk.tsx");
const adminPanelSource = read("client/src/components/admin/ChampionshipManagementPanel.tsx");

await test("schema keeps isCommentator independent of isAdmin and retains commentator_user_id for compatibility", () => {
  assert.match(schemaSource, /isCommentator: boolean\("is_commentator"\)\.default\(false\)/);
  assert.match(schemaSource, /commentatorUserId: integer\("commentator_user_id"\)/);
});

await test("ensureCommentator requires an authenticated commentator and rejects admins", () => {
  assert.match(routesSource, /function ensureCommentator/);
  assert.match(routesSource, /req\.user\.isCommentator && !req\.user\.isAdmin/);
  assert.match(routesSource, /registerCommentatorRoutes\(app, ensureCommentator\)/);
  assert.match(routesSource, /status\(401\).*Authentication required/s);
  assert.match(routesSource, /Commentator access required/);
});

await test("global commentator dashboard does not require championship assignment", () => {
  assert.doesNotMatch(commentatorRoutesSource, /commentatorUserId/);
  assert.doesNotMatch(commentatorRoutesSource, /assignedChampionship/);
  assert.doesNotMatch(dashboardSource, /No championship assigned/);
  assert.match(commentatorRoutesSource, /app\.get\("\/api\/commentator\/dashboard", ensureCommentator/);
  assert.match(commentatorRoutesSource, /liveMatches/);
  assert.match(dashboardSource, /liveMatches/);
});

await test("commentator dashboard SQL-filters to active championships only", () => {
  assert.equal(ACTIVE_CHAMPIONSHIP_STATUS, "active");
  assert.equal(isActiveChampionshipStatus("active"), true);
  assert.equal(isActiveChampionshipStatus("draft"), false);
  assert.equal(isActiveChampionshipStatus("completed"), false);
  assert.match(commentatorRoutesSource, /innerJoin\(championships, eq\(championshipMatches\.championshipId, championships\.id\)\)/);
  assert.match(commentatorRoutesSource, /eq\(championships\.status, ACTIVE_CHAMPIONSHIP_STATUS\)/);
  assert.doesNotMatch(dashboardSource, /status === "active"/);
});

await test("active championship matches appear; draft and completed championship matches do not", () => {
  const championships = [
    { id: "active", status: "active" },
    { id: "draft", status: "draft" },
    { id: "done", status: "completed" },
  ];
  const matches = [
    { id: "live-active", championshipId: "active", status: "live" },
    { id: "upcoming-active", championshipId: "active", status: "upcoming" },
    { id: "recent-active", championshipId: "active", status: "completed" },
    { id: "live-draft", championshipId: "draft", status: "live" },
    { id: "live-completed-champ", championshipId: "done", status: "live" },
    { id: "done-completed-champ", championshipId: "done", status: "completed" },
  ];
  const visible = filterMatchesForActiveChampionships(matches, championships);
  assert.deepEqual(visible.map(item => item.id), ["live-active", "upcoming-active", "recent-active"]);
});

await test("global commentator can see live matches first and open a match without assignment", () => {
  const grouped = groupCommentatorDeskMatches([
    { id: "done", status: "completed", completedAt: "2026-01-01T12:00:00Z" },
    { id: "soon", status: "upcoming", scheduledAt: "2026-09-02T18:00:00Z" },
    { id: "live-old", status: "live", startedAt: "2026-09-01T10:00:00Z" },
    { id: "live-new", status: "live", startedAt: "2026-09-01T12:00:00Z" },
  ]);
  assert.deepEqual(grouped.live.map(item => item.id), ["live-new", "live-old"]);
  assert.deepEqual(grouped.upcoming.map(item => item.id), ["soon"]);
  assert.deepEqual(grouped.recent.map(item => item.id), ["done"]);
  assert.match(commentatorRoutesSource, /app\.get\("\/api\/commentator\/matches\/:id", ensureCommentator/);
  assert.match(matchDeskSource, /\/api\/commentator\/matches\/\$\{matchId\}/);
  assert.doesNotMatch(matchDeskSource, /assigned/);
});

await test("commentator match payloads strip gameSessionId and private roster fields", () => {
  assert.match(commentatorRoutesSource, /gameSessionId: _internal/);
  assert.match(commentatorRoutesSource, /toPublicCommentatorTeam/);
  const publicTeam = toPublicCommentatorTeam({
    id: "t1",
    name: "Alpha",
    emoticon: "🔥",
    logoUrl: "/logo.png",
    memberIds: [1, 2, 3],
    captainId: 1,
  } as never);
  assert.deepEqual(publicTeam, { id: "t1", name: "Alpha", emoticon: "🔥", logoUrl: "/logo.png" });
  assert.equal(Object.prototype.hasOwnProperty.call(publicTeam, "memberIds"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(publicTeam, "captainId"), false);
});

await test("admin assignment endpoint remains admin-only and is no longer required by commentator UI", () => {
  assert.match(championshipRoutesSource, /app\.put\("\/api\/championships\/:id\/commentator", ensureAdmin/);
  assert.doesNotMatch(adminPanelSource, /\/api\/championships\/\$\{selected\}\/commentator/);
  assert.match(adminPanelSource, /You do not need to assign a commentator/);
});

await test("non-admin cannot assign commentator through the championship details PATCH", () => {
  assert.match(championshipRoutesSource, /app\.patch\("\/api\/championships\/:id", ensureAdmin/);
  const fieldsStart = championshipRoutesSource.indexOf("const championshipFields = z.object({");
  const fieldsEnd = championshipRoutesSource.indexOf("});", fieldsStart);
  const fieldsBlock = championshipRoutesSource.slice(fieldsStart, fieldsEnd);
  assert.doesNotMatch(fieldsBlock, /commentatorUserId/);
});

await test("NEXT QUESTION is commentator-only, not assignment-based, and reuses sendTeamBattleQuestion", () => {
  assert.match(commentatorRoutesSource, /app\.post\("\/api\/commentator\/matches\/:id\/next-question", ensureCommentator/);
  assert.match(commentatorRoutesSource, /assertChampionshipMatch\(req\.params\.id\)/);
  assert.match(commentatorRoutesSource, /advanceChampionshipQuestion/);
  assert.doesNotMatch(commentatorRoutesSource, /commentatorUserId/);
  assert.match(socketSource, /export async function advanceChampionshipQuestion/);
  assert.match(socketSource, /sendTeamBattleQuestion\(session\.id\)/);
});

await test("inactive championships cannot be opened or advanced by the commentator", () => {
  assert.match(commentatorRoutesSource, /isActiveChampionshipStatus\(championship\.status\)/);
  assert.match(commentatorRoutesSource, /CommentatorAdvanceError\(403, "This championship is not active\."\)/);
  assert.match(matchDeskSource, /This championship is not active\./);
  assert.match(matchDeskSource, /championship is not active/i);
});

await test("NEXT QUESTION still requires a championship match and keeps gameplay safety checks", () => {
  assert.match(commentatorRoutesSource, /championshipMatches/);
  assert.match(commentatorRoutesSource, /match\.championshipId/);
  assert.match(socketSource, /Only a live match can be advanced|evaluateCommentatorAdvance/);
  assert.match(socketSource, /commentatorAdvanceInFlight/);
});

await test("championship auto-advance is replaced by a wait; regular Team Battle keeps the 3 second delay", () => {
  assert.match(socketSource, /shouldWaitForCommentatorAdvance/);
  assert.match(socketSource, /sessionLooksLikeChampionship\(gameSession\.teams\)/);
  assert.match(socketSource, /3000\); \/\/ 3 seconds to show results before next question/);
  assert.match(socketSource, /gameSession\.waitingForCommentatorAdvance = true/);
});

await test("rapid fire pipeline is not used by commentator advance", () => {
  assert.doesNotMatch(commentatorRoutesSource, /sendRapidFireQuestion/);
  const start = socketSource.indexOf("export async function advanceChampionshipQuestion");
  const end = socketSource.indexOf("\nexport ", start + 1);
  const advanceFn = socketSource.slice(start, end === -1 ? start + 1200 : end);
  assert.match(advanceFn, /sendTeamBattleQuestion\(session\.id\)/);
  assert.doesNotMatch(advanceFn, /sendRapidFireQuestion/);
});

await test("commentator restore uses sanitized watch_match state, not get_game_state or team_battle_question", () => {
  assert.doesNotMatch(commentatorRoutesSource, /get_game_state/);
  assert.doesNotMatch(commentatorRoutesSource, /team_battle_question/);
  assert.match(matchDeskSource, /watch_match/);
  assert.doesNotMatch(matchDeskSource, /get_game_state/);
  assert.doesNotMatch(matchDeskSource, /team_battle_question/);
});

await test("Watch Live still listens for question_started after commentator advance", () => {
  const watchSource = read("client/src/pages/WatchMatch.tsx");
  assert.match(watchSource, /onEvent\("question_started"/);
  assert.match(watchSource, /onEvent\("question_answered"/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
