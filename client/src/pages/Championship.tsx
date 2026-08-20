import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";

export default function Championship() {
  const { id } = useParams<{ id: string }>();
  const { data } = useQuery<any>({ queryKey: ["/api/championships", id], queryFn: () => fetch(`/api/championships/${id}`).then(r => r.json()) });
  if (!data) return <div className="min-h-screen grid place-items-center">Loading championship…</div>;
  return <main className="min-h-screen bg-slate-950 text-white p-6"><div className="max-w-6xl mx-auto">
    <p className="text-amber-400 uppercase tracking-widest font-bold text-xs">FaithIQ Championship</p>
    <h1 className="text-4xl font-black mt-2">{data.championship.name}</h1><p className="text-slate-400 mt-2">{data.championship.description}</p>
    <div className="mt-4">
      <Link
        href="/my-championship"
        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 hover:border-white/20"
      >
        Back to My Championship
      </Link>
    </div>
    {data.champion && <div className="my-6 p-5 rounded-2xl bg-amber-400 text-slate-950 text-xl font-black">🏆 Champion: {data.champion.name}</div>}
    <div className="grid lg:grid-cols-2 gap-6 mt-8">
      <section className="bg-white/5 rounded-2xl p-5"><h2 className="text-xl font-bold mb-4">Standings</h2>
        {data.standings.map((t: any, i: number) => <div className="grid grid-cols-[2rem_1fr_repeat(4,3rem)] gap-2 py-3 border-b border-white/10" key={t.id}>
          <b>{i + 1}</b><Link href={`/championship-teams/${t.id}`} className="text-cyan-300 hover:underline">{t.name}</Link><span>{t.played}P</span><span>{t.wins}W</span><span>{t.losses}L</span><b>{t.points}pts</b></div>)}
      </section>
      <section className="bg-white/5 rounded-2xl p-5"><h2 className="text-xl font-bold mb-4">Matches</h2>
        {data.matches.map((m: any) => { const a = data.teams.find((t:any) => t.id === m.teamAId); const b = data.teams.find((t:any) => t.id === m.teamBId); return <div key={m.id} className="flex justify-between items-center py-3 border-b border-white/10">
          <div><b>{a?.name} vs {b?.name}</b><p className="text-xs text-slate-400">{m.status} {m.scheduledAt && `• ${new Date(m.scheduledAt).toLocaleString()}`}</p></div>
          {m.status === "live" && <Link href={`/watch/${m.id}`} className="bg-red-500 px-3 py-2 rounded-lg font-bold">Watch Live</Link>}</div>})}
      </section>
    </div>
  </div></main>;
}
