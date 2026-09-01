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

export type ChampionshipLobbyView = "prematch" | "preparing" | "none";

/**
 * READY timestamps stay true after kickoff. They must not decide whether
 * ChampionshipPreMatch renders. Once gameplay has started (team_battle_started
 * / toss / question), the lobby is gone for this match.
 */
export function championshipLobbyView(opts: {
  isChampionship: boolean;
  gameplayStarted: boolean;
  phase: string;
  hasCurrentQuestion: boolean;
  hasRapidQuestion?: boolean;
  countdown: number | null;
}): ChampionshipLobbyView {
  if (!opts.isChampionship) return "none";
  if (opts.hasCurrentQuestion || opts.hasRapidQuestion) return "none";
  if (opts.phase === "toss" || opts.phase === "question" || opts.phase === "finished" || opts.phase === "results") {
    return "none";
  }

  if (opts.gameplayStarted) {
    return opts.phase === "playing" || opts.phase === "ready" ? "preparing" : "none";
  }

  // Championship join lands in phase "playing" before the Team Battle starts.
  if (opts.phase !== "playing" && opts.phase !== "ready") return "none";
  if (opts.countdown === 0) return "preparing";
  return "prematch";
}
