import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CalendarClock,
  CalendarX,
  Eye,
  Gamepad2,
  ListOrdered,
  Loader2,
  Lock,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Trophy,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { navigateToTeamBattleGame } from "@/lib/team-battle-navigation";
import { sendGameEvent, setupGameSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import {
  canJoinMatch,
  championshipStatusOf,
  displayName,
  formatKickoff,
  groupMatches,
  isTeamInMatch,
  matchOutcome,
  matchStatusOf,
  matchTimingLabel,
  orderMatches,
  pickFocusMatch,
  teamMemberIds,
  type ChampionshipDetail,
  type ChampionshipMatchSummary,
  type ChampionshipTeamDetail,
  type ChampionshipTeamSummary,
  type DirectoryUser,
  type MyChampionshipDashboard,
} from "@/lib/championship";
import { EmptyState } from "@/components/championship/EmptyState";
import { MatchActions } from "@/components/championship/MatchActions";
import { MatchCard } from "@/components/championship/MatchCard";
import { SectionHeader } from "@/components/championship/SectionHeader";
import {
  ChampionshipStatusBadge,
  MatchStatusBadge,
  ParticipationBadge,
  TeamRoleBadge,
} from "@/components/championship/StatusBadges";

const DASHBOARD_KEY = "/api/championships/me/dashboard";
const CHAMPIONSHIP_KEY = "/api/championships";
const TEAM_KEY = "/api/championship-teams";

/** Emoticons a captain can pick for a new team. Stored in the existing `emoticon` column. */
const TEAM_EMOTICONS = ["👏", "🔥", "⚡", "🦁", "🕊️", "⭐", "🛡️", "🎯"];

const PAGE_SHELL = "home-page min-h-screen bg-gradient-to-b from-[#121628] via-[#1a1f3a] to-[#0d1020] font-heading";

/**
 * The hero of the page: the one match the player has to act on right now.
 *
 * Live gets the strongest treatment on the page and is the ONLY place a Join
 * button can appear; upcoming is informational; a finished match shows the
 * result. Each state says plainly what is happening, so a player never has to
 * infer their situation from a fixture list.
 */
function FocusMatchPanel({
  match,
  teamA,
  teamB,
  myTeamId,
  canJoin,
  joining,
  onJoin,
  onOpen,
}: {
  match: ChampionshipMatchSummary;
  teamA?: ChampionshipTeamSummary;
  teamB?: ChampionshipTeamSummary;
  myTeamId: string;
  canJoin: boolean;
  joining: boolean;
  onJoin: () => void;
  onOpen: () => void;
}) {
  const status = matchStatusOf(match);
  const outcome = matchOutcome(match, myTeamId);
  const kickoff = formatKickoff(match.scheduledAt);

  const heading =
    status === "live" ? "Your match is live" : status === "upcoming" ? "Your next match" : "Your latest result";
  const explanation =
    status === "live"
      ? "Your team is playing now — join to take your place."
      : status === "upcoming"
        ? kickoff
          ? `Kick-off ${kickoff}. You can join once the match goes live.`
          : "A kick-off time has not been announced yet. You can join once the match goes live."
        : outcome === "won"
          ? "Your team won this match."
          : outcome === "lost"
            ? "Your team lost this match."
            : "This match finished level.";

  const teamLabel = (team: ChampionshipTeamSummary | undefined, fallback: string, isMine: boolean) => (
    <span className={cn("inline-flex items-center gap-2 font-bold", isMine ? "text-accent" : "text-white")}>
      <span aria-hidden="true">{team?.emoticon ?? "🏳️"}</span>
      <span className="truncate">{team?.name ?? fallback}</span>
    </span>
  );

  return (
    <section
      className={cn(
        "rounded-2xl border p-5 sm:p-6",
        status === "live"
          ? "border-red-400/50 bg-gradient-to-br from-red-500/15 to-red-500/[0.04] shadow-[0_0_30px_-12px_rgba(248,113,113,0.5)]"
          : status === "upcoming"
            ? "border-amber-400/40 bg-gradient-to-br from-amber-400/12 to-amber-400/[0.03]"
            : "border-emerald-400/30 bg-gradient-to-br from-emerald-400/10 to-emerald-400/[0.02]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MatchStatusBadge status={status} />
        <span className="text-xs text-white/50">{matchTimingLabel(match)}</span>
      </div>

      <h2 className="mt-3 text-xl sm:text-2xl font-bold text-white">{heading}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-base sm:text-lg">
        {teamLabel(teamA, "Team A", match.teamAId === myTeamId)}
        <span className="text-xs font-bold uppercase tracking-widest text-white/35">vs</span>
        {teamLabel(teamB, "Team B", match.teamBId === myTeamId)}
      </div>

      {status !== "upcoming" && (
        <p className="mt-3 text-3xl font-black text-white tabular-nums">
          {match.teamAScore} <span className="text-white/30">:</span> {match.teamBScore}
        </p>
      )}

      <p className="mt-3 text-sm text-white/65 leading-relaxed">{explanation}</p>

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        {status === "live" && canJoin ? (
          <Button
            size="lg"
            onClick={onJoin}
            disabled={joining}
            className="w-full sm:w-auto h-12 text-base bg-accent hover:bg-accent/90 text-primary font-bold"
          >
            {joining ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
            {joining ? "Joining match…" : "Join match"}
          </Button>
        ) : (
          <Button
            size="lg"
            variant="outline"
            className="home-btn-outline w-full sm:w-auto"
            onClick={onOpen}
          >
            {status === "live" ? (
              <>
                <Eye className="mr-2 h-4 w-4" /> Watch live
              </>
            ) : status === "upcoming" ? (
              <>
                <CalendarClock className="mr-2 h-4 w-4" /> View match
              </>
            ) : (
              <>
                <Trophy className="mr-2 h-4 w-4" /> View result
              </>
            )}
          </Button>
        )}
      </div>
    </section>
  );
}

export default function MyChampionship() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [teamName, setTeamName] = useState("");
  const [teamEmoticon, setTeamEmoticon] = useState(TEAM_EMOTICONS[0]);
  const [newMemberId, setNewMemberId] = useState("");
  const [rosterOpen, setRosterOpen] = useState(false);
  const [joiningMatchId, setJoiningMatchId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The player's own state. Polled so a match going live shows up without a
  // manual reload - championship socket events are addressed to spectators of a
  // specific match, which this page is not.
  const dashboardQuery = useQuery<MyChampionshipDashboard>({
    queryKey: [DASHBOARD_KEY],
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
  const dashboard = dashboardQuery.data;
  const championship = dashboard?.championship ?? null;
  const myTeam = dashboard?.team ?? null;
  const isCaptain = !!myTeam && myTeam.captainId === user?.id;

  // The public championship payload: standings, the champion, and the matches
  // the dashboard endpoint filters out for a player who has a team.
  const detailQuery = useQuery<ChampionshipDetail>({
    queryKey: [CHAMPIONSHIP_KEY, championship?.id],
    queryFn: async () => {
      const response = await fetch(`/api/championships/${championship!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Championship not found");
      return response.json();
    },
    enabled: !!championship?.id,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  // Roster names for the player's own team.
  const teamQuery = useQuery<ChampionshipTeamDetail>({
    queryKey: [TEAM_KEY, myTeam?.id],
    queryFn: async () => {
      const response = await fetch(`/api/championship-teams/${myTeam!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Team not found");
      return response.json();
    },
    enabled: !!myTeam?.id,
    staleTime: 30_000,
  });

  // The member picker is a captain-only control, so the user directory is only
  // fetched for a captain.
  const directoryQuery = useQuery<DirectoryUser[]>({ queryKey: ["/api/users"], enabled: isCaptain });

  // Tracked separately from isFetching so the button does not flicker on every
  // background poll - it only reports refreshes the player actually asked for.
  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: [DASHBOARD_KEY] }),
        championship?.id
          ? queryClient.invalidateQueries({ queryKey: [CHAMPIONSHIP_KEY, championship.id] })
          : Promise.resolve(),
        myTeam?.id ? queryClient.invalidateQueries({ queryKey: [TEAM_KEY, myTeam.id] }) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const teams = useMemo(() => {
    const byId = new Map<string, ChampionshipTeamSummary>();
    for (const team of dashboard?.teams ?? []) byId.set(team.id, team);
    for (const team of detailQuery.data?.teams ?? []) byId.set(team.id, team);
    if (myTeam) byId.set(myTeam.id, myTeam);
    return byId;
  }, [dashboard?.teams, detailQuery.data?.teams, myTeam]);

  const dashboardMatches = useMemo(() => dashboard?.matches ?? [], [dashboard?.matches]);
  const detailMatches = detailQuery.data?.matches;

  // The dashboard endpoint already scopes `matches` to the player's own team
  // when they have one, and it polls faster than the public payload, so it is
  // the source of truth for "my matches".
  const myMatches = useMemo(
    () => (myTeam ? dashboardMatches.filter(match => isTeamInMatch(match, myTeam.id)) : []),
    [dashboardMatches, myTeam],
  );
  const otherMatches = useMemo(() => {
    const source = detailMatches ?? (myTeam ? [] : dashboardMatches);
    return orderMatches(source.filter(match => !isTeamInMatch(match, myTeam?.id)));
  }, [detailMatches, dashboardMatches, myTeam]);

  const myGrouped = useMemo(() => groupMatches(myMatches), [myMatches]);
  const focusMatch = useMemo(() => pickFocusMatch(myGrouped), [myGrouped]);
  // Adding a member is refused by the server while the team is in a live match,
  // so the control says so instead of failing after the fact.
  const rosterLocked = myGrouped.live.length > 0;

  const standings = detailQuery.data?.standings ?? [];
  const champion = detailQuery.data?.champion ?? null;

  const roster = teamQuery.data?.members ?? [];
  const memberCount = teamMemberIds(myTeam).length;

  // A user can only belong to one team per championship, so anyone already on a
  // team is left out of the picker rather than rejected on submit.
  const candidates = useMemo(() => {
    const assigned = new Set<number>();
    teams.forEach(team => teamMemberIds(team).forEach(id => assigned.add(id)));
    return (directoryQuery.data ?? []).filter(candidate => !candidate.isAdmin && !assigned.has(candidate.id));
  }, [directoryQuery.data, teams]);

  const createTeam = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/championship-teams", {
        championshipId: championship!.id,
        name: teamName.trim(),
        captainId: user?.id,
        memberIds: [],
        emoticon: teamEmoticon,
      });
      return response.json();
    },
    onSuccess: () => {
      setTeamName("");
      refreshAll();
      toast({ title: "Team created", description: "You are the captain of this team." });
    },
    onError: (error: unknown) =>
      toast({
        title: "Could not create team",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      }),
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/championship-teams/${myTeam!.id}/members`, {
        userId: Number(newMemberId),
      });
      return response.json();
    },
    onSuccess: () => {
      setNewMemberId("");
      refreshAll();
      toast({ title: "Member added" });
    },
    onError: (error: unknown) =>
      toast({
        title: "Could not add member",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      }),
  });

  // Join flow - unchanged. The captain starts the Team Battle over the socket
  // and gets a longer hand-off delay so the session exists before teammates
  // arrive.
  const joinMatch = async (match: ChampionshipMatchSummary) => {
    setJoiningMatchId(match.id);
    try {
      const response = await apiRequest("POST", `/api/championship-matches/${match.id}/join`, {});
      const access = await response.json();
      setupGameSocket();
      if (access.isCaptain) sendGameEvent({ type: "start_team_battle", gameSessionId: access.gameSessionId });
      window.setTimeout(() => navigateToTeamBattleGame(setLocation, access.gameSessionId), access.isCaptain ? 900 : 100);
    } catch (error) {
      setJoiningMatchId(null);
      toast({
        title: "Unable to join match",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const openMatch = (match: ChampionshipMatchSummary) => setLocation(`/watch/${match.id}`);

  const renderMatchCard = (match: ChampionshipMatchSummary, variant: "mine" | "other") => (
    <MatchCard
      key={match.id}
      match={match}
      teamA={teams.get(match.teamAId)}
      teamB={teams.get(match.teamBId)}
      myTeamId={myTeam?.id ?? null}
      variant={variant}
      actions={
        <MatchActions
          status={matchStatusOf(match)}
          mine={variant === "mine"}
          canJoin={canJoinMatch(match, myTeam, user?.id)}
          joining={joiningMatchId === match.id}
          onJoin={() => joinMatch(match)}
          onOpen={() => openMatch(match)}
          size="sm"
        />
      }
    />
  );

  if (dashboardQuery.isLoading) {
    return (
      <div className={cn(PAGE_SHELL, "flex items-center justify-center")}>
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className={cn(PAGE_SHELL, "flex items-center justify-center p-6")}>
        <div className="max-w-md w-full text-center">
          <Trophy className="mx-auto h-12 w-12 text-accent" />
          <h1 className="mt-4 text-2xl font-bold text-white">Championship unavailable</h1>
          <p className="mt-2 text-white/60">
            {dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Please try again."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => dashboardQuery.refetch()} className="bg-accent hover:bg-accent/90 text-primary font-semibold">
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
            <Button variant="outline" className="home-btn-outline" onClick={() => setLocation("/")}>
              Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!championship) {
    return (
      <div className={cn(PAGE_SHELL, "flex items-center justify-center p-6")}>
        <div className="max-w-md w-full text-center">
          <Trophy className="mx-auto h-14 w-14 text-accent" />
          <h1 className="mt-4 text-2xl sm:text-3xl font-bold text-white">No championship is running</h1>
          <p className="mt-2 text-white/60">
            There is no active championship at the moment. When the next one starts, your team and fixtures appear here.
          </p>
          <Button className="mt-6 bg-accent hover:bg-accent/90 text-primary font-semibold" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL}>
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" className="home-btn-outline" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Home
          </Button>
          <Button
            variant="ghost"
            className="text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => void refreshAll()}
            disabled={refreshing}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* 1 — Championship header: which championship, and am I in it? */}
        <header className="home-glass-card rounded-2xl border border-white/10 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-accent text-[11px] font-bold uppercase tracking-[0.2em]">FaithIQ Championship</p>
              <h1 className="mt-1 text-2xl sm:text-4xl font-bold text-white break-words">{championship.name}</h1>
              {championship.description && (
                <p className="mt-2 max-w-2xl text-sm sm:text-base text-white/60">{championship.description}</p>
              )}
            </div>
            <ChampionshipStatusBadge status={championshipStatusOf(championship)} />
          </div>

          <div
            className={cn(
              "mt-5 rounded-xl border p-4",
              myTeam ? "border-emerald-400/25 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.03]",
            )}
          >
            {myTeam ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <span className="text-3xl leading-none" aria-hidden="true">
                  {myTeam.emoticon}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Your team</p>
                  <p className="text-lg sm:text-xl font-bold text-white truncate">{myTeam.name}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <TeamRoleBadge isCaptain={isCaptain} />
                  <ParticipationBadge participating />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <ParticipationBadge participating={false} />
                <p className="text-sm text-white/60">
                  You are not currently assigned to a championship team.
                </p>
              </div>
            )}
          </div>
        </header>

        {/* 3 — The one thing to act on right now. */}
        {myTeam ? (
          focusMatch ? (
            <FocusMatchPanel
              match={focusMatch}
              teamA={teams.get(focusMatch.teamAId)}
              teamB={teams.get(focusMatch.teamBId)}
              myTeamId={myTeam.id}
              canJoin={canJoinMatch(focusMatch, myTeam, user?.id)}
              joining={joiningMatchId === focusMatch.id}
              onJoin={() => joinMatch(focusMatch)}
              onOpen={() => openMatch(focusMatch)}
            />
          ) : (
            <EmptyState
              icon={CalendarX}
              title="No upcoming match"
              description={`${myTeam.name} has no scheduled match right now. This section will show your fixture as soon as one is scheduled.`}
            />
          )
        ) : (
          <EmptyState
            icon={UsersRound}
            tone="amber"
            title="You are not participating"
            description="You are not currently part of a championship team. Create a team to captain it, or ask an existing team captain to add you."
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {TEAM_EMOTICONS.map(emoticon => (
                  <button
                    key={emoticon}
                    type="button"
                    aria-label={`Use ${emoticon} as the team emoticon`}
                    aria-pressed={teamEmoticon === emoticon}
                    onClick={() => setTeamEmoticon(emoticon)}
                    className={cn(
                      "h-9 w-9 rounded-lg text-lg leading-none transition-colors",
                      teamEmoticon === emoticon
                        ? "bg-accent/20 border border-accent/50"
                        : "bg-white/5 border border-white/10 hover:bg-white/10",
                    )}
                  >
                    {emoticon}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
                <Input
                  className="bg-slate-950/40 border-white/15 text-white placeholder:text-white/35"
                  placeholder="Your team name"
                  value={teamName}
                  maxLength={80}
                  onChange={event => setTeamName(event.target.value)}
                />
                <Button
                  className="bg-accent hover:bg-accent/90 text-primary font-semibold shrink-0"
                  disabled={!teamName.trim() || createTeam.isPending}
                  onClick={() => createTeam.mutate()}
                >
                  {createTeam.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Create a team
                </Button>
              </div>
              <p className="text-xs text-white/45">
                {teams.size === 0
                  ? "No teams have been created yet — create the first one and you become its captain."
                  : "Creating a team makes you its captain. You can add members afterwards."}
              </p>
            </div>
          </EmptyState>
        )}

        {/* 2 — Team and role, with captain-only controls. */}
        {myTeam && (
          <section className="home-glass-card rounded-2xl border border-white/10 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-4xl leading-none" aria-hidden="true">
                  {myTeam.emoticon}
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white truncate">{myTeam.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/55">
                    <Users className="h-3.5 w-3.5" />
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {isCaptain && (
                  <Button
                    variant="outline"
                    className="home-btn-outline"
                    onClick={() => setRosterOpen(open => !open)}
                    aria-expanded={rosterOpen}
                  >
                    <UserPlus className="mr-2 h-4 w-4" /> Manage team
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="home-btn-outline"
                  onClick={() => setLocation(`/championship-teams/${myTeam.id}`)}
                >
                  <Eye className="mr-2 h-4 w-4" /> View team
                </Button>
              </div>
            </div>

            {roster.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {roster.map(member => (
                  <li
                    key={member.id}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                      member.id === user?.id
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-white/10 bg-white/5 text-white/75",
                    )}
                  >
                    <span className="truncate max-w-[12rem]">{displayName(member)}</span>
                    {member.id === myTeam.captainId && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">Captain</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Captain-only. A member never sees these controls. */}
            {isCaptain && rosterOpen && (
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-sm font-semibold text-white">Add a member</p>
                <p className="mt-1 text-xs text-white/50">
                  Only players who are not already on a team in this championship can be added.
                </p>
                {rosterLocked ? (
                  <p className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">
                    <Lock className="h-4 w-4 shrink-0" />
                    Your roster is locked while your match is live.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <select
                      className="flex-1 rounded-md border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white"
                      value={newMemberId}
                      onChange={event => setNewMemberId(event.target.value)}
                      aria-label="Select a player to add"
                    >
                      <option value="">
                        {directoryQuery.isLoading
                          ? "Loading players…"
                          : candidates.length === 0
                            ? "No players available"
                            : "Select a registered player"}
                      </option>
                      {candidates.map(candidate => (
                        <option key={candidate.id} value={candidate.id}>
                          {displayName(candidate)}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="bg-accent hover:bg-accent/90 text-primary font-semibold shrink-0"
                      disabled={!newMemberId || addMember.isPending}
                      onClick={() => addMember.mutate()}
                    >
                      {addMember.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="mr-2 h-4 w-4" />
                      )}
                      Add member
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 4 — Everything the player's own team plays, grouped by state. */}
        {myTeam && (
          <section>
            <SectionHeader
              icon={Gamepad2}
              title="Your matches"
              description="Every fixture your team is part of."
              count={myMatches.length}
            />
            {myMatches.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No matches yet"
                description="Your team has not been drawn into a fixture yet. Matches are scheduled by the championship organiser."
              />
            ) : (
              <div className="space-y-5">
                {myGrouped.live.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
                      <Radio className="h-3.5 w-3.5" /> Live now
                    </h3>
                    <div className="grid gap-3">{myGrouped.live.map(match => renderMatchCard(match, "mine"))}</div>
                  </div>
                )}
                {myGrouped.upcoming.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">
                      <CalendarClock className="h-3.5 w-3.5" /> Upcoming
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {myGrouped.upcoming.map(match => renderMatchCard(match, "mine"))}
                    </div>
                  </div>
                )}
                {myGrouped.completed.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                      <Trophy className="h-3.5 w-3.5" /> Completed
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {myGrouped.completed.map(match => renderMatchCard(match, "mine"))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 5 — Championship activity the player is not part of. */}
        {(otherMatches.length > 0 || !myTeam) && (
          <section>
            <SectionHeader
              icon={Eye}
              title={myTeam ? "Other championship matches" : "Championship matches"}
              description={
                myTeam
                  ? "Matches between other teams — you can watch, but not play in these."
                  : "Matches between championship teams. You can watch these, but you are not playing in them."
              }
              count={otherMatches.length}
              muted
            />
            {otherMatches.length === 0 ? (
              <EmptyState
                icon={CalendarX}
                title="No matches scheduled"
                description="No fixtures have been scheduled in this championship yet."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {otherMatches.map(match => renderMatchCard(match, "other"))}
              </div>
            )}
          </section>
        )}

        {/* 6 — Standings. */}
        {standings.length > 0 && (
          <section>
            <SectionHeader
              icon={ListOrdered}
              title="Standings"
              description="Two points for a win. Your team is highlighted."
            />
            {champion && (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/15 p-4">
                <Trophy className="h-6 w-6 text-accent shrink-0" />
                <p className="font-bold text-white">
                  Champion: <span className="text-accent">{champion.name}</span>
                </p>
              </div>
            )}
            <div className="home-glass-card rounded-2xl border border-white/10 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-white/40">
                    <th className="w-12 py-3 pl-4 text-left font-semibold">#</th>
                    <th className="py-3 text-left font-semibold">Team</th>
                    <th className="w-12 py-3 text-center font-semibold" title="Played">P</th>
                    <th className="w-12 py-3 text-center font-semibold" title="Wins">W</th>
                    <th className="w-12 py-3 text-center font-semibold" title="Draws">D</th>
                    <th className="w-12 py-3 text-center font-semibold" title="Losses">L</th>
                    <th className="w-16 py-3 pr-4 text-right font-semibold" title="Points">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, index) => {
                    const isMine = !!myTeam && row.id === myTeam.id;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-t border-white/5",
                          isMine ? "bg-accent/10" : index % 2 === 1 ? "bg-white/[0.02]" : undefined,
                        )}
                      >
                        <td className="py-3 pl-4 font-bold text-white/60 tabular-nums">{index + 1}</td>
                        <td className={cn("py-3 font-semibold", isMine ? "text-accent" : "text-white")}>
                          <span className="mr-2" aria-hidden="true">
                            {row.emoticon}
                          </span>
                          {row.name}
                          {isMine && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-accent/80">You</span>
                          )}
                        </td>
                        <td className="py-3 text-center text-white/70 tabular-nums">{row.played}</td>
                        <td className="py-3 text-center text-white/70 tabular-nums">{row.wins}</td>
                        <td className="py-3 text-center text-white/70 tabular-nums">{row.draws}</td>
                        <td className="py-3 text-center text-white/70 tabular-nums">{row.losses}</td>
                        <td className="py-3 pr-4 text-right font-bold text-white tabular-nums">{row.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Standings and other teams' fixtures come from the public championship
            payload. If that read fails the player's own state above is still
            complete, so the page degrades to a note rather than an error screen. */}
        {detailQuery.isError && (
          <p className="text-center text-xs text-white/40">
            Standings and other championship matches are unavailable right now.
          </p>
        )}
      </div>
    </div>
  );
}
