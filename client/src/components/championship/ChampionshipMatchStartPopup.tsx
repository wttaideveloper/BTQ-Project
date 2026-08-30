import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Radio, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { markNotificationAsRead, onEvent, setupGameSocket } from "@/lib/socket";
import { apiRequest } from "@/lib/queryClient";
import { navigateToTeamBattleGame } from "@/lib/team-battle-navigation";
import {
  championshipNameFromCaches,
  dismissMatchStartPopup,
  emptyMatchStartPopupState,
  enqueueMatchStartPopup,
  focusLiveMatchDesk,
  isPublicWatchPath,
  markMatchStartPopupIdentities,
  matchStartPopupCopy,
  readSeenPopupIds,
  shouldSuppressMatchStartPopup,
  writeSeenPopupIds,
  type MatchStartPopupEvent,
  type MatchStartPopupState,
} from "@/lib/championship-match-start-popup";

/**
 * Compact championship match-start card for private championship_match_started
 * events. No full-screen backdrop — a trapped overlay painted the admin
 * column black. Delivery stays on sendToUser; this is presentation only.
 */
export function ChampionshipMatchStartPopup({ userId }: { userId?: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<MatchStartPopupState>(() => emptyMatchStartPopupState(readSeenPopupIds()));
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);
  const currentRef = useRef(state.current);
  const skipClickAfterMouseDown = useRef(false);
  const current = state.current;
  joiningRef.current = joining;
  currentRef.current = current;

  useEffect(() => {
    if (!userId) return;

    const offStarted = onEvent("championship_match_started", (data: MatchStartPopupEvent) => {
      const pathname = window.location.pathname;
      if (isPublicWatchPath(pathname)) return;

      queryClient.invalidateQueries({ queryKey: ["/api/championships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/championships/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      const cachedName = championshipNameFromCaches(data.championshipId, {
        list: queryClient.getQueryData(["/api/championships"]),
        detail: data.championshipId
          ? queryClient.getQueryData(["/api/championships", data.championshipId])
          : undefined,
        dashboard: queryClient.getQueryData(["/api/championships/me/dashboard"]),
      });

      setState(currentState => {
        if (shouldSuppressMatchStartPopup(data, { pathname })) {
          const next = markMatchStartPopupIdentities(currentState, data);
          if (next.seen !== currentState.seen) writeSeenPopupIds(next.seen);
          return next;
        }
        const next = enqueueMatchStartPopup(currentState, {
          ...data,
          championshipName: data.championshipName || cachedName,
        });
        if (next.seen !== currentState.seen) writeSeenPopupIds(next.seen);
        return next;
      });
    });

    return () => {
      offStarted();
    };
  }, [userId, queryClient]);

  const dismissCurrent = () => {
    if (joiningRef.current) return;
    const item = currentRef.current;
    if (item?.id && !item.id.startsWith("match:")) {
      markNotificationAsRead(item.id);
    }
    joiningRef.current = false;
    setJoining(false);
    setState(currentState => dismissMatchStartPopup(currentState));
  };

  const onDismissMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    skipClickAfterMouseDown.current = true;
    dismissCurrent();
  };

  const onDismissClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (skipClickAfterMouseDown.current) {
      skipClickAfterMouseDown.current = false;
      return;
    }
    dismissCurrent();
  };

  const openAdminMatch = () => {
    focusLiveMatchDesk({ championshipId: current?.championshipId, matchId: current?.matchId });
    if (!window.location.pathname.startsWith("/admin")) setLocation("/admin/dashboard");
    dismissCurrent();
  };

  const joinPlayerMatch = async () => {
    if (!current?.matchId) {
      setLocation("/my-championship");
      joiningRef.current = false;
      dismissCurrent();
      return;
    }
    joiningRef.current = true;
    setJoining(true);
    try {
      const response = await apiRequest("POST", `/api/championship-matches/${current.matchId}/join`, {});
      const access = await response.json();
      setupGameSocket();
      joiningRef.current = false;
      dismissCurrent();
      window.setTimeout(() => navigateToTeamBattleGame(setLocation, access.gameSessionId), 100);
    } catch (error) {
      toast({
        title: "Unable to join match",
        description: error instanceof Error ? error.message : "Opening My Championship so you can join from there.",
        variant: "destructive",
      });
      setLocation("/my-championship");
      joiningRef.current = false;
      dismissCurrent();
    }
  };

  const isPlayer = current?.role === "player";
  const copy = matchStartPopupCopy(isPlayer ? "player" : "admin");
  const visible = !!current && !isPublicWatchPath(location) && !isPublicWatchPath(window.location.pathname);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissCurrent();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, current?.id]);

  if (!visible || typeof document === "undefined" || !current) return null;

  return createPortal(
    <div
      data-championship-match-start
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="championship-match-start-title"
        aria-describedby="championship-match-start-description"
        className="relative w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-amber-400/35 p-5 text-white shadow-2xl sm:p-6"
        style={{
          pointerEvents: "auto",
          background: "linear-gradient(160deg, #2b1a5a 0%, #110b2e 58%, #0d0824 100%)",
        }}
      >
        <button
          type="button"
          aria-label="Close"
          disabled={joining}
          onMouseDown={onDismissMouseDown}
          onClick={onDismissClick}
          className="absolute right-2 top-2 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center px-1 text-center">
          <span
            className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-violet-700 text-[#171238] shadow-[0_8px_22px_-12px_rgba(212,175,55,0.9)]"
            aria-hidden="true"
          >
            <Trophy size={20} />
          </span>

          {current.championshipName && (
            <div className="mt-3 min-w-0 w-full">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-200/90">Championship</p>
              <p className="mt-1 line-clamp-3 break-words text-sm font-bold text-amber-100">
                {current.championshipName}
              </p>
            </div>
          )}

          <h2 id="championship-match-start-title" className="mt-3 text-xl font-black tracking-tight text-white">
            🏆 {copy.title}
          </h2>

          <div className="mt-4 grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <p className="min-w-0 break-words text-right text-sm font-black leading-snug text-white sm:text-base">
              {current.teamAName}
            </p>
            <p className="shrink-0 text-[10px] font-black tracking-[0.22em] text-amber-200/80" aria-hidden="true">
              VS
            </p>
            <p className="min-w-0 break-words text-left text-sm font-black leading-snug text-white sm:text-base">
              {current.teamBName}
            </p>
          </div>
          <span className="sr-only">{`${current.teamAName} versus ${current.teamBName}`}</span>

          <p
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-200"
            aria-label="Match is live"
          >
            <Radio size={12} className="text-red-400 motion-reduce:animate-none" aria-hidden="true" />
            Live
          </p>

          <p id="championship-match-start-description" className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">
            {copy.body}
          </p>
        </div>

        <div className="relative z-10 mt-5 flex flex-col gap-2">
          <Button
            className="champ-btn-gold h-11 w-full"
            disabled={joining}
            onClick={() => { if (isPlayer) void joinPlayerMatch(); else openAdminMatch(); }}
          >
            {joining ? "Joining…" : copy.action}
          </Button>
          <button
            type="button"
            disabled={joining}
            onMouseDown={onDismissMouseDown}
            onClick={onDismissClick}
            className="champ-btn-ghost flex h-11 w-full cursor-pointer items-center justify-center disabled:opacity-50"
          >
            {copy.dismiss}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
