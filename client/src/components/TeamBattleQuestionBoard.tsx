import React, { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { playSound } from "@/lib/sounds";
import { playBasicSound } from "@/lib/basic-sound";
import { voiceService } from "@/lib/voice-service";
import { isVoiceEnabled } from "@/lib/sounds";

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
  isReadOnly?: boolean;
  answeringTeamName?: string;
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
  isReadOnly = false,
  answeringTeamName,
}) => {
  const [displayTime, setDisplayTime] = useState(timeRemaining);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const questionSessionIdRef = useRef<string | null>(null);
  const hasReadQuestionRef = useRef(false);
  const lastQuestionIdRef = useRef<string>(question.id);
  const lastTimeRemainingRef = useRef<number>(timeRemaining);

  // Sync displayTime with timeRemaining prop when question changes or timeRemaining prop updates
  useEffect(() => {
    const questionChanged = lastQuestionIdRef.current !== question.id;
    const timeChanged = lastTimeRemainingRef.current !== timeRemaining;

    if (questionChanged) {
      lastQuestionIdRef.current = question.id;
      lastTimeRemainingRef.current = timeRemaining;
      setDisplayTime(timeRemaining);
      hasReadQuestionRef.current = false;
      // Clear timer when question changes
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } else if (timeChanged) {
      // If timeRemaining prop changed (server update), sync it
      lastTimeRemainingRef.current = timeRemaining;
      setDisplayTime(timeRemaining);
      // Restart timer with new time
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [question.id, timeRemaining]);

  // Voice narration effect - similar to GameBoard
  useEffect(() => {
    if (isReadOnly || isPaused) return; // Don't read if it's not our turn or paused

    // Generate unique session ID for this question
    const newSessionId = `teambattle-q${currentQuestionIndex + 1}-${Date.now()}`;
    questionSessionIdRef.current = newSessionId;

    // Start new voice session for this question
    voiceService.startNewSession(newSessionId);

    // Read the question if voice is enabled
    // Only read if this question hasn't been read yet (tracked by ref)
    if (isVoiceEnabled() && !hasReadQuestionRef.current) {
      // Mark as read immediately to prevent duplicate reads
      hasReadQuestionRef.current = true;

      // Ensure voice service is ready before speaking
      const readQuestion = async () => {
        try {
          // Double-check conditions before speaking
          if (isPaused || isReadOnly) {
            console.log(`⏭️ [TeamBattle] Skipping narration - paused or read-only`);
            // Reset flag so it can retry when conditions are met
            hasReadQuestionRef.current = false;
            return;
          }

          await voiceService.getVoiceStatus();
          console.log(
            `🔊 [TeamBattle] Voice service ready - reading Question ${currentQuestionIndex + 1} with session ${newSessionId}`
          );

          // Only speak if document is visible and conditions are still met
          if (
            document.visibilityState === "visible" &&
            !isPaused &&
            !isReadOnly
          ) {
            const textToSpeak = `Question ${currentQuestionIndex + 1}: ${question.text}`;
            console.log(
              `📢 [TeamBattle] Starting narration: "${textToSpeak.substring(0, 50)}..."`
            );
            
            // Verify session is still valid before speaking
            const currentSession = voiceService.getCurrentSession();
            if (currentSession === newSessionId || !currentSession) {
              await voiceService.speakWithClonedVoice(
                textToSpeak,
                newSessionId
              );
              console.log(`✅ [TeamBattle] Narration started successfully`);
            } else {
              console.log(`⚠️ [TeamBattle] Session changed, skipping narration. Current: ${currentSession}, Expected: ${newSessionId}`);
              // Reset flag so it can retry
              hasReadQuestionRef.current = false;
            }
          } else {
            console.log(`⏭️ [TeamBattle] Skipping narration - document not visible or conditions changed`);
            // Reset flag so it can retry when conditions are met
            hasReadQuestionRef.current = false;
          }
        } catch (error) {
          console.error("❌ [TeamBattle] Error reading question:", error);
          // Reset the flag on error so it can retry
          hasReadQuestionRef.current = false;
        }
      };

      // Use a delay to ensure everything is ready
      const questionTimer = setTimeout(() => {
        readQuestion();
      }, 1000);

      return () => {
        clearTimeout(questionTimer);
        const currentSession = voiceService.getCurrentSession();
        if (currentSession === newSessionId) {
          console.log(`🧹 [TeamBattle] Cleaning up session ${newSessionId}`);
          voiceService.clearSession();
        }
      };
    } else if (isVoiceEnabled() && hasReadQuestionRef.current) {
      console.log(`⏭️ [TeamBattle] Question ${currentQuestionIndex + 1} already marked as read, skipping narration`);
    }
  }, [question.id, question.text, currentQuestionIndex, isPaused, isReadOnly]);

  // Timer effect - fixed to properly sync with server time
  // This effect restarts when question.id, timeRemaining prop, or timer state changes
  useEffect(() => {
    // Clear any existing timer first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop timer if question is locked, paused, read-only, or time expired
    if (displayTime <= 0 || isQuestionLocked || isPaused || isReadOnly) {
      return;
    }

    // Start countdown timer
    timerRef.current = setInterval(() => {
      setDisplayTime((prev) => {
        const newTime = prev - 1;

        // Only play timer sounds in the last 5 seconds
        if (newTime <= 5 && newTime > 0) {
          if (newTime <= 3) {
            // Urgent countdown for final 3 seconds
            playSound("countdownAlert");
            playBasicSound("timeout");
          } else {
            // Tick sound for 5-4 seconds
            playSound("tick");
            playBasicSound("timeout");
          }
        }

        // Time expired
        if (newTime <= 0) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          playSound("timeout");
          playBasicSound("timeout");
          setTimeout(() => {
            playSound("buzzer");
            playBasicSound("buzzer");
          }, 300);
          return 0;
        }

        return newTime;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [question.id, timeRemaining, isQuestionLocked, isPaused, isReadOnly]); // Restart timer when question or timeRemaining prop changes

  // Cleanup effect to clear intervals and voice session on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (questionSessionIdRef.current) {
        const currentSession = voiceService.getCurrentSession();
        if (currentSession === questionSessionIdRef.current) {
          voiceService.clearSession();
        }
      }
    };
  }, []);

  const timePercentage = (displayTime / timeLimit) * 100;
  const labels = ["A", "B", "C", "D"];

  const handleClick = (answerId: string) => {
    if (isQuestionLocked || isReadOnly) return;
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
    <div className={`flex-grow flex flex-col bg-black rounded-3xl shadow-2xl overflow-hidden relative border-2 ${isReadOnly ? 'border-yellow-500/50' : 'border-accent'}`}>
      {isReadOnly && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-yellow-500/90 to-orange-500/90 text-white py-2 px-4 z-20 text-center">
          <div className="flex items-center justify-center gap-2">
            <Clock className="h-4 w-4 animate-pulse" />
            <span className="font-semibold text-sm sm:text-base">
              {answeringTeamName || "Opponent Team"} is answering this question
            </span>
          </div>
        </div>
      )}
      <div className={`bg-gradient-to-r from-primary to-primary-dark p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 ${isReadOnly ? 'pt-12 sm:pt-12' : ''}`}>
        <div className="flex items-center">
          <span className={`${isReadOnly ? 'bg-yellow-500' : 'bg-accent'} text-primary font-bold rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center mr-2 shadow-glow`}>
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
                disabled={isQuestionLocked || isReadOnly}
                className={`answer-button ${isReadOnly ? 'bg-primary/50 cursor-not-allowed opacity-75' : 'bg-primary hover:bg-primary/90'} text-white font-medium py-3 sm:py-4 md:py-5 px-3 sm:px-4 md:px-6 rounded-xl flex flex-col items-stretch text-left gap-2 min-w-0 w-full relative`}
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

                {isCaptain && !isReadOnly && (
                  <div className="mt-2 flex justify-end">
                    <span className="text-[11px] uppercase tracking-wide text-white/70 bg-white/10 rounded-full px-2 py-0.5">
                      Tap to submit for team
                    </span>
                  </div>
                )}
                {isReadOnly && (
                  <div className="mt-2 flex justify-end">
                    <span className="text-[11px] uppercase tracking-wide text-yellow-300/80 bg-yellow-500/20 rounded-full px-2 py-0.5">
                      View Only - Not Your Turn
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
          {isReadOnly ? (
            <span className="text-[11px] sm:text-xs text-yellow-300/80">
              Waiting for {answeringTeamName || "opponent"} to answer...
            </span>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamBattleQuestionBoard;
