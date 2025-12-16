import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";

// NOTE: Multiplayer functionality is disabled for this POC
// Will be implemented in the next iteration
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import holmesImagePath from "@assets/HP HOLMES.jpg";
import {
  Play,
  Settings,
  Sword,
  Award,
  Database,
  LogIn,
  LogOut,
  User,
  Users,
  Trophy,
  Bell,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import GameSetup, { GameConfig } from "@/components/GameSetup";
import TeamBattleSetup from "@/components/TeamBattleSetup";
import WelcomeTutorial from "@/components/WelcomeTutorial";
import FAQSection from "@/components/FAQSection";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Challenge, Notification } from "@shared/schema";
import { voiceService } from "@/lib/voice-service";
import { stopSpeaking } from "@/lib/sounds";

const Home: React.FC = () => {
  const [_, setLocation] = useLocation();
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [gameSetupKey, setGameSetupKey] = useState(0);
  const [showTeamBattleSetup, setShowTeamBattleSetup] = useState(false);
  const [showWelcomeTutorial, setShowWelcomeTutorial] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [titleEffect, setTitleEffect] = useState(false);
  const { user, logoutMutation } = useAuth();

  // Game configuration state
  const [gameType, setGameType] = useState<"question" | "time">("question");
  const [category, setCategory] = useState("Bible Stories");
  const [difficulty, setDifficulty] = useState("Beginner");

  // Get pending challenges count to display as a badge
  const { data: challenges } = useQuery({
    queryKey: ["/api/challenges"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/challenges");
      return await res.json();
    },
    enabled: !!user,
  });

  // Get unread notifications count
  const { data: notifications } = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications");
      return await res.json();
    },
    enabled: !!user,
  });

  // Count pending challenges and unread notifications
  const pendingChallenges =
    challenges?.filter((c: Challenge) => c.status === "pending") || [];
  const unreadNotifications =
    notifications?.filter((n: Notification) => !n.read) || [];

  // Clean up voice narration when entering home page
  useEffect(() => {
    console.log("🏠 Home component mounted - stopping all voice narration");
    voiceService.stopAllAudio(true); // Block future narration
    stopSpeaking();

    // Clear all question read flags from session storage
    sessionStorage.removeItem("questionRead");
    for (let i = 0; i <= 20; i++) {
      sessionStorage.removeItem(`questionRead_${i}`);
    }
  }, []);

  // Animation effect for the title - Family Feud style flashing
  useEffect(() => {
    const interval = setInterval(() => {
      setTitleEffect((prev) => !prev);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // Show welcome tutorial once per user account
  useEffect(() => {
    const userId = user?.id;
    const tutorialKey = `welcomeTutorialShown_${userId || "guest"}`;
    const hasSeenTutorial = localStorage.getItem(tutorialKey);

    if (!hasSeenTutorial) {
      // Small delay to ensure page is fully loaded
      const timer = setTimeout(() => {
        setShowWelcomeTutorial(true);
        localStorage.setItem(tutorialKey, "true");
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user?.id]);

  const handleStartGame = (config: GameConfig) => {
    // Convert config to query params
    const params = new URLSearchParams();

    // Handle special case for playerNames array
    Object.entries(config).forEach(([key, value]) => {
      if (key === "playerNames" && Array.isArray(value)) {
        params.append(key, encodeURIComponent(value.join(",")));
      } else {
        params.append(key, value.toString());
      }
    });

    // Route to /play for game experience
    setLocation(`/play?${params.toString()}`);
  };

  const handleSinglePlayerStart = () => {
    // Start single player game with selected configuration
    const config: GameConfig = {
      gameMode: "single",
      gameType,
      category,
      difficulty,
      playerCount: 1,
      playerNames: [user?.username || "Player 1"],
    };

    handleStartGame(config);
  };

  const handleMultiplayerStart = () => {
    // Open multiplayer setup modal with selected configuration
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "multi");
    url.searchParams.set("gameType", gameType);
    url.searchParams.set("category", category);
    url.searchParams.set("difficulty", difficulty);
    window.history.replaceState({}, "", url.toString());
    setGameSetupKey((prev) => prev + 1);
    setShowGameSetup(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-secondary-dark font-heading overflow-x-hidden max-w-full">
      {/* Header with Auth Controls */}
      <header className="relative w-full py-5 px-3 sm:py-6 sm:px-4 md:px-6 max-w-full">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 sm:gap-4 min-w-0">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
              <span className="text-primary font-bold text-xl">F</span>
            </div>
            <h1 className="text-2xl font-bold text-white">
              Faith<span className="text-accent">IQ</span>
            </h1>
          </div>

          {/* Auth Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2 text-white bg-black/20 px-2 sm:px-3 py-2 rounded-lg min-w-0">
                  <User size={16} className="flex-shrink-0" />
                  <span className="font-medium truncate max-w-[100px] sm:max-w-none">{user.username}</span>
                  {user.isAdmin && (
                    <span className="bg-accent text-primary text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">
                      ADMIN
                    </span>
                  )}
                </div>
                {user.isAdmin && (
                  <Button
                    onClick={() => setLocation("/admin")}
                    variant="outline"
                    size="sm"
                    className="border-accent/50 text-accent bg-black/20 hover:bg-accent/10 whitespace-nowrap flex-shrink-0"
                  >
                    <Database size={16} className="mr-1 flex-shrink-0" /> <span className="hidden sm:inline">Admin</span>
                  </Button>
                )}
                <Button
                  onClick={() => logoutMutation.mutate()}
                  variant="outline"
                  size="sm"
                  className="border-white/30 text-white bg-black/20 hover:bg-white/10 whitespace-nowrap flex-shrink-0"
                >
                  <LogOut size={16} className="mr-1 flex-shrink-0" /> <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setLocation("/auth")}
                variant="outline"
                size="sm"
                className="border-white/30 text-white bg-black/20 hover:bg-white/10 whitespace-nowrap flex-shrink-0"
              >
                <LogIn size={16} className="mr-1 flex-shrink-0" /> <span className="hidden sm:inline">Login</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative w-full py-10 px-3 sm:py-16 sm:px-4 md:px-6 max-w-full overflow-x-hidden">
        <div className="max-w-7xl mx-auto text-center min-w-0">
          {/* Animated Title */}
          <div
            className={`mb-8 transition-all duration-700 ${
              titleEffect ? "scale-105" : "scale-100"
            }`}
          >
            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight">
              Faith<span className="text-accent drop-shadow-lg">IQ</span>
            </h1>
            <div className="w-full max-w-2xl mx-auto h-2 bg-white/20 rounded-full overflow-hidden mb-6">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent/70 animate-pulse rounded-full"
                style={{ width: "75%" }}
              ></div>
            </div>
            <p className="text-base sm:text-xl md:text-2xl text-white/90 font-light max-w-3xl mx-auto leading-relaxed px-2">
              Test your Bible knowledge with the ultimate trivia experience
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8 sm:py-12 min-w-0 overflow-x-hidden">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center min-w-0">
          {/* Left Column - Game Options */}
          <div className="space-y-8">
            {/* Host Avatar */}
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-accent/20 rounded-full filter blur-xl animate-pulse"></div>
              <img
                src={holmesImagePath}
                alt="Kingdom Genius Dr. HB Holmes - Bible Trivia Quiz Master"
                className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-full border-4 border-accent shadow-2xl z-10 relative mx-auto"
              />
              <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-accent to-accent/80 text-primary px-6 z-50 py-2 rounded-full font-bold text-sm whitespace-nowrap shadow-lg">
                Dr. HB Holmes
              </div>
            </div>

            {/* Game Configuration */}
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold text-white text-center lg:text-left">
                Configure Your Game
              </h2>

              {/* Game Configuration Card */}
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="space-y-5">
                  {/* Game Type Selection */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Label className="text-white font-semibold text-base">
                        Game Type
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-white/60 hover:text-accent hover:scale-110 cursor-help transition-all duration-200" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm p-4 bg-gradient-to-br from-slate-900 to-slate-800 border border-accent/30 shadow-xl rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center">
                              <HelpCircle className="h-3 w-3 text-accent" />
                            </div>
                            <h4 className="font-semibold text-white text-sm">
                              Game Type Guide
                            </h4>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                              <div>
                                <p className="text-accent font-medium text-xs">
                                  Question-Based
                                </p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                  Answer 10 questions at your own pace. Perfect
                                  for learning!
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                              <div>
                                <p className="text-accent font-medium text-xs">
                                  Time-Based
                                </p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                  Race against time! Answer as many questions as
                                  possible in 15 minutes.
                                </p>
                              </div>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <RadioGroup
                      value={gameType}
                      onValueChange={(value) =>
                        setGameType(value as "question" | "time")
                      }
                      className="space-y-2"
                    >
                      <div className="flex items-center p-3 border border-white/30 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition-all">
                        <RadioGroupItem
                          value="question"
                          id="question"
                          className="mr-3 border-white text-accent"
                        />
                        <Label
                          htmlFor="question"
                          className="cursor-pointer flex-1 text-white"
                        >
                          <p className="font-medium">Question-Based</p>
                          <p className="text-sm text-white/70">
                            Take your time answering 10 Bible questions. Perfect
                            for learning!
                          </p>
                        </Label>
                      </div>
                      <div className="flex items-center p-3 border border-white/30 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition-all">
                        <RadioGroupItem
                          value="time"
                          id="time"
                          className="mr-3 border-white text-accent"
                        />
                        <Label
                          htmlFor="time"
                          className="cursor-pointer flex-1 text-white"
                        >
                          <p className="font-medium">Time-Based</p>
                          <p className="text-sm text-white/70">
                            Race against time! Answer as many questions as you
                            can in 15 minutes for maximum excitement!
                          </p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Category Selection */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Label className="text-white font-semibold text-base">
                        Category
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-white/60 hover:text-accent hover:scale-110 cursor-help transition-all duration-200" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm p-4 bg-gradient-to-br from-slate-900 to-slate-800 border border-accent/30 shadow-xl rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center">
                              <HelpCircle className="h-3 w-3 text-accent" />
                            </div>
                            <h4 className="font-semibold text-white text-sm">
                              Bible Categories
                            </h4>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                              <div>
                                <p className="text-accent font-medium text-xs">
                                  All Categories
                                </p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                  Mix of everything for variety
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                              <div>
                                <p className="text-accent font-medium text-xs">
                                  Old/New Testament
                                </p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                  Focus on specific biblical sections
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                              <div>
                                <p className="text-accent font-medium text-xs">
                                  Bible Stories & People
                                </p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                  Famous stories and key biblical figures
                                </p>
                              </div>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="w-full p-3 bg-white/10 border-white/30 text-white hover:bg-white/20">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All Categories">
                          All Categories
                        </SelectItem>
                        <SelectItem value="Old Testament">
                          Old Testament
                        </SelectItem>
                        <SelectItem value="New Testament">
                          New Testament
                        </SelectItem>
                        <SelectItem value="Bible Stories">
                          Bible Stories
                        </SelectItem>
                        <SelectItem value="Famous People">
                          Famous People
                        </SelectItem>
                        <SelectItem value="Theme-Based">Theme-Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Difficulty Selection */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Label className="text-white font-semibold text-base">
                        Difficulty
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-white/60 hover:text-accent hover:scale-110 cursor-help transition-all duration-200" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm p-4 bg-gradient-to-br from-slate-900 to-slate-800 border border-accent/30 shadow-xl rounded-lg">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center">
                              <HelpCircle className="h-3 w-3 text-accent" />
                            </div>
                            <h4 className="font-semibold text-white text-sm">
                              Difficulty Levels
                            </h4>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                              <div>
                                <p className="text-green-400 font-medium text-xs">
                                  Beginner
                                </p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                  Easier questions, perfect for learning
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                              <div>
                                <p className="text-yellow-400 font-medium text-xs">
                                  Intermediate
                                </p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                  Moderate difficulty for growing knowledge
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                              <div>
                                <p className="text-red-400 font-medium text-xs">
                                  Advanced
                                </p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                  Challenging questions for Bible experts
                                </p>
                              </div>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger className="w-full p-3 bg-white/10 border-white/30 text-white hover:bg-white/20">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Beginner">Beginner</SelectItem>
                        <SelectItem value="Intermediate">
                          Intermediate
                        </SelectItem>
                        <SelectItem value="Advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Game Mode Cards */}
              <div className="space-y-4">
                {/* Single Player Card */}
                <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:border-accent/50 transition-all duration-300 hover:shadow-2xl hover:shadow-accent/20">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                        <Play className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold text-white">
                            Single Player
                          </h3>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-white/60 hover:text-accent hover:scale-110 cursor-help transition-all duration-200" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm p-4 bg-gradient-to-br from-slate-900 to-slate-800 border border-accent/30 shadow-xl rounded-lg">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center">
                                  <Play className="h-3 w-3 text-accent" />
                                </div>
                                <h4 className="font-semibold text-white text-sm">
                                  Single Player Mode
                                </h4>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Answer questions at your own pace
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Earn rewards and track progress
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    No pressure from time limits
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Perfect for Bible study
                                  </p>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-white/70 text-sm">
                          Learn at your own pace, earn rewards, and track your
                          progress
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleSinglePlayerStart}
                      className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-primary font-bold px-4 sm:px-6 py-3 whitespace-nowrap flex-shrink-0"
                    >
                      <Play className="mr-2 h-4 w-4 flex-shrink-0" /> Start
                    </Button>
                  </div>
                </div>

                {/* Multiplayer Card */}
                <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:border-secondary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-secondary/20">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
                        <Sword className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold text-white">
                            Multiplayer
                          </h3>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-white/60 hover:text-accent hover:scale-110 cursor-help transition-all duration-200" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm p-4 bg-gradient-to-br from-slate-900 to-slate-800 border border-accent/30 shadow-xl rounded-lg">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 bg-secondary/20 rounded-full flex items-center justify-center">
                                  <Users className="h-3 w-3 text-secondary" />
                                </div>
                                <h4 className="font-semibold text-white text-sm">
                                  Multiplayer Mode
                                </h4>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Up to 3 players on one device
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Take turns answering questions
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Share the excitement together
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Perfect for family game night
                                  </p>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-white/70 text-sm">
                          Play with friends! Take turns answering questions
                          together on one device
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleMultiplayerStart}
                      className="w-full sm:w-auto bg-secondary hover:bg-secondary/90 text-white font-bold px-4 sm:px-6 py-3 whitespace-nowrap flex-shrink-0"
                    >
                      <Sword className="mr-2 h-4 w-4 flex-shrink-0" /> Play
                    </Button>
                  </div>
                </div>

                {/* Team Battle Card */}
                <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:border-secondary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-secondary/20">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
                        <Sword className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold text-white">
                            Team Battle
                          </h3>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-white/60 hover:text-accent hover:scale-110 cursor-help transition-all duration-200" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm p-4 bg-gradient-to-br from-slate-900 to-slate-800 border border-accent/30 shadow-xl rounded-lg">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 bg-secondary/20 rounded-full flex items-center justify-center">
                                  <Trophy className="h-3 w-3 text-secondary" />
                                </div>
                                <h4 className="font-semibold text-white text-sm">
                                  Team Battle Mode
                                </h4>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Two teams of 3 players each
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Real-time multiplayer action
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Work together to win
                                  </p>
                                </div>
                                <div className="flex items-start gap-2">
                                  <div className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></div>
                                  <p className="text-gray-300 text-xs leading-relaxed">
                                    Most exciting game mode
                                  </p>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-white/70 text-sm">
                          Two teams compete in real-time multiplayer action
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => setShowTeamBattleSetup(true)}
                      className="w-full sm:w-auto bg-secondary hover:bg-secondary/90 text-white font-bold px-4 sm:px-6 py-3 whitespace-nowrap flex-shrink-0"
                    >
                      <Sword className="mr-2 h-4 w-4 flex-shrink-0" /> <span className="hidden sm:inline">Enter Team Battle</span><span className="sm:hidden">Team Battle</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Rewards & Stats */}
          <div className="space-y-6 sm:space-y-8">
            {/* Rewards Section */}
            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 border border-white/20">
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-4 sm:mb-6 text-center">
                🏆 Earn Rewards
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:gap-4">
                <div className="bg-gradient-to-r from-accent/20 to-accent/10 rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-center space-x-3 sm:space-x-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-base sm:text-lg">
                      5
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm sm:text-base">
                      Free Book
                    </p>
                    <p className="text-white/60 text-xs sm:text-sm">
                      Get 5 correct answers
                    </p>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-secondary/20 to-secondary/10 rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-center space-x-3 sm:space-x-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-base sm:text-lg">
                      9
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm sm:text-base">
                      FaithIQ Cap
                    </p>
                    <p className="text-white/60 text-xs sm:text-sm">
                      Get 9 correct answers
                    </p>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-accent/20 to-accent/10 rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-center space-x-3 sm:space-x-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-base sm:text-lg">
                      12
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm sm:text-base">
                      T-Shirt
                    </p>
                    <p className="text-white/60 text-xs sm:text-sm">
                      Perfect score!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3 sm:space-y-4">
              <Button
                onClick={() => setLocation("/leaderboard")}
                className="w-full bg-gradient-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent/70 text-primary font-bold py-3 sm:py-4 text-sm sm:text-base md:text-lg transition-all duration-300 whitespace-nowrap min-w-0"
              >
                <Trophy className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" /> <span className="truncate">View Leaderboard</span>
              </Button>

              {user && (
                <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 border border-white/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/80 text-xs sm:text-sm truncate">
                      Welcome back, {user.username}!
                    </span>
                    <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
                      {unreadNotifications.length > 0 && (
                        <Badge
                          variant="destructive"
                          className="px-1.5 sm:px-2 text-xs"
                        >
                          {unreadNotifications.length}
                        </Badge>
                      )}
                      <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/60" />
                    </div>
                  </div>
                </div>
              )}

              {/* FAQ Section */}
              <Collapsible open={showFAQ} onOpenChange={setShowFAQ}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full bg-gradient-to-r from-white/5 to-white/10 hover:from-white/10 hover:to-white/15 text-white border border-white/20 py-3 sm:py-4 text-sm sm:text-base md:text-lg font-medium transition-all duration-300"
                  >
                    <HelpCircle className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="truncate">Help & FAQ</span>
                    <ChevronDown
                      className={`ml-auto h-4 w-4 transition-transform duration-300 ${
                        showFAQ ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 sm:mt-3">
                  <FAQSection />
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 sm:py-6 md:py-8 px-3 sm:px-4 md:px-6 border-t border-white/10 mt-8 max-w-full overflow-x-hidden">
        <div className="max-w-7xl mx-auto text-center min-w-0">
          <p className="text-white/60 text-xs sm:text-sm">
            © {new Date().getFullYear()} FaithIQ. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Game Setup Modal */}
      {showGameSetup && (
        <GameSetup key={gameSetupKey} onStartGame={handleStartGame} />
      )}
      {/* Team Battle Setup Modal */}
      {showTeamBattleSetup && (
        <TeamBattleSetup
          open={showTeamBattleSetup}
          onClose={() => setShowTeamBattleSetup(false)}
          gameType={gameType}
          category={category}
          difficulty={difficulty}
        />
      )}

      {/* Welcome Tutorial Modal */}
      <WelcomeTutorial
        isOpen={showWelcomeTutorial}
        onClose={() => setShowWelcomeTutorial(false)}
        onStartGame={handleSinglePlayerStart}
      />
    </div>
  );
};

export default Home;
