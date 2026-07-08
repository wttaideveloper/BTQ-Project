import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_GAME_SETTINGS,
  type GameSettingsConfig,
} from "@shared/game-settings";

async function fetchGameSettings(): Promise<GameSettingsConfig> {
  const response = await fetch("/api/game/settings");
  if (!response.ok) {
    throw new Error("Failed to load game settings");
  }
  return response.json();
}

export function useGameSettings() {
  const query = useQuery<GameSettingsConfig>({
    queryKey: ["/api/game/settings"],
    queryFn: fetchGameSettings,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    placeholderData: DEFAULT_GAME_SETTINGS,
  });

  return {
    ...query,
    settings: query.data ?? DEFAULT_GAME_SETTINGS,
  };
}
