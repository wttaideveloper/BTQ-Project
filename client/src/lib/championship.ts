/**
 * Player-side view of the championship data that the existing endpoints already
 * return, plus the derivations the My Championship dashboard needs.
 *
 * NOTHING here invents API fields. The shapes below describe what
 * GET /api/championships/me/dashboard, GET /api/championships/:id and
 * GET /api/championship-teams/:id send today - including the fact that
 * `game_session_id` is deliberately stripped from every read endpoint
 * (server/championship-routes.ts, toPublicMatch) and that timestamps arrive as
 * JSON strings rather than Date objects.
 */

/** Timestamps are Dates in the schema but strings once serialised to JSON. */
export type ApiDate = string | Date | null | undefined;

/** The three values championship_matches.status can hold. */
export type MatchStatus = "live" | "upcoming" | "completed";

/** The three values championships.status can hold. */
export type ChampionshipStatus = "draft" | "active" | "completed";

export interface ChampionshipSummary {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  startDate?: ApiDate;
  endDate?: ApiDate;
}

export interface ChampionshipTeamSummary {
  id: string;
  championshipId: string;
  name: string;
  captainId: number;
  memberIds?: number[] | null;
  emoticon: string;
}

export interface ChampionshipMatchSummary {
  id: string;
  championshipId: string;
  teamAId: string;
  teamBId: string;
  status: string;
  scheduledAt?: ApiDate;
  startedAt?: ApiDate;
  completedAt?: ApiDate;
  teamAScore: number;
  teamBScore: number;
  winnerTeamId?: string | null;
  streamUrl?: string | null;
}

/** A standings row: the team plus its computed record. */
export interface ChampionshipStanding extends ChampionshipTeamSummary {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

/**
 * GET /api/championships/me/dashboard
 *
 * `matches` is already scoped by the server: a user who belongs to a team
 * receives ONLY that team's matches; a user with no team receives every match
 * in the championship. `teams` is absent when there is no active championship.
 */
export interface MyChampionshipDashboard {
  championship: ChampionshipSummary | null;
  team: ChampionshipTeamSummary | null;
  teams?: ChampionshipTeamSummary[];
  matches?: ChampionshipMatchSummary[];
}

/** GET /api/championships/:id - the public championship page payload. */
export interface ChampionshipDetail {
  championship: ChampionshipSummary;
  teams: ChampionshipTeamSummary[];
  matches: ChampionshipMatchSummary[];
  standings: ChampionshipStanding[];
  champion: ChampionshipStanding | null;
}

/** A member row from GET /api/championship-teams/:id. */
export interface ChampionshipTeamMember {
  id: number;
  username: string;
  fullName?: string | null;
  profileImage?: string | null;
}

/** GET /api/championship-teams/:id */
export interface ChampionshipTeamDetail {
  team: ChampionshipTeamSummary;
  members: ChampionshipTeamMember[];
  matches: ChampionshipMatchSummary[];
}

/** A user row from GET /api/users (directory shape for non-admins). */
export interface DirectoryUser {
  id: number;
  username: string;
  fullName?: string | null;
  isAdmin?: boolean | null;
}

export type MatchOutcome = "won" | "lost" | "draw";

/** Narrow the raw status string, defaulting to the schema default. */
export function matchStatusOf(match: ChampionshipMatchSummary): MatchStatus {
  return match.status === "live" || match.status === "completed" ? match.status : "upcoming";
}

/** Narrow the raw championship status string, defaulting to the schema default. */
export function championshipStatusOf(championship: ChampionshipSummary): ChampionshipStatus {
  return championship.status === "active" || championship.status === "completed"
    ? championship.status
    : "draft";
}

export function teamMemberIds(team: ChampionshipTeamSummary | null | undefined): number[] {
  return team?.memberIds ?? [];
}

export function isTeamInMatch(match: ChampionshipMatchSummary, teamId: string | null | undefined): boolean {
  return !!teamId && (match.teamAId === teamId || match.teamBId === teamId);
}

/**
 * Mirror of the eligibility rule enforced by POST /api/championship-matches/:id/join:
 * the match must be live and the user must be a member of one of the two teams.
 *
 * The route also requires match.game_session_id, which is withheld from every
 * read endpoint - but /start writes it in the same transaction that flips the
 * match to "live", so "live" is the only signal the client can and needs to use.
 */
export function canJoinMatch(
  match: ChampionshipMatchSummary,
  team: ChampionshipTeamSummary | null | undefined,
  userId: number | null | undefined,
): boolean {
  if (!team || !userId) return false;
  if (matchStatusOf(match) !== "live") return false;
  return isTeamInMatch(match, team.id) && teamMemberIds(team).includes(userId);
}

function timeOf(value: ApiDate): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export interface GroupedMatches {
  live: ChampionshipMatchSummary[];
  upcoming: ChampionshipMatchSummary[];
  completed: ChampionshipMatchSummary[];
}

/**
 * Split matches into the three buckets the dashboard renders, each sorted so
 * the most relevant fixture comes first: soonest kickoff for upcoming, most
 * recent for live and completed.
 */
export function groupMatches(matches: ChampionshipMatchSummary[]): GroupedMatches {
  const grouped: GroupedMatches = { live: [], upcoming: [], completed: [] };
  for (const match of matches) grouped[matchStatusOf(match)].push(match);

  grouped.live.sort((a, b) => (timeOf(b.startedAt) ?? 0) - (timeOf(a.startedAt) ?? 0));
  grouped.completed.sort((a, b) => (timeOf(b.completedAt) ?? 0) - (timeOf(a.completedAt) ?? 0));
  grouped.upcoming.sort((a, b) => {
    // A match with no kickoff time yet sorts last - it is the least actionable.
    const left = timeOf(a.scheduledAt);
    const right = timeOf(b.scheduledAt);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });
  return grouped;
}

/** Flatten back to a single list in dashboard priority order. */
export function orderMatches(matches: ChampionshipMatchSummary[]): ChampionshipMatchSummary[] {
  const grouped = groupMatches(matches);
  return [...grouped.live, ...grouped.upcoming, ...grouped.completed];
}

/**
 * The one match the player should be looking at: a live one if there is one,
 * otherwise the next scheduled one, otherwise the latest result.
 */
export function pickFocusMatch(grouped: GroupedMatches): ChampionshipMatchSummary | null {
  return grouped.live[0] ?? grouped.upcoming[0] ?? grouped.completed[0] ?? null;
}

/**
 * Result of a completed match from one team's point of view.
 *
 * winner_team_id is null when the teams finished level - both /end and the
 * engine record a draw that way - so "completed with no winner" is the draw
 * signal, never a loss.
 */
export function matchOutcome(
  match: ChampionshipMatchSummary,
  teamId: string | null | undefined,
): MatchOutcome | null {
  if (matchStatusOf(match) !== "completed" || !isTeamInMatch(match, teamId)) return null;
  if (!match.winnerTeamId) return "draw";
  return match.winnerTeamId === teamId ? "won" : "lost";
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today, 7:30 PM" / "Tomorrow, 7:30 PM" / "Sat, Sep 12, 7:30 PM". */
export function formatKickoff(value: ApiDate): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const startOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const dayDelta = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (dayDelta === 0) return `Today, ${formatClock(date)}`;
  if (dayDelta === 1) return `Tomorrow, ${formatClock(date)}`;
  if (dayDelta === -1) return `Yesterday, ${formatClock(date)}`;
  return `${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${formatClock(date)}`;
}

/** Short calendar date used for results ("Sep 12"). */
export function formatShortDate(value: ApiDate): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The one line of timing context a match card shows, written so it never
 * exposes raw status terminology on its own.
 */
export function matchTimingLabel(match: ChampionshipMatchSummary): string | null {
  switch (matchStatusOf(match)) {
    case "live": {
      const started = formatKickoff(match.startedAt);
      // A match that started today needs no day: "Started 7:31 PM".
      return started ? `Started ${started.replace(/^Today, /, "")}` : "In progress";
    }
    case "completed": {
      const played = formatShortDate(match.completedAt);
      return played ? `Played ${played}` : "Final result";
    }
    default: {
      return formatKickoff(match.scheduledAt) ?? "Time to be announced";
    }
  }
}

/** Look up a team by id from any of the lists the endpoints return. */
export function findTeam(
  teams: ChampionshipTeamSummary[],
  teamId: string | null | undefined,
): ChampionshipTeamSummary | undefined {
  return teams.find(team => team.id === teamId);
}

export function displayName(person: { fullName?: string | null; username: string }): string {
  return person.fullName?.trim() || person.username;
}
