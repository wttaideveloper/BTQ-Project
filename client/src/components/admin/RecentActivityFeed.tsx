import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getQueryFn } from "@/lib/queryClient";
import {
  Activity,
  RefreshCw,
  Swords,
  UserPlus,
  Users,
} from "lucide-react";

type ActivityType = "signup" | "solo_game" | "multi_game" | "team_battle";

type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
};

type ActivityFilter = "all" | ActivityType;

const FILTER_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "signup", label: "Signups" },
  { value: "solo_game", label: "Solo" },
  { value: "multi_game", label: "Multiplayer" },
  { value: "team_battle", label: "Team Battles" },
];

function ActivityIcon({ type }: { type: ActivityType }) {
  switch (type) {
    case "signup":
      return <UserPlus className="h-4 w-4 text-blue-500" />;
    case "solo_game":
      return <Activity className="h-4 w-4 text-green-500" />;
    case "multi_game":
      return <Users className="h-4 w-4 text-purple-500" />;
    case "team_battle":
      return <Swords className="h-4 w-4 text-indigo-500" />;
  }
}

function typeBadgeClass(type: ActivityType) {
  switch (type) {
    case "signup":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "solo_game":
      return "bg-green-50 text-green-700 border-green-200";
    case "multi_game":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "team_battle":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
}

function typeLabel(type: ActivityType) {
  switch (type) {
    case "signup":
      return "Signup";
    case "solo_game":
      return "Solo";
    case "multi_game":
      return "Multiplayer";
    case "team_battle":
      return "Team Battle";
  }
}

function formatRelativeTime(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleString();
}

export function RecentActivityFeed() {
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const { data = [], isLoading, isError, refetch, isFetching } = useQuery<
    ActivityItem[]
  >({
    queryKey: ["/api/admin/recent-activity"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    if (filter === "all") return data;
    return data.filter((item) => item.type === filter);
  }, [data, filter]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Recent Activity
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === option.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-7 w-7 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : isError ? (
          <div className="text-center py-10 text-gray-500">
            <p className="mb-3">Failed to load activity feed</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center py-10 text-gray-500">
            No recent activity yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="mt-0.5 h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <ActivityIcon type={item.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900">{item.title}</p>
                    <Badge
                      variant="outline"
                      className={typeBadgeClass(item.type)}
                    >
                      {typeLabel(item.type)}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 truncate">
                    {item.description}
                  </p>
                </div>
                <time
                  className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0"
                  dateTime={item.timestamp}
                  title={new Date(item.timestamp).toLocaleString()}
                >
                  {formatRelativeTime(item.timestamp)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
