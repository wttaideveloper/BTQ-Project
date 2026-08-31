import { Check, Trophy } from "lucide-react";
import type { WatchQuestionOption } from "./WatchQuestionPanel";
import { TeamAvatar } from "@/components/championship/TeamAvatar";

export interface WatchToss {
  questionId?: string;
  questionText?: string;
  options: WatchQuestionOption[];
}

export interface WatchTossResult {
  questionId?: string;
  winnerTeamId?: string;
  winnerTeamName?: string;
  firstTurnTeamName?: string;
  correctAnswerId?: string | null;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * The toss, as a spectator sees it.
 *
 * DISPLAY-ONLY, on the same terms as WatchQuestionPanel: options are <div>s,
 * there are no handlers, and correctness exists here only once `result` has
 * arrived — the server sends that after finalizeTossWinner has committed.
 *
 * The toss has no answering team: the server's rule is "first correct team wins
 * the toss", so both teams race, and the panel says exactly that rather than
 * inventing a turn. The prize is the first turn, not points, so no score is
 * shown.
 */
export function WatchTossPanel({
  toss,
  result,
  winnerEmoticon,
  winnerLogoUrl,
  variant = "watch",
}: {
  toss: WatchToss;
  /** Null until the toss is decided. */
  result: WatchTossResult | null;
  winnerEmoticon?: string;
  winnerLogoUrl?: string | null;
  /** Broadcast desk uses larger type and wrapping options. Watch Live stays default. */
  variant?: "watch" | "broadcast";
}) {
  const resolved = result && (!result.questionId || !toss.questionId || result.questionId === toss.questionId)
    ? result
    : null;
  const desk = variant === "broadcast";

  return (
    <div className={`champ-fade-in mx-auto w-full text-left ${desk ? "" : "max-w-2xl"}`}>
      {!desk && (
        <div className="flex justify-center">
          <span className="watch-turn-live inline-flex items-center gap-2 rounded-full border border-[#d4af37]/55 bg-[#d4af37]/12 px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#f0d58a] sm:text-sm">
            <Trophy className="h-3.5 w-3.5" />
            Toss question
          </span>
        </div>
      )}

      {toss.questionText && (
        <p className={`text-center font-bold leading-snug text-pretty text-white ${
          desk ? "text-xl sm:text-2xl lg:text-[1.85rem] lg:leading-snug" : "mt-2.5 text-base sm:text-lg"
        }`}>
          {toss.questionText}
        </p>
      )}

      <div className={`grid sm:grid-cols-2 ${desk ? "mt-5 gap-2.5 sm:gap-3" : "mt-3 gap-1.5"}`}>
        {toss.options.map((option, index) => {
          const isCorrectAnswer = !!resolved && resolved.correctAnswerId === option.id;
          const dimmed = !!resolved && !isCorrectAnswer;
          return (
            <div
              key={option.id}
              className={`flex items-center gap-2.5 rounded-xl border transition-colors ${
                desk ? "flex-wrap px-3.5 py-2.5 sm:px-4 sm:py-3" : "px-3 py-2"
              } ${
                isCorrectAnswer
                  ? "border-[#d4af37]/55 bg-[#d4af37]/12"
                  : dimmed
                    ? "border-white/[0.06] bg-white/[0.02] opacity-60"
                    : "border-white/12 bg-white/[0.04]"
              }`}
            >
              <span
                className={`grid shrink-0 place-items-center rounded-full border font-black ${
                  desk ? "h-8 w-8 text-xs sm:h-9 sm:w-9 sm:text-sm" : "h-7 w-7 text-[11px]"
                } ${
                  isCorrectAnswer ? "border-white/25 bg-white/10 text-white" : "border-[#d4af37]/35 bg-[#1a0d3d] text-white/80"
                }`}
              >
                {LETTERS[index] ?? index + 1}
              </span>
              <span className={`min-w-0 flex-1 font-semibold text-white/90 ${desk ? "break-words text-sm sm:text-base" : "truncate text-sm"}`}>{option.text}</span>
              {isCorrectAnswer && (
                <span className="flex shrink-0 items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#f0d58a]">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  Correct
                </span>
              )}
            </div>
          );
        })}
      </div>

      {resolved ? (
        <div
          key={`${resolved.winnerTeamId ?? "toss"}-result`}
          className={`champ-fade-in rounded-xl border border-[#d4af37]/45 bg-[#d4af37]/10 text-center ${
            desk ? "mt-5 px-4 py-4 sm:px-5" : "mt-3 px-4 py-2.5"
          }`}
        >
          <p className={`flex items-center justify-center gap-2 font-black uppercase tracking-[0.18em] text-[#f0d58a] ${desk ? "text-sm sm:text-base" : "text-sm"}`}>
            <Trophy className={desk ? "h-5 w-5" : "h-4 w-4"} /> Toss winner
          </p>
          <p className={`mt-1 font-black text-white ${desk ? "text-xl sm:text-2xl" : "text-lg"}`}>
            {winnerEmoticon && <TeamAvatar logoUrl={winnerLogoUrl} emoticon={winnerEmoticon} alt={`${resolved.winnerTeamName ?? "Winner"} logo`} className={`mr-1 inline-grid align-middle ${desk ? "h-7 w-7 text-lg" : "h-5 w-5 text-base"}`} />}
            {resolved.winnerTeamName ?? "—"}
          </p>
          {resolved.firstTurnTeamName && (
            <p className={`mt-1 champ-meta ${desk ? "text-sm" : "text-xs"}`}>{resolved.firstTurnTeamName} answers first</p>
          )}
        </div>
      ) : (
        <p className={`text-center champ-meta ${desk ? "mt-4 text-sm" : "mt-2.5 text-xs"}`}>
          Both teams are racing — the first correct answer wins the toss.
        </p>
      )}
    </div>
  );
}
