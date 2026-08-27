/**
 * Private match-start notifications for championship admins and participants.
 *
 * Triggered only after startChampionshipMatch() successfully flips upcoming → live.
 * Uses the existing notifications table and sendToUser(). Does not touch gameplay,
 * Auto Start eligibility, or the public match_started spectator broadcast.
 */
import { eq, inArray } from "drizzle-orm";
import {
  championships,
  championshipTeams,
  users,
  type ChampionshipMatch,
  type Notification,
} from "@shared/schema";

export const CHAMPIONSHIP_MATCH_STARTED_TYPE = "championship_match_started";
export const ADMIN_MATCH_START_HREF = "/admin/dashboard";
export const PLAYER_MATCH_START_HREF = "/my-championship";

export type MatchStartAudience = "admin" | "player";

export function matchStartNotificationId(matchId: string, userId: number): string {
  return `champ-match-start-${matchId}-${userId}`;
}

export function championshipMatchStartCopy(
  role: MatchStartAudience,
  teamAName: string,
  teamBName: string,
): { title: string; message: string } {
  const fixture = `${teamAName} vs ${teamBName}`;
  if (role === "admin") {
    return { title: "Match Started", message: `${fixture} is now LIVE.` };
  }
  return {
    title: "Your Match Is Live",
    message: `${fixture} has started. Join now to play.`,
  };
}

export function matchStartActionHref(role: MatchStartAudience): string {
  return role === "admin" ? ADMIN_MATCH_START_HREF : PLAYER_MATCH_START_HREF;
}

/** Participants overwrite admins so a playing admin gets the join message once. */
export function resolveMatchStartRecipients(input: {
  teamACaptainId: number;
  teamBCaptainId: number;
  teamAMemberIds: number[];
  teamBMemberIds: number[];
  adminIds: number[];
}): Array<{ userId: number; role: MatchStartAudience }> {
  const recipients = new Map<number, MatchStartAudience>();
  for (const id of input.adminIds) {
    if (Number.isInteger(id) && id > 0) recipients.set(id, "admin");
  }
  const participants = [
    input.teamACaptainId,
    input.teamBCaptainId,
    ...input.teamAMemberIds,
    ...input.teamBMemberIds,
  ];
  for (const id of participants) {
    if (Number.isInteger(id) && id > 0) recipients.set(id, "player");
  }
  return [...recipients.entries()].map(([userId, role]) => ({ userId, role }));
}

export async function notifyChampionshipMatchStarted(match: Pick<ChampionshipMatch, "id" | "championshipId" | "teamAId" | "teamBId">): Promise<void> {
  const [{ database }, { sendToUser }] = await Promise.all([
    import("./database"),
    import("./socket"),
  ]);
  const teams = await database.db.select().from(championshipTeams).where(inArray(championshipTeams.id, [match.teamAId, match.teamBId]));
  const teamA = teams.find(team => team.id === match.teamAId);
  const teamB = teams.find(team => team.id === match.teamBId);
  const teamAName = teamA?.name ?? "Team A";
  const teamBName = teamB?.name ?? "Team B";
  const [championship] = await database.db
    .select({ name: championships.name })
    .from(championships)
    .where(eq(championships.id, match.championshipId));
  const championshipName = championship?.name?.trim() || undefined;

  const admins = await database.db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));
  const recipients = resolveMatchStartRecipients({
    teamACaptainId: teamA?.captainId ?? 0,
    teamBCaptainId: teamB?.captainId ?? 0,
    teamAMemberIds: teamA?.memberIds ?? [],
    teamBMemberIds: teamB?.memberIds ?? [],
    adminIds: admins.map(admin => admin.id),
  });

  for (const recipient of recipients) {
    const copy = championshipMatchStartCopy(recipient.role, teamAName, teamBName);
    const notification: Notification = {
      id: matchStartNotificationId(match.id, recipient.userId),
      userId: recipient.userId,
      type: CHAMPIONSHIP_MATCH_STARTED_TYPE,
      message: copy.message,
      read: false,
      challengeId: match.id,
      createdAt: new Date(),
    };
    try {
      await database.createNotification(notification);
    } catch {
      // Deterministic id: a retry after a successful upcoming → live flip
      // must not create a second row or fire a second socket event.
      continue;
    }
    sendToUser(recipient.userId, {
      type: CHAMPIONSHIP_MATCH_STARTED_TYPE,
      message: copy.message,
      notificationId: notification.id,
      matchId: match.id,
      championshipId: match.championshipId,
      championshipName,
      teamAName,
      teamBName,
      role: recipient.role,
      challengeId: match.id,
    });
  }
}
