import { Crown, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChampionshipStatus, MatchDisplayState, MatchOutcome } from "@/lib/championship";

/**
 * Status pills for the player dashboard.
 *
 * Colour has one meaning across the whole page:
 *   red    - genuinely live right now
 *   sky    - kick-off time reached, waiting on the organiser to start it
 *   amber  - scheduled, not yet playable
 *   green  - finished / positive participation
 *   muted  - not the player's concern
 */

const badgeBase =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider whitespace-nowrap";

const MATCH_TONES: Record<MatchDisplayState, { label: string; className: string }> = {
  live: { label: "Live now", className: "border-red-400/50 bg-red-500/15 text-red-200" },
  // Deliberately NOT red: the match is not live and cannot be joined yet.
  ready: { label: "Ready to start", className: "border-sky-400/50 bg-sky-400/15 text-sky-200" },
  upcoming: { label: "Upcoming", className: "border-amber-400/50 bg-amber-400/15 text-amber-200" },
  completed: { label: "Completed", className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" },
};

export function MatchStatusBadge({
  status,
  muted = false,
  className,
}: {
  status: MatchDisplayState;
  /** Unrelated matches keep the same wording but step back visually. */
  muted?: boolean;
  className?: string;
}) {
  const tone = MATCH_TONES[status];
  return (
    <span className={cn(badgeBase, tone.className, muted && "opacity-70", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "live" && "animate-pulse")} />
      {tone.label}
    </span>
  );
}

const CHAMPIONSHIP_TONES: Record<ChampionshipStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" },
  draft: { label: "Draft", className: "border-white/15 bg-white/5 text-white/60" },
  completed: { label: "Completed", className: "border-white/15 bg-white/5 text-white/70" },
};

export function ChampionshipStatusBadge({ status, className }: { status: ChampionshipStatus; className?: string }) {
  const tone = CHAMPIONSHIP_TONES[status];
  return (
    <span className={cn(badgeBase, tone.className, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {tone.label}
    </span>
  );
}

/** "You are participating" / "You are not participating" - question 1 of the page. */
export function ParticipationBadge({ participating, className }: { participating: boolean; className?: string }) {
  return (
    <span
      className={cn(
        badgeBase,
        participating
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          : "border-white/15 bg-white/5 text-white/55",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", participating ? "bg-emerald-400" : "bg-white/40")} />
      {participating ? "You are participating" : "You are not participating"}
    </span>
  );
}

/** Captain vs member - question 3 of the page. */
export function TeamRoleBadge({ isCaptain, className }: { isCaptain: boolean; className?: string }) {
  const Icon = isCaptain ? Crown : Shield;
  return (
    <span
      className={cn(
        badgeBase,
        isCaptain
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-white/15 bg-white/5 text-white/70",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {isCaptain ? "Captain" : "Member"}
    </span>
  );
}

const OUTCOME_TONES: Record<MatchOutcome, { label: string; className: string }> = {
  won: { label: "Won", className: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" },
  lost: { label: "Lost", className: "border-white/15 bg-white/5 text-white/60" },
  draw: { label: "Draw", className: "border-sky-400/30 bg-sky-400/10 text-sky-200" },
};

/** Result of a finished match from the player's own team's point of view. */
export function MatchOutcomeBadge({ outcome, className }: { outcome: MatchOutcome; className?: string }) {
  const tone = OUTCOME_TONES[outcome];
  return <span className={cn(badgeBase, tone.className, className)}>{tone.label}</span>;
}
