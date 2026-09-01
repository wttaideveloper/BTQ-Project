/** Existing commentator dashboard query. Do not add a second polling loop. */
export const COMMENTATOR_DASHBOARD_QUERY_KEY = ["/api/commentator/dashboard"] as const;

/** Background poll while the Commentator Desk is open. */
export const COMMENTATOR_DESK_POLL_MS = 15_000;

export type CommentatorDeskPayload<T = unknown> = {
  liveMatches: T[];
  upcomingMatches: T[];
  recentMatches: T[];
};

export function commentatorDeskLists<T>(payload: CommentatorDeskPayload<T> | undefined) {
  const liveMatches = payload?.liveMatches ?? [];
  const upcomingMatches = payload?.upcomingMatches ?? [];
  const recentMatches = payload?.recentMatches ?? [];
  const isEmpty = liveMatches.length === 0 && upcomingMatches.length === 0 && recentMatches.length === 0;
  return {
    liveMatches,
    upcomingMatches,
    recentMatches,
    isEmpty,
    hasLiveMatch: liveMatches.length > 0,
    showsNoLiveMatchCurrently: !isEmpty && liveMatches.length === 0,
  };
}

/** Last successful payload stays on screen when a later request fails. */
export function commentatorDeskVisibleData<T>(data: T | undefined, _isError: boolean): T | undefined {
  return data;
}

export function shouldAcceptCommentatorDeskRefresh(inFlight: boolean): boolean {
  return !inFlight;
}

export function formatCommentatorDeskUpdatedAt(dataUpdatedAt: number, now = Date.now()): string | null {
  if (!dataUpdatedAt) return null;
  const age = now - dataUpdatedAt;
  if (age < COMMENTATOR_DESK_POLL_MS) return "Updated just now";
  return `Last updated ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
