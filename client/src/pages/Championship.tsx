import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";

export default function Championship() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useQuery<any>({
    queryKey: ["/api/championships", id, "broadcast"],
    queryFn: async () => {
      const response = await fetch(`/api/championships/${id}?view=broadcast`);
      if (!response.ok) throw new Error("Could not load championship");
      return response.json();
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });
  if (!data) return <div className="min-h-screen grid place-items-center">{error ? "Championship is temporarily unavailable." : "Loading championship…"}</div>;
  const teams = new Map<string, any>(data.teams.map((team: any) => [team.id, team]));
  const renderMatch = (match: any) => <div key={match.id} className="flex justify-between items-center gap-3 py-2 border-b border-white/10 last:border-0">
    <div className="min-w-0">
      <b className="text-sm">{teams.get(match.teamAId)?.name} vs {teams.get(match.teamBId)?.name}</b>
      <p className="text-xs text-slate-400">{match.status === "completed"
        ? `${match.teamAScore} – ${match.teamBScore}`
        : match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : "Time to be announced"}</p>
    </div>
    {match.status === "live" && <Link href={`/watch/${match.id}`} className="shrink-0 bg-red-500 px-3 py-2 rounded-lg font-bold text-sm">Watch Live</Link>}
  </div>;
  return <main className="min-h-screen bg-slate-950 text-white p-5"><div className="max-w-6xl mx-auto">
    <p className="text-amber-400 uppercase tracking-widest font-bold text-xs">FaithIQ Championship</p>
    <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
      <div><h1 className="text-3xl font-black">{data.championship.name}</h1><p className="text-slate-400 text-sm mt-1">{data.championship.description}</p></div>
      <Link href="/my-championship" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10">Back to My Championship</Link>
    </div>
    {data.champion && <div className="my-4 p-3 rounded-xl bg-amber-400 text-slate-950 text-lg font-black">🏆 Champion: {data.champion.name}</div>}
    <div className="grid lg:grid-cols-3 gap-5 mt-5">
      <section className="bg-white/5 rounded-2xl p-4"><h2 className="text-xl font-bold mb-3">Standings</h2>
        {data.standings.map((team: any, index: number) => <div className="grid grid-cols-[1.5rem_1fr_repeat(4,2.5rem)] gap-1 py-3 border-b border-white/10 text-sm" key={team.id}>
          <b>{index + 1}</b><Link href={`/championship-teams/${team.id}`} className="text-cyan-300 hover:underline">{team.name}</Link><span>{team.played}P</span><span>{team.wins}W</span><span>{team.losses}L</span><b>{team.points}pts</b>
        </div>)}
      </section>
      <div className="grid sm:grid-cols-2 gap-3 content-start lg:col-span-2">
        {data.liveMatches.length > 0 && <section className="bg-red-500/10 rounded-xl px-4 py-3 sm:col-span-2"><h2 className="font-bold text-red-300">Live now</h2>{data.liveMatches.map(renderMatch)}</section>}
        {data.upcomingMatches.length > 0 && <section className="bg-white/5 rounded-xl px-4 py-3"><h2 className="font-bold">Next {data.upcomingMatches.length} {data.upcomingMatches.length === 1 ? "match" : "matches"}</h2>
          {data.upcomingMatches.map(renderMatch)}
        </section>}
        <section className={`bg-white/5 rounded-xl px-4 py-3 ${data.upcomingMatches.length ? "" : "sm:col-span-2"}`}><h2 className="font-bold">Last 5 matches</h2>
          {data.recentMatches.length ? data.recentMatches.map(renderMatch) : <p className="text-sm text-slate-400 py-2">No completed matches yet.</p>}
        </section>
      </div>
    </div>
  </div></main>;
}
