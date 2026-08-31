import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ReactionParticle } from "@/lib/watch-reactions";
import { TeamAvatar } from "@/components/championship/TeamAvatar";

/** Custom properties the burst CSS reads; not in the stock CSSProperties map. */
type CheerParticleStyle = CSSProperties & {
  "--cheer-x": string;
  "--cheer-wave": string;
  "--cheer-rise": string;
  "--cheer-rot": string;
  "--cheer-scale": string;
  "--cheer-duration": string;
  "--cheer-delay": string;
};

/**
 * Broadcast scoreboard — and the single canvas for audience reactions.
 *
 * Scores, teams and the winner all arrive as props from the match payload; the
 * supporter numbers are the live reaction counts the page already tracks. The
 * only interaction is the existing tap-to-support, which the page owns and
 * which stays live-only exactly as before — this screen remains read-only.
 *
 * Particles are decorative: they live in an absolutely positioned layer that
 * cannot affect layout, height, or the score readout.
 */
export function WatchScoreboard({
  status,
  teamA,
  teamB,
  teamAScore,
  teamBScore,
  supporters,
  winnerTeamId,
  liveQuestion,
  answeringTeamId,
  particles = [],
}: {
  status: string;
  teamA?: { id: string; name: string; emoticon: string; logoUrl?: string | null };
  teamB?: { id: string; name: string; emoticon: string; logoUrl?: string | null };
  teamAScore: number;
  teamBScore: number;
  supporters: Record<string, number>;
  winnerTeamId?: string | null;
  liveQuestion: number | null;
  /** The team on the clock, from the live question broadcast. Display only. */
  answeringTeamId?: string;
  /**
   * Audience reaction particles, built from the server broadcast by the page.
   * Decorative only — they are drawn in an absolutely positioned layer that
   * cannot affect this component's layout or height.
   */
  particles?: ReactionParticle[];
}) {
  const previousScore = useRef({ a: teamAScore, b: teamBScore });
  const [scorePulse, setScorePulse] = useState(false);

  useEffect(() => {
    if (previousScore.current.a === teamAScore && previousScore.current.b === teamBScore) return;
    previousScore.current = { a: teamAScore, b: teamBScore };
    setScorePulse(true);
    const timer = window.setTimeout(() => setScorePulse(false), 700);
    return () => window.clearTimeout(timer);
  }, [teamAScore, teamBScore]);

  const side = (team: typeof teamA, fallback: string, align: "left" | "right") => {
    const isWinner = status === "completed" && !!winnerTeamId && team?.id === winnerTeamId;
    // While a question is in play, the side answering it holds the eye and the
    // other steps back. Purely visual — no score or team data changes.
    const isAnswering = status === "live" && !!answeringTeamId && team?.id === answeringTeamId;
    const isWaiting = status === "live" && !!answeringTeamId && !isAnswering;
    return (
      <div
        className={`relative z-[1] min-w-0 flex-1 p-1.5 transition-opacity ${align === "right" ? "text-right" : ""} ${
          isAnswering ? "watch-team-active" : ""
        } ${isWaiting ? "opacity-70" : ""}`}
      >
        <div className={`flex items-center gap-2 sm:gap-2.5 ${align === "right" ? "flex-row-reverse justify-start" : ""}`}>
          <TeamAvatar logoUrl={team?.logoUrl} emoticon={team?.emoticon} alt={`${team?.name ?? fallback} logo`} className="h-7 w-7 shrink-0 text-xl sm:h-8 sm:w-8 sm:text-2xl" />
          <div className="min-w-0">
            <p className={`truncate text-xs font-black uppercase tracking-[0.08em] text-white sm:text-sm ${isWinner ? "text-[#f0d58a]" : ""}`}>
              {team?.name ?? fallback}
            </p>
            <p className="mt-0.5 text-[10px] champ-meta sm:text-[11px]">
              {(team && supporters[team.id]) ?? 0} supporters
            </p>
          </div>
        </div>
        {isWinner && (
          <span className="mt-2 inline-block rounded-full border border-[#d4af37]/45 bg-[#d4af37]/12 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#f0d58a]">
            Winner
          </span>
        )}
      </div>
    );
  };

  return (
    <section
      className="champ-panel relative overflow-hidden rounded-xl px-3 py-2 sm:px-5 sm:py-2.5"
      aria-label="Match scoreboard"
    >
      <div className="relative flex items-center gap-2 sm:gap-6">
        {side(teamA, "Team A", "left")}

        <div className="relative z-[3] shrink-0 text-center">
          <p className={`champ-scoreline text-3xl font-black text-white sm:text-4xl lg:text-5xl ${scorePulse ? "watch-score-pulse" : ""}`}>
            {teamAScore}
            <span className="mx-1.5 align-middle text-xl text-white/20 sm:mx-3 sm:text-3xl">:</span>
            {teamBScore}
          </p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
            {status === "completed"
              ? "Final score"
              : liveQuestion
                ? `Question ${liveQuestion}`
                : status === "live"
                  ? "Live score"
                  : "Not started"}
          </p>
        </div>

        {side(teamB, "Team B", "right")}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
        data-watch-reaction-layer=""
      >
        {particles.map(particle => {
          const teamSide =
            particle.teamId === teamA?.id ? "left" : particle.teamId === teamB?.id ? "right" : null;
          if (!teamSide) return null;
          return (
            <span
              key={particle.id}
              aria-hidden="true"
              data-watch-particle=""
              data-watch-burst=""
              data-team-side={teamSide}
              data-hero={particle.hero ? "true" : undefined}
              data-sparkle={particle.sparkle ? "true" : undefined}
              className={`watch-burst-particle ${
                particle.hero
                  ? "watch-burst-hero"
                  : particle.sparkle
                    ? "watch-burst-sparkle"
                    : "watch-burst-support"
              }`}
              style={
                {
                  ...(teamSide === "left"
                    ? { left: `${particle.originX}%` }
                    : { right: `${particle.originX}%` }),
                  bottom: `${particle.originY}%`,
                  "--cheer-x": `${particle.dx}px`,
                  "--cheer-wave": `${particle.wave}px`,
                  "--cheer-rise": `${particle.rise}px`,
                  "--cheer-rot": `${particle.rot}deg`,
                  "--cheer-scale": String(particle.scale),
                  "--cheer-duration": `${particle.duration}s`,
                  "--cheer-delay": `${particle.delay}s`,
                } as CheerParticleStyle
              }
            >
              {particle.emoji}
            </span>
          );
        })}
      </div>
    </section>
  );
}
