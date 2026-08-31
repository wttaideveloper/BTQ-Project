import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { BroadcastDesk } from "@/components/broadcast/BroadcastDesk";
import { useChampionshipSpectator } from "@/hooks/useChampionshipSpectator";
import { isBroadcastCleanMode } from "@/lib/championship-broadcast";

/**
 * Commentator / operator desk for a championship match.
 * View-only game data. No HLS stream, no gameplay controls.
 */
export default function BroadcastMatch() {
  const { matchId } = useParams<{ matchId: string }>();
  const spectator = useChampionshipSpectator(matchId);
  const clean = typeof window !== "undefined" && isBroadcastCleanMode(window.location.search);
  const [scoreFlash, setScoreFlash] = useState(false);
  const prevScores = useRef<{ a: number; b: number } | null>(null);

  useEffect(() => {
    const next = { a: spectator.teamAScore, b: spectator.teamBScore };
    const previous = prevScores.current;
    prevScores.current = next;
    if (!previous) return;
    if (previous.a === next.a && previous.b === next.b) return;
    setScoreFlash(true);
    const timer = window.setTimeout(() => setScoreFlash(false), 700);
    return () => window.clearTimeout(timer);
  }, [spectator.teamAScore, spectator.teamBScore]);

  if (spectator.isLoading) {
    return <main className="champ-portal grid min-h-[100dvh] place-items-center text-white">Loading match…</main>;
  }
  if (spectator.isError || !spectator.match) {
    return <main className="champ-portal grid min-h-[100dvh] place-items-center text-white">Match not found</main>;
  }

  const status = spectator.match.status ?? "upcoming";
  const winnerName =
    spectator.match.winnerTeamId === spectator.teamA?.id
      ? spectator.teamA?.name
      : spectator.match.winnerTeamId === spectator.teamB?.id
        ? spectator.teamB?.name
        : null;

  return (
    <main className="champ-portal min-h-[100dvh] overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 xl:h-[100dvh] xl:overflow-hidden xl:px-6 xl:py-5">
      <BroadcastDesk
        championshipName={spectator.championshipName}
        status={status}
        gameplayStarted={spectator.gameplayStarted}
        teamA={spectator.teamA}
        teamB={spectator.teamB}
        teamAScore={spectator.teamAScore}
        teamBScore={spectator.teamBScore}
        question={spectator.question}
        questionResult={spectator.questionResult}
        toss={spectator.toss}
        tossResult={spectator.tossResult}
        winnerName={winnerName}
        isDraw={status === "completed" && !spectator.match.winnerTeamId}
        events={spectator.events}
        clean={clean}
        scoreFlash={scoreFlash}
      />
    </main>
  );
}
