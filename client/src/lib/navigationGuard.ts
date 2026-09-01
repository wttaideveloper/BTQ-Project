type Protection = {
  id: string;
  shouldProtect: () => boolean;
  confirmLeave: () => Promise<boolean>;
};

type NativeBeforeUnloadEvent = {
  preventDefault: () => void;
  returnValue: string;
};

const protections: Record<string, Protection> = {};

/**
 * Module-level intentional-exit flag. Set synchronously when the user confirms
 * the in-app Exit modal, before any async cleanup or `location.replace`.
 *
 * Lives outside React so Strict Mode remounts of the same match cannot clear it
 * and re-arm the native "Leave site?" dialog mid-exit.
 */
let intentionalExit = false;
let intentionalExitProtectionId: string | null = null;

export function isIntentionalExit(): boolean {
  return intentionalExit;
}

/**
 * Mark the current leave as user-confirmed. Must run before cleanup/navigation
 * so `beforeunload` cannot race ahead of the flag (JS is single-threaded; this
 * is the first statement, not a timeout).
 *
 * Returns `true` on the first claim so callers can run cleanup once.
 */
export function beginIntentionalExit(protectionId?: string): boolean {
  const firstClaim = !intentionalExit;
  intentionalExit = true;
  if (protectionId) {
    intentionalExitProtectionId = protectionId;
    unregisterNavigationProtection(protectionId);
  }
  return firstClaim;
}

export function clearIntentionalExit() {
  intentionalExit = false;
  intentionalExitProtectionId = null;
}

export function registerNavigationProtection(
  id: string,
  shouldProtect: () => boolean,
  confirmLeave: () => Promise<boolean>
) {
  // A different protection id means a new session after the previous page left.
  // Remounting the same match (Strict Mode) keeps the in-flight exit flag.
  if (
    intentionalExit &&
    intentionalExitProtectionId &&
    intentionalExitProtectionId !== id
  ) {
    clearIntentionalExit();
  }
  protections[id] = { id, shouldProtect, confirmLeave };
}

export function unregisterNavigationProtection(id: string) {
  delete protections[id];
}

export function findActiveProtection(): Protection | null {
  if (intentionalExit) return null;
  for (const key of Object.keys(protections)) {
    const p = protections[key];
    try {
      if (p.shouldProtect()) return p;
    } catch (_) {
      // ignore error from user-provided predicate
    }
  }
  return null;
}

export function clearAllProtections() {
  for (const k of Object.keys(protections)) delete protections[k];
}

/**
 * Same predicate Team Battle / Championship use when registering protection.
 * `isIntentionalExit` lets a confirmed custom-modal leave drop protection
 * without waiting for unmount.
 */
export function teamBattleLeaveShouldProtect(opts: {
  hasGameSession: boolean;
  phase?: string | null;
  hasGameData: boolean;
  isIntentionalExit?: boolean;
}): boolean {
  if (opts.isIntentionalExit) return false;
  const isFinished = opts.phase === "finished";
  return (
    opts.hasGameSession &&
    !isFinished &&
    ((!!opts.phase && opts.phase !== "waiting") || opts.hasGameData)
  );
}

/**
 * Whether the global `beforeunload` listener should ask the browser for the
 * native "Leave site?" dialog. Intentional in-app exit must return false even
 * if a protection is still registered (async cleanup has not unmounted yet).
 */
export function shouldPromptNativeBeforeUnload(): boolean {
  if (intentionalExit) return false;
  return findActiveProtection() !== null;
}

/**
 * Apply the native beforeunload prompt when protection is still active and the
 * user has not confirmed the in-app Exit modal. Returns true if the native
 * dialog would be shown.
 */
export function applyNativeBeforeUnload(event: NativeBeforeUnloadEvent): boolean {
  if (!shouldPromptNativeBeforeUnload()) return false;
  event.preventDefault();
  event.returnValue = "";
  return true;
}

export default {
  registerNavigationProtection,
  unregisterNavigationProtection,
  findActiveProtection,
  clearAllProtections,
  beginIntentionalExit,
  clearIntentionalExit,
  isIntentionalExit,
  shouldPromptNativeBeforeUnload,
  applyNativeBeforeUnload,
  teamBattleLeaveShouldProtect,
};
