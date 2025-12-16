import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { playSound } from "@/lib/sounds";
import { playBasicSound } from "@/lib/basic-sound";

export type TeamBattleAnswer = {
  id: string;
  text: string;
};

export type TeamBattleQuestion = {
  id: string;
  text: string;
  context?: string | null;
};

export type AnswerSuggestion = {
  userId: number;
  username: string;
};

export type SuggestionsByAnswerId = Record<string, AnswerSuggestion[]>;

interface TeamBattleQuestionBoardProps {
  question: TeamBattleQuestion;
  answers: TeamBattleAnswer[];
  timeRemaining: number;
  timeLimit: number;
  score: number;
  totalQuestions: number;
  currentQuestionIndex: number;
  category: string;
  difficultyLabel: string;
  isCaptain: boolean;
  isQuestionLocked: boolean;
  suggestions: SuggestionsByAnswerId;
  onMemberSelect: (answerId: string) => void;
  onCaptainSubmit: (answerId: string) => void;
  isPaused?: boolean;
}

const TeamBattleQuestionBoard: React.FC<TeamBattleQuestionBoardProps> = ({
  question,
  answers,
  timeRemaining,
  timeLimit,
  score,
  totalQuestions,
  currentQuestionIndex,
  category,
  difficultyLabel,
  isCaptain,
  isQuestionLocked,
  suggestions,
  onMemberSelect,
  onCaptainSubmit,
  isPaused = false,
}) => {
  const [displayTime, setDisplayTime] = useState(timeRemaining);

  useEffect(() => {
    setDisplayTime(timeRemaining);
  }, [question.id, timeLimit, timeRemaining]);

  useEffect(() => {
    // Mirror single-player behavior: if the question is locked (team answer
    // submitted) or time has expired, stop the local countdown.
    if (displayTime <= 0 || isQuestionLocked || isPaused) return;

    const timer = setInterval(() => {
      setDisplayTime((prev) => {
        if (prev <= 0) {
          return 0;
        }

        if (prev <= 10 && prev > 5) {
          if (prev % 2 === 0) {
            playSound("tick");
            playBasicSound("timeout");
          }
        } else if (prev <= 5 && prev > 3) {
          playSound("tick");
          playBasicSound("timeout");
        } else if (prev <= 3 && prev > 0) {
          playSound("countdownAlert");
          playBasicSound("timeout");
        }

        if (prev <= 1) {
          clearInterval(timer);
          playSound("timeout");
          playBasicSound("timeout");
          setTimeout(() => {
            playSound("buzzer");
            playBasicSound("buzzer");
          }, 300);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [displayTime, timeLimit, isQuestionLocked, isPaused]);

  const timePercentage = (displayTime / timeLimit) * 100;
  const labels = ["A", "B", "C", "D"];

  const handleClick = (answerId: string) => {
    if (isQuestionLocked) return;
    if (isCaptain) {
      onCaptainSubmit(answerId);
    } else {
      onMemberSelect(answerId);
    }
  };

  const getSuggestionsForAnswer = (answerId: string): AnswerSuggestion[] => {
    return suggestions[answerId] || [];
  };

  return (
    <div className="flex-grow flex flex-col bg-black rounded-3xl shadow-2xl overflow-hidden relative border-2 border-accent">
      <div className="bg-gradient-to-r from-primary to-primary-dark p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0">
        <div className="flex items-center">
          <span className="bg-accent text-primary font-bold rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center mr-2 shadow-glow">
            {currentQuestionIndex + 1}
          </span>
          <span className="text-white font-medium text-sm sm:text-lg">
            of {totalQuestions}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center sm:justify-end">
          <div className="px-2 sm:px-3 py-1 sm:py-1.5 bg-secondary rounded-xl shadow-md flex items-center gap-1 sm:gap-2">
            <span className="text-white font-medium text-xs sm:text-sm">
              Category:
            </span>
            <span className="bg-black/30 text-white px-1.5 sm:px-2 py-0.5 rounded-md text-xs sm:text-sm font-bold animate-pulse-slow">
              {category}
            </span>
          </div>

          <div className="px-2 sm:px-3 py-1 sm:py-1.5 bg-secondary rounded-xl shadow-md flex items-center gap-1 sm:gap-2">
            <span className="text-white font-medium text-xs sm:text-sm">
              Level:
            </span>
            <span className="bg-black/30 text-white px-1.5 sm:px-2 py-0.5 rounded-md text-xs sm:text-sm font-bold animate-pulse-slow">
              {difficultyLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="h-4 bg-black w-full relative overflow-hidden">
        <div
          className={`timer-bar h-full ${
            timePercentage > 50
              ? "bg-gradient-to-r from-accent to-accent-dark border-r-2 border-white/50"
              : timePercentage > 20
              ? "bg-gradient-to-r from-orange-500 to-red-500 border-r-2 border-white/50"
              : "bg-gradient-to-r from-red-600 to-red-900 border-r-2 border-white/50"
          }`}
          style={{ width: `${timePercentage}%` }}
        ></div>

        {timePercentage <= 20 && (
          <div
            className="absolute inset-0 bg-red-500/30 animate-pulse"
            style={{ width: `${timePercentage * 3}%` }}
          ></div>
        )}

        <div className="absolute inset-0 flex">
          {Array.from({ length: 20 }).map((_, index) => (
            <div
              key={index}
              className={`h-full flex-1 border-r border-black/40 ${
                index < Math.floor(timePercentage / 5)
                  ? timePercentage <= 20
                    ? "bg-red-600/50 animate-pulse"
                    : timePercentage <= 50
                    ? "bg-orange-500/50"
                    : "bg-accent/50"
                  : "bg-transparent"
              }`}
            ></div>
          ))}
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-xs font-bold ${
              timePercentage <= 20 ? "text-red-100 animate-pulse" : "text-white"
            }`}
          >
            {displayTime}s
          </span>
        </div>
      </div>

      <div className="p-3 sm:p-5 md:p-8 flex-grow flex flex-col bg-gradient-to-b from-black to-primary-dark/30">
        <div className="mb-4 sm:mb-6 md:mb-8 text-center bg-secondary/20 p-3 sm:p-4 md:p-5 rounded-xl border border-secondary/30">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-heading font-bold text-white mb-2 sm:mb-3">
            {question.text}
          </h2>
          {question.context && (
            <p className="text-white/80 text-sm sm:text-base italic">
              "{question.context}"
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6 flex-grow min-w-0">
          {answers.map((answer, index) => {
            const answerSuggestions = getSuggestionsForAnswer(answer.id);

            return (
              <button
                key={answer.id}
                type="button"
                onClick={() => handleClick(answer.id)}
                disabled={isQuestionLocked}
                className="answer-button bg-primary hover:bg-primary/90 text-white font-medium py-3 sm:py-4 md:py-5 px-3 sm:px-4 md:px-6 rounded-xl flex flex-col items-stretch text-left gap-2 min-w-0 w-full relative"
              >
                <div className="flex items-center min-w-0">
                  <span className="bg-accent text-primary font-bold rounded-full w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 flex items-center justify-center mr-2 sm:mr-3 md:mr-4 shadow-md flex-shrink-0">
                    {labels[index]}
                  </span>
                  <span className="text-sm sm:text-base md:text-lg text-white line-clamp-2 sm:line-clamp-none flex-1 min-w-0 overflow-hidden">
                    {answer.text}
                  </span>
                </div>

                {answerSuggestions.length > 0 && (
                  <div className="absolute top-3 right-2 sm:right-4 flex flex-wrap gap-1 sm:gap-2 max-w-[calc(100%-1rem)]">
                    {answerSuggestions.slice(0, 3).map((s) => (
                      <span
                        key={s.userId}
                        className="px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm rounded-full bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold shadow-lg truncate max-w-16 sm:max-w-24"
                        title={s.username}
                      >
                        {s.username}
                      </span>
                    ))}
                  </div>
                )}

                {isCaptain && (
                  <div className="mt-2 flex justify-end">
                    <span className="text-[11px] uppercase tracking-wide text-white/70 bg-white/10 rounded-full px-2 py-0.5">
                      Tap to submit for team
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-gradient-to-r from-secondary to-secondary-dark p-3 sm:p-4 md:p-5 flex flex-wrap sm:flex-nowrap justify-between items-center gap-3 sm:gap-2 min-w-0">
        <div className="flex items-center min-w-0 flex-shrink">
          <span className="text-white font-bold mr-2 sm:mr-3 text-sm sm:text-base md:text-lg">
            TEAM SCORE:
          </span>
          <div className="bg-accent text-primary font-bold px-2 sm:px-3 md:px-4 py-1 sm:py-2 rounded-lg text-base sm:text-lg md:text-xl shadow-glow animate-pulse-slow">
            {score}
          </div>
        </div>

        <div className="flex gap-2 sm:gap-4 w-full sm:w-auto justify-end p-1">
          {!isCaptain && (
            <span className="text-[11px] sm:text-xs text-white/80">
              Your tap sends a suggestion to your captain
            </span>
          )}
          {isCaptain && (
            <span className="text-[11px] sm:text-xs text-white/80">
              Your tap will lock in the team answer
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamBattleQuestionBoard;
