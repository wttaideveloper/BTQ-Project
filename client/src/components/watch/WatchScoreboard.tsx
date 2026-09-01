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

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * Broadcast lower-third — and the single canvas for audience reactions.
 *
 * Scores, teams and the winner all arrive as props from the match payload; the
 * supporter numbers are the live reaction counts the page already tracks.
 * Rendered INSIDE the video stage as a compact sports-broadcast graphic, not
 * as a separate page card.
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
  totalQuestions,
  answeringTeamId,
  answeringTeamName,
  isToss,
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
  totalQuestions?: number | null;
  /** The team on the clock, from the live question broadcast. Display only. */
  answeringTeamId?: string;
  answeringTeamName?: string;
  isToss?: boolean;
  /**
   * Audience reaction particles, built from the server broadcast by the page.
   * Decorative only — they are drawn in an absolutely positioned layer that
   * cannot affect this component's layout or height.
   */
  particles?: ReactionParticle[];
}) {
  const previousScore = useRef({ a: teamAScore, b: teamBScore });
  const previousQuestion = useRef(liveQuestion);
  const [scorePulse, setScorePulse] = useState(false);
  const [questionPulse, setQuestionPulse] = useState(false);

  useEffect(() => {
    if (previousScore.current.a === teamAScore && previousScore.current.b === teamBScore) return;
    previousScore.current = { a: teamAScore, b: teamBScore };
    setScorePulse(true);
    const timer = window.setTimeout(() => setScorePulse(false), 700);
    return () => window.clearTimeout(timer);
  }, [teamAScore, teamBScore]);

  useEffect(() => {
    if (previousQuestion.current === liveQuestion) return;
    previousQuestion.current = liveQuestion;
    if (liveQuestion == null) return;
    setQuestionPulse(true);
    const timer = window.setTimeout(() => setQuestionPulse(false), 700);
    return () => window.clearTimeout(timer);
  }, [liveQuestion]);

  const questionLabel = isToss
    ? "Toss"
    : liveQuestion
      ? `Question ${liveQuestion}${totalQuestions ? ` / ${totalQuestions}` : ""}`
      : status === "completed"
        ? "Final"
        : status === "live"
          ? "Live"
          : "Upcoming";

  const side = (team: typeof teamA, fallback: string, align: "left" | "right") => {
    const isWinner = status === "completed" && !!winnerTeamId && team?.id === winnerTeamId;
    // While a question is in play, the side answering it holds the eye and the
    // other steps back. Purely visual — no score or team data changes.
    const isAnswering = status === "live" && !!answeringTeamId && team?.id === answeringTeamId;
    const isWaiting = status === "live" && !!answeringTeamId && !isAnswering;
    return (
      <div
        className={`relative z-[1] min-w-0 transition-opacity ${isWaiting ? "opacity-70" : ""}`}
        data-align={align}
      >
        <div
          className={`watch-scoreboard-chip ${align === "right" ? "flex-row-reverse" : ""} ${
            isAnswering ? "watch-team-active" : ""
          }`}
        >
          <TeamAvatar logoUrl={team?.logoUrl} emoticon={team?.emoticon} alt={`${team?.name ?? fallback} logo`} className="h-6 w-6 shrink-0 text-lg sm:h-7 sm:w-7 sm:text-xl" />
          <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
            <p className={`truncate text-[10px] font-black uppercase tracking-[0.1em] text-white sm:text-xs ${isWinner ? "text-[#f0d58a]" : ""}`}>
              {team?.name ?? fallback}
            </p>
            <p className="mt-0.5 hidden text-[9px] champ-meta sm:block">
              {(team && supporters[team.id]) ?? 0} supporters
            </p>
            {isWinner && (
              <span className="mt-0.5 inline-block rounded-sm border border-[#d4af37]/45 bg-[#d4af37]/12 px-1.5 py-px text-[8px] font-black uppercase tracking-[0.16em] text-[#f0d58a]">
                Winner
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="watch-lower-third" aria-label="Match scoreboard">
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

      <div className="watch-bug">
        <div className="watch-scoreboard-row relative">
          <div className="watch-scoreboard-team" data-align="left">
            {side(teamA, "Team A", "left")}
          </div>

          <div className="relative z-[3] shrink-0 text-center">
            <p className={`champ-scoreline text-2xl font-black tabular-nums text-white sm:text-3xl lg:text-4xl ${scorePulse ? "watch-score-pulse" : ""}`}>
              {teamAScore}
              <span className="mx-1.5 align-middle text-base text-white/30 sm:mx-2.5 sm:text-2xl">–</span>
              {teamBScore}
            </p>
            <p className={`mt-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#f0d58a] sm:text-[10px] ${questionPulse ? "watch-score-pulse" : ""}`}>
              {questionLabel}
            </p>
            {answeringTeamName && status === "live" && (
              <p className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-[0.16em] text-white/70 sm:text-[9px]">
                {possessive(answeringTeamName)} turn
              </p>
            )}
          </div>

          <div className="watch-scoreboard-team" data-align="right">
            {side(teamB, "Team B", "right")}
          </div>
        </div>
      </div>
    </section>
  );
}
