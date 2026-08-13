import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  matchOutcome,
  matchStatusOf,
  matchTimingLabel,
  type ChampionshipMatchSummary,
  type ChampionshipTeamSummary,
} from "@/lib/championship";
import { MatchOutcomeBadge, MatchStatusBadge } from "./StatusBadges";

function TeamRow({
  team,
  fallbackLabel,
  score,
  showScore,
  isMine,
  isWinner,
  dimmed,
}: {
  team?: ChampionshipTeamSummary;
  fallbackLabel: string;
  score: number;
  showScore: boolean;
  isMine: boolean;
  isWinner: boolean;
  dimmed: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xl leading-none shrink-0" aria-hidden="true">
        {team?.emoticon ?? "🏳️"}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-semibold",
          dimmed ? "text-white/70" : "text-white",
          isMine && "text-accent",
        )}
      >
        {/* A team deleted out from under a fixture degrades to a label rather
            than crashing the card. */}
        {team?.name ?? fallbackLabel}
        {isMine && <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-accent/80">You</span>}
      </span>
      {showScore ? (
        <span
          className={cn(
            "shrink-0 text-lg font-black tabular-nums",
            isWinner ? "text-white" : dimmed ? "text-white/50" : "text-white/70",
          )}
        >
          {score}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One fixture, rendered the same way everywhere it appears.
 *
 * `variant` is the only thing that separates the player's own matches from the
 * rest of the championship: unrelated fixtures keep every fact but step back
 * visually so they can never be mistaken for something to join.
 */
export function MatchCard({
  match,
  teamA,
  teamB,
  myTeamId,
  variant = "mine",
  actions,
  className,
}: {
  match: ChampionshipMatchSummary;
  teamA?: ChampionshipTeamSummary;
  teamB?: ChampionshipTeamSummary;
  myTeamId?: string | null;
  variant?: "mine" | "other";
  actions?: ReactNode;
  className?: string;
}) {
  const status = matchStatusOf(match);
  const muted = variant === "other";
  const outcome = matchOutcome(match, myTeamId);
  const showScore = status !== "upcoming";
  const timing = matchTimingLabel(match);

  return (
    <article
      className={cn(
        "rounded-2xl border p-4 sm:p-5 transition-colors",
        muted
          ? "border-white/5 bg-white/[0.03] hover:border-white/10"
          : status === "live"
            ? "border-red-400/40 bg-red-500/[0.07]"
            : "home-glass-card border-white/10",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <MatchStatusBadge status={status} muted={muted} />
          {outcome && <MatchOutcomeBadge outcome={outcome} />}
        </div>
        {timing && <span className="text-xs text-white/45">{timing}</span>}
      </div>

      <div className="mt-3">
        <TeamRow
          team={teamA}
          fallbackLabel="Team A"
          score={match.teamAScore}
          showScore={showScore}
          isMine={!!myTeamId && match.teamAId === myTeamId}
          isWinner={match.winnerTeamId === match.teamAId}
          dimmed={muted}
        />
        {!showScore && (
          <div className="pl-8 text-[11px] font-bold uppercase tracking-widest text-white/30">vs</div>
        )}
        <TeamRow
          team={teamB}
          fallbackLabel="Team B"
          score={match.teamBScore}
          showScore={showScore}
          isMine={!!myTeamId && match.teamBId === myTeamId}
          isWinner={match.winnerTeamId === match.teamBId}
          dimmed={muted}
        />
      </div>

      {actions && <div className="mt-4">{actions}</div>}
    </article>
  );
}
