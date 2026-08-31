/**
 * Global commentator access helpers.
 *
 * A user with is_commentator=true and is_admin=false can see matches in
 * ACTIVE championships. Championship assignment (commentator_user_id) is not
 * part of this access check.
 */

/** Existing championships.status value. Do not invent a new status. */
export const ACTIVE_CHAMPIONSHIP_STATUS = "active" as const;

export const RECENT_COMPLETED_MATCH_LIMIT = 8;

export function isActiveChampionshipStatus(status: string | null | undefined): boolean {
  return status === ACTIVE_CHAMPIONSHIP_STATUS;
}

export function filterMatchesForActiveChampionships<
  TMatch extends { championshipId: string },
  TChampionship extends { id: string; status: string },
>(matches: TMatch[], championshipList: TChampionship[]): TMatch[] {
  const activeIds = new Set(
    championshipList
      .filter(championship => isActiveChampionshipStatus(championship.status))
      .map(championship => championship.id),
  );
  return matches.filter(match => activeIds.has(match.championshipId));
}

export function timestampValue(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

export function groupCommentatorDeskMatches<T extends {
  status: string;
  scheduledAt?: Date | string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
}>(matches: T[]): { live: T[]; upcoming: T[]; recent: T[] } {
  const live = matches
    .filter(match => match.status === "live")
    .sort((a, b) => timestampValue(b.startedAt) - timestampValue(a.startedAt)
      || timestampValue(a.scheduledAt) - timestampValue(b.scheduledAt));

  const upcoming = matches
    .filter(match => match.status === "upcoming")
    .sort((a, b) => {
      const aTime = timestampValue(a.scheduledAt);
      const bTime = timestampValue(b.scheduledAt);
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return aTime - bTime;
    });

  const recent = matches
    .filter(match => match.status === "completed")
    .sort((a, b) => timestampValue(b.completedAt) - timestampValue(a.completedAt)
      || timestampValue(b.startedAt) - timestampValue(a.startedAt))
    .slice(0, RECENT_COMPLETED_MATCH_LIMIT);

  return { live, upcoming, recent };
}

export function toPublicCommentatorTeam(team: {
  id: string;
  name: string;
  emoticon: string;
  logoUrl?: string | null;
} | null | undefined) {
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    emoticon: team.emoticon,
    logoUrl: team.logoUrl ?? null,
  };
}

export function toPublicCommentatorChampionship(championship: {
  id: string;
  name: string;
  status: string;
}) {
  return {
    id: championship.id,
    name: championship.name,
    status: championship.status,
  };
}
