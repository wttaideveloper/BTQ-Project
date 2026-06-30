import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { onEvent, setupGameSocket } from "@/lib/socket";

/**
 * DB-AUTHORITATIVE BATTLE STATE HOOK
 * ==================================
 * This hook is the SINGLE SOURCE OF TRUTH for team battle state.
 * 
 * Architecture:
 * - All state comes from /api/team-battle/state endpoint (database)
 * - WebSocket events are NOTIFICATIONS only, they trigger a refetch
 * - UI must render ONLY from this hook's data
 * 
 * The hook automatically refetches on:
 * - team_ready_status event
 * - teams_updated event
 * - team_state_restored event
 * - WebSocket reconnection
 * - Window focus (visibility change)
 * - Manual refetch calls
 */

export interface BattleStateTeam {
  teamId: string;
  teamSide: "A" | "B";
  name: string;
  captainId: number;
  members: number[];
  ready: boolean;
  readyAt: Date | null;
}

export interface BattleState {
  phase: "no_battle" | "forming" | "countdown" | "started" | "finished";
  battleId: string | null;
  gameSessionId: string;
  status: string;
  teams: BattleStateTeam[];
  countdown: number | null;
  bothReady: boolean;
  serverTime: number;
  createdAt: Date | null;
  startedAt: Date | null;
  stateVersion?: number; // ELITE: Monotonic version for debugging & out-of-order detection
}

export function useBattleState(gameSessionId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastRefetchRef = useRef<number>(0);
  const lastStateVersionRef = useRef<number>(0); // ELITE: Track last known version
  const REFETCH_DEBOUNCE_MS = 500; // Debounce rapid refetches

  // Query key for this battle state
  const queryKey = ["/api/team-battle/state", gameSessionId];

  // Fetch battle state from API (DATABASE IS SOURCE OF TRUTH)
  const {
    data: battleState,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<BattleState>({
    queryKey,
    queryFn: async () => {
      if (!gameSessionId) {
        return {
          phase: "no_battle",
          battleId: null,
          gameSessionId: "",
          status: "",
          teams: [],
          countdown: null,
          bothReady: false,
          serverTime: Date.now(),
          createdAt: null,
          startedAt: null,
        };
      }

      const res = await apiRequest(
        "GET",
        `/api/team-battle/state?gameSessionId=${gameSessionId}`
      );
      const data = await res.json();
      
      // ================================================================
      // ELITE HARDENING: Ignore out-of-order responses using stateVersion
      // ================================================================
      if (data.stateVersion !== undefined) {
        if (data.stateVersion < lastStateVersionRef.current) {
          // Return the cached data instead of stale response
          const cached = queryClient.getQueryData<BattleState>(queryKey);
          if (cached) return cached;
        }
        lastStateVersionRef.current = data.stateVersion;
      } else {
      }
      
      return data;
    },
    enabled: !!gameSessionId && !!user,
    // Refetch every 3 seconds as fallback for missed events
    refetchInterval: 3000,
    // Keep data fresh
    staleTime: 1000,
    // Don't cache old data for too long
    gcTime: 5000,
  });

  // Debounced refetch function
  const debouncedRefetch = useCallback(() => {
    const now = Date.now();
    if (now - lastRefetchRef.current < REFETCH_DEBOUNCE_MS) {
      return;
    }
    lastRefetchRef.current = now;
    refetch();
  }, [refetch]);

  // Force immediate refetch (bypasses debounce)
  const forceRefetch = useCallback(() => {
    lastRefetchRef.current = 0;
    refetch();
  }, [refetch]);

  // Setup WebSocket listeners to trigger refetch on state change notifications
  useEffect(() => {
    if (!user?.id || !gameSessionId) return;

    setupGameSocket(user.id);

    // CRITICAL: Socket events are NOTIFICATIONS only
    // They tell us state changed, but we MUST refetch from API for truth
    const socketEventsToWatch = [
      "team_ready_status",
      "teams_updated",
      "team_update",
      "team_state_restored",
      "team_created",
      "team_battle_countdown",
      "opponent_accepted_invitation",
      "join_request_updated",
      "teammate_disconnected",
      "opponent_disconnected",
      "team_member_removed",
      "captain_left_team",
      "member_removed_by_captain",
    ];

    const cleanupFns: (() => void)[] = [];

    for (const eventType of socketEventsToWatch) {
      const cleanup = onEvent(eventType, (data: any) => {
        // Only refetch if this event is for our session (or has no session info)
        const eventSessionId = data.gameSessionId;
        if (!eventSessionId || eventSessionId === gameSessionId) {
          debouncedRefetch();
        }
      });
      cleanupFns.push(cleanup);
    }

    return () => {
      cleanupFns.forEach((fn) => fn());
    };
  }, [user?.id, gameSessionId, debouncedRefetch]);

  // Refetch on window focus (handles tab switches, app switches on mobile)
  useEffect(() => {
    if (!gameSessionId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        forceRefetch();
      }
    };

    const handleFocus = () => {
      debouncedRefetch();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [gameSessionId, forceRefetch, debouncedRefetch]);

  // Helper to find current user's team
  const userTeam = battleState?.teams.find((team) =>
    team.members.includes(user?.id || 0)
  );

  // Helper to check if user is captain
  const isCaptain = userTeam?.captainId === user?.id;

  // Helper to check if user's team is ready
  const isUserTeamReady = userTeam?.ready ?? false;

  // Helper to check if opponent team is ready
  const opponentTeam = battleState?.teams.find(
    (team) => team.teamId !== userTeam?.teamId
  );
  const isOpponentReady = opponentTeam?.ready ?? false;

  return {
    // Core state (from API)
    battleState,
    isLoading,
    isError,
    error,
    isFetching,

    // Refetch functions
    refetch: debouncedRefetch,
    forceRefetch,

    // Derived helpers
    userTeam,
    opponentTeam,
    isCaptain,
    isUserTeamReady,
    isOpponentReady,
    phase: battleState?.phase ?? "no_battle",
    countdown: battleState?.countdown ?? null,
    bothReady: battleState?.bothReady ?? false,
    hasOpponent: (battleState?.teams.length ?? 0) >= 2,
  };
}

