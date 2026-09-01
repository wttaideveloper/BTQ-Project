export type PrematchMember = {
  userId: number;
  username: string;
  role: "captain" | "member";
};

export type PrematchTeam = {
  name: string;
  captainId?: number;
  teamSide?: "A" | "B";
  members: PrematchMember[];
};

/** True when this socket-bound user is on the live session; null if presence is unknown. */
export function isRosterMemberJoined(
  userId: number,
  presentUserIds: number[] | null | undefined,
): boolean | null {
  if (!presentUserIds) return null;
  return presentUserIds.includes(userId);
}

export function prematchMembersFromTeam(team: {
  captainId?: number;
  members?: Array<{ userId?: number; username?: string; role?: string }>;
} | null | undefined): PrematchMember[] {
  const members = team?.members ?? [];
  const rows: PrematchMember[] = [];
  for (const member of members) {
    if (typeof member.userId !== "number") continue;
    rows.push({
      userId: member.userId,
      username: member.username || "Unknown",
      role: member.role === "captain" || member.userId === team?.captainId ? "captain" : "member",
    });
  }
  return rows;
}

export function championshipPrematchCopy(opts: {
  teamAName: string;
  teamBName: string;
  teamAReady: boolean;
  teamBReady: boolean;
  countdown: number | null;
}): { title: string; description: string } {
  if (opts.countdown != null && opts.countdown > 0 && opts.teamAReady && opts.teamBReady) {
    return {
      title: "Both captains ready",
      description: `Match starting in ${opts.countdown}…`,
    };
  }
  if (opts.teamAReady && opts.teamBReady) {
    return {
      title: "Both captains ready",
      description: "The match is starting.",
    };
  }
  if (opts.teamAReady && !opts.teamBReady) {
    return {
      title: `Waiting for ${opts.teamBName}`,
      description: `${opts.teamAName} is ready. Waiting for ${opts.teamBName} captain...`,
    };
  }
  if (!opts.teamAReady && opts.teamBReady) {
    return {
      title: `Waiting for ${opts.teamAName}`,
      description: `${opts.teamBName} is ready. Waiting for ${opts.teamAName} captain...`,
    };
  }
  return {
    title: "Waiting for captains",
    description: "Each captain marks ready when their team is set. Teammates do not need to have joined.",
  };
}

export function canCaptainToggleReady(opts: {
  currentUserId?: number;
  captainId?: number;
  countdown: number | null;
}): boolean {
  if (!opts.currentUserId || !opts.captainId) return false;
  if (opts.countdown != null && opts.countdown > 0) return false;
  return opts.currentUserId === opts.captainId;
}
