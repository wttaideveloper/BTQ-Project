import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar, Crown, Eye, Play, Shield, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { navigateToTeamBattleGame } from "@/lib/team-battle-navigation";
import { sendGameEvent, setupGameSocket } from "@/lib/socket";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export default function MyChampionship() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [newMemberId, setNewMemberId] = useState("");
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/championships/me/dashboard"] });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/championships/me/dashboard"] });
  const createTeam = async () => { try { await apiRequest("POST", "/api/championship-teams", { championshipId: data.championship.id, name: teamName, captainId: user?.id, memberIds: [], emoticon: "👏" }); setTeamName(""); await refresh(); toast({ title: "Team created" }); } catch (error) { toast({ title: "Could not create team", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" }); } };
  const addMember = async () => { try { await apiRequest("POST", `/api/championship-teams/${data.team.id}/members`, { userId: Number(newMemberId) }); setNewMemberId(""); await refresh(); toast({ title: "Member added" }); } catch (error) { toast({ title: "Could not add member", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" }); } };
  const join = async (match: any) => {
    try {
      const response = await apiRequest("POST", `/api/championship-matches/${match.id}/join`, {});
      const access = await response.json();
      setupGameSocket();
      if (access.isCaptain) sendGameEvent({ type: "start_team_battle", gameSessionId: access.gameSessionId });
      window.setTimeout(() => navigateToTeamBattleGame(setLocation, access.gameSessionId), access.isCaptain ? 900 : 100);
    } catch (error) { toast({ title: "Unable to join match", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" }); }
  };
  if (isLoading) return <main className="min-h-screen bg-slate-950 text-white grid place-items-center">Loading championship...</main>;
  if (!data?.championship) return <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6 text-center"><div><Trophy className="mx-auto text-amber-400" size={54} /><h1 className="text-3xl font-black mt-4">No active championship</h1><p className="text-slate-400 mt-2">Check back when the next championship is activated.</p><Button className="mt-6" onClick={() => setLocation("/")}>Return home</Button></div></main>;
  return <main className="min-h-screen bg-slate-950 text-white p-5"><div className="max-w-5xl mx-auto">
    <header className="rounded-3xl bg-gradient-to-br from-indigo-900 to-violet-900 border border-white/10 p-7"><p className="text-cyan-300 uppercase tracking-widest text-xs font-bold">Active championship</p><h1 className="text-4xl font-black mt-2">{data.championship.name}</h1><p className="text-indigo-200 mt-2">{data.championship.description}</p></header>
    {data.team ? <section className="mt-6 rounded-2xl bg-white/5 border border-white/10 p-6"><div className="flex items-center gap-4"><div className="text-5xl">{data.team.emoticon}</div><div><p className="text-xs text-cyan-300 uppercase tracking-widest">My team</p><h2 className="text-2xl font-black">{data.team.name}</h2><p className="text-slate-400 flex items-center gap-1"><Users size={14} /> {data.team.memberIds.length} member(s)</p></div></div>{data.team.captainId === user?.id && <div className="mt-5 border-t border-white/10 pt-4"><p className="text-sm font-bold mb-2">Captain controls</p><div className="flex flex-col sm:flex-row gap-2"><select className="rounded-md bg-slate-900 border border-white/20 px-3 py-2 flex-1" value={newMemberId} onChange={event => setNewMemberId(event.target.value)}><option value="">Select registered member</option>{users.filter(candidate => !candidate.isAdmin && !data.team.memberIds.includes(candidate.id)).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.fullName || candidate.username}</option>)}</select><Button disabled={!newMemberId} onClick={addMember}>Add member</Button></div></div>}</section> : <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6"><Shield className="text-amber-300" /><h2 className="text-xl font-bold mt-2">You are not assigned to a team</h2><p className="text-amber-100/70">Create a team as captain, or ask an existing captain or administrator to add you.</p><div className="flex gap-2 mt-4 max-w-md"><Input className="bg-slate-950/40" placeholder="New team name" value={teamName} onChange={event => setTeamName(event.target.value)} /><Button disabled={!teamName.trim()} onClick={createTeam}>Create my team</Button></div></section>}
    <section className="mt-6"><h2 className="text-2xl font-black mb-4">Matches</h2><div className="grid md:grid-cols-2 gap-4">{data.matches.map((match: any) => { const a=data.teams.find((team:any)=>team.id===match.teamAId); const b=data.teams.find((team:any)=>team.id===match.teamBId); const participating=data.team && (data.team.id===match.teamAId || data.team.id===match.teamBId); return <article key={match.id} className="rounded-2xl bg-white/5 border border-white/10 p-5"><div className="flex justify-between"><span className={`text-xs uppercase font-bold ${match.status === "live" ? "text-red-400" : "text-slate-400"}`}>{match.status}</span>{match.scheduledAt && <span className="text-xs text-slate-400 flex gap-1"><Calendar size={13}/>{new Date(match.scheduledAt).toLocaleString()}</span>}</div><h3 className="text-xl font-bold mt-4">{a?.name} <span className="text-slate-500">vs</span> {b?.name}</h3><p className="text-3xl font-black mt-3">{match.teamAScore} : {match.teamBScore}</p><div className="flex gap-2 mt-5">{match.status === "live" && participating && <Button onClick={() => join(match)}><Play size={16} className="mr-2"/>Join match</Button>}<Button variant="outline" onClick={() => setLocation(`/watch/${match.id}`)}><Eye size={16} className="mr-2"/>Watch</Button></div></article>})}</div></section>
  </div></main>;
}
