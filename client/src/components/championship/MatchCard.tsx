import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  matchDisplayState,
  matchOutcome,
  matchStatusOf,
  matchTimingLabel,
  type ChampionshipMatchSummary,
  type ChampionshipTeamSummary,
} from "@/lib/championship";
import { MatchOutcomeBadge, MatchStatusBadge } from "./StatusBadges";
import { TeamAvatar } from "./TeamAvatar";

function TeamLine({
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
    <div className="flex items-center gap-2.5 py-0.5">
      <TeamAvatar logoUrl={team?.logoUrl} emoticon={team?.emoticon} alt={`${team?.name ?? fallbackLabel} logo`} className="h-5 w-5 shrink-0 text-lg" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-semibold",
          dimmed ? "text-white/65" : "text-white/90",
          isMine && "text-[#f0d58a]",
        )}
      >
        {/* A team deleted out from under a fixture degrades to a label rather
            than crashing the card. */}
        {team?.name ?? fallbackLabel}
        {isMine && (
          <span className="ml-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#d4af37]/75">You</span>
        )}
      </span>
      {showScore ? (
        <span
          className={cn(
            "shrink-0 text-xl font-black tabular-nums",
            isWinner ? "text-white" : dimmed ? "text-white/45" : "text-white/60",
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
 * visually so they can never be mistaken for something to join. The status
 * accent is a 3px stripe on the leading edge rather than a coloured card, which
 * keeps the navy/gold palette dominant.
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
  const display = matchDisplayState(match);
  const muted = variant === "other";
  const outcome = matchOutcome(match, myTeamId);
  const showScore = status !== "upcoming";
  const timing = matchTimingLabel(match);
  // Accent priority: how the fixture ended matters more than that it ended.
  const accent = outcome ?? display;

  return (
    <article
      className={cn("champ-fixture p-3.5 pl-4 sm:p-4 sm:pl-5", className)}
      data-accent={accent}
      data-muted={muted ? "true" : undefined}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Badge reports the derived state; the card's layout and its actions
              stay keyed on the real status, so nothing becomes joinable early. */}
          <MatchStatusBadge status={display} muted={muted} />
          {outcome && <MatchOutcomeBadge outcome={outcome} />}
        </div>
        {timing && (
          <span className="text-[11px] uppercase tracking-wider champ-meta">{timing}</span>
        )}
      </div>

      <div className="mt-2.5">
        <TeamLine
          team={teamA}
          fallbackLabel="Team A"
          score={match.teamAScore}
          showScore={showScore}
          isMine={!!myTeamId && match.teamAId === myTeamId}
          isWinner={match.winnerTeamId === match.teamAId}
          dimmed={muted}
        />
        <div className="flex items-center gap-2 py-0.5 pl-7">
          <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/25">vs</span>
          <span className="h-px flex-1 bg-white/[0.06]" />
        </div>
        <TeamLine
          team={teamB}
          fallbackLabel="Team B"
          score={match.teamBScore}
          showScore={showScore}
          isMine={!!myTeamId && match.teamBId === myTeamId}
          isWinner={match.winnerTeamId === match.teamBId}
          dimmed={muted}
        />
      </div>

      {actions && <div className="mt-3">{actions}</div>}
    </article>
  );
}
