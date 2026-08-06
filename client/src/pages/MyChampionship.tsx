import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Calendar, Crown, Eye, Play, Shield, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { navigateToTeamBattleSetup } from "@/lib/team-battle-navigation";
import { setupGameSocket } from "@/lib/socket";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export default function MyChampionship() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [teamName, setTeamName] = useState("");
  const [newMemberId, setNewMemberId] = useState("");
  const enteringMatchRef = useRef<string | null>(null);
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/");
  };
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/championships/me/dashboard"],
    refetchOnMount: "always",
    refetchInterval: 5000,
  });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/championships/me/dashboard"] });
  const createTeam = async () => { try { await apiRequest("POST", "/api/championship-teams", { championshipId: data.championship.id, name: teamName, captainId: user?.id, memberIds: [], emoticon: "👏" }); setTeamName(""); await refresh(); toast({ title: "Team created" }); } catch (error) { toast({ title: "Could not create team", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" }); } };
  const addMember = async () => { try { await apiRequest("POST", `/api/championship-teams/${data.team.id}/members`, { userId: Number(newMemberId) }); setNewMemberId(""); await refresh(); toast({ title: "Member added" }); } catch (error) { toast({ title: "Could not add member", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" }); } };
  const join = async (match: any) => {
    try {
      const response = await apiRequest("POST", `/api/championship-matches/${match.id}/join`, {});
      const access = await response.json();
      setupGameSocket(user?.id);
      navigateToTeamBattleSetup(setLocation, access.gameSessionId, match.id, access.isCaptain);
    } catch (error) { enteringMatchRef.current = null; toast({ title: "Unable to join match", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" }); }
  };
  useEffect(() => {
    if (!data?.team || !user?.id) return;
    const stayOnDashboard = new URLSearchParams(window.location.search).get("stay") === "1";
    if (stayOnDashboard) return;
    const liveMatch = data.matches?.find((match: any) =>
      match.status === "live" &&
      (match.teamAId === data.team.id || match.teamBId === data.team.id)
    );
    if (!liveMatch || enteringMatchRef.current === liveMatch.id) return;
    enteringMatchRef.current = liveMatch.id;
    void join(liveMatch);
  }, [data, user?.id]);
  if (isLoading) return <main className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] text-white grid place-items-center font-heading">Loading championship...</main>;
  if (!data?.championship) return <main className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] text-white grid place-items-center p-6 text-center font-heading"><div className="home-glass-card rounded-3xl p-8 max-w-lg"><Trophy className="mx-auto text-amber-400" size={54} /><h1 className="text-3xl font-black mt-4">No active championship</h1><p className="text-white/60 mt-2">Check back when the next championship is activated.</p><Button className="mt-6 bg-accent text-primary hover:bg-accent/90" onClick={() => setLocation("/")}>Return home</Button></div></main>;
  return <main className="home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] text-white p-5 font-heading"><div className="max-w-5xl mx-auto">
    <Button variant="ghost" className="mb-4 -ml-3 text-slate-200 hover:bg-white/10 hover:text-white" onClick={goBack}><ArrowLeft size={18} className="mr-2" />Back</Button>
    <header className="home-glass-card rounded-3xl p-7 border-amber-400/30"><p className="text-amber-400 uppercase tracking-widest text-xs font-bold">Active championship</p><h1 className="text-4xl font-black mt-2">{data.championship.name}</h1><p className="text-white/60 mt-2">{data.championship.description}</p></header>
    {data.team ? <section className="home-glass-card mt-6 rounded-2xl p-6"><div className="flex items-center gap-4"><div className="home-icon-gold w-16 h-16 rounded-2xl grid place-items-center text-4xl">{data.team.emoticon}</div><div><p className="text-xs text-amber-400 uppercase tracking-widest">My team</p><h2 className="text-2xl font-black">{data.team.name}</h2><p className="text-white/50 flex items-center gap-1"><Users size={14} /> {data.team.memberIds.length} member(s)</p></div></div>{data.team.captainId === user?.id && <div className="mt-5 border-t border-white/10 pt-4"><p className="text-sm font-bold mb-2">Captain controls</p><div className="flex flex-col sm:flex-row gap-2"><select className="rounded-md bg-[#121628] border border-white/20 px-3 py-2 flex-1" value={newMemberId} onChange={event => setNewMemberId(event.target.value)}><option value="">Select registered member</option>{users.filter(candidate => !candidate.isAdmin && !data.team.memberIds.includes(candidate.id)).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.fullName || candidate.username}</option>)}</select><Button className="bg-accent text-primary hover:bg-accent/90" disabled={!newMemberId} onClick={addMember}>Add member</Button></div></div>}</section> : <section className="home-glass-card mt-6 rounded-2xl border-amber-400/30 p-6"><Shield className="text-amber-300" /><h2 className="text-xl font-bold mt-2">You are not assigned to a team</h2><p className="text-white/60">Create a team as captain, or ask an existing captain or administrator to add you.</p><div className="flex gap-2 mt-4 max-w-md"><Input className="bg-[#121628] border-white/20 text-white" placeholder="New team name" value={teamName} onChange={event => setTeamName(event.target.value)} /><Button className="bg-accent text-primary hover:bg-accent/90" disabled={!teamName.trim()} onClick={createTeam}>Create my team</Button></div></section>}
    <section className="mt-6"><h2 className="text-2xl font-black mb-4">Matches</h2><div className="grid md:grid-cols-2 gap-4">{data.matches.map((match: any) => { const a=data.teams.find((team:any)=>team.id===match.teamAId); const b=data.teams.find((team:any)=>team.id===match.teamBId); const participating=data.team && (data.team.id===match.teamAId || data.team.id===match.teamBId); return <article key={match.id} className="home-action-card home-action-card--gold rounded-2xl p-5"><div className="flex justify-between"><span className={`text-xs uppercase font-bold ${match.status === "live" ? "text-red-400" : "text-white/50"}`}>{match.status}</span>{match.scheduledAt && <span className="text-xs text-white/50 flex gap-1"><Calendar size={13}/>{new Date(match.scheduledAt).toLocaleString()}</span>}</div><h3 className="text-xl font-bold mt-4">{a?.name} <span className="text-white/30">vs</span> {b?.name}</h3><p className="text-3xl font-black mt-3 text-amber-400">{match.teamAScore} : {match.teamBScore}</p><div className="flex gap-2 mt-5">{match.status === "live" && participating && <Button className="bg-accent text-primary hover:bg-accent/90" onClick={() => join(match)}><Play size={16} className="mr-2"/>Join match</Button>}<Button className="home-btn-outline" variant="outline" onClick={() => setLocation(`/watch/${match.id}`)}><Eye size={16} className="mr-2"/>Watch</Button></div></article>})}</div></section>
  </div></main>;
}
