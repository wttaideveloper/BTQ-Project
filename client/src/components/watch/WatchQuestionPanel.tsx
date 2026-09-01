import { Check, X } from "lucide-react";
import { TeamAvatar } from "@/components/championship/TeamAvatar";
import { ChampionshipCommentatorWait } from "@/components/championship/game/ChampionshipCommentatorWait";
import { championshipShouldWaitAfterResults } from "@/lib/championship-commentator-wait";

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

function optionState(
  resolved: WatchQuestionResult | null,
  optionId: string,
): "live" | "selected-correct" | "selected-wrong" | "correct" | "dimmed" {
  if (!resolved) return "live";
  const isSelected = resolved.selectedAnswerId === optionId;
  const isCorrectAnswer = resolved.correctAnswerId === optionId;
  if (isSelected && resolved.isCorrect) return "selected-correct";
  if (isSelected) return "selected-wrong";
  if (isCorrectAnswer) return "correct";
  return "dimmed";
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
}: {
  question: WatchQuestion;
  /** Null while the team is still answering. */
  result: WatchQuestionResult | null;
  teamEmoticon?: string;
  teamLogoUrl?: string | null;
}) {
  const resolved = result?.questionId === question.questionId ? result : null;
  const waitingForCommentator = !!resolved && championshipShouldWaitAfterResults({
    isChampionship: true,
    questionNumber: question.questionNumber,
    totalQuestions: question.totalQuestions,
  });

  return (
    <div key={question.questionId} className="watch-question-stack champ-fade-in mx-auto w-full min-w-0 text-left">
      <div className="watch-question-lead">
        {question.questionNumber && (
          <p className="watch-question-number">
            Question {question.questionNumber}
            {question.totalQuestions ? ` / ${question.totalQuestions}` : ""}
          </p>
        )}

        {/* Whose turn it is — the single most important line for a spectator.
            Built as one string so the possessive never separates from the name. */}
        {question.answeringTeamName && (
          <span
            className={`inline-flex max-w-full items-center gap-2 rounded-sm border px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition-colors sm:text-xs ${
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
            <span className="min-w-0 break-words">
              {resolved
                ? `${question.answeringTeamName} answered`
                : `${possessive(question.answeringTeamName)} turn`}
            </span>
          </span>
        )}

        {question.questionText && (
          <p className="watch-question-copy">{question.questionText}</p>
        )}
      </div>

      <div className="watch-answer-grid">
        {question.options.map((option, index) => {
          const state = optionState(resolved, option.id);
          const isSelected = resolved?.selectedAnswerId === option.id;
          const isCorrectAnswer = !!resolved && resolved.correctAnswerId === option.id;

          return (
            <div
              key={option.id}
              data-state={state}
              className={`watch-answer-option ${
                state === "selected-correct"
                  ? "border-[#4fd1a5]/60 bg-[#4fd1a5]/12"
                  : state === "selected-wrong"
                    ? "border-[#c76a7a]/55 bg-[#c76a7a]/12"
                    : state === "correct"
                      ? "border-[#d4af37]/55 bg-[#d4af37]/12"
                      : state === "dimmed"
                        ? "border-white/[0.06] bg-white/[0.02] opacity-60"
                        : ""
              }`}
            >
              <span
                className={`watch-answer-letter ${
                  isSelected || isCorrectAnswer
                    ? "border-white/25 bg-white/10 text-white"
                    : ""
                }`}
              >
                {LETTERS[index] ?? index + 1}
              </span>
              <span className="watch-answer-text">{option.text}</span>
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

      {resolved ? (
        <div className="watch-question-status space-y-2">
          <div
            key={`${resolved.questionId}-result`}
            className={`watch-status-card champ-fade-in ${
              resolved.isCorrect ? "border border-[#4fd1a5]/45 bg-[#4fd1a5]/10" : "border border-[#c76a7a]/40 bg-[#c76a7a]/10"
            }`}
          >
            <p
              className={`flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.18em] ${
                resolved.isCorrect ? "text-[#7ee2be]" : "text-[#e2a3ad]"
              }`}
            >
              {resolved.isCorrect ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
              {resolved.isCorrect ? "Correct" : "Incorrect"}
            </p>
            <p className="mt-0.5 text-base font-black text-white tabular-nums">
              +{resolved.pointsAwarded} <span className="text-[11px] font-bold text-white/45">points</span>
            </p>
          </div>
          {waitingForCommentator && <ChampionshipCommentatorWait tone="board" />}
        </div>
      ) : (
        <div className="watch-question-status">
          <p className="watch-status-card border border-[#d4af37]/30 bg-[#d4af37]/10 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-[#f0d58a] sm:text-xs">
            {question.answeringTeamName ? `${question.answeringTeamName} is answering…` : "Waiting for the answer…"}
          </p>
        </div>
      )}
    </div>
  );
}
