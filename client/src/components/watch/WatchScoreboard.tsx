/**
 * Broadcast scoreboard and the tap-to-support crests.
 *
 * Scores, teams and the winner all arrive as props from the match payload; the
 * supporter numbers are the live reaction counts the page already tracks. The
 * only interaction is the existing tap-to-support, which the page owns and
 * which stays live-only exactly as before - this screen remains read-only.
 */
export function WatchScoreboard({
  status,
  teamA,
  teamB,
  teamAScore,
  teamBScore,
  supporters,
  winnerTeamId,
  liveQuestion,
  onSupport,
}: {
  status: string;
  teamA?: { id: string; name: string; emoticon: string };
  teamB?: { id: string; name: string; emoticon: string };
  teamAScore: number;
  teamBScore: number;
  supporters: Record<string, number>;
  winnerTeamId?: string | null;
  liveQuestion: number | null;
  onSupport?: (team: { id: string; name: string; emoticon: string }) => void;
}) {
  const side = (team: typeof teamA, fallback: string, align: "left" | "right") => {
    const isWinner = status === "completed" && !!winnerTeamId && team?.id === winnerTeamId;
    return (
      <div className={`min-w-0 flex-1 ${align === "right" ? "text-right" : ""}`}>
        <div className={`flex items-center gap-2.5 ${align === "right" ? "justify-end" : ""}`}>
          <span className="text-2xl leading-none sm:text-3xl" aria-hidden="true">
            {team?.emoticon ?? "🏳️"}
          </span>
          <div className="min-w-0">
            <p className={`truncate font-bold text-white ${isWinner ? "text-[#f0d58a]" : ""}`}>
              {team?.name ?? fallback}
            </p>
            <p className="mt-0.5 text-[11px] champ-meta">
              {(team && supporters[team.id]) ?? 0} supporters
            </p>
          </div>
        </div>
        {isWinner && (
          <span className="mt-2 inline-block rounded-full border border-[#d4af37]/45 bg-[#d4af37]/12 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#f0d58a]">
            Winner
          </span>
        )}
        {status === "live" && team && onSupport && (
          <button
            type="button"
            onClick={() => onSupport(team)}
            aria-label={`Support ${team.name}`}
            className={`watch-support mt-3 rounded-2xl px-3 py-2 text-3xl ${align === "right" ? "ml-auto" : ""} block`}
          >
            {team.emoticon}
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="champ-panel rounded-2xl p-4 sm:p-6" aria-label="Match scoreboard">
      <div className="flex items-start gap-3 sm:gap-6">
        {side(teamA, "Team A", "left")}

        <div className="shrink-0 text-center">
          <p className="champ-scoreline text-4xl font-black text-white sm:text-6xl">
            {teamAScore}
            <span className="mx-2 align-middle text-2xl text-white/20 sm:mx-3 sm:text-3xl">:</span>
            {teamBScore}
          </p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
            {status === "completed"
              ? "Final score"
              : liveQuestion
                ? `Question ${liveQuestion}`
                : status === "live"
                  ? "Live score"
                  : "Not started"}
          </p>
        </div>

        {side(teamB, "Team B", "right")}
      </div>
    </section>
  );
}
