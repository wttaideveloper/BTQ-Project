import { Check, X } from "lucide-react";

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
}: {
  question: WatchQuestion;
  /** Null while the team is still answering. */
  result: WatchQuestionResult | null;
  teamEmoticon?: string;
}) {
  const resolved = result?.questionId === question.questionId ? result : null;

  return (
    <div className="champ-fade-in mx-auto w-full max-w-2xl text-left">
      <div className="flex flex-wrap items-center justify-center gap-2 text-center">
        {question.questionNumber && (
          <span className="rounded-full border border-[#d4af37]/35 bg-[#d4af37]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#f0d58a]">
            Question {question.questionNumber}
            {question.totalQuestions ? ` / ${question.totalQuestions}` : ""}
          </span>
        )}
        {question.answeringTeamName && (
          <span className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
            {teamEmoticon ? `${teamEmoticon} ` : ""}
            {question.answeringTeamName} {resolved ? "answered" : "is answering"}
          </span>
        )}
      </div>

      {question.questionText && (
        <p className="mt-4 text-center text-base font-bold leading-snug text-white sm:text-lg">
          {question.questionText}
        </p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {question.options.map((option, index) => {
          const isSelected = resolved?.selectedAnswerId === option.id;
          const isCorrectAnswer = !!resolved && resolved.correctAnswerId === option.id;
          const dimmed = !!resolved && !isSelected && !isCorrectAnswer;

          return (
            <div
              key={option.id}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
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
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-black ${
                  isSelected || isCorrectAnswer
                    ? "border-white/25 bg-white/10 text-white"
                    : "border-[#d4af37]/35 bg-[#1a0d3d] text-white/80"
                }`}
              >
                {LETTERS[index] ?? index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{option.text}</span>
              {isSelected && (
                <span
                  className={`shrink-0 text-[9px] font-black uppercase tracking-[0.14em] ${
                    resolved?.isCorrect ? "text-[#7ee2be]" : "text-[#e2a3ad]"
                  }`}
                >
                  Selected
                </span>
              )}
              {!isSelected && isCorrectAnswer && (
                <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.14em] text-[#f0d58a]">
                  Correct
                </span>
              )}
            </div>
          );
        })}
      </div>

      {resolved ? (
        <div
          className={`champ-fade-in mt-4 rounded-xl border px-4 py-3 text-center ${
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
          <p className="mt-1 text-lg font-black text-white tabular-nums">
            +{resolved.pointsAwarded} <span className="text-xs font-bold text-white/45">points</span>
          </p>
        </div>
      ) : (
        <p className="mt-4 text-center text-xs champ-meta">
          {question.answeringTeamName ? `${question.answeringTeamName} is answering…` : "Waiting for the answer…"}
        </p>
      )}
    </div>
  );
}
