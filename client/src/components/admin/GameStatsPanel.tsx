import React, { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  CheckCircle,
  Download,
  FileText,
  RefreshCw,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";
import { RecentActivityFeed } from "@/components/admin/RecentActivityFeed";
import { buildGameStatsCsv, downloadCsv } from "@/lib/csv-export";

type DashboardStats = {
  totalUsers: number;
  totalQuestions: number;
  soloGames: number;
  multiGames: number;
  teamBattlesTotal: number;
  teamBattlesFinished: number;
  teamBattlesActive: number;
  avgSoloScore: number;
  soloGamesLast24h: number;
  leaderboardPlayers: number;
};

function StatCard({
  label,
  value,
  subtext,
  icon,
  gradient,
  iconBg,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
}) {
  return (
    <Card className={`border-0 shadow-sm ${gradient}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {subtext && (
              <p className="text-xs mt-1 opacity-70">{subtext}</p>
            )}
          </div>
          <div
            className={`h-12 w-12 rounded-xl flex items-center justify-center ${iconBg}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type ActivityResponse = {
  items: Array<{
    type: string;
    title: string;
    subtitle: string;
    timestamp: string;
    meta: Record<string, string | number | null>;
  }>;
};

export function GameStatsPanel() {
  const [isExporting, setIsExporting] = useState(false);

  const {
    data: stats,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard-stats"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 30000,
  });

  const { data: activityData } = useQuery<ActivityResponse>({
    queryKey: ["/api/admin/recent-activity", "30d"],
    queryFn: async () => {
      const res = await fetch("/api/admin/recent-activity?range=30d", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const totalQuizGames = (stats?.soloGames ?? 0) + (stats?.multiGames ?? 0);

  const handleExportCsv = useCallback(async () => {
    if (!stats) return;

    setIsExporting(true);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fallbackFilename = `faithiq-game-stats-${dateStamp}.csv`;

    try {
      const res = await fetch("/api/admin/game-stats/export?limit=100", {
        credentials: "include",
      });

      if (res.ok) {
        const csv = await res.text();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        downloadCsv(csv, match?.[1] ?? fallbackFilename);
        return;
      }

      const activityItems = activityData?.items ?? [];
      downloadCsv(buildGameStatsCsv(stats, activityItems), fallbackFilename);
    } catch {
      const activityItems = activityData?.items ?? [];
      downloadCsv(buildGameStatsCsv(stats, activityItems), fallbackFilename);
    } finally {
      setIsExporting(false);
    }
  }, [stats, activityData?.items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Platform Overview
          </h2>
          <p className="text-sm text-gray-500">
            Live counts from users, questions, and game activity
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={isExporting || isLoading || !stats}
            className="flex items-center gap-2"
          >
            <Download className={`h-4 w-4 ${isExporting ? "animate-pulse" : ""}`} />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : isError || !stats ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-10 w-10 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600 font-medium">
              Failed to load statistics
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Registered Users"
              value={stats.totalUsers}
              subtext={`${stats.leaderboardPlayers} on leaderboard`}
              gradient="bg-gradient-to-br from-blue-50 to-blue-100 text-blue-800"
              iconBg="bg-blue-500 text-white"
              icon={<Users className="h-6 w-6" />}
            />
            <StatCard
              label="Questions in Bank"
              value={stats.totalQuestions}
              gradient="bg-gradient-to-br from-purple-50 to-purple-100 text-purple-800"
              iconBg="bg-purple-500 text-white"
              icon={<FileText className="h-6 w-6" />}
            />
            <StatCard
              label="Quiz Games Played"
              value={totalQuizGames}
              subtext={`${stats.soloGames} solo · ${stats.multiGames} multiplayer`}
              gradient="bg-gradient-to-br from-green-50 to-green-100 text-green-800"
              iconBg="bg-green-500 text-white"
              icon={<CheckCircle className="h-6 w-6" />}
            />
            <StatCard
              label="Avg. Solo Score"
              value={stats.avgSoloScore}
              subtext={`${stats.soloGamesLast24h} solo games in last 24h`}
              gradient="bg-gradient-to-br from-amber-50 to-amber-100 text-amber-800"
              iconBg="bg-amber-500 text-white"
              icon={<Trophy className="h-6 w-6" />}
            />
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Swords className="h-5 w-5 text-indigo-500" />
                Team Battles
              </CardTitle>
              <CardDescription>
                Team battle sessions tracked in the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-sm text-gray-500">Total sessions</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.teamBattlesTotal}
                  </p>
                </div>
                <div className="rounded-xl bg-green-50 px-4 py-3">
                  <p className="text-sm text-green-600">Finished</p>
                  <p className="text-2xl font-bold text-green-800">
                    {stats.teamBattlesFinished}
                  </p>
                </div>
                <div className="rounded-xl bg-orange-50 px-4 py-3">
                  <p className="text-sm text-orange-600">Active now</p>
                  <p className="text-2xl font-bold text-orange-800">
                    {stats.teamBattlesActive}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <RecentActivityFeed />
        </>
      )}
    </div>
  );
}
