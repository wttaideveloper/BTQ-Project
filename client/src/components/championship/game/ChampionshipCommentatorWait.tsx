import { Mic } from "lucide-react";

/**
 * Compact player-side status while a Championship question is scored and
 * the commentator has not yet pressed NEXT QUESTION.
 */
export function ChampionshipCommentatorWait({
  tone = "board",
}: {
  tone?: "board" | "result";
}) {
  const onBoard = tone === "board";
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        onBoard
          ? "flex items-start gap-2.5 border-y border-[#d8b25f]/35 bg-[#d8b25f]/10 px-3 py-2 sm:px-4"
          : "mt-4 flex items-start gap-2.5 rounded-xl border border-[#d8b25f]/45 bg-[#d8b25f]/10 px-3 py-2.5 text-left"
      }
    >
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#d8b25f]/50 bg-[#1a0d3d]"
        aria-hidden="true"
      >
        <Mic className="h-3.5 w-3.5 animate-pulse text-[#f0d08a]" />
      </span>
      <div className="min-w-0">
        <p
          className={`text-[10px] font-black uppercase tracking-[0.16em] sm:text-[11px] ${
            onBoard ? "text-[#f0d08a]" : "text-[#1b2559]"
          }`}
        >
          Waiting for commentator
        </p>
        <p
          className={`text-xs leading-snug sm:text-sm ${
            onBoard ? "text-[#f0d08a]/85" : "text-[#1b2559]/70"
          }`}
        >
         The commentator will start the next question shortly.
        </p>
      </div>
    </div>
  );
}
