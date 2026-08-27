import { type ReactNode } from "react";
import { CalendarDays, CheckCircle2, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamAvatar } from "@/components/championship/TeamAvatar";
import {
  formatKickoffSpotlight,
  isMatchReadyToStart,
  matchDisplayState,
  matchTimingLabel,
  pickAdminMatchSpotlight,
  type ChampionshipMatchSummary,
  type ChampionshipTeamSummary,
  type MatchDisplayState,
} from "@/lib/championship";

const matchStatusLabel: Record<MatchDisplayState, string> = {
  upcoming: "Upcoming",
  ready: "Ready to start",
  live: "Live match",
  completed: "Completed",
};
const matchStatusStyle: Record<MatchDisplayState, string> = {
  upcoming: "bg-sky-100 text-sky-800 border-sky-200",
  ready: "bg-amber-100 text-amber-800 border-amber-200",
  live: "bg-red-100 text-red-700 border-red-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function SpotlightStatusBadge({ status }: { status: MatchDisplayState }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${matchStatusStyle[status]}`}>
      {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />}
      {matchStatusLabel[status]}
    </span>
  );
}

export function NextMatchCard({
  matches,
  teams,
  autoStartEnabled,
  championshipStatus,
  renderActions,
  onScheduleMatch,
  onAutoSchedule,
  autoScheduleDisabled,
}: {
  matches: ChampionshipMatchSummary[];
  teams: ChampionshipTeamSummary[];
  autoStartEnabled: boolean;
  championshipStatus: string;
  renderActions: (match: ChampionshipMatchSummary) => ReactNode;
  onScheduleMatch: () => void;
  onAutoSchedule: () => void;
  autoScheduleDisabled: boolean;
}) {
  const spotlight = pickAdminMatchSpotlight(matches);
  const teamById = (id: string) => teams.find(team => team.id === id);

  if (spotlight.type === "empty") {
    return (
      <section aria-labelledby="championship-next-match-heading" className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <h3 id="championship-next-match-heading" className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-600">
          <CalendarDays size={15} aria-hidden="true" /> No matches scheduled
        </h3>
        <p className="mt-2 text-sm text-slate-600">Create a match manually or use Auto Schedule to build the championship schedule.</p>
        <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
          <Button onClick={onScheduleMatch}><Plus size={16} /> Schedule Match</Button>
          <Button variant="outline" disabled={autoScheduleDisabled} onClick={onAutoSchedule}>
            <Zap size={16} /> Auto Schedule
          </Button>
        </div>
      </section>
    );
  }

  if (spotlight.type === "all-completed") {
    return (
      <section aria-labelledby="championship-next-match-heading" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h3 id="championship-next-match-heading" className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-800">
          <CheckCircle2 size={15} aria-hidden="true" /> No upcoming matches
        </h3>
        <p className="mt-2 text-sm text-emerald-900">All scheduled matches have been completed.</p>
      </section>
    );
  }

  const match = spotlight.match;
  const teamA = teamById(match.teamAId);
  const teamB = teamById(match.teamBId);
  const display = matchDisplayState(match);
  const isLive = spotlight.type === "live";
  const heading = isLive ? "Live now" : "Next match";
  const kickoff = formatKickoffSpotlight(match.scheduledAt);
  const ready = isMatchReadyToStart(match);
  const teamAName = teamA?.name ?? "Team A";
  const teamBName = teamB?.name ?? "Team B";
  const autoStartLine = championshipStatus !== "active"
    ? null
    : autoStartEnabled && match.scheduledAt
      ? "Automatically starts at scheduled time"
      : "Admin start required";

  return (
    <section
      aria-labelledby="championship-next-match-heading"
      aria-label={isLive
        ? `Live now: ${teamAName} versus ${teamBName}`
        : `Next match: ${teamAName} versus ${teamBName}`}
      className={`overflow-hidden rounded-2xl border shadow-sm ${isLive
        ? "border-red-200 bg-gradient-to-r from-red-50 to-rose-50"
        : "border-amber-200/60 bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-950"}`}
    >
      <div className="p-4 sm:p-5">
        <h3
          id="championship-next-match-heading"
          className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] ${isLive ? "text-red-700" : "text-amber-300"}`}
        >
          {isLive
            ? <><span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" aria-hidden="true" /> {heading}</>
            : <><Zap size={14} className="shrink-0 text-amber-300" aria-hidden="true" /> {heading}</>}
        </h3>

        <div className="mt-4 grid min-w-0 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <p className={`flex min-w-0 items-center justify-center gap-2 text-center text-base font-black sm:justify-end sm:text-lg ${isLive ? "text-slate-900" : "text-white"}`}>
            <TeamAvatar logoUrl={teamA?.logoUrl} emoticon={teamA?.emoticon} alt={`${teamAName} logo`} className="h-8 w-8 shrink-0" />
            <span className="min-w-0 break-words">{teamAName}</span>
          </p>
          <p className={`text-center text-xs font-black tracking-widest ${isLive ? "text-slate-400" : "text-amber-200"}`} aria-hidden="true">VS</p>
          <p className={`flex min-w-0 items-center justify-center gap-2 text-center text-base font-black sm:justify-start sm:text-lg ${isLive ? "text-slate-900" : "text-white"}`}>
            <TeamAvatar logoUrl={teamB?.logoUrl} emoticon={teamB?.emoticon} alt={`${teamBName} logo`} className="h-8 w-8 shrink-0" />
            <span className="min-w-0 break-words">{teamBName}</span>
          </p>
        </div>
        <span className="sr-only">{`${teamAName} versus ${teamBName}`}</span>

        {isLive ? (
          <p className="mt-4 text-center text-3xl font-black tabular-nums text-slate-900" aria-label={`Score ${match.teamAScore} to ${match.teamBScore}`}>
            {match.teamAScore} <span className="text-slate-400" aria-hidden="true">:</span> {match.teamBScore}
          </p>
        ) : kickoff ? (
          <p className="mt-4 text-center text-sm font-semibold text-indigo-100">{kickoff}</p>
        ) : (
          <p className="mt-4 text-center text-sm font-semibold text-indigo-200">Time to be announced</p>
        )}

        <div className="mt-3 flex flex-col items-center gap-2 text-center">
          <SpotlightStatusBadge status={display} />
          {isLive ? (
            <p className="text-sm font-semibold text-red-800">{matchTimingLabel(match) ?? "Live match"}</p>
          ) : (
            <>
              {autoStartLine && (
                <p className="text-xs text-indigo-200">
                  {autoStartEnabled && match.scheduledAt ? <Zap size={12} className="mr-1 inline" aria-hidden="true" /> : null}
                  {autoStartLine}
                </p>
              )}
              {ready && championshipStatus !== "active" && (
                <p className="text-xs text-amber-200">Scheduled time has arrived</p>
              )}
            </>
          )}
        </div>

        <div className={`mt-4 flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center ${isLive ? "" : "text-slate-900 [&_a]:text-slate-900 [&_a]:shrink-0 [&_button]:shrink-0"}`}>
          {renderActions(match)}
        </div>
      </div>
    </section>
  );
}
