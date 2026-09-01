/**
 * Pure Championship Auto Schedule planner.
 *
 * Preview and generate both call this module.  The planner deliberately does
 * not make up a match duration: it uses the administrator's minimum team rest
 * as the cadence between planned starts and, more importantly, as a hard
 * per-team availability rule.  Auto Start and actual game completion remain
 * responsible for the real match lifecycle.
 */

export const AUTO_SCHEDULE_DEFAULTS = {
  minimumTeamRestMinutes: 30,
  matchesPerDay: 1,
} as const;

/** Default scheduling window closes at 10 PM local time. */
export const AUTO_SCHEDULE_DAILY_WINDOW_END_HOUR = 22;
export const SKIPPED_REASON = "Already scheduled";
export const PAST_START_MESSAGE = "Match date and time cannot be in the past";
export const MIN_TEAMS_MESSAGE = "Add at least two teams before auto-scheduling matches.";
export const INVALID_REST_MESSAGE = "Minimum rest between matches must be zero or more minutes.";
export const END_DATE_OVERFLOW_MESSAGE =
  "Schedule does not fit within the championship end date. Increase matches per day or extend the championship.";

export type ScheduleTeam = {
  id: string;
  name: string;
  createdAt?: Date | string | null;
};

export type ExistingMatch = {
  teamAId: string;
  teamBId: string;
  /** Existing fixture times constrain a team's availability but are never edited. */
  scheduledAt?: Date | string | null;
  status?: string | null;
};

export type ScheduleSettings = {
  startAt: Date;
  /** Preferred, explicit terminology. */
  minimumTeamRestMinutes?: number;
  /** Legacy request field accepted for callers still using the previous API. */
  breakMinutes?: number;
  matchesPerDay: number;
  endDate?: Date | null;
  now?: Date;
};

export type PlannedMatch = {
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  scheduledAt: Date;
};

export type SkippedPair = {
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  reason: string;
};

export type ScheduleSummary = {
  teamCount: number;
  possibleMatches: number;
  newMatches: number;
  skippedMatches: number;
  minimumTeamRestMinutes: number;
  matchesPerDay: number;
};

export type ScheduleResult = {
  summary: ScheduleSummary;
  matches: PlannedMatch[];
  skipped: SkippedPair[];
  errors: string[];
};

/** Same wall-clock string the manual match create/edit routes use. */
export const localDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const localDateTimeString = (date: Date) =>
  `${localDateString(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

export function isDateTimeInPast(date: Date, now = new Date()) {
  return localDateTimeString(date) < localDateTimeString(now);
}

export function possibleMatchCount(teamCount: number) {
  if (teamCount < 2) return 0;
  return (teamCount * (teamCount - 1)) / 2;
}

/** Unordered pairing key: A-B and B-A are the same Auto Schedule pair. */
export function pairingKey(teamAId: string, teamBId: string) {
  return teamAId < teamBId ? `${teamAId}:${teamBId}` : `${teamBId}:${teamAId}`;
}

function timeOf(value: Date | string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** createdAt ascending, then id. Same input always yields the same Team A / Team B. */
export function sortTeams(teams: ScheduleTeam[]): ScheduleTeam[] {
  return [...teams].sort((left, right) => {
    const byCreated = timeOf(left.createdAt) - timeOf(right.createdAt);
    if (byCreated !== 0) return byCreated;
    return left.id.localeCompare(right.id);
  });
}

export function roundRobinPairs(teams: ScheduleTeam[]): Array<[ScheduleTeam, ScheduleTeam]> {
  const ordered = sortTeams(teams);
  const pairs: Array<[ScheduleTeam, ScheduleTeam]> = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) pairs.push([ordered[i], ordered[j]]);
  }
  return pairs;
}

function nextDayStart(startAt: Date, value: Date) {
  return new Date(
    value.getFullYear(), value.getMonth(), value.getDate() + 1,
    startAt.getHours(), startAt.getMinutes(), 0, 0,
  );
}

function restMinutes(settings: ScheduleSettings) {
  return settings.minimumTeamRestMinutes ?? settings.breakMinutes ?? AUTO_SCHEDULE_DEFAULTS.minimumTeamRestMinutes;
}

function summary(teams: ScheduleTeam[], skipped: SkippedPair[], matches: PlannedMatch[], minimumTeamRestMinutes: number, matchesPerDay: number): ScheduleSummary {
  return {
    teamCount: teams.length,
    possibleMatches: possibleMatchCount(teams.length),
    newMatches: matches.length,
    skippedMatches: skipped.length,
    minimumTeamRestMinutes,
    matchesPerDay,
  };
}

function emptyResult(teams: ScheduleTeam[], errors: string[], skipped: SkippedPair[], minimumTeamRestMinutes: number, matchesPerDay: number): ScheduleResult {
  return { summary: summary(teams, skipped, [], minimumTeamRestMinutes, matchesPerDay), matches: [], skipped, errors };
}

type Candidate = {
  pair: [ScheduleTeam, ScheduleTeam];
  pairIndex: number;
  scheduledAt: Date;
  previousOverlap: number;
  appearances: number;
  shortestRest: number;
};

/**
 * Find the first time at or after `from` that does not put either team within
 * its rest interval around an existing or already-planned match.  Future
 * manually scheduled matches are considered too, so generated fixtures do
 * not crowd them from either side.
 */
function firstAvailableAt(
  from: Date,
  pair: [ScheduleTeam, ScheduleTeam],
  busyAt: Map<string, number[]>,
  dayCounts: Map<string, number>,
  startAt: Date,
  minimumTeamRestMinutes: number,
  matchesPerDay: number,
) {
  const restMs = minimumTeamRestMinutes * 60_000;
  let candidate = new Date(from);

  for (;;) {
    let pushed = false;
    for (const team of pair) {
      for (const occupiedAt of busyAt.get(team.id) ?? []) {
        if (candidate.getTime() >= occupiedAt - restMs && candidate.getTime() < occupiedAt + restMs) {
          candidate = new Date(occupiedAt + restMs);
          pushed = true;
          break;
        }
      }
      if (pushed) break;
    }
    if (pushed) continue;

    const key = localDateString(candidate);
    const startOfCandidateDay = new Date(
      candidate.getFullYear(), candidate.getMonth(), candidate.getDate(),
      startAt.getHours(), startAt.getMinutes(), 0, 0,
    );
    const standardDayEnd = new Date(
      candidate.getFullYear(), candidate.getMonth(), candidate.getDate(),
      AUTO_SCHEDULE_DAILY_WINDOW_END_HOUR, 0, 0, 0,
    );
    // An administrator may intentionally select a late first fixture. Keep it
    // valid, but do not silently create additional overnight fixtures.
    const endOfCandidateDay = standardDayEnd > startOfCandidateDay
      ? standardDayEnd
      : new Date(startOfCandidateDay.getTime() + 60_000);
    if (candidate < startOfCandidateDay) {
      candidate = startOfCandidateDay;
      continue;
    }
    if (candidate >= endOfCandidateDay || (dayCounts.get(key) ?? 0) >= matchesPerDay) {
      candidate = nextDayStart(startAt, candidate);
      continue;
    }
    return candidate;
  }
}

function lastBefore(times: number[] | undefined, at: number) {
  if (!times?.length) return undefined;
  let latest: number | undefined;
  for (const time of times) if (time <= at && (latest === undefined || time > latest)) latest = time;
  return latest;
}

/**
 * Deterministic greedy ordering. Candidates that can start at the current
 * cursor are considered first (never create an idle gap just to rotate a
 * team). Within that set, it avoids the previous fixture's teams, then prefers
 * teams with fewer appearances and more elapsed rest, with original pair order
 * as a stable tie-breaker.
 */
function compareCandidates(left: Candidate, right: Candidate) {
  if (left.previousOverlap !== right.previousOverlap) return left.previousOverlap - right.previousOverlap;
  if (left.appearances !== right.appearances) return left.appearances - right.appearances;
  if (left.shortestRest !== right.shortestRest) return right.shortestRest - left.shortestRest;
  return left.pairIndex - right.pairIndex;
}

export function buildRoundRobinSchedule(
  teams: ScheduleTeam[],
  existing: ExistingMatch[],
  settings: ScheduleSettings,
): ScheduleResult {
  const errors: string[] = [];
  const { startAt, matchesPerDay, endDate, now = new Date() } = settings;
  const minimumTeamRestMinutes = restMinutes(settings);

  if (!Number.isInteger(minimumTeamRestMinutes) || minimumTeamRestMinutes < 0) errors.push(INVALID_REST_MESSAGE);
  if (!Number.isInteger(matchesPerDay) || matchesPerDay < 1) errors.push("Matches per day must be at least 1.");
  if (teams.length < 2) errors.push(MIN_TEAMS_MESSAGE);
  if (isDateTimeInPast(startAt, now)) errors.push(PAST_START_MESSAGE);

  const pairs = teams.length >= 2 ? roundRobinPairs(teams) : [];
  const existingKeys = new Set(existing.map(match => pairingKey(match.teamAId, match.teamBId)));
  const skipped: SkippedPair[] = [];
  const remaining: Array<{ pair: [ScheduleTeam, ScheduleTeam]; pairIndex: number }> = [];
  for (const [pairIndex, pair] of pairs.entries()) {
    const [teamA, teamB] = pair;
    if (existingKeys.has(pairingKey(teamA.id, teamB.id))) {
      skipped.push({ teamAId: teamA.id, teamAName: teamA.name, teamBId: teamB.id, teamBName: teamB.name, reason: SKIPPED_REASON });
    } else {
      remaining.push({ pair, pairIndex });
    }
  }

  if (errors.length) return emptyResult(teams, errors, skipped, minimumTeamRestMinutes, matchesPerDay);
  if (!remaining.length) return emptyResult(teams, [], skipped, minimumTeamRestMinutes, matchesPerDay);

  const busyAt = new Map<string, number[]>();
  const dayCounts = new Map<string, number>();
  for (const match of existing) {
    // Every existing pair remains skipped. Only upcoming scheduled matches can
    // constrain a new fixture; completed/live games have no authoritative end
    // time from which this planner could safely infer future availability.
    if (match.status && match.status !== "upcoming") continue;
    const scheduledAt = timeOf(match.scheduledAt);
    if (!scheduledAt) continue;
    for (const teamId of [match.teamAId, match.teamBId]) {
      const entries = busyAt.get(teamId) ?? [];
      entries.push(scheduledAt);
      busyAt.set(teamId, entries);
    }
    const date = new Date(scheduledAt);
    dayCounts.set(localDateString(date), (dayCounts.get(localDateString(date)) ?? 0) + 1);
  }
  for (const values of busyAt.values()) values.sort((a, b) => a - b);

  const appearances = new Map<string, number>();
  let cursor = new Date(startAt);
  let previousTeams = new Set<string>();
  const matches: PlannedMatch[] = [];

  while (remaining.length) {
    const candidates = remaining.map(({ pair, pairIndex }): Candidate => {
      const scheduledAt = firstAvailableAt(cursor, pair, busyAt, dayCounts, startAt, minimumTeamRestMinutes, matchesPerDay);
      const previousOverlap = Number(previousTeams.has(pair[0].id)) + Number(previousTeams.has(pair[1].id));
      const lastA = lastBefore(busyAt.get(pair[0].id), scheduledAt.getTime());
      const lastB = lastBefore(busyAt.get(pair[1].id), scheduledAt.getTime());
      const elapsedA = lastA === undefined ? Number.POSITIVE_INFINITY : scheduledAt.getTime() - lastA;
      const elapsedB = lastB === undefined ? Number.POSITIVE_INFINITY : scheduledAt.getTime() - lastB;
      return {
        pair, pairIndex, scheduledAt, previousOverlap,
        appearances: (appearances.get(pair[0].id) ?? 0) + (appearances.get(pair[1].id) ?? 0),
        shortestRest: Math.min(elapsedA, elapsedB),
      };
    });
    const onCursor = candidates.filter(candidate => candidate.scheduledAt.getTime() === cursor.getTime());
    const selected = (onCursor.length ? onCursor : candidates).sort(compareCandidates)[0];
    const [teamA, teamB] = selected.pair;
    matches.push({ teamAId: teamA.id, teamAName: teamA.name, teamBId: teamB.id, teamBName: teamB.name, scheduledAt: selected.scheduledAt });
    for (const teamId of [teamA.id, teamB.id]) {
      const entries = busyAt.get(teamId) ?? [];
      entries.push(selected.scheduledAt.getTime());
      entries.sort((a, b) => a - b);
      busyAt.set(teamId, entries);
      appearances.set(teamId, (appearances.get(teamId) ?? 0) + 1);
    }
    const key = localDateString(selected.scheduledAt);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    previousTeams = new Set([teamA.id, teamB.id]);
    cursor = new Date(selected.scheduledAt.getTime() + minimumTeamRestMinutes * 60_000);
    remaining.splice(remaining.findIndex(item => item.pairIndex === selected.pairIndex), 1);
  }

  if (endDate && matches.some(match => localDateString(match.scheduledAt) > localDateString(endDate))) {
    return emptyResult(teams, [END_DATE_OVERFLOW_MESSAGE], skipped, minimumTeamRestMinutes, matchesPerDay);
  }
  return { summary: summary(teams, skipped, matches, minimumTeamRestMinutes, matchesPerDay), matches, skipped, errors: [] };
}
