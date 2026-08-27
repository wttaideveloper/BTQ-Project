/**
 * Championship automatic match start tests.
 *
 * Run with: npx tsx server/championship-autostart.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createChampionshipAutoStartRuntime,
  decideChampionshipAutoStart,
  delayMsUntilAutoStartWake,
  isChampionshipAutoStartEnabled,
  isUpcomingMatchDue,
  nextAutoStartWakeAt,
  runChampionshipAutoStartSweep,
  type AutoStartChampionshipSlice,
  type AutoStartMatch,
} from "./championship-autostart.ts";

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

const now = new Date(2026, 7, 26, 19, 0, 0, 0);
const past = new Date(2026, 7, 26, 18, 0, 0, 0);
const later = new Date(2026, 7, 26, 18, 40, 0, 0);
const future = new Date(2026, 7, 26, 20, 0, 0, 0);

type StoreMatch = AutoStartMatch & { startedAt?: Date | null };

class Mutex {
  private tail = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

function conflict(message: string, status = 409) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function match(id: string, scheduledAt: Date | null, status = "upcoming"): StoreMatch {
  return { id, championshipId: "c1", status, scheduledAt };
}

function createStore(championships: Array<{ id: string; status: string; matches: StoreMatch[] }>) {
  const mutexes = new Map<string, Mutex>();
  const lockFor = (id: string) => {
    const existing = mutexes.get(id);
    if (existing) return existing;
    const mutex = new Mutex();
    mutexes.set(id, mutex);
    return mutex;
  };
  const startedIds: string[] = [];
  let startDelayMs = 0;

  const startMatch = async (matchId: string) => {
    const championship = championships.find(item => item.matches.some(itemMatch => itemMatch.id === matchId));
    if (!championship) throw conflict("Match not found", 404);
    return lockFor(championship.id).run(async () => {
      if (startDelayMs) await new Promise(resolveDelay => setTimeout(resolveDelay, startDelayMs));
      const target = championship.matches.find(item => item.id === matchId);
      if (!target) throw conflict("Match not found", 404);
      if (championship.status !== "active") throw conflict("Only active championships can play matches");
      if (championship.matches.some(item => item.status === "live" && item.id !== target.id)) {
        throw conflict("Another match is already live in this championship");
      }
      if (target.status !== "upcoming") throw conflict("Only upcoming matches can be started");
      target.status = "live";
      target.startedAt = new Date();
      startedIds.push(target.id);
      return target;
    });
  };

  const loadSlices = async (): Promise<AutoStartChampionshipSlice[]> => championships.map(item => ({
    championshipId: item.id,
    championshipStatus: item.status,
    liveMatchId: item.matches.find(itemMatch => itemMatch.status === "live")?.id ?? null,
    upcoming: item.matches.filter(itemMatch => itemMatch.status === "upcoming"),
  }));

  const completeMatch = (matchId: string) => {
    for (const championship of championships) {
      const target = championship.matches.find(item => item.id === matchId);
      if (target) target.status = "completed";
    }
  };

  return {
    championships,
    startedIds,
    startMatch,
    loadSlices,
    completeMatch,
    setStartDelay(ms: number) { startDelayMs = ms; },
  };
}

async function sweep(store: ReturnType<typeof createStore>, extra: Parameters<typeof runChampionshipAutoStartSweep>[0] = {}) {
  return runChampionshipAutoStartSweep({
    enabled: true,
    now,
    completeExpired: async () => undefined,
    loadSlices: store.loadSlices,
    startMatch: store.startMatch,
    log: { info() {}, error() {} },
    ...extra,
  });
}

console.log("championship auto start");

await test("future scheduled match is not started", async () => {
  const store = createStore([{ id: "c1", status: "active", matches: [match("m-future", future)] }]);
  const result = await sweep(store);
  assert.deepEqual(result.started, []);
  assert.equal(store.championships[0].matches[0].status, "upcoming");
});

await test("due upcoming match in an active championship starts", async () => {
  const store = createStore([{ id: "c1", status: "active", matches: [match("m-due", past)] }]);
  const result = await sweep(store);
  assert.deepEqual(result.started, ["m-due"]);
  assert.equal(store.championships[0].matches[0].status, "live");
});

await test("NULL scheduledAt is not started", async () => {
  const store = createStore([{ id: "c1", status: "active", matches: [match("m-null", null)] }]);
  const result = await sweep(store);
  assert.deepEqual(result.started, []);
  assert.equal(store.championships[0].matches[0].status, "upcoming");
});

await test("draft championship is not started", async () => {
  const store = createStore([{ id: "c1", status: "draft", matches: [match("m-draft", past)] }]);
  const result = await sweep(store);
  assert.deepEqual(result.started, []);
  assert.equal(store.championships[0].matches[0].status, "upcoming");
});

await test("completed championship is not started", async () => {
  const store = createStore([{ id: "c1", status: "completed", matches: [match("m-done", past)] }]);
  const result = await sweep(store);
  assert.deepEqual(result.started, []);
  assert.equal(store.championships[0].matches[0].status, "upcoming");
});

await test("existing live match leaves the next due match upcoming", async () => {
  const live = match("m-live", new Date(2026, 7, 26, 17, 0, 0, 0), "live");
  const next = match("m-next", past);
  const store = createStore([{ id: "c1", status: "active", matches: [live, next] }]);
  const result = await sweep(store);
  assert.deepEqual(result.started, []);
  assert.deepEqual(result.skippedLive, ["c1"]);
  assert.equal(next.status, "upcoming");
  assert.equal(live.status, "live");
});

await test("multiple due matches start only the earliest", async () => {
  const first = match("m-first", past);
  const second = match("m-second", later);
  const third = match("m-future", future);
  const store = createStore([{ id: "c1", status: "active", matches: [second, third, first] }]);
  const result = await sweep(store);
  assert.deepEqual(result.started, ["m-first"]);
  assert.equal(first.status, "live");
  assert.equal(second.status, "upcoming");
  assert.equal(third.status, "upcoming");
});

await test("after the first live match completes the next due match can start", async () => {
  const first = match("m-first", past);
  const second = match("m-second", later);
  const store = createStore([{ id: "c1", status: "active", matches: [first, second] }]);
  await sweep(store);
  assert.equal(first.status, "live");
  store.completeMatch("m-first");
  const result = await sweep(store);
  assert.deepEqual(result.started, ["m-second"]);
  assert.equal(second.status, "live");
});

await test("the same scheduler tick twice starts a match only once", async () => {
  const due = match("m-due", past);
  const store = createStore([{ id: "c1", status: "active", matches: [due] }]);
  store.setStartDelay(20);
  const [first, second] = await Promise.all([sweep(store), sweep(store)]);
  const started = [...first.started, ...second.started];
  assert.equal(started.filter(id => id === "m-due").length, 1);
  assert.equal(store.startedIds.filter(id => id === "m-due").length, 1);
  assert.equal(due.status, "live");
});

await test("manual Start Match still works without a due scheduledAt", async () => {
  const unscheduled = match("m-manual", null);
  const store = createStore([{ id: "c1", status: "active", matches: [unscheduled] }]);
  await store.startMatch("m-manual");
  assert.equal(unscheduled.status, "live");
});

await test("manual Start Match can still start early", async () => {
  const early = match("m-early", future);
  const store = createStore([{ id: "c1", status: "active", matches: [early] }]);
  const auto = await sweep(store);
  assert.deepEqual(auto.started, []);
  assert.equal(early.status, "upcoming");
  await store.startMatch("m-early");
  assert.equal(early.status, "live");
});

await test("two different matches cannot become live simultaneously", async () => {
  const a = match("m-a", past);
  const b = match("m-b", later);
  const store = createStore([{ id: "c1", status: "active", matches: [a, b] }]);
  store.setStartDelay(15);
  const results = await Promise.allSettled([store.startMatch("m-a"), store.startMatch("m-b")]);
  const fulfilled = results.filter(item => item.status === "fulfilled");
  const rejected = results.filter(item => item.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(store.championships[0].matches.filter(item => item.status === "live").length, 1);
  assert.equal(store.championships[0].matches.filter(item => item.status === "upcoming").length, 1);
});

await test("server restart with a due match can start it on the startup sweep", async () => {
  const due = match("m-restart", past);
  const store = createStore([{ id: "c1", status: "active", matches: [due] }]);
  const result = await sweep(store);
  assert.deepEqual(result.started, ["m-restart"]);
  assert.equal(due.status, "live");
});

await test("auto-start disabled performs no automatic starts", async () => {
  const due = match("m-off", past);
  const store = createStore([{ id: "c1", status: "active", matches: [due] }]);
  const result = await sweep(store, { enabled: false });
  assert.equal(result.disabled, true);
  assert.deepEqual(result.started, []);
  assert.equal(due.status, "upcoming");
});

await test("a failed championship does not prevent another championship from starting", async () => {
  const good = match("m-good", past);
  good.championshipId = "c-good";
  const bad = match("m-bad", past);
  bad.championshipId = "c-bad";
  const store = createStore([
    { id: "c-bad", status: "active", matches: [bad] },
    { id: "c-good", status: "active", matches: [good] },
  ]);
  const result = await sweep(store, {
    startMatch: async matchId => {
      if (matchId === "m-bad") throw new Error("boom");
      return store.startMatch(matchId);
    },
  });
  assert.deepEqual(result.started, ["m-good"]);
  assert.equal(bad.status, "upcoming");
  assert.equal(good.status, "live");
});

await test("flag parsing defaults to false", () => {
  assert.equal(isChampionshipAutoStartEnabled({}), false);
  assert.equal(isChampionshipAutoStartEnabled({ CHAMPIONSHIP_AUTO_START_ENABLED: "false" }), false);
  assert.equal(isChampionshipAutoStartEnabled({ CHAMPIONSHIP_AUTO_START_ENABLED: "" }), false);
  assert.equal(isChampionshipAutoStartEnabled({ CHAMPIONSHIP_AUTO_START_ENABLED: "true" }), true);
  assert.equal(isChampionshipAutoStartEnabled({ CHAMPIONSHIP_AUTO_START_ENABLED: "TRUE" }), true);
  assert.equal(isChampionshipAutoStartEnabled({ CHAMPIONSHIP_AUTO_START_ENABLED: "1" }), true);
});

await test("isUpcomingMatchDue requires upcoming, a timestamp, and that time to have arrived", () => {
  assert.equal(isUpcomingMatchDue(match("a", future), now), false);
  assert.equal(isUpcomingMatchDue(match("b", past), now), true);
  assert.equal(isUpcomingMatchDue(match("c", null), now), false);
  assert.equal(isUpcomingMatchDue(match("d", past, "live"), now), false);
  assert.equal(isUpcomingMatchDue(match("e", past, "completed"), now), false);
});

await test("decideChampionshipAutoStart returns skip-live when a due match is waiting behind a live match", () => {
  const decision = decideChampionshipAutoStart({
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: "m-live",
    upcoming: [match("m-next", past)],
  }, now);
  assert.equal(decision.action, "skip-live");
});

const startSource = read("server/championship-match-start.ts");
const routesSource = read("server/championship-routes.ts");
const autoSource = read("server/championship-autostart.ts");
const indexSource = read("server/index.ts");
const dialogSource = read("client/src/components/admin/championship/AutoScheduleDialog.tsx");

await test("shared start function uses a championship FOR UPDATE lock and upcoming guard", () => {
  assert.match(startSource, /export async function startChampionshipMatch/);
  assert.match(startSource, /for update/i);
  assert.match(startSource, /eq\(championshipMatches\.status, "upcoming"\)/);
  assert.match(startSource, /broadcastChampionshipEvent\(\{ type: "match_started"/);
  assert.doesNotMatch(startSource, /handleStartTeamBattle/);
  assert.doesNotMatch(startSource, /match\.scheduledAt/);
});

await test("manual Start Match endpoint calls the shared function and stays an admin override", () => {
  assert.match(routesSource, /app\.post\("\/api\/championship-matches\/:id\/start", ensureAdmin/);
  assert.match(routesSource, /startChampionshipMatch\(req\.params\.id\)/);
  assert.match(routesSource, /scheduledAt is not required/);
  assert.match(routesSource, /ChampionshipMatchStartError/);
});

await test("server boots the auto-start scheduler next to the lifecycle job", () => {
  assert.match(indexSource, /startChampionshipAutoStart\(\)/);
  assert.match(indexSource, /startChampionshipLifecycle\(\)/);
  assert.match(autoSource, /CHAMPIONSHIP_AUTO_START_INTERVAL_MS = 30_000/);
  assert.match(autoSource, /CHAMPIONSHIP_AUTO_START_ENABLED/);
  assert.doesNotMatch(autoSource, /handleStartTeamBattle/);
  assert.doesNotMatch(autoSource, /start_team_battle/);
});

await test("Auto Schedule copy stays accurate when auto-start is disabled", () => {
  assert.match(dialogSource, /Matches are created as upcoming\. An admin must start them manually\./);
  assert.match(dialogSource, /Matches will automatically start at their scheduled time\./);
});

await test("next wake is the earliest unblocked scheduledAt, not the 30s sweep", () => {
  const wakeAt = nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: null,
    upcoming: [match("m-future", future)],
  }], now);
  assert.equal(wakeAt?.getTime(), future.getTime());
  assert.equal(delayMsUntilAutoStartWake(wakeAt, now), future.getTime() - now.getTime());
});

await test("past-due wake delay is zero so startup can start immediately", () => {
  const wakeAt = nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: null,
    upcoming: [match("m-due", past)],
  }], now);
  assert.equal(wakeAt?.getTime(), past.getTime());
  assert.equal(delayMsUntilAutoStartWake(wakeAt, now), 0);
});

await test("no scheduled matches produce no wake timer", () => {
  assert.equal(nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: null,
    upcoming: [match("m-null", null)],
  }], now), null);
  assert.equal(delayMsUntilAutoStartWake(null, now), null);
  assert.equal(nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "draft",
    liveMatchId: null,
    upcoming: [match("m-draft", past)],
  }], now), null);
  assert.equal(nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "completed",
    liveMatchId: null,
    upcoming: [match("m-done", past)],
  }], now), null);
});

await test("a live match blocks that championship's next wake", () => {
  const wakeAt = nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: "m-live",
    upcoming: [match("m-next", past), match("m-later", future)],
  }], now);
  assert.equal(wakeAt, null);
});

await test("multiple championships wake at the earliest unblocked scheduledAt", () => {
  const wakeAt = nextAutoStartWakeAt([
    {
      championshipId: "c-live",
      championshipStatus: "active",
      liveMatchId: "m-live",
      upcoming: [match("m-blocked", past)],
    },
    {
      championshipId: "c-soon",
      championshipStatus: "active",
      liveMatchId: null,
      upcoming: [match("m-soon", later), match("m-later", future)],
    },
    {
      championshipId: "c-draft",
      championshipStatus: "draft",
      liveMatchId: null,
      upcoming: [match("m-draft", past)],
    },
  ], now);
  assert.equal(wakeAt?.getTime(), later.getTime());
});

await test("ending a live match makes the next due match eligible immediately", () => {
  const blocked = nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: "m-live",
    upcoming: [match("m-next", past)],
  }], now);
  const unblocked = nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: null,
    upcoming: [match("m-next", past)],
  }], now);
  assert.equal(blocked, null);
  assert.equal(delayMsUntilAutoStartWake(unblocked, now), 0);
});

await test("editing scheduledAt recalculates the next wake", () => {
  const before = nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: null,
    upcoming: [match("m-a", future)],
  }], now);
  const after = nextAutoStartWakeAt([{
    championshipId: "c1",
    championshipStatus: "active",
    liveMatchId: null,
    upcoming: [match("m-a", later)],
  }], now);
  assert.equal(before?.getTime(), future.getTime());
  assert.equal(after?.getTime(), later.getTime());
  assert.ok((delayMsUntilAutoStartWake(after, now) ?? 0) < (delayMsUntilAutoStartWake(before, now) ?? 0));
});

function createFakeTimers(initial: Date) {
  let nowMs = initial.getTime();
  const timeouts = new Map<number, { at: number; fn: (...args: unknown[]) => unknown }>();
  let nextId = 1;
  return {
    now: () => new Date(nowMs),
    setTimeout(fn: (...args: unknown[]) => unknown, ms?: number) {
      const id = nextId++;
      timeouts.set(id, { at: nowMs + Number(ms ?? 0), fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout(handle: ReturnType<typeof setTimeout>) {
      timeouts.delete(Number(handle));
    },
    setInterval() {
      return 0 as unknown as ReturnType<typeof setInterval>;
    },
    pendingMs() {
      return [...timeouts.values()].map(item => item.at - nowMs);
    },
    async advance(ms: number) {
      nowMs += ms;
      const due = [...timeouts.entries()]
        .filter(([, item]) => item.at <= nowMs)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, item] of due) {
        timeouts.delete(id);
        await item.fn();
      }
    },
  };
}

const silentLog = { info() {}, error() {} };

await test("runtime arms a precise timer and starts at scheduledAt, not 30s later", async () => {
  const dueAt = new Date(now.getTime() + 2_000);
  const store = createStore([{ id: "c1", status: "active", matches: [match("m-soon", dueAt)] }]);
  const timers = createFakeTimers(now);
  const runtime = createChampionshipAutoStartRuntime({
    enabled: () => true,
    now: timers.now,
    loadSlices: store.loadSlices,
    startMatch: store.startMatch,
    completeExpired: async () => undefined,
    setTimeout: timers.setTimeout as typeof setTimeout,
    clearTimeout: timers.clearTimeout as typeof clearTimeout,
    setInterval: timers.setInterval as typeof setInterval,
    log: silentLog,
  });
  await runtime.notify();
  assert.deepEqual(timers.pendingMs(), [2_000]);
  assert.equal(store.championships[0].matches[0].status, "upcoming");
  await timers.advance(1_000);
  assert.equal(store.championships[0].matches[0].status, "upcoming");
  await timers.advance(1_000);
  assert.equal(store.championships[0].matches[0].status, "live");
});

await test("runtime starts a past-due match immediately on notify", async () => {
  const store = createStore([{ id: "c1", status: "active", matches: [match("m-due", past)] }]);
  const runtime = createChampionshipAutoStartRuntime({
    enabled: () => true,
    now: () => now,
    loadSlices: store.loadSlices,
    startMatch: store.startMatch,
    completeExpired: async () => undefined,
    setTimeout: ((fn: () => unknown) => { void fn(); return 1; }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
    setInterval: (() => 1) as typeof setInterval,
    log: silentLog,
  });
  await runtime.notify();
  assert.equal(store.championships[0].matches[0].status, "live");
});

await test("runtime does not start matches while auto-start is disabled", async () => {
  const store = createStore([{ id: "c1", status: "active", matches: [match("m-due", past)] }]);
  let timeoutSet = false;
  const runtime = createChampionshipAutoStartRuntime({
    enabled: () => false,
    now: () => now,
    loadSlices: store.loadSlices,
    startMatch: store.startMatch,
    completeExpired: async () => undefined,
    setTimeout: ((fn: () => unknown, ms?: number) => { timeoutSet = true; void fn(); return ms ?? 1; }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
    setInterval: (() => 1) as typeof setInterval,
    log: silentLog,
  });
  await runtime.notify();
  assert.equal(timeoutSet, false);
  assert.equal(store.championships[0].matches[0].status, "upcoming");
});

await test("runtime immediately starts the next due match after the live match ends", async () => {
  const first = match("m-first", past, "live");
  const second = match("m-second", later);
  const store = createStore([{ id: "c1", status: "active", matches: [first, second] }]);
  const runtime = createChampionshipAutoStartRuntime({
    enabled: () => true,
    now: () => now,
    loadSlices: store.loadSlices,
    startMatch: store.startMatch,
    completeExpired: async () => undefined,
    setTimeout: ((fn: () => unknown) => { void fn(); return 1; }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
    setInterval: (() => 1) as typeof setInterval,
    log: silentLog,
  });
  await runtime.notify();
  assert.equal(first.status, "live");
  assert.equal(second.status, "upcoming");
  store.completeMatch("m-first");
  await runtime.notify();
  assert.equal(second.status, "live");
});

await test("runtime replaces the next wake when a sooner match is scheduled", async () => {
  const sooner = new Date(now.getTime() + 10 * 60 * 1000);
  const store = createStore([{ id: "c1", status: "active", matches: [match("m-a", future)] }]);
  const timers = createFakeTimers(now);
  const runtime = createChampionshipAutoStartRuntime({
    enabled: () => true,
    now: timers.now,
    loadSlices: store.loadSlices,
    startMatch: store.startMatch,
    completeExpired: async () => undefined,
    setTimeout: timers.setTimeout as typeof setTimeout,
    clearTimeout: timers.clearTimeout as typeof clearTimeout,
    setInterval: timers.setInterval as typeof setInterval,
    log: silentLog,
  });
  await runtime.notify();
  assert.deepEqual(timers.pendingMs(), [future.getTime() - now.getTime()]);
  store.championships[0].matches[0].scheduledAt = sooner;
  await runtime.notify();
  assert.deepEqual(timers.pendingMs(), [sooner.getTime() - now.getTime()]);
  assert.equal(store.championships[0].matches[0].status, "upcoming");
});

await test("schedule change hooks keep a single next-event wake", () => {
  assert.match(routesSource, /notifyChampionshipScheduleChanged\(\)/);
  assert.match(startSource, /notifyChampionshipScheduleChanged\(\)/);
  assert.match(read("server/socket.ts"), /notifyChampionshipScheduleChanged/);
  assert.match(autoSource, /nextAutoStartWakeAt/);
  assert.match(autoSource, /CHAMPIONSHIP_AUTO_START_INTERVAL_MS = 30_000/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
