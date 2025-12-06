import React, { useState, useEffect } from "react";
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
import GameHeader from "@/components/GameHeader";
import GameBoard from "@/components/GameBoard";
import GameSidebar from "@/components/GameSidebar";
import LeaderboardModal from "@/components/LeaderboardModal";
import RewardModal from "@/components/RewardModal";
import { getGameQuestions } from "@/lib/trivia-api";
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
import { queryClient } from "@/lib/queryClient";

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

const Game: React.FC = () => {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);

  // Game configuration
  const gameMode = params.get("gameMode") || "single";
  const gameType = params.get("gameType") || "question";
  const category = params.get("category") || "All Categories";
  const difficulty = params.get("difficulty") || "Beginner";
  const playerCount = parseInt(params.get("playerCount") || "1");

  // Generate a stable game session ID
  const [gameId] = useState(() => {
    const existingId =
      params.get("gameId") || sessionStorage.getItem("currentGameId");
    if (existingId) return existingId;

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
            state.gameTimeRemaining || (gameType === "time" ? 15 * 60 : 0),
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
    savedState?.gameTimeRemaining ?? (gameType === "time" ? 15 * 60 : 0)
  ); // 15 minutes in seconds
  const [originalGameTime, setOriginalGameTime] = useState(
    gameType === "time" ? 15 * 60 : 0
  ); // Store original time for pause calculations

  const timeLimit = 20; // 20 seconds per question

  // Fetch questions from API for game
  const {
    data: questions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["/api/game/questions", category, difficulty, gameId],
    queryFn: () =>
      getGameQuestions(
        category,
        difficulty,
        gameType === "question" ? 10 : 20,
        gameId
      ),
    staleTime: Infinity, // Cache questions for the entire game session
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes after component unmounts
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1, // Retry once on failure
    enabled: !!gameId,
  });

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

  // Player stats
  const stats = {
    correctAnswers,
    incorrectAnswers,
    averageTime:
      correctAnswers + incorrectAnswers > 0
        ? totalTimeSpent / (correctAnswers + incorrectAnswers)
        : 0,
  };

  // Function to reset game state for PLAY AGAIN functionality
  const resetGameState = () => {
    console.log("🔄 Resetting game state for PLAY AGAIN");

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
    setGameTimeRemaining(gameType === "time" ? 15 * 60 : 0);
    setOriginalGameTime(gameType === "time" ? 15 * 60 : 0);

    // Generate new game ID
    const newGameId =
      gameMode === "multi"
        ? `local-multi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        : `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem("currentGameId", newGameId);

    // Clear question read flags
    sessionStorage.removeItem("questionRead");
    for (let i = 0; i <= 20; i++) {
      sessionStorage.removeItem(`questionRead_${i}`);
    }

    // Reset voice service
    voiceService.reset();

    // Invalidate and refetch questions for the new game
    queryClient.invalidateQueries({
      queryKey: ["/api/game/questions", category, difficulty, newGameId],
    });

    console.log("✅ Game state reset complete, new game ID:", newGameId);
  };

  // Initialize sounds and socket connection
  useEffect(() => {
    initSounds();

    // Log game configuration for debugging
    console.log("🎮 Game Configuration:", {
      gameMode,
      gameType,
      category,
      difficulty,
      playerCount,
      playerNames,
      gameId,
    });

    // Initialize voice service and get voice status
    const initializeVoice = async () => {
      try {
        // Reset voice service for new game
        voiceService.reset();
        await voiceService.getVoiceStatus();
        console.log("Voice service initialized successfully");
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
              // Update leaderboard
              if (data.leaderboard) {
                setLeaderboardData(data.leaderboard);
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
        console.log(
          "🧹 Multiplayer game cleanup - closing socket and stopping voice"
        );
        socket.close();
        // Clean up any ongoing speech when leaving the game
        voiceService.stopAllAudio(true);
        stopSpeaking();
      };
    }

    // Clean up any ongoing speech when leaving the game
    return () => {
      console.log(
        "🧹 Game component unmounting - stopping all voice and sounds"
      );
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
      currentQuestionIndex === (questions?.length || 10) - 1 &&
      correctAnswers === (questions?.length || 10) // Only award certificate for perfect score
    ) {
      setCurrentReward("certificate");
      setShowReward(true);
      setGameEnded(true);
    }
  }, [
    correctAnswers,
    isQuestionAnswered,
    currentQuestionIndex,
    questions,
    gameMode,
    gameType,
    rewardProgress,
  ]);

  // Game over check
  useEffect(() => {
    if (
      (gameType === "question" &&
        currentQuestionIndex >= (questions?.length || 10)) ||
      (gameType === "time" && gameTimeRemaining <= 0)
    ) {
      setGameEnded(true);

      // Stop voice narration when game ends (for all game modes)
      console.log(
        `🎮 Game ended (${gameMode} mode) - stopping voice narration`
      );
      voiceService.stopAllAudio(false);
      stopSpeaking();

      // Clear all question read flags from session storage
      sessionStorage.removeItem("questionRead");
      for (let i = 0; i <= 20; i++) {
        sessionStorage.removeItem(`questionRead_${i}`);
      }

      // Save scores to database
      if (gameMode === "single") {
        const saveSinglePlayerScore = async () => {
          try {
            console.log("Saving single player score:", {
              score: score,
              correctAnswers: correctAnswers,
              incorrectAnswers: incorrectAnswers,
              averageTime: stats.averageTime.toString(),
              category: category,
              difficulty: difficulty,
              gameType: gameType,
              totalQuestions: questions?.length || 10,
            });

            const response = await fetch("/api/single-player/scores", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                score: score,
                correctAnswers: correctAnswers,
                incorrectAnswers: incorrectAnswers,
                averageTime: stats.averageTime.toString(),
                category: category,
                difficulty: difficulty,
                gameType: gameType,
                totalQuestions: questions?.length || 10,
                timeLimit: gameType === "time" ? 15 * 60 : undefined,
              }),
            });

            if (response.ok) {
              console.log("Single player score saved successfully");
              // Trigger leaderboard refresh by invalidating the query
              if (window.location.pathname === "/leaderboard") {
                window.location.reload();
              }
            } else {
              console.error("Failed to save single player score");
            }
          } catch (error) {
            console.error("Error saving single player score:", error);
          }
        };

        saveSinglePlayerScore();
      } else if (gameMode === "multi") {
        // Save local multiplayer scores for each player
        const saveLocalMultiplayerScores = async () => {
          try {
            console.log("Saving local multiplayer scores for all players");

            // Save scores for each player with their actual names
            for (let i = 0; i < playerCount; i++) {
              const playerStat = playerStats[i];
              const playerName = playerNames[i];

              if (playerStat && playerName) {
                console.log(`Saving score for ${playerName}:`, {
                  gameSessionId: gameId,
                  playerName: playerName,
                  playerIndex: i,
                  score: playerStat.score,
                  correctAnswers: playerStat.correctAnswers,
                  incorrectAnswers: playerStat.incorrectAnswers,
                  averageTime: playerStat.averageTime.toString(),
                  category: category,
                  difficulty: difficulty,
                  gameType: "local-multi", // Mark as local multiplayer
                  totalQuestions: questions?.length || 10,
                  playerCount: playerCount,
                });

                const response = await fetch("/api/multiplayer/scores", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    gameSessionId: gameId,
                    playerName: playerName,
                    playerIndex: i,
                    score: playerStat.score,
                    correctAnswers: playerStat.correctAnswers,
                    incorrectAnswers: playerStat.incorrectAnswers,
                    averageTime: playerStat.averageTime.toString(),
                    category: category,
                    difficulty: difficulty,
                    gameType: "local-multi", // Mark as local multiplayer
                    totalQuestions: questions?.length || 10,
                    playerCount: playerCount,
                  }),
                });

                if (response.ok) {
                  console.log(
                    `Local multiplayer score saved successfully for ${playerName}`
                  );
                } else {
                  console.error(
                    `Failed to save local multiplayer score for ${playerName}`
                  );
                }
              }
            }

            // Log final game results for debugging
            console.log("Final Local Multiplayer Game Results:", {
              gameId,
              playerCount,
              playerNames,
              playerStats: playerStats.map((stat: any, index: number) => ({
                name: playerNames[index],
                ...stat,
              })),
            });

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
          correctAnswers === (questions?.length || 10)
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
    questions,
    gameType,
    gameTimeRemaining,
    gameMode,
    correctAnswers,
    incorrectAnswers,
    score,
    stats.averageTime,
    category,
    difficulty,
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
          console.log("Analytics tracking failed (non-critical):", err);
        });
      } catch (err) {
        console.log("Analytics tracking error (non-critical):", err);
      }
    }

    // Update overall game stats for compatibility with existing code
    if (answer.isCorrect) {
      setScore((prev: number) => prev + 1);
      setCorrectAnswers((prev: number) => prev + 1);

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
      setIncorrectAnswers((prev: number) => prev + 1);

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
        updatedStats[currentPlayerIndex] = {
          ...playerStat,
          score: answer.isCorrect ? playerStat.score + 1 : playerStat.score,
          correctAnswers: answer.isCorrect
            ? playerStat.correctAnswers + 1
            : playerStat.correctAnswers,
          incorrectAnswers: !answer.isCorrect
            ? playerStat.incorrectAnswers + 1
            : playerStat.incorrectAnswers,
          totalTimeSpent: playerStat.totalTimeSpent + timeSpent,
          averageTime:
            (playerStat.totalTimeSpent + timeSpent) /
            (playerStat.correctAnswers + playerStat.incorrectAnswers + 1),
        };

        return updatedStats;
      });

      // Send answer to server for multiplayer
      const socket = setupGameSocket();

      if (gameId) {
        socket.send(
          JSON.stringify({
            type: "submit_answer",
            gameId,
            playerName: playerNames[currentPlayerIndex], // Use the current player's name based on turn
            playerIndex: currentPlayerIndex,
            questionId: questions?.[currentQuestionIndex].id,
            answerId: answer.id,
            isCorrect: answer.isCorrect,
            timeSpent,
          })
        );
      } else {
        console.error("No game ID found for multiplayer mode");
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
  const currentQuestion = questions?.[currentQuestionIndex];

  if (!currentQuestion && !gameEnded) {
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
          <h2 className="text-5xl font-heading font-bold text-white mb-6">
            GAME OVER!
          </h2>

          <div className="mb-8 p-6 bg-white/5 rounded-2xl border border-white/10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => {
                // Stop voice narration before navigating
                console.log(
                  "🏠 HOME button clicked - stopping voice narration"
                );
                voiceService.stopAllAudio(true);
                stopSpeaking();
                setLocation("/");
              }}
              className="bg-white/10 hover:bg-white/20 text-white font-bold py-4 px-8 rounded-xl transition-all duration-200 border border-white/20 flex items-center gap-2"
            >
              <Home className="h-5 w-5" />
              HOME
            </button>
            <button
              onClick={() => {
                console.log(
                  "🔄 PLAY AGAIN button clicked - resetting game state"
                );

                // Stop voice narration
                voiceService.stopAllAudio(true);
                stopSpeaking();

                // Reset game state
                resetGameState();

                // The questions query will automatically refetch with the new gameId
                console.log("✅ PLAY AGAIN - game reset complete");
              }}
              className="bg-gradient-to-r from-accent to-accent-dark hover:from-accent/90 hover:to-accent-dark/90 text-white font-bold py-4 px-8 rounded-xl transition-all duration-200 shadow-lg flex items-center gap-2"
            >
              <RotateCcw className="h-5 w-5" />
              PLAY AGAIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="app"
      className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
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
                  gameType === "question" ? questions?.length || 10 : "∞"
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
              />
            </div>
          )}

          <div className="lg:w-80 xl:w-96">
            <GameSidebar
              avatarMessage={avatarMessage}
              avatarAnimation={avatarAnimation}
              stats={stats}
              rewardProgress={rewardProgress}
              playerStats={playerStats}
              playerNames={playerNames}
              currentPlayerIndex={currentPlayerIndex}
              isMultiplayer={gameMode === "multi" && playerCount > 1}
            />
          </div>
        </main>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          players={
            // If we have server data, use it
            leaderboardData.length > 0
              ? leaderboardData
              : // If multiplayer, use player-specific stats we've tracked
              gameMode === "multi"
              ? playerNames.map((name, index) => ({
                  id: String(index + 1),
                  name: name,
                  score: playerStats[index]?.score || 0,
                  correctAnswers: playerStats[index]?.correctAnswers || 0,
                  avgTime: playerStats[index]?.averageTime || 0,
                  isCurrentUser: false, // For local multiplayer, no "current user" concept
                }))
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
            console.log("🔄 PLAY AGAIN (Leaderboard) - resetting game state");

            // Stop voice narration
            voiceService.stopAllAudio(true);
            stopSpeaking();

            // Reset game state
            resetGameState();

            // Close leaderboard modal
            setShowLeaderboard(false);

            console.log("✅ PLAY AGAIN (Leaderboard) - game reset complete");
          }}
          onClose={() => {
            // Stop voice narration before closing/navigating
            console.log("❌ Leaderboard closed - stopping voice narration");
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
                  console.log("🚪 Exit to Home - stopping voice narration");
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
            console.log("🏆 Reward modal closed - stopping voice narration");
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
    </div>
  );
};

export default Game;
