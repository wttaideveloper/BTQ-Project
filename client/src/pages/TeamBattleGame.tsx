import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Clock,
  Users,
  Crown,
  Check,
  X,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { setupGameSocket, sendGameEvent, closeGameSocket } from "@/lib/socket";
import TeamBattleQuestionBoard, {
  SuggestionsByAnswerId,
} from "@/components/TeamBattleQuestionBoard";
import FeedbackModal from "@/components/FeedbackModal";
import {
  initSounds,
  isSoundEnabled,
  isVoiceEnabled,
  stopSpeaking,
  toggleSound,
  toggleVoice,
} from "@/lib/sounds";

interface TeamMember {
  userId: number;
  username: string;
  role: "captain" | "member";
  joinedAt: Date;
}

interface Team {
  id: string;
  name: string;
  captainId: number;
  gameSessionId: string;
  members: TeamMember[];
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  status: "forming" | "ready" | "playing" | "finished";
}

interface Question {
  id: string;
  text: string;
  answers: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
  category: string;
  difficulty: string;
  timeLimit?: number;
}

interface GameState {
  phase: "waiting" | "ready" | "playing" | "question" | "results" | "finished";
  currentQuestion?: Question;
  questionNumber?: number;
  totalQuestions?: number;
  timeRemaining?: number;
  timeLimit?: number; // Server time limit in milliseconds
  teams?: Team[];
  playerTeam?: Team;
  opposingTeam?: Team;
  finalScore?: number;
  correct?: number;
  incorrect?: number;
  isYourTurn?: boolean;
  answeringTeamName?: string;
}

export default function TeamBattleGame() {
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [gameState, setGameState] = useState<GameState>({ phase: "waiting" });
  const gameStateRef = useRef<GameState>(gameState);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [teamAnswer, setTeamAnswer] = useState<string | null>(null);
  const [memberAnswers, setMemberAnswers] = useState<Record<string, string>>(
    {}
  );
  const [connected, setConnected] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionsByAnswerId>({});
  const [waitingForResults, setWaitingForResults] = useState(false);
  const [correctAnswerId, setCorrectAnswerId] = useState<string | null>(null);
  const [showRoundFeedback, setShowRoundFeedback] = useState(false);
  const [lastRoundCorrect, setLastRoundCorrect] = useState<boolean | null>(
    null
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    isSoundEnabled()
  );
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() =>
    isVoiceEnabled()
  );

  // Pause functionality
  const [isPaused, setIsPaused] = useState(false);
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null);
  const [totalPauseTime, setTotalPauseTime] = useState(0);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (lastRoundCorrect !== null) {
      setShowRoundFeedback(true);
    }
  }, [lastRoundCorrect]);

  // Get game session ID from URL
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const gameSessionId =
    params.get("session") ??
    params.get("gameSessionId") ??
    params.get("gameSession");

  useEffect(() => {
    if (!user) {
      setLocation("/");
      return;
    }

    if (!gameSessionId) {
      setLocation("/");
      return;
    }

    // Setup WebSocket connection
    const socket = setupGameSocket(user.id);

    // Request game state function - will be called after authentication
    const requestGameState = () => {
      if (gameSessionId && user?.id) {
        sendGameEvent({
          type: "get_game_state",
          gameSessionId,
          userId: user.id,
        });
      }
    };

    // If socket is already open, request game state after a short delay
    // (authentication might already be complete)
    if (socket.readyState === WebSocket.OPEN) {
      setTimeout(() => {
        requestGameState();
      }, 500);
    }

    // Add beforeunload listener to notify server when page is about to unload
    const handleBeforeUnload = () => {
      if (
        connected &&
        gameState.phase !== "waiting" &&
        gameState.phase !== "finished"
      ) {
        try {
          sendGameEvent({
            type: "player_leaving_team_battle",
            gameSessionId,
            userId: user.id,
            username: user.username,
          });
        } catch (e) {
          // Silent error handling
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "connection_established":
            setConnected(true);
            break;

          case "authenticated":
            // Request game state after authentication completes
            requestGameState();
            break;

          case "game_state_update":
            updateGameState(data);
            break;

          case "game_state_restored":
            // Handle game state restoration on page refresh/reconnect
            if (data.team) {
              updateTeamsData([data.team]);
              // Check if team is in a finished battle - redirect to setup
              if (data.team.status === "finished") {
                toast({
                  title: "Battle Finished",
                  description: "This battle has already finished. Redirecting to setup.",
                });
                setTimeout(() => {
                  setLocation("/team-battle");
                }, 2000);
              } else {
                // Team exists but battle may not have started - set phase to ready
                setGameState((prev) => ({
                  ...prev,
                  playerTeam: data.team,
                  phase: prev.phase === "waiting" ? "ready" : prev.phase,
                }));
                toast({
                  title: "Reconnected",
                  description: data.message || "Successfully reconnected to your team",
                });
              }
            }
            break;

          case "no_active_game":
            // No active game found - redirect to setup page
            toast({
              title: "No Active Battle",
              description: data.message || "No active team battle found. Redirecting to team setup.",
              variant: "destructive",
            });
            setTimeout(() => {
              // Redirect to team battle setup page with the session ID if available
              if (gameSessionId) {
                setLocation(`/team-battle?session=${gameSessionId}`);
              } else {
                setLocation("/team-battle");
              }
            }, 2000);
            break;

          case "team_battle_started":
            setGameState((prev) => ({ ...prev, phase: "playing" }));
            toast({
              title: "Battle Started!",
              description:
                "Loading questions... Get ready!",
              duration: 3000,
            });
            // Show loading state while questions are being loaded
            break;

          case "team_battle_question":
            // Validate question data before setting state
            if (!data.question) {
              console.error("Received team_battle_question without question data:", data);
              toast({
                title: "Error",
                description: "Received invalid question data. Please wait...",
                variant: "destructive",
              });
              break;
            }

            setGameState((prev) => ({
              ...prev,
              phase: "question",
              currentQuestion: data.question,
              questionNumber: data.questionNumber,
              totalQuestions: data.totalQuestions,
              // Server sends timeLimit in milliseconds, convert to seconds for display
              timeRemaining: data.timeLimit ? Math.floor(data.timeLimit / 1000) : 15,
              timeLimit: data.timeLimit || 15000, // Store original milliseconds value
              isYourTurn: data.isYourTurn !== false, // Default to true if not specified
              answeringTeamName: data.answeringTeamName,
            }));
            
            // Reset answer state for BOTH teams when new question arrives
            // This ensures clean state for both answering and waiting teams
            setSelectedAnswer(null);
            setHasSubmitted(false);
            setTeamAnswer(null);
            setMemberAnswers({});
            setSuggestions({});
            setWaitingForResults(false);
            setCorrectAnswerId(null);
            setLastRoundCorrect(null);
            break;

          case "team_answer_submitted":
            if (data.userId !== user.id) {
              setMemberAnswers((prev) => ({
                ...prev,
                [data.username]: data.answerId,
              }));
            }
            break;

          case "team_option_selected": {
            // Lightweight per-click suggestion update. We intentionally avoid
            // relying on gameState here so this works reliably for all
            // teammates as events stream in from the server.
            if (!data.teamId || !data.answerId || !data.userId) {
              break;
            }

            setSuggestions((prev) => {
              const next: SuggestionsByAnswerId = { ...prev };

              // Remove this user's previous suggestion from all answers
              Object.keys(next).forEach((answerId) => {
                next[answerId] = next[answerId].filter(
                  (s) => s.userId !== data.userId
                );
                if (!next[answerId].length) {
                  delete next[answerId];
                }
              });

              const list = next[data.answerId] || [];
              next[data.answerId] = [
                ...list,
                {
                  userId: data.userId,
                  username: data.username,
                },
              ];

              return next;
            });
            break;
          }

          case "team_answer_finalized":
            // Our team has locked in an answer. In alternating format, 
            // only one team answers per question, so just lock the answer
            // and wait for the timer to expire (no need to wait for opponent)
            setTeamAnswer(data.finalAnswer.answerId);
            setHasSubmitted(true);
            // Don't set waitingForResults - in alternating format, 
            // we just wait for the timer, not for the other team
            break;

          case "team_battle_question_results": {
            // Question results received - show feedback briefly, then move to next question
            setWaitingForResults(false);

            const correctId: string | null = data.correctAnswer?.id || null;
            setCorrectAnswerId(correctId);

            const resolvedPlayerTeamId =
              gameStateRef.current.playerTeam?.id ||
              gameStateRef.current.teams?.find((team) =>
                team.members.some((member) => member.userId === user?.id)
              )?.id;
            const playerTeamResult = data.teamResults?.find(
              (r: any) => r.teamId === resolvedPlayerTeamId
            );
            
            // Only set feedback if it was actually our turn to answer
            // Use the wasYourTurn flag from server (more reliable than state)
            const wasOurTurn = data.wasYourTurn === true;
            if (wasOurTurn && playerTeamResult) {
              const roundCorrect = !!playerTeamResult?.correct;
              setLastRoundCorrect(roundCorrect);
            } else {
              // Not our turn - don't show feedback modal
              setLastRoundCorrect(null);
              setShowRoundFeedback(false);
            }

            setGameState((prev) => {
              let updatedTeams = prev.teams;

              if (prev.teams && data.leaderboard) {
                updatedTeams = prev.teams.map((team) => {
                  const lb = data.leaderboard.find(
                    (entry: any) => entry.teamId === team.id
                  );
                  return lb ? { ...team, score: lb.score } : team;
                });
              }

              const playerTeam = updatedTeams?.find((team) =>
                team.members.some((member) => member.userId === user?.id)
              );
              const opposingTeam = updatedTeams?.find(
                (team) => team.id !== playerTeam?.id
              );

              return {
                ...prev,
                teams: updatedTeams,
                playerTeam: playerTeam || prev.playerTeam,
                opposingTeam: opposingTeam || prev.opposingTeam,
                // Keep question data for feedback modal, but don't show results screen
                // Phase stays as "question" so feedback modal can show over it
                phase: "question",
                // Keep current question for feedback modal display
                currentQuestion: data.question || prev.currentQuestion,
                // Update isYourTurn based on results
                isYourTurn: data.wasYourTurn !== false,
              };
            });

            // Show feedback modal briefly, then next question will come from server
            break;
          }

          case "team_battle_round_complete":
            // Show round results
            toast({
              title: "Round Complete",
              description: `Your team ${
                data.yourTeamCorrect ? "got it right" : "got it wrong"
              }!`,
            });
            break;

          case "team_battle_finished":
          case "team_battle_ended":
            // Only set to finished if we actually have questions or the battle legitimately ended
            // Don't end battle if questions haven't loaded yet
            setGameState((prev) => {
              // If we never received any questions and we're still in playing phase, something went wrong
              // Don't change to finished - stay in playing to show loading
              if (!prev.currentQuestion && prev.phase === "playing") {
                console.warn("[TeamBattle] Received team_battle_ended but no questions were loaded. Staying in playing phase.");
                return prev; // Don't change phase - keep showing loading
              }
              return {
                ...prev,
                phase: "finished",
                teams: data.finalScores,
                finalScore: data.yourTeam?.score ?? prev.finalScore ?? 0,
                correct: data.yourTeam?.correctAnswers ?? prev.correct ?? 0,
                incorrect: data.yourTeam?.incorrectAnswers ?? prev.incorrect ?? 0,
              };
            });
            setShowRoundFeedback(false);
            toast({
              title: "Battle Finished!",
              description: data.winner
                ? `${data.winner.name} wins!`
                : "It's a draw!",
            });
            break;

          // Handle opponent team disconnect notification
          case "opponent_team_member_disconnected":
            toast({
              title: "⚠️ Opponent Disconnect",
              description: `${data.disconnectedPlayerName} from team ${data.disconnectedTeamName} has disconnected!`,
              variant: "destructive",
            });
            break;

          // Handle end of battle due to opponent team being unavailable
          case "team_battle_ended_opponent_disconnect":
            setGameState((prev) => ({
              ...prev,
              phase: "finished",
              teams: data.finalScores || prev.teams,
              finalScore: data.isWinner
                ? data.finalScores?.[0]?.score ?? 0
                : data.finalScores?.[1]?.score ?? 0,
              correct: data.isWinner
                ? data.finalScores?.[0]?.correctAnswers ?? 0
                : data.finalScores?.[1]?.correctAnswers ?? 0,
              incorrect: data.isWinner
                ? data.finalScores?.[0]?.incorrectAnswers ?? 0
                : data.finalScores?.[1]?.incorrectAnswers ?? 0,
            }));
            setShowRoundFeedback(false);
            toast({
              title: data.isWinner ? "🎉 Victory!" : "❌ Defeat",
              description:
                data.message || "Battle ended due to opponent disconnect",
              variant: data.isWinner ? "default" : "destructive",
            });
            break;

          case "captain_changed":
            if (data.newCaptainId === user?.id) {
              toast({
                title: "👑 You are now the Captain!",
                description:
                  "The previous captain disconnected. You are now in charge of finalizing team answers.",
              });
            } else {
              toast({
                title: "Captain Changed",
                description: `${data.newCaptainName} is now the team captain.`,
              });
            }
            break;

          case "teams_updated":
          case "team_update":
            if (data.teams) {
              updateTeamsData(data.teams);
            }
            break;

          case "error":
            toast({
              title: "Error",
              description: data.message,
              variant: "destructive",
            });
            break;
        }
      } catch (error) {
        // Silent error handling
      }
    };

    socket.addEventListener("message", handleMessage);

    // Cleanup
    return () => {
      socket.removeEventListener("message", handleMessage);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [user, gameSessionId]);

  useEffect(() => {
    initSounds();
  }, []);

  // Add timeout for waiting phase - if stuck for too long, redirect to setup
  useEffect(() => {
    if (gameState.phase === "waiting" && connected) {
      const timeout = setTimeout(() => {
        toast({
          title: "Connection Timeout",
          description: "Unable to restore game state. Redirecting to team setup.",
          variant: "destructive",
        });
        // Redirect to setup page with session ID if available
        setTimeout(() => {
          if (gameSessionId) {
            setLocation(`/team-battle?session=${gameSessionId}`);
          } else {
            setLocation("/team-battle");
          }
        }, 2000);
      }, 10000); // 10 seconds - reduced for faster feedback

      return () => clearTimeout(timeout);
    }
  }, [gameState.phase, connected, gameSessionId, toast, setLocation]);

  // Game state tracking

  const updateGameState = (data: any) => {
    setGameState((prev) => ({
      ...prev,
      ...data.gameState,
      playerTeam: data.playerTeam,
      opposingTeam: data.opposingTeam,
    }));
  };

  const updateTeamsData = (teams: Team[]) => {
    const playerTeam = teams.find((team) =>
      team.members.some((member) => member.userId === user?.id)
    );
    const opposingTeam = teams.find((team) => team.id !== playerTeam?.id);

    setGameState((prev) => ({
      ...prev,
      teams,
      playerTeam,
      opposingTeam,
    }));
  };

  const handleMemberSelect = (answerId: string) => {
    if (!gameState.currentQuestion || !gameState.playerTeam || !user) return;

    sendGameEvent({
      type: "team_option_selected",
      teamId: gameState.playerTeam.id,
      questionId: gameState.currentQuestion.id,
      answerId,
      userId: user.id,
      username: user.username,
    });

    setSelectedAnswer(answerId);
  };

  const handleCaptainSubmit = (answerId: string) => {
    if (!gameState.currentQuestion || !gameState.playerTeam) return;
    if (!isTeamCaptain()) return;

    sendGameEvent({
      type: "finalize_team_answer",
      teamId: gameState.playerTeam.id,
      finalAnswer: {
        questionId: gameState.currentQuestion.id,
        answerId,
      },
    });
  };

  const isTeamCaptain = () => {
    return gameState.playerTeam?.captainId === user?.id;
  };

  const handlePause = () => {
    if (!isPaused) {
      setIsPaused(true);
      setPauseStartTime(Date.now());
      stopSpeaking();
      toast({
        title: "Game Paused",
        description: "The game has been paused.",
        duration: 2000,
      });
    }
  };

  const handleResume = () => {
    if (isPaused && pauseStartTime) {
      const pauseDuration = Date.now() - pauseStartTime;
      setTotalPauseTime((prev) => prev + pauseDuration);
      setIsPaused(false);
      setPauseStartTime(null);
      toast({
        title: "Game Resumed",
        description: "The game has been resumed.",
        duration: 2000,
      });
    }
  };

  const renderWaitingPhase = () => (
    <div className="max-w-xl mx-auto p-3 sm:p-4 md:p-6 w-full min-w-0 overflow-x-hidden">
      <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-3xl shadow-2xl border border-white/10 px-4 sm:px-6 py-8 sm:py-10 min-w-0">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
            <Clock className="h-10 w-10 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-bold tracking-wide mb-4">
          Connecting to Game
        </h1>

        {/* Subtext */}
        <p className="text-center text-white/70 text-base mb-8">
          Please wait while we connect you to the battle...
        </p>

        {/* Loading Dot Animation */}
        <div className="flex justify-center gap-2 mb-10">
          <div className="h-3 w-3 rounded-full bg-blue-400 animate-bounce"></div>
          <div className="h-3 w-3 rounded-full bg-blue-500 animate-bounce delay-150"></div>
          <div className="h-3 w-3 rounded-full bg-blue-600 animate-bounce delay-300"></div>
        </div>

        {/* Exit button - more prominent */}
        <div className="flex justify-center">
          <Button
            onClick={() => {
              try {
                closeGameSocket();
              } catch (e) {
                // Silent error handling
              }
              setLocation("/");
            }}
            className="bg-red-600 hover:bg-red-700 text-white px-4 sm:px-6 md:px-8 py-3 text-sm sm:text-base font-semibold border-0 whitespace-nowrap w-full sm:w-auto"
          >
            Exit to Home
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderQuestionPhase = () => {
    // Always show something - if no question, show loading
    if (!gameState.currentQuestion) {
      return (
        <div className="max-w-xl mx-auto p-6">
          <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-3xl shadow-2xl border border-white/10 px-6 py-10">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center shadow-lg animate-pulse">
                <Clock className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-center">Loading Question</h2>
              <p className="text-white/70 text-center text-sm">
                Please wait...
              </p>
            </div>
          </Card>
        </div>
      );
    }
    
    if (!gameState.playerTeam) return null;

    const question = gameState.currentQuestion;
    // Server sends timeLimit in milliseconds, convert to seconds
    const serverTimeLimit = gameState.timeLimit || 15000;
    const timeLimit = Math.floor(serverTimeLimit / 1000); // Convert ms to seconds
    const timeRemaining = Math.min(
      gameState.timeRemaining ?? timeLimit,
      timeLimit
    );
    const isYourTurn = gameState.isYourTurn !== false; // Default to true if not specified

    return (
      <div className="max-w-5xl mx-auto p-3 sm:p-4 md:p-6 relative bg-gradient-to-br from-secondary to-secondary-dark text-white w-full min-w-0 overflow-x-hidden">
        <TeamBattleQuestionBoard
          question={{ id: question.id, text: question.text }}
          answers={question.answers.map((a) => ({ id: a.id, text: a.text }))}
          timeRemaining={timeRemaining}
          timeLimit={timeLimit}
          score={gameState.playerTeam.score}
          totalQuestions={gameState.totalQuestions || 1}
          currentQuestionIndex={(gameState.questionNumber || 1) - 1}
          category={question.category}
          difficultyLabel={question.difficulty}
          isCaptain={isTeamCaptain()}
          isQuestionLocked={Boolean(teamAnswer)}
          suggestions={suggestions}
          onMemberSelect={handleMemberSelect}
          onCaptainSubmit={handleCaptainSubmit}
          isPaused={isPaused}
          isReadOnly={!isYourTurn}
          answeringTeamName={gameState.answeringTeamName}
        />

        {teamAnswer && !isYourTurn && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <Card className="max-w-sm w-full mx-4 bg-gradient-to-br from-secondary to-secondary-dark text-white border border-accent/60 shadow-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-400" />
                  Answer Locked
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/80">
                  Your team's answer has been submitted. Waiting for time to expire...
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const renderResultsPhase = () => {
    // If no question but in results phase, we're transitioning - show loading
    if (!gameState.currentQuestion) {
      return (
        <div className="max-w-xl mx-auto p-6">
          <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-3xl shadow-2xl border border-white/10 px-6 py-10">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center shadow-lg animate-pulse">
                <Clock className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-center">Preparing Next Question</h2>
              <p className="text-white/70 text-center text-sm">
                Please wait...
              </p>
            </div>
          </Card>
        </div>
      );
    }

    const question = gameState.currentQuestion;
    const correctAnswer =
      correctAnswerId && question.answers.find((a) => a.id === correctAnswerId);
    const yourAnswer =
      teamAnswer && question.answers.find((a) => a.id === teamAnswer);
    
    // Determine if it was our turn
    const wasOurTurn = gameState.isYourTurn !== false;
    const resolvedPlayerTeamId =
      gameState.playerTeam?.id ||
      gameState.teams?.find((team) =>
        team.members.some((member) => member.userId === user?.id)
      )?.id;
    const playerTeamResult = gameState.teams?.find(
      (team) => team.id === resolvedPlayerTeamId
    );

    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="bg-gradient-to-br from-secondary to-secondary-dark text-white border border-accent/40 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {wasOurTurn && lastRoundCorrect && <Check className="h-5 w-5 text-green-400" />}
              {wasOurTurn && lastRoundCorrect === false && <X className="h-5 w-5 text-red-400" />}
              <span>Round {gameState.questionNumber || 1} Results</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-semibold mb-1 text-accent-light">Question</p>
              <p className="text-white/90">{question.text}</p>
            </div>

            <div>
              <p className="font-semibold mb-1 text-accent-light">
                Correct Answer
              </p>
              <p className="text-green-300 font-medium">
                {correctAnswer ? correctAnswer.text : "Not available"}
              </p>
            </div>

            {wasOurTurn && (
              <div>
                <p className="font-semibold mb-1 text-accent-light">
                  Your Team's Answer
                </p>
                <p className={`font-medium ${
                  lastRoundCorrect ? "text-green-300" : "text-red-300"
                }`}>
                  {yourAnswer ? yourAnswer.text : "No answer submitted"}
                </p>
                {lastRoundCorrect !== null && (
                  <p className={`text-sm mt-2 ${
                    lastRoundCorrect ? "text-green-400" : "text-red-400"
                  }`}>
                    {lastRoundCorrect ? "✓ Correct! +100 points" : "✗ Incorrect"}
                  </p>
                )}
              </div>
            )}

            {!wasOurTurn && (
              <div>
                <p className="font-semibold mb-1 text-accent-light">
                  {gameState.answeringTeamName || "Opponent Team"} answered this question
                </p>
                <p className="text-white/70 text-sm">
                  You'll answer the next question.
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-white/10">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-white/70">Your Team Score</p>
                  <p className="text-2xl font-bold text-accent">
                    {playerTeamResult?.score || gameState.playerTeam?.score || 0}
                  </p>
                </div>
                {gameState.opposingTeam && (
                  <div className="text-right">
                    <p className="text-sm text-white/70">{gameState.opposingTeam.name} Score</p>
                    <p className="text-2xl font-bold text-secondary">
                      {gameState.opposingTeam.score || 0}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center pt-2">
              <p className="text-sm text-white/60 animate-pulse">
                Next question loading...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderFinishedPhase = () => {
    const teams = gameState.teams || [];

    // Determine your team and the opposing team from the final scores
    const yourTeamFromScores = teams.find(
      (team) => team.id === gameState.playerTeam?.id
    );
    const opponentFromScores = teams.find(
      (team) => team.id !== gameState.playerTeam?.id
    );

    const yourTeam = yourTeamFromScores || gameState.playerTeam || teams[0];
    const opponentTeam =
      opponentFromScores || gameState.opposingTeam || teams[1];

    return (
      <div className="max-w-xl mx-auto p-6">
        <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-3xl shadow-2xl border border-white/10 px-6 py-10">
          {/* Top Score Circle */}
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-full bg-gradient-to-b from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg">
              <span className="text-3xl font-bold">
                {gameState.teams?.[0]?.score ?? 0}
              </span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-center text-4xl font-extrabold tracking-wide mb-8">
            GAME OVER!
          </h1>

          {/* Stats Box - both teams */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10 mb-10">
            {yourTeam && (
              <div className="space-y-4">
                <div className="text-center text-sm font-semibold text-white/80 uppercase tracking-wide">
                  {yourTeam.name || "Your Team"}
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-black/30 rounded-xl py-4 border border-white/10">
                    <div className="text-3xl font-bold text-yellow-400">
                      {yourTeam.score ?? 0}
                    </div>
                    <div className="text-sm text-white/70 mt-1">
                      Final Score
                    </div>
                  </div>

                  <div className="bg-black/30 rounded-xl py-4 border border-white/10">
                    <div className="text-3xl font-bold text-green-400">
                      {yourTeam.correctAnswers ?? 0}
                    </div>
                    <div className="text-sm text-white/70 mt-1">Correct</div>
                  </div>

                  <div className="bg-black/30 rounded-xl py-4 border border-white/10">
                    <div className="text-3xl font-bold text-red-400">
                      {yourTeam.incorrectAnswers ?? 0}
                    </div>
                    <div className="text-sm text-white/70 mt-1">Incorrect</div>
                  </div>
                </div>

                {opponentTeam && (
                  <>
                    <div className="h-px bg-white/10 my-2" />
                    <div className="text-center text-sm font-semibold text-white/80 uppercase tracking-wide">
                      {opponentTeam.name || "Opponent Team"}
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-black/30 rounded-xl py-4 border border-white/10">
                        <div className="text-3xl font-bold text-yellow-400">
                          {opponentTeam.score ?? 0}
                        </div>
                        <div className="text-sm text-white/70 mt-1">
                          Final Score
                        </div>
                      </div>

                      <div className="bg-black/30 rounded-xl py-4 border border-white/10">
                        <div className="text-3xl font-bold text-green-400">
                          {opponentTeam.correctAnswers ?? 0}
                        </div>
                        <div className="text-sm text-white/70 mt-1">
                          Correct
                        </div>
                      </div>

                      <div className="bg-black/30 rounded-xl py-4 border border-white/10">
                        <div className="text-3xl font-bold text-red-400">
                          {opponentTeam.incorrectAnswers ?? 0}
                        </div>
                        <div className="text-sm text-white/70 mt-1">
                          Incorrect
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-center gap-4">
            <Button
              onClick={() => setLocation("/")}
              className="bg-white/10 border border-white/20 text-white px-6 py-3 rounded-xl hover:bg-white/20 shadow-lg"
            >
              Home
            </Button>
          </div>
        </Card>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p>Please log in to access the team battle.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gameSessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p>Invalid game session. Please return to the home page.</p>
            <Button className="mt-4" onClick={() => setLocation("/")}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only show feedback modal if it was our turn to answer
  // lastRoundCorrect is only set if it was our turn, so if it's not null, it was our turn
  const showFeedbackModal =
    showRoundFeedback &&
    gameState.currentQuestion &&
    correctAnswerId !== null &&
    lastRoundCorrect !== null; // If lastRoundCorrect is set, it means it was our turn

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-primary-dark to-black text-white relative">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 pt-4 w-full min-w-0 overflow-x-hidden">
        {/* Team Scores Header - Show during game */}
        {gameState.phase === "question" && gameState.playerTeam && gameState.opposingTeam && (
          <div className="mb-4 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-2xl p-4 border border-white/10">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Your Team */}
              <div className={`flex-1 w-full sm:w-auto p-3 rounded-xl border-2 transition-all ${
                gameState.isYourTurn !== false 
                  ? 'bg-accent/20 border-accent shadow-lg shadow-accent/30' 
                  : 'bg-primary/10 border-primary/30'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Your Team</div>
                    <div className="text-lg sm:text-xl font-bold text-white">{gameState.playerTeam.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Score</div>
                    <div className="text-2xl sm:text-3xl font-bold text-accent">{gameState.playerTeam.score || 0}</div>
                  </div>
                  {gameState.isYourTurn !== false && (
                    <div className="px-3 py-1 bg-accent text-primary rounded-full text-xs font-bold animate-pulse">
                      YOUR TURN
                    </div>
                  )}
                </div>
              </div>

              {/* VS Separator */}
              <div className="text-white/50 font-bold text-xl">VS</div>

              {/* Opposing Team */}
              <div className={`flex-1 w-full sm:w-auto p-3 rounded-xl border-2 transition-all ${
                gameState.isYourTurn === false 
                  ? 'bg-yellow-500/20 border-yellow-500 shadow-lg shadow-yellow-500/30' 
                  : 'bg-secondary/10 border-secondary/30'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Opponent</div>
                    <div className="text-lg sm:text-xl font-bold text-white">{gameState.opposingTeam.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs sm:text-sm text-white/70 mb-1">Score</div>
                    <div className="text-2xl sm:text-3xl font-bold text-secondary">{gameState.opposingTeam.score || 0}</div>
                  </div>
                  {gameState.isYourTurn === false && (
                    <div className="px-3 py-1 bg-yellow-500 text-black rounded-full text-xs font-bold animate-pulse">
                      THEIR TURN
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Question Progress */}
            {gameState.questionNumber && gameState.totalQuestions && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-center gap-2 text-sm text-white/80">
                  <span>Question {gameState.questionNumber} of {gameState.totalQuestions}</span>
                  <span className="text-white/50">•</span>
                  <span>
                    {gameState.isYourTurn !== false 
                      ? `Your team answers this question`
                      : `${gameState.answeringTeamName || 'Opponent'} is answering`
                    }
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Header with logo on left and controls on right */}
        <header className="flex items-center justify-between mb-4 gap-4">
          {/* Logo Section */}
          <div className="flex items-center flex-shrink-0">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-bold text-primary">
              Faith<span className="text-accent">IQ</span>
            </h1>
            <span className="ml-2 bg-accent text-primary px-2 py-1 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap">
              Bible Trivia
            </span>
          </div>

          {/* Controls Section */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Pause/Resume Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={isPaused ? handleResume : handlePause}
              className={`rounded-full transition-all duration-200 flex-shrink-0 ${
                isPaused
                  ? "bg-green-500 text-white hover:bg-green-600 border-green-500"
                  : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
              }`}
              title={isPaused ? "Resume game" : "Pause game"}
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
            </Button>

            {/* Sound Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const newState = !soundEnabled;
                setSoundEnabled(newState);
                toggleSound(newState);
                toast({
                  title: newState ? "Sound Enabled" : "Sound Disabled",
                  description: newState
                    ? "Game sounds are now on"
                    : "Game sounds are now off",
                  duration: 2000,
                });
              }}
              className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300 flex-shrink-0 hidden sm:flex"
              title={soundEnabled ? "Disable sounds" : "Enable sounds"}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </Button>

            {/* Voice Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const newState = !voiceEnabled;
                setVoiceEnabled(newState);
                toggleVoice(newState);
                toast({
                  title: newState
                    ? "Voice Narration Enabled"
                    : "Voice Narration Disabled",
                  description: newState
                    ? "Question narration is now on"
                    : "Question narration is now off",
                  duration: 2000,
                });
              }}
              className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300 flex-shrink-0 hidden sm:flex"
              title={
                voiceEnabled
                  ? "Disable voice narration"
                  : "Enable voice narration"
              }
            >
              {voiceEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </Button>

            {/* Help Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                toast({
                  title: "How to Play",
                  description:
                    "Work with your team to select the correct answer. Captain finalizes the team's choice. Earn points for each correct answer!",
                  duration: 5000,
                });
              }}
              className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300 flex-shrink-0 hidden sm:flex"
              title="How to play"
            >
              <HelpCircle size={18} />
            </Button>

            {/* Leave Game Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                try {
                  sendGameEvent({
                    type: "player_leaving_team_battle",
                    gameSessionId:
                      gameState?.playerTeam?.gameSessionId || gameSessionId,
                    userId: user.id,
                    username: user.username,
                  });
                } catch (e) {}
                try {
                  closeGameSocket();
                } catch (e) {}
                setLocation("/");
              }}
              className="flex-shrink-0 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 hover:border-red-500/50 px-2 py-2 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-200 rounded-lg"
            >
              <X className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Leave Game</span>
            </Button>
          </div>
        </header>
      </div>
      {gameState.phase === "waiting" && renderWaitingPhase()}
      {gameState.phase === "playing" && (
        <div className="max-w-xl mx-auto p-6">
          <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-3xl shadow-2xl border border-white/10 px-6 py-10">
            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="h-20 w-20 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center shadow-lg animate-pulse">
                <Clock className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-center">Preparing Battle</h2>
              <p className="text-white/70 text-center">
                Loading questions and setting up the game...
              </p>
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-400 animate-bounce"></div>
                <div className="h-3 w-3 rounded-full bg-blue-500 animate-bounce delay-150"></div>
                <div className="h-3 w-3 rounded-full bg-blue-600 animate-bounce delay-300"></div>
              </div>
            </div>
          </Card>
        </div>
      )}
      {gameState.phase === "question" && renderQuestionPhase()}
      {/* Results phase removed - goes directly to next question */}
      {gameState.phase === "finished" && renderFinishedPhase()}

      {showFeedbackModal && gameState.currentQuestion && (
        <FeedbackModal
          isCorrect={lastRoundCorrect == true}
          question={gameState.currentQuestion.text}
          correctAnswer={
            gameState.currentQuestion.answers.find(
              (a) => a.id === correctAnswerId
            )?.text || ""
          }
          avatarMessage={
            lastRoundCorrect === true
              ? "Amen! That's correct! Wonderful teamwork."
              : "A brave attempt, but fear not, for wisdom grows with each question."
          }
          onClose={() => {
            setShowRoundFeedback(false);
            setLastRoundCorrect(null);
            setCorrectAnswerId(null);
          }}
          gameMode="team"
        />
      )}

      {/* Pause Overlay */}
      {isPaused && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 max-w-md mx-4 text-center shadow-2xl border border-white/20">
            <div className="mb-8">
              <div className="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Pause size={40} className="text-accent" />
              </div>
              <h2 className="text-4xl font-bold text-white mb-3">
                Game Paused
              </h2>
              <p className="text-white/80 text-lg">
                Take a moment to breathe and prepare for the next question.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleResume}
                className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 sm:py-4 text-base sm:text-lg rounded-xl min-w-0"
              >
                <Play size={20} className="mr-2 sm:mr-3 flex-shrink-0" />
                <span className="whitespace-nowrap">Resume Game</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setIsPaused(false);
                  // Inform server we are leaving, close socket, and navigate home
                  try {
                    sendGameEvent({
                      type: "player_leaving_team_battle",
                      gameSessionId:
                        gameState?.playerTeam?.gameSessionId || gameSessionId,
                      userId: user.id,
                      username: user.username,
                    });
                  } catch (e) {
                    // Silent error handling
                  }
                  try {
                    closeGameSocket();
                  } catch (e) {
                    // Silent error handling
                  }
                  setLocation("/");
                }}
                className="w-full border-red-500/30 bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:border-red-500/50 py-3 sm:py-4 text-base sm:text-lg rounded-xl flex items-center gap-2 justify-center min-w-0"
              >
                <X className="h-5 w-5 flex-shrink-0" />
                <span className="whitespace-nowrap">Leave Game</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
