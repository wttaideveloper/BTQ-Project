import { Check, Clock, Target, Zap } from "lucide-react";
import { FaithIQLockup } from "./FaithIQTreeMark";

export interface ChampionshipBoardAnswer {
  id: string;
  text: string;
}

export interface ChampionshipBoardSuggestion {
  userId: number;
  username: string;
}

/**
 * Championship presentation of the question board.
 *
 * PURE PRESENTATION. It owns no timer, no voice narration, no sound and no
 * answer logic: TeamBattleQuestionBoard keeps all of that and hands this
 * component the values it has already computed (displayTime, timePercentage,
 * the click handler, the lock/read-only flags). Team Battle and Rapid Fire
 * continue to render TeamBattleQuestionBoard's own markup, untouched.
 */
export function ChampionshipQuestionBoard({
  question,
  answers,
  labels,
  displayTime,
  timePercentage,
  score,
  totalQuestions,
  currentQuestionIndex,
  category,
  difficultyLabel,
  isCaptain,
  isQuestionLocked,
  isReadOnly,
  isToss,
  answeringTeamName,
  selectedAnswerId,
  getSuggestionsForAnswer,
  onAnswerClick,
}: {
  question: { id: string; text: string; context?: string | null };
  answers: ChampionshipBoardAnswer[];
  labels: string[];
  displayTime: number;
  timePercentage: number;
  score: number;
  totalQuestions: number;
  currentQuestionIndex: number;
  category: string;
  difficultyLabel: string;
  isCaptain: boolean;
  isQuestionLocked: boolean;
  isReadOnly: boolean;
  isToss: boolean;
  answeringTeamName?: string;
  selectedAnswerId: string | null;
  getSuggestionsForAnswer: (answerId: string) => ChampionshipBoardSuggestion[];
  onAnswerClick: (answerId: string) => void;
}) {
  const urgent = timePercentage <= 20;
  const questionNumber = currentQuestionIndex + 1;

  return (
    <section
      className={`champ-panel champ-enter overflow-hidden rounded-2xl sm:rounded-3xl ${
        isToss ? "champ-turn-active" : ""
      }`}
    >
      {/* Purple tournament band, matching the printed card header. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-5 sm:py-3">
        <FaithIQLockup compact />
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isToss ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8b25f]/60 bg-[#d8b25f]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#f0d08a]">
              <Zap className="h-3 w-3" /> Toss round
            </span>
          ) : (
            <>
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">
                {category}
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">
                {difficultyLabel}
              </span>
            </>
          )}
        </div>
      </div>

      {isReadOnly && !isToss && (
        <div className="flex items-center justify-center gap-2 border-y border-[#d8b25f]/30 bg-[#d8b25f]/10 px-3 py-2 text-center">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[#f0d08a]" />
          <span className="text-xs sm:text-sm font-semibold text-[#f0d08a]">
            {answeringTeamName || "Opponent team"} is answering this question
          </span>
        </div>
      )}

      {/* Ivory question surface. */}
      <div className="relative mt-1 rounded-t-[2rem] border-t border-[#d8b25f]/70 champ-card px-3 pb-5 pt-8 sm:rounded-t-[3rem] sm:px-6 sm:pb-7 sm:pt-10 md:px-10">
        {/* Question number medallion, centred on the cream edge. */}
        <div className="absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-3">
          <span className="hidden h-px w-12 bg-gradient-to-r from-transparent to-[#d8b25f] sm:block" />
          <span className="champ-marker grid h-10 w-10 place-items-center rounded-full text-sm font-black shadow-lg sm:h-11 sm:w-11 sm:text-base">
            {isToss ? "★" : questionNumber}
          </span>
          <span className="hidden h-px w-12 bg-gradient-to-l from-transparent to-[#d8b25f] sm:block" />
        </div>

        {/* Progress + timer. */}
        <div className="mx-auto mb-4 flex max-w-md flex-col items-center gap-2 sm:mb-6">
          {!isToss && (
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1b2559]/50 tabular-nums">
              Question {String(questionNumber).padStart(2, "0")} / {totalQuestions}
            </p>
          )}
          {isToss ? (
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#1b2559]/70">
              <Zap className="h-3.5 w-3.5" /> Be quick · Be correct <Target className="h-3.5 w-3.5" />
            </p>
          ) : (
            <div className="flex w-full items-center gap-3" role="timer" aria-live="off">
              <span className="h-px flex-1 bg-[#1b2559]/15" />
              <span
                className={`rounded-full border px-3 py-1 text-sm font-black tabular-nums transition-colors ${
                  urgent
                    ? "border-red-500/50 bg-red-500/10 text-red-700"
                    : "border-[#d8b25f]/70 bg-white/70 text-[#1b2559]"
                }`}
                aria-label={`${displayTime} seconds remaining`}
              >
                {displayTime}s
              </span>
              <span className="h-px flex-1 bg-[#1b2559]/15" />
            </div>
          )}
          {!isToss && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-[#1b2559]/10">
              <div
                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                  urgent ? "bg-red-500" : "bg-gradient-to-r from-[#d8b25f] to-[#f0d08a]"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, timePercentage))}%` }}
              />
            </div>
          )}
        </div>

        <h2 className="text-balance px-1 text-center text-lg font-bold leading-snug text-[#1b2559] sm:text-2xl md:text-3xl">
          {question.text}
        </h2>
        {question.context && (
          <p className="mt-2 text-center text-sm italic text-[#1b2559]/70">"{question.context}"</p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:mt-7 sm:grid-cols-2 sm:gap-3.5">
          {answers.map((answer, index) => {
            const isSelected = selectedAnswerId === answer.id;
            const isDisabled = isQuestionLocked || isReadOnly;
            const answerSuggestions = getSuggestionsForAnswer(answer.id);
            return (
              <button
                key={answer.id}
                type="button"
                onClick={() => onAnswerClick(answer.id)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                aria-label={`Answer ${labels[index]}: ${answer.text}`}
                data-state={isSelected ? "selected" : "idle"}
                className="champ-answer relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left sm:px-4 sm:py-3.5"
              >
                <span className="champ-marker grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black sm:h-10 sm:w-10">
                  {labels[index]}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-[#1b2559] sm:text-base">
                  {answer.text}
                </span>
                {isSelected && (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#d8b25f]">
                    <Check className="h-3.5 w-3.5 text-[#1b2559]" />
                  </span>
                )}
                {answerSuggestions.length > 0 && (
                  <span className="absolute -top-2 right-2 flex max-w-[70%] flex-wrap justify-end gap-1">
                    {answerSuggestions.slice(0, 3).map(suggestion => (
                      <span
                        key={suggestion.userId}
                        title={suggestion.username}
                        className="max-w-20 truncate rounded-full bg-[#3b1e78] px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                      >
                        {suggestion.username}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer band: team score and the same guidance the board has always given. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Team score</span>
          <span className="rounded-lg border border-[#d8b25f]/50 bg-[#d8b25f]/15 px-2.5 py-0.5 text-base font-black tabular-nums champ-gold-text">
            {score}
          </span>
        </div>
        <p className="text-[10px] sm:text-xs text-white/55">
          {isReadOnly
            ? `Waiting for ${answeringTeamName || "opponent"} to answer…`
            : isCaptain
              ? "Your tap locks in the team answer"
              : "Your tap sends a suggestion to your captain"}
        </p>
      </div>
    </section>
  );
}
