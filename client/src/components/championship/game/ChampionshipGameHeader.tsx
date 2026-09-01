import type { ReactNode } from "react";
import { FaithIQLockup } from "./FaithIQTreeMark";

/**
 * Tournament header for a Championship match.
 *
 * Presentation only: the controls passed as `controls` are the page's existing
 * sound / voice / help / exit buttons with their existing handlers - this
 * component just gives them a championship frame.
 */
export function ChampionshipGameHeader({
  live,
  controls,
}: {
  /** True once the match is actually in play; drives the LIVE lamp only. */
  live: boolean;
  controls?: ReactNode;
}) {
  return (
    <header className="champ-panel rounded-2xl px-3 py-2 sm:px-5 sm:py-2.5">
      <div className="flex items-center justify-between gap-3">
        <FaithIQLockup />

        <div className="hidden md:block min-w-0 text-center">
          <h1 className="truncate text-base lg:text-lg font-black tracking-[0.2em] champ-gold-text">
            FAITHIQ CHAMPIONSHIP
          </h1>
          <p className="mt-0.5 text-[9px] font-semibold tracking-[0.28em] text-white/45">
            BIBLE TRIVIA TOURNAMENT
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
              live
                ? "border-red-400/50 bg-red-500/15 text-red-200"
                : "border-white/15 bg-white/5 text-white/60"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${live ? "animate-pulse" : ""}`} />
            {live ? "Live" : "Standby"}
          </span>
          {controls}
        </div>
      </div>

      {/* Centre title has no room beside the lockup on small screens, so it
          moves to its own line rather than being dropped. */}
      <div className="md:hidden mt-2.5">
        <div className="champ-rule" />
        <p className="mt-2 text-center text-xs font-black tracking-[0.2em] champ-gold-text">
          FAITHIQ CHAMPIONSHIP
        </p>
      </div>
    </header>
  );
}
