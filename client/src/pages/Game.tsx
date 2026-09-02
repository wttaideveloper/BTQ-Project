import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Pause,
  Play,
  Gamepad2,
  Target,
  User,
  Users,
  Home,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  X,
  Trophy,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import GameHeader from "@/components/GameHeader";
import GameBoard from "@/components/GameBoard";
import GameSidebar from "@/components/GameSidebar";
import LeaderboardModal from "@/components/LeaderboardModal";
import RewardModal from "@/components/RewardModal";
import { getGameQuestions, getRemainingQuestionCount } from "@/lib/trivia-api";
import { setupGameSocket, GameEvent } from "@/lib/socket";
import {
  initSounds,
  isVoiceEnabled,
  stopSpeaking,
  playSound,
} from "@/lib/sounds";
import { playBasicSound } from "@/lib/basic-sound";
import { voiceService } from "@/lib/voice-service";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  calculateAverageAnswerTime,
  getAnsweredQuestionCount,
  normalizePlayerAvgTime,
  formatAverageAnswerTime,
} from "@/lib/game-stats";
import {
  parseTimeBasedDurationMinutes,
  timeBasedDurationToSeconds,
  getQuestionCountForGame,
  resolveTimeBasedDurationOptions,
} from "@/lib/game-config";
import { useGameSettings } from "@/hooks/use-game-settings";

interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface Question {
  id: string;
  text: string;
  context?: string;
  answers: Answer[];
  category: string;
  difficulty: string;
}

const TIME_MODE_BATCH_SIZE = 15;

const Game: React.FC = () => {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { settings } = useGameSettings();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);

  const durationOptions = resolveTimeBasedDurationOptions(
    settings.timeBasedDurationOptions
  );

  // Game configuration
  const gameMode = params.get("gameMode") || "single";
  const gameType = params.get("gameType") || "question";
  const category = params.get("category") || "All Categories";
  const difficulty = params.get("difficulty") || "Beginner";
  const playerCount = parseInt(params.get("playerCount") || "1");
  const gameDurationMinutes = parseTimeBasedDurationMinutes(
    params.get("gameDuration"),
    durationOptions,
    settings.defaultTimeBasedDuration
  );
  const questionTargetCount = getQuestionCountForGame(
    settings.questionsPerGame,
    gameMode,
    playerCount
  );
  const timeLimit = settings.timePerQuestion;
  const timeBasedDurationSeconds =
    gameType === "time" ? timeBasedDurationToSeconds(gameDurationMinutes) : 0;

  // Generate a stable game session ID
  // Only restore from sessionStorage if there's an active game in progress
  const [gameId, setGameId] = useState(() => {
    // First check URL parameter (for direct links)
    const urlGameId = params.get("gameId");
    if (urlGameId) return urlGameId;

    // Check if there's a saved game state that indicates an active game
    const storedGameId = sessionStorage.getItem("currentGameId");
    if (storedGameId) {
      const gameStateKey = `gameState_${storedGameId}`;
      const savedState = sessionStorage.getItem(gameStateKey);
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          // Only restore if game is not ended and has progress
          if (!state.gameEnded && (state.currentQuestionIndex > 0 || state.score > 0)) {
            return storedGameId;
          }
        } catch (e) {
          // Invalid state, generate new
        }
      }
    }

    // Generate new game ID for fresh game
    const newId =
      gameMode === "multi"
        ? `local-multi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        : `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    sessionStorage.setItem("currentGameId", newId);
    return newId;
  });

  // Get player names from URL or use defaults
  const playerNamesParam = params.get("playerNames");
  const playerNames = playerNamesParam
    ? decodeURIComponent(playerNamesParam).split(",")
    : Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`);

  // Game state persistence key
  const gameStateKey = `gameState_${gameId || "default"}`;

  // Load saved game state from sessionStorage
  const loadGameState = () => {
    try {
      const saved = sessionStorage.getItem(gameStateKey);
      if (saved) {
        const state = JSON.parse(saved);
        return {
          currentQuestionIndex: state.currentQuestionIndex || 0,
          score: state.score || 0,
          correctAnswers: state.correctAnswers || 0,
          incorrectAnswers: state.incorrectAnswers || 0,
          totalTimeSpent: state.totalTimeSpent || 0,
          currentPlayerIndex: state.currentPlayerIndex || 0,
          playerStats:
            state.playerStats ||
            Array.from({ length: playerCount }, () => ({
              score: 0,
              correctAnswers: 0,
              incorrectAnswers: 0,
              totalTimeSpent: 0,
              averageTime: 0,
            })),
          gameTimeRemaining:
            state.gameTimeRemaining ??
            (gameType === "time" ? timeBasedDurationSeconds : 0),
          originalGameTime:
            state.originalGameTime ??
            (gameType === "time" ? timeBasedDurationSeconds : 0),
        };
      }
    } catch (error) {
      console.error("Failed to load game state:", error);
    }
    return null;
  };

  const savedState = loadGameState();

  // Game state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(isVoiceEnabled());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(
    savedState?.currentQuestionIndex ?? 0
  );
  const [score, setScore] = useState(savedState?.score ?? 0);
  const [correctAnswers, setCorrectAnswers] = useState(
    savedState?.correctAnswers ?? 0
  );
  const [incorrectAnswers, setIncorrectAnswers] = useState(
    savedState?.incorrectAnswers ?? 0
  );
  const [totalTimeSpent, setTotalTimeSpent] = useState(
    savedState?.totalTimeSpent ?? 0
  );
  const [isQuestionAnswered, setIsQuestionAnswered] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState(
    "Let's see how well you know the Bible!"
  );
  const [avatarAnimation, setAvatarAnimation] = useState<
    "happy" | "sad" | "neutral" | "excited" | "encouraging" | "blessing"
  >("neutral");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [currentReward, setCurrentReward] = useState<
    "book" | "cap" | "tshirt" | "certificate" | null
  >(null);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [gameEnded, setGameEnded] = useState(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(
    savedState?.currentPlayerIndex ?? 0
  ); // Track which player's turn it is

  // Pause functionality
  const [isPaused, setIsPaused] = useState(false);
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null);
  const [totalPauseTime, setTotalPauseTime] = useState(0);
  const [pausedSpeechText, setPausedSpeechText] = useState<string>("");
  const [speechStartTime, setSpeechStartTime] = useState<number | null>(null);

  // Multiplayer player stats - track individual player statistics
  const [playerStats, setPlayerStats] = useState(() => {
    if (savedState?.playerStats) return savedState.playerStats;
    return Array.from({ length: playerCount }, () => ({
      score: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      totalTimeSpent: 0,
      averageTime: 0,
    }));
  });

  // Countdown timer for time-based game
  const [gameTimeRemaining, setGameTimeRemaining] = useState(
    savedState?.gameTimeRemaining ?? timeBasedDurationSeconds
  );
  const [originalGameTime, setOriginalGameTime] = useState(
    savedState?.originalGameTime ?? timeBasedDurationSeconds
  );

  // Time-based mode: accumulate questions across batches during the session
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [isLoadingMoreQuestions, setIsLoadingMoreQuestions] = useState(false);
  const [questionsExhausted, setQuestionsExhausted] = useState(false);
  const [initialPoolEmpty, setInitialPoolEmpty] = useState(false);
  const [initialVerifyComplete, setInitialVerifyComplete] = useState(false);
  const loadingMoreRef = useRef(false);
  const sessionQuestionsRef = useRef<Question[]>([]);

  sessionQuestionsRef.current = sessionQuestions;

  // Fetch questions from API for game
  const {
    data: questions,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "/api/game/questions",
      category,
      difficulty,
      gameId,
      questionTargetCount,
    ],
    queryFn: async () => {
      try {
        const result = await getGameQuestions(
          category,
          // Ensure enough questions for 2-player games by broadening difficulty if needed
          gameType === "question" && gameMode === "multi" && playerCount === 2
            ? "All"
            : difficulty,
          gameType === "question" ? questionTargetCount : TIME_MODE_BATCH_SIZE,
          gameId
        );
        return result;
      } catch (err) {
        console.error("❌ Error in queryFn:", err);
        throw err;
      }
    },
    staleTime: 0, // Always consider data stale to allow refetching (changed from Infinity to fix loading issue)
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes after component unmounts
    refetchOnMount: "always", // Always refetch on mount to ensure fresh data
    refetchOnWindowFocus: false,
    retry: 2, // Retry twice on failure
    enabled: !!gameId, // Only fetch when gameId is available
  });

  useEffect(() => {
    if (!error) return;
    console.error("❌ Error fetching questions:", error);
    toast({
      title: "Error Loading Questions",
      description: error instanceof Error ? error.message : "Failed to load questions. Please try again.",
      variant: "destructive",
    });
  }, [error, toast]);

  const activeQuestions =
    gameType === "time" ? sessionQuestions : questions ?? [];

  const fetchMoreTimeModeQuestions = useCallback(async () => {
    if (
      gameType !== "time" ||
      loadingMoreRef.current ||
      questionsExhausted ||
      gameEnded
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setIsLoadingMoreQuestions(true);

    try {
      const excludeIds = sessionQuestionsRef.current.map((q) => q.id);
      let newQuestions = await getGameQuestions(
        category,
        difficulty,
        TIME_MODE_BATCH_SIZE,
        gameId,
        excludeIds
      );

      if (newQuestions.length === 0) {
        const remaining = await getRemainingQuestionCount(
          category,
          difficulty,
          excludeIds,
          gameId
        );

        if (remaining > 0) {
          newQuestions = await getGameQuestions(
            category,
            difficulty,
            TIME_MODE_BATCH_SIZE,
            gameId,
            excludeIds
          );
        }

        if (newQuestions.length === 0 && remaining === 0) {
          setQuestionsExhausted(true);
          return;
        }
      }

      if (newQuestions.length > 0) {
        const existingIds = new Set(
          sessionQuestionsRef.current.map((q) => q.id)
        );
        const unique = newQuestions.filter((q) => !existingIds.has(q.id));

        if (unique.length > 0) {
          setSessionQuestions((prev) => [...prev, ...unique]);
        } else {
          const remaining = await getRemainingQuestionCount(
            category,
            difficulty,
            excludeIds,
            gameId
          );
          if (remaining === 0) {
            setQuestionsExhausted(true);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load more time-mode questions:", err);
    } finally {
      setIsLoadingMoreQuestions(false);
      loadingMoreRef.current = false;
    }
  }, [
    gameType,
    questionsExhausted,
    gameEnded,
    category,
    difficulty,
    gameId,
  ]);

  // Seed time-mode session from the initial query batch
  useEffect(() => {
    if (gameType !== "time" || !questions?.length) return;
    setSessionQuestions((prev) => (prev.length === 0 ? questions : prev));
  }, [gameType, questions]);

  // Verify empty initial load before showing "no questions"
  useEffect(() => {
    if (isLoading || initialVerifyComplete) return;

    const loadedCount =
      gameType === "time" ? sessionQuestions.length : questions?.length ?? 0;

    if (loadedCount > 0) {
      setInitialVerifyComplete(true);
      return;
    }

    if (questions === undefined) return;

    let cancelled = false;

    (async () => {
      const remaining = await getRemainingQuestionCount(
        category,
        difficulty,
        [],
        gameId
      );

      if (cancelled) return;

      if (remaining > 0) {
        const refetched = await getGameQuestions(
          category,
          difficulty,
          TIME_MODE_BATCH_SIZE,
          gameId
        );
        if (refetched.length > 0) {
          if (gameType === "time") {
            setSessionQuestions(refetched);
          }
          queryClient.setQueryData(
            ["/api/game/questions", category, difficulty, gameId],
            refetched
          );
        }
      } else {
        setInitialPoolEmpty(true);
      }

      setInitialVerifyComplete(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    initialVerifyComplete,
    gameType,
    sessionQuestions.length,
    questions?.length,
    category,
    difficulty,
    gameId,
  ]);

  // Prefetch the next batch before the player reaches the end of the current list
  useEffect(() => {
    if (gameType !== "time" || gameEnded || questionsExhausted) return;
    if (gameTimeRemaining <= 0) return;
    if (sessionQuestions.length === 0) return;
    if (isLoading || isLoadingMoreQuestions) return;

    const prefetchThreshold = Math.max(0, sessionQuestions.length - 2);
    if (currentQuestionIndex >= prefetchThreshold) {
      void fetchMoreTimeModeQuestions();
    }
  }, [
    gameType,
    gameEnded,
    questionsExhausted,
    gameTimeRemaining,
    sessionQuestions.length,
    currentQuestionIndex,
    isLoading,
    isLoadingMoreQuestions,
    fetchMoreTimeModeQuestions,
  ]);

  // End time-based game when the question pool is truly exhausted
  useEffect(() => {
    if (gameType !== "time" || gameEnded || !questionsExhausted) return;
    if (
      currentQuestionIndex >= sessionQuestions.length &&
      !isLoadingMoreQuestions
    ) {
      setGameEnded(true);
    }
  }, [
    gameType,
    gameEnded,
    questionsExhausted,
    currentQuestionIndex,
    sessionQuestions.length,
    isLoadingMoreQuestions,
  ]);

  // Calculate reward progress with the new thresholds
  const rewardProgress = {
    book: {
      current: correctAnswers,
      required: 3, // Changed from 5 to 3
      achieved: correctAnswers >= 3,
    },
    cap: {
      current: correctAnswers,
      required: 6, // Changed from 9 to 6
      achieved: correctAnswers >= 6,
    },
    tshirt: {
      current: correctAnswers,
      required: 10, // Changed from 12 to 10
      achieved: correctAnswers >= 10,
    },
  };

  const answeredQuestionCount = getAnsweredQuestionCount(
    correctAnswers,
    incorrectAnswers
  );

  // Player stats
  const stats = {
    correctAnswers,
    incorrectAnswers,
    totalTimeSpent,
    averageTime: calculateAverageAnswerTime(
      totalTimeSpent,
      answeredQuestionCount
    ),
  };

  // Function to reset game state for PLAY AGAIN functionality
  const resetGameState = () => {

    // Reset all game state
    setCurrentQuestionIndex(0);
    setScore(0);
    setCorrectAnswers(0);
    setIncorrectAnswers(0);
    setTotalTimeSpent(0);
    setIsQuestionAnswered(false);
    setAvatarMessage("Let's see how well you know the Bible!");
    setAvatarAnimation("neutral");
    setShowLeaderboard(false);
    setShowReward(false);
    setCurrentReward(null);
    setLeaderboardData([]);
    setGameEnded(false);
    setCurrentPlayerIndex(0);

    // Reset pause state
    setIsPaused(false);
    setPauseStartTime(null);
    setTotalPauseTime(0);
    setPausedSpeechText("");
    setSpeechStartTime(null);

    // Reset player stats
    setPlayerStats(
      Array.from({ length: playerCount }, () => ({
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        totalTimeSpent: 0,
        averageTime: 0,
      }))
    );

    // Reset game time
    setGameTimeRemaining(timeBasedDurationSeconds);
    setOriginalGameTime(timeBasedDurationSeconds);

    setSessionQuestions([]);
    setQuestionsExhausted(false);
    setInitialPoolEmpty(false);
    setInitialVerifyComplete(false);
    loadingMoreRef.current = false;

    // Generate new game ID and update state
    const newGameId =
      gameMode === "multi"
        ? `local-multi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        : `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem("currentGameId", newGameId);
    setGameId(newGameId); // Update the state to trigger new questions fetch

    // Clear question read flags
    sessionStorage.removeItem("questionRead");
    for (let i = 0; i <= 20; i++) {
      sessionStorage.removeItem(`questionRead_${i}`);
    }

    // Clear the game state for the new game
    sessionStorage.removeItem(`gameState_${gameId}`);
    sessionStorage.removeItem(`gameState_${newGameId}`);

    // Reset voice service
    voiceService.reset();

    // Invalidate and refetch questions for the new game
    queryClient.removeQueries({
      queryKey: ["/api/game/questions"],
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/game/questions", category, difficulty, newGameId],
    });


  };

  const handleExitGame = () => {
    setShowExitConfirmation(false);
    voiceService.stopAllAudio(true);
    stopSpeaking();
    sessionStorage.removeItem("currentGameId");
    sessionStorage.removeItem(`gameState_${gameId}`);
    sessionStorage.removeItem("questionRead");
    for (let i = 0; i <= 20; i++) {
      sessionStorage.removeItem(`questionRead_${i}`);
    }
    setLocation("/");
  };

  const handleExitClick = () => {
    if (gameMode === "multi" && !gameEnded) {
      setShowExitConfirmation(true);
      return;
    }
    handleExitGame();
  };

  // Initialize sounds and socket connection
  useEffect(() => {
    initSounds();

    // Clear React Query cache for questions when starting a fresh game
    // This ensures new questions are fetched instead of using cached ones
    const gameStateKey = `gameState_${gameId}`;
    const savedState = sessionStorage.getItem(gameStateKey);
    const isFreshGame = !savedState || (() => {
      try {
        const state = JSON.parse(savedState);
        return state.gameEnded || (state.currentQuestionIndex === 0 && state.score === 0);
      } catch {
        return true;
      }
    })();

    if (isFreshGame && gameId) {
      // Invalidate queries to force fresh fetch - this will trigger a refetch
      queryClient.invalidateQueries({
        queryKey: ["/api/game/questions", category, difficulty, gameId],
      });
    }

    // Initialize voice service and get voice status
    const initializeVoice = async () => {
      try {
        // Reset voice service for new game
        voiceService.reset();
        await voiceService.getVoiceStatus();
      } catch (error) {
        console.error("Failed to initialize voice service:", error);
      }
    };

    initializeVoice();

    if (gameMode === "multi") {
      const socket = setupGameSocket();

      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data) as GameEvent;

          switch (data.type) {
            case "player_joined":
              toast({
                title: "Player Joined",
                description: `${data.playerName} has joined the game`,
              });
              break;
            case "player_left":
              toast({
                title: "Player Left",
                description: `${data.playerName} has left the game`,
              });
              break;
            case "answer_submitted":
              // Update leaderboard (only for online multiplayer, not local)
              if (data.leaderboard && !gameId.includes("local-multi")) {
                setLeaderboardData(
                  data.leaderboard.map((player: any) => ({
                    ...player,
                    avgTime: normalizePlayerAvgTime(player),
                  }))
                );
              }
              break;
            case "game_ended":
              setShowLeaderboard(true);
              setGameEnded(true);
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      });

      return () => {
        socket.close();
        // Clean up any ongoing speech when leaving the game
        voiceService.stopAllAudio(true);
        stopSpeaking();
      };
    }

    // Clean up any ongoing speech when leaving the game
    return () => {
      voiceService.stopAllAudio(true);
      stopSpeaking();

      // Clear session storage when component unmounts
      sessionStorage.removeItem("questionRead");

      // Clear all question-specific keys
      for (let i = 0; i <= 20; i++) {
        sessionStorage.removeItem(`questionRead_${i}`);
      }
    };
  }, [gameMode, toast]);

  // Pause/Resume functions
  const handlePause = () => {
    if (!isPaused) {
      setIsPaused(true);
      setPauseStartTime(Date.now());

      // Store current speech information if voice is speaking
      const speechInfo = voiceService.getCurrentSpeechInfo();
      if (speechInfo.isSpeaking && speechInfo.text) {
        setPausedSpeechText(speechInfo.text);
        setSpeechStartTime(speechInfo.startTime);
      }

      // Stop any ongoing speech (do not block future narration)
      voiceService.stopAllAudio(false);
      // Stop any ongoing sounds
      stopSpeaking();
    }
  };

  const handleResume = () => {
    if (isPaused && pauseStartTime) {
      const pauseDuration = Date.now() - pauseStartTime;
      setTotalPauseTime((prev) => prev + pauseDuration);
      setIsPaused(false);
      setPauseStartTime(null);

      // Resume speech if it was paused
      if (pausedSpeechText && speechStartTime && isVoiceEnabled()) {
        // Calculate how much of the speech was already played
        const speechDuration = pauseStartTime - speechStartTime;
        const estimatedWordsPerMinute = 150; // Average speaking rate
        const wordsPerSecond = estimatedWordsPerMinute / 60;
        const wordsSpoken = Math.floor(
          (speechDuration / 1000) * wordsPerSecond
        );

        // Find the position in the text where we left off
        const words = pausedSpeechText.split(" ");
        const remainingWords = words.slice(Math.max(0, wordsSpoken));
        const remainingText = remainingWords.join(" ");

        if (remainingText.trim()) {
          // Resume speech from where it left off
          setTimeout(() => {
            voiceService.speakWithClonedVoice(remainingText);
          }, 500); // Small delay to ensure UI is ready
        }
      }

      // Clear paused speech data
      setPausedSpeechText("");
      setSpeechStartTime(null);
    }
  };

  // Time-based game countdown
  useEffect(() => {
    if (
      gameType === "time" &&
      gameTimeRemaining > 0 &&
      !gameEnded &&
      !isPaused
    ) {
      const timer = setInterval(() => {
        setGameTimeRemaining((prev: number) => {
          if (prev <= 1) {
            clearInterval(timer);
            setGameEnded(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [gameType, gameTimeRemaining, gameEnded, isPaused]);

  // Check for rewards after answering with updated thresholds
  useEffect(() => {
    if (!isQuestionAnswered) return;

    // Check for book reward (3-5 correct answers)
    if (correctAnswers === 3 && !rewardProgress.book.achieved) {
      setCurrentReward("book");
      setShowReward(true);
    }
    // Check for cap reward (6-9 correct answers)
    else if (correctAnswers === 6 && !rewardProgress.cap.achieved) {
      setCurrentReward("cap");
      setShowReward(true);
    }
    // Check for t-shirt reward (10-12 correct answers)
    else if (correctAnswers === 10 && !rewardProgress.tshirt.achieved) {
      setCurrentReward("tshirt");
      setShowReward(true);
    }
    // Check for completion certificate (only for perfect score)
    else if (
      gameMode === "single" &&
      gameType === "question" &&
      currentQuestionIndex === (activeQuestions.length || questionTargetCount) - 1 &&
      correctAnswers === (activeQuestions.length || questionTargetCount) // Only award certificate for perfect score
    ) {
      setCurrentReward("certificate");
      setShowReward(true);
      setGameEnded(true);
    }
  }, [
    correctAnswers,
    isQuestionAnswered,
    currentQuestionIndex,
    activeQuestions.length,
    gameMode,
    gameType,
    rewardProgress,
  ]);

  const scoreSavedRef = useRef(false);

  useEffect(() => {
    scoreSavedRef.current = false;
  }, [gameId]);

  // Game over check
  useEffect(() => {
    if (
      (gameType === "question" &&
        currentQuestionIndex >= (activeQuestions.length || questionTargetCount)) ||
      (gameType === "time" && gameTimeRemaining <= 0)
    ) {
      setGameEnded(true);

      // Stop voice narration when game ends (for all game modes)
      voiceService.stopAllAudio(false);
      stopSpeaking();

      // Clear gameId from sessionStorage when game ends
      // This ensures next game will get fresh questions
      sessionStorage.removeItem("currentGameId");

      // Clear all question read flags from session storage
      sessionStorage.removeItem("questionRead");
      for (let i = 0; i <= 20; i++) {
        sessionStorage.removeItem(`questionRead_${i}`);
      }

      // Save scores to database
      const savedAverageTime = calculateAverageAnswerTime(
        totalTimeSpent,
        answeredQuestionCount
      );

      if (gameMode === "single") {
        if (!user?.id) {
          console.warn("Solo score not saved: user not logged in");
        } else if (!scoreSavedRef.current) {
          scoreSavedRef.current = true;

          const saveSinglePlayerScore = async () => {
            try {
              await apiRequest("POST", "/api/single-player/scores", {
                score: score,
                correctAnswers: correctAnswers,
                incorrectAnswers: incorrectAnswers,
                averageTime: savedAverageTime.toString(),
                category: category,
                difficulty: difficulty,
                gameType: gameType,
                totalQuestions: activeQuestions.length || questionTargetCount,
                timeLimit:
                  gameType === "time" ? timeBasedDurationSeconds : undefined,
              });

              queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
              queryClient.invalidateQueries({
                queryKey: ["/api/single-player/scores"],
              });
              queryClient.invalidateQueries({ queryKey: ["/api/user"] });
              queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
            } catch (error) {
              scoreSavedRef.current = false;
              console.error("Error saving single player score:", error);
              toast({
                title: "Score not saved",
                description:
                  "Your game finished but the score could not be saved. Please log in and try again.",
                variant: "destructive",
              });
            }
          };

          saveSinglePlayerScore();
        }
      } else if (gameMode === "multi") {
        // Save local multiplayer scores for each player
        const saveLocalMultiplayerScores = async () => {
          try {

            // Save scores for each player with their actual names
            for (let i = 0; i < playerCount; i++) {
              const playerStat = playerStats[i];
              const playerName = playerNames[i];

              if (playerStat && playerName) {

                const playerAverageTime = calculateAverageAnswerTime(
                  playerStat.totalTimeSpent,
                  getAnsweredQuestionCount(
                    playerStat.correctAnswers,
                    playerStat.incorrectAnswers
                  )
                );

                await apiRequest("POST", "/api/multiplayer/scores", {
                  gameSessionId: gameId,
                  playerName: playerName,
                  playerIndex: i,
                  score: playerStat.score,
                  correctAnswers: playerStat.correctAnswers,
                  incorrectAnswers: playerStat.incorrectAnswers,
                  averageTime: playerAverageTime.toString(),
                  category: category,
                  difficulty: difficulty,
                  gameType: "local-multi",
                  totalQuestions: activeQuestions.length || questionTargetCount,
                  playerCount: playerCount,
                });
              }
            }

            queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });

            // Trigger leaderboard refresh
            if (window.location.pathname === "/leaderboard") {
              window.location.reload();
            }
          } catch (error) {
            console.error("Error saving local multiplayer scores:", error);
          }
        };

        saveLocalMultiplayerScores();
      }

      // Play different end game sounds based on performance
      if (correctAnswers > 0) {
        // Perfect score check (all questions correct)
        if (
          gameType === "question" &&
          correctAnswers === (activeQuestions.length || questionTargetCount)
        ) {
          // Celebration sequence for perfect score
          playSound("fanfare");
          playBasicSound("fanfare"); // Use both sound systems
          setTimeout(() => {
            playSound("perfectScore");
          }, 500);
          setTimeout(() => {
            playSound("applause");
            playBasicSound("applause"); // Use both sound systems
          }, 1000);
        }
        // Strong performance (80%+ correct)
        else if (correctAnswers / (correctAnswers + incorrectAnswers) >= 0.8) {
          playSound("celebration");
          playBasicSound("celebration"); // Use both sound systems
          setTimeout(() => {
            playSound("applause");
            playBasicSound("applause"); // Use both sound systems
          }, 800);
        }
        // Average performance
        else {
          playSound("fanfare");
          playBasicSound("fanfare"); // Use both sound systems
        }
      } else {
        // No correct answers
        playSound("buzzer");
        playBasicSound("buzzer"); // Use both sound systems
      }

      if (gameMode === "multi") {
        setShowLeaderboard(true);
      }
    }
  }, [
    currentQuestionIndex,
    activeQuestions.length,
    gameType,
    gameTimeRemaining,
    gameMode,
    correctAnswers,
    incorrectAnswers,
    score,
    totalTimeSpent,
    answeredQuestionCount,
    category,
    difficulty,
    user?.id,
    timeBasedDurationSeconds,
    toast,
  ]);

  const handleAnswer = (answer: Answer, timeSpent: number) => {
    setIsQuestionAnswered(true);
    setTotalTimeSpent((prev: number) => prev + timeSpent);

    // Track answer for analytics (non-blocking)
    if (currentQuestion && user?.id) {
      try {
        fetch("/api/question-analytics/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            questionId: currentQuestion.id,
            userId: user.id,
            isCorrect: answer.isCorrect,
            timeSpent: timeSpent,
            category: currentQuestion.category,
            difficulty: currentQuestion.difficulty,
          }),
        }).catch((err) => {
        });
      } catch (err) {
      }
    }

    // Update game stats - for single player use global state, for multiplayer use player-specific stats only
    if (gameMode !== "multi") {
      // Single player mode: update global stats
      if (answer.isCorrect) {
        setScore((prev: number) => prev + 1);
        setCorrectAnswers((prev: number) => prev + 1);
      } else {
        setIncorrectAnswers((prev: number) => prev + 1);
      }
    }

    // Play sounds and update avatar for all game modes
    if (answer.isCorrect) {
      // Play celebration sound for correct answers
      if (timeSpent < 5) {
        // Fast answer gets an exciting celebration sound
        playSound("celebration");
        playBasicSound("celebration"); // Use both sound systems
        setAvatarMessage("Swift as David against Goliath!");
        setAvatarAnimation("excited");
      } else {
        // Normal correct answer gets applause
        playSound("applause");
        playBasicSound("applause"); // Use both sound systems
        setAvatarMessage(
          "Splendid! As Noah built the Ark with faith, you build your knowledge!"
        );
        setAvatarAnimation("happy");
      }
    } else {
      // Play buzzer sound for incorrect answers
      playSound("buzzer");
      playBasicSound("buzzer"); // Use both sound systems
      setAvatarMessage(
        "A brave attempt, but fear not, for wisdom grows with each question."
      );
      setAvatarAnimation("sad");
    }

    // For multiplayer, update individual player stats
    if (gameMode === "multi") {
      // Update player-specific stats
      setPlayerStats((prevStats: any[]) => {
        const updatedStats = [...prevStats];
        const playerStat = updatedStats[currentPlayerIndex];

        // Update this player's stats
        const nextTotalTimeSpent = playerStat.totalTimeSpent + timeSpent;
        const nextAnsweredCount =
          playerStat.correctAnswers +
          playerStat.incorrectAnswers +
          1;

        updatedStats[currentPlayerIndex] = {
          ...playerStat,
          score: answer.isCorrect ? playerStat.score + 1 : playerStat.score,
          correctAnswers: answer.isCorrect
            ? playerStat.correctAnswers + 1
            : playerStat.correctAnswers,
          incorrectAnswers: !answer.isCorrect
            ? playerStat.incorrectAnswers + 1
            : playerStat.incorrectAnswers,
          totalTimeSpent: nextTotalTimeSpent,
          averageTime: calculateAverageAnswerTime(
            nextTotalTimeSpent,
            nextAnsweredCount
          ),
        };


        return updatedStats;
      });

      // Send answer to server for multiplayer (only for online multiplayer, not local)
      if (!gameId.includes("local-multi")) {
        const socket = setupGameSocket();

        if (gameId) {
          socket.send(
            JSON.stringify({
              type: "submit_answer",
              gameId,
              playerName: playerNames[currentPlayerIndex], // Use the current player's name based on turn
              playerIndex: currentPlayerIndex,
              questionId: activeQuestions[currentQuestionIndex]?.id,
              answerId: answer.id,
              isCorrect: answer.isCorrect,
              timeSpent,
            })
          );
        } else {
          console.error("No game ID found for multiplayer mode");
        }
      }
    }
  };

  const handleNextQuestion = () => {
    setIsQuestionAnswered(false);
    setCurrentQuestionIndex((prev: number) => prev + 1);

    // Clear the question read flag for the next question so it can be narrated
    sessionStorage.removeItem("questionRead");
    const nextQuestionIndex = currentQuestionIndex + 1;
    sessionStorage.removeItem(`questionRead_${nextQuestionIndex}`);

    // In multiplayer mode, rotate to the next player's turn
    if (gameMode === "multi" && playerCount > 1) {
      const nextPlayerIndex = (currentPlayerIndex + 1) % playerCount;
      setCurrentPlayerIndex(nextPlayerIndex);
      setAvatarMessage(
        `${playerNames[nextPlayerIndex]}'s turn! Let's see how well you know the Bible!`
      );
    } else {
      setAvatarMessage("Let's see how well you know the Bible!");
    }

    setAvatarAnimation("neutral");
  };

  const handleClaimReward = () => {
    toast({
      title: "Reward Claimed!",
      description: "Your reward will be sent to you shortly.",
      duration: 3000,
    });
    setShowReward(false);

    if (gameEnded) {
      // If game ended, show final leaderboard for multiplayer
      if (gameMode === "multi") {
        setShowLeaderboard(true);
      }
    }
  };

  // Loading and error states
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark flex items-center justify-center">
        <div className="text-center bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 shadow-xl">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-accent border-t-transparent mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Loading Questions
          </h2>
          <p className="text-white/80">
            Preparing your Biblical Trivia Quest...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark flex items-center justify-center">
        <div className="text-center bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 shadow-xl max-w-md mx-4">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Failed to Load Questions
          </h2>
          <p className="text-white/80 mb-6">
            There was an error loading the trivia questions. Please try again.
          </p>
          <button
            onClick={() => {
              // Stop voice narration before navigating
              voiceService.stopAllAudio(true);
              stopSpeaking();
              setLocation("/");
            }}
            className="bg-accent hover:bg-accent/90 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Current question
  const currentQuestion = activeQuestions[currentQuestionIndex];

  const isWaitingForMoreQuestions =
    gameType === "time" &&
    !gameEnded &&
    !currentQuestion &&
    !initialPoolEmpty &&
    !questionsExhausted &&
    (isLoading ||
      isLoadingMoreQuestions ||
      !initialVerifyComplete ||
      (sessionQuestions.length > 0 &&
        currentQuestionIndex >= sessionQuestions.length));

  if (isWaitingForMoreQuestions) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark flex items-center justify-center">
        <div className="text-center bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 shadow-xl">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-accent border-t-transparent mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Loading Questions
          </h2>
          <p className="text-white/80">
            Fetching more questions for your speed round...
          </p>
        </div>
      </div>
    );
  }

  if (
    !currentQuestion &&
    !gameEnded &&
    (initialPoolEmpty ||
      (gameType === "question" &&
        initialVerifyComplete &&
        activeQuestions.length === 0))
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark flex items-center justify-center">
        <div className="text-center bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 shadow-xl max-w-md mx-4">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <HelpCircle className="h-8 w-8 text-yellow-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            No Questions Available
          </h2>
          <p className="text-white/80 mb-6">
            There are no questions available for the selected category and
            difficulty.
          </p>
          <button
            onClick={() => {
              // Stop voice narration before navigating
              voiceService.stopAllAudio(true);
              stopSpeaking();
              setLocation("/");
            }}
            className="bg-accent hover:bg-accent/90 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (gameEnded && !showReward && !showLeaderboard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark flex items-center justify-center p-4">
        <div className="text-center max-w-2xl mx-auto bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20 shadow-2xl">
          <div className="animate-bounce-slow mb-6">
            <div className="bg-gradient-to-r from-accent to-accent-dark w-24 h-24 flex items-center justify-center rounded-full mx-auto shadow-xl">
              <span className="text-white text-4xl font-bold">{score}</span>
            </div>
          </div>
          <h2 className="text-5xl font-heading font-bold text-white mb-2">
            {gameType === "time" ? "TIME'S UP!" : "GAME OVER!"}
          </h2>
          {gameType === "time" ? (
            <p className="text-white/70 text-base sm:text-lg mb-6">
              Your round timer has finished. Here&apos;s how you did:
            </p>
          ) : (
            <div className="mb-6" />
          )}

          <div className="mb-8 p-6 bg-white/5 rounded-2xl border border-white/10">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-accent mb-1">
                  {score}
                </div>
                <div className="text-white/80 text-sm">Final Score</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-green-400 mb-1">
                  {correctAnswers}
                </div>
                <div className="text-white/80 text-sm">Correct</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-red-400 mb-1">
                  {incorrectAnswers}
                </div>
                <div className="text-white/80 text-sm">Incorrect</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-3xl font-bold text-yellow-400 mb-1">
                  {formatAverageAnswerTime(stats.averageTime)}
                </div>
                <div className="text-white/80 text-sm">Avg. Time</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-full px-4">
            <button
              onClick={() => {
                // Stop voice narration before navigating
                voiceService.stopAllAudio(true);
                stopSpeaking();
                setLocation("/");
              }}
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 md:px-8 rounded-xl transition-all duration-200 border border-white/20 flex items-center justify-center gap-2 w-full sm:w-auto min-w-0"
            >
              <Home className="h-5 w-5 flex-shrink-0" />
              <span className="whitespace-nowrap">HOME</span>
            </button>
            <button
              onClick={() => {

                // Stop voice narration
                voiceService.stopAllAudio(true);
                stopSpeaking();

                // Reset game state
                resetGameState();

                // The questions query will automatically refetch with the new gameId
              }}
              className="bg-gradient-to-r from-accent to-accent-dark hover:from-accent/90 hover:to-accent-dark/90 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 md:px-8 rounded-xl transition-all duration-200 shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto min-w-0"
            >
              <RotateCcw className="h-5 w-5 flex-shrink-0" />
              <span className="whitespace-nowrap">PLAY AGAIN</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="app"
      className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark overflow-x-hidden max-w-full"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 w-full min-w-0">
        <GameHeader
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          voiceEnabled={voiceEnabled}
          setVoiceEnabled={setVoiceEnabled}
          isPaused={isPaused}
          onPause={handlePause}
          onResume={handleResume}
          gameType={gameType}
          gameTimeRemaining={gameTimeRemaining}
          originalGameTime={originalGameTime}
        />

        {gameMode === "single" && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 sm:px-4 sm:py-2.5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wide text-accent">
                Solo Quiz
              </span>
              <span className="hidden sm:inline text-white/30">·</span>
              <span className="text-xs sm:text-sm text-white/80 truncate">
                {gameType === "question"
                  ? "Question-Based"
                  : `Time-Based · ${gameDurationMinutes} min`}
              </span>
              <span className="hidden sm:inline text-white/30">·</span>
              <span className="text-xs sm:text-sm text-white/60 truncate">
                {category} · {difficulty}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <User className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-white truncate max-w-[140px] sm:max-w-none">
                {playerNames[0]}
              </span>
            </div>
          </div>
        )}

        {/* Compact Player turn indicator for multiplayer */}
        {gameMode === "multi" && playerCount > 1 && (
          <div className="mb-4 bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/30 shadow-xl">
            <div className="text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-accent/20 rounded-full p-2 mr-3">
                  <Gamepad2 className="h-5 w-5 text-accent" />
                </div>
                <h3 className="text-accent text-lg sm:text-xl font-bold font-heading">
                  MULTIPLAYER MODE
                </h3>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-4">
                {playerNames.map((name, index) => {
                  const playerColors = [
                    {
                      bg: "from-blue-500 to-blue-700",
                      text: "text-blue-100",
                      border: "border-blue-400",
                      glow: "shadow-blue-500/50",
                    },
                    {
                      bg: "from-green-500 to-green-700",
                      text: "text-green-100",
                      border: "border-green-400",
                      glow: "shadow-green-500/50",
                    },
                    {
                      bg: "from-orange-500 to-orange-700",
                      text: "text-orange-100",
                      border: "border-orange-400",
                      glow: "shadow-orange-500/50",
                    },
                    {
                      bg: "from-purple-500 to-purple-700",
                      text: "text-purple-100",
                      border: "border-purple-400",
                      glow: "shadow-purple-500/50",
                    },
                  ];
                  const color = playerColors[index % playerColors.length];
                  const isCurrentPlayer = index === currentPlayerIndex;

                  return (
                    <div
                      key={index}
                      className={`relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 transform ${
                        isCurrentPlayer
                          ? `bg-gradient-to-r ${color.bg} text-white font-bold scale-105 shadow-xl ${color.glow} border-2 ${color.border} animate-pulse-slow`
                          : "bg-white/5 text-white/60 border border-white/20 hover:bg-white/10"
                      }`}
                    >
                      {/* Player number badge */}
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isCurrentPlayer
                            ? "bg-white text-gray-900"
                            : "bg-white/20 text-white/80"
                        }`}
                      >
                        {index + 1}
                      </div>

                      {/* Player name */}
                      <span
                        className={`text-sm font-medium ${
                          isCurrentPlayer ? "text-white" : "text-white/80"
                        }`}
                      >
                        {name}
                      </span>

                      {/* Current player indicator */}
                      {isCurrentPlayer && (
                        <Target className="h-4 w-4 animate-bounce text-white" />
                      )}

                      {/* Player stats */}
                      <div className="text-xs opacity-75 ml-1">
                        <span>{playerStats[index]?.score || 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Current turn announcement */}
              {currentPlayerIndex !== undefined &&
                playerNames[currentPlayerIndex] && (
                  <div className="bg-gradient-to-r from-accent/20 to-accent/10 rounded-xl p-3 border border-accent/30">
                    <p className="text-white font-bold text-base mb-1 flex items-center justify-center gap-2">
                      <Target className="h-4 w-4" />
                      {playerNames[currentPlayerIndex]}'s Turn!
                    </p>
                    <p className="text-white/80 text-xs">
                      Answer the question to score points
                    </p>
                  </div>
                )}
            </div>
          </div>
        )}

        <main className="flex-grow flex flex-col lg:flex-row gap-6">
          {currentQuestion && (
            <div className="flex-1">
              <GameBoard
                question={currentQuestion.text}
                questionContext={currentQuestion.context}
                answers={currentQuestion.answers}
                currentQuestion={currentQuestionIndex + 1}
                totalQuestions={
                  gameType === "question" ? activeQuestions.length || questionTargetCount : "∞"
                }
                category={currentQuestion.category}
                difficultyLevel={currentQuestion.difficulty}
                timeLimit={timeLimit}
                onAnswer={handleAnswer}
                onNextQuestion={handleNextQuestion}
                score={score}
                avatarMessage={avatarMessage}
                isQuestionAnswered={isQuestionAnswered}
                correctAnswers={correctAnswers}
                isPaused={isPaused}
                isMultiplayer={gameMode === "multi" && playerCount > 1}
                currentPlayerName={
                  gameMode === "multi" && playerCount > 1
                    ? playerNames[currentPlayerIndex]
                    : undefined
                }
                gameMode={gameMode}
              />
            </div>
          )}

          <div className="lg:w-80 xl:w-96">
            <GameSidebar
              avatarMessage={avatarMessage}
              avatarAnimation={avatarAnimation}
              stats={stats}
              playerStats={playerStats}
              playerNames={playerNames}
              currentPlayerIndex={currentPlayerIndex}
              isMultiplayer={gameMode === "multi" && playerCount > 1}
              onExitClick={handleExitClick}
            />
          </div>
        </main>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          players={
            // For local multiplayer (2+ players on same device), ALWAYS use playerStats
            // Local multiplayer = gameMode is 'multi' AND gameId starts with 'local-multi' OR playerCount > 1
            gameMode === "multi" &&
            (gameId.includes("local-multi") || playerCount > 1)
              ? (() => {
                  const playersData = playerNames.map((name, index) => ({
                    id: String(index + 1),
                    name: name,
                    score: playerStats[index]?.score || 0,
                    correctAnswers: playerStats[index]?.correctAnswers || 0,
                    avgTime: normalizePlayerAvgTime(playerStats[index] || {}),
                    isCurrentUser: false,
                  }));
                  return playersData;
                })()
              : // If we have server data (online multiplayer), use it
              leaderboardData.length > 0
              ? leaderboardData.map((player) => ({
                  ...player,
                  avgTime: normalizePlayerAvgTime(player),
                }))
              : // If multiplayer (online), use player-specific stats we've tracked
              gameMode === "multi"
              ? (() => {
                  const playersData = playerNames.map((name, index) => ({
                    id: String(index + 1),
                    name: name,
                    score: playerStats[index]?.score || 0,
                    correctAnswers: playerStats[index]?.correctAnswers || 0,
                    avgTime: normalizePlayerAvgTime(playerStats[index] || {}),
                    isCurrentUser: false, // For local multiplayer, no "current user" concept
                  }));
                  return playersData;
                })()
              : // For single player, use the original approach
                [
                  {
                    id: "1",
                    name: playerNames[0],
                    score: score,
                    correctAnswers: correctAnswers,
                    avgTime: stats.averageTime,
                    isCurrentUser: true,
                  },
                ]
          }
          isGameOver={gameEnded}
          onPlayAgain={() => {

            // Reset gameEnded flag FIRST to prevent redirect
            setGameEnded(false);

            // Stop voice narration
            voiceService.stopAllAudio(true);
            stopSpeaking();

            // Reset game state
            resetGameState();

            // Close leaderboard modal
            setShowLeaderboard(false);

          }}
          onClose={() => {
            // Stop voice narration before closing/navigating
            voiceService.stopAllAudio(true);
            stopSpeaking();

            setShowLeaderboard(false);
            if (gameEnded) {
              // Always return to home if game is ended
              setLocation("/");
            }
          }}
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
              {pausedSpeechText && (
                <div className="mt-6 p-4 bg-accent/10 rounded-xl border border-accent/20">
                  <p className="text-sm text-accent">
                    <strong>Voice Narration:</strong> Will resume from where it
                    left off when you continue.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleResume}
                className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-4 text-lg rounded-xl"
              >
                <Play size={24} className="mr-3" />
                Resume Game
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  // Stop voice narration before exiting
                  voiceService.stopAllAudio(true);
                  stopSpeaking();

                  setIsPaused(false);
                  setLocation("/");
                }}
                className="w-full border-white/20 text-black hover:bg-white/10 py-4 text-lg rounded-xl flex items-center gap-2"
              >
                <LogOut className="h-5 w-5" />
                Exit to Home
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reward Modal */}
      {showReward && currentReward && (
        <RewardModal
          type={currentReward}
          message={
            currentReward === "certificate"
              ? "You have run a faithful race! Your knowledge of scripture is impressive."
              : "Congratulations on your achievement! Your dedication to learning God's Word is commendable."
          }
          onClaim={handleClaimReward}
          onClose={() => {
            // Stop voice narration when closing reward modal
            voiceService.stopAllAudio(true);
            stopSpeaking();

            setShowReward(false);
            if (gameEnded) {
              if (gameMode === "multi") {
                setShowLeaderboard(true);
              } else {
                setLocation("/");
              }
            }
          }}
        />
      )}

      <Dialog
        open={showExitConfirmation}
        onOpenChange={setShowExitConfirmation}
      >
        <DialogContent className="sm:max-w-md bg-gradient-to-b from-[#0F1624] to-[#0A0F1A] text-white border border-white/20">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center flex items-center justify-center gap-2">
              <LogOut className="h-5 w-5 text-red-400" />
              Exit Game?
            </DialogTitle>
            <DialogDescription className="text-white/80 text-center pt-2">
              Are you sure you want to leave the game? Your progress will be lost.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold text-red-400">What happens when you leave:</p>
              <ul className="text-xs sm:text-sm text-white/70 space-y-1 list-disc list-inside">
                <li>The current game session will end</li>
                <li>All player scores and progress will be lost</li>
                {gameMode === "multi" && playerCount > 1 && (
                  <li className="text-red-400 font-semibold">Other players on this device will lose their progress too</li>
                )}
              </ul>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowExitConfirmation(false)}
              className="w-full sm:w-auto bg-white/5 border-white/30 text-white hover:bg-white/10 hover:border-white/40 hover:text-white transition-all duration-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExitGame}
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
};

export default Game;
