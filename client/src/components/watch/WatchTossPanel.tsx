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
}: {
  toss: WatchToss;
  /** Null until the toss is decided. */
  result: WatchTossResult | null;
  winnerEmoticon?: string;
  winnerLogoUrl?: string | null;
}) {
  const resolved = result && (!result.questionId || !toss.questionId || result.questionId === toss.questionId)
    ? result
    : null;

  return (
    <div className="watch-question-stack champ-fade-in mx-auto w-full min-w-0 text-left">
      <div className="watch-question-lead">
        <span className="watch-turn-live inline-flex items-center gap-2 rounded-sm border border-[#d4af37]/55 bg-[#d4af37]/12 px-3.5 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#f0d58a] sm:text-sm">
          <Trophy className="h-3.5 w-3.5" />
          Toss question
        </span>

        {toss.questionText && (
          <p className="watch-question-copy">{toss.questionText}</p>
        )}
      </div>

      <div className="watch-answer-grid">
        {toss.options.map((option, index) => {
          const isCorrectAnswer = !!resolved && resolved.correctAnswerId === option.id;
          const dimmed = !!resolved && !isCorrectAnswer;
          return (
            <div
              key={option.id}
              data-state={dimmed ? "dimmed" : isCorrectAnswer ? "correct" : "live"}
              className={`watch-answer-option ${
                isCorrectAnswer
                  ? "border-[#d4af37]/55 bg-[#d4af37]/12"
                  : dimmed
                    ? "border-white/[0.06] bg-white/[0.02] opacity-60"
                    : ""
              }`}
            >
              <span
                className={`watch-answer-letter ${
                  isCorrectAnswer ? "border-white/25 bg-white/10 text-white" : ""
                }`}
              >
                {LETTERS[index] ?? index + 1}
              </span>
              <span className="watch-answer-text">{option.text}</span>
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
        <div className="watch-question-status">
          <div
            key={`${resolved.winnerTeamId ?? "toss"}-result`}
            className="watch-status-card champ-fade-in border border-[#d4af37]/45 bg-[#d4af37]/10"
          >
            <p className="flex items-center justify-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-[#f0d58a]">
              <Trophy className="h-4 w-4" /> Toss winner
            </p>
            <p className="mt-0.5 text-lg font-black text-white">
              {winnerEmoticon && <TeamAvatar logoUrl={winnerLogoUrl} emoticon={winnerEmoticon} alt={`${resolved.winnerTeamName ?? "Winner"} logo`} className="mr-1 inline-grid h-5 w-5 align-middle text-base" />}
              {resolved.winnerTeamName ?? "—"}
            </p>
            {resolved.firstTurnTeamName && (
              <p className="mt-1 text-xs champ-meta">{resolved.firstTurnTeamName} answers first</p>
            )}
          </div>
        </div>
      ) : (
        <div className="watch-question-status">
          <p className="watch-status-card border border-white/10 bg-white/[0.04] text-center text-xs champ-meta">
            Both teams are racing — the first correct answer wins the toss.
          </p>
        </div>
      )}
    </div>
  );
}
