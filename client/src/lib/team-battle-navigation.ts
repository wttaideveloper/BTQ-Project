const OPEN_TEAM_BATTLE_SETUP_KEY = "openTeamBattleSetup";

/** Mark that Home should open the Team Battle setup modal (not the legacy /team-battle page). */
export function markOpenTeamBattleSetup(): void {
  sessionStorage.setItem(OPEN_TEAM_BATTLE_SETUP_KEY, "1");
}

/** Returns true once if the modal should open, then clears the flag. */
export function consumeOpenTeamBattleSetup(): boolean {
  if (sessionStorage.getItem(OPEN_TEAM_BATTLE_SETUP_KEY) === "1") {
    sessionStorage.removeItem(OPEN_TEAM_BATTLE_SETUP_KEY);
    return true;
  }
  return false;
}
