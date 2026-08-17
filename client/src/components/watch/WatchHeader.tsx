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
  teamAName,
  teamBName,
}: {
  status: string;
  teamAName?: string;
  teamBName?: string;
}) {
  const live = status === "live";
  return (
    <header className="champ-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2.5">
        <FaithIQTreeMark className="h-8 w-8 text-white" />
        <div className="leading-none">
          <p className="text-sm font-black tracking-[0.16em] text-white">FAITHIQ LIVE</p>
          <p className="mt-1 text-[9px] font-semibold tracking-[0.24em] text-white/45">BIBLE TRIVIA</p>
        </div>
      </div>

      <div className="order-3 w-full text-center sm:order-2 sm:w-auto">
        <p className="champ-eyebrow">FaithIQ Championship</p>
        <p className="mt-1 truncate text-sm font-bold text-white sm:text-base">
          {teamAName ?? "Team A"} <span className="text-white/30">vs</span> {teamBName ?? "Team B"}
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-white/35">Championship match</p>
      </div>

      <div className="order-2 sm:order-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
            live
              ? "border-[#f0576a]/50 bg-[#f0576a]/15 text-[#ff9aa6]"
              : status === "completed"
                ? "border-white/15 bg-white/[0.05] text-white/65"
                : "border-[#e7c766]/35 bg-[#e7c766]/10 text-[#e7c766]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full bg-current ${live ? "animate-pulse" : ""}`} />
          {live ? "Live" : status === "completed" ? "Completed" : "Upcoming"}
        </span>
      </div>
    </header>
  );
}
