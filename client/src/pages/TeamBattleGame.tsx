import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock,
  Users,
  Crown,
  Check,
  X,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  HelpCircle,
  LogOut,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { markOpenTeamBattleSetup } from "@/lib/team-battle-navigation";
import { setupGameSocket, sendGameEvent, closeGameSocket } from "@/lib/socket";
import { registerNavigationProtection, unregisterNavigationProtection } from "@/lib/navigationGuard";
import { apiRequest } from "@/lib/queryClient";
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
import { toggleBasicSound, initBasicSounds } from "@/lib/basic-sound";

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
  phase: "waiting" | "ready" | "toss" | "playing" | "question" | "results" | "finished";
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
  // Disconnect winner info (when opponent disconnects, winner is determined by who remained, not score)
  disconnectWinner?: {
    winnerTeamId?: string;
    winnerTeamName?: string;
    isWinner: boolean;
    reason?: string;
  };
  gameType?: "regular" | "rapid_fire";
}

export default function TeamBattleGame() {
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const goToTeamBattleSetup = () => {
    markOpenTeamBattleSetup();
    setLocation("/");
  };

  const [gameState, setGameState] = useState<GameState>({ phase: "waiting" });
  const gameStateRef = useRef<GameState>(gameState);
  const isRapidFireRef = useRef<boolean>(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const isExitingRef = useRef<boolean>(false); // Track if user is explicitly exiting
  const [teamAnswer, setTeamAnswer] = useState<string | null>(null);
  const [memberAnswers, setMemberAnswers] = useState<Record<string, string>>(
    {}
  );
  // Resolver for the global confirm dialog used by the navigation guard
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef<boolean>(false); // Track connection state for beforeunload handler
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
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [showRefreshLoader, setShowRefreshLoader] = useState(false);
  const [currentRapidQuestion, setCurrentRapidQuestion] = useState<Question | null>(null);
  const [showTossInstruction, setShowTossInstruction] = useState(false);
  const [showTossRetryInstruction, setShowTossRetryInstruction] = useState(false);
  const [showTossResult, setShowTossResult] = useState(false);
  const [tossResultData, setTossResultData] = useState<{ isWinner: boolean; teamName?: string } | null>(null);
  const [showRapidRules, setShowRapidRules] = useState(false);
  const [rapidRulesCountdown, setRapidRulesCountdown] = useState(5);
  const hasShownRapidRules = useRef(false);
  const pendingBattleQuestionRef = useRef<any>(null);
  const tossTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tossInstructionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTossResultRef = useRef(false);
  const showTossInstructionRef = useRef(false);
  const showTossRetryInstructionRef = useRef(false);
  const tossTransitionDoneRef = useRef(false);

  useEffect(() => {
    showTossResultRef.current = showTossResult;
  }, [showTossResult]);

  useEffect(() => {
    showTossInstructionRef.current = showTossInstruction;
  }, [showTossInstruction]);

  useEffect(() => {
    showTossRetryInstructionRef.current = showTossRetryInstruction;
  }, [showTossRetryInstruction]);

  const isTossOverlayActive =
    showTossInstruction || showTossRetryInstruction || showTossResult;

  const dismissTossInstruction = () => {
    if (tossInstructionTimerRef.current) {
      clearTimeout(tossInstructionTimerRef.current);
      tossInstructionTimerRef.current = null;
    }
    setShowTossInstruction(false);
    setShowTossRetryInstruction(false);
  };

  const applyBattleQuestionFromEvent = (data: any) => {
    if (!data.question) {
      console.error("Received team_battle_question without question data:", data);
      toast({
        title: "Error",
        description: "Received invalid question data. Please wait...",
        variant: "destructive",
      });
      return;
    }
    if (isRapidFireRef.current) {
      console.warn(
        "[TeamBattleGame] Ignoring team_battle_question because rapid-fire mode is active"
      );
      return;
    }

    setGameState((prev) => ({
      ...prev,
      phase: "question",
      currentQuestion: data.question,
      questionNumber: data.questionNumber,
      totalQuestions: data.totalQuestions,
      timeRemaining: data.timeLimit ? Math.floor(data.timeLimit / 1000) : 15,
      timeLimit: data.timeLimit || 15000,
      isYourTurn: data.isYourTurn !== false,
      answeringTeamName: data.answeringTeamName,
    }));

    setSelectedAnswer(null);
    setHasSubmitted(false);
    setTeamAnswer(null);
    setMemberAnswers({});
    setSuggestions({});
    setWaitingForResults(false);
    setCorrectAnswerId(null);
    setLastRoundCorrect(null);
    setShowRoundFeedback(false);
  };

  const completeTossTransition = () => {
    if (tossTransitionDoneRef.current) return;
    tossTransitionDoneRef.current = true;

    if (tossTransitionTimerRef.current) {
      clearTimeout(tossTransitionTimerRef.current);
      tossTransitionTimerRef.current = null;
    }
    setShowTossResult(false);
    setTossResultData(null);

    const pending = pendingBattleQuestionRef.current;
    if (pending) {
      pendingBattleQuestionRef.current = null;
      applyBattleQuestionFromEvent(pending);
      return;
    }

    setGameState((prev) =>
      prev.phase === "toss"
        ? { ...prev, phase: "playing", currentQuestion: undefined }
        : prev
    );
  };

  const scheduleTossInstructionDismiss = (isRetry: boolean) => {
    dismissTossInstruction();
    if (isRetry) {
      setShowTossRetryInstruction(true);
    } else {
      setShowTossInstruction(true);
    }
    tossInstructionTimerRef.current = setTimeout(() => {
      dismissTossInstruction();
    }, 4000);
  };

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    if (
      lastRoundCorrect !== null &&
      gameStateRef.current.phase !== "toss" &&
      !showTossResultRef.current
    ) {
      setShowRoundFeedback(true);
    }
  }, [lastRoundCorrect]);

  useEffect(() => {
    return () => {
      if (tossTransitionTimerRef.current) clearTimeout(tossTransitionTimerRef.current);
      if (tossInstructionTimerRef.current) clearTimeout(tossInstructionTimerRef.current);
    };
  }, []);

  // Effect to show Rapid Fire rules when game starts
  useEffect(() => {
    if (gameState.phase === "playing" && isRapidFireRef.current && !hasShownRapidRules.current) {
      hasShownRapidRules.current = true;
      setShowRapidRules(true);
      setRapidRulesCountdown(5);
    }
  }, [gameState.phase]);

  // Effect to handle Rapid Fire rules countdown
  useEffect(() => {
    if (showRapidRules && rapidRulesCountdown > 0) {
      const timer = setTimeout(() => {
        setRapidRulesCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (showRapidRules && rapidRulesCountdown === 0) {
      setShowRapidRules(false);
    }
  }, [showRapidRules, rapidRulesCountdown]);

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
    // and show browser confirmation dialog if game is in progress
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Use refs to get the most current state
      const currentGameState = gameStateRef.current;

      // Only show dialog if we have a game session and game is in progress
      const hasGameSession = !!gameSessionId;
      const phase = currentGameState.phase;
      const isFinished = phase === "finished";
      const isWaiting = phase === "waiting";
      const hasGameData = !!(currentGameState.playerTeam || currentGameState.teams?.length);

      // Show dialog if:
      // - We have a game session AND
      // - Game is not finished AND
      // - (Phase is defined and not "waiting", OR we have game data indicating game has started)
      // This ensures we show dialog during: ready, playing, question, results phases
      const shouldShowDialog =
        hasGameSession &&
        !isFinished &&
        ((phase && phase !== "waiting") || hasGameData);

      if (shouldShowDialog) {
        // Try to notify server (non-blocking)
        try {
          sendGameEvent({
            type: "player_leaving_team_battle",
            gameSessionId,
            userId: user.id,
            username: user.username,
          });
        } catch (e) {
          // Silent error handling - page might be closing
        }

        // Show a small loader overlay to indicate we're cleaning up before refresh/navigation
        try {
          setShowRefreshLoader(true);
        } catch (_) {
          // ignore - defensive
        }

        // DO NOT call event.preventDefault() or set returnValue —
        // we intentionally avoid the native browser confirmation dialog here
        // because the app already uses a custom exit dialog. Allow the
        // navigation/refresh to proceed immediately.
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // Register a global navigation protection for this team battle instance.
    const protectionId = `team-battle-${gameSessionId}-${user?.id}`;
    const confirmLeave = () =>
      new Promise<boolean>((resolve) => {
        confirmResolverRef.current = resolve;
        setShowExitConfirmation(true);
      });

    registerNavigationProtection(
      protectionId,
      () => {
        const currentGameState = gameStateRef.current;
        const phase = currentGameState.phase;
        const isFinished = phase === "finished";
        const hasGameData = !!(currentGameState.playerTeam || currentGameState.teams?.length);
        const hasGameSession = !!gameSessionId;

        return (
          hasGameSession &&
          !isFinished &&
          ((phase && phase !== "waiting") || hasGameData)
        );
      },
      confirmLeave
    );

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        // Debug: log incoming messages for game page handlers

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
            // Don't redirect if user is explicitly exiting
            if (isExitingRef.current) {
              break;
            }

            if (data.team) {
              updateTeamsData([data.team]);
              // Check if team is in a finished battle - redirect to setup
              if (data.team.status === "finished") {
                toast({
                  title: "Battle Finished",
                  description: "This battle has already finished. Redirecting to setup.",
                });
                setTimeout(() => {
                  goToTeamBattleSetup();
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
            // Don't redirect if user is explicitly exiting
            if (isExitingRef.current) {
              break;
            }

            toast({
              title: "No Active Battle",
              description: data.message || "No active team battle found. Redirecting to team setup.",
              variant: "destructive",
            });
              setTimeout(() => {
                goToTeamBattleSetup();
              }, 2000);
            break;


          case "team_battle_started":
            // Set rapid fire mode if specified in start event
            // Update teams immediately to ensure header shows correct data during preparation
            const newTeams = data.teams || [];
            const newPlayerTeam = newTeams.find((team: any) =>
              team.members && team.members.some((member: any) => member.userId === user?.id)
            );
            const newOpposingTeam = newTeams.find((team: any) => team.id !== newPlayerTeam?.id);

            // Check for rapid fire mode
            const isRapid = data.gameType === "rapid_fire";

            setGameState((prev) => ({
              ...prev,
              phase: "playing",
              teams: newTeams.length ? newTeams : prev.teams,
              playerTeam: newPlayerTeam || prev.playerTeam,
              opposingTeam: newOpposingTeam || prev.opposingTeam,
              gameType: isRapid ? "rapid_fire" : "regular"
            }));

            // Directly trigger rapid rules if applicable - redundant safety against effect timing
            if (isRapid) {
              setShowRapidRules(true);
              setRapidRulesCountdown(5);
              hasShownRapidRules.current = true;
            }

            toast({
              title: "Battle Started!",
              description:
                "Loading questions... Get ready!",
              duration: 3000,
            });
            // Show loading state while questions are being loaded
            break;

          case "team_battle_toss":
            // Rapid-fire toss question: both teams may answer immediately
            if (!data.question) {
              console.error("Received team_battle_toss without question data:", data);
              break;
            }

            // Check if this is a retry toss (based on message content)
            const isRetry = data.message && data.message.includes("Both teams answered incorrectly");

            scheduleTossInstructionDismiss(isRetry);
            tossTransitionDoneRef.current = false;

            setGameState((prev) => ({
              ...prev,
              phase: "toss",
              currentQuestion: data.question,
              questionNumber: 0,
              totalQuestions: prev.totalQuestions,
              timeRemaining: data.timeLimit ? Math.floor(data.timeLimit / 1000) : 10,
              timeLimit: data.timeLimit || 10000,
              isYourTurn: true, // Both teams can answer
            }));

            // Reset answer state for toss
            setSelectedAnswer(null);
            setHasSubmitted(false);
            setTeamAnswer(null);
            setMemberAnswers({});
            setSuggestions({});
            setWaitingForResults(false);
            setCorrectAnswerId(null);
            setLastRoundCorrect(null);
            setShowRoundFeedback(false);
            break;

          case "team_battle_toss_result": {
            dismissTossInstruction();

            const winnerTeamId = data.winnerTeamId;
            const winnerUserId = data.winnerUserId || data.userId;

            let isYourTeamWinner = false;
            if (winnerTeamId && gameState.teams && gameState.teams.length > 0 && user) {
              const winningTeamInState = gameState.teams.find((t) => t.id === winnerTeamId);
              if (winningTeamInState) {
                isYourTeamWinner = winningTeamInState.members?.some((m: any) => m.userId === user.id) === true;
              } else {
                isYourTeamWinner = winnerUserId === user?.id;
              }
            } else {
              isYourTeamWinner = winnerUserId === user?.id;
            }

            let winnerTeamName = "Opponent";
            if (winnerTeamId && gameState.teams) {
              winnerTeamName = gameState.teams.find((t) => t.id === winnerTeamId)?.name || "Opponent";
            }

            // Clear toss answer feedback — toss result dialog replaces CORRECT modal
            setLastRoundCorrect(null);
            setShowRoundFeedback(false);
            setCorrectAnswerId(null);
            setHasSubmitted(false);

            setTossResultData({
              isWinner: isYourTeamWinner,
              teamName: winnerTeamName,
            });
            setShowTossResult(true);
            tossTransitionDoneRef.current = false;

            if (tossTransitionTimerRef.current) {
              clearTimeout(tossTransitionTimerRef.current);
            }
            tossTransitionTimerRef.current = setTimeout(() => {
              completeTossTransition();
            }, 4000);

            setGameState((prev) => {
              let updatedTeams = prev.teams;
              if (prev.teams && winnerTeamId) {
                updatedTeams = prev.teams.map((t) =>
                  t.id === winnerTeamId ? { ...t, teamSide: "A" } : { ...t, teamSide: "B" }
                );
              }
              const playerTeam = updatedTeams?.find((team) =>
                team.members?.some((m) => m.userId === user?.id)
              );
              const opposingTeam = updatedTeams?.find((team) => team.id !== playerTeam?.id);
              return {
                ...prev,
                phase: "toss",
                currentQuestion: undefined,
                teams: updatedTeams,
                playerTeam: playerTeam || prev.playerTeam,
                opposingTeam: opposingTeam || prev.opposingTeam,
              };
            });
            break;
          }

          case "team_battle_toss_feedback": {
            // Toss uses the winner dialog — do not open the standard CORRECT/INCORRECT modal
            if (typeof data.isCorrect === "boolean") {
              setHasSubmitted(true);
            }
            break;
          }

          case "rapid_fire_feedback": {
            if (typeof data.isCorrect === "boolean") {
              const activeQuestion = currentRapidQuestion || gameState.currentQuestion;
              const correctId = data.correctAnswerId || activeQuestion?.answers.find((a: any) => a.isCorrect)?.id || null;

              setCorrectAnswerId(correctId);
              setLastRoundCorrect(!!data.isCorrect);
              setHasSubmitted(true);
            }
            break;
          }

          case "rapid_fire_no_award": {
            toast({
              title: "Time's up",
              description: "No points awarded. Moving to the next question...",
              duration: 2500,
            });
            break;
          }

          case "rapid_fire_awarded": {
            // Update scores based on server broadcast
            if (data.teams) {
              setGameState((prev) => {
                const updatedTeams = data.teams;
                const newPlayerTeam = updatedTeams.find((t: any) => t.id === prev.playerTeam?.id);
                const newOpposingTeam = updatedTeams.find((t: any) => t.id === prev.opposingTeam?.id);

                return {
                  ...prev,
                  teams: updatedTeams,
                  playerTeam: newPlayerTeam ? { ...prev.playerTeam, ...newPlayerTeam } : prev.playerTeam,
                  opposingTeam: newOpposingTeam ? { ...prev.opposingTeam, ...newOpposingTeam } : prev.opposingTeam,
                };
              });
            }

            // Show toast if someone else won the point (since we didn't get rapid_fire_feedback)
            if (user && data.userId !== user.id) {
              const winnerTeamId = data.teamId;
              const isMyTeam = gameState.playerTeam?.id === winnerTeamId;
              const teamName = isMyTeam ? (gameState.playerTeam?.name || "Your team") : (gameState.opposingTeam?.name || "Opponent");

              toast({
                title: "Rapid Fire Result",
                description: `${teamName} answered correctly! +${data.points} points.`,
                duration: 2000,
                variant: isMyTeam ? "default" : "destructive", // Green for us, Red for them (destructive usually red)
              });
            }
            break;
          }

          case "team_battle_rapid_question":
            // Server streams rapid-fire questions one-by-one via socket
            if (!data.question) {
              console.error("Received team_battle_rapid_question without question data:", data);
              break;
            }

            // Set a dedicated rapid question state (do NOT rely on preloaded questions array)
            setCurrentRapidQuestion(data.question);
            // Mark local flag that we're in rapid-fire pipeline
            isRapidFireRef.current = true;

            // Ensure game phase/state reflects playing rapid-fire
            setGameState((prev) => ({
              ...prev,
              phase: "playing",
              questionNumber: data.questionNumber || prev.questionNumber,
              totalQuestions: data.totalQuestions || prev.totalQuestions,
              timeRemaining: data.timeLimit ? Math.floor(data.timeLimit / 1000) : prev.timeRemaining,
              timeLimit: data.timeLimit || prev.timeLimit,
              isYourTurn: data.isYourTurn !== false,
              answeringTeamName: data.answeringTeamName,
            }));

            // Reset local answer state for new rapid question
            setSelectedAnswer(null);
            setHasSubmitted(false);
            setTeamAnswer(null);
            setMemberAnswers({});
            setSuggestions({});
            setWaitingForResults(false);
            setCorrectAnswerId(null);
            setLastRoundCorrect(null);

            // Reconnect restore: replay persisted suggestions and finalized answer
            if (data.restoredSuggestions?.length) {
              const restored: SuggestionsByAnswerId = {};
              for (const s of data.restoredSuggestions) {
                if (!s?.answerId || s.userId == null) continue;
                const list = restored[s.answerId] || [];
                restored[s.answerId] = [
                  ...list,
                  { userId: s.userId, username: s.username || `Player ${s.userId}` },
                ];
              }
              setSuggestions(restored);
            }
            if (data.restoredFinalAnswer?.answerId) {
              setTeamAnswer(data.restoredFinalAnswer.answerId);
              setSelectedAnswer(data.restoredFinalAnswer.answerId);
              setHasSubmitted(true);
            }
            break;

          case "team_battle_question":
            if (
              showTossResultRef.current ||
              showTossInstructionRef.current ||
              showTossRetryInstructionRef.current ||
              gameStateRef.current.phase === "toss"
            ) {
              pendingBattleQuestionRef.current = data;
              break;
            }
            applyBattleQuestionFromEvent(data);
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
            // Keep selectedAnswer highlighted to show what was finalized
            // It will be cleared when the next question arrives
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

              // If we're in rapid-fire mode, avoid switching to the normal "question"
              // phase to prevent turn/state being overridden by non-rapid logic.
              if (isRapidFireRef.current) {
                return {
                  ...prev,
                  teams: updatedTeams,
                  playerTeam: playerTeam || prev.playerTeam,
                  opposingTeam: opposingTeam || prev.opposingTeam,
                  // Keep playing phase for rapid-fire flow
                  phase: "playing",
                  // Do not set currentQuestion (rapid uses currentRapidQuestion)
                  isYourTurn: data.wasYourTurn !== false,
                };
              }

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

            // Clear any rapid question when results arrive
            setCurrentRapidQuestion(null);

            // Show feedback modal briefly, then next question will come from server
            break;
          }

          case "team_battle_round_complete":
            // Show round results
            toast({
              title: "Round Complete",
              description: `Your team ${data.yourTeamCorrect ? "got it right" : "got it wrong"
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
              // EXCEPTION: Rapid fire mode doesn't rely on 'currentQuestion' state, so check ref
              if (!prev.currentQuestion && prev.phase === "playing" && !isRapidFireRef.current) {
                console.warn("[TeamBattleGame] Received team_battle_ended but no questions were loaded. Staying in playing phase.");
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

          // Handle same-team member disconnect notification
          case "teammate_disconnected":
            toast({
              title: "⚠️ Teammate Disconnected",
              description: `${data.disconnectedPlayerName} from your team has disconnected!`,
              variant: "destructive",
            });
            // Update teams to reflect the disconnected member
            if (data.teamName && gameState.playerTeam?.name === data.teamName) {
              // Refresh team data to show updated member list
              sendGameEvent({
                type: "get_game_state",
                gameSessionId,
                userId: user.id,
              });
            }
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
              // Store disconnect winner info (winner is determined by who remained, not score)
              disconnectWinner: {
                winnerTeamId: data.winnerTeamId,
                winnerTeamName: data.winnerTeamName,
                isWinner: data.isWinner,
                reason: data.reason,
              },
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
      unregisterNavigationProtection(`team-battle-${gameSessionId}-${user?.id}`);
    };
  }, [user, gameSessionId]);

  useEffect(() => {
    initSounds();
    initBasicSounds(); // Initialize basic sound system for timer sounds
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
          goToTeamBattleSetup();
        }, 2000);
      }, 10000); // 10 seconds - reduced for faster feedback

      return () => clearTimeout(timeout);
    }
  }, [gameState.phase, connected, gameSessionId, toast, setLocation]);

  // Game state tracking

  const updateGameState = (data: any) => {
    // If server provides a gameType, keep a local flag to isolate rapid-fire pipelines
    const gameType = data?.gameState?.gameType || (data?.gameState?.mode === "rapid_fire" ? "rapid_fire" : undefined);
    try {
      if (gameType === "rapid_fire") {
        isRapidFireRef.current = true;
      }
    } catch (_) {
      // defensive
    }

    setGameState((prev) => ({
      ...prev,
      ...data.gameState,
      playerTeam: data.playerTeam,
      opposingTeam: data.opposingTeam,
      gameType: gameType === "rapid_fire" ? "rapid_fire" : prev.gameType,
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

  // Defensive guard: if we're in the playing phase but the client doesn't have a
  // playerTeam (can happen if server sends inconsistent teams after a captain
  // leave), request authoritative state from server and show a friendly toast.
  useEffect(() => {
    if (gameState.phase === "playing" && !gameState.playerTeam) {
      toast({
        title: "Refreshing game state",
        description: "Team information missing — retrieving authoritative state...",
        variant: "destructive",
      });

      if (gameSessionId) {
        sendGameEvent({
          type: "get_game_state",
          gameSessionId,
          userId: user?.id,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.phase, gameState.playerTeam, gameSessionId]);

  const isSoloTeam = () => {
    const members = gameState.playerTeam?.members;
    if (!members || !Array.isArray(members)) {
      // During load/reconnect, default to multi-player flow (captain must finalize)
      return false;
    }
    const validCount = members.filter((m) => m?.userId != null).length;
    return validCount <= 1;
  };

  const handleMemberSelect = (answerId: string) => {
    // Rapid Fire multi-player: suggestions only (same as regular team battle)
    if (isRapidFireRef.current && currentRapidQuestion && gameState.playerTeam && user) {
      if (!isSoloTeam()) {
        sendGameEvent({
          type: "team_option_selected",
          teamId: gameState.playerTeam.id,
          questionId: currentRapidQuestion.id,
          answerId,
          userId: user.id,
          username: user.username,
        });
        setSelectedAnswer(answerId);
        return;
      }

      // 1v1: only captain exists — direct submit
      sendGameEvent({
        type: "submit_team_answer",
        teamId: gameState.playerTeam.id,
        questionId: currentRapidQuestion.id,
        answerId,
        gameSessionId: gameSessionId || undefined,
        userId: user.id,
        username: user.username,
        timeSpent: 0,
      });
      setSelectedAnswer(answerId);
      setHasSubmitted(true);
      return;
    }

    if (!gameState.currentQuestion || !gameState.playerTeam || !user) return;

    // If we're in toss phase submit immediately as an individual submission (race)
    if (gameState.phase === "toss") {
      sendGameEvent({
        type: "submit_team_answer",
        teamId: gameState.playerTeam.id,
        questionId: gameState.currentQuestion.id,
        answerId,
        gameSessionId: gameSessionId || undefined,
        userId: user.id,
        username: user.username,
        timeSpent: 0,
      });
      // Show selection locally
      setSelectedAnswer(answerId);
      setHasSubmitted(true);
      return;
    }

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
    // Rapid Fire: 1v1 = immediate submit; multi-player = captain finalizes
    if (isRapidFireRef.current && currentRapidQuestion && gameState.playerTeam && user) {
      setSelectedAnswer(answerId);

      if (isSoloTeam()) {
        sendGameEvent({
          type: "submit_team_answer",
          teamId: gameState.playerTeam.id,
          questionId: currentRapidQuestion.id,
          answerId,
          gameSessionId: gameSessionId || undefined,
          userId: user.id,
          username: user.username,
          timeSpent: 0,
        });
        setHasSubmitted(true);
        return;
      }

      if (!isTeamCaptain()) return;

      sendGameEvent({
        type: "finalize_team_answer",
        teamId: gameState.playerTeam.id,
        finalAnswer: {
          questionId: currentRapidQuestion.id,
          answerId,
        },
      });
      return;
    }

    if (!gameState.currentQuestion || !gameState.playerTeam) return;
    if (!isTeamCaptain()) return;

    // Set selected answer for highlighting
    setSelectedAnswer(answerId);
    // If we're in toss phase, submit as an individual rapid-fire answer instead of finalize
    if (gameState.phase === "toss") {
      if (!user) return;
      sendGameEvent({
        type: "submit_team_answer",
        teamId: gameState.playerTeam.id,
        questionId: gameState.currentQuestion.id,
        answerId,
        gameSessionId: gameSessionId || undefined,
        userId: user.id,
        username: user.username,
        timeSpent: 0,
      });
      setHasSubmitted(true);
      return;
    }

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

  const handleExitGame = async () => {
    // Close the confirmation dialog
    setShowExitConfirmation(false);

    // Mark that user is explicitly exiting - prevent automatic redirects
    isExitingRef.current = true;

    // Show full-screen loader while we perform cleanup and navigation
    setShowRefreshLoader(true);

    // Helper function to add timeout to cleanup request
    const cleanupWithTimeout = async (timeoutMs: number = 8000): Promise<void> => {
      let cleanupSucceeded = false;

      try {
        await Promise.race([
          // Main cleanup request
          apiRequest("POST", "/api/team-battle/cleanup")
            .then(() => {
              cleanupSucceeded = true;
            }),
          // Timeout promise
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Cleanup request timeout'));
            }, timeoutMs);
          })
        ]);
      } catch (err) {
        // Timeout or other error - try fallback

        // Fallback: Use sendBeacon if available (works even during page unload)
        // Note: This is a best-effort fallback, may not work perfectly with JSON parsing
        if (navigator.sendBeacon && !cleanupSucceeded) {
          try {
            // Use FormData as sendBeacon works better with it
            const formData = new FormData();
            formData.append('cleanup', 'true');
            const success = navigator.sendBeacon('/api/team-battle/cleanup', formData);
            if (success) {
            } else {
            }
          } catch (beaconErr) {
          }
        }

        // Don't throw - allow navigation to continue even if cleanup fails
      }
    };

    // Helper function with retry mechanism
    const cleanupWithRetry = async (maxRetries: number = 2): Promise<void> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await cleanupWithTimeout(8000);
          return; // Success, exit retry loop
        } catch (err) {
          if (attempt === maxRetries) {
            // Don't throw - allow navigation to continue
            return;
          }
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    };

    // Inform server we are leaving (via WebSocket - fire and forget)
    try {
      sendGameEvent({
        type: "player_leaving_team_battle",
        gameSessionId:
          gameState?.playerTeam?.gameSessionId || gameSessionId || undefined,
        userId: user?.id,
        username: user?.username,
      });
    } catch (e) {
      // Silent error handling
    }

    // CRITICAL: Clean up server-side team battle data with timeout and retry
    // Wait for cleanup to complete (with timeout) before closing socket
    try {
      await cleanupWithRetry(2); // 2 retries = 3 total attempts
    } catch (err) {
      // Already handled in cleanupWithRetry
    }

    // Small delay to ensure server processes the cleanup
    // This helps in production where network latency is higher
    await new Promise(resolve => setTimeout(resolve, 300));

    // Now close WebSocket after cleanup completes
    try {
      closeGameSocket();
    } catch (e) {
      // Silent error handling
    }

    // Perform a full page reload to ensure all in-memory SPA state and caches are cleared
    // Use a timestamp query param to bypass any caches and force a fresh load
    try {
      window.location.replace(`${window.location.origin}/?r=${Date.now()}`);
    } catch (e) {
      // Fallback to SPA navigation if full reload fails
      setLocation("/");
    }
  };

  const renderWaitingPhase = () => (
    <div className="max-w-xl mx-auto p-3 sm:p-4 md:p-6 w-full min-w-0 overflow-x-hidden">
      <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-2xl sm:rounded-3xl shadow-2xl border border-white/10 px-4 sm:px-6 py-6 sm:py-8 md:py-10 min-w-0">
        {/* Icon */}
        <div className="flex justify-center mb-4 sm:mb-6">
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
            <Clock className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-center text-2xl sm:text-3xl font-bold tracking-wide mb-3 sm:mb-4">
          Connecting to Game
        </h1>

        {/* Subtext */}
        <p className="text-center text-white/70 text-sm sm:text-base mb-6 sm:mb-8 px-2">
          Please wait while we connect you to the battle...
        </p>

        {/* Loading Dot Animation */}
        <div className="flex justify-center gap-2 mb-8 sm:mb-10">
          <div className="h-3 w-3 rounded-full bg-blue-400 animate-bounce"></div>
          <div className="h-3 w-3 rounded-full bg-blue-500 animate-bounce delay-150"></div>
          <div className="h-3 w-3 rounded-full bg-blue-600 animate-bounce delay-300"></div>
        </div>

        {/* Exit button - more prominent */}
        <div className="flex justify-center">
          <Button
            onClick={() => {
              // If the battle has finished, perform the exit/cleanup immediately.
              // Otherwise, show the confirmation dialog to avoid accidental mid-game leaves.
              if (gameState.phase === "finished") {
                handleExitGame();
              } else {
                setShowExitConfirmation(true);
              }
            }}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 text-sm sm:text-base font-semibold border-0 whitespace-nowrap w-full sm:w-auto shadow-lg hover:shadow-red-500/20 transition-all duration-200"
          >
            <LogOut className="h-4 w-4 mr-2" />
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
    // Use timeRemaining from state if available, otherwise use timeLimit
    // This ensures we always pass a valid initial time to the child component
    const timeRemaining = gameState.timeRemaining !== undefined
      ? Math.min(gameState.timeRemaining, timeLimit)
      : timeLimit;
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
          isPaused={false}
          isReadOnly={!isYourTurn}
          isToss={gameState.phase === "toss"}
          answeringTeamName={gameState.answeringTeamName}
          selectedAnswerId={selectedAnswer}
        />

        {teamAnswer && !isYourTurn && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 p-3 sm:p-4">
            <Card className="max-w-sm w-full mx-auto bg-gradient-to-br from-secondary to-secondary-dark text-white border border-accent/60 shadow-2xl rounded-lg sm:rounded-xl">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 flex-shrink-0" />
                  <span>Answer Locked</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <p className="text-xs sm:text-sm text-white/80">
                  Your team's answer has been submitted. Waiting for time to expire...
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const renderRapidQuestionPhase = () => {
    // Rapid-fire questions come one-by-one via socket and are stored in currentRapidQuestion
    if (!currentRapidQuestion) {
      return (
        <div className="max-w-xl mx-auto p-6">
          <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-3xl shadow-2xl border border-white/10 px-6 py-10">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center shadow-lg animate-pulse">
                <Clock className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-center">Preparing Battle</h2>
              <p className="text-white/70 text-center text-sm">
                Waiting for the next rapid-fire question...
              </p>
            </div>
          </Card>
        </div>
      );
    }

    if (!gameState.playerTeam) return null;

    const question = currentRapidQuestion;
    const serverTimeLimit = gameState.timeLimit || question.timeLimit || 10000;
    const timeLimit = Math.floor(serverTimeLimit / 1000);
    const timeRemaining = gameState.timeRemaining !== undefined
      ? Math.min(gameState.timeRemaining, timeLimit)
      : timeLimit;
    const isYourTurn = gameState.isYourTurn !== false;

    return (
      <div className="max-w-5xl mx-auto p-3 sm:p-4 md:p-6 relative bg-gradient-to-br from-secondary to-secondary-dark text-white w-full min-w-0 overflow-x-hidden">
        <div className="mb-3 text-center">
          <Badge className="bg-yellow-500 text-black font-bold px-3 py-1">RAPID FIRE</Badge>
        </div>
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
          isQuestionLocked={Boolean(teamAnswer) || (hasSubmitted && isSoloTeam())}
          suggestions={suggestions}
          onMemberSelect={handleMemberSelect}
          onCaptainSubmit={handleCaptainSubmit}
          isPaused={false}

          isReadOnly={false} // Rapid fire allows race condition (both teams answer)
          isToss={false} // Rapid fire is not a toss question

          answeringTeamName={gameState.answeringTeamName}
          selectedAnswerId={selectedAnswer}
        />

        {teamAnswer && !isSoloTeam() && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 p-3 sm:p-4">
            <Card className="max-w-sm w-full mx-auto bg-gradient-to-br from-secondary to-secondary-dark text-white border border-accent/60 shadow-2xl rounded-lg sm:rounded-xl">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 flex-shrink-0" />
                  <span>Answer Locked</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-0">
                <p className="text-xs sm:text-sm text-white/80">
                  Your captain has finalized the team answer. Waiting for results...
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const renderTossPhase = () => {
    // Reuse question board UI but indicate it's a toss/race
    if (!gameState.currentQuestion) {
      return (
        <div className="max-w-xl mx-auto p-6">
          <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-3xl shadow-2xl border border-white/10 px-6 py-10">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-b from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg animate-pulse">
                <Clock className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-center">Toss Question</h2>
              <p className="text-white/70 text-center text-sm">
                Rapid-fire: first correct answer wins the toss.
              </p>
            </div>
          </Card>
        </div>
      );
    }

    if (!gameState.playerTeam) return null;

    const question = gameState.currentQuestion;
    const serverTimeLimit = gameState.timeLimit || 10000;
    const timeLimit = Math.floor(serverTimeLimit / 1000);
    const timeRemaining = gameState.timeRemaining !== undefined
      ? Math.min(gameState.timeRemaining, timeLimit)
      : timeLimit;

    return (
      <div className="max-w-5xl mx-auto p-3 sm:p-4 md:p-6 relative bg-gradient-to-br from-secondary to-secondary-dark text-white w-full min-w-0 overflow-x-hidden">
        <div className="mb-3 text-center">
          <Badge className="bg-yellow-500 text-black font-bold px-3 py-1">TOSS RACE</Badge>
        </div>
        <TeamBattleQuestionBoard
          question={{ id: question.id, text: question.text }}
          answers={question.answers.map((a) => ({ id: a.id, text: a.text }))}
          timeRemaining={timeRemaining}
          timeLimit={timeLimit}
          score={gameState.playerTeam.score}
          totalQuestions={gameState.totalQuestions || 1}
          currentQuestionIndex={0}
          category={question.category}
          difficultyLabel={question.difficulty}
          isCaptain={isTeamCaptain()}
          isQuestionLocked={Boolean(teamAnswer)}
          suggestions={suggestions}
          onMemberSelect={handleMemberSelect}
          onCaptainSubmit={handleCaptainSubmit}
          isPaused={false}
          isReadOnly={false} // both teams can answer
          isToss={true}
          answeringTeamName={gameState.answeringTeamName}
          selectedAnswerId={selectedAnswer}
        />
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
                <p className={`font-medium ${lastRoundCorrect ? "text-green-300" : "text-red-300"
                  }`}>
                  {yourAnswer ? yourAnswer.text : "No answer submitted"}
                </p>
                {lastRoundCorrect !== null && (
                  <p className={`text-sm mt-2 ${lastRoundCorrect ? "text-green-400" : "text-red-400"
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

    // Get scores for display (always available)
    const yourScore = yourTeam?.score ?? 0;
    const opponentScore = opponentTeam?.score ?? 0;

    // Determine winner
    // If disconnect occurred, winner is determined by who remained (not by score)
    // Otherwise, winner is determined by score
    let isYourTeamWinner: boolean;
    let winnerTeam: Team | null;
    let isDraw: boolean;

    if (gameState.disconnectWinner) {
      // Disconnect scenario: winner is determined by who remained, not score
      isYourTeamWinner = gameState.disconnectWinner.isWinner;
      winnerTeam = teams.find(
        (team) => team.id === gameState.disconnectWinner?.winnerTeamId
      ) || (isYourTeamWinner ? yourTeam : opponentTeam);
      isDraw = false; // No draws in disconnect scenarios
    } else {
      // Normal completion: winner determined by score
      isDraw = yourScore === opponentScore;
      const isWinner = yourScore > opponentScore;
      winnerTeam = isDraw ? null : (isWinner ? yourTeam : opponentTeam);
      isYourTeamWinner = isWinner && !isDraw;
    }

    const yourTeamLabel = yourTeam?.name || "Your Team";
    const opponentLabel = opponentTeam?.name || "Opponent Team";

    const outcomeHeadline = isDraw
      ? "IT'S A DRAW!"
      : isYourTeamWinner
        ? "VICTORY!"
        : "DEFEAT!";

    const outcomeSubtitle = isDraw
      ? "Both teams performed equally well!"
      : isYourTeamWinner
        ? "Your team wins!"
        : `${opponentLabel} wins!`;

    const outcomeDetail = isDraw
      ? "Great battle — every point counted."
      : gameState.disconnectWinner
        ? isYourTeamWinner
          ? gameState.disconnectWinner.reason ||
            "The opponent team disconnected. You win by default."
          : gameState.disconnectWinner.reason ||
            "Your team was eliminated. Better luck next time!"
        : isYourTeamWinner
          ? yourScore > opponentScore
            ? `You outscored ${opponentLabel} ${yourScore}–${opponentScore}.`
            : "Your team claimed victory!"
          : `${opponentLabel} outscored you ${opponentScore}–${yourScore}. Great effort — try again!`;

    return (
      <div className="max-w-2xl mx-auto p-3 sm:p-4 md:p-6">
        <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-2xl sm:rounded-3xl shadow-2xl border border-white/10 px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10">
          {/* Winner Announcement Section */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="flex justify-center mb-3 sm:mb-4">
              <div
                className={`h-20 w-20 sm:h-24 sm:w-24 rounded-full flex items-center justify-center shadow-2xl animate-pulse-slow border-4 ${
                  isDraw
                    ? "bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 border-yellow-300"
                    : isYourTeamWinner
                      ? "bg-gradient-to-br from-accent via-accent-dark to-accent-light border-accent-light"
                      : "bg-gradient-to-br from-red-600 via-red-700 to-red-900 border-red-400/60"
                }`}
              >
                <Crown
                  className={`h-10 w-10 sm:h-12 sm:w-12 ${
                    isDraw || !isYourTeamWinner ? "text-white" : "text-primary"
                  }`}
                />
              </div>
            </div>
            <h1
              className={`text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-wide mb-2 bg-clip-text text-transparent ${
                isDraw
                  ? "bg-gradient-to-r from-yellow-400 to-yellow-600"
                  : isYourTeamWinner
                    ? "bg-gradient-to-r from-accent to-accent-light"
                    : "bg-gradient-to-r from-red-400 to-red-600"
              }`}
            >
              {outcomeHeadline}
            </h1>
            <p className="text-white/90 text-base sm:text-lg md:text-xl font-bold mb-2 px-2">
              {outcomeSubtitle}
            </p>
            <p className="text-white/65 text-xs sm:text-sm md:text-base mb-3 px-2 max-w-md mx-auto leading-relaxed">
              {outcomeDetail}
            </p>
            {!isDraw && (
              <p className="text-white/55 text-xs sm:text-sm px-2">
                Final score —{" "}
                <span className="font-semibold text-accent">You {yourScore}</span>
                {" · "}
                <span className="font-semibold text-white/80">
                  {opponentLabel} {opponentScore}
                </span>
              </p>
            )}
          </div>

          {/* Stats Box - both teams */}
          <div className="bg-white/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 border border-white/10 mb-6 sm:mb-8">
            {yourTeam && (
              <div className="space-y-4">
                {/* Your Team */}
                <div className={`rounded-xl p-4 ${isYourTeamWinner && !isDraw
                  ? 'bg-gradient-to-r from-accent/20 to-accent-dark/20 border-2 border-accent/50'
                  : 'bg-black/20 border border-white/10'
                  }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      {isYourTeamWinner && !isDraw && (
                        <Crown className="h-5 w-5 text-accent" />
                      )}
                      <span>
                        Your Team
                        {yourTeamLabel !== "Your Team" && (
                          <span className="block text-xs sm:text-sm font-normal text-white/55 mt-0.5">
                            {yourTeamLabel}
                          </span>
                        )}
                      </span>
                    </div>
                    {isYourTeamWinner && !isDraw && (
                      <span className="text-xs sm:text-sm bg-accent text-primary px-2 py-1 rounded-full font-semibold">
                        WINNER
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 text-center">
                    <div className="bg-black/40 rounded-lg sm:rounded-xl py-2 sm:py-3 md:py-4 border border-white/10">
                      <div className="text-xl sm:text-2xl md:text-3xl font-bold text-yellow-400">
                        {yourTeam.score ?? 0}
                      </div>
                      <div className="text-xs sm:text-sm text-white/70 mt-1">
                        Score
                      </div>
                    </div>

                    <div className="bg-black/40 rounded-lg sm:rounded-xl py-2 sm:py-3 md:py-4 border border-white/10">
                      <div className="text-xl sm:text-2xl md:text-3xl font-bold text-green-400">
                        {yourTeam.correctAnswers ?? 0}
                      </div>
                      <div className="text-xs sm:text-sm text-white/70 mt-1">Correct</div>
                    </div>

                    <div className="bg-black/40 rounded-lg sm:rounded-xl py-2 sm:py-3 md:py-4 border border-white/10">
                      <div className="text-xl sm:text-2xl md:text-3xl font-bold text-red-400">
                        {yourTeam.incorrectAnswers ?? 0}
                      </div>
                      <div className="text-xs sm:text-sm text-white/70 mt-1">Wrong</div>
                    </div>
                  </div>
                </div>

                {/* Opponent Team */}
                {opponentTeam && (
                  <>
                    <div className="h-px bg-white/10" />
                    <div className={`rounded-lg sm:rounded-xl p-3 sm:p-4 ${!isYourTeamWinner && !isDraw
                      ? 'bg-gradient-to-r from-red-500/15 to-red-700/15 border-2 border-red-400/40'
                      : 'bg-black/20 border border-white/10'
                      }`}>
                      <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
                        <div className="text-sm sm:text-base md:text-lg font-bold text-white flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                          {!isYourTeamWinner && !isDraw && (
                            <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-red-400 flex-shrink-0" />
                          )}
                          <span className="truncate">Opponent · {opponentLabel}</span>
                        </div>
                        {!isYourTeamWinner && !isDraw && (
                          <span className="text-xs sm:text-sm bg-red-500 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-semibold flex-shrink-0 whitespace-nowrap">
                            WINNER
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 text-center">
                        <div className="bg-black/40 rounded-lg sm:rounded-xl py-2 sm:py-3 md:py-4 border border-white/10">
                          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-yellow-400">
                            {opponentTeam.score ?? 0}
                          </div>
                          <div className="text-xs sm:text-sm text-white/70 mt-1">
                            Score
                          </div>
                        </div>

                        <div className="bg-black/40 rounded-lg sm:rounded-xl py-2 sm:py-3 md:py-4 border border-white/10">
                          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-green-400">
                            {opponentTeam.correctAnswers ?? 0}
                          </div>
                          <div className="text-xs sm:text-sm text-white/70 mt-1">
                            Correct
                          </div>
                        </div>

                        <div className="bg-black/40 rounded-lg sm:rounded-xl py-2 sm:py-3 md:py-4 border border-white/10">
                          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-red-400">
                            {opponentTeam.incorrectAnswers ?? 0}
                          </div>
                          <div className="text-xs sm:text-sm text-white/70 mt-1">
                            Wrong
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <Button
              onClick={async () => {
                // ✅ Reset Team Battle status when returning home
                try {
                  await apiRequest("PATCH", `/api/users/${user?.id}/team-battle-status`, {
                    isInTeamBattle: false,
                    gameType: null,
                  });
                } catch (err) {
                  console.error("[TeamBattleGame] Failed to reset Team Battle status:", err);
                  // Continue to home anyway
                }
                setLocation("/");
              }}
              className="bg-gradient-to-r from-accent to-accent-dark text-primary px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 rounded-lg sm:rounded-xl hover:from-accent-light hover:to-accent font-bold text-sm sm:text-base md:text-lg shadow-lg hover:shadow-xl transition-all duration-200 w-full sm:w-auto"
            >
              Return Home
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
  const activeQuestionForFeedback = currentRapidQuestion || gameState.currentQuestion;
  const showFeedbackModal =
    showRoundFeedback &&
    activeQuestionForFeedback &&
    correctAnswerId !== null &&
    lastRoundCorrect !== null &&
    gameState.phase !== "toss" &&
    !isTossOverlayActive;



  useEffect(() => {
    // Check if we are in playing phase and it is a rapid fire game
    // Triggers either from gameState update or isRapidFireRef being set
    const isRapid = gameState.gameType === "rapid_fire" || isRapidFireRef.current;

    if (gameState.phase === "playing" && isRapid && !hasShownRapidRules.current) {
      setShowRapidRules(true);
      setRapidRulesCountdown(5); // Reset countdown
      hasShownRapidRules.current = true; // Mark as shown
    }
  }, [gameState.phase, gameState.gameType, isRapidFireRef]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-primary-dark to-black text-white relative">
      {/* Rapid Fire Rules Dialog */}
      {/* Rapid Fire Rules Dialog - Removed to use inline rendering for robustness */}


      {/* Navigation Protection Dialog */}
      {showRefreshLoader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-semibold">Please wait…</p>
            <p className="text-white/70 text-sm">Cleaning up and refreshing...</p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 pt-4 w-full min-w-0 overflow-x-hidden">
        {/* Team Scores Header - Show during game (normal or rapid fire) - even during preparing/loading phase */}
        {((gameState.phase === "question") || (gameState.phase === "playing")) && !isTossOverlayActive && gameState.playerTeam && gameState.opposingTeam && (
          <div className="mb-3 sm:mb-4 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
              {/* Your Team */}
              <div className={`flex-1 w-full sm:w-auto p-2.5 sm:p-3 rounded-lg sm:rounded-xl border-2 transition-all ${gameState.isYourTurn !== false
                ? 'bg-accent/20 border-accent shadow-lg shadow-accent/30'
                : 'bg-primary/10 border-primary/30'
                }`}>
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/70 mb-0.5 sm:mb-1">Your Team</div>
                    <div className="text-base sm:text-lg md:text-xl font-bold text-white truncate">{gameState.playerTeam.name}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-white/70 mb-0.5 sm:mb-1">Score</div>
                    <div className="text-xl sm:text-2xl md:text-3xl font-bold text-accent">{gameState.playerTeam.score || 0}</div>
                  </div>
                  {gameState.isYourTurn !== false && (
                    <div className="px-2 sm:px-3 py-0.5 sm:py-1 bg-accent text-primary rounded-full text-xs font-bold animate-pulse flex-shrink-0 whitespace-nowrap">
                      YOUR TURN
                    </div>
                  )}
                </div>
              </div>

              {/* VS Separator */}
              <div className="text-white/50 font-bold text-lg sm:text-xl text-center flex-shrink-0">VS</div>

              {/* Opposing Team */}
              <div className={`flex-1 w-full sm:w-auto p-2.5 sm:p-3 rounded-lg sm:rounded-xl border-2 transition-all ${gameState.isYourTurn === false
                ? 'bg-yellow-500/20 border-yellow-500 shadow-lg shadow-yellow-500/30'
                : 'bg-secondary/10 border-secondary/30'
                }`}>
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/70 mb-0.5 sm:mb-1">Opponent</div>
                    <div className="text-base sm:text-lg md:text-xl font-bold text-white truncate">{gameState.opposingTeam.name}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-white/70 mb-0.5 sm:mb-1">Score</div>
                    <div className="text-xl sm:text-2xl md:text-3xl font-bold text-secondary">{gameState.opposingTeam.score || 0}</div>
                  </div>
                  {gameState.isYourTurn === false && (
                    <div className="px-2 sm:px-3 py-0.5 sm:py-1 bg-yellow-500 text-black rounded-full text-xs font-bold animate-pulse flex-shrink-0 whitespace-nowrap">
                      THEIR TURN
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Question Progress */}
            {gameState.questionNumber && gameState.totalQuestions && (
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm text-white/80 text-center">
                  <span>Question {gameState.questionNumber} of {gameState.totalQuestions}</span>
                  <span className="hidden sm:inline text-white/50">•</span>
                  <span className="text-white/70">
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
        <header className="mb-3 sm:mb-4">
          {/* First Row: Logo and Exit Game Button */}
          <div className="flex items-center justify-between gap-2 sm:gap-4 mb-2 sm:mb-0">
            {/* Logo Section */}
            <div className="flex items-center flex-shrink-0 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-heading font-bold text-primary truncate">
                Faith<span className="text-accent">IQ</span>
              </h1>
              <span className="ml-1 sm:ml-2 bg-accent text-primary px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap flex-shrink-0">
                Bible Trivia
              </span>
            </div>

            {/* Exit Game Button - Always visible */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                // If game finished, skip confirmation and exit immediately.
                if (gameState.phase === "finished") {
                  handleExitGame();
                } else {
                  setShowExitConfirmation(true);
                }
              }}
              className="rounded-full transition-all duration-200 flex-shrink-0 h-9 w-9 sm:h-11 sm:w-11 bg-gradient-to-br from-red-500/20 to-red-600/20 text-red-400 border-2 border-red-500/40 hover:from-red-500/30 hover:to-red-600/30 hover:border-red-500/60 shadow-lg hover:shadow-red-500/20 hover:scale-105 active:scale-95"
              title="Exit game"
            >
              <LogOut size={18} className="sm:w-5 sm:h-5" />
            </Button>
          </div>

          {/* Second Row: All Other Controls - Wraps on mobile */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Sound Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const newState = !soundEnabled;
                setSoundEnabled(newState);
                toggleSound(newState);
                toggleBasicSound(newState);
                toast({
                  title: newState ? "Sound Enabled" : "Sound Disabled",
                  description: newState
                    ? "Game sounds are now on"
                    : "Game sounds are now off",
                  duration: 2000,
                });
              }}
              className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300 flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
              title={soundEnabled ? "Disable sounds" : "Enable sounds"}
            >
              {soundEnabled ? <Volume2 size={16} className="sm:w-[18px] sm:h-[18px]" /> : <VolumeX size={16} className="sm:w-[18px] sm:h-[18px]" />}
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
              className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300 flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
              title={
                voiceEnabled
                  ? "Disable voice narration"
                  : "Enable voice narration"
              }
            >
              {voiceEnabled ? <Mic size={16} className="sm:w-[18px] sm:h-[18px]" /> : <MicOff size={16} className="sm:w-[18px] sm:h-[18px]" />}
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
              className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300 flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
              title="How to play"
            >
              <HelpCircle size={16} className="sm:w-[18px] sm:h-[18px]" />
            </Button>
          </div>
        </header>
      </div>
      {gameState.phase === "waiting" && renderWaitingPhase()}
      {gameState.phase === "playing" && !currentRapidQuestion && !gameState.currentQuestion && (
        <div className="max-w-xl mx-auto p-3 sm:p-4 md:p-6">
          {showRapidRules ? (
            <Card className="bg-gradient-to-br from-[#0F1624] to-[#0A0F1A] border border-[#DEB126]/50 text-white p-0 overflow-hidden shadow-2xl">
              <div className="h-2 bg-gray-800 w-full">
                <div
                  className="h-full bg-[#DEB126] transition-all duration-1000 ease-linear"
                  style={{ width: `${(rapidRulesCountdown / 5) * 100}%` }}
                />
              </div>
              <div className="p-6 flex flex-col items-center text-center space-y-6">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#DEB126] to-[#C59D1F] flex items-center justify-center shadow-[0_0_15px_rgba(222,177,38,0.5)] animate-pulse">
                  <Zap className="h-10 w-10 text-white fill-white" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-[#DEB126] via-[#F7D45E] to-[#DEB126] bg-clip-text text-transparent uppercase tracking-wider">
                    Rapid Fire Round
                  </h2>
                  <p className="text-gray-400 text-sm font-medium">
                    Starting in {rapidRulesCountdown} seconds...
                  </p>
                </div>

                <div className="w-full bg-white/5 rounded-xl p-4 border border-white/10 text-left space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-[#DEB126]/20 text-[#DEB126] flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">1</div>
                    <p className="text-sm text-gray-300"><span className="text-[#DEB126] font-semibold">Speed is key!</span> Questions appear one after another instantly.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-[#DEB126]/20 text-[#DEB126] flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">2</div>
                    <p className="text-sm text-gray-300">Both teams race to answer. <span className="text-[#DEB126] font-semibold">First captain-finalized correct answer wins.</span></p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-[#DEB126]/20 text-[#DEB126] flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">3</div>
                    <p className="text-sm text-gray-300">Teammates suggest answers; the <span className="text-[#DEB126] font-semibold">Captain finalizes</span> the team choice.</p>
                  </div>
                </div>

                <div className="w-full h-12 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[#DEB126] animate-bounce"></div>
                    <div className="h-2 w-2 rounded-full bg-[#DEB126] animate-bounce delay-150"></div>
                    <div className="h-2 w-2 rounded-full bg-[#DEB126] animate-bounce delay-300"></div>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white rounded-2xl sm:rounded-3xl shadow-2xl border border-white/10 px-4 sm:px-6 py-6 sm:py-8 md:py-10">
              <div className="flex flex-col items-center justify-center space-y-4 sm:space-y-6">
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center shadow-lg animate-pulse">
                  <Clock className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-center px-2">Preparing Battle</h2>
                <p className="text-white/70 text-center text-sm sm:text-base px-2">
                  Loading questions and setting up the game...
                </p>
                <div className="flex gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-400 animate-bounce"></div>
                  <div className="h-3 w-3 rounded-full bg-blue-500 animate-bounce delay-150"></div>
                  <div className="h-3 w-3 rounded-full bg-blue-600 animate-bounce delay-300"></div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
      {gameState.phase === "playing" && currentRapidQuestion && !isTossOverlayActive && renderRapidQuestionPhase()}
      {gameState.phase === "question" && !isTossOverlayActive && renderQuestionPhase()}
      {gameState.phase === "toss" && !showTossInstruction && !showTossRetryInstruction && !showTossResult && renderTossPhase()}
      {/* Results phase removed - goes directly to next question */}
      {gameState.phase === "finished" && renderFinishedPhase()}

      {showFeedbackModal && activeQuestionForFeedback && (
        <FeedbackModal
          isCorrect={lastRoundCorrect == true}
          question={activeQuestionForFeedback.text}
          correctAnswer={
            activeQuestionForFeedback.answers.find(
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

      {/* Toss Instruction Dialog */}
      {/* Toss Instruction Dialog */}
      <Dialog open={showTossInstruction} onOpenChange={() => { }}>
        <DialogContent className="sm:max-w-md bg-gradient-to-b from-indigo-900 to-slate-900 text-white border-2 border-yellow-500/50 shadow-[0_0_50px_rgba(234,179,8,0.3)] [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center text-yellow-400 flex flex-col items-center gap-2">
              <span className="text-4xl">🔔</span>
              TOSS ROUND
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <div className="bg-white/10 p-4 rounded-xl border border-white/20">
              <p className="text-lg font-medium text-white mb-2">
                Be quick. Be correct.
              </p>
              <p className="text-white/80">
                The <span className="text-yellow-400 font-bold">first correct answer</span> decides who plays first!
              </p>
            </div>
            <Button
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold"
              onClick={dismissTossInstruction}
            >
              Got it — Start Toss
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toss Retry Dialog */}
      <Dialog open={showTossRetryInstruction} onOpenChange={() => { }}>
        <DialogContent className="sm:max-w-md bg-gradient-to-b from-red-900 to-slate-900 text-white border-2 border-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.3)] [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center text-red-400 flex flex-col items-center gap-2">
              <span className="text-4xl">❌</span>
              BOTH TEAMS MISSED!
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <div className="bg-white/10 p-4 rounded-xl border border-white/20">
              <p className="text-lg font-medium text-white mb-2">
                One More Chance!
              </p>
              <p className="text-white/80">
                Both teams answered incorrectly. A new toss question is coming up.
              </p>
            </div>
            <p className="text-sm text-white/60 italic">
              Be fast, but be accurate this time!
            </p>
            <Button
              className="bg-red-500 hover:bg-red-400 text-white font-bold"
              onClick={dismissTossInstruction}
            >
              Ready for Retry
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toss Result Dialog */}
      <Dialog open={showTossResult} onOpenChange={() => { }}>
        <DialogContent className={`sm:max-w-md bg-gradient-to-b ${tossResultData?.isWinner ? 'from-green-900 to-slate-900 border-green-500/50 shadow-[0_0_50px_rgba(34,197,94,0.3)]' : 'from-orange-900 to-slate-900 border-orange-500/50 shadow-[0_0_50px_rgba(249,115,22,0.3)]'} text-white border-2 [&>button]:hidden`}>
          <DialogHeader>
            <DialogTitle className={`text-2xl font-bold text-center ${tossResultData?.isWinner ? 'text-green-400' : 'text-orange-400'} flex flex-col items-center gap-2`}>
              <span className="text-4xl">{tossResultData?.isWinner ? '🏆' : '⚠️'}</span>
              {tossResultData?.isWinner ? 'YOU WON THE TOSS!' : 'OPPONENT WON THE TOSS'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <div className="bg-white/10 p-4 rounded-xl border border-white/20">
              <p className="text-lg font-medium text-white mb-2">
                {tossResultData?.isWinner ? 'Your team takes the first turn.' : `${tossResultData?.teamName || "Opponent"} takes the first turn.`}
              </p>
            </div>
            <p className="text-white/60 text-sm">
              {tossResultData?.isWinner
                ? "Get ready to answer the first battle question."
                : "Prepare to defend! Your opponent gets the first question."}
            </p>
            <Button
              className={`font-bold ${tossResultData?.isWinner ? "bg-green-500 hover:bg-green-400 text-white" : "bg-orange-500 hover:bg-orange-400 text-white"}`}
              onClick={completeTossTransition}
            >
              Continue to Battle
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <DialogContent className="sm:max-w-md bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white border border-white/20">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center flex items-center justify-center gap-2">
              <LogOut className="h-5 w-5 text-red-400" />
              Exit Team Battle?
            </DialogTitle>
            <DialogDescription className="text-white/80 text-center pt-2">
              Are you sure you want to leave the team battle? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold text-red-400">What happens when you leave:</p>
              <ul className="text-xs sm:text-sm text-white/70 space-y-1 list-disc list-inside">
                <li>You will be removed from your team</li>
                <li>Your team will continue without you</li>
                <li>Your progress will be lost</li>
                {gameState.phase === "question" && (
                  <li className="text-red-400 font-semibold">The battle is currently in progress</li>
                )}
              </ul>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowExitConfirmation(false);
                if (confirmResolverRef.current) {
                  try {
                    confirmResolverRef.current(false);
                  } finally {
                    confirmResolverRef.current = null;
                  }
                }
              }}
              className="w-full sm:w-auto bg-white/5 border-white/30 text-white hover:bg-white/10 hover:border-white/40 hover:text-white transition-all duration-200"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Resolve any pending confirm promise (used by global guard)
                setShowExitConfirmation(false);
                if (confirmResolverRef.current) {
                  try {
                    confirmResolverRef.current(true);
                  } finally {
                    confirmResolverRef.current = null;
                  }
                }
                // Always run the cleanup flow
                handleExitGame();
              }}
              className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold shadow-lg transition-all duration-200"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Yes, Exit Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
