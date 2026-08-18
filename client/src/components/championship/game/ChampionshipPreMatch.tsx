import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChampionshipStatusPanel } from "./ChampionshipResult";

export interface CaptainReadiness {
  teamACaptainReady: boolean;
  teamBCaptainReady: boolean;
  bothCaptainsReady: boolean;
  /** Decided by the server from the battle's captain ids. */
  canStart: boolean;
}

/**
 * Championship pre-match lobby.
 *
 * Shown between joining and kick-off. It starts nothing by itself: pressing
 * Start Match sends the existing `start_team_battle` event, and the server's
 * attendance guard remains the authority on whether play may begin. Readiness
 * comes from the server's `captains_ready` payload - this screen never infers
 * who has arrived.
 */
export function ChampionshipPreMatch({
  readiness,
  teamAName,
  teamBName,
  starting,
  onStart,
}: {
  /** Null until the server has answered the arrival ping. */
  readiness: CaptainReadiness | null;
  teamAName?: string;
  teamBName?: string;
  starting: boolean;
  onStart: () => void;
}) {
  if (!readiness) {
    return (
      <ChampionshipStatusPanel
        title="Joining the match"
        description="Taking your place at the championship table…"
      />
    );
  }

  const { bothCaptainsReady, canStart } = readiness;

  const row = (name: string, ready: boolean) => (
    <li
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold ${
        ready
          ? "border-[#4fd1a5]/40 bg-[#4fd1a5]/10 text-[#7ee2be]"
          : "border-[#1b2559]/15 bg-[#1b2559]/[0.04] text-[#1b2559]/55"
      }`}
    >
      <span className="truncate">{name}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-[0.14em]">
        {ready ? "✓ Ready" : "◌ Waiting"}
      </span>
    </li>
  );

  return (
    <ChampionshipStatusPanel
      title={bothCaptainsReady ? "Both captains ready" : "Waiting for opposing captain"}
      description={
        bothCaptainsReady
          ? canStart
            ? "Both captains are here. Start when your teams are ready."
            : "Both captains are ready. Waiting for the captain to start…"
          : "Waiting for both team captains to join before starting."
      }
    >
      <div className="w-full">
        <ul className="mx-auto flex max-w-xs flex-col gap-2">
          {row(teamAName ?? "Team A", readiness.teamACaptainReady)}
          {row(teamBName ?? "Team B", readiness.teamBCaptainReady)}
        </ul>

        {canStart && (
          <div className="mt-5 flex justify-center">
            <Button
              onClick={onStart}
              disabled={!bothCaptainsReady || starting}
              className="champ-btn-gold w-full text-base sm:w-auto sm:min-w-56"
            >
              {starting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
              {starting ? "Starting…" : "Start match"}
            </Button>
          </div>
        )}
      </div>
    </ChampionshipStatusPanel>
  );
}
