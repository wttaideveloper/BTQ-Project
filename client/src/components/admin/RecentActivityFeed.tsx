import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  Swords,
  Target,
  Trophy,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

type ActivityType = "signup" | "solo_game" | "multi_game" | "team_battle";

type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  timestamp: string;
  meta: Record<string, string | number | null>;
};

type ActivityResponse = {
  items: ActivityItem[];
  summary: {
    total: number;
    signups: number;
    soloGames: number;
    multiGames: number;
    teamBattles: number;
    lastUpdated: string;
  };
};

type ActivityFilter = "all" | ActivityType;

type ActivityTimeRange = "24h" | "7d" | "30d" | "all";

const TIME_RANGES: Array<{ value: ActivityTimeRange; label: string }> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const TIME_RANGE_LABELS: Record<ActivityTimeRange, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  all: "all time",
};

const TYPE_CONFIG: Record<
  ActivityType,
  {
    label: string;
    summaryLabel: string;
    icon: React.ReactNode;
    badge: string;
    iconBg: string;
    border: string;
  }
> = {
  signup: {
    label: "Signup",
    summaryLabel: "Signups",
    icon: <UserPlus className="h-4 w-4" />,
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    iconBg: "bg-blue-100 text-blue-600",
    border: "border-l-blue-500",
  },
  solo_game: {
    label: "Solo",
    summaryLabel: "Solo games",
    icon: <Target className="h-4 w-4" />,
    badge: "bg-green-50 text-green-700 border-green-200",
    iconBg: "bg-green-100 text-green-600",
    border: "border-l-green-500",
  },
  multi_game: {
    label: "Multiplayer",
    summaryLabel: "Multiplayer",
    icon: <Users className="h-4 w-4" />,
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    iconBg: "bg-purple-100 text-purple-600",
    border: "border-l-purple-500",
  },
  team_battle: {
    label: "Team Battle",
    summaryLabel: "Team battles",
    icon: <Swords className="h-4 w-4" />,
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    iconBg: "bg-indigo-100 text-indigo-600",
    border: "border-l-indigo-500",
  },
};

function formatRelativeTime(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatExactTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDateGroup(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const itemDay = new Date(date);
  itemDay.setHours(0, 0, 0, 0);

  if (itemDay.getTime() === today.getTime()) return "Today";
  if (itemDay.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function MetaChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "danger" | "score";
}) {
  const toneClass =
    tone === "success"
      ? "bg-green-50 text-green-700 border-green-100"
      : tone === "danger"
        ? "bg-red-50 text-red-700 border-red-100"
        : tone === "score"
          ? "bg-amber-50 text-amber-800 border-amber-100"
          : "bg-gray-50 text-gray-700 border-gray-100";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${toneClass}`}
    >
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function ActivityDetails({ item }: { item: ActivityItem }) {
  const { meta, type } = item;

  if (type === "signup") {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        <MetaChip label="@" value={String(meta.username ?? "—")} />
        {meta.email ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-gray-100 bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
            <Mail className="h-3 w-3 text-gray-400" />
            {String(meta.email)}
          </span>
        ) : null}
      </div>
    );
  }

  if (type === "solo_game" || type === "multi_game") {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        <MetaChip label="Score" value={Number(meta.score ?? 0)} tone="score" />
        {meta.accuracy != null ? (
          <MetaChip label="Accuracy" value={`${meta.accuracy}%`} />
        ) : null}
        <MetaChip
          label="Correct"
          value={Number(meta.correctAnswers ?? 0)}
          tone="success"
        />
        <MetaChip
          label="Wrong"
          value={Number(meta.incorrectAnswers ?? 0)}
          tone="danger"
        />
        {meta.category ? (
          <MetaChip label="Category" value={String(meta.category)} />
        ) : null}
        {meta.difficulty ? (
          <MetaChip label="Level" value={String(meta.difficulty)} />
        ) : null}
        {type === "multi_game" && meta.playerCount ? (
          <MetaChip label="Players" value={Number(meta.playerCount)} />
        ) : null}
        {meta.totalQuestions ? (
          <MetaChip label="Questions" value={Number(meta.totalQuestions)} />
        ) : null}
      </div>
    );
  }

  if (type === "team_battle") {
    const status = String(meta.status ?? "forming");
    const statusLabel =
      status === "finished"
        ? "Completed"
        : status === "playing"
          ? "Live"
          : status === "ready"
            ? "Ready"
            : "Lobby";

    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        <MetaChip
          label="Score"
          value={`${meta.teamAScore ?? 0} – ${meta.teamBScore ?? 0}`}
          tone="score"
        />
        <MetaChip label="Status" value={statusLabel} />
        {meta.teamAName ? (
          <MetaChip label="Team A" value={String(meta.teamAName)} />
        ) : null}
        {meta.teamBName ? (
          <MetaChip label="Team B" value={String(meta.teamBName)} />
        ) : null}
        {meta.winner ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-100 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            <Trophy className="h-3 w-3" />
            {meta.winner === "Draw" ? "Draw" : `Winner: ${meta.winner}`}
          </span>
        ) : null}
        {meta.category ? (
          <MetaChip label="Category" value={String(meta.category)} />
        ) : null}
        {meta.difficulty ? (
          <MetaChip label="Level" value={String(meta.difficulty)} />
        ) : null}
      </div>
    );
  }

  return null;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const config = TYPE_CONFIG[item.type];

  return (
    <article
      className={`rounded-xl border border-gray-100 border-l-4 ${config.border} bg-white p-4 shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex gap-3">
        <div
          className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.iconBg}`}
        >
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-gray-900">{item.title}</h4>
                <Badge variant="outline" className={config.badge}>
                  {config.label}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-0.5">{item.subtitle}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-medium text-gray-500">
                {formatRelativeTime(item.timestamp)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5 flex items-center justify-end gap-1">
                <Clock className="h-3 w-3" />
                {formatExactTime(item.timestamp)}
              </p>
            </div>
          </div>
          <ActivityDetails item={item} />
        </div>
      </div>
    </article>
  );
}

export function RecentActivityFeed() {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [timeRange, setTimeRange] = useState<ActivityTimeRange>("7d");

  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<ActivityResponse & { range?: ActivityTimeRange }>({
      queryKey: ["/api/admin/recent-activity", timeRange],
      queryFn: async () => {
        const res = await fetch(
          `/api/admin/recent-activity?range=${timeRange}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );
        if (!res.ok) throw new Error("Failed to fetch activity");
        return res.json();
      },
      refetchInterval: 30000,
      staleTime: 0,
    });

  const items = data?.items ?? [];
  const summary = data?.summary;

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.type === filter);
  }, [items, filter]);

  const grouped = useMemo(() => {
    const groups: { label: string; items: ActivityItem[] }[] = [];
    for (const item of filtered) {
      const label = getDateGroup(item.timestamp);
      const existing = groups.find((g) => g.label === label);
      if (existing) existing.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [filtered]);

  const filterCounts: Record<ActivityFilter, number> = {
    all: summary?.total ?? items.length,
    signup: summary?.signups ?? 0,
    solo_game: summary?.soloGames ?? 0,
    multi_game: summary?.multiGames ?? 0,
    team_battle: summary?.teamBattles ?? 0,
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Recent Activity
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Live feed of signups, quiz games, and team battles
              {summary?.lastUpdated && (
                <span className="block text-xs text-gray-400 mt-0.5">
                  Updated {formatRelativeTime(summary.lastUpdated)}
                </span>
              )}
            </p>
          </div>
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
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-4">
          <span className="text-xs font-medium text-gray-500 mr-1">Period</span>
          {TIME_RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTimeRange(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                timeRange === value
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!isLoading && !isError && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-4">
            {(
              [
                ["all", "All events", filterCounts.all],
                ["signup", TYPE_CONFIG.signup.summaryLabel, filterCounts.signup],
                ["solo_game", TYPE_CONFIG.solo_game.summaryLabel, filterCounts.solo_game],
                ["multi_game", TYPE_CONFIG.multi_game.summaryLabel, filterCounts.multi_game],
                ["team_battle", TYPE_CONFIG.team_battle.summaryLabel, filterCounts.team_battle],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-xl border px-3 py-2 text-left transition-all ${
                  filter === key
                    ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                    : "border-gray-100 bg-gray-50 hover:border-gray-200"
                }`}
              >
                <p className="text-lg font-bold text-gray-900">{count}</p>
                <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-500">Loading activity feed…</p>
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-gray-500">
            <XCircle className="h-10 w-10 mx-auto text-red-300 mb-3" />
            <p className="font-medium text-gray-700 mb-1">
              Could not load activity
            </p>
            <p className="text-sm mb-4">Check your connection and try again.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CheckCircle2 className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-700 mb-1">
              {filter === "all"
                ? timeRange === "all"
                  ? "No activity yet"
                  : `No activity in the last ${TIME_RANGE_LABELS[timeRange]}`
                : timeRange === "all"
                  ? `No ${TYPE_CONFIG[filter as ActivityType]?.summaryLabel.toLowerCase() ?? "events"} yet`
                  : `No ${TYPE_CONFIG[filter as ActivityType]?.summaryLabel.toLowerCase() ?? "events"} in the last ${TIME_RANGE_LABELS[timeRange]}`}
            </p>
            <p className="text-sm">
              Try a longer period or wait for users to sign up and play games.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.label}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 sticky top-0 bg-white/95 py-1 backdrop-blur-sm">
                  {group.label}
                  <span className="ml-2 font-normal normal-case text-gray-400">
                    ({group.items.length})
                  </span>
                </h3>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
