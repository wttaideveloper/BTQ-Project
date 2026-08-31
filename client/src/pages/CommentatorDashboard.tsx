import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CalendarDays, Loader2, LogOut, Mic, Radio, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { formatKickoff } from "@/lib/championship";
import { FaithIQLockup } from "@/components/championship/game/FaithIQTreeMark";
import { TeamAvatar } from "@/components/championship/TeamAvatar";
import { onEvent, setupGameSocket } from "@/lib/socket";

type DeskTeam = { id: string; name: string; emoticon: string; logoUrl?: string | null } | null;

type DeskMatch = {
  championship: { id: string; name: string; status: string };
  match: {
    id: string;
    status: string;
    teamAScore: number;
    teamBScore: number;
    scheduledAt?: string | Date | null;
    winnerTeamId?: string | null;
  };
  teamA: DeskTeam;
  teamB: DeskTeam;
};

type CommentatorDashboardPayload = {
  liveMatches: DeskMatch[];
  upcomingMatches: DeskMatch[];
  recentMatches: DeskMatch[];
};

export default function CommentatorDashboard() {
  const [, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { data, isLoading, refetch } = useQuery<CommentatorDashboardPayload>({
    queryKey: ["/api/commentator/dashboard"],
    refetchInterval: 10_000,
  });

  useEffect(() => {
    setupGameSocket();
    const offStarted = onEvent("match_started", () => { void refetch(); });
    const offEnded = onEvent("match_ended", () => { void refetch(); });
    const offUpdated = onEvent("match_updated", () => { void refetch(); });
    const offConnected = onEvent("connection_established", () => { void refetch(); });
    return () => {
      offStarted();
      offEnded();
      offUpdated();
      offConnected();
    };
  }, [refetch]);

  const liveMatches = data?.liveMatches ?? [];
  const upcomingMatches = data?.upcomingMatches ?? [];
  const recentMatches = data?.recentMatches ?? [];
  const empty = !isLoading && liveMatches.length === 0 && upcomingMatches.length === 0 && recentMatches.length === 0;

  return (
    <main className="champ-portal min-h-screen font-heading">
      <header className="border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <FaithIQLockup compact />
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-white/50 sm:inline">
              {user?.username}
            </span>
            <Button
              variant="ghost"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => setLocation("/commentator/login") })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-[#f0d58a]">
          <Mic className="h-4 w-4" />
          FaithIQ Commentator
        </p>
        <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Commentator Desk</h1>
        <p className="mt-2 max-w-xl text-sm text-white/60">
          Open a live championship match to send the next question. You can commentate any championship match.
        </p>

        {isLoading && (
          <div className="mt-12 grid place-items-center text-white/70">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}

        {empty && (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-lg font-bold text-white">No championship matches yet</p>
            <p className="mt-2 text-sm text-white/55">
              When an administrator starts a championship match, it will appear here.
            </p>
          </div>
        )}

        {!isLoading && liveMatches.length > 0 && (
          <MatchSection
            icon={<Radio className="h-4 w-4" />}
            title={liveMatches.length === 1 ? "Live match" : "Live matches"}
            tone="live"
          >
            {liveMatches.map(item => (
              <LiveMatchCard
                key={item.match.id}
                item={item}
                onOpen={() => setLocation(`/commentator/match/${item.match.id}`)}
              />
            ))}
          </MatchSection>
        )}

        {!isLoading && liveMatches.length === 0 && !empty && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-base font-bold text-white">No live match currently</p>
            <p className="mt-1 text-sm text-white/50">
              When a championship match goes live, open it from this desk.
            </p>
          </div>
        )}

        {!isLoading && upcomingMatches.length > 0 && (
          <MatchSection icon={<CalendarDays className="h-4 w-4" />} title="Upcoming" tone="muted">
            {upcomingMatches.map(item => (
              <CompactMatchRow
                key={item.match.id}
                item={item}
                meta={formatKickoff(item.match.scheduledAt) ?? "Time TBA"}
                actionLabel="Open desk"
                onOpen={() => setLocation(`/commentator/match/${item.match.id}`)}
              />
            ))}
          </MatchSection>
        )}

        {!isLoading && recentMatches.length > 0 && (
          <MatchSection icon={<Trophy className="h-4 w-4" />} title="Recent results" tone="muted">
            {recentMatches.map(item => (
              <CompactMatchRow
                key={item.match.id}
                item={item}
                meta={`${item.match.teamAScore} – ${item.match.teamBScore}`}
                actionLabel="View"
                onOpen={() => setLocation(`/commentator/match/${item.match.id}`)}
              />
            ))}
          </MatchSection>
        )}
      </section>
    </main>
  );
}

function MatchSection({
  icon,
  title,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone: "live" | "muted";
  children: ReactNode;
}) {
  return (
    <div className="mt-8">
      <p className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] ${
        tone === "live" ? "text-red-300" : "text-white/40"
      }`}>
        {icon}
        {title}
      </p>
      <div className="mt-3 grid gap-3">{children}</div>
    </div>
  );
}

function LiveMatchCard({ item, onOpen }: { item: DeskMatch; onOpen: () => void }) {
  return (
    <div className="rounded-2xl border border-[#d4af37]/35 bg-[#d4af37]/10 p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">{item.championship.name}</p>
      <div className="mt-4 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <TeamScore team={item.teamA} score={item.match.teamAScore} align="left" />
        <span className="text-center text-xs font-black tracking-[0.2em] text-white/35">VS</span>
        <TeamScore team={item.teamB} score={item.match.teamBScore} align="right" />
      </div>
      <Button
        className="mt-6 h-12 w-full bg-accent text-primary font-black hover:bg-accent/90 sm:w-auto sm:px-8"
        onClick={onOpen}
      >
        Open match
      </Button>
    </div>
  );
}

function CompactMatchRow({
  item,
  meta,
  actionLabel,
  onOpen,
}: {
  item: DeskMatch;
  meta: string;
  actionLabel: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">{item.championship.name}</p>
        <p className="mt-1 truncate text-sm font-bold text-white">
          {item.teamA?.name ?? "Team A"} vs {item.teamB?.name ?? "Team B"}
        </p>
        <p className="text-xs text-white/50">{meta}</p>
      </div>
      <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={onOpen}>
        {actionLabel}
      </Button>
    </div>
  );
}

function TeamScore({ team, score, align }: { team: DeskTeam; score: number; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamAvatar logoUrl={team?.logoUrl} emoticon={team?.emoticon ?? "👏"} alt={`${team?.name ?? "Team"} logo`} className="h-12 w-12 text-3xl" />
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-white">{team?.name ?? "—"}</p>
        <p className="text-3xl font-black tabular-nums text-[#f0d58a]">{score}</p>
      </div>
    </div>
  );
}
