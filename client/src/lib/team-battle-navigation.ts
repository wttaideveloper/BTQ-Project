const OPEN_TEAM_BATTLE_SETUP_KEY = "openTeamBattleSetup";
const OPEN_RAPID_FIRE_SETUP_KEY = "openRapidFireSetup";
const TEAM_BATTLE_LAUNCH_PREFIX = "teamBattleLaunch:";

/** Mark that the user is entering the game from setup/countdown (skip connect overlay). */
export function markTeamBattleLaunch(gameSessionId: string): void {
  sessionStorage.setItem(
    `${TEAM_BATTLE_LAUNCH_PREFIX}${gameSessionId}`,
    Date.now().toString()
  );
}

/** Returns true once if this session was just launched from setup (within 30s). */
export function consumeTeamBattleLaunch(gameSessionId: string): boolean {
  const key = `${TEAM_BATTLE_LAUNCH_PREFIX}${gameSessionId}`;
  const value = sessionStorage.getItem(key);
  if (!value) return false;
  sessionStorage.removeItem(key);
  const age = Date.now() - parseInt(value, 10);
  return Number.isFinite(age) && age >= 0 && age < 30_000;
}

export function navigateToTeamBattleGame(
  setLocation: (path: string) => void,
  gameSessionId: string
): void {
  markTeamBattleLaunch(gameSessionId);
  setLocation(`/team-battle-game?session=${gameSessionId}`);
}

export function navigateToTeamBattleSetup(
  setLocation: (path: string) => void,
  gameSessionId: string,
  championshipMatchId?: string,
  focusInvitePlayers = false
): void {
  sessionStorage.setItem("teamBattleSessionId", gameSessionId);
  const query = new URLSearchParams({ session: gameSessionId });
  if (championshipMatchId) query.set("championshipMatch", championshipMatchId);
  if (focusInvitePlayers) query.set("focus", "invite-players");
  setLocation(`/team-battle-setup?${query.toString()}${focusInvitePlayers ? "#invite-players" : ""}`);
}

/** Mark that Home should open the Team Battle setup modal (not the legacy /team-battle page). */
export function markOpenTeamBattleSetup(options?: { isRapidFire?: boolean }): void {
  sessionStorage.setItem(OPEN_TEAM_BATTLE_SETUP_KEY, "1");
  if (options?.isRapidFire) {
    sessionStorage.setItem(OPEN_RAPID_FIRE_SETUP_KEY, "1");
  } else {
    sessionStorage.removeItem(OPEN_RAPID_FIRE_SETUP_KEY);
  }
}

/** Returns open intent once, then clears flags. */
export function consumeOpenTeamBattleSetup(): {
  shouldOpen: boolean;
  isRapidFire: boolean;
} {
  const shouldOpen = sessionStorage.getItem(OPEN_TEAM_BATTLE_SETUP_KEY) === "1";
  if (!shouldOpen) {
    return { shouldOpen: false, isRapidFire: false };
  }

  sessionStorage.removeItem(OPEN_TEAM_BATTLE_SETUP_KEY);
  const isRapidFire = sessionStorage.getItem(OPEN_RAPID_FIRE_SETUP_KEY) === "1";
  sessionStorage.removeItem(OPEN_RAPID_FIRE_SETUP_KEY);

  return { shouldOpen: true, isRapidFire };
}
