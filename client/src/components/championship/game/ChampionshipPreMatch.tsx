import { Check, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChampionshipStatusPanel } from "./ChampionshipResult";
import {
  canCaptainToggleReady,
  championshipPrematchCopy,
  isRosterMemberJoined,
  prematchMembersFromTeam,
  type PrematchMember,
  type PrematchTeam,
} from "@/lib/championship-prematch";

export type { PrematchMember, PrematchTeam };

function PresenceMark({ joined }: { joined: boolean | null }) {
  if (joined === null) {
    return <span className="text-[11px] font-semibold text-[#1b2559]/45">… Checking</span>;
  }
  if (joined) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1b7a58]">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Joined
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1b2559]/50">
      <Circle className="h-3 w-3" aria-hidden="true" />
      Not joined
    </span>
  );
}

function TeamReadyBadge({ ready }: { ready: boolean }) {
  if (ready) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#4fd1a5]/50 bg-[#4fd1a5]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1b7a58]">
        ✓ Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#1b2559]/15 bg-[#1b2559]/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1b2559]/55">
      ⏳ Waiting for captain
    </span>
  );
}

function RosterRow({
  member,
  joined,
}: {
  member: PrematchMember;
  joined: boolean | null;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-[#1b2559]/10 bg-white/40 px-3 py-2 text-left">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-[#1b2559]">{member.username}</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1b2559]/45">
          {member.role === "captain" ? "Captain" : "Member"}
        </p>
      </div>
      <div className="shrink-0 pt-0.5">
        <PresenceMark joined={joined} />
      </div>
    </li>
  );
}

/**
 * Championship pre-match lobby.
 *
 * Captains mark READY through the existing Team Battle ready events.
 * This screen never starts gameplay and never treats arrival as READY.
 */
export function ChampionshipPreMatch({
  teamA,
  teamB,
  teamAReady,
  teamBReady,
  presentUserIds,
  countdown,
  currentUserId,
  readyPending,
  onReady,
  onUnready,
}: {
  teamA?: PrematchTeam | null;
  teamB?: PrematchTeam | null;
  teamAReady: boolean;
  teamBReady: boolean;
  presentUserIds: number[] | null;
  countdown: number | null;
  currentUserId?: number;
  readyPending: boolean;
  onReady: () => void;
  onUnready: () => void;
}) {
  const teamAName = teamA?.name || "Team A";
  const teamBName = teamB?.name || "Team B";
  const copy = championshipPrematchCopy({
    teamAName,
    teamBName,
    teamAReady,
    teamBReady,
    countdown,
  });

  const renderTeam = (team: PrematchTeam | null | undefined, fallbackName: string, ready: boolean) => {
    const name = team?.name || fallbackName;
    const members = prematchMembersFromTeam(team);
    const viewerIsCaptain = canCaptainToggleReady({
      currentUserId,
      captainId: team?.captainId,
      countdown,
    });
    const viewerOnThisTeam = members.some((member) => member.userId === currentUserId);

    return (
      <section className="min-w-0 rounded-xl border border-[#1b2559]/10 bg-[#1b2559]/[0.03] p-3 text-left sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="break-words text-sm font-bold uppercase tracking-[0.16em] text-[#1b2559]">
            {name}
          </h3>
          <TeamReadyBadge ready={ready} />
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {members.length === 0 ? (
            <li className="rounded-lg border border-dashed border-[#1b2559]/15 px-3 py-2 text-sm text-[#1b2559]/50">
              Waiting for captain
            </li>
          ) : (
            members.map((member) => (
              <RosterRow
                key={member.userId}
                member={member}
                joined={isRosterMemberJoined(member.userId, presentUserIds)}
              />
            ))
          )}
        </ul>

        {viewerIsCaptain && !ready && (
          <Button
            onClick={onReady}
            disabled={readyPending}
            className="champ-btn-gold mt-4 w-full text-sm"
          >
            {readyPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {readyPending ? "Marking ready…" : "I'm Ready!"}
          </Button>
        )}
        {viewerIsCaptain && ready && !(teamAReady && teamBReady) && countdown == null && (
          <Button
            onClick={onUnready}
            disabled={readyPending}
            variant="outline"
            className="mt-4 w-full border-[#1b2559]/20 text-sm text-[#1b2559]"
          >
            {readyPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {readyPending ? "Cancelling…" : "Cancel Ready"}
          </Button>
        )}
        {viewerOnThisTeam && !viewerIsCaptain && (
          <p className="mt-3 text-center text-xs font-semibold text-[#1b2559]/55">
            Waiting for your captain...
          </p>
        )}
      </section>
    );
  };

  return (
    <ChampionshipStatusPanel title={copy.title} description={copy.description}>
      <div className="w-full max-w-2xl">
        {countdown != null && countdown > 0 && (
          <p
            className="mb-4 text-center text-4xl font-black tabular-nums text-[#1b2559]"
            aria-live="polite"
          >
            {countdown}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {renderTeam(teamA, "Team A", teamAReady)}
          {renderTeam(teamB, "Team B", teamBReady)}
        </div>
      </div>
    </ChampionshipStatusPanel>
  );
}
