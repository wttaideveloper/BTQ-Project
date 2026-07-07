import React, { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Award,
  Download,
  Medal,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { buildLeaderboardCsv, downloadCsv } from "@/lib/csv-export";

interface LeaderboardPlayer {
  id: string;
  name: string;
  score: number;
  gamesPlayed: number;
  correctAnswers: number;
  incorrectAnswers: number;
  accuracy: number;
}

type GameType = "all" | "single" | "multi";

function getPlayerRank(index: number) {
  if (index === 0) return "gold";
  if (index === 1) return "silver";
  if (index === 2) return "bronze";
  return "none";
}

function RankIcon({ rank }: { rank: string }) {
  switch (rank) {
    case "gold":
      return <Trophy className="h-5 w-5 text-yellow-500" />;
    case "silver":
      return <Medal className="h-5 w-5 text-gray-400" />;
    case "bronze":
      return <Award className="h-5 w-5 text-amber-700" />;
    default:
      return null;
  }
}

export function AdminLeaderboardPanel() {
  const [gameType, setGameType] = useState<GameType>("all");
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/leaderboard", gameType],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?gameType=${gameType}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    refetchInterval: gameType === "multi" ? 10000 : 30000,
    staleTime: 30000,
  });

  const players: LeaderboardPlayer[] = data?.data ?? [];
  const lastUpdated = data?.metadata?.timestamp
    ? new Date(data.metadata.timestamp).toLocaleString()
    : null;

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fallbackFilename = `faithiq-leaderboard-${gameType}-${dateStamp}.csv`;

    try {
      const res = await fetch(
        `/api/admin/leaderboard/export?gameType=${gameType}`,
        { credentials: "include" }
      );

      if (res.ok) {
        const csv = await res.text();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        downloadCsv(csv, match?.[1] ?? fallbackFilename);
        return;
      }

      if (players.length > 0) {
        downloadCsv(buildLeaderboardCsv(players, gameType), fallbackFilename);
      }
    } catch {
      if (players.length > 0) {
        downloadCsv(buildLeaderboardCsv(players, gameType), fallbackFilename);
      }
    } finally {
      setIsExporting(false);
    }
  }, [gameType, players]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Leaderboard</h2>
          <p className="text-sm text-gray-500">
            Top performers across solo and multiplayer quiz games
            {lastUpdated && (
              <span className="block text-xs text-gray-400 mt-1">
                Last updated: {lastUpdated}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={isExporting || (players.length === 0 && !isLoading)}
            className="flex items-center gap-2"
          >
            <Download className={`h-4 w-4 ${isExporting ? "animate-pulse" : ""}`} />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs
        value={gameType}
        onValueChange={(value) => setGameType(value as GameType)}
      >
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="all">All Games</TabsTrigger>
          <TabsTrigger value="single">Single Player</TabsTrigger>
          <TabsTrigger value="multi">Multiplayer</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-gray-600 font-medium mb-4">
              Failed to load leaderboard
            </p>
            <Button variant="outline" onClick={handleRefresh}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : players.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-gray-500">
            No players on the leaderboard yet.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[80px]">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right hidden sm:table-cell">
                  Correct
                </TableHead>
                <TableHead className="text-right hidden sm:table-cell">
                  Wrong
                </TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player, index) => (
                <TableRow key={player.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <RankIcon rank={getPlayerRank(index)} />
                      <span className="font-semibold text-gray-900">
                        #{index + 1}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{player.name}</TableCell>
                  <TableCell className="text-right font-semibold text-blue-600">
                    {player.score}
                  </TableCell>
                  <TableCell className="text-right">
                    {player.gamesPlayed}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell text-green-600">
                    {player.correctAnswers}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell text-red-500">
                    {player.incorrectAnswers}
                  </TableCell>
                  <TableCell className="text-right">
                    {player.accuracy}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
            Showing {players.length} player{players.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
