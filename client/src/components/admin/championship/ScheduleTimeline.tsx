import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, List, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { TeamAvatar } from "@/components/championship/TeamAvatar";
import {
  formatKickoffTime,
  groupMatchesForScheduleTimeline,
  matchDisplayState,
  UNSCHEDULED_SCHEDULE_KEY,
  type ChampionshipMatchSummary,
  type ChampionshipTeamSummary,
  type MatchDisplayState,
} from "@/lib/championship";

type TimelineFilter = "all" | "upcoming" | "live" | "completed";
type TimelineView = "list" | "calendar";

const matchStatusLabel: Record<MatchDisplayState, string> = {
  upcoming: "Upcoming",
  ready: "Ready to start",
  live: "Live now",
  completed: "Completed",
};
const matchStatusStyle: Record<MatchDisplayState, string> = {
  upcoming: "bg-sky-100 text-sky-800 border-sky-200",
  ready: "bg-amber-100 text-amber-800 border-amber-200",
  live: "bg-red-100 text-red-700 border-red-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
const filterLabels: { id: TimelineFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "live", label: "Live" },
  { id: "completed", label: "Completed" },
];

function TimelineStatusBadge({ status }: { status: MatchDisplayState }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${matchStatusStyle[status]}`}>
    {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />}
    {matchStatusLabel[status]}
  </span>;
}

function matchesFilter(match: ChampionshipMatchSummary, filter: TimelineFilter): boolean {
  if (filter === "all") return true;
  if (filter === "upcoming") return match.status === "upcoming";
  if (filter === "live") return match.status === "live";
  return match.status === "completed";
}

function localDayFromKey(key: string): Date | null {
  if (key === UNSCHEDULED_SCHEDULE_KEY) return null;
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function ScheduleTimeline({
  matches,
  teams,
  championshipStatus,
  autoStartEnabled,
  renderActions,
  onScheduleMatch,
  onAutoSchedule,
  autoScheduleDisabled,
}: {
  matches: ChampionshipMatchSummary[];
  teams: ChampionshipTeamSummary[];
  championshipStatus: string;
  autoStartEnabled: boolean;
  renderActions: (match: ChampionshipMatchSummary) => ReactNode;
  onScheduleMatch: () => void;
  onAutoSchedule: () => void;
  autoScheduleDisabled: boolean;
}) {
  const [view, setView] = useState<TimelineView>("list");
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const teamById = (id: string) => teams.find(team => team.id === id);

  const filteredMatches = useMemo(
    () => matches.filter(match => matchesFilter(match, filter)),
    [matches, filter],
  );
  const groups = useMemo(
    () => groupMatchesForScheduleTimeline(filteredMatches),
    [filteredMatches],
  );
  const scheduledDays = useMemo(
    () => groups.flatMap(group => {
      const date = localDayFromKey(group.key);
      return date ? [date] : [];
    }),
    [groups],
  );
  const liveDays = useMemo(
    () => groups.flatMap(group => {
      if (!group.matches.some(match => match.status === "live")) return [];
      const date = localDayFromKey(group.key);
      return date ? [date] : [];
    }),
    [groups],
  );
  const calendarGroups = useMemo(() => {
    if (view !== "calendar" || !selectedDay) return groups;
    const key = `${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, "0")}-${String(selectedDay.getDate()).padStart(2, "0")}`;
    return groups.filter(group => group.key === key);
  }, [groups, selectedDay, view]);
  const visibleGroups = view === "calendar" ? calendarGroups : groups;

  const emptyActions = (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:justify-center">
      <Button onClick={onScheduleMatch}><Plus size={16} /> Schedule Match</Button>
      <Button variant="outline" disabled={autoScheduleDisabled} onClick={onAutoSchedule}>
        <Zap size={16} /> Auto Schedule
      </Button>
    </div>
  );

  return (
    <section id="championship-schedule-timeline" className="scroll-mt-4 rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <CalendarDays size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900">Schedule Timeline</h3>
            <p className="mt-0.5 text-sm text-slate-500">Every fixture in kick-off order, grouped by local date.</p>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end">
          <div role="group" aria-label="Schedule view" className="grid grid-cols-2 rounded-lg border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={view === "list" ? "default" : "ghost"}
              className="w-full"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={15} /> List
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "calendar" ? "default" : "ghost"}
              className="w-full"
              aria-pressed={view === "calendar"}
              onClick={() => {
                setView("calendar");
                if (!selectedDay) setSelectedDay(scheduledDays[0] ?? new Date());
              }}
            >
              <CalendarDays size={15} /> Calendar
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {matches.length > 0 && (
          <div role="radiogroup" aria-label="Filter schedule" className="flex flex-wrap gap-2">
            {filterLabels.map(item => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={filter === item.id ? "default" : "outline"}
                role="radio"
                aria-checked={filter === item.id}
                className="min-h-9"
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        )}

        {matches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center">
            <CalendarDays className="mx-auto text-slate-400" size={26} />
            <p className="mt-3 font-semibold text-slate-700">No matches scheduled yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Create a match manually or use Auto Schedule to build the championship schedule.
            </p>
            <div className="mt-4 flex justify-center">{emptyActions}</div>
          </div>
        ) : view === "calendar" ? (
          <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
            <Calendar
              mode="single"
              selected={selectedDay}
              onSelect={setSelectedDay}
              modifiers={{ scheduled: scheduledDays, live: liveDays }}
              modifiersClassNames={{
                scheduled: "font-bold text-amber-800",
                live: "ring-2 ring-red-500",
              }}
              className="rounded-xl border bg-white"
            />
            <div className="min-w-0">
              {visibleGroups.length === 0
                ? <p className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No matches on this date.</p>
                : visibleGroups.map(group => (
                    <DayGroup
                      key={group.key}
                      group={group}
                      teamById={teamById}
                      championshipStatus={championshipStatus}
                      autoStartEnabled={autoStartEnabled}
                      renderActions={renderActions}
                    />
                  ))}
            </div>
          </div>
        ) : visibleGroups.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No matches match this filter.</p>
        ) : (
          <div className="space-y-8">
            {visibleGroups.map(group => (
              <DayGroup
                key={group.key}
                group={group}
                teamById={teamById}
                championshipStatus={championshipStatus}
                autoStartEnabled={autoStartEnabled}
                renderActions={renderActions}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DayGroup({
  group,
  teamById,
  championshipStatus,
  autoStartEnabled,
  renderActions,
}: {
  group: ReturnType<typeof groupMatchesForScheduleTimeline>[number];
  teamById: (id: string) => ChampionshipTeamSummary | undefined;
  championshipStatus: string;
  autoStartEnabled: boolean;
  renderActions: (match: ChampionshipMatchSummary) => ReactNode;
}) {
  return (
    <section>
      <header className="mb-4 border-b border-slate-200 pb-2">
        <h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-800">{group.label}</h4>
        {group.sublabel && <p className="mt-0.5 text-xs text-slate-500">{group.sublabel}</p>}
      </header>
      <ol className="space-y-0">
        {group.matches.map((match, index) => (
          <TimelineItem
            key={match.id}
            match={match}
            isLast={index === group.matches.length - 1}
            teamById={teamById}
            championshipStatus={championshipStatus}
            autoStartEnabled={autoStartEnabled}
            renderActions={renderActions}
          />
        ))}
      </ol>
    </section>
  );
}

function TimelineItem({
  match,
  isLast,
  teamById,
  championshipStatus,
  autoStartEnabled,
  renderActions,
}: {
  match: ChampionshipMatchSummary;
  isLast: boolean;
  teamById: (id: string) => ChampionshipTeamSummary | undefined;
  championshipStatus: string;
  autoStartEnabled: boolean;
  renderActions: (match: ChampionshipMatchSummary) => ReactNode;
}) {
  const teamA = teamById(match.teamAId);
  const teamB = teamById(match.teamBId);
  const display = matchDisplayState(match);
  const timeLabel = formatKickoffTime(match.scheduledAt);
  const dotClass = display === "live"
    ? "bg-red-600"
    : display === "completed"
      ? "bg-emerald-500"
      : display === "ready"
        ? "bg-amber-500"
        : "bg-slate-400";

  return (
    <li>
      <p className="mb-2 text-sm font-black tabular-nums text-slate-900 sm:hidden">
        {timeLabel ?? "TBA"}
      </p>
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[5.75rem_1.25rem_minmax(0,1fr)]">
        <p className="hidden pt-1 text-sm font-black tabular-nums text-slate-900 sm:block sm:text-right">
          {timeLabel ?? "TBA"}
        </p>
        <div className="flex flex-col items-center" aria-hidden="true">
          <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${dotClass}`} />
          {!isLast && <span className="w-px flex-1 bg-slate-200" />}
        </div>
        <div className={`min-w-0 pb-5 ${isLast ? "pb-1" : ""}`}>
          <article className={`min-w-0 rounded-xl border bg-white p-4 ${display === "live" ? "border-red-200 shadow-sm" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-base font-bold leading-snug text-slate-900">
                <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
                  <TeamAvatar logoUrl={teamA?.logoUrl} emoticon={teamA?.emoticon} alt={`${teamA?.name ?? "Team A"} logo`} className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 break-words">{teamA?.name ?? "Team A"}</span>
                </span>
                {" "}
                <span className="text-slate-400">vs</span>
                {" "}
                <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
                  <TeamAvatar logoUrl={teamB?.logoUrl} emoticon={teamB?.emoticon} alt={`${teamB?.name ?? "Team B"} logo`} className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 break-words">{teamB?.name ?? "Team B"}</span>
                </span>
              </p>
              <TimelineStatusBadge status={display} />
            </div>
            {display === "live" && <p className="mt-2 text-xs font-bold uppercase tracking-wide text-red-700">Live now</p>}
            {match.status === "completed" && (
              <p className="mt-2 text-sm font-semibold text-emerald-700">
                {match.teamAScore} – {match.teamBScore}
                {match.winnerTeamId
                  ? ` · Winner: ${teamById(match.winnerTeamId)?.name ?? "—"}`
                  : " · Draw"}
              </p>
            )}
            {match.status === "upcoming" && display === "ready" && championshipStatus === "active" && (
              <p className="mt-2 text-xs text-amber-800">
                {autoStartEnabled
                  ? "Automatic start at scheduled time"
                  : "Scheduled time has arrived"}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {renderActions(match)}
            </div>
          </article>
        </div>
      </div>
    </li>
  );
}
