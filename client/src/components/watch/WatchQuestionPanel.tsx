import { Check, X } from "lucide-react";
import { TeamAvatar } from "@/components/championship/TeamAvatar";

export interface WatchQuestionOption {
  id: string;
  text: string;
}

export interface WatchQuestion {
  questionId: string;
  questionNumber?: number;
  totalQuestions?: number;
  questionText?: string;
  options: WatchQuestionOption[];
  answeringTeamId?: string;
  answeringTeamName?: string;
}

export interface WatchQuestionResult {
  questionId: string;
  selectedAnswerId: string | null;
  correctAnswerId: string | null;
  isCorrect: boolean;
  pointsAwarded: number;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** "Team A" -> "Team A's", "Faith Titans" -> "Faith Titans'". */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * The live question, as a spectator sees it.
 *
 * STRICTLY DISPLAY-ONLY: options are rendered as <div>s, never buttons, and
 * this component has no handlers - a watcher cannot answer, and there is
 * nothing to click. Everything comes from the two sanitised championship
 * broadcasts; correctness only exists here once `result` has arrived, which the
 * server sends after the answering team's answer is evaluated and committed.
 */
export function WatchQuestionPanel({
  question,
  result,
  teamEmoticon,
  teamLogoUrl,
  variant = "watch",
}: {
  question: WatchQuestion;
  /** Null while the team is still answering. */
  result: WatchQuestionResult | null;
  teamEmoticon?: string;
  teamLogoUrl?: string | null;
  /** Broadcast desk hides duplicate chrome and wraps option text. Watch Live stays default. */
  variant?: "watch" | "broadcast";
}) {
  const resolved = result?.questionId === question.questionId ? result : null;
  const desk = variant === "broadcast";

  return (
    <div className={`champ-fade-in mx-auto w-full text-left ${desk ? "" : "max-w-2xl"}`}>
      {!desk && question.questionNumber && (
        <p className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
          Question {question.questionNumber}
          {question.totalQuestions ? ` / ${question.totalQuestions}` : ""}
        </p>
      )}

      {/* Whose turn it is — the single most important line for a spectator.
          Built as one string so the possessive never separates from the name.
          The broadcast desk already shows turn above the stage. */}
      {!desk && question.answeringTeamName && (
        <div className="mt-1.5 flex justify-center">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] transition-colors sm:text-sm ${
              resolved
                ? "border-white/15 bg-white/[0.05] text-white/70"
                : "watch-turn-live border-[#d4af37]/50 bg-[#d4af37]/12 text-[#f0d58a]"
            }`}
          >
            {teamEmoticon && (
              <span className={resolved ? undefined : "watch-turn-pulse"}>
                <TeamAvatar logoUrl={teamLogoUrl} emoticon={teamEmoticon} alt={`${question.answeringTeamName} logo`} className="h-5 w-5 text-base" />
              </span>
            )}
            {resolved
              ? `${question.answeringTeamName} answered`
              : `${possessive(question.answeringTeamName)} turn`}
          </span>
        </div>
      )}

      {question.questionText && (
        <p className={`text-center font-bold leading-snug text-pretty text-white ${
          desk
            ? "text-xl sm:text-2xl lg:text-[1.85rem] lg:leading-snug"
            : "mt-2.5 text-base sm:text-lg"
        }`}>
          {question.questionText}
        </p>
      )}

      <div className={`grid sm:grid-cols-2 ${desk ? "mt-5 gap-2.5 sm:gap-3" : "mt-3 gap-1.5"}`}>
        {question.options.map((option, index) => {
          const isSelected = resolved?.selectedAnswerId === option.id;
          const isCorrectAnswer = !!resolved && resolved.correctAnswerId === option.id;
          const dimmed = !!resolved && !isSelected && !isCorrectAnswer;

          return (
            <div
              key={option.id}
              className={`flex items-center gap-2.5 rounded-xl border transition-colors ${
                desk ? "flex-wrap px-3.5 py-2.5 sm:px-4 sm:py-3" : "px-3 py-2"
              } ${
                isSelected && resolved?.isCorrect
                  ? "border-[#4fd1a5]/60 bg-[#4fd1a5]/12"
                  : isSelected
                    ? "border-[#c76a7a]/55 bg-[#c76a7a]/12"
                    : isCorrectAnswer
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
                  isSelected || isCorrectAnswer
                    ? "border-white/25 bg-white/10 text-white"
                    : "border-[#d4af37]/35 bg-[#1a0d3d] text-white/80"
                }`}
              >
                {LETTERS[index] ?? index + 1}
              </span>
              <span className={`min-w-0 flex-1 font-semibold text-white/90 ${desk ? "break-words text-sm sm:text-base" : "truncate text-sm"}`}>{option.text}</span>
              {isSelected && (
                <span
                  className={`flex shrink-0 items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                    resolved?.isCorrect ? "text-[#7ee2be]" : "text-[#e2a3ad]"
                  }`}
                >
                  {resolved?.isCorrect ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
                  Selected
                </span>
              )}
              {!isSelected && isCorrectAnswer && (
                <span className="flex shrink-0 items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#f0d58a]">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  Correct
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!desk && (resolved ? (
        <div
          key={`${resolved.questionId}-result`}
          className={`champ-fade-in mt-3 rounded-xl border px-4 py-2.5 text-center ${
            resolved.isCorrect ? "border-[#4fd1a5]/45 bg-[#4fd1a5]/10" : "border-[#c76a7a]/40 bg-[#c76a7a]/10"
          }`}
        >
          <p
            className={`flex items-center justify-center gap-2 text-sm font-black uppercase tracking-[0.18em] ${
              resolved.isCorrect ? "text-[#7ee2be]" : "text-[#e2a3ad]"
            }`}
          >
            {resolved.isCorrect ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
            {resolved.isCorrect ? "Correct" : "Incorrect"}
          </p>
          <p className="mt-0.5 text-lg font-black text-white tabular-nums">
            +{resolved.pointsAwarded} <span className="text-xs font-bold text-white/45">points</span>
          </p>
        </div>
      ) : (
        <p className="mt-2.5 text-center text-xs champ-meta">
          {question.answeringTeamName ? `${question.answeringTeamName} is answering…` : "Waiting for the answer…"}
        </p>
      ))}
    </div>
  );
}
