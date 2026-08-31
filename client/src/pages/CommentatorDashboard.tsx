import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, LogOut, Mic, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { FaithIQLockup } from "@/components/championship/game/FaithIQTreeMark";
import { TeamAvatar } from "@/components/championship/TeamAvatar";
import { onEvent, sendGameEvent, setupGameSocket } from "@/lib/socket";

type CommentatorDashboardPayload = {
  championship: { id: string; name: string; status: string } | null;
  liveMatch: {
    id: string;
    status: string;
    teamAScore: number;
    teamBScore: number;
  } | null;
  teamA: { id: string; name: string; emoticon: string; logoUrl?: string | null } | null;
  teamB: { id: string; name: string; emoticon: string; logoUrl?: string | null } | null;
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

  useEffect(() => {
    if (!data?.liveMatch?.id) return;
    sendGameEvent({ type: "watch_match", matchId: data.liveMatch.id });
  }, [data?.liveMatch?.id]);

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
          You control when the live championship match moves to the next question.
        </p>

        {isLoading && (
          <div className="mt-12 grid place-items-center text-white/70">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}

        {!isLoading && !data?.championship && (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-lg font-bold text-white">No championship assigned</p>
            <p className="mt-2 text-sm text-white/55">
              An administrator needs to assign you to a championship before you can commentate.
            </p>
          </div>
        )}

        {data?.championship && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Championship</p>
            <h2 className="mt-1 text-2xl font-black text-white">{data.championship.name}</h2>

            {data.liveMatch && data.teamA && data.teamB ? (
              <div className="mt-6 rounded-2xl border border-[#d4af37]/35 bg-[#d4af37]/10 p-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-red-300">
                  <Radio className="h-4 w-4" />
                  Current match · Live
                </p>
                <div className="mt-4 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamAvatar logoUrl={data.teamA.logoUrl} emoticon={data.teamA.emoticon} alt={`${data.teamA.name} logo`} className="h-12 w-12 text-3xl" />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-white">{data.teamA.name}</p>
                      <p className="text-3xl font-black tabular-nums text-[#f0d58a]">{data.liveMatch.teamAScore}</p>
                    </div>
                  </div>
                  <span className="text-center text-xs font-black tracking-[0.2em] text-white/35">VS</span>
                  <div className="flex min-w-0 items-center justify-end gap-3 text-right">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-white">{data.teamB.name}</p>
                      <p className="text-3xl font-black tabular-nums text-[#f0d58a]">{data.liveMatch.teamBScore}</p>
                    </div>
                    <TeamAvatar logoUrl={data.teamB.logoUrl} emoticon={data.teamB.emoticon} alt={`${data.teamB.name} logo`} className="h-12 w-12 text-3xl" />
                  </div>
                </div>
                <Button
                  className="mt-6 h-12 w-full bg-accent text-primary font-black hover:bg-accent/90 sm:w-auto sm:px-8"
                  onClick={() => setLocation(`/commentator/match/${data.liveMatch!.id}`)}
                >
                  Open match
                </Button>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <p className="text-base font-bold text-white">No live match currently.</p>
                <p className="mt-1 text-sm text-white/50">
                  When an administrator starts a match in this championship, it will appear here.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
