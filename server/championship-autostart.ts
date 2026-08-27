/**
 * Server-side championship automatic match start.
 *
 * Controlled by CHAMPIONSHIP_AUTO_START_ENABLED (default false). When enabled,
 * due upcoming matches in active championships are started with the same
 * startChampionshipMatch() path as the admin Start Match action.
 *
 * A single next-event timer fires at the earliest eligible scheduledAt. The
 * 30-second sweep remains as a safety net. This module must not start toss,
 * questions, or Team Battle gameplay.
 */

export const CHAMPIONSHIP_AUTO_START_INTERVAL_MS = 30_000;
export const MAX_AUTO_START_WAKE_DELAY_MS = 2_147_483_647;
const autoStartRuntimeKey = Symbol.for("bibletriv.championshipAutoStartRuntime");

export type AutoStartMatch = {
  id: string;
  championshipId: string;
  status: string;
  scheduledAt: Date | string | null;
};

export type AutoStartChampionshipSlice = {
  championshipId: string;
  championshipStatus: string;
  liveMatchId: string | null;
  upcoming: AutoStartMatch[];
};

export type AutoStartDecision =
  | { action: "start"; matchId: string; championshipId: string }
  | { action: "skip-live"; championshipId: string; dueMatchId: string }
  | { action: "none"; championshipId: string };

export type AutoStartSweepResult = {
  started: string[];
  skippedLive: string[];
  disabled: boolean;
};

type AutoStartLogger = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type AutoStartSweepOptions = {
  enabled?: boolean;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  completeExpired?: () => Promise<unknown>;
  loadSlices?: (now: Date) => Promise<AutoStartChampionshipSlice[]>;
  startMatch?: (matchId: string) => Promise<unknown>;
  log?: AutoStartLogger;
};

export type ChampionshipAutoStartRuntimeDeps = {
  enabled?: () => boolean;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  completeExpired?: () => Promise<unknown>;
  loadSlices?: (now: Date) => Promise<AutoStartChampionshipSlice[]>;
  startMatch?: (matchId: string) => Promise<unknown>;
  runSweep?: (options?: AutoStartSweepOptions) => Promise<AutoStartSweepResult>;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  setInterval?: typeof setInterval;
  log?: AutoStartLogger;
};

export type ChampionshipAutoStartRuntime = {
  notify: () => Promise<void>;
  start: () => void;
};

export function isChampionshipAutoStartEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CHAMPIONSHIP_AUTO_START_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function scheduledAtMs(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function isUpcomingMatchDue(match: AutoStartMatch, now: Date): boolean {
  if (match.status !== "upcoming") return false;
  const ms = scheduledAtMs(match.scheduledAt);
  if (ms == null) return false;
  return ms <= now.getTime();
}

/** Pick at most one due match per championship: the earliest scheduledAt. */
export function decideChampionshipAutoStart(slice: AutoStartChampionshipSlice, now: Date): AutoStartDecision {
  if (slice.championshipStatus !== "active") {
    return { action: "none", championshipId: slice.championshipId };
  }

  const due = slice.upcoming
    .filter(match => isUpcomingMatchDue(match, now))
    .sort((a, b) => {
      const delta = (scheduledAtMs(a.scheduledAt) ?? 0) - (scheduledAtMs(b.scheduledAt) ?? 0);
      return delta !== 0 ? delta : a.id.localeCompare(b.id);
    });
  const earliest = due[0];
  if (!earliest) return { action: "none", championshipId: slice.championshipId };
  if (slice.liveMatchId) {
    return { action: "skip-live", championshipId: slice.championshipId, dueMatchId: earliest.id };
  }
  return { action: "start", matchId: earliest.id, championshipId: slice.championshipId };
}

/**
 * Earliest scheduledAt that this process should wake for.
 * Championships with a live match are skipped until that match ends.
 */
export function nextAutoStartWakeAt(slices: AutoStartChampionshipSlice[], _now: Date): Date | null {
  let earliest: number | null = null;
  for (const slice of slices) {
    if (slice.championshipStatus !== "active") continue;
    if (slice.liveMatchId) continue;
    for (const match of slice.upcoming) {
      if (match.status !== "upcoming") continue;
      const ms = scheduledAtMs(match.scheduledAt);
      if (ms == null) continue;
      if (earliest == null || ms < earliest) earliest = ms;
    }
  }
  if (earliest == null) return null;
  return new Date(earliest);
}

export function delayMsUntilAutoStartWake(wakeAt: Date | null, now: Date): number | null {
  if (!wakeAt) return null;
  return Math.min(MAX_AUTO_START_WAKE_DELAY_MS, Math.max(0, wakeAt.getTime() - now.getTime()));
}

function isStartConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { status?: unknown }).status === 409;
}

function defaultLog(): AutoStartLogger {
  return {
    info: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
  };
}

async function loadChampionshipAutoStartSlices(_now: Date): Promise<AutoStartChampionshipSlice[]> {
  const { eq } = await import("drizzle-orm");
  const { database } = await import("./database");
  const { championships, championshipMatches } = await import("@shared/schema");
  const db = database.db;

  const active = await db.select({
    id: championships.id,
    status: championships.status,
  }).from(championships).where(eq(championships.status, "active"));

  const slices: AutoStartChampionshipSlice[] = [];
  for (const championship of active) {
    const matches = await db.select({
      id: championshipMatches.id,
      championshipId: championshipMatches.championshipId,
      status: championshipMatches.status,
      scheduledAt: championshipMatches.scheduledAt,
    }).from(championshipMatches).where(eq(championshipMatches.championshipId, championship.id));

    slices.push({
      championshipId: championship.id,
      championshipStatus: championship.status,
      liveMatchId: matches.find(item => item.status === "live")?.id ?? null,
      upcoming: matches.filter(item => item.status === "upcoming"),
    });
  }
  return slices;
}

async function startMatchDefault(matchId: string) {
  const { startChampionshipMatch } = await import("./championship-match-start");
  return startChampionshipMatch(matchId);
}

export async function runChampionshipAutoStartSweep(
  options: AutoStartSweepOptions = {},
): Promise<AutoStartSweepResult> {
  const started: string[] = [];
  const skippedLive: string[] = [];
  const enabled = options.enabled ?? isChampionshipAutoStartEnabled(options.env);
  if (!enabled) return { started, skippedLive, disabled: true };

  const now = options.now ?? new Date();
  const log = options.log ?? defaultLog();

  try {
    await (options.completeExpired ?? (async () => {
      const { completeExpiredChampionships } = await import("./championship-lifecycle");
      await completeExpiredChampionships(now);
    }))();
  } catch (error) {
    log.error("[Championship Auto Start] Failed to complete expired championships:", error);
  }

  let slices: AutoStartChampionshipSlice[] = [];
  try {
    slices = await (options.loadSlices ?? loadChampionshipAutoStartSlices)(now);
  } catch (error) {
    log.error("[Championship Auto Start] Failed to load scheduled matches:", error);
    return { started, skippedLive, disabled: false };
  }

  const decisions = slices.map(slice => decideChampionshipAutoStart(slice, now));
  if (decisions.some(decision => decision.action !== "none")) {
    log.info("[Championship Auto Start] Checking scheduled matches");
  }

  const startMatch = options.startMatch ?? startMatchDefault;
  for (const decision of decisions) {
    if (decision.action === "none") continue;
    if (decision.action === "skip-live") {
      log.info(`[Championship Auto Start] Skipping championship ${decision.championshipId} because another match is live`);
      skippedLive.push(decision.championshipId);
      continue;
    }

    try {
      log.info(`[Championship Auto Start] Starting match ${decision.matchId} for championship ${decision.championshipId}`);
      await startMatch(decision.matchId);
      log.info(`[Championship Auto Start] Match ${decision.matchId} started successfully`);
      started.push(decision.matchId);
    } catch (error) {
      if (isStartConflict(error)) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("already live")) {
          log.info(`[Championship Auto Start] Skipping championship ${decision.championshipId} because another match is live`);
          skippedLive.push(decision.championshipId);
        } else {
          log.info(`[Championship Auto Start] Match ${decision.matchId} was not started (${message})`);
        }
        continue;
      }
      log.error(
        `[Championship Auto Start] Failed to start match ${decision.matchId} for championship ${decision.championshipId}:`,
        error,
      );
    }
  }

  return { started, skippedLive, disabled: false };
}

export function createChampionshipAutoStartRuntime(
  deps: ChampionshipAutoStartRuntimeDeps = {},
): ChampionshipAutoStartRuntime {
  const enabled = () => deps.enabled?.() ?? isChampionshipAutoStartEnabled(deps.env);
  const currentTime = () => deps.now?.() ?? new Date();
  const setTimeoutFn = deps.setTimeout ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeout ?? clearTimeout;
  const setIntervalFn = deps.setInterval ?? setInterval;
  const log = deps.log ?? defaultLog();

  let started = false;
  let generation = 0;
  let wakeHandle: ReturnType<typeof setTimeout> | undefined;
  let lastWakeMs: number | null | undefined;

  const sweepOptions = (): AutoStartSweepOptions => ({
    enabled: true,
    now: currentTime(),
    completeExpired: deps.completeExpired,
    loadSlices: deps.loadSlices,
    startMatch: deps.startMatch,
    log,
    env: deps.env,
  });

  const clearWake = () => {
    if (wakeHandle !== undefined) {
      clearTimeoutFn(wakeHandle);
      wakeHandle = undefined;
    }
  };

  const armWake = async () => {
    const gen = generation;
    clearWake();
    if (!enabled()) return;
    const now = currentTime();
    let slices: AutoStartChampionshipSlice[] = [];
    try {
      slices = await (deps.loadSlices ?? loadChampionshipAutoStartSlices)(now);
    } catch (error) {
      log.error("[Championship Auto Start] Failed to load next scheduled match:", error);
      return;
    }
    if (gen !== generation) return;
    const wakeAt = nextAutoStartWakeAt(slices, now);
    const delay = delayMsUntilAutoStartWake(wakeAt, now);
    const wakeMs = wakeAt?.getTime() ?? null;
    if (wakeMs !== lastWakeMs) {
      lastWakeMs = wakeMs;
      if (wakeAt) {
        log.info(`[Championship Auto Start] Next match check at ${wakeAt.toISOString()}`);
      }
    }
    if (delay == null) return;
    wakeHandle = setTimeoutFn(() => {
      wakeHandle = undefined;
      return runSweepThenArm();
    }, delay);
  };

  const runSweepThenArm = async () => {
    const gen = ++generation;
    if (!enabled()) {
      clearWake();
      lastWakeMs = undefined;
      return;
    }
    try {
      await (deps.runSweep ?? runChampionshipAutoStartSweep)(sweepOptions());
    } catch (error) {
      log.error("[Championship Auto Start] Sweep failed:", error);
    }
    if (gen !== generation) return;
    await armWake();
  };

  return {
    notify() {
      if (!enabled()) {
        generation += 1;
        clearWake();
        lastWakeMs = undefined;
        return Promise.resolve();
      }
      return runSweepThenArm();
    },
    start() {
      if (started) return;
      started = true;
      if (enabled()) {
        log.info(`[Championship Auto Start] Enabled; next-event wake plus safety check every ${CHAMPIONSHIP_AUTO_START_INTERVAL_MS / 1000}s`);
      } else {
        log.info("[Championship Auto Start] Disabled (CHAMPIONSHIP_AUTO_START_ENABLED is not true)");
      }
      void runSweepThenArm();
      setIntervalFn(() => {
        void runSweepThenArm();
      }, CHAMPIONSHIP_AUTO_START_INTERVAL_MS);
    },
  };
}

function processRuntime(): ChampionshipAutoStartRuntime {
  const state = globalThis as typeof globalThis & {
    [autoStartRuntimeKey]?: ChampionshipAutoStartRuntime;
  };
  if (!state[autoStartRuntimeKey]) {
    state[autoStartRuntimeKey] = createChampionshipAutoStartRuntime();
  }
  return state[autoStartRuntimeKey];
}

/** Recalculate the next wake after match/championship schedule changes. */
export function notifyChampionshipScheduleChanged() {
  void processRuntime().notify().catch(error =>
    console.error("[Championship Auto Start] Failed to refresh schedule:", error),
  );
}

/** Register at most one auto-start runtime for this Node process. */
export function startChampionshipAutoStart() {
  processRuntime().start();
}
