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
  if (isLoading) return <main className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] text-white grid place-items-center font-heading">Loading team...</main>;
  if (error || !data) return <main className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] text-white grid place-items-center font-heading">Team not found</main>;
  return <main className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] text-white p-6 font-heading"><div className="max-w-4xl mx-auto">
    <Link href={`/championships/${data.team.championshipId}`} className="text-amber-400 hover:text-amber-300">Back to championship</Link>
    <header className="home-glass-card mt-6 rounded-3xl border-amber-400/30 p-8">
      <div className="text-6xl">{data.team.emoticon}</div><h1 className="text-4xl font-black mt-3">{data.team.name}</h1>
      <p className="text-slate-400 mt-2">Championship team</p>
    </header>
    <section className="home-glass-card mt-6 rounded-2xl p-6"><h2 className="text-xl font-bold mb-4">Members</h2>
      <div className="grid sm:grid-cols-2 gap-3">{data.members.map((member: any) => <div key={member.id} className="home-stat-card rounded-xl p-4 flex items-center gap-3">
        <div className="home-icon-gold w-10 h-10 rounded-full grid place-items-center font-bold">{(member.fullName || member.username).charAt(0).toUpperCase()}</div>
        <div><b>{member.fullName || member.username}</b><p className="text-sm text-slate-400">{member.id === data.team.captainId ? "Captain" : "Member"}</p></div>
      </div>)}</div>
    </section>
    <section className="home-glass-card mt-6 rounded-2xl p-6"><h2 className="text-xl font-bold mb-4">Matches</h2>
      {data.matches.length === 0 ? <p className="text-slate-400">No matches scheduled.</p> : data.matches.map((match: any) => <div key={match.id} className="border-t border-white/10 py-3 flex justify-between"><span>{match.status}</span><b>{match.teamAScore} - {match.teamBScore}</b></div>)}
    </section>
  </div></main>;
}
