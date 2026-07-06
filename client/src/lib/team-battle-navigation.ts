const OPEN_TEAM_BATTLE_SETUP_KEY = "openTeamBattleSetup";
const OPEN_RAPID_FIRE_SETUP_KEY = "openRapidFireSetup";

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
