/**
 * Championship / Team Battle exit vs native beforeunload.
 *
 * Run with: npx tsx client/src/lib/navigationGuard.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyNativeBeforeUnload,
  beginIntentionalExit,
  clearAllProtections,
  clearIntentionalExit,
  findActiveProtection,
  isIntentionalExit,
  registerNavigationProtection,
  shouldPromptNativeBeforeUnload,
  teamBattleLeaveShouldProtect,
  unregisterNavigationProtection,
} from "./navigationGuard.ts";

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

function resetGuard() {
  clearAllProtections();
  clearIntentionalExit();
}

function fakeBeforeUnload() {
  let prevented = false;
  const event = {
    preventDefault() {
      prevented = true;
    },
    returnValue: "not-set" as string,
    wasNativePromptShown() {
      return prevented || event.returnValue === "";
    },
  };
  return event;
}

function registerPlayingProtection(id: string) {
  registerNavigationProtection(
    id,
    () =>
      teamBattleLeaveShouldProtect({
        hasGameSession: true,
        phase: "question",
        hasGameData: true,
        isIntentionalExit: isIntentionalExit(),
      }),
    async () => false,
  );
}

const root = process.cwd();
const teamBattleGame = readFileSync(
  resolve(root, "client/src/pages/TeamBattleGame.tsx"),
  "utf8",
);
const guardProvider = readFileSync(
  resolve(root, "client/src/components/NavigationGuardProvider.tsx"),
  "utf8",
);

console.log("navigation guard / championship exit");

test("A. Championship + custom exit confirmed → cleanup/navigation, no native prompt", () => {
  resetGuard();

  const championshipId = "team-battle-championship-match-1-11";
  let cleanupCalls = 0;
  let navigated = false;

  registerPlayingProtection(championshipId);
  assert.equal(shouldPromptNativeBeforeUnload(), true, "still playing: native prompt armed");

  const first = beginIntentionalExit(championshipId);
  assert.equal(first, true);
  assert.equal(isIntentionalExit(), true);
  cleanupCalls += 1;
  navigated = true;

  const event = fakeBeforeUnload();
  assert.equal(applyNativeBeforeUnload(event), false);
  assert.equal(event.wasNativePromptShown(), false);
  assert.equal(shouldPromptNativeBeforeUnload(), false);
  assert.equal(findActiveProtection(), null);
  assert.equal(cleanupCalls, 1);
  assert.equal(navigated, true);
});

test("B. Championship + Cancel → stay in match, protection unchanged", () => {
  resetGuard();

  const championshipId = "team-battle-championship-match-1-11";
  registerPlayingProtection(championshipId);

  assert.equal(isIntentionalExit(), false);
  assert.equal(shouldPromptNativeBeforeUnload(), true);

  const event = fakeBeforeUnload();
  assert.equal(applyNativeBeforeUnload(event), true);
  assert.equal(event.wasNativePromptShown(), true);
  assert.ok(findActiveProtection());
});

test("C. Direct refresh/close while playing → existing beforeunload protection remains", () => {
  resetGuard();
  registerPlayingProtection("team-battle-championship-match-1-11");

  assert.equal(
    teamBattleLeaveShouldProtect({
      hasGameSession: true,
      phase: "question",
      hasGameData: true,
      isIntentionalExit: false,
    }),
    true,
  );
  assert.equal(shouldPromptNativeBeforeUnload(), true);

  const event = fakeBeforeUnload();
  assert.equal(applyNativeBeforeUnload(event), true);
  assert.equal(event.wasNativePromptShown(), true);
});

test("D. Double-click Yes, Exit Game → only one exit/cleanup operation", () => {
  resetGuard();

  const championshipId = "team-battle-championship-match-1-11";
  registerPlayingProtection(championshipId);

  let cleanupCalls = 0;
  const confirmYes = () => {
    if (!beginIntentionalExit(championshipId)) return;
    cleanupCalls += 1;
  };

  confirmYes();
  confirmYes();
  confirmYes();

  assert.equal(cleanupCalls, 1);
  assert.equal(applyNativeBeforeUnload(fakeBeforeUnload()), false);
});

test("E. Normal Team Battle behavior remains unchanged while playing", () => {
  resetGuard();

  const normalId = "team-battle-regular-session-42";
  registerPlayingProtection(normalId);

  assert.equal(
    teamBattleLeaveShouldProtect({
      hasGameSession: true,
      phase: "playing",
      hasGameData: true,
      isIntentionalExit: false,
    }),
    true,
    "normal Team Battle in-match leave is still protected",
  );
  assert.equal(shouldPromptNativeBeforeUnload(), true);

  const refreshEvent = fakeBeforeUnload();
  assert.equal(applyNativeBeforeUnload(refreshEvent), true);
  assert.equal(isIntentionalExit(), false);
  assert.ok(findActiveProtection());
});

test("intentional-exit flag is set before unload can run (no timeout bypass)", () => {
  resetGuard();
  registerPlayingProtection("team-battle-championship-match-1-11");

  beginIntentionalExit("team-battle-championship-match-1-11");
  assert.equal(shouldPromptNativeBeforeUnload(), false);
});

test("Strict Mode remount of the same match does not re-arm native prompt during exit", () => {
  resetGuard();

  const id = "team-battle-championship-match-1-11";
  registerPlayingProtection(id);
  beginIntentionalExit(id);
  registerPlayingProtection(id);

  assert.equal(isIntentionalExit(), true);
  assert.equal(shouldPromptNativeBeforeUnload(), false);
});

test("a later different session restores native protection", () => {
  resetGuard();

  const first = "team-battle-championship-match-1-11";
  registerPlayingProtection(first);
  beginIntentionalExit(first);

  const next = "team-battle-championship-match-2-11";
  registerPlayingProtection(next);

  assert.equal(isIntentionalExit(), false);
  assert.equal(shouldPromptNativeBeforeUnload(), true);
});

test("finished match is not protected (existing behaviour)", () => {
  assert.equal(
    teamBattleLeaveShouldProtect({
      hasGameSession: true,
      phase: "finished",
      hasGameData: true,
    }),
    false,
  );
});

test("unrelated pages with no protection never prompt", () => {
  resetGuard();
  assert.equal(shouldPromptNativeBeforeUnload(), false);
  assert.equal(applyNativeBeforeUnload(fakeBeforeUnload()), false);
});

test("TeamBattleGame keeps custom Exit Team Battle modal wording", () => {
  assert.match(teamBattleGame, /Exit Team Battle\?/);
  assert.match(
    teamBattleGame,
    /Are you sure you want to leave the team battle\?/,
  );
  assert.match(teamBattleGame, /Yes, Exit Game/);
});

test("TeamBattleGame marks intentional exit before handleExitGame on Yes", () => {
  const yesIdx = teamBattleGame.indexOf("Yes, Exit Game");
  const yesHandler = teamBattleGame.slice(yesIdx - 900, yesIdx);
  const beginIdx = yesHandler.lastIndexOf("beginIntentionalExit");
  const handleIdx = yesHandler.lastIndexOf("handleExitGame()");
  assert.ok(beginIdx >= 0, "Yes handler must call beginIntentionalExit");
  assert.ok(handleIdx >= 0, "Yes handler must call handleExitGame");
  assert.ok(
    beginIdx < handleIdx,
    "beginIntentionalExit must run before handleExitGame",
  );
});

test("TeamBattleGame handleExitGame claims intentional exit before cleanup", () => {
  const start = teamBattleGame.indexOf("const handleExitGame = async () => {");
  const fn = teamBattleGame.slice(start, start + 700);
  const beginIdx = fn.indexOf("beginIntentionalExit");
  const guardIdx = fn.indexOf("exitCleanupStartedRef");
  assert.ok(beginIdx >= 0);
  assert.ok(guardIdx > beginIdx);
  assert.match(teamBattleGame, /window\.location\.replace/);
});

test("Cancel on the custom modal does not begin an intentional exit", () => {
  const modalStart = teamBattleGame.indexOf("Exit Team Battle?");
  const yesLabel = teamBattleGame.indexOf("Yes, Exit Game", modalStart);
  const modal = teamBattleGame.slice(modalStart, yesLabel);
  const cancelIdx = modal.lastIndexOf("Cancel");
  assert.ok(cancelIdx >= 0, "exit modal has a Cancel button");
  const cancelOnClick = modal.slice(
    modal.lastIndexOf("onClick", cancelIdx),
    cancelIdx,
  );
  assert.match(cancelOnClick, /confirmResolverRef\.current\(false\)/);
  assert.doesNotMatch(cancelOnClick, /beginIntentionalExit/);
});

test("double-click guard lives in handleExitGame", () => {
  const start = teamBattleGame.indexOf("const handleExitGame = async () => {");
  const fn = teamBattleGame.slice(start, start + 600);
  assert.match(fn, /exitCleanupStartedRef\.current/);
  assert.match(fn, /beginIntentionalExit/);
});

test("provider still registers beforeunload; bypass is not a setTimeout", () => {
  assert.match(guardProvider, /applyNativeBeforeUnload/);
  assert.match(guardProvider, /window\.addEventListener\("beforeunload"/);
  assert.doesNotMatch(
    teamBattleGame,
    /setTimeout\(\s*\(\)\s*=>\s*beginIntentionalExit/,
  );
});

test("Championship and normal Team Battle share the same leave predicate", () => {
  const playing = {
    hasGameSession: true,
    phase: "question" as const,
    hasGameData: true,
  };
  assert.equal(
    teamBattleLeaveShouldProtect({ ...playing, isIntentionalExit: false }),
    true,
  );
  assert.equal(
    teamBattleLeaveShouldProtect({ ...playing, isIntentionalExit: true }),
    false,
  );
});

test("unregister still drops an active protection", () => {
  resetGuard();
  registerPlayingProtection("x");
  unregisterNavigationProtection("x");
  assert.equal(findActiveProtection(), null);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
