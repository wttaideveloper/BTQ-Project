import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  formatShortDate,
  matchOutcome,
  type ChampionshipMatchSummary,
  type ChampionshipTeamSummary,
} from "@/lib/championship";
import { TeamAvatar } from "./TeamAvatar";

/**
 * Result of one completed Championship match, shown in place on
 * /my-championship instead of sending the player to the spectator page.
 *
 * PRESENTATION ONLY. It fetches nothing and decides nothing: the match, the two
 * teams and the player's own team all come from data the page has already
 * loaded, and the win/lose/draw verdict comes from the shared matchOutcome()
 * helper - the same function the match cards already use - so no result rule is
 * duplicated or re-derived here.
 *
 * Styling reuses the .champ-* tokens introduced for the Championship gameplay
 * screen, so the result reads as part of the same tournament design.
 */
export function MatchResultModal({
  match,
  teamA,
  teamB,
  myTeamId,
  onClose,
}: {
  /** The completed match to show; null keeps the dialog closed. */
  match: ChampionshipMatchSummary | null;
  teamA?: ChampionshipTeamSummary;
  teamB?: ChampionshipTeamSummary;
  /** The player's team id, or null when they are not in this championship. */
  myTeamId?: string | null;
  onClose: () => void;
}) {
  if (!match) return null;

  const outcome = matchOutcome(match, myTeamId);
  const isDraw = !match.winnerTeamId;
  const winner = match.winnerTeamId === teamA?.id ? teamA : match.winnerTeamId === teamB?.id ? teamB : null;
  const playedOn = formatShortDate(match.completedAt);

  const verdict =
    outcome === "won"
      ? { label: "You won", className: "border-emerald-400/50 bg-emerald-400/15 text-emerald-700" }
      : outcome === "lost"
        ? { label: "You lost", className: "border-[#1b2559]/20 bg-[#1b2559]/5 text-[#1b2559]/70" }
        : outcome === "draw"
          ? { label: "You drew", className: "border-sky-400/40 bg-sky-400/10 text-sky-700" }
          : null;

  const teamRow = (team: ChampionshipTeamSummary | undefined, fallback: string, score: number, teamId: string) => {
    const isWinner = !isDraw && match.winnerTeamId === teamId;
    const isMine = !!myTeamId && teamId === myTeamId;
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
          isWinner ? "border-[#d8b25f] bg-[#d8b25f]/15" : "border-[#1b2559]/10 bg-white/50"
        }`}
      >
        <TeamAvatar logoUrl={team?.logoUrl} emoticon={team?.emoticon} alt={`${team?.name ?? fallback} logo`} className="h-7 w-7 shrink-0 text-2xl" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-[#1b2559]">{team?.name ?? fallback}</span>
          {isMine && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#1b2559]/45">Your team</span>
          )}
        </span>
        {isMine && verdict && (
          <span
            className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${verdict.className}`}
          >
            {verdict.label.toUpperCase()}
          </span>
        )}
        <span
          className={`shrink-0 text-2xl font-black tabular-nums ${
            isWinner ? "text-[#1b2559]" : "text-[#1b2559]/55"
          }`}
        >
          {score}
        </span>
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="champ-panel max-w-md gap-0 border-none p-0 text-white sm:rounded-2xl">
        <div className="px-5 pb-4 pt-5 text-center">
          <DialogTitle className="text-[11px] font-black uppercase tracking-[0.2em] champ-gold-text">
            FaithIQ Championship
          </DialogTitle>
          <DialogDescription className="mt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">
            Match result
          </DialogDescription>
        </div>

        <div className="champ-card rounded-t-[2rem] border-t border-[#d8b25f]/70 px-4 py-6 sm:px-6">
          <div className="space-y-2">
            {teamRow(teamA, "Team A", match.teamAScore, match.teamAId)}
            <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-[#1b2559]/35">vs</p>
            {teamRow(teamB, "Team B", match.teamBScore, match.teamBId)}
          </div>

          <div className="my-5 h-px bg-gradient-to-r from-transparent via-[#d8b25f]/60 to-transparent" />

          <div className="text-center">
            {isDraw ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#1b2559]/45">Result</p>
                <p className="mt-1 text-2xl font-black text-[#1b2559]">Draw</p>
              </>
            ) : (
              <>
                <p className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#1b2559]/45">
                  <Trophy className="h-3.5 w-3.5 text-[#b78e3c]" /> Winner
                </p>
                <p className="mt-1 text-2xl font-black text-[#1b2559]">
                  {winner && <TeamAvatar logoUrl={winner.logoUrl} emoticon={winner.emoticon} alt={`${winner.name} logo`} className="mr-1 inline-grid h-6 w-6 align-middle text-xl" />}{winner?.name ?? "—"}
                </p>
              </>
            )}

            {playedOn && <p className="mt-3 text-xs text-[#1b2559]/50">Played {playedOn}</p>}
          </div>
        </div>

        <div className="p-4">
          <Button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-[#f0d08a] to-[#c99f45] font-bold text-[#1b2559] hover:from-[#f5dca6] hover:to-[#d8b25f]"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
