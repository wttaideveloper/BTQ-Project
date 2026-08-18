/**
 * Focused tests for the /watch scoreboard reaction burst.
 *
 * Run with: npx tsx client/src/lib/watch-reactions.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  appendBurst,
  buildBurst,
  burstTtlMs,
  dropParticles,
  groupBursts,
  MAX_PARTICLES,
  MAX_SPARKLES_PER_BURST,
  MAX_VISIBLE_BURSTS,
  PARTICLES_PER_BURST,
  resolveReactionEmoji,
  TEAM_ORIGIN,
} from "./watch-reactions.ts";

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

const scoreboard = read("client/src/components/watch/WatchScoreboard.tsx");
const support = read("client/src/components/watch/WatchSupport.tsx");
const watchMatch = read("client/src/pages/WatchMatch.tsx");
const stage = read("client/src/components/watch/WatchStage.tsx");
const css = read("client/src/index.css");
const socketClient = read("client/src/lib/socket.ts");
const socketServer = read("server/socket.ts");

console.log("watch reaction burst");

test("1. reaction event creates a scoreboard burst (6 particles, one burst id)", () => {
  const particles = buildBurst("🔥", "team-a", "burst-1", () => 0.5);
  assert.equal(particles.length, PARTICLES_PER_BURST);
  assert.ok(particles.length >= 6 && particles.length <= 8);
  assert.ok(particles.every(p => p.burstId === "burst-1"));
  assert.ok(particles.every(p => p.teamId === "team-a"));
  assert.ok(scoreboard.includes("particles.map(particle"));
  assert.ok(watchMatch.includes("buildBurst(e.emoticon, e.teamId)"));
  assert.ok(watchMatch.includes("particles={reactions}"));
});

test("2. Team A origin is on the left side of the scoreboard", () => {
  assert.ok(scoreboard.includes('particle.teamId === teamA?.id ? "left"'));
  assert.ok(scoreboard.includes("left: `${particle.originX}%`"));
  const burst = buildBurst("👏", "team-a", "a", () => 0.4);
  for (const particle of burst) {
    assert.ok(particle.originX >= TEAM_ORIGIN.minX && particle.originX <= TEAM_ORIGIN.maxX);
    assert.ok(particle.originY >= TEAM_ORIGIN.minY && particle.originY <= TEAM_ORIGIN.maxY);
  }
});

test("3. Team B origin is on the right side of the scoreboard", () => {
  assert.ok(scoreboard.includes('particle.teamId === teamB?.id ? "right"'));
  assert.ok(scoreboard.includes("right: `${particle.originX}%`"));
  assert.ok(!scoreboard.includes("left: \"50%\""));
});

test("4. each burst has exactly one hero emoji", () => {
  const burst = buildBurst("🔥", "team-a", "hero", () => 0.3);
  assert.equal(burst.filter(p => p.hero).length, 1);
  assert.equal(burst[0].hero, true);
  assert.equal(burst[0].emoji, "🔥");
  assert.ok(scoreboard.includes("watch-burst-hero"));
  assert.ok(css.includes(".watch-burst-hero"));
});

test("5. supporting particles exist alongside the reaction emoji", () => {
  const fire = buildBurst("🔥", "team-a", "fire", () => 0.2);
  assert.ok(fire.some(p => !p.hero && !p.sparkle && p.emoji === "🔥"));
  assert.ok(fire.some(p => p.emoji === "👏"));
  const clap = buildBurst("👏", "team-b", "clap", () => 0.2);
  assert.ok(clap.some(p => p.emoji === "🔥" || p.emoji === "🎉"));
  const sparkles = fire.filter(p => p.sparkle);
  assert.ok(sparkles.length >= 1 && sparkles.length <= MAX_SPARKLES_PER_BURST);
});

test("6. particle count remains bounded", () => {
  let current = buildBurst("🎉", "team-a", "b1", () => 0.5);
  current = appendBurst(current, buildBurst("👏", "team-b", "b2", () => 0.5));
  current = appendBurst(current, buildBurst("💪", "team-a", "b3", () => 0.5));
  current = appendBurst(current, buildBurst("🙏", "team-b", "b4", () => 0.5));
  current = appendBurst(current, buildBurst("🔥", "team-a", "b5", () => 0.5));
  assert.ok(current.length <= MAX_PARTICLES);
  assert.equal(groupBursts(current).length, MAX_VISIBLE_BURSTS);
});

test("7. particles clean themselves up", () => {
  const incoming = buildBurst("🙏", "team-a", "gone", () => 0.5);
  const remaining = dropParticles(incoming, incoming.map(p => p.id));
  assert.equal(remaining.length, 0);
  assert.ok(burstTtlMs(incoming) > incoming[0].duration * 1000);
  assert.ok(watchMatch.includes("dropParticles"));
  assert.ok(watchMatch.includes("burstTtlMs(particles)"));
  assert.ok(watchMatch.includes("clearTimeout"));
});

test("8. rapid reactions remain bounded at three bursts", () => {
  let current: ReturnType<typeof buildBurst> = [];
  for (let i = 0; i < 12; i++) {
    current = appendBurst(current, buildBurst("🔥", "team-a", `rapid-${i}`, () => 0.5));
  }
  assert.equal(groupBursts(current).length, 3);
  assert.ok(current.length <= MAX_PARTICLES);
  assert.deepEqual(groupBursts(current).map(b => b.id), ["rapid-9", "rapid-10", "rapid-11"]);
});

test("9. support section contains no particle renderer", () => {
  assert.equal(support.includes("watch-burst"), false);
  assert.equal(support.includes("buildBurst"), false);
  assert.equal(support.includes("particles"), false);
  assert.ok(support.includes("Support your team"));
});

test("10. no duplicate reaction renderer remains", () => {
  assert.equal((scoreboard.match(/data-watch-reaction-layer/g) ?? []).length, 1);
  assert.equal(stage.includes("watch-burst"), false);
  assert.equal(stage.includes("buildBurst"), false);
  assert.equal(css.includes("watch-float"), false);
  assert.ok(watchMatch.includes("appendBurst"));
  assert.ok(watchMatch.includes("dropParticles"));
  assert.equal(support.includes("setReactions"), false);
});

test("11. overlay contains no reaction UI", () => {
  const overlayStart = watchMatch.indexOf("if (overlay) return (");
  const overlayEnd = watchMatch.indexOf("Everything below is read from the match payload", overlayStart);
  const overlayBlock = watchMatch.slice(overlayStart, overlayEnd);
  assert.ok(overlayStart > 0);
  assert.equal(overlayBlock.includes("WatchSupport"), false);
  assert.equal(overlayBlock.includes("WatchScoreboard"), false);
  assert.equal(overlayBlock.includes("particles"), false);
  assert.equal(overlayBlock.includes("watch-burst"), false);
  assert.ok(watchMatch.includes("if (overlay) return;"));
});

test("12. reduced motion CSS exists", () => {
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
  assert.ok(css.includes("watchCheerFloat"));
  assert.ok(css.includes("animation-fill-mode: both"));
  assert.ok(css.includes("watchBurstFade"));
  assert.ok(css.includes(".watch-burst-particle.watch-burst-hero"));
  assert.ok(css.includes("animation-name: watchBurstFade"));
});

test("13. existing supporter count remains unchanged", () => {
  assert.ok(watchMatch.includes("setCounts(c => ({ ...c, [e.teamId]: e.count }))"));
  assert.ok(watchMatch.includes("setCounts(e.reactionCounts ?? {})"));
  assert.ok(support.includes("supporters[team.id]"));
  assert.ok(scoreboard.includes("supporters[team.id]"));
});

test("14. existing server reaction event remains unchanged", () => {
  assert.ok(socketServer.includes('type: "team_reaction", matchId: targets.matchId, teamId: event.teamId,'));
  assert.ok(socketServer.includes("emoticon, count,"));
  assert.ok(socketClient.includes('reactionId?: string'));
  assert.equal(socketServer.includes("team_reaction_burst"), false);
  assert.equal(watchMatch.includes('type: "team_reaction"'), true);
});

test("15. question remains unaffected", () => {
  assert.equal(scoreboard.includes("WatchQuestionPanel"), false);
  assert.equal(scoreboard.includes("questionText"), false);
  assert.ok(watchMatch.includes("WatchQuestionPanel"));
  assert.ok(watchMatch.includes("liveQuestionDetail"));
});

test("16. score remains unaffected", () => {
  assert.ok(scoreboard.includes("{teamAScore}"));
  assert.ok(scoreboard.includes("{teamBScore}"));
  assert.ok(scoreboard.includes("pointer-events-none absolute inset-0"));
  assert.ok(scoreboard.includes("relative z-[3] shrink-0 text-center"));
});

test("reaction ids resolve to the whitelist, never arbitrary client emoji", () => {
  assert.equal(resolveReactionEmoji("fire"), "🔥");
  assert.equal(resolveReactionEmoji("cheer"), "👏");
  assert.equal(resolveReactionEmoji("pray"), "🙏");
  assert.equal(resolveReactionEmoji("celebrate"), "🎉");
  assert.equal(resolveReactionEmoji("strong"), "💪");
  const burst = buildBurst("fire", "team-a", "id", () => 0.5);
  assert.equal(burst[0].emoji, "🔥");
});

test("particles are decorative (aria-hidden) and not focusable", () => {
  assert.ok(scoreboard.includes('aria-hidden="true"'));
  assert.ok(scoreboard.includes("pointer-events-none"));
  assert.equal(scoreboard.includes("tabIndex"), false);
});

test("particles spawn in separate lanes, not a single clump", () => {
  const burst = buildBurst("🔥", "team-a", "lanes", () => 0.5);
  const xs = burst.map(p => p.dx);
  assert.equal(new Set(xs).size, xs.length);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 80);
  assert.ok(burst.some((p, i) => i > 0 && p.delay > burst[0].delay));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
