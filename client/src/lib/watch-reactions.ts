/**
 * Composition of one audience reaction on /watch.
 *
 * Hotstar-style: the same reaction emoji floats up in staggered lanes, with a
 * light wave — not an exploding clump. The server broadcast already carries a
 * whitelist-resolved emoji and the team id. This module is presentation only.
 */

export interface ReactionParticle {
  id: string;
  burstId: string;
  emoji: string;
  teamId: string;
  /** Slightly larger glyph; same motion as the others. */
  hero: boolean;
  sparkle: boolean;
  /** Starting horizontal lane, in px from the team origin. */
  dx: number;
  /** Horizontal sine amplitude, in px. */
  wave: number;
  rot: number;
  scale: number;
  duration: number;
  delay: number;
  /** Negative = rise. Pixel travel for the float. */
  rise: number;
  /** Percent from the supported team's outer edge. */
  originX: number;
  /** Percent from the bottom of the scoreboard. */
  originY: number;
}

export interface ReactionBurst {
  id: string;
  teamId: string;
  originX: number;
  originY: number;
  particles: ReactionParticle[];
}

type Rng = () => number;

/** Ids the server already accepts, plus the emoji they resolve to. */
const REACTION_EMOJI: Record<string, string> = {
  cheer: "👏",
  fire: "🔥",
  pray: "🙏",
  celebrate: "🎉",
  strong: "💪",
  "👏": "👏",
  "🔥": "🔥",
  "🙏": "🙏",
  "🎉": "🎉",
  "💪": "💪",
};

/** One supporting glyph per reaction. Fixed table — no arbitrary input. */
const SUPPORTING: Record<string, string> = {
  "👏": "🔥",
  "🔥": "👏",
  "🙏": "💛",
  "🎉": "👏",
  "💪": "🔥",
};
const SPARKLES = ["✨", "✦", "✧"] as const;

/** Pre-spread lanes so particles never spawn on top of each other. */
const LANES = [-52, -28, 8, 36, -8, 58, 22] as const;

export const PARTICLES_PER_BURST = 6;
export const MAX_VISIBLE_BURSTS = 3;
export const MAX_PARTICLES = PARTICLES_PER_BURST * MAX_VISIBLE_BURSTS;
export const MAX_SPARKLES_PER_BURST = 2;
/** Close to the team crest, not the score. */
export const TEAM_ORIGIN = { minX: 6, maxX: 15, minY: 8, maxY: 24 } as const;

const between = (min: number, max: number, rng: Rng) => min + rng() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function resolveReactionEmoji(emoticon: string): string {
  return REACTION_EMOJI[emoticon] ?? emoticon;
}

function glyphsFor(emoji: string): Array<{ emoji: string; sparkle: boolean }> {
  const extra = SUPPORTING[emoji] ?? "👏";
  return [
    { emoji, sparkle: false },
    { emoji, sparkle: false },
    { emoji, sparkle: false },
    { emoji, sparkle: false },
    { emoji: extra, sparkle: false },
    { emoji: SPARKLES[0], sparkle: true },
  ];
}

/**
 * Build one Hotstar-style float: staggered lanes of the same reaction, one
 * supporting glyph and a sparkle. Each particle has its own start offset,
 * wave, duration and delay so they never sit as a single glowing clump.
 */
export function buildBurst(
  emoticon: string,
  teamId: string,
  seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  rng: Rng = Math.random,
): ReactionParticle[] {
  const emoji = resolveReactionEmoji(emoticon);
  const sparkleGlyph = SPARKLES[Math.floor(rng() * SPARKLES.length)] ?? SPARKLES[0];
  const baseX = between(TEAM_ORIGIN.minX, TEAM_ORIGIN.maxX, rng);
  const baseY = between(TEAM_ORIGIN.minY, TEAM_ORIGIN.maxY, rng);

  return glyphsFor(emoji).map((glyph, index) => {
    const hero = index === 0;
    const sparkle = glyph.sparkle;
    const lane = LANES[index] ?? 0;
    return {
      id: `${seed}-${index}`,
      burstId: seed,
      emoji: sparkle ? sparkleGlyph : glyph.emoji,
      teamId,
      hero,
      sparkle,
      dx: Math.round(lane + between(-6, 6, rng)),
      wave: Math.round((index % 2 === 0 ? 1 : -1) * between(18, 36, rng)),
      rot: Math.round(hero ? between(-6, 6, rng) : between(-14, 14, rng)),
      scale: Number((hero ? 1 : sparkle ? between(0.55, 0.7, rng) : between(0.78, 0.95, rng)).toFixed(2)),
      duration: Number((hero ? between(2.3, 2.8, rng) : sparkle ? between(1.8, 2.3, rng) : between(2.1, 2.6, rng)).toFixed(2)),
      // Staggered release — they stream up one after another, like Hotstar.
      delay: Number((index * 0.08 + between(0, 0.04, rng)).toFixed(2)),
      rise: -Math.round(hero ? between(78, 96, rng) : sparkle ? between(64, 88, rng) : between(70, 94, rng)),
      originX: Number(clamp(baseX + between(-1.6, 1.6, rng), TEAM_ORIGIN.minX, TEAM_ORIGIN.maxX).toFixed(1)),
      originY: Number(clamp(baseY + between(-3, 3, rng), TEAM_ORIGIN.minY, TEAM_ORIGIN.maxY).toFixed(1)),
    };
  });
}

export function groupBursts(particles: ReactionParticle[]): ReactionBurst[] {
  const order: string[] = [];
  const grouped = new Map<string, ReactionParticle[]>();
  for (const particle of particles) {
    if (!grouped.has(particle.burstId)) {
      order.push(particle.burstId);
      grouped.set(particle.burstId, []);
    }
    grouped.get(particle.burstId)!.push(particle);
  }
  return order.map(id => {
    const list = grouped.get(id)!;
    return {
      id,
      teamId: list[0].teamId,
      originX: list[0].originX,
      originY: list[0].originY,
      particles: list,
    };
  });
}

export function appendBurst(current: ReactionParticle[], incoming: ReactionParticle[]): ReactionParticle[] {
  const combined = [...current, ...incoming];
  const burstIds: string[] = [];
  for (const particle of combined) {
    if (!burstIds.includes(particle.burstId)) burstIds.push(particle.burstId);
  }
  const keep = new Set(burstIds.slice(-MAX_VISIBLE_BURSTS));
  return combined.filter(particle => keep.has(particle.burstId)).slice(-MAX_PARTICLES);
}

export function dropParticles(current: ReactionParticle[], ids: Iterable<string>): ReactionParticle[] {
  const remove = new Set(ids);
  return current.filter(particle => !remove.has(particle.id));
}

export function burstTtlMs(particles: ReactionParticle[]): number {
  const longest = particles.reduce((max, particle) => Math.max(max, (particle.duration + particle.delay) * 1000), 0);
  return Math.ceil(longest + 80);
}
