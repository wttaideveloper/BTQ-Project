import React, { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Trophy,
  Target,
  TrendingUp,
  BarChart3,
  Calendar,
  ArrowLeft,
  RefreshCw,
  Medal,
  Award,
  User,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  formatAverageAnswerTime,
  getScoreCategory,
  getScoreDifficulty,
  mostPlayedLabel,
  type ScoreHistoryRow,
} from "@/lib/game-stats";

interface ScoreRecord extends ScoreHistoryRow {
  id: string;
  user_id: number;
  player_name: string;
  score: number;
  correct_answers: number;
  incorrect_answers: number;
  average_time: string;
  category: string;
  difficulty: string;
  game_type: string;
  total_questions: number;
  time_limit?: number | null;
  timestamp: string;
}

interface LeaderboardPlayer {
  id: string;
  name: string;
  score: number;
  gamesPlayed: number;
  accuracy: number;
  isCurrentUser?: boolean;
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function accuracyPct(correct: number, incorrect: number) {
  const total = correct + incorrect;
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

export default function GameHistory() {
  const [_, setLocation] = useLocation();
  const { user } = useAuth();

  const {
    data: scores = [],
    isLoading: scoresLoading,
    refetch: refetchScores,
    isFetching: scoresFetching,
  } = useQuery<ScoreRecord[]>({
    queryKey: ["/api/single-player/scores"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/single-player/scores");
      return res.json();
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    refetch: refetchLeaderboard,
    isFetching: leaderboardFetching,
  } = useQuery({
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
  });

  const players: LeaderboardPlayer[] = leaderboardData?.data ?? [];

  const recentScores = useMemo(
    () =>
      [...scores].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [scores]
  );

  const stats = useMemo(() => {
    const totalGames = scores.length;
    const totalScore = scores.reduce((sum, s) => sum + (s.score ?? 0), 0);
    const bestScore = scores.reduce(
      (max, s) => Math.max(max, s.score ?? 0),
      0
    );
    const averageScore = totalGames ? totalScore / totalGames : 0;
    const totalCorrect = scores.reduce(
      (sum, s) => sum + (s.correct_answers ?? 0),
      0
    );
    const totalIncorrect = scores.reduce(
      (sum, s) => sum + (s.incorrect_answers ?? 0),
      0
    );
    const accuracy = accuracyPct(totalCorrect, totalIncorrect);

    const myEntry = players.find(
      (p) =>
        p.isCurrentUser ||
        p.name === user?.username ||
        p.id === String(user?.id)
    );
    const rank = myEntry
      ? players.findIndex(
          (p) =>
            p.isCurrentUser ||
            p.name === user?.username ||
            p.id === String(user?.id)
        ) + 1
      : null;

    const lastGame = recentScores[0];
    const lastGameAvgTime = lastGame?.average_time
      ? parseFloat(lastGame.average_time)
      : 0;

    const favoriteCategory = mostPlayedLabel(recentScores, "category");
    const favoriteDifficulty = mostPlayedLabel(recentScores, "difficulty");

    return {
      totalGames,
      bestScore,
      averageScore,
      accuracy,
      totalScore,
      favoriteCategory: favoriteCategory.label,
      favoriteCategoryCount: favoriteCategory.count,
      favoriteDifficulty: favoriteDifficulty.label,
      favoriteDifficultyCount: favoriteDifficulty.count,
      rank,
      globalPlayers: leaderboardData?.metadata?.totalPlayers ?? players.length,
      lastScore: lastGame?.score ?? null,
      lastScoreAvgTime: Number.isFinite(lastGameAvgTime) ? lastGameAvgTime : 0,
    };
  }, [scores, players, user, leaderboardData, recentScores]);

  const isLoading = scoresLoading || leaderboardLoading;
  const isRefreshing = scoresFetching || leaderboardFetching;

  const rankIcon = (index: number) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  };

  const handleRefresh = () => {
    refetchScores();
    refetchLeaderboard();
  };

  if (isLoading) {
    return (
      <div className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Games",
      value: stats.totalGames,
      icon: Trophy,
      iconClass: "home-stat-icon-gold",
    },
    {
      label: "Last Score",
      value: stats.lastScore ?? "—",
      detail:
        stats.lastScore != null && stats.lastScoreAvgTime > 0
          ? `${formatAverageAnswerTime(stats.lastScoreAvgTime)} avg`
          : undefined,
      icon: TrendingUp,
      iconClass: "home-stat-icon-purple",
    },
    {
      label: "Accuracy",
      value: `${stats.accuracy}%`,
      icon: Target,
      iconClass: "home-stat-icon-teal",
    },
    {
      label: "Your Rank",
      value: stats.rank ? `#${stats.rank}` : "—",
      icon: Medal,
      iconClass: "home-stat-icon-orange",
    },
  ];

  return (
    <div className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] font-heading">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            className="home-btn-outline"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Home
          </Button>
          <Button
            variant="ghost"
            className="text-white/80 hover:text-white hover:bg-white/10"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {/* Header */}
        <div className="text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Game Statistics &{" "}
            <span className="text-accent">History</span>
          </h1>
          <p className="text-white/70 text-base sm:text-lg">
            Track your progress and compete with other players
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map((stat) => (
            <Card
              key={stat.label}
              className="home-stat-card border-0 rounded-xl"
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
                {"detail" in stat && stat.detail && (
                  <p className="text-[11px] sm:text-xs text-accent/90 mt-0.5 font-medium">
                    {stat.detail}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Detail cards */}
        <div className="grid gap-4">
          <Card className="home-glass-card rounded-xl border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-accent" /> Your Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 text-center sm:text-left">
              <div>
                <p className="text-2xl font-bold text-white">
                  {stats.bestScore}
                </p>
                <p className="text-white/55 text-sm">Best Score</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {stats.lastScore ?? "—"}
                </p>
                <p className="text-white/55 text-sm">
                  Last Score
                  {stats.lastScoreAvgTime > 0
                    ? ` · ${formatAverageAnswerTime(stats.lastScoreAvgTime)} avg`
                    : ""}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold text-white truncate">
                  {stats.favoriteCategory}
                </p>
                <p className="text-white/55 text-sm">
                  Most Played Category
                  {stats.favoriteCategoryCount > 0
                    ? ` · ${stats.favoriteCategoryCount} game${stats.favoriteCategoryCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
              <div>
                <p className="text-lg font-semibold text-white">
                  {stats.favoriteDifficulty}
                </p>
                <p className="text-white/55 text-sm">
                  Most Played Difficulty
                  {stats.favoriteDifficultyCount > 0
                    ? ` · ${stats.favoriteDifficultyCount} game${stats.favoriteDifficultyCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-[#1a2038] border border-white/10 p-1 rounded-xl h-auto">
            <TabsTrigger
              value="history"
              className="rounded-lg data-[state=active]:bg-accent data-[state=active]:text-primary text-white/70 py-2.5"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Game History
            </TabsTrigger>
            <TabsTrigger
              value="leaderboard"
              className="rounded-lg data-[state=active]:bg-accent data-[state=active]:text-primary text-white/70 py-2.5"
            >
              <Trophy className="h-4 w-4 mr-2" />
              Leaderboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-4">
            <Card className="home-glass-card rounded-xl">
              <CardHeader>
                <CardTitle className="text-white">Recent Games</CardTitle>
                <CardDescription className="text-white/55">
                  Your solo quiz sessions, newest first
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scores.length === 0 ? (
                  <div className="text-center py-12">
                    <Trophy className="h-12 w-12 text-white/20 mx-auto mb-4" />
                    <p className="text-white/60 mb-4">No games played yet</p>
                    <Button
                      className="bg-accent hover:bg-accent/90 text-primary font-semibold"
                      onClick={() => setLocation("/")}
                    >
                      Play Your First Quiz
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentScores.map((game) => {
                      const acc = accuracyPct(
                        game.correct_answers,
                        game.incorrect_answers
                      );
                      return (
                        <div
                          key={game.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-white font-semibold">
                                {game.score} pts
                              </span>
                              <Badge className="bg-accent/15 text-accent border-accent/25 text-xs">
                                {getScoreCategory(game)}
                              </Badge>
                              <Badge className="bg-white/10 text-white/80 border-white/15 text-xs">
                                {getScoreDifficulty(game)}
                              </Badge>
                              <Badge className="bg-white/10 text-white/70 border-white/15 text-xs capitalize">
                                {game.game_type}
                              </Badge>
                            </div>
                            <p className="text-white/50 text-xs">
                              {formatDate(game.timestamp)} · {game.correct_answers}/
                              {game.correct_answers + game.incorrect_answers} correct
                              {game.average_time
                                ? ` · ${formatAverageAnswerTime(parseFloat(game.average_time))} avg`
                                : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {game.average_time &&
                              parseFloat(game.average_time) > 0 && (
                                <span className="px-2.5 py-1 rounded-md text-sm font-medium bg-yellow-500/15 text-yellow-300">
                                  {formatAverageAnswerTime(
                                    parseFloat(game.average_time)
                                  )}{" "}
                                  avg
                                </span>
                              )}
                            <span
                              className={cn(
                                "px-2.5 py-1 rounded-md text-sm font-medium",
                                acc >= 80
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : acc >= 50
                                    ? "bg-amber-500/20 text-amber-300"
                                    : "bg-red-500/20 text-red-300"
                              )}
                            >
                              {acc}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-4">
            <Card className="home-glass-card rounded-xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Award className="h-5 w-5 text-accent" />
                  Global Leaderboard
                </CardTitle>
                <CardDescription className="text-white/55">
                  {stats.globalPlayers} players · sorted by best score
                </CardDescription>
              </CardHeader>
              <CardContent>
                {players.length === 0 ? (
                  <p className="text-center text-white/50 py-8">
                    No leaderboard data yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-white/70">Rank</TableHead>
                          <TableHead className="text-white/70">Player</TableHead>
                          <TableHead className="text-white/70 text-right">
                            Score
                          </TableHead>
                          <TableHead className="text-white/70 text-right">
                            Games
                          </TableHead>
                          <TableHead className="text-white/70 text-right">
                            Accuracy
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {players.map((player, index) => {
                          const isYou =
                            player.isCurrentUser ||
                            player.name === user?.username;
                          return (
                            <TableRow
                              key={player.id || player.name}
                              className={cn(
                                "border-white/10",
                                isYou
                                  ? "bg-accent/10 hover:bg-accent/15"
                                  : "hover:bg-white/5"
                              )}
                            >
                              <TableCell className="font-bold text-white">
                                {rankIcon(index)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                    <User className="h-4 w-4 text-white/70" />
                                  </div>
                                  <span
                                    className={cn(
                                      "text-white",
                                      isYou && "text-accent font-semibold"
                                    )}
                                  >
                                    {player.name}
                                    {isYou && " (You)"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-accent font-bold">
                                {player.score}
                              </TableCell>
                              <TableCell className="text-right text-white/80">
                                {player.gamesPlayed}
                              </TableCell>
                              <TableCell className="text-right">
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded text-sm",
                                    player.accuracy >= 80
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : player.accuracy >= 50
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-red-500/20 text-red-300"
                                  )}
                                >
                                  {player.accuracy}%
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
