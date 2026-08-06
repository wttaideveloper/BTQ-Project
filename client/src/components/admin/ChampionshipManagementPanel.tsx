import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock3, Crown, Edit3, ExternalLink, Radio, Smile, Sparkles, Trash2, Trophy, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ChampionshipForm = { name: string; description: string; startDate: string; endDate: string };
const emptyForm: ChampionshipForm = { name: "", description: "", startDate: "", endDate: "" };

const localDateTimeToUtc = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const utcToLocalDateTime = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
};

export function ChampionshipManagementPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState("");
  const [createForm, setCreateForm] = useState<ChampionshipForm>(emptyForm);
  const [editForm, setEditForm] = useState<ChampionshipForm>(emptyForm);
  const [teamName, setTeamName] = useState("");
  const [captainId, setCaptainId] = useState("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [emoticon, setEmoticon] = useState("👏");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editingMatch, setEditingMatch] = useState<any>(null);
  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [playerForm, setPlayerForm] = useState({ fullName: "", username: "", email: "", password: "" });
  const [creatingPlayer, setCreatingPlayer] = useState(false);

  const { data: championships = [] } = useQuery<any[]>({ queryKey: ["/api/championships"] });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const eligiblePlayers = users.filter(user => !user.isAdmin);
  const { data: detail } = useQuery<any>({
    queryKey: ["/api/championships", selected], enabled: !!selected,
    queryFn: async () => { const response = await fetch(`/api/championships/${selected}`); if (!response.ok) throw new Error("Could not load championship"); return response.json(); },
  });

  useEffect(() => {
    if (!detail?.championship) return;
    const value = detail.championship;
    setEditForm({ name: value.name, description: value.description ?? "", startDate: value.startDate?.slice(0, 10) ?? "", endDate: value.endDate?.slice(0, 10) ?? "" });
  }, [detail]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/championships"] });
    if (selected) await qc.invalidateQueries({ queryKey: ["/api/championships", selected] });
  };
  const action = useMutation({
    mutationFn: async ({ method = "POST", url, body, success }: any) => {
      const response = await apiRequest(method, url, body); return { data: response.status === 204 ? null : await response.json(), success };
    },
    onSuccess: async ({ success }) => { await refresh(); toast({ title: success ?? "Saved successfully" }); },
    onError: (error: Error) => {
      if (error.message.toLowerCase().includes("session has expired")) {
        qc.invalidateQueries({ queryKey: ["/api/user"] });
      }
      toast({ title: "Operation failed", description: error.message, variant: "destructive" });
    },
  });
  const createChampionship = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/championships", { ...createForm, description: createForm.description || null, startDate: createForm.startDate || null, endDate: createForm.endDate || null, status: "draft" });
      return response.json();
    },
    onSuccess: async (championship: any) => { await refresh(); setSelected(championship.id); setCreateForm(emptyForm); toast({ title: "Championship created" }); },
    onError: (error: Error) => toast({ title: "Could not create championship", description: error.message, variant: "destructive" }),
  });
  const setCreate = (field: keyof ChampionshipForm, value: string) => setCreateForm(current => ({ ...current, [field]: value }));
  const setEdit = (field: keyof ChampionshipForm, value: string) => setEditForm(current => ({ ...current, [field]: value }));
  const assignedPlayerIds = new Set<number>((detail?.teams ?? []).flatMap((team: any) => team.memberIds ?? []));
  const availablePlayers = eligiblePlayers.filter(user => !assignedPlayerIds.has(user.id));
  const additionalCandidates = availablePlayers.filter(user => String(user.id) !== captainId);
  const handleCaptainChange = (value: string) => {
    setCaptainId(value);
    setMemberIds(current => current.filter(id => String(id) !== value));
  };
  const handleCreateTeam = async () => {
    try {
      await apiRequest("POST", "/api/championship-teams", { championshipId: selected, name: teamName.trim(), captainId: Number(captainId), memberIds, emoticon });
      setTeamName(""); setCaptainId(""); setMemberIds([]); setEmoticon("👏");
      await refresh();
      toast({ title: "Team created", description: "The captain and members are now assigned." });
    } catch (error) {
      toast({ title: "Could not create team", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    }
  };
  const handleCreatePlayer = async () => {
    setCreatingPlayer(true);
    try {
      const response = await apiRequest("POST", "/api/admin/users", playerForm);
      const player = await response.json();
      await qc.invalidateQueries({ queryKey: ["/api/users"] });
      setCaptainId(String(player.id));
      setPlayerForm({ fullName: "", username: "", email: "", password: "" });
      setShowCreatePlayer(false);
      toast({ title: "Player created", description: `${player.fullName || player.username} is selected as captain.` });
    } catch (error) {
      toast({ title: "Could not create player", description: error instanceof Error ? error.message : "Please check the details", variant: "destructive" });
    } finally { setCreatingPlayer(false); }
  };
  const handleTeamAChange = (value: string) => {
    setTeamAId(value);
    if (teamBId === value) setTeamBId("");
  };
  const handleScheduleMatch = async () => {
    try {
      await apiRequest("POST", "/api/championship-matches", { championshipId: selected, teamAId, teamBId, scheduledAt: localDateTimeToUtc(scheduledAt), streamUrl: streamUrl.trim() || null });
      setTeamAId(""); setTeamBId(""); setScheduledAt(""); setStreamUrl("");
      await refresh();
      toast({ title: "Match scheduled", description: "The fixture is ready in Upcoming matches." });
    } catch (error) { toast({ title: "Could not schedule match", description: error instanceof Error ? error.message : "Please check the match details", variant: "destructive" }); }
  };

  const counts = {
    total: championships.length,
    active: championships.filter(item => item.status === "active").length,
    draft: championships.filter(item => item.status === "draft").length,
    completed: championships.filter(item => item.status === "completed").length,
  };
  const deleteChampionship = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest("DELETE", `/api/championships/${deleteTarget.id}`);
      qc.setQueryData<any[]>(["/api/championships"], current => (current ?? []).filter(item => item.id !== deleteTarget.id));
      if (selected === deleteTarget.id) setSelected("");
      toast({ title: "Championship deleted", description: `${deleteTarget.name} and its matches and teams were removed.` });
      setDeleteTarget(null);
    } catch (error) {
      toast({ title: "Could not delete championship", description: error instanceof Error ? error.message : "Delete failed", variant: "destructive" });
      setDeleteTarget(null);
    }
  };

  return <div className="space-y-6 p-1">
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white p-7 shadow-lg">
      <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" /><div className="absolute left-1/3 -bottom-24 h-56 w-56 rounded-full bg-blue-300/20 blur-3xl" />
      <div className="relative"><p className="text-blue-100 text-xs font-bold uppercase tracking-[.25em] flex items-center gap-2"><Sparkles size={14} /> Live event control center</p><h2 className="text-3xl font-bold mt-2">Championship Operations</h2><p className="text-blue-100 mt-2 max-w-2xl">Create leagues, organize teams, schedule matches, control live scores, and monitor broadcasts from one place.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {[{ label: "Total", value: counts.total, icon: Trophy, color: "text-amber-300" }, { label: "Active", value: counts.active, icon: Radio, color: "text-emerald-300" }, { label: "Draft", value: counts.draft, icon: Clock3, color: "text-sky-200" }, { label: "Completed", value: counts.completed, icon: CheckCircle2, color: "text-violet-200" }].map(stat => <div key={stat.label} className="rounded-xl bg-white/15 border border-white/20 p-4 backdrop-blur"><stat.icon className={stat.color} size={20} /><div className="text-2xl font-bold mt-2">{stat.value}</div><div className="text-xs text-blue-100 uppercase tracking-wider">{stat.label}</div></div>)}
        </div>
      </div>
    </section>
    <div className="grid xl:grid-cols-[420px_1fr] gap-5">
      <section className="bg-white border rounded-2xl p-5 space-y-3 shadow-sm">
        <h3 className="font-bold text-xl flex items-center gap-2"><Trophy className="text-amber-500" /> Create championship</h3>
        <Input placeholder="Championship name" value={createForm.name} onChange={event => setCreate("name", event.target.value)} />
        <Textarea placeholder="Description (optional)" value={createForm.description} onChange={event => setCreate("description", event.target.value)} />
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Start date<Input type="date" value={createForm.startDate} onChange={event => setCreate("startDate", event.target.value)} /></label><label className="text-sm">End date<Input type="date" value={createForm.endDate} onChange={event => setCreate("endDate", event.target.value)} /></label></div>
        <Button disabled={!createForm.name.trim() || createChampionship.isPending} onClick={() => createChampionship.mutate()}>{createChampionship.isPending ? "Creating..." : "Create championship"}</Button>
      </section>
      <section className="bg-white border rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-xl">Your championships</h3><p className="text-sm text-gray-500">Select one to manage teams, matches, and broadcasting.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{championships.length} total</span></div>
        {championships.length === 0 ? <p className="text-gray-500">No championships yet.</p> : <div className="grid md:grid-cols-2 gap-3">{championships.map(championship => <button key={championship.id} onClick={() => setSelected(championship.id)} className={`text-left border rounded-xl p-4 ${selected === championship.id ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}>
          <div className="flex justify-between gap-3"><b className="text-base">{championship.name}</b><span className={`uppercase text-[10px] px-2 py-1 rounded-full font-black ${championship.status === "active" ? "text-emerald-700 bg-emerald-100" : championship.status === "completed" ? "text-violet-700 bg-violet-100" : "text-slate-600 bg-slate-100"}`}>{championship.status}</span></div>
          <p className="text-xs text-gray-500 mt-2">{championship.startDate ? new Date(championship.startDate).toLocaleDateString() : "No start date"} – {championship.endDate ? new Date(championship.endDate).toLocaleDateString() : "No end date"}</p>
        </button>)}</div>}
      </section>
    </div>

    {detail && <>
      <section className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-3 items-center"><div className="mr-auto"><p className="text-xs uppercase tracking-widest text-blue-600 font-bold">Selected championship</p><h2 className="font-black text-2xl">{detail.championship.name}</h2></div>
          {["draft", "active", "completed"].map(status => <Button key={status} variant={detail.championship.status === status ? "default" : "outline"} onClick={() => action.mutate({ method: "PATCH", url: `/api/championships/${selected}`, body: { status }, success: `Championship marked ${status}` })}>{status}</Button>)}
          <a className="text-blue-600 font-semibold flex items-center gap-1" href={`/championships/${selected}`} target="_blank">Public page <ExternalLink size={15} /></a>
          <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteTarget(detail.championship)}><Trash2 size={16} className="mr-2" /> Delete</Button>
        </div>
        <div className="grid lg:grid-cols-2 gap-3"><Input value={editForm.name} onChange={event => setEdit("name", event.target.value)} /><Textarea value={editForm.description} onChange={event => setEdit("description", event.target.value)} /></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><label className="text-sm">Start date<Input type="date" value={editForm.startDate} onChange={event => setEdit("startDate", event.target.value)} /></label><label className="text-sm">End date<Input type="date" value={editForm.endDate} onChange={event => setEdit("endDate", event.target.value)} /></label></div>
        <Button onClick={() => action.mutate({ method: "PATCH", url: `/api/championships/${selected}`, body: { ...editForm, startDate: editForm.startDate || null, endDate: editForm.endDate || null }, success: "Championship details updated" })}>Save details</Button>
      </section>

      <div className="grid xl:grid-cols-2 gap-5">
        <section className="bg-white border rounded-2xl shadow-sm overflow-hidden"><div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b p-5"><h3 className="font-bold text-xl flex items-center gap-2"><Users className="text-blue-600" /> Team management</h3><p className="text-sm text-slate-500 mt-1">Build a team in three simple steps. Players already assigned to another team are hidden.</p></div>
          <div className="p-5 space-y-5">
            <div><div className="flex items-center gap-2 mb-2"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold grid place-items-center">1</span><label className="font-semibold">Team identity</label></div><div className="grid sm:grid-cols-[1fr_170px] gap-3"><Input className="h-11" placeholder="Enter a unique team name" value={teamName} onChange={event => setTeamName(event.target.value)} /><div className="relative"><Smile className="absolute left-3 top-3 text-slate-400" size={18}/><Input className="h-11 pl-10 text-xl" aria-label="Team emoji" value={emoticon} onChange={event => setEmoticon(event.target.value)} maxLength={8}/></div></div><div className="flex gap-2 mt-2">{["👏","🔥","❤️","👍","🦁","🦅"].map(emoji => <button key={emoji} type="button" onClick={() => setEmoticon(emoji)} className={`w-9 h-9 rounded-lg border text-lg hover:bg-slate-50 ${emoticon === emoji ? "border-blue-500 bg-blue-50" : ""}`}>{emoji}</button>)}</div></div>
            <div><div className="flex items-center justify-between gap-2 mb-2"><div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold grid place-items-center">2</span><label className="font-semibold flex items-center gap-1"><Crown size={16} className="text-amber-500"/>Choose captain</label></div><Button type="button" size="sm" variant="outline" onClick={() => setShowCreatePlayer(true)}><UserPlus size={15} className="mr-2"/>Create new player</Button></div><select className="w-full h-11 border rounded-md px-3 bg-white" value={captainId} onChange={event => handleCaptainChange(event.target.value)}><option value="">Select a registered player</option>{availablePlayers.map(user => <option key={user.id} value={user.id}>{user.fullName || user.username}</option>)}</select><p className="text-xs text-slate-500 mt-2">Captains are normal player accounts. Create one here if the person has not registered yet.</p>{availablePlayers.length === 0 && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 mt-2">All registered players are already assigned. Create a new player to continue.</p>}</div>
            <div><div className="flex items-center gap-2 mb-2"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold grid place-items-center">3</span><label className="font-semibold">Add members <span className="font-normal text-slate-400">(optional)</span></label></div>{!captainId ? <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500 text-center">Choose a captain first. The captain is added automatically and will not appear here.</div> : additionalCandidates.length === 0 ? <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 text-center">No other unassigned players are available.</div> : <div className="max-h-44 overflow-auto grid sm:grid-cols-2 gap-2 rounded-xl border p-3">{additionalCandidates.map(user => <label key={user.id} className={`text-sm flex items-center gap-3 rounded-lg p-2 cursor-pointer ${memberIds.includes(user.id) ? "bg-blue-50 text-blue-800" : "hover:bg-slate-50"}`}><input className="w-4 h-4" type="checkbox" checked={memberIds.includes(user.id)} onChange={event => setMemberIds(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))} /><span>{user.fullName || user.username}</span></label>)}</div>}</div>
            <div className="flex items-center justify-between border-t pt-4"><p className="text-xs text-slate-500">Captain + {memberIds.length} additional member{memberIds.length === 1 ? "" : "s"}</p><Button className="min-w-32" disabled={!teamName.trim() || !captainId || action.isPending} onClick={handleCreateTeam}><UserPlus size={17} className="mr-2"/>Create team</Button></div>
          </div>
          <div className="border-t bg-slate-50/60 p-5"><h4 className="font-bold mb-3">Created teams <span className="text-slate-400 font-normal">({detail.teams.length})</span></h4>{detail.teams.length === 0 && <div className="text-center text-sm text-slate-500 py-6">No teams have been created yet.</div>}
          {detail.teams.map((team: any) => <div key={team.id} className="bg-white border rounded-xl p-4 mb-3 shadow-sm">{editingTeam?.id === team.id ? <div className="space-y-3"><div className="grid sm:grid-cols-3 gap-2"><Input value={editingTeam.name} onChange={event => setEditingTeam({ ...editingTeam, name: event.target.value })} /><select className="border rounded-md px-3" value={editingTeam.captainId} onChange={event => setEditingTeam({ ...editingTeam, captainId: Number(event.target.value), memberIds: [...new Set([...(editingTeam.memberIds ?? []), Number(event.target.value)])] })}>{eligiblePlayers.map(user => <option key={user.id} value={user.id}>{user.fullName || user.username}</option>)}</select><Input value={editingTeam.emoticon} onChange={event => setEditingTeam({ ...editingTeam, emoticon: event.target.value })} /></div><div className="grid sm:grid-cols-2 gap-1">{eligiblePlayers.filter(user => user.id !== editingTeam.captainId).map(user => <label key={user.id} className="text-sm flex gap-2 p-2"><input type="checkbox" checked={(editingTeam.memberIds ?? []).includes(user.id)} onChange={event => setEditingTeam({ ...editingTeam, memberIds: event.target.checked ? [...editingTeam.memberIds, user.id] : editingTeam.memberIds.filter((id:number) => id !== user.id) })}/>{user.fullName || user.username}</label>)}</div><div className="flex gap-2"><Button size="sm" onClick={() => { action.mutate({ method: "PATCH", url: `/api/championship-teams/${team.id}`, body: { name: editingTeam.name, captainId: editingTeam.captainId, memberIds: editingTeam.memberIds, emoticon: editingTeam.emoticon }, success: "Team updated" }); setEditingTeam(null); }}>Save changes</Button><Button size="sm" variant="outline" onClick={() => setEditingTeam(null)}>Cancel</Button></div></div> : <div className="flex justify-between items-center gap-3"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-blue-50 grid place-items-center text-2xl">{team.emoticon}</div><div><b className="text-base">{team.name}</b><p className="text-xs text-gray-500">{team.memberIds.length} member{team.memberIds.length === 1 ? "" : "s"}</p></div></div><div className="flex items-center gap-1"><Button size="sm" variant="ghost" aria-label={`Edit ${team.name}`} onClick={() => setEditingTeam({ ...team })}><Edit3 size={15}/></Button><Button size="sm" variant="ghost" aria-label={`Delete ${team.name}`} className="text-red-600" onClick={() => action.mutate({ method: "DELETE", url: `/api/championship-teams/${team.id}`, success: "Team deleted" })}><Trash2 size={15}/></Button><a className="text-blue-600 text-sm px-2" target="_blank" href={`/championship-teams/${team.id}`}>View</a></div></div>}</div>)}
          </div>
        </section>

        <section className="bg-white border rounded-2xl shadow-sm overflow-hidden"><div className="bg-gradient-to-r from-violet-50 to-fuchsia-50 border-b p-5"><h3 className="font-bold text-xl flex items-center gap-2"><CalendarDays className="text-violet-600" /> Match scheduling</h3><p className="text-sm text-slate-500 mt-1">Pair two different teams and choose when the match should appear.</p></div><div className="p-5 space-y-5">
          {detail.teams.length < 2 ? <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5 text-center"><Users className="mx-auto text-amber-600"/><p className="font-semibold text-amber-900 mt-2">Create at least two teams</p><p className="text-sm text-amber-700">A match needs two different championship teams.</p></div> : <>
            <div><label className="text-sm font-semibold block mb-2">Competing teams</label><div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-3"><select className="w-full h-12 border rounded-lg px-3 bg-white" value={teamAId} onChange={event => handleTeamAChange(event.target.value)}><option value="">Select Team A</option>{detail.teams.map((team: any) => <option key={team.id} value={team.id}>{team.emoticon} {team.name}</option>)}</select><span className="w-10 h-10 rounded-full bg-slate-900 text-white text-xs font-black grid place-items-center mx-auto">VS</span><select className="w-full h-12 border rounded-lg px-3 bg-white" value={teamBId} onChange={event => setTeamBId(event.target.value)} disabled={!teamAId}><option value="">Select Team B</option>{detail.teams.filter((team:any) => team.id !== teamAId).map((team: any) => <option key={team.id} value={team.id}>{team.emoticon} {team.name}</option>)}</select></div>{!teamAId && <p className="text-xs text-slate-500 mt-2">Choose Team A first; it will be excluded from Team B automatically.</p>}</div>
            <div><label className="text-sm font-semibold block mb-2">Match date and time <span className="font-normal text-slate-400">(optional)</span></label><Input className="h-11" type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /><p className="text-xs text-slate-500 mt-1">Enter your local time. It is converted safely for the server and shown in each viewer's local timezone. The match starts only when an admin clicks Start match.</p></div>
            <div><label className="text-sm font-semibold block mb-2">Live stream URL <span className="font-normal text-slate-400">(optional)</span></label><Input className="h-11" placeholder="https://stream.example.com/live.m3u8" value={streamUrl} onChange={event => setStreamUrl(event.target.value)} /><p className="text-xs text-slate-500 mt-1">Paste an HLS .m3u8 URL for the spectator page. You can add or edit it later.</p></div>
            <div className="border-t pt-4 flex items-center justify-between"><p className="text-xs text-slate-500">{teamAId && teamBId ? "Two different teams selected" : "Select both teams to continue"}</p><Button className="min-w-40" disabled={!teamAId || !teamBId || teamAId === teamBId} onClick={handleScheduleMatch}><CalendarDays size={17} className="mr-2"/>Schedule match</Button></div>
          </>}
        </div>
        </section>
      </div>

      <section className="bg-white border rounded-2xl p-5 shadow-sm"><h3 className="font-bold text-xl flex items-center gap-2 mb-4"><Radio className="text-red-500" /> Match monitoring and live control</h3>
        {detail.matches.length === 0 ? <p className="text-gray-500">No matches scheduled.</p> : detail.matches.map((match: any) => { const teamA = detail.teams.find((team: any) => team.id === match.teamAId); const teamB = detail.teams.find((team: any) => team.id === match.teamBId); const liveMatch = detail.matches.find((candidate: any) => candidate.status === "live"); return <div key={match.id} className="border-t py-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center"><div className="mr-auto"><b>{teamA?.name} vs {teamB?.name}</b><p className="text-xs text-gray-500 uppercase">{match.status} {match.scheduledAt && `· ${new Date(match.scheduledAt).toLocaleString()}`}</p></div><a className="text-blue-600" target="_blank" href={`/watch/${match.id}`}>Watch</a><a className="text-blue-600" target="_blank" href={`/overlay/${match.id}`}>Overlay</a></div>
          {match.status === "upcoming" && <div className="space-y-2">{editingMatch?.id === match.id ? <div className="grid md:grid-cols-2 gap-2"><Input type="datetime-local" value={editingMatch.scheduledAt ?? ""} onChange={event => setEditingMatch({ ...editingMatch, scheduledAt: event.target.value })}/><Input placeholder="HLS stream URL" value={editingMatch.streamUrl ?? ""} onChange={event => setEditingMatch({ ...editingMatch, streamUrl: event.target.value })}/><select className="border rounded-md p-2" value={editingMatch.teamAId} onChange={event => setEditingMatch({ ...editingMatch, teamAId: event.target.value })}>{detail.teams.map((team:any)=><option key={team.id} value={team.id}>{team.name}</option>)}</select><select className="border rounded-md p-2" value={editingMatch.teamBId} onChange={event => setEditingMatch({ ...editingMatch, teamBId: event.target.value })}>{detail.teams.map((team:any)=><option key={team.id} value={team.id}>{team.name}</option>)}</select><div className="flex gap-2"><Button size="sm" onClick={() => { action.mutate({ method: "PATCH", url: `/api/championship-matches/${match.id}`, body: { teamAId: editingMatch.teamAId, teamBId: editingMatch.teamBId, scheduledAt: localDateTimeToUtc(editingMatch.scheduledAt), streamUrl: editingMatch.streamUrl || null }, success: "Match updated" }); setEditingMatch(null); }}>Save match</Button><Button size="sm" variant="outline" onClick={() => setEditingMatch(null)}>Cancel</Button></div></div> : <div><div className="flex gap-2"><Button disabled={detail.championship.status !== "active" || !!liveMatch} onClick={() => action.mutate({ url: `/api/championship-matches/${match.id}/start`, body: {}, success: "Match is live" })}>Start match</Button><Button variant="outline" onClick={() => setEditingMatch({ ...match, scheduledAt: utcToLocalDateTime(match.scheduledAt) })}><Edit3 size={15} className="mr-2"/>Edit match</Button></div>{liveMatch && <p className="mt-2 text-xs text-amber-700">Finish or cancel {detail.teams.find((team:any) => team.id === liveMatch.teamAId)?.name} vs {detail.teams.find((team:any) => team.id === liveMatch.teamBId)?.name} before starting another match.</p>}</div>}</div>}
          {match.status === "live" && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-blue-950">Team Battle is controlling this match</p><p className="text-sm text-blue-700 mt-1">Questions, timers, scoring, and match completion are synchronized automatically from the existing Team Battle engine.</p><Button className="mt-3" size="sm" variant="outline" onClick={() => action.mutate({ url: `/api/championship-matches/${match.id}/cancel-live`, body: {}, success: "Live lobby cancelled; match returned to Upcoming" })}>Cancel live lobby</Button></div><div className="rounded-lg bg-white border border-blue-200 px-4 py-2 text-center"><p className="text-xs text-blue-600 uppercase font-bold">Live score</p><p className="text-xl font-black text-blue-950">{match.teamAScore} : {match.teamBScore}</p></div></div></div>}
        </div>})}
      </section>

      <section className="bg-white border rounded-2xl p-5 shadow-sm"><h3 className="font-bold text-xl mb-3">Championship points table</h3>
        <div className="overflow-auto"><table className="w-full text-left"><thead><tr className="border-b"><th className="p-2">#</th><th>Team</th><th>Played</th><th>Wins</th><th>Losses</th><th>Points</th></tr></thead><tbody>{detail.standings.map((team: any, index: number) => <tr key={team.id} className="border-b"><td className="p-2">{index + 1}</td><td className="font-medium">{team.name}</td><td>{team.played}</td><td>{team.wins}</td><td>{team.losses}</td><td className="font-bold">{team.points}</td></tr>)}</tbody></table></div>
      </section>
    </>}
    <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the championship, its teams, scheduled matches, scores, and standings. This cannot be undone. A championship with a live match cannot be deleted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep championship</AlertDialogCancel><AlertDialogAction onClick={deleteChampionship} className="bg-red-600 hover:bg-red-700">Delete permanently</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <Dialog open={showCreatePlayer} onOpenChange={setShowCreatePlayer}><DialogContent><DialogHeader><DialogTitle>Create player account</DialogTitle><DialogDescription>This creates a normal FaithIQ login and selects the new player as team captain.</DialogDescription></DialogHeader><div className="space-y-3"><label className="text-sm font-medium">Full name<Input placeholder="e.g. Maria Joseph" value={playerForm.fullName} onChange={event => setPlayerForm({ ...playerForm, fullName: event.target.value })}/></label><label className="text-sm font-medium">Username<Input placeholder="e.g. maria_joseph" value={playerForm.username} onChange={event => setPlayerForm({ ...playerForm, username: event.target.value })}/></label><label className="text-sm font-medium">Email<Input type="email" placeholder="player@example.com" value={playerForm.email} onChange={event => setPlayerForm({ ...playerForm, email: event.target.value })}/></label><label className="text-sm font-medium">Temporary password<Input type="password" placeholder="Minimum 8 characters" value={playerForm.password} onChange={event => setPlayerForm({ ...playerForm, password: event.target.value })}/></label></div><DialogFooter><Button variant="outline" onClick={() => setShowCreatePlayer(false)}>Cancel</Button><Button disabled={creatingPlayer || !playerForm.fullName.trim() || !playerForm.username.trim() || !playerForm.email.trim() || playerForm.password.length < 8} onClick={handleCreatePlayer}>{creatingPlayer ? "Creating..." : "Create and select"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
