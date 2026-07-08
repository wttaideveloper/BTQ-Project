import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Play,
  Database,
  LogIn,
  LogOut,
  User,
  Users,
  Trophy,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  Target,
  BookOpen,
  Sparkles,
  Medal,
  History,
  ArrowRight,
  Swords,
  Mail,
} from "lucide-react";
import GameSetup, { GameConfig } from "@/components/GameSetup";
import TeamBattleSetup from "@/components/TeamBattleSetup";
import WelcomeTutorial from "@/components/WelcomeTutorial";
import FAQSection from "@/components/FAQSection";
import HomeActionCard from "@/components/home/HomeActionCard";
import { UserAvatar } from "@/components/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  formatDurationOptionsLabel,
  formatQuestionBasedSummary,
  resolveDefaultTimeBasedDuration,
  resolveTimeBasedDurationOptions,
  type TimeBasedDurationMinutes,
} from "@/lib/game-config";
import { useGameSettings } from "@/hooks/use-game-settings";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { User as SelectUser } from "@shared/schema";
import { voiceService } from "@/lib/voice-service";
import { stopSpeaking } from "@/lib/sounds";
import {
  getDailyVerse,
  getDailyChallenge,
  getGreeting,
  getUnfinishedGame,
} from "@/lib/home-data";
import { consumeOpenTeamBattleSetup } from "@/lib/team-battle-navigation";
import holmesImagePath from "@assets/HP HOLMES.jpg";

interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  gamesPlayed: number;
  accuracy: number;
  isCurrentUser?: boolean;
}

function formatLastLogin(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

const Home: React.FC = () => {
  const [location, setLocation] = useLocation();
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [gameSetupKey, setGameSetupKey] = useState(0);
  const [showTeamBattleSetup, setShowTeamBattleSetup] = useState(false);
  const [showRapidTeamBattleSetup, setShowRapidTeamBattleSetup] = useState(false);
  const [showWelcomeTutorial, setShowWelcomeTutorial] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showSoloDialog, setShowSoloDialog] = useState(false);
  const [isLoadingTeamBattle, setIsLoadingTeamBattle] = useState(false);
  const [isLoadingRapidFire, setIsLoadingRapidFire] = useState(false);
  const [unfinishedGame, setUnfinishedGame] = useState(
    () => getUnfinishedGame()
  );

  const { user, logoutMutation } = useAuth();
  const queryClient = useQueryClient();
  const { settings } = useGameSettings();
  const durationOptions = resolveTimeBasedDurationOptions(
    settings.timeBasedDurationOptions
  );

  const { data: profile } = useQuery<SelectUser | null>({
    queryKey: ["/api/profile"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user,
  });
  const profileUser = profile ?? user;

  const [gameType, setGameType] = useState<"question" | "time">("question");
  const [gameDuration, setGameDuration] = useState<TimeBasedDurationMinutes>(
    resolveDefaultTimeBasedDuration(durationOptions, settings.defaultTimeBasedDuration)
  );
  const [category, setCategory] = useState("All Categories");
  const [difficulty, setDifficulty] = useState("Beginner");

  useEffect(() => {
    if (!durationOptions.includes(gameDuration)) {
      setGameDuration(
        resolveDefaultTimeBasedDuration(durationOptions, settings.defaultTimeBasedDuration)
      );
    }
  }, [durationOptions, gameDuration, settings.defaultTimeBasedDuration]);

  const dailyVerse = useMemo(() => getDailyVerse(), []);
  const dailyChallenge = useMemo(() => getDailyChallenge(), []);

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ["/api/leaderboard", "all"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard?gameType=all", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const leaderboardEntries: LeaderboardEntry[] =
    leaderboardData?.data?.slice(0, 5) || [];
  const allPlayers: LeaderboardEntry[] = leaderboardData?.data || [];
  const myEntry = allPlayers.find(
    (p) =>
      p.isCurrentUser ||
      p.name === user?.username ||
      p.id === String(user?.id)
  );
  const myRank = myEntry
    ? allPlayers.findIndex(
        (p) =>
          p.isCurrentUser ||
          p.name === user?.username ||
          p.id === String(user?.id)
      ) + 1
    : null;

  useEffect(() => {
    if (!user?.id) return;
    const { shouldOpen, isRapidFire } = consumeOpenTeamBattleSetup();
    if (shouldOpen) {
      setShowRapidTeamBattleSetup(isRapidFire);
      setShowTeamBattleSetup(true);
    }
  }, [user?.id]);

  useEffect(() => {
    voiceService.stopAllAudio(true);
    stopSpeaking();
    sessionStorage.removeItem("questionRead");
    for (let i = 0; i <= 20; i++) {
      sessionStorage.removeItem(`questionRead_${i}`);
    }
    setUnfinishedGame(getUnfinishedGame());
  }, []);

  useEffect(() => {
    if (user?.id) {
      const resetTeamBattleStatus = async () => {
        try {
          await apiRequest("PATCH", `/api/users/${user.id}/team-battle-status`, {
            isInTeamBattle: false,
            gameType: null,
          });
        } catch (err) {
          console.error("[Home] Failed to reset Team Battle status:", err);
        }
      };
      resetTeamBattleStatus();
    }
  }, [user?.id]);

  useEffect(() => {
    const userId = user?.id;
    const tutorialKey = `welcomeTutorialShown_${userId || "guest"}`;
    if (!localStorage.getItem(tutorialKey)) {
      const timer = setTimeout(() => {
        setShowWelcomeTutorial(true);
        localStorage.setItem(tutorialKey, "true");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user?.id]);

  const handleStartGame = (config: GameConfig) => {
    const params = new URLSearchParams();
    Object.entries(config).forEach(([key, value]) => {
      if (key === "playerNames" && Array.isArray(value)) {
        params.append(key, encodeURIComponent(value.join(",")));
      } else if (value !== undefined) {
        params.append(key, value.toString());
      }
    });
    setLocation(`/play?${params.toString()}`);
  };

  const handleSinglePlayerStart = () => {
    handleStartGame({
      gameMode: "single",
      gameType,
      category,
      difficulty,
      playerCount: 1,
      playerNames: [user?.username || "Player 1"],
      ...(gameType === "time" ? { gameDuration } : {}),
    });
    setShowSoloDialog(false);
  };

  const handleDailyChallengeStart = () => {
    handleStartGame({
      gameMode: "single",
      gameType: dailyChallenge.gameType,
      category: dailyChallenge.category,
      difficulty: dailyChallenge.difficulty,
      playerCount: 1,
      playerNames: [user?.username || "Player 1"],
    });
  };

  const handleMultiplayerStart = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "multi");
    url.searchParams.set("gameType", gameType);
    url.searchParams.set("category", category);
    url.searchParams.set("difficulty", difficulty);
    if (gameType === "time") {
      url.searchParams.set("gameDuration", String(gameDuration));
    }
    window.history.replaceState({}, "", url.toString());
    setGameSetupKey((prev) => prev + 1);
    setShowSoloDialog(false);
    setShowGameSetup(true);
  };

  const handleContinueGame = () => {
    if (!unfinishedGame) return;
    setLocation(`/play?gameId=${unfinishedGame.gameId}`);
  };

  const clearTeamBattleCache = () => {
    queryClient.removeQueries({ queryKey: ["/api/teams"] });
    queryClient.removeQueries({ queryKey: ["/api/teams/available"] });
    queryClient.removeQueries({ queryKey: ["/api/team-invitations"] });
    queryClient.removeQueries({ queryKey: ["/api/team-join-requests"] });
    queryClient.removeQueries({ queryKey: ["/api/users/online"] });
    queryClient.removeQueries({ queryKey: ["/api/users/team-battle-available"] });
  };

  const handleEnterTeamBattle = async () => {
    setIsLoadingTeamBattle(true);
    try {
      clearTeamBattleCache();
      try {
        const response = await apiRequest("POST", "/api/team-battle/cleanup");
        await response.json();
      } catch {
        /* non-critical */
      }
      try {
        await apiRequest("PATCH", `/api/users/${user?.id}/team-battle-status`, {
          isInTeamBattle: true,
          gameType: showRapidTeamBattleSetup ? "rapid_fire" : "team_battle",
        });
      } catch (err) {
        console.error("[Home] Failed to set Team Battle status:", err);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/online"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/users/team-battle-available"],
      });
      setShowRapidTeamBattleSetup(false);
      setShowTeamBattleSetup(true);
    } catch (error) {
      console.error("[Home] Team Battle entry error:", error);
      setShowTeamBattleSetup(true);
    } finally {
      setTimeout(() => setIsLoadingTeamBattle(false), 300);
    }
  };

  const handleEnterRapidFire = async () => {
    setIsLoadingRapidFire(true);
    try {
      clearTeamBattleCache();
      try {
        await apiRequest("POST", "/api/team-battle/cleanup");
      } catch {
        /* non-critical */
      }
      setShowRapidTeamBattleSetup(true);
      setShowTeamBattleSetup(true);
    } catch (error) {
      console.error("[Home] Rapid Fire entry error:", error);
      setShowTeamBattleSetup(true);
    } finally {
      setTimeout(() => setIsLoadingRapidFire(false), 300);
    }
  };

  const stats = [
    {
      label: "Games Played",
      value: myEntry?.gamesPlayed ?? 0,
      icon: Trophy,
      iconClass: "home-stat-icon-gold",
    },
    {
      label: "Rank",
      value: myRank ? `#${myRank}` : "—",
      icon: Medal,
      iconClass: "home-stat-icon-purple",
    },
    {
      label: "Best Score",
      value: myEntry?.score ?? 0,
      icon: Sparkles,
      iconClass: "home-stat-icon-orange",
    },
    {
      label: "Accuracy",
      value: myEntry ? `${myEntry.accuracy}%` : "—",
      icon: Target,
      iconClass: "home-stat-icon-teal",
    },
  ];

  const rankIcon = (index: number) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  };

  const handleLogoClick = () => {
    if (location === "/") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setLocation("/");
  };

  return (
    <div className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] font-heading">
      {/* Header — fixed (sticky breaks when root has overflow-x:hidden) */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-[#121628]/90 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleLogoClick}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity cursor-pointer"
            aria-label="Go to dashboard"
          >
            <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-primary font-bold text-lg">F</span>
            </div>
            <span className="text-xl font-bold text-white">
              Faith<span className="text-accent">IQ</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="hidden sm:flex items-center gap-2 text-white/90 bg-white/10 px-3 py-1.5 rounded-full text-sm hover:bg-white/15 transition-colors"
                    >
                      <UserAvatar
                        profileImage={profileUser?.profileImage}
                        fullName={profileUser?.fullName}
                        username={profileUser?.username}
                        className="h-7 w-7 text-xs"
                      />
                      <span className="truncate max-w-[100px]">
                        {profileUser?.fullName || profileUser?.username}
                      </span>
                      {user.isAdmin && (
                        <Badge className="bg-accent text-primary text-[10px] px-1.5">
                          ADMIN
                        </Badge>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-64 bg-[#1a1f3a] border-white/10 text-white"
                  >
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          profileImage={profileUser?.profileImage}
                          fullName={profileUser?.fullName}
                          username={profileUser?.username}
                          className="h-10 w-10"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {profileUser?.fullName || profileUser?.username}
                          </p>
                          <p className="text-xs text-white/50 truncate">
                            @{profileUser?.username}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-white/45 mt-3">
                        Last login: {formatLastLogin(profileUser?.lastLoginAt)}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem
                      className="cursor-pointer focus:bg-white/10 focus:text-white"
                      onClick={() => setLocation("/profile")}
                    >
                      <User className="h-4 w-4 mr-2" />
                      View Profile
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="ghost"
                  className="sm:hidden text-white/80 hover:bg-white/10"
                  onClick={() => setLocation("/profile")}
                  title="My Profile"
                >
                  <User className="h-4 w-4" />
                </Button>
                {user.isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-accent hover:bg-white/10"
                    onClick={() => setLocation("/admin")}
                  >
                    <Database className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/80 hover:bg-white/10"
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="bg-accent text-primary font-semibold"
                onClick={() => setLocation("/auth")}
              >
                <LogIn className="h-4 w-4 mr-1" /> Login
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-12 pt-[4.25rem] space-y-6 sm:space-y-8 overflow-x-hidden">
        {/* Hero */}
        <section className="pt-6 sm:pt-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 lg:gap-10">
            <div className="text-center sm:text-left flex-1 min-w-0">
              <p className="text-accent font-medium text-sm sm:text-base mb-1">
                {getGreeting()}
                {user ? `, ${user.fullName || user.username}` : ""}! 👋
              </p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-3">
                Ready to test your{" "}
                <span className="text-accent">Bible knowledge</span>?
              </h1>
              <p className="text-white/80 text-base sm:text-lg max-w-xl mx-auto sm:mx-0 mb-6">
                Pick a game mode below and start playing in seconds. Great for
                solo study, friends, or team competitions.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center sm:justify-start">
                <Button
                  size="lg"
                  className="bg-accent hover:bg-accent/90 text-primary font-bold text-base px-8 h-12 rounded-xl shadow-lg shadow-accent/20"
                  onClick={() => setShowSoloDialog(true)}
                >
                  <Play className="mr-2 h-5 w-5" /> Start Solo Quiz
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="home-btn-outline h-12 rounded-xl px-8 font-semibold"
                  onClick={() => setShowWelcomeTutorial(true)}
                >
                  <HelpCircle className="mr-2 h-5 w-5" /> How It Works
                </Button>
              </div>
            </div>

            <div className="flex justify-center lg:justify-end flex-shrink-0 pb-6 lg:pb-0">
              <div className="relative text-center">
                <div
                  className="absolute inset-0 bg-accent/20 rounded-full blur-2xl scale-125 animate-pulse"
                  aria-hidden
                />
                <div className="relative z-10">
                  <img
                    src={holmesImagePath}
                    alt="Kingdom Genius Dr. HB Holmes - Bible Trivia Quiz Master"
                    className="w-36 h-36 sm:w-40 sm:h-40 md:w-44 md:h-44 object-cover rounded-full border-4 border-accent shadow-2xl mx-auto"
                  />
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-accent text-primary px-5 py-1.5 rounded-full font-bold text-sm whitespace-nowrap shadow-lg z-20">
                    Dr. HB Holmes
                  </div>
                </div>
                <p className="relative z-10 mt-8 text-sm text-white/60 max-w-[220px] mx-auto">
                  Your Bible trivia host
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        {user && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-100 fill-mode-both">
            {stats.map((stat, i) => (
              <Card
                key={stat.label}
                className="home-stat-card border-0 rounded-xl overflow-hidden transition-transform hover:scale-[1.02] duration-300"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <CardContent className="p-4 sm:p-5">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center mb-3",
                      stat.iconClass
                    )}
                  >
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-xs sm:text-sm text-white/55 mt-1 font-medium">
                    {stat.label}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {/* Continue Playing */}
        {user && unfinishedGame && (
            <section className="animate-in fade-in slide-in-from-bottom-3 duration-500 delay-150 fill-mode-both">
              <Card className="home-glass-card border-accent/30 rounded-xl overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center gap-2 text-lg">
                    <Play className="h-5 w-5 text-accent" /> Continue Playing
                  </CardTitle>
                  <CardDescription className="text-white/55">
                    Pick up where you left off
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  <button
                    type="button"
                    onClick={handleContinueGame}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-left group"
                  >
                    <div>
                      <p className="text-white font-medium text-sm">
                        Solo Quiz in progress
                      </p>
                      <p className="text-white/60 text-xs">
                        {unfinishedGame.label}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-accent group-hover:translate-x-1 transition-transform" />
                  </button>
                </CardContent>
              </Card>
            </section>
          )}

        {/* Action Cards */}
        <section>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">
            Choose Your Game
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <HomeActionCard
              title="Solo Quiz"
              description="Play on your own. Pick a category, choose your mode, and track your score."
              icon={Target}
              onClick={() => setShowSoloDialog(true)}
              accent="blue"
              delay={0}
            />
            <HomeActionCard
              title="Play with Friends"
              description={`Up to ${settings.maxPlayersPerGame} players on one device. Pass the phone and take turns — great for game night.`}
              icon={Users}
              onClick={handleMultiplayerStart}
              accent="teal"
              delay={80}
            />
            <HomeActionCard
              title="Team Battle"
              description="Two teams, live online. Invite friends, answer together, and compete to win."
              icon={Swords}
              onClick={handleEnterTeamBattle}
              loading={isLoadingTeamBattle}
              accent="purple"
              delay={160}
            />
            <HomeActionCard
              title="Rapid Fire"
              description="Team mode with quick rounds. Short questions, fast pace — perfect for a quick match."
              icon={Zap}
              onClick={handleEnterRapidFire}
              loading={isLoadingRapidFire}
              accent="gold"
              delay={240}
            />
          </div>
        </section>

        {/* Daily Verse + Daily Challenge */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="home-glass-card rounded-xl border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2 text-base sm:text-lg">
                <BookOpen className="h-5 w-5 text-accent" /> Daily Bible Verse
              </CardTitle>
            </CardHeader>
            <CardContent>
              <blockquote className="text-white/90 text-sm sm:text-base leading-relaxed italic border-l-4 border-accent pl-4">
                "{dailyVerse.text}"
              </blockquote>
              <p className="text-accent font-semibold text-sm mt-3">
                — {dailyVerse.reference}
              </p>
            </CardContent>
          </Card>

          <Card className="home-glass-card rounded-xl border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2 text-base sm:text-lg">
                <Sparkles className="h-5 w-5 text-accent" /> Daily Challenge
              </CardTitle>
              <CardDescription className="text-white/55">
                {dailyChallenge.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-white/80 text-sm">{dailyChallenge.description}</p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-white/10 text-white/85 border border-white/15 hover:bg-white/10">
                  {dailyChallenge.category}
                </Badge>
                <Badge className="bg-accent/15 text-accent border border-accent/25 hover:bg-accent/15">
                  {dailyChallenge.difficulty}
                </Badge>
              </div>
              <Button
                className="w-full bg-accent hover:bg-accent/90 text-primary font-semibold"
                onClick={handleDailyChallengeStart}
              >
                <Play className="mr-2 h-4 w-4" /> Accept Daily Challenge
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Leaderboard Preview */}
        <section>
          <Card className="home-glass-card rounded-xl">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2 text-base sm:text-lg">
                  <Trophy className="h-5 w-5 text-accent" /> Top Players
                </CardTitle>
                <CardDescription className="text-white/55">
                  Leaderboard preview
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-accent hover:text-accent hover:bg-accent/10"
                onClick={() => setLocation("/leaderboard")}
              >
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {leaderboardLoading ? (
                <div className="py-8 text-center text-white/50 text-sm">
                  Loading rankings…
                </div>
              ) : leaderboardEntries.length === 0 ? (
                <div className="py-8 text-center text-white/50 text-sm">
                  No scores yet — be the first on the board!
                </div>
              ) : (
                <ul className="space-y-2">
                  {leaderboardEntries.map((player, index) => (
                    <li
                      key={player.id || player.name}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                        player.isCurrentUser || player.name === user?.username
                          ? "bg-accent/15 border border-accent/30"
                          : "bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <span className="w-8 text-center font-bold text-white/80 text-sm">
                        {rankIcon(index)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">
                          {player.name}
                          {(player.isCurrentUser ||
                            player.name === user?.username) &&
                            " (You)"}
                        </p>
                        <p className="text-white/50 text-xs">
                          {player.gamesPlayed} games · {player.accuracy}% accuracy
                        </p>
                      </div>
                      <span className="text-accent font-bold text-sm">
                        {player.score} pts
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Footer links */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 pt-2">
          <button
            type="button"
            onClick={() => setLocation("/leaderboard")}
            className="home-action-card home-action-card--gold group flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="home-icon-gold w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Trophy className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-white text-base sm:text-lg">
                Leaderboard
              </h3>
              <p className="text-sm text-white/60 mt-0.5">
                Top players, ranks & scores
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/30 group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setLocation("/game-history")}
            className="home-action-card home-action-card--purple group flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="home-icon-purple w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <History className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-white text-base sm:text-lg">
                Game History
              </h3>
              <p className="text-sm text-white/60 mt-0.5">
                Stats, past games & progress
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/30 group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setLocation("/contact")}
            className="home-action-card home-action-card--teal group flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] sm:col-span-2 lg:col-span-1"
          >
            <div className="home-icon-teal w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Mail className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-white text-base sm:text-lg">
                Contact Us
              </h3>
              <p className="text-sm text-white/60 mt-0.5">
                Support, feedback & questions
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/30 group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </section>

        {/* FAQ */}
        <Collapsible open={showFAQ} onOpenChange={setShowFAQ} className="mt-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="home-glass-card w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl text-left transition-all duration-300 hover:border-accent/30 group"
            >
              <div className="home-icon-gold w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md">
                <HelpCircle className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-white text-base sm:text-lg">
                  Help & FAQ
                </h3>
                <p className="text-sm text-white/55 mt-0.5">
                  Game modes, scoring & tips
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-white/40 group-hover:text-accent transition-all shrink-0",
                  showFAQ && "rotate-180 text-accent"
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <FAQSection
              onOpenTutorial={() => setShowWelcomeTutorial(true)}
              onContact={() => setLocation("/contact")}
            />
          </CollapsibleContent>
        </Collapsible>

        <footer className="text-center text-white/40 text-xs py-4 space-y-2">
          <button
            type="button"
            onClick={() => setLocation("/contact")}
            className="text-white/50 hover:text-accent transition-colors underline-offset-2 hover:underline"
          >
            Contact & Support
          </button>
          <p>© {new Date().getFullYear()} FaithIQ. All rights reserved.</p>
        </footer>
      </main>

      {/* Solo Quiz Config Dialog */}
      <Dialog open={showSoloDialog} onOpenChange={setShowSoloDialog}>
        <DialogContent className="bg-[#1e2445] border-white/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Solo Quiz Setup</DialogTitle>
            <DialogDescription className="text-white/60">
              Choose your settings, then start playing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/15">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">
                Play Mode
              </p>
              <p className="text-white font-semibold text-sm">Solo Quiz</p>
              <p className="text-xs text-accent mt-0.5">
                {gameType === "question"
                  ? "Question-Based"
                  : `Time-Based · ${gameDuration} min`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">
                Player
              </p>
              <p className="text-white font-semibold text-sm">
                {profileUser?.username || "Player 1"}
              </p>
            </div>
          </div>

          <div className="space-y-5 py-2">
            <div>
              <Label className="text-white/90 mb-2 block">Game Type</Label>
              <RadioGroup
                value={gameType}
                onValueChange={(v) => setGameType(v as "question" | "time")}
                className="space-y-2"
              >
                <div className="flex items-center gap-3 p-3 rounded-lg border border-white/20 bg-white/5 cursor-pointer">
                  <RadioGroupItem
                    value="question"
                    id="dlg-question"
                    className="h-5 w-5 shrink-0 border-2 border-white/60 text-accent focus-visible:ring-accent data-[state=checked]:border-accent"
                  />
                  <Label htmlFor="dlg-question" className="cursor-pointer flex-1">
                    <span className="font-medium">Question-Based</span>
                    <p className="text-xs text-white/60">{formatQuestionBasedSummary(settings)}</p>
                  </Label>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-white/20 bg-white/5 cursor-pointer">
                  <RadioGroupItem
                    value="time"
                    id="dlg-time"
                    className="h-5 w-5 shrink-0 border-2 border-white/60 text-accent focus-visible:ring-accent data-[state=checked]:border-accent"
                  />
                  <Label htmlFor="dlg-time" className="cursor-pointer flex-1">
                    <span className="font-medium">Time-Based</span>
                    <p className="text-xs text-white/60">
                      Speed round — {formatDurationOptionsLabel(durationOptions)}
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {gameType === "time" && (
              <div>
                <Label className="text-white/90 mb-2 block">Round Duration</Label>
                <div className="grid grid-cols-3 gap-2">
                  {durationOptions.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setGameDuration(mins)}
                      className={cn(
                        "py-2.5 rounded-lg border text-sm font-semibold transition-colors",
                        gameDuration === mins
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
                      )}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-white/90 mb-2 block">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-white/10 border-white/25 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Categories">All Categories</SelectItem>
                  <SelectItem value="Old Testament">Old Testament</SelectItem>
                  <SelectItem value="New Testament">New Testament</SelectItem>
                  <SelectItem value="Bible Stories">Bible Stories</SelectItem>
                  <SelectItem value="Famous People">Famous People</SelectItem>
                  <SelectItem value="Theme-Based">Theme-Based</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white/90 mb-2 block">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="bg-white/10 border-white/25 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="w-full bg-accent hover:bg-accent/90 text-primary font-bold h-11"
                onClick={handleSinglePlayerStart}
              >
                <Play className="mr-2 h-4 w-4" /> Start Solo Quiz
              </Button>
              <Button
                variant="outline"
                className="w-full home-btn-outline h-11 font-semibold"
                onClick={handleMultiplayerStart}
              >
                <Users className="mr-2 h-4 w-4" /> Play with Friends
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showGameSetup && (
        <GameSetup
          key={gameSetupKey}
          onStartGame={handleStartGame}
          onClose={() => setShowGameSetup(false)}
        />
      )}

      {showTeamBattleSetup && (
        <TeamBattleSetup
          open={showTeamBattleSetup}
          onClose={() => {
            setShowTeamBattleSetup(false);
            setShowRapidTeamBattleSetup(false);
          }}
          gameType={gameType}
          category={category}
          difficulty={difficulty}
          isRapidFire={showRapidTeamBattleSetup}
        />
      )}

      <WelcomeTutorial
        isOpen={showWelcomeTutorial}
        onClose={() => setShowWelcomeTutorial(false)}
        onStartGame={() => {
          setShowWelcomeTutorial(false);
          setShowSoloDialog(true);
        }}
      />
    </div>
  );
};

export default Home;
