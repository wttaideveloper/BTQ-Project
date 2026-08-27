export const CHAMPIONSHIP_FOCUS_LIVE_EVENT = "championship-focus-live";
export const CHAMPIONSHIP_FOCUS_LIVE_KEY = "championship-focus-live";
export const MATCH_START_POPUP_SEEN_KEY = "championship-match-start-seen";

export type MatchStartPopupRole = "admin" | "player";

export type MatchStartPopupEvent = {
  notificationId?: string;
  matchId?: string;
  championshipId?: string;
  teamAName?: string;
  teamBName?: string;
  role?: MatchStartPopupRole | string;
  message?: string;
};

export type MatchStartPopupItem = {
  id: string;
  matchId?: string;
  championshipId?: string;
  teamAName: string;
  teamBName: string;
  role: MatchStartPopupRole;
  message: string;
};

export type MatchStartPopupState = {
  current: MatchStartPopupItem | null;
  queue: MatchStartPopupItem[];
  seen: string[];
};

export function isPublicWatchPath(pathname: string): boolean {
  return pathname.startsWith("/watch/") || pathname.startsWith("/overlay/");
}

export function isAdminAppPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Never show the match-start popup in the admin app. Operators already have
 * Live Match Control, and a full-screen overlay paints as a black slab there.
 * Watch/Overlay stay silent. On player pages, skip only when the live desk
 * is already mounted (should not happen outside admin).
 */
export function shouldSuppressMatchStartPopup(
  _event: Pick<MatchStartPopupEvent, "role">,
  ctx: { pathname: string; liveDeskPresent: boolean },
): boolean {
  if (isPublicWatchPath(ctx.pathname) || isAdminAppPath(ctx.pathname)) return true;
  return ctx.liveDeskPresent;
}

export function markMatchStartPopupSeen(state: MatchStartPopupState, id: string | null): MatchStartPopupState {
  if (!id || state.seen.includes(id)) return state;
  return { ...state, seen: [...state.seen, id] };
}

export function matchStartPopupIdentity(event: Pick<MatchStartPopupEvent, "notificationId" | "matchId">): string | null {
  if (event.notificationId) return event.notificationId;
  if (event.matchId) return `match:${event.matchId}`;
  return null;
}

export function emptyMatchStartPopupState(seen: string[] = []): MatchStartPopupState {
  return { current: null, queue: [], seen };
}

export function enqueueMatchStartPopup(
  state: MatchStartPopupState,
  event: MatchStartPopupEvent,
): MatchStartPopupState {
  const id = matchStartPopupIdentity(event);
  if (!id) return state;
  if (state.seen.includes(id) || state.current?.id === id || state.queue.some(item => item.id === id)) {
    return state;
  }
  const item: MatchStartPopupItem = {
    id,
    matchId: event.matchId,
    championshipId: event.championshipId,
    teamAName: event.teamAName?.trim() || "Team A",
    teamBName: event.teamBName?.trim() || "Team B",
    role: event.role === "player" ? "player" : "admin",
    message: event.message?.trim() || (event.role === "player"
      ? `${event.teamAName || "Team A"} vs ${event.teamBName || "Team B"} has started. Join now to play.`
      : `${event.teamAName || "Team A"} vs ${event.teamBName || "Team B"} is now LIVE.`),
  };
  const seen = [...state.seen, id];
  if (!state.current) return { current: item, queue: state.queue, seen };
  return { current: state.current, queue: [...state.queue, item], seen };
}

export function dismissMatchStartPopup(state: MatchStartPopupState): MatchStartPopupState {
  const [next, ...rest] = state.queue;
  return { current: next ?? null, queue: rest, seen: state.seen };
}

export function readSeenPopupIds(): string[] {
  try {
    const raw = sessionStorage.getItem(MATCH_START_POPUP_SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeSeenPopupIds(ids: string[]): void {
  try {
    sessionStorage.setItem(MATCH_START_POPUP_SEEN_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // sessionStorage can throw in private mode; in-memory seen still prevents duplicates this session.
  }
}

export function focusLiveMatchDesk(detail?: { championshipId?: string; matchId?: string }) {
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
