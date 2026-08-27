import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Radio, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { onEvent, setupGameSocket } from "@/lib/socket";
import { apiRequest } from "@/lib/queryClient";
import { navigateToTeamBattleGame } from "@/lib/team-battle-navigation";
import {
  dismissMatchStartPopup,
  emptyMatchStartPopupState,
  enqueueMatchStartPopup,
  focusLiveMatchDesk,
  isAdminAppPath,
  isPublicWatchPath,
  markMatchStartPopupSeen,
  matchStartPopupIdentity,
  readSeenPopupIds,
  shouldSuppressMatchStartPopup,
  writeSeenPopupIds,
  type MatchStartPopupEvent,
  type MatchStartPopupState,
} from "@/lib/championship-match-start-popup";

function liveDeskIsOnScreen() {
  return typeof document !== "undefined" && !!document.getElementById("championship-live");
}

/**
 * Actionable match-start notice for private championship_match_started events.
 * No full-screen backdrop: html/body/#root overflow-x:hidden turns a 100vh
 * overlay into a solid black slab in the admin content column.
 */
export function ChampionshipMatchStartPopup({ userId }: { userId?: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<MatchStartPopupState>(() => emptyMatchStartPopupState(readSeenPopupIds()));
  const [joining, setJoining] = useState(false);
  const current = state.current;

  useEffect(() => {
    if (!userId) return;

    const offStarted = onEvent("championship_match_started", (data: MatchStartPopupEvent) => {
      const pathname = window.location.pathname;
      if (isPublicWatchPath(pathname)) return;

      queryClient.invalidateQueries({ queryKey: ["/api/championships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/championships/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      setState(currentState => {
        if (shouldSuppressMatchStartPopup(data, { pathname, liveDeskPresent: liveDeskIsOnScreen() })) {
          const next = markMatchStartPopupSeen(currentState, matchStartPopupIdentity(data));
          if (next.seen !== currentState.seen) writeSeenPopupIds(next.seen);
          return next;
        }
        const next = enqueueMatchStartPopup(currentState, data);
        if (next.seen !== currentState.seen) writeSeenPopupIds(next.seen);
        return next;
      });
    });

    return () => {
      offStarted();
    };
  }, [userId, queryClient]);

  const dismiss = () => {
    setJoining(false);
    setState(currentState => dismissMatchStartPopup(currentState));
  };

  const openAdminMatch = () => {
    focusLiveMatchDesk({ championshipId: current?.championshipId, matchId: current?.matchId });
    if (!window.location.pathname.startsWith("/admin")) setLocation("/admin/dashboard");
    dismiss();
  };

  const joinPlayerMatch = async () => {
    if (!current?.matchId) {
      setLocation("/my-championship");
      dismiss();
      return;
    }
    setJoining(true);
    try {
      const response = await apiRequest("POST", `/api/championship-matches/${current.matchId}/join`, {});
      const access = await response.json();
      setupGameSocket();
      dismiss();
      window.setTimeout(() => navigateToTeamBattleGame(setLocation, access.gameSessionId), 100);
    } catch (error) {
      setJoining(false);
      toast({
        title: "Unable to join match",
        description: error instanceof Error ? error.message : "Opening My Championship so you can join from there.",
        variant: "destructive",
      });
      setLocation("/my-championship");
      dismiss();
    }
  };

  const isPlayer = current?.role === "player";
  const title = isPlayer ? "Your Match Is Live!" : "Match Started";
  const actionLabel = isPlayer ? "Join Match" : "Open Match";
  const dismissLabel = isPlayer ? "Later" : "Close";
  const visible = !!current
    && !isAdminAppPath(location)
    && !isAdminAppPath(window.location.pathname)
    && !isPublicWatchPath(location)
    && !isPublicWatchPath(window.location.pathname);

  useEffect(() => {
    if (!current) return;
    if (!liveDeskIsOnScreen()) return;
    setJoining(false);
    setState(currentState => dismissMatchStartPopup(currentState));
  }, [current, location]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !joining) dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, joining]);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="championship-match-start-title"
      aria-describedby="championship-match-start-description"
      className="relative w-[min(22rem,calc(100vw-1.5rem))] overflow-x-hidden rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl"
      style={{ position: "fixed", top: "5.5rem", right: "1rem", zIndex: 200 }}
    >
      <button
        type="button"
        aria-label="Close"
        disabled={joining}
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-col items-center text-center pr-6">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-violet-700 text-white" aria-hidden="true">
          <Trophy size={18} />
        </span>
        <h2 id="championship-match-start-title" className="mt-2 text-lg font-black tracking-tight">
          🏆 {title}
        </h2>
        <p className="mt-3 min-w-0 w-full text-base font-black leading-snug text-slate-900">
          <span className="break-words">{current.teamAName}</span>
          <span className="mx-2 text-[10px] font-black tracking-widest text-slate-400">VS</span>
          <span className="break-words">{current.teamBName}</span>
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700">
          <Radio size={12} className="text-red-600" aria-hidden="true" />
          Live
        </p>
        <p id="championship-match-start-description" className="mt-2 text-sm text-slate-600">
          {current.message || (isPlayer
            ? "The match has started. Join now to play."
            : "The match is already live.")}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          className="h-10 w-full"
          disabled={joining}
          onClick={() => { if (isPlayer) void joinPlayerMatch(); else openAdminMatch(); }}
        >
          {joining ? "Joining…" : actionLabel}
        </Button>
        <Button variant="ghost" className="h-10 w-full" disabled={joining} onClick={dismiss}>
          {dismissLabel}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
