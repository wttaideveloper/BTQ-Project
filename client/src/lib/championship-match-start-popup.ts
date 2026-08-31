export const CHAMPIONSHIP_FOCUS_LIVE_EVENT = "championship-focus-live";
export const CHAMPIONSHIP_FOCUS_LIVE_KEY = "championship-focus-live";
export const MATCH_START_POPUP_SEEN_KEY = "championship-match-start-seen";

export type MatchStartPopupRole = "admin" | "player";

export type MatchStartPopupEvent = {
  notificationId?: string;
  matchId?: string;
  championshipId?: string;
  championshipName?: string;
  teamAName?: string;
  teamBName?: string;
  role?: MatchStartPopupRole | string;
  message?: string;
};

export type MatchStartPopupItem = {
  id: string;
  matchId?: string;
  championshipId?: string;
  championshipName?: string;
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

/**
 * Remove leftover match-start dialog portals. A trapped overlay (Radix
 * `bg-black/80` + `#root { overflow-x: hidden }`) paints as a solid black
 * slab in the admin content column even after the popup is unmounted by React.
 */
export function stripTrappedMatchStartOverlays(): void {
  if (typeof document === "undefined") return;

  const isMatchStartUi = (node: Element) => {
    const text = node.textContent ?? "";
    return /Match Started|Your Match Is Live/.test(text) && /Open Match|Join Match/.test(text);
  };

  document.querySelectorAll("[aria-label='Dismiss match started popup']").forEach(node => {
    node.parentElement?.remove() ?? node.remove();
  });

  for (const overlay of document.querySelectorAll("[data-radix-dialog-overlay]")) {
    const portal = overlay.parentElement;
    const dialog = portal?.querySelector("[role='dialog']");
    if (dialog && isMatchStartUi(dialog)) {
      portal?.remove();
      continue;
    }
    if (portal?.querySelector("[role='dialog']")) continue;
    overlay.remove();
    if (portal && portal.childElementCount === 0) portal.remove();
  }
}

export function isPublicWatchPath(pathname: string): boolean {
  return pathname.startsWith("/watch/") || pathname.startsWith("/overlay/") || pathname.startsWith("/broadcast/");
}

export function isAdminAppPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Watch Live / Overlay stay silent. Admin and player pages both show the
 * compact match-start card (no full-screen overlay).
 */
export function shouldSuppressMatchStartPopup(
  _event: Pick<MatchStartPopupEvent, "role">,
  ctx: { pathname: string; liveDeskPresent?: boolean },
): boolean {
  return isPublicWatchPath(ctx.pathname);
}

/** Hide empty strings and UUID-looking values. Real names pass through. */
export function sanitizeChampionshipName(value?: string | null): string | undefined {
  const name = value?.replace(/\s+/g, " ").trim();
  if (!name) return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return undefined;
  return name;
}

export function championshipNameFromCaches(
  championshipId: string | undefined,
  caches: {
    list?: Array<{ id?: string; name?: string }> | null;
    detail?: { championship?: { id?: string; name?: string }; name?: string } | null;
    dashboard?: { championship?: { id?: string; name?: string } | null } | null;
  },
): string | undefined {
  if (championshipId) {
    const listName = caches.list?.find(item => item.id === championshipId)?.name;
    const detailChamp = caches.detail?.championship;
    const detailName = !detailChamp?.id || detailChamp.id === championshipId
      ? (detailChamp?.name ?? caches.detail?.name)
      : undefined;
    const dash = caches.dashboard?.championship;
    const dashName = dash?.id === championshipId ? dash.name : undefined;
    return sanitizeChampionshipName(listName)
      ?? sanitizeChampionshipName(detailName)
      ?? sanitizeChampionshipName(dashName);
  }
  return sanitizeChampionshipName(caches.dashboard?.championship?.name);
}

export function markMatchStartPopupIdentities(
  state: MatchStartPopupState,
  event: Pick<MatchStartPopupEvent, "notificationId" | "matchId">,
): MatchStartPopupState {
  return matchStartPopupIdentities(event).reduce(
    (next, id) => markMatchStartPopupSeen(next, id),
    state,
  );
}

export function matchStartPopupCopy(role: MatchStartPopupRole): {
  title: string;
  body: string;
  action: string;
  dismiss: string;
} {
  if (role === "player") {
    return {
      title: "Your Match Is Live!",
      body: "Your match has started. Join now to play.",
      action: "Join Match",
      dismiss: "Later",
    };
  }
  return {
    title: "Match Started",
    body: "This match is now live.",
    action: "Open Match",
    dismiss: "Close",
  };
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

export function matchStartPopupIdentities(event: Pick<MatchStartPopupEvent, "notificationId" | "matchId">): string[] {
  const ids: string[] = [];
  if (event.notificationId) ids.push(event.notificationId);
  if (event.matchId) ids.push(`match:${event.matchId}`);
  return ids;
}

export function emptyMatchStartPopupState(seen: string[] = []): MatchStartPopupState {
  return { current: null, queue: [], seen };
}

export function enqueueMatchStartPopup(
  state: MatchStartPopupState,
  event: MatchStartPopupEvent,
): MatchStartPopupState {
  const identities = matchStartPopupIdentities(event);
  const id = matchStartPopupIdentity(event);
  if (!id || identities.length === 0) return state;
  if (
    identities.some(item => state.seen.includes(item) || state.current?.id === item || state.queue.some(queued => item === queued.id))
    || (event.matchId && (state.current?.matchId === event.matchId || state.queue.some(queued => queued.matchId === event.matchId)))
  ) {
    return state;
  }
  const item: MatchStartPopupItem = {
    id,
    matchId: event.matchId,
    championshipId: event.championshipId,
    championshipName: sanitizeChampionshipName(event.championshipName),
    teamAName: event.teamAName?.trim() || "Team A",
    teamBName: event.teamBName?.trim() || "Team B",
    role: event.role === "player" ? "player" : "admin",
    message: event.message?.trim() || (event.role === "player"
      ? `${event.teamAName || "Team A"} vs ${event.teamBName || "Team B"} has started. Join now to play.`
      : `${event.teamAName || "Team A"} vs ${event.teamBName || "Team B"} is now LIVE.`),
  };
  const seen = [...state.seen, ...identities];
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
