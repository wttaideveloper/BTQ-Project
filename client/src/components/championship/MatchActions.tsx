import { Eye, Loader2, Play, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatchStatus } from "@/lib/championship";

/**
 * The buttons a single match offers, derived from the player's relationship to
 * it. There is deliberately no generic "Watch" here: every label states what
 * the player will actually get.
 *
 *   live + eligible    -> Join match      (the only place Join is ever shown)
 *   live + not mine    -> Watch live
 *   upcoming + mine    -> View match      (fixture detail / stream page)
 *   upcoming + not mine-> nothing, the schedule line is the whole story
 *   completed          -> View result     (opens the result dialog in place)
 *
 * A completed match has no video to play - /watch only attaches the HLS stream
 * while status is "live" - so a finished match never offers a watch button that
 * would open an empty player. It shows its result without leaving the page.
 */
export function MatchActions({
  status,
  mine,
  canJoin,
  joining = false,
  onJoin,
  onOpen,
  onViewResult,
  size = "default",
  className,
}: {
  status: MatchStatus;
  /** Does this match involve the player's own team? */
  mine: boolean;
  /** Eligibility mirrors POST /api/championship-matches/:id/join. */
  canJoin: boolean;
  joining?: boolean;
  onJoin: () => void;
  /** Opens the live / upcoming match page. Never used for a finished match. */
  onOpen: () => void;
  /** Opens the result dialog in place, on this page. */
  onViewResult: () => void;
  size?: "sm" | "default";
  className?: string;
}) {
  const buttonSize = size === "sm" ? "sm" : "default";

  if (status === "live") {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        {canJoin ? (
          <Button
            size={buttonSize}
            onClick={onJoin}
            disabled={joining}
            className="bg-accent hover:bg-accent/90 text-primary font-bold"
          >
            {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {joining ? "Joining…" : "Join match"}
          </Button>
        ) : (
          <Button size={buttonSize} variant="outline" className="home-btn-outline" onClick={onOpen}>
            <Eye className="mr-2 h-4 w-4" /> Watch live
          </Button>
        )}
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        <Button size={buttonSize} variant="outline" className="home-btn-outline" onClick={onViewResult}>
          <Trophy className="mr-2 h-4 w-4" /> View result
        </Button>
      </div>
    );
  }

  // Upcoming: only the player's own fixture gets an action. An unrelated
  // scheduled match must not look joinable or openable.
  if (!mine) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button size={buttonSize} variant="outline" className="home-btn-outline" onClick={onOpen}>
        <Eye className="mr-2 h-4 w-4" /> View match
      </Button>
    </div>
  );
}
