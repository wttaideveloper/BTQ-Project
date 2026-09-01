import { FaithIQTreeMark } from "@/components/championship/game/FaithIQTreeMark";

/**
 * Broadcast header for the public /watch viewer.
 *
 * Presentation only. Every value comes from the match payload the page already
 * loads - there are no viewer counts or channel statistics in that payload, so
 * none are shown.
 */
export function WatchHeader({
  status,
  gameplayStarted,
  teamAName,
  teamBName,
}: {
  status: string;
  /** A fixture is "live" once an admin opens it - play may not have begun. */
  gameplayStarted?: boolean;
  teamAName?: string;
  teamBName?: string;
}) {
  const live = status === "live" && gameplayStarted !== false;
  return (
    <header className="watch-header">
      <div className="flex min-w-0 items-center gap-2">
        <FaithIQTreeMark className="h-7 w-7 shrink-0 text-white" />
        <div className="min-w-0 leading-none">
          <p className="text-xs font-black tracking-[0.16em] text-white sm:text-sm">FAITHIQ LIVE</p>
          <p className="champ-eyebrow mt-1 truncate">FaithIQ Championship</p>
        </div>
      </div>

      <h1 className="min-w-0 truncate text-center text-sm font-black text-white sm:text-lg lg:text-xl">
        <span>{teamAName ?? "Team A"}</span>
        {" "}
        <span className="text-white/30">vs</span>
        {" "}
        <span>{teamBName ?? "Team B"}</span>
      </h1>

      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] ${
          live
            ? "border-[#f0576a]/60 bg-[#f0576a] text-white"
            : status === "completed"
              ? "border-white/15 bg-white/[0.05] text-white/65"
              : "border-[#e7c766]/35 bg-[#e7c766]/10 text-[#e7c766]"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full bg-current ${live ? "animate-pulse" : ""}`} />
        {live ? "Live" : status === "completed" ? "Completed" : status === "live" ? "Starting soon" : "Upcoming"}
      </span>
    </header>
  );
}
