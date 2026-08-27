import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { onEvent } from "@/lib/socket";
import { ToastAction } from "@/components/ui/toast";

export const CHAMPIONSHIP_FOCUS_LIVE_EVENT = "championship-focus-live";
export const CHAMPIONSHIP_FOCUS_LIVE_KEY = "championship-focus-live";

function isPublicWatchPath(pathname: string) {
  return pathname.startsWith("/watch/") || pathname.startsWith("/overlay/");
}

function focusLiveMatchDesk(detail?: { championshipId?: string; matchId?: string }) {
  try {
    sessionStorage.setItem(CHAMPIONSHIP_FOCUS_LIVE_KEY, JSON.stringify({
      championshipId: detail?.championshipId ?? null,
      matchId: detail?.matchId ?? null,
    }));
  } catch {
    // sessionStorage can throw in private mode; the event still works if the panel is mounted.
  }
  window.dispatchEvent(new CustomEvent(CHAMPIONSHIP_FOCUS_LIVE_EVENT, { detail: detail ?? {} }));
}

/**
 * Instant toast when a championship match becomes LIVE.
 * Listens to the private championship_match_started event (sendToUser), not public match_started.
 */
export function useChampionshipMatchStartToasts(userId?: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!userId) return;

    const offStarted = onEvent("championship_match_started", (data: {
      message?: string;
      matchId?: string;
      championshipId?: string;
      teamAName?: string;
      teamBName?: string;
      role?: "admin" | "player";
    }) => {
      if (isPublicWatchPath(window.location.pathname)) return;

      queryClient.invalidateQueries({ queryKey: ["/api/championships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/championships/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      const role = data.role === "player" ? "player" : "admin";
      const fixture = data.teamAName && data.teamBName
        ? `${data.teamAName} vs ${data.teamBName}`
        : null;

      toast({
        title: role === "admin" ? "🏆 Match Started" : "🏆 Your Match Is Live",
        description: data.message || (role === "admin"
          ? `${fixture ?? "A championship match"} is now LIVE.`
          : `${fixture ?? "Your championship match"} has started. Join now to play.`),
        duration: 8000,
        action: (
          <ToastAction
            altText={role === "admin" ? "Open match" : "Join match"}
            onClick={() => {
              if (role === "admin") {
                focusLiveMatchDesk({ championshipId: data.championshipId, matchId: data.matchId });
                if (!window.location.pathname.startsWith("/admin")) setLocation("/admin/dashboard");
                return;
              }
              if (location !== "/my-championship") setLocation("/my-championship");
            }}
          >
            {role === "admin" ? "Open Match" : "Join Match"}
          </ToastAction>
        ),
      });
    });

    return () => {
      offStarted();
    };
  }, [userId, toast, queryClient, location, setLocation]);
}
