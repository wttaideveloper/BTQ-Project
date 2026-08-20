import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";

export default function ChampionshipTeam() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/championship-teams", id],
    queryFn: async () => {
      const response = await fetch(`/api/championship-teams/${id}`);
      if (!response.ok) throw new Error("Team not found");
      return response.json();
    },
  });
  if (isLoading) return <main className="min-h-screen bg-slate-950 text-white grid place-items-center">Loading team...</main>;
  if (error || !data) return <main className="min-h-screen bg-slate-950 text-white grid place-items-center">Team not found</main>;
  return <main className="min-h-screen bg-slate-950 text-white p-6"><div className="max-w-4xl mx-auto">
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/my-championship"
        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 hover:border-white/20"
      >
        Back to My Championship
      </Link>
      <Link
        href={`/championships/${data.team.championshipId}`}
        className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/15 hover:border-cyan-400/50"
      >
        View Championship Details
      </Link>
    </div>
    <header className="mt-6 rounded-3xl bg-gradient-to-r from-cyan-500/20 to-violet-500/20 border border-white/10 p-8">
      <div className="text-6xl">{data.team.emoticon}</div><h1 className="text-4xl font-black mt-3">{data.team.name}</h1>
      <p className="text-slate-400 mt-2">Championship team</p>
    </header>
    <section className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-6"><h2 className="text-xl font-bold mb-4">Members</h2>
      <div className="grid sm:grid-cols-2 gap-3">{data.members.map((member: any) => <div key={member.id} className="rounded-xl bg-white/5 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-cyan-500/20 grid place-items-center font-bold">{(member.fullName || member.username).charAt(0).toUpperCase()}</div>
        <div><b>{member.fullName || member.username}</b><p className="text-sm text-slate-400">{member.id === data.team.captainId ? "Captain" : "Member"}</p></div>
      </div>)}</div>
    </section>
    <section className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-6"><h2 className="text-xl font-bold mb-4">Matches</h2>
      {data.matches.length === 0 ? <p className="text-slate-400">No matches scheduled.</p> : data.matches.map((match: any) => <div key={match.id} className="border-t border-white/10 py-3 flex justify-between"><span>{match.status}</span><b>{match.teamAScore} - {match.teamBScore}</b></div>)}
    </section>
  </div></main>;
}
