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
  gameplayStarted,
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
  questionPanel,
}: {
  status: string;
  /** Has play actually begun? A fixture is "live" before any captain starts it. */
  gameplayStarted: boolean;
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
  /** The live question broadcast, when the page has received one. */
  questionPanel?: ReactNode;
}) {
  // THE ONE PLACE THE VISUAL STAGE IS DECIDED.
  //
  //   waiting  - fixture open, captains have not started play yet
  //   toss/    - play running: whichever panel the page supplies
  //   question
  //   completed / upcoming - unchanged
  //
  // `status` alone cannot make this call: it reads "live" from the moment an
  // admin opens the fixture, while the team_battles row is still forming.
  const awaitingKickoff = status === "live" && !gameplayStarted;
  const showQuestion = status === "live" && gameplayStarted && !!questionPanel;

  const heading =
    status === "completed"
      ? "Match complete"
      : awaitingKickoff
        ? "Match starting soon"
        : status === "live"
          ? "Match in progress"
          : "Stream begins soon";

  return (
    // 16:9 only while a video is playing. With a question panel inside, a fixed
    // ratio would either clip the options on a phone or leave a half-empty box
    // on a desktop, so the composed stage sizes to its content instead.
    <section className={`watch-stage ${media ? "aspect-video" : "min-h-[15rem]"}`}>
      {media ? (
        media
      ) : (
        <div className="relative grid h-full place-items-center px-4 py-6 text-center sm:px-6 sm:py-7">
          <FaithIQTreeMark className="pointer-events-none absolute -right-8 -top-10 h-56 w-56 text-white/[0.04] sm:h-72 sm:w-72" />

          <div className="relative w-full max-w-2xl">
            <div className="flex items-center justify-center gap-2">
              <FaithIQTreeMark className="h-4 w-4 text-[#d4af37]" />
              <p className="champ-eyebrow">FaithIQ Championship</p>
            </div>

            <div className={`mx-auto h-px max-w-[10rem] bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent ${showQuestion ? "my-3" : "my-4"}`} />

            {!showQuestion && (
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
            )}

            {!showQuestion && (
            <h2 className="mt-4 text-xl font-black uppercase tracking-[0.14em] text-white sm:text-2xl">
              {heading}
            </h2>
            )}

            {status !== "upcoming" && !showQuestion && (
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

            {/*
              Live question panel.

              The spectator socket receives the question NUMBER only - the five
              championship broadcasts carry no question text, options, selected
              answer or correct answer (see the report). So this shows exactly
              what is known and says plainly what it is waiting for, rather than
              rendering an empty frame or inventing a question.
            */}
            {awaitingKickoff && (
              <p className="mt-4 text-xs champ-meta">
                Waiting for the captains to start the match…
              </p>
            )}

            {status === "live" && gameplayStarted && (
              <div className={showQuestion ? "mt-1" : "mt-5"}>
                {questionPanel ?? (
                  liveQuestion ? (
                    <div className="mx-auto max-w-sm rounded-xl border border-[#d4af37]/30 bg-white/[0.04] px-5 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Now playing</p>
                      <p className="champ-scoreline mt-1 text-3xl font-black text-white">Question {liveQuestion}</p>
                      <p className="mt-1.5 text-xs champ-meta">Waiting for the question to be broadcast…</p>
                    </div>
                  ) : (
                    <p className="text-xs champ-meta">Waiting for the next question…</p>
                  )
                )}
              </div>
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
      {status === "live" && gameplayStarted && (
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
