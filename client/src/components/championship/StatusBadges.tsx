import { Crown, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChampionshipStatus, MatchDisplayState, MatchOutcome } from "@/lib/championship";

/**
 * Status pills for the Championship player portal.
 *
 * Colour carries one meaning across the whole page, and status colour is used
 * as a thin accent rather than a fill so the navy/gold palette stays dominant:
 *   crimson - genuinely live right now
 *   gold    - kick-off reached, waiting on the organiser
 *   amber   - scheduled, not yet playable
 *   emerald - finished / positive participation
 *   muted   - not the player's concern
 */

const badgeBase =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap backdrop-blur-[1px]";

const MATCH_TONES: Record<MatchDisplayState, { label: string; className: string }> = {
  live: { label: "Live now", className: "border-[#f0576a]/45 bg-[#f0576a]/12 text-[#ff9aa6]" },
  // Deliberately not crimson: the match is not live and cannot be joined yet.
  ready: { label: "Ready to start", className: "border-[#d4af37]/50 bg-[#d4af37]/12 text-[#f0d58a]" },
  upcoming: { label: "Upcoming", className: "border-[#e7c766]/30 bg-[#e7c766]/10 text-[#e7c766]" },
  completed: { label: "Completed", className: "border-white/12 bg-white/[0.04] text-white/65" },
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
  active: { label: "Active", className: "border-[#4fd1a5]/35 bg-[#4fd1a5]/10 text-[#7ee2be]" },
  draft: { label: "Draft", className: "border-white/12 bg-white/[0.04] text-white/55" },
  completed: { label: "Completed", className: "border-white/12 bg-white/[0.04] text-white/65" },
};

export function ChampionshipStatusBadge({ status, className }: { status: ChampionshipStatus; className?: string }) {
  const tone = CHAMPIONSHIP_TONES[status];
  return (
    <span className={cn(badgeBase, tone.className, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "active" && "animate-pulse")} />
      {tone.label}
    </span>
  );
}

/** "You are participating" / "You are not participating". */
export function ParticipationBadge({ participating, className }: { participating: boolean; className?: string }) {
  return (
    <span
      className={cn(
        badgeBase,
        participating
          ? "border-[#4fd1a5]/35 bg-[#4fd1a5]/10 text-[#7ee2be]"
          : "border-white/12 bg-white/[0.04] text-white/55",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", participating ? "bg-[#4fd1a5]" : "bg-white/35")} />
      {participating ? "Participating" : "Not participating"}
    </span>
  );
}

/** Captain vs member - the one place gold is spent inside the team panel. */
export function TeamRoleBadge({ isCaptain, className }: { isCaptain: boolean; className?: string }) {
  const Icon = isCaptain ? Crown : Shield;
  return (
    <span
      className={cn(
        badgeBase,
        isCaptain
          ? "border-[#d4af37]/45 bg-[#d4af37]/12 text-[#f0d58a]"
          : "border-white/12 bg-white/[0.04] text-white/65",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {isCaptain ? "Captain" : "Member"}
    </span>
  );
}

const OUTCOME_TONES: Record<MatchOutcome, { label: string; className: string }> = {
  won: { label: "You won", className: "border-[#4fd1a5]/40 bg-[#4fd1a5]/12 text-[#7ee2be]" },
  lost: { label: "You lost", className: "border-[#c76a7a]/35 bg-[#c76a7a]/10 text-[#e2a3ad]" },
  draw: { label: "Draw", className: "border-white/15 bg-white/[0.05] text-white/70" },
};

/** Result of a finished match from the player's own team's point of view. */
export function MatchOutcomeBadge({ outcome, className }: { outcome: MatchOutcome; className?: string }) {
  const tone = OUTCOME_TONES[outcome];
  return <span className={cn(badgeBase, tone.className, className)}>{tone.label}</span>;
}
