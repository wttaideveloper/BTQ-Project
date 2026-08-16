import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, Clock3, Crown, Edit3,
  ExternalLink, Eye, Info, MonitorPlay, Play, Plus, Radio, Settings2, Smile, Sparkles,
  Trash2, Trophy, Tv, UserPlus, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { formatKickoff, isMatchReadyToStart, matchDisplayState } from "@/lib/championship";
import { onEvent, sendGameEvent, setupGameSocket } from "@/lib/socket";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type ChampionshipForm = { name: string; description: string; startDate: string; endDate: string };
const emptyForm: ChampionshipForm = { name: "", description: "", startDate: "", endDate: "" };

// Section anchors. Championship management is an operations dashboard, not a
// one-way wizard: every section stays on the page and stays usable, and these
// ids only let one section link the operator to another.
const SECTION = { teams: "championship-teams", matches: "championship-matches", live: "championship-live", results: "championship-results" };
const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const championshipStatusLabel: Record<string, string> = { draft: "Draft", active: "Active", completed: "Completed" };
const championshipStatusStyle: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-violet-100 text-violet-800 border-violet-200",
};
const championshipStatusDot: Record<string, string> = {
  draft: "bg-slate-400", active: "bg-emerald-500 animate-pulse", completed: "bg-violet-500",
};
// "ready" is a DISPLAY state only - an upcoming match whose scheduled time has
// passed. Nothing starts by itself; the operator still presses Start Match, and
// the stored status stays "upcoming" until /start flips it. See
// matchDisplayState in @/lib/championship.
const matchStatusLabel: Record<string, string> = { upcoming: "Upcoming", ready: "Ready to start", live: "Live", completed: "Completed" };
const matchStatusStyle: Record<string, string> = {
  upcoming: "bg-sky-100 text-sky-800 border-sky-200",
  ready: "bg-amber-100 text-amber-800 border-amber-200",
  live: "bg-red-100 text-red-700 border-red-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const formatDay = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
const formatDateRange = (start?: string | null, end?: string | null) => {
  const from = formatDay(start);
  const to = formatDay(end);
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "No dates set";
};
const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

function ChampionshipStatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${championshipStatusStyle[status] ?? championshipStatusStyle.draft}`}>
    <span className={`h-2 w-2 rounded-full ${championshipStatusDot[status] ?? championshipStatusDot.draft}`} />
    {championshipStatusLabel[status] ?? status}
  </span>;
}

function MatchStatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${matchStatusStyle[status] ?? matchStatusStyle.upcoming}`}>
    {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />}
    {matchStatusLabel[status] ?? status}
  </span>;
}

function EmptyState({ icon: Icon, title, description, action }: { icon: any; title: string; description?: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center">
    <Icon className="mx-auto text-slate-400" size={26} />
    <p className="mt-3 font-semibold text-slate-700">{title}</p>
    {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>;
}

function SectionCard({ id, title, description, icon: Icon, action, children }: { id?: string; title: string; description: string; icon: any; action?: ReactNode; children: ReactNode }) {
  return <section id={id} className="scroll-mt-4 rounded-2xl border bg-white shadow-sm">
    <div className="flex flex-wrap items-start gap-3 border-b p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon size={20} /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </section>;
}

/**
 * Read-only scoreboard tile. The score is owned by gameplay - the answer
 * handler writes it onto the championship_matches row through
 * broadcastChampionshipScore() - so the desk reports it and never edits it.
 */
function LiveScoreCard({ team, value }: { team: any; value: number }) {
  return <div className="rounded-xl border bg-slate-50 p-4 text-center">
    <p className="truncate text-sm font-bold text-slate-800">{team?.emoticon} {team?.name ?? "Team"}</p>
    <p className="mt-2 text-4xl font-black tabular-nums text-slate-900" aria-label={`${team?.name ?? "Team"} score`}>{value}</p>
    <p className="mt-1 text-xs text-slate-500">Score</p>
  </div>;
}

function BroadcastPanel({ matchId }: { matchId: string }) {
  return <div className="rounded-xl border bg-slate-50 p-4">
    <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><Tv size={16} className="text-slate-500" /> Broadcast</p>
    <p className="mt-1 text-xs text-slate-500">
      Use Watch to monitor the public match screen. Use Overlay for the live score overlay.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={`/watch/${matchId}`} target="_blank" rel="noreferrer"><Eye size={15} /> Watch Live</a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`/overlay/${matchId}`} target="_blank" rel="noreferrer"><MonitorPlay size={15} /> Open Overlay</a>
      </Button>
    </div>
  </div>;
}

/**
 * Live match desk - monitoring, not manual control.
 *
 * Once a match kicks off, the Team Battle engine owns it: the question
 * dispatcher calls broadcastChampionshipQuestion() with the real question
 * number, and the answer handler calls broadcastChampionshipScore(), which
 * writes teamAScore/teamBScore onto the championship_matches row and broadcasts
 * `match_updated` (both in server/socket.ts). The engine also completes the
 * match itself when the battle finishes. So there is nothing here to start a
 * question with, and a manually PATCHed score would simply be overwritten by
 * the next answer - those controls were removed.
 *
 * The score and question shown below arrive over the SAME public championship
 * events the watch page consumes. `watch_match` is the existing spectator
 * subscription (handleWatchMatch): it binds this socket to the match and
 * replies with the cached current question. No new event, no server change, no
 * gameplay effect.
 *
 * What stays actionable: Watch / Overlay for the broadcast operator, End Match
 * as the manual fallback for a match that never finishes cleanly, and the
 * winner override for the exceptional case where the recorded winner must
 * differ from the score.
 */
function LiveMatchControl({
  match, teamA, teamB, winnerOverride, onWinnerOverrideChange, onEndMatch, onMatchEnded,
}: {
  match: any;
  teamA: any;
  teamB: any;
  winnerOverride: string;
  onWinnerOverrideChange: (value: string) => void;
  /** Receives the match carrying the live score, so /end records what gameplay reported. */
  onEndMatch: (match: any) => void;
  onMatchEnded: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [score, setScore] = useState({ a: match.teamAScore, b: match.teamBScore });
  const [question, setQuestion] = useState<number | null>(null);

  // The server payload is the baseline; live events refine it from here.
  useEffect(() => {
    setScore({ a: match.teamAScore, b: match.teamBScore });
  }, [match.id, match.teamAScore, match.teamBScore]);

  // Held in a ref so re-rendering the parent cannot re-subscribe this socket.
  const matchEnded = useRef(onMatchEnded);
  useEffect(() => { matchEnded.current = onMatchEnded; }, [onMatchEnded]);

  useEffect(() => {
    const matchId = match.id;
    setupGameSocket();
    sendGameEvent({ type: "watch_match", matchId });
    // A reconnect creates a new server-side client with no subscription, so the
    // desk re-subscribes on connection_established exactly like the watch page.
    const offConnected = onEvent("connection_established", () => sendGameEvent({ type: "watch_match", matchId }));
    const offRestored = onEvent("match_state_restored", event => {
      if (event.matchId !== matchId) return;
      setQuestion(event.currentQuestion?.questionNumber ?? null);
    });
    const offUpdated = onEvent("match_updated", event => {
      if (event.match?.id !== matchId) return;
      setScore({ a: event.match.teamAScore, b: event.match.teamBScore });
    });
    const offQuestionStarted = onEvent("question_started", event => {
      if (event.matchId === matchId) setQuestion(event.questionNumber ?? null);
    });
    const offQuestionEnded = onEvent("question_ended", event => {
      if (event.matchId === matchId) setQuestion(null);
    });
    // The engine completes the match on its own, so the desk refreshes itself
    // out of live mode instead of stranding the operator on a finished match.
    const offEnded = onEvent("match_ended", event => {
      if (event.match?.id !== matchId) return;
      setQuestion(null);
      matchEnded.current();
    });
    return () => { offConnected(); offRestored(); offUpdated(); offQuestionStarted(); offQuestionEnded(); offEnded(); };
  }, [match.id]);

  return <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-red-600 to-rose-600 p-5 text-white">
      <h3 className="flex items-center gap-2 text-lg font-black"><span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" /> Live Match Control</h3>
      <span className="ml-auto text-sm font-semibold text-red-50">Match status: Live</span>
    </div>
    <div className="space-y-5 p-5">
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <LiveScoreCard team={teamA} value={score.a} />
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-900 text-[11px] font-black text-white">VS</div>
        <LiveScoreCard team={teamB} value={score.b} />
      </div>

      <div className="rounded-xl border bg-slate-50 p-4 text-center">
        <p className="text-sm font-bold text-slate-800">
          {question ? `Current question: ${question}` : "Waiting for the next question…"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Questions and scores are controlled by the match itself and update here automatically.
        </p>
      </div>

      <BroadcastPanel matchId={match.id} />

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          The match ends by itself when the battle finishes. End it here only if it needs to be closed manually.
        </p>
        <Button variant="destructive" className="ml-auto" onClick={() => onEndMatch({ ...match, teamAScore: score.a, teamBScore: score.b })}>
          End Match
        </Button>
      </div>

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <ChevronDown size={16} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} /> Advanced Controls
          <span className="ml-auto text-xs font-normal text-slate-400">Only needed in special cases</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="rounded-b-xl border border-t-0 px-4 pb-4 pt-3">
          <label className="text-sm font-semibold text-slate-700">Winner when the match ends
            <select className="mt-1 block h-10 w-full max-w-sm rounded-md border bg-white px-3 text-sm font-normal"
              value={winnerOverride} onChange={event => onWinnerOverrideChange(event.target.value)}>
              <option value="">Automatic — highest score wins</option>
              <option value={match.teamAId}>{teamA?.name}</option>
              <option value={match.teamBId}>{teamB?.name}</option>
            </select>
          </label>
          <p className="mt-2 text-xs text-slate-500">Leave this on Automatic unless you need to record a different winner than the score shows.</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </section>;
}

export function ChampionshipManagementPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState("");
  const [setupOpen, setSetupOpen] = useState<boolean | null>(null);
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
  const [winnerOverrides, setWinnerOverrides] = useState<Record<string, string>>({});
  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [playerForm, setPlayerForm] = useState({ fullName: "", username: "", email: "", password: "" });
  const [creatingPlayer, setCreatingPlayer] = useState(false);
  const [showCreateChampionship, setShowCreateChampionship] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showScheduleMatch, setShowScheduleMatch] = useState(false);
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<any>(null);
  const [endMatchTarget, setEndMatchTarget] = useState<any>(null);

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

  // Switching championship hands the Setup panel back to its automatic state:
  // expanded while the basics are missing, collapsed once they are filled in.
  useEffect(() => { setSetupOpen(null); }, [selected]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/championships"] });
    if (selected) await qc.invalidateQueries({ queryKey: ["/api/championships", selected] });
  };
  const action = useMutation({
    mutationFn: async ({ method = "POST", url, body, success }: any) => {
      const response = await apiRequest(method, url, body); return { data: response.status === 204 ? null : await response.json(), success };
    },
    onSuccess: async ({ success }) => { await refresh(); toast({ title: success ?? "Saved successfully" }); },
    onError: (error: Error) => toast({ title: "Operation failed", description: error.message, variant: "destructive" }),
  });
  const createChampionship = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/championships", { ...createForm, description: createForm.description || null, startDate: createForm.startDate || null, endDate: createForm.endDate || null, status: "draft" });
      return response.json();
    },
    onSuccess: async (championship: any) => { await refresh(); setSelected(championship.id); setCreateForm(emptyForm); setShowCreateChampionship(false); toast({ title: "Championship created" }); },
    onError: (error: Error) => toast({ title: "Could not create championship", description: error.message, variant: "destructive" }),
  });
  const setCreate = (field: keyof ChampionshipForm, value: string) => setCreateForm(current => ({ ...current, [field]: value }));
  const setEdit = (field: keyof ChampionshipForm, value: string) => setEditForm(current => ({ ...current, [field]: value }));
  const assignedPlayerIds = new Set<number>((detail?.teams ?? []).flatMap((team: any) => team.memberIds ?? []));
  const availablePlayers = eligiblePlayers.filter(user => !assignedPlayerIds.has(user.id));
  const additionalCandidates = availablePlayers.filter(user => String(user.id) !== captainId);
  const playerName = (id: number) => {
    const player = users.find(user => user.id === id);
    return player?.fullName || player?.username || `Player ${id}`;
  };
  const handleCaptainChange = (value: string) => {
    setCaptainId(value);
    setMemberIds(current => current.filter(id => String(id) !== value));
  };
  const handleCreateTeam = async () => {
    try {
      await apiRequest("POST", "/api/championship-teams", { championshipId: selected, name: teamName.trim(), captainId: Number(captainId), memberIds, emoticon });
      setTeamName(""); setCaptainId(""); setMemberIds([]); setEmoticon("👏");
      setShowAddTeam(false);
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
      await apiRequest("POST", "/api/championship-matches", { championshipId: selected, teamAId, teamBId, scheduledAt: scheduledAt || null, streamUrl: streamUrl.trim() || null });
      setTeamAId(""); setTeamBId(""); setScheduledAt(""); setStreamUrl("");
      setShowScheduleMatch(false);
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

  const teams: any[] = detail?.teams ?? [];
  const matches: any[] = detail?.matches ?? [];
  const liveMatch = matches.find(match => match.status === "live") ?? null;
  const upcomingMatches = matches.filter(match => match.status === "upcoming");
  // Same list, narrowed to the ones whose kick-off time has already passed.
  // Grouping and every action stay driven by match.status; this only decides
  // what the summary line talks about first.
  const readyMatches = upcomingMatches.filter(match => isMatchReadyToStart(match));
  const completedMatches = matches.filter(match => match.status === "completed");
  const championshipStatus: string = detail?.championship?.status ?? "draft";
  const teamById = (id: string) => teams.find(team => team.id === id);

  // The dashboard never marks a section "finished" — an active championship can
  // gain teams and matches at any time. This single line says what, if anything,
  // is waiting on the operator right now.
  const attention: { tone: "live" | "action" | "next" | "ready"; message: string; button?: ReactNode } =
    liveMatch ? {
      tone: "live",
      message: `Live now: ${teamById(liveMatch.teamAId)?.name ?? "Team A"} vs ${teamById(liveMatch.teamBId)?.name ?? "Team B"} is currently playing.`,
      button: <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => scrollToSection(SECTION.live)}><Radio size={15} /> Manage live match</Button>,
    }
    : teams.length < 2 ? {
      tone: "action",
      message: "Action needed: Add at least 2 teams before scheduling a match.",
      button: <Button size="sm" onClick={() => setShowAddTeam(true)}><Plus size={15} /> Add Team</Button>,
    }
    : matches.length === 0 ? {
      tone: "next",
      message: "Next step: Schedule your first match.",
      button: <Button size="sm" onClick={() => setShowScheduleMatch(true)}><Plus size={15} /> Schedule Match</Button>,
    }
    : championshipStatus === "draft" && upcomingMatches.length ? {
      tone: "action",
      message: "Action needed: Set the status to Active before a scheduled match can be started.",
    }
    : championshipStatus === "completed" ? {
      tone: "ready",
      message: "This championship is marked Completed. Review the final standings below.",
      button: <Button size="sm" variant="outline" onClick={() => scrollToSection(SECTION.results)}><Trophy size={15} /> View standings</Button>,
    }
    : readyMatches.length ? {
      tone: "action",
      message: `Ready to start: ${teamById(readyMatches[0].teamAId)?.name ?? "Team A"} vs ${teamById(readyMatches[0].teamBId)?.name ?? "Team B"} has reached its scheduled time. It will not start automatically.`,
      button: <Button size="sm" variant="outline" onClick={() => scrollToSection(SECTION.matches)}><CalendarDays size={15} /> Go to matches</Button>,
    }
    : upcomingMatches.length ? {
      tone: "ready",
      message: "Championship is ready. Start a scheduled match when you're ready.",
      button: <Button size="sm" variant="outline" onClick={() => scrollToSection(SECTION.matches)}><CalendarDays size={15} /> Go to matches</Button>,
    }
    : {
      tone: "next",
      message: "All scheduled matches are complete. You can schedule another match or review the standings.",
      button: <Button size="sm" variant="outline" onClick={() => setShowScheduleMatch(true)}><Plus size={15} /> Schedule Match</Button>,
    };
  const attentionStyle: Record<string, { box: string; icon: any; iconClass: string }> = {
    live: { box: "border-red-200 bg-red-50 text-red-900", icon: Radio, iconClass: "text-red-600" },
    action: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle, iconClass: "text-amber-600" },
    next: { box: "border-blue-200 bg-blue-50 text-blue-900", icon: Info, iconClass: "text-blue-600" },
    ready: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2, iconClass: "text-emerald-600" },
  };
  const setupComplete = !!(detail?.championship?.name && detail?.championship?.startDate && detail?.championship?.endDate);
  const isSetupOpen = setupOpen ?? !setupComplete;
  const leader = detail?.standings?.[0] ?? null;

  const renderMatchCard = (match: any, options?: { hideResultLink?: boolean }) => {
    const teamA = teamById(match.teamAId);
    const teamB = teamById(match.teamBId);
    const readyToStart = isMatchReadyToStart(match);
    // Every branch below still keys off match.status - only the wording changes.
    const scheduleLine = match.status !== "upcoming"
      ? (match.scheduledAt ? `Scheduled ${formatDateTime(match.scheduledAt)}` : "No date set")
      : readyToStart ? "Scheduled time has arrived"
      : match.scheduledAt ? `Scheduled for ${formatKickoff(match.scheduledAt) ?? formatDateTime(match.scheduledAt)}`
      : "No date set";
    return <div key={match.id} className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-base text-slate-900">{teamA?.emoticon} {teamA?.name ?? "Team A"} <span className="text-slate-400">vs</span> {teamB?.emoticon} {teamB?.name ?? "Team B"}</b>
            <MatchStatusBadge status={matchDisplayState(match)} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {scheduleLine}
            {match.status === "completed" && ` · Final score ${match.teamAScore} – ${match.teamBScore}`}
          </p>
          {match.status === "completed" && <p className="mt-1 text-xs font-semibold text-emerald-700">
            {match.winnerTeamId ? `Winner: ${teamById(match.winnerTeamId)?.name ?? "—"}` : "Result: Draw"}
          </p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {match.status === "upcoming" && <>
            <Button size="sm" disabled={championshipStatus !== "active"}
              onClick={() => action.mutate({ url: `/api/championship-matches/${match.id}/start`, body: {}, success: "Match is live" }, { onSuccess: () => scrollToSection(SECTION.live) })}>
              <Play size={15} /> Start Match
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingMatch({ ...match, scheduledAt: match.scheduledAt ? new Date(match.scheduledAt).toISOString().slice(0, 16) : "" })}>
              <Edit3 size={15} /> Edit
            </Button>
            {/* Available before kick-off so the operator can load the overlay into OBS in advance. */}
            <Button asChild size="sm" variant="outline"><a href={`/overlay/${match.id}`} target="_blank" rel="noreferrer"><MonitorPlay size={15} /> Open Overlay</a></Button>
          </>}
          {match.status === "live" && <>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => scrollToSection(SECTION.live)}><Radio size={15} /> Manage Match</Button>
            <Button asChild size="sm" variant="outline"><a href={`/watch/${match.id}`} target="_blank" rel="noreferrer"><Eye size={15} /> Watch Live</a></Button>
            <Button asChild size="sm" variant="outline"><a href={`/overlay/${match.id}`} target="_blank" rel="noreferrer"><MonitorPlay size={15} /> Open Overlay</a></Button>
          </>}
          {match.status === "completed" && <>
            {!options?.hideResultLink && <Button size="sm" variant="outline" onClick={() => scrollToSection(SECTION.results)}><Trophy size={15} /> View Result</Button>}
            <Button asChild size="sm" variant="outline"><a href={`/watch/${match.id}`} target="_blank" rel="noreferrer"><Eye size={15} /> Watch Result</a></Button>
            <Button asChild size="sm" variant="outline"><a href={`/overlay/${match.id}`} target="_blank" rel="noreferrer"><MonitorPlay size={15} /> Open Overlay</a></Button>
          </>}
        </div>
      </div>
      {match.status === "upcoming" && championshipStatus !== "active" && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
        <Info size={14} className="mt-0.5 shrink-0" /> Set this championship to Active before starting the match.
      </p>}
      {match.status === "upcoming" && readyToStart && championshipStatus === "active" && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
        <Info size={14} className="mt-0.5 shrink-0" /> The match will not start automatically. Start it when both teams are ready.
      </p>}
    </div>;
  };

  return <div className="mx-auto max-w-[1400px] space-y-6 p-1">
    {selected && !detail ? <p className="py-16 text-center text-sm text-slate-500">Loading championship…</p>
      : !detail ? <>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-xl">
        <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" /><div className="absolute left-1/3 -bottom-24 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.25em] text-cyan-300"><Sparkles size={14} /> Live event control center</p>
          <h2 className="mt-2 text-3xl font-black">Championship Operations</h2>
          <p className="mt-2 max-w-2xl text-indigo-200">Pick a championship to manage it step by step: setup, teams, matches, live control and results.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[{ label: "Total", value: counts.total, icon: Trophy, color: "text-amber-300" }, { label: "Active", value: counts.active, icon: Radio, color: "text-emerald-300" }, { label: "Draft", value: counts.draft, icon: Clock3, color: "text-sky-300" }, { label: "Completed", value: counts.completed, icon: CheckCircle2, color: "text-violet-300" }].map(stat => <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur"><stat.icon className={stat.color} size={20} /><div className="mt-2 text-2xl font-black">{stat.value}</div><div className="text-xs uppercase tracking-wider text-indigo-200">{stat.label}</div></div>)}
          </div>
        </div>
      </section>

      <SectionCard icon={Trophy} title="Your championships" description="Select a championship to manage its teams, matches and live scores."
        action={<Button onClick={() => setShowCreateChampionship(true)}><Plus size={16} /> New Championship</Button>}>
        {championships.length === 0
          ? <EmptyState icon={Trophy} title="No championships yet." description="Create a championship to start adding teams and scheduling matches."
              action={<Button onClick={() => setShowCreateChampionship(true)}><Plus size={16} /> Create your first championship</Button>} />
          : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {championships.map(championship => <button key={championship.id} onClick={() => setSelected(championship.id)}
                className="rounded-xl border p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/50">
                <div className="flex items-start justify-between gap-3">
                  <b className="text-base text-slate-900">{championship.name}</b>
                  <ChampionshipStatusBadge status={championship.status} />
                </div>
                <p className="mt-2 text-xs text-slate-500">{formatDateRange(championship.startDate, championship.endDate)}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600">Manage championship →</span>
              </button>)}
            </div>}
      </SectionCard>
    </> : <>
      <button onClick={() => setSelected("")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> All championships
      </button>

      {/* 1 — Championship summary */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="flex items-center gap-2 text-2xl font-black text-slate-900"><Trophy className="text-amber-500" size={24} /> {detail.championship.name}</h2>
              <ChampionshipStatusBadge status={championshipStatus} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><CalendarDays size={14} /> {formatDateRange(detail.championship.startDate, detail.championship.endDate)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">
              Change status
              <select className="ml-2 h-9 rounded-md border bg-white px-2 text-sm font-medium text-slate-800"
                value={championshipStatus}
                onChange={event => action.mutate({ method: "PATCH", url: `/api/championships/${selected}`, body: { status: event.target.value }, success: `Status changed to ${championshipStatusLabel[event.target.value]}` })}>
                <option value="draft">Draft — still being prepared</option>
                <option value="active">Active — matches can be played</option>
                <option value="completed">Completed — championship is over</option>
              </select>
            </label>
            <Button asChild variant="outline" size="sm">
              <a href={`/championships/${selected}`} target="_blank" rel="noreferrer">Public page <ExternalLink size={14} /></a>
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
          {[{ label: "Teams", value: teams.length }, { label: "Matches", value: matches.length }, { label: "Completed", value: completedMatches.length }].map(stat =>
            <div key={stat.label} className="rounded-xl bg-slate-50 px-4 py-3 text-center sm:text-left">
              <div className="text-2xl font-black text-slate-900">{stat.value}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</div>
            </div>)}
        </div>
        <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-4 ${attentionStyle[attention.tone].box}`}>
          {(() => { const Icon = attentionStyle[attention.tone].icon; return <Icon size={20} className={`shrink-0 ${attentionStyle[attention.tone].iconClass}`} />; })()}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">What needs attention?</p>
            <p className="text-sm font-semibold">{attention.tone === "live" && "🔴 "}{attention.message}</p>
          </div>
          {attention.button}
        </div>
      </section>

      {/* 2 — Setup. Collapsed by default once the basics are filled in so it never
          dominates the page, but always one click away while the championship runs. */}
      <Collapsible open={isSetupOpen} onOpenChange={setSetupOpen} className="rounded-2xl border bg-white shadow-sm">
        <CollapsibleTrigger className="flex w-full flex-wrap items-center gap-3 p-5 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Settings2 size={20} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900">Championship Setup</h3>
            <p className="mt-0.5 text-sm text-slate-500">Manage the basic championship details.</p>
          </div>
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            {isSetupOpen ? "Hide" : "Edit details"}
            <ChevronDown size={16} className={`transition-transform ${isSetupOpen ? "rotate-180" : ""}`} />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Championship name
            <Input className="mt-1 font-normal" value={editForm.name} onChange={event => setEdit("name", event.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-slate-700">Start date
              <Input className="mt-1 font-normal" type="date" value={editForm.startDate} onChange={event => setEdit("startDate", event.target.value)} />
            </label>
            <label className="text-sm font-semibold text-slate-700">End date
              <Input className="mt-1 font-normal" type="date" value={editForm.endDate} onChange={event => setEdit("endDate", event.target.value)} />
            </label>
          </div>
          <label className="text-sm font-semibold text-slate-700 lg:col-span-2">Description <span className="font-normal text-slate-400">(optional)</span>
            <Textarea className="mt-1 font-normal" rows={3} value={editForm.description} onChange={event => setEdit("description", event.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={() => action.mutate({ method: "PATCH", url: `/api/championships/${selected}`, body: { ...editForm, startDate: editForm.startDate || null, endDate: editForm.endDate || null }, success: "Championship details updated" })}>Save details</Button>
          <Button variant="outline" className="ml-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteTarget(detail.championship)}>
            <Trash2 size={16} /> Delete championship
          </Button>
        </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 3 — Teams. Adding teams stays available for the whole life of the championship. */}
      <SectionCard id={SECTION.teams} icon={Users} title={`Teams (${teams.length})`} description="Add and manage the teams participating in this championship."
        action={<Button onClick={() => setShowAddTeam(true)}><Plus size={16} /> Add Team</Button>}>
        {teams.length === 0
          ? <EmptyState icon={Users} title="No teams added yet." description="Add teams before scheduling a match."
              action={<Button onClick={() => setShowAddTeam(true)}><Plus size={16} /> Add your first team</Button>} />
          : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {teams.map((team: any) => <div key={team.id} className="rounded-xl border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-2xl">{team.emoticon}</div>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-base text-slate-900">{team.name}</b>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500"><Crown size={12} className="shrink-0 text-amber-500" /> {playerName(team.captainId)}</p>
                    <p className="text-xs text-slate-500">{team.memberIds.length} member{team.memberIds.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 border-t pt-3">
                  <Button asChild size="sm" variant="ghost"><a href={`/championship-teams/${team.id}`} target="_blank" rel="noreferrer"><Eye size={15} /> View</a></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingTeam({ ...team })}><Edit3 size={15} /> Edit</Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${team.name}`} onClick={() => setDeleteTeamTarget(team)}><Trash2 size={15} /></Button>
                </div>
              </div>)}
            </div>}
        {teams.length === 1 && <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> Add at least one more team before scheduling a match.
        </p>}
      </SectionCard>

      {/* 4 — Matches & schedule */}
      <SectionCard id={SECTION.matches} icon={CalendarDays} title="Matches & Schedule" description="Create fixtures and manage scheduled matches."
        action={teams.length >= 2 ? <Button onClick={() => setShowScheduleMatch(true)}><Plus size={16} /> Schedule Match</Button> : undefined}>
        {teams.length < 2
          ? <EmptyState icon={Users} title="Add at least two teams first." description="A match is played between two different teams in this championship."
              action={<Button onClick={() => scrollToSection(SECTION.teams)}><Users size={16} /> Go to Teams</Button>} />
          : matches.length === 0
            ? <EmptyState icon={CalendarDays} title="No matches scheduled yet." description="Create a match between two teams."
                action={<Button onClick={() => setShowScheduleMatch(true)}><Plus size={16} /> Schedule your first match</Button>} />
            : <div className="space-y-6">
                {liveMatch && <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-red-600"><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Live now</h4>
                  {renderMatchCard(liveMatch)}
                </div>}
                <div>
                  <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Upcoming ({upcomingMatches.length})</h4>
                  {upcomingMatches.length === 0
                    ? <EmptyState icon={CalendarDays} title="No upcoming matches." description="Schedule a match to add another fixture." />
                    : <div className="space-y-3">{upcomingMatches.map(match => renderMatchCard(match))}</div>}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Completed ({completedMatches.length})</h4>
                  {completedMatches.length === 0
                    ? <EmptyState icon={CheckCircle2} title="No completed matches yet." description="Results appear here once a match has ended." />
                    : <div className="space-y-3">{completedMatches.map(match => renderMatchCard(match))}</div>}
                </div>
              </div>}
      </SectionCard>

      {/* 5 — Live match control. Contextual: the full desk appears only while a
          match is actually live, otherwise a compact placeholder holds its place. */}
      <div id={SECTION.live} className="scroll-mt-4">
      {liveMatch ? <LiveMatchControl
          match={liveMatch}
          teamA={teamById(liveMatch.teamAId)}
          teamB={teamById(liveMatch.teamBId)}
          winnerOverride={winnerOverrides[liveMatch.id] ?? ""}
          onWinnerOverrideChange={value => setWinnerOverrides(current => ({ ...current, [liveMatch.id]: value }))}
          onEndMatch={setEndMatchTarget}
          onMatchEnded={refresh}
        /> : <section className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-5 shadow-sm">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Radio size={20} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-900">🔴 No match is currently live.</h3>
          <p className="mt-0.5 text-sm text-slate-500">Start a scheduled match to manage it here.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => scrollToSection(SECTION.matches)}><CalendarDays size={15} /> Go to matches</Button>
      </section>}
      </div>

      {/* 6 — Results & standings. Available at every stage: the leader is provisional
          while the championship runs and only becomes the winner once it is Completed. */}
      <div id={SECTION.results} className="scroll-mt-4 space-y-5">
        {championshipStatus === "completed" && detail.champion
          ? <div className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 p-5 text-slate-950 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest">🏆 Championship Winner</p>
              <p className="mt-1 text-2xl font-black">{detail.champion.emoticon} {detail.champion.name}</p>
              <p className="mt-1 text-sm font-semibold opacity-80">{detail.champion.points} points from {detail.champion.played} match{detail.champion.played === 1 ? "" : "es"}</p>
            </div>
          : leader && completedMatches.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Current Leader</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{leader.emoticon} {leader.name}</p>
              <p className="mt-1 text-sm text-amber-800">{leader.points} points from {leader.played} match{leader.played === 1 ? "" : "es"} · positions can still change while matches are being played.</p>
            </div>}
        <SectionCard icon={Trophy} title="Results & Standings" description="Review completed matches and current championship standings.">
          {teams.length === 0
            ? <EmptyState icon={Users} title="No teams added yet." description="Standings appear once teams have been added and matches played."
                action={<Button variant="outline" onClick={() => scrollToSection(SECTION.teams)}>Go to Teams</Button>} />
            : <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                    <th className="p-2 font-semibold">Rank</th><th className="p-2 font-semibold">Team</th>
                    <th className="p-2 font-semibold">Played</th><th className="p-2 font-semibold">Wins</th>
                    <th className="p-2 font-semibold">Draws</th><th className="p-2 font-semibold">Losses</th>
                    <th className="p-2 font-semibold">Points</th>
                  </tr></thead>
                  <tbody>{detail.standings.map((team: any, index: number) => <tr key={team.id} className="border-b last:border-0">
                    <td className="p-2 font-bold text-slate-500">{index + 1}</td>
                    <td className="p-2 font-semibold text-slate-900">{team.emoticon} {team.name}</td>
                    <td className="p-2">{team.played}</td><td className="p-2">{team.wins}</td>
                    <td className="p-2">{team.draws ?? 0}</td><td className="p-2">{team.losses}</td>
                    <td className="p-2 font-black text-slate-900">{team.points}</td>
                  </tr>)}</tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500">Standings are updated automatically when matches are completed. 2 points per win.</p>
              </div>}
        </SectionCard>
        <SectionCard icon={CheckCircle2} title={`Completed matches (${completedMatches.length})`} description="Final scores for every match that has been played.">
          {completedMatches.length === 0
            ? <EmptyState icon={CheckCircle2} title="No completed matches yet." description="Results appear here as soon as a match ends." />
            : <div className="space-y-3">{completedMatches.map(match => renderMatchCard(match, { hideResultLink: true }))}</div>}
        </SectionCard>
      </div>
    </>}

    {/* Create championship */}
    <Dialog open={showCreateChampionship} onOpenChange={setShowCreateChampionship}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New championship</DialogTitle>
          <DialogDescription>Set the basic details. You can add teams and matches next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="text-sm font-semibold">Championship name<Input className="mt-1 font-normal" placeholder="e.g. Summer League" value={createForm.name} onChange={event => setCreate("name", event.target.value)} /></label>
          <label className="text-sm font-semibold">Description <span className="font-normal text-slate-400">(optional)</span><Textarea className="mt-1 font-normal" rows={3} value={createForm.description} onChange={event => setCreate("description", event.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold">Start date<Input className="mt-1 font-normal" type="date" value={createForm.startDate} onChange={event => setCreate("startDate", event.target.value)} /></label>
            <label className="text-sm font-semibold">End date<Input className="mt-1 font-normal" type="date" value={createForm.endDate} onChange={event => setCreate("endDate", event.target.value)} /></label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreateChampionship(false)}>Cancel</Button>
          <Button disabled={!createForm.name.trim() || createChampionship.isPending} onClick={() => createChampionship.mutate()}>{createChampionship.isPending ? "Creating..." : "Create championship"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Add team */}
    <Dialog open={showAddTeam} onOpenChange={setShowAddTeam}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add team</DialogTitle>
          <DialogDescription>Players already assigned to another team in this championship are hidden.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span><label className="font-semibold">Team name and icon</label></div>
            <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
              <Input className="h-11" placeholder="Enter a unique team name" value={teamName} onChange={event => setTeamName(event.target.value)} />
              <div className="relative"><Smile className="absolute left-3 top-3 text-slate-400" size={18} /><Input className="h-11 pl-10 text-xl" aria-label="Team emoji" value={emoticon} onChange={event => setEmoticon(event.target.value)} maxLength={8} /></div>
            </div>
            <div className="mt-2 flex gap-2">{["👏", "🔥", "❤️", "👍", "🦁", "🦅"].map(emoji => <button key={emoji} type="button" onClick={() => setEmoticon(emoji)} className={`h-9 w-9 rounded-lg border text-lg hover:bg-slate-50 ${emoticon === emoji ? "border-blue-500 bg-blue-50" : ""}`}>{emoji}</button>)}</div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span><label className="flex items-center gap-1 font-semibold"><Crown size={16} className="text-amber-500" />Choose captain</label></div>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowCreatePlayer(true)}><UserPlus size={15} />Create new player</Button>
            </div>
            <select className="h-11 w-full rounded-md border bg-white px-3" value={captainId} onChange={event => handleCaptainChange(event.target.value)}>
              <option value="">Select a registered player</option>
              {availablePlayers.map(user => <option key={user.id} value={user.id}>{user.fullName || user.username}</option>)}
            </select>
            <p className="mt-2 text-xs text-slate-500">Captains are normal player accounts. Create one here if the person has not registered yet.</p>
            {availablePlayers.length === 0 && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">All registered players are already assigned. Create a new player to continue.</p>}
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span><label className="font-semibold">Add members <span className="font-normal text-slate-400">(optional)</span></label></div>
            {!captainId
              ? <div className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">Choose a captain first. The captain is added automatically and will not appear here.</div>
              : additionalCandidates.length === 0
                ? <div className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">No other unassigned players are available.</div>
                : <div className="grid max-h-44 gap-2 overflow-auto rounded-xl border p-3 sm:grid-cols-2">
                    {additionalCandidates.map(user => <label key={user.id} className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm ${memberIds.includes(user.id) ? "bg-blue-50 text-blue-800" : "hover:bg-slate-50"}`}>
                      <input className="h-4 w-4" type="checkbox" checked={memberIds.includes(user.id)} onChange={event => setMemberIds(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))} />
                      <span>{user.fullName || user.username}</span>
                    </label>)}
                  </div>}
          </div>
          <p className="text-xs text-slate-500">Captain + {memberIds.length} additional member{memberIds.length === 1 ? "" : "s"}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddTeam(false)}>Cancel</Button>
          <Button disabled={!teamName.trim() || !captainId || action.isPending} onClick={handleCreateTeam}><UserPlus size={16} />Create team</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Edit team */}
    <Dialog open={!!editingTeam} onOpenChange={open => !open && setEditingTeam(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit team</DialogTitle>
          <DialogDescription>Update the team name, icon, captain and members.</DialogDescription>
        </DialogHeader>
        {editingTeam && <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold sm:col-span-2">Team name<Input className="mt-1 font-normal" value={editingTeam.name} onChange={event => setEditingTeam({ ...editingTeam, name: event.target.value })} /></label>
            <label className="text-sm font-semibold">Icon<Input className="mt-1 text-xl font-normal" value={editingTeam.emoticon} onChange={event => setEditingTeam({ ...editingTeam, emoticon: event.target.value })} /></label>
          </div>
          <label className="block text-sm font-semibold">Captain
            <select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm font-normal" value={editingTeam.captainId}
              onChange={event => setEditingTeam({ ...editingTeam, captainId: Number(event.target.value), memberIds: [...new Set([...(editingTeam.memberIds ?? []), Number(event.target.value)])] })}>
              {eligiblePlayers.map(user => <option key={user.id} value={user.id}>{user.fullName || user.username}</option>)}
            </select>
          </label>
          <div>
            <p className="text-sm font-semibold">Members</p>
            <div className="mt-1 grid max-h-52 gap-1 overflow-auto rounded-xl border p-2 sm:grid-cols-2">
              {eligiblePlayers.filter(user => user.id !== editingTeam.captainId).map(user => <label key={user.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={(editingTeam.memberIds ?? []).includes(user.id)}
                  onChange={event => setEditingTeam({ ...editingTeam, memberIds: event.target.checked ? [...editingTeam.memberIds, user.id] : editingTeam.memberIds.filter((id: number) => id !== user.id) })} />
                {user.fullName || user.username}
              </label>)}
            </div>
          </div>
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingTeam(null)}>Cancel</Button>
          <Button onClick={() => { action.mutate({ method: "PATCH", url: `/api/championship-teams/${editingTeam.id}`, body: { name: editingTeam.name, captainId: editingTeam.captainId, memberIds: editingTeam.memberIds, emoticon: editingTeam.emoticon }, success: "Team updated" }); setEditingTeam(null); }}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Create match */}
    <Dialog open={showScheduleMatch} onOpenChange={setShowScheduleMatch}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create match</DialogTitle>
          <DialogDescription>Pair two different teams and choose when the match should appear.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold">Competing teams</label>
            <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <select className="h-12 w-full rounded-lg border bg-white px-3" value={teamAId} onChange={event => handleTeamAChange(event.target.value)}>
                <option value="">Select Team A</option>
                {teams.map((team: any) => <option key={team.id} value={team.id}>{team.emoticon} {team.name}</option>)}
              </select>
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-900 text-xs font-black text-white">VS</span>
              <select className="h-12 w-full rounded-lg border bg-white px-3" value={teamBId} onChange={event => setTeamBId(event.target.value)} disabled={!teamAId}>
                <option value="">Select Team B</option>
                {teams.filter((team: any) => team.id !== teamAId).map((team: any) => <option key={team.id} value={team.id}>{team.emoticon} {team.name}</option>)}
              </select>
            </div>
            {!teamAId && <p className="mt-2 text-xs text-slate-500">Choose Team A first; it will be excluded from Team B automatically.</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Match date and time <span className="font-normal text-slate-400">(optional)</span></label>
            <Input className="h-11" type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} />
            <p className="mt-1 text-xs text-slate-500">The date is informational. The match only starts when an admin clicks Start Match.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Live stream link <span className="font-normal text-slate-400">(optional)</span></label>
            <Input className="h-11" placeholder="https://stream.example.com/live.m3u8" value={streamUrl} onChange={event => setStreamUrl(event.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Shown on the public Watch page. You can add or change it later.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowScheduleMatch(false)}>Cancel</Button>
          <Button disabled={!teamAId || !teamBId || teamAId === teamBId} onClick={handleScheduleMatch}><CalendarDays size={16} />Create match</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Edit match */}
    <Dialog open={!!editingMatch} onOpenChange={open => !open && setEditingMatch(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit match</DialogTitle>
          <DialogDescription>Change the teams, date or stream link before the match starts.</DialogDescription>
        </DialogHeader>
        {editingMatch && <div className="space-y-4">
          <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <select className="h-11 w-full rounded-md border bg-white px-3" value={editingMatch.teamAId} onChange={event => setEditingMatch({ ...editingMatch, teamAId: event.target.value })}>
              {teams.map((team: any) => <option key={team.id} value={team.id}>{team.emoticon} {team.name}</option>)}
            </select>
            <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-[11px] font-black text-white">VS</span>
            <select className="h-11 w-full rounded-md border bg-white px-3" value={editingMatch.teamBId} onChange={event => setEditingMatch({ ...editingMatch, teamBId: event.target.value })}>
              {teams.map((team: any) => <option key={team.id} value={team.id}>{team.emoticon} {team.name}</option>)}
            </select>
          </div>
          <label className="block text-sm font-semibold">Match date and time
            <Input className="mt-1 font-normal" type="datetime-local" value={editingMatch.scheduledAt ?? ""} onChange={event => setEditingMatch({ ...editingMatch, scheduledAt: event.target.value })} />
          </label>
          <label className="block text-sm font-semibold">Live stream link
            <Input className="mt-1 font-normal" placeholder="https://stream.example.com/live.m3u8" value={editingMatch.streamUrl ?? ""} onChange={event => setEditingMatch({ ...editingMatch, streamUrl: event.target.value })} />
          </label>
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingMatch(null)}>Cancel</Button>
          <Button onClick={() => { action.mutate({ method: "PATCH", url: `/api/championship-matches/${editingMatch.id}`, body: { teamAId: editingMatch.teamAId, teamBId: editingMatch.teamBId, scheduledAt: editingMatch.scheduledAt || null, streamUrl: editingMatch.streamUrl || null }, success: "Match updated" }); setEditingMatch(null); }}>Save match</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* End match confirmation */}
    <AlertDialog open={!!endMatchTarget} onOpenChange={open => !open && setEndMatchTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End this match?</AlertDialogTitle>
          <AlertDialogDescription>
            {endMatchTarget && <>
              The final score will be recorded as <b>{teamById(endMatchTarget.teamAId)?.name} {endMatchTarget.teamAScore} – {endMatchTarget.teamBScore} {teamById(endMatchTarget.teamBId)?.name}</b>
              {winnerOverrides[endMatchTarget.id] ? <> and <b>{teamById(winnerOverrides[endMatchTarget.id])?.name}</b> will be recorded as the winner.</> : " and the winner is decided by the highest score."}
              {" "}The standings update immediately and the match cannot be reopened.
            </>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep playing</AlertDialogCancel>
          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => {
            // The live desk hands over the match carrying the score gameplay
            // last reported, so /end records that rather than a stale payload.
            action.mutate({ url: `/api/championship-matches/${endMatchTarget.id}/end`, body: { teamAScore: endMatchTarget.teamAScore, teamBScore: endMatchTarget.teamBScore, winnerTeamId: winnerOverrides[endMatchTarget.id] || null }, success: "Match completed" });
            setEndMatchTarget(null);
          }}>End match</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Delete team confirmation */}
    <AlertDialog open={!!deleteTeamTarget} onOpenChange={open => !open && setDeleteTeamTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {deleteTeamTarget?.name}?</AlertDialogTitle>
          <AlertDialogDescription>The team is removed from this championship. A team that already appears in a match cannot be deleted.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep team</AlertDialogCancel>
          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => {
            action.mutate({ method: "DELETE", url: `/api/championship-teams/${deleteTeamTarget.id}`, success: "Team deleted" });
            setDeleteTeamTarget(null);
          }}>Delete team</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the championship, its teams, scheduled matches, scores, and standings. This cannot be undone. A championship with a live match cannot be deleted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep championship</AlertDialogCancel><AlertDialogAction onClick={deleteChampionship} className="bg-red-600 hover:bg-red-700">Delete permanently</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <Dialog open={showCreatePlayer} onOpenChange={setShowCreatePlayer}><DialogContent><DialogHeader><DialogTitle>Create player account</DialogTitle><DialogDescription>This creates a normal FaithIQ login and selects the new player as team captain.</DialogDescription></DialogHeader><div className="space-y-3"><label className="text-sm font-medium">Full name<Input placeholder="e.g. Maria Joseph" value={playerForm.fullName} onChange={event => setPlayerForm({ ...playerForm, fullName: event.target.value })}/></label><label className="text-sm font-medium">Username<Input placeholder="e.g. maria_joseph" value={playerForm.username} onChange={event => setPlayerForm({ ...playerForm, username: event.target.value })}/></label><label className="text-sm font-medium">Email<Input type="email" placeholder="player@example.com" value={playerForm.email} onChange={event => setPlayerForm({ ...playerForm, email: event.target.value })}/></label><label className="text-sm font-medium">Temporary password<Input type="password" placeholder="Minimum 8 characters" value={playerForm.password} onChange={event => setPlayerForm({ ...playerForm, password: event.target.value })}/></label></div><DialogFooter><Button variant="outline" onClick={() => setShowCreatePlayer(false)}>Cancel</Button><Button disabled={creatingPlayer || !playerForm.fullName.trim() || !playerForm.username.trim() || !playerForm.email.trim() || playerForm.password.length < 8} onClick={handleCreatePlayer}>{creatingPlayer ? "Creating..." : "Create and select"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
