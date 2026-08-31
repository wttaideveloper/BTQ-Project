/**
 * Pure Championship Auto Schedule planner.
 *
 * No database access. Preview and generate share this module so the same
 * input always produces the same plan.
 *
 * Break and matches-per-day are scheduling settings only. They are never
 * stored on championship_matches — only scheduledAt is persisted, same as
 * manual create. scheduledAt is an earliest/target start, not a match length.
 */

export const AUTO_SCHEDULE_DEFAULTS = {
  breakMinutes: 10,
  matchesPerDay: 1,
} as const;

export const SKIPPED_REASON = "Already scheduled";
export const PAST_START_MESSAGE = "Match date and time cannot be in the past";
export const MIN_TEAMS_MESSAGE = "Add at least two teams before auto-scheduling matches.";
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
};

export type ScheduleSettings = {
  startAt: Date;
  breakMinutes: number;
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
    for (let j = i + 1; j < ordered.length; j++) {
      pairs.push([ordered[i], ordered[j]]);
    }
  }
  return pairs;
}

function slotStart(startAt: Date, dayOffset: number, slotIndex: number, slotLengthMinutes: number) {
  const dayStart = new Date(
    startAt.getFullYear(),
    startAt.getMonth(),
    startAt.getDate() + dayOffset,
    startAt.getHours(),
    startAt.getMinutes(),
    0,
    0,
  );
  return new Date(dayStart.getTime() + slotIndex * slotLengthMinutes * 60 * 1000);
}

function emptyResult(teams: ScheduleTeam[], errors: string[], skipped: SkippedPair[] = []): ScheduleResult {
  return {
    summary: {
      teamCount: teams.length,
      possibleMatches: possibleMatchCount(teams.length),
      newMatches: 0,
      skippedMatches: skipped.length,
    },
    matches: [],
    skipped,
    errors,
  };
}

export function buildRoundRobinSchedule(
  teams: ScheduleTeam[],
  existing: ExistingMatch[],
  settings: ScheduleSettings,
): ScheduleResult {
  const errors: string[] = [];
  const { startAt, breakMinutes, matchesPerDay, endDate, now = new Date() } = settings;

  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    errors.push("Break between matches cannot be negative.");
  }
  if (!Number.isInteger(matchesPerDay) || matchesPerDay < 1) {
    errors.push("Matches per day must be at least 1.");
  }
  if (teams.length < 2) errors.push(MIN_TEAMS_MESSAGE);
  if (isDateTimeInPast(startAt, now)) errors.push(PAST_START_MESSAGE);

  const pairs = teams.length >= 2 ? roundRobinPairs(teams) : [];
  const existingKeys = new Set(existing.map(match => pairingKey(match.teamAId, match.teamBId)));
  const skipped: SkippedPair[] = [];
  const remaining: Array<[ScheduleTeam, ScheduleTeam]> = [];

  for (const [teamA, teamB] of pairs) {
    if (existingKeys.has(pairingKey(teamA.id, teamB.id))) {
      skipped.push({
        teamAId: teamA.id,
        teamAName: teamA.name,
        teamBId: teamB.id,
        teamBName: teamB.name,
        reason: SKIPPED_REASON,
      });
    } else {
      remaining.push([teamA, teamB]);
    }
  }

  if (errors.length) return emptyResult(teams, errors, skipped);

  if (remaining.length === 0) {
    return {
      summary: {
        teamCount: teams.length,
        possibleMatches: possibleMatchCount(teams.length),
        newMatches: 0,
        skippedMatches: skipped.length,
      },
      matches: [],
      skipped,
      errors: [],
    };
  }

  const slotLengthMinutes = breakMinutes;
  const matches: PlannedMatch[] = remaining.map(([teamA, teamB], index) => {
    const dayOffset = Math.floor(index / matchesPerDay);
    const slotIndex = index % matchesPerDay;
    return {
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      scheduledAt: slotStart(startAt, dayOffset, slotIndex, slotLengthMinutes),
    };
  });

  if (endDate && matches.some(match => localDateString(match.scheduledAt) > localDateString(endDate))) {
    return emptyResult(teams, [END_DATE_OVERFLOW_MESSAGE], skipped);
  }

  return {
    summary: {
      teamCount: teams.length,
      possibleMatches: possibleMatchCount(teams.length),
      newMatches: matches.length,
      skippedMatches: skipped.length,
    },
    matches,
    skipped,
    errors: [],
  };
}
