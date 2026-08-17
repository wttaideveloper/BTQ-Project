import type { ReactNode } from "react";
import { Radio, Trophy } from "lucide-react";
import { FaithIQTreeMark } from "@/components/championship/game/FaithIQTreeMark";

/**
 * The broadcast stage.
 *
 * When there is video to play the page passes the existing <video> element in
 * as `media` and this component only frames it - the element, its ref and the
 * HLS effect stay exactly where they were, so playback is untouched.
 *
 * With no video (an upcoming fixture, a live match with no stream URL, or a
 * finished one) it renders a composed championship card instead of a black
 * rectangle. Everything shown comes from the match payload the page already
 * has; nothing is computed here, including the winner.
 */
export function WatchStage({
  status,
  teamAName,
  teamBName,
  teamAEmoticon,
  teamBEmoticon,
  teamAScore,
  teamBScore,
  winnerName,
  isDraw,
  liveQuestion,
  scheduledLabel,
  media,
  overlays,
}: {
  status: string;
  teamAName?: string;
  teamBName?: string;
  teamAEmoticon?: string;
  teamBEmoticon?: string;
  teamAScore: number;
  teamBScore: number;
  /** From match.winnerTeamId, resolved by the page. Null for a draw or an unfinished match. */
  winnerName?: string | null;
  isDraw: boolean;
  liveQuestion: number | null;
  scheduledLabel?: string | null;
  /** The page's <video> element, when a stream is playing. */
  media?: ReactNode;
  /** Floating reactions and the stream error notice, positioned over the stage. */
  overlays?: ReactNode;
}) {
  const heading =
    status === "completed" ? "Match complete" : status === "live" ? "Match in progress" : "Stream begins soon";

  return (
    <section className="watch-stage aspect-video">
      {media ? (
        media
      ) : (
        <div className="relative grid h-full place-items-center px-4 text-center">
          <FaithIQTreeMark className="pointer-events-none absolute -right-8 -top-10 h-56 w-56 text-white/[0.04] sm:h-72 sm:w-72" />

          <div className="relative w-full max-w-2xl">
            <div className="flex items-center justify-center gap-2">
              <FaithIQTreeMark className="h-4 w-4 text-[#d4af37]" />
              <p className="champ-eyebrow">FaithIQ Championship</p>
            </div>

            <div className="mx-auto my-4 h-px max-w-[10rem] bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent" />

            <span
              className={`mx-auto grid h-14 w-14 place-items-center rounded-full border ${
                status === "completed"
                  ? "border-[#d4af37]/60 bg-[#d4af37]/10 text-[#f0d58a]"
                  : status === "live"
                    ? "border-[#f0576a]/45 bg-[#f0576a]/10 text-[#ff9aa6]"
                    : "border-white/15 bg-white/[0.04] text-white/50"
              }`}
            >
              {status === "completed" ? <Trophy className="h-6 w-6" /> : <Radio className="h-6 w-6" />}
            </span>

            <h2 className="mt-4 text-xl font-black uppercase tracking-[0.14em] text-white sm:text-2xl">
              {heading}
            </h2>

            {status !== "upcoming" && (
              <div className="mt-5 flex items-center justify-center gap-3 sm:gap-6">
                <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <span className="text-xl" aria-hidden="true">{teamAEmoticon ?? "🏳️"}</span>
                  <span className="truncate text-sm font-bold text-white/85 sm:text-base">{teamAName ?? "Team A"}</span>
                </span>
                <span className="champ-scoreline shrink-0 text-3xl font-black text-white sm:text-4xl">
                  {teamAScore}
                  <span className="mx-2 align-middle text-lg text-white/25">:</span>
                  {teamBScore}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{teamBEmoticon ?? "🏳️"}</span>
                  <span className="truncate text-sm font-bold text-white/85 sm:text-base">{teamBName ?? "Team B"}</span>
                </span>
              </div>
            )}

            {status === "completed" && (
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/45">
                {isDraw ? (
                  "Result · Draw"
                ) : winnerName ? (
                  <>
                    Winner · <span className="text-[#f0d58a]">{winnerName}</span>
                  </>
                ) : (
                  "Final score"
                )}
              </p>
            )}

            {status === "live" && (
              <p className="mt-4 text-xs champ-meta">
                {liveQuestion ? `Question ${liveQuestion} in play` : "No video stream for this match — live scores below."}
              </p>
            )}

            {status === "upcoming" && (
              <p className="mt-4 text-xs champ-meta">
                {scheduledLabel ? `Scheduled for ${scheduledLabel}` : "A kick-off time has not been announced yet."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Live ribbon over the top edge of the stage. */}
      {status === "live" && (
        <div className="watch-ribbon pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-4 py-2.5">
          <span className="flex items-center gap-1.5 rounded-full border border-[#f0576a]/50 bg-[#f0576a]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff9aa6]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Live
          </span>
          {liveQuestion && (
            <span className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
              Question {liveQuestion}
            </span>
          )}
        </div>
      )}

      {overlays}
    </section>
  );
}
