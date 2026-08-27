import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CalendarClock,
  CalendarX,
  Crown,
  Eye,
  Gamepad2,
  ListOrdered,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { navigateToTeamBattleGame } from "@/lib/team-battle-navigation";
import { setupGameSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import {
  canJoinMatch,
  championshipStatusOf,
  displayName,
  formatKickoff,
  groupMatches,
  isTeamInMatch,
  matchDisplayState,
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
  type MyChampionshipDashboard,
} from "@/lib/championship";
import { FaithIQTreeMark } from "@/components/championship/game/FaithIQTreeMark";
import { EmptyState } from "@/components/championship/EmptyState";
import { MatchActions } from "@/components/championship/MatchActions";
import { MatchCard } from "@/components/championship/MatchCard";
import { MatchResultModal } from "@/components/championship/MatchResultModal";
import { TeamAvatar } from "@/components/championship/TeamAvatar";
import { SectionHeader } from "@/components/championship/SectionHeader";
import {
  ChampionshipStatusBadge,
  MatchOutcomeBadge,
  MatchStatusBadge,
  ParticipationBadge,
  TeamRoleBadge,
} from "@/components/championship/StatusBadges";

const DASHBOARD_KEY = "/api/championships/me/dashboard";
const CHAMPIONSHIP_KEY = "/api/championships";
const TEAM_KEY = "/api/championship-teams";

/**
 * This page is read-only with respect to championship teams.
 *
 * Championship teams, captains and rosters are created and assigned by an
 * administrator in the Championship Management panel - never by a player, and
 * never by a team captain from here. The only write this page performs is
 * POST /api/championship-matches/:id/join, which is gameplay: it hands an
 * already-assigned team member into their live Team Battle.
 *
 * "Captain" is therefore displayed as information only. It carries no team
 * management capability on the player side.
 */
const PAGE_SHELL = "champ-portal min-h-screen font-heading";

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
  onViewResult,
}: {
  match: ChampionshipMatchSummary;
  teamA?: ChampionshipTeamSummary;
  teamB?: ChampionshipTeamSummary;
  myTeamId: string;
  canJoin: boolean;
  joining: boolean;
  onJoin: () => void;
  onOpen: () => void;
  /** Finished fixture: show the result here rather than opening /watch. */
  onViewResult: () => void;
}) {
  const status = matchStatusOf(match);
  const display = matchDisplayState(match);
  const outcome = matchOutcome(match, myTeamId);
  const kickoff = formatKickoff(match.scheduledAt);

  const heading = status === "live" ? "Your match" : status === "upcoming" ? "Upcoming match" : "Latest result";
  const explanation =
    status === "live"
      ? "Your team is playing now — join to take your place."
      : status === "upcoming"
        // The kick-off time passing does not start the match: the organiser
        // does, and only then can anyone join.
        ? display === "ready"
          ? "The scheduled time has arrived. Your match begins when the organiser starts it."
          : kickoff
            ? "You can join as soon as the match goes live."
            : "A kick-off time has not been announced yet. You can join once the match goes live."
        : outcome === "won"
          ? "Your team won this match."
          : outcome === "lost"
            ? "Your team lost this match."
            : "This match finished level.";

  // A finished fixture is a summary, not a call to action, so it renders in a
  // compact form: one balanced row instead of the stacked broadcast treatment,
  // with tighter padding and a smaller scoreline. Live and upcoming keep the
  // full-height presentation - the current match stays the strongest section.
  const compact = status === "completed";

  // Broadcast-style side: emoticon crest above the team name (stacked), or
  // beside it when compact.
  const teamSide = (team: ChampionshipTeamSummary | undefined, fallback: string, isMine: boolean) => (
    <div
      className={cn(
        "min-w-0",
        compact
          ? "flex w-fit flex-wrap items-center gap-x-2 gap-y-0.5"
          : "flex flex-col items-center gap-2 text-center",
      )}
    >
      <TeamAvatar logoUrl={team?.logoUrl} emoticon={team?.emoticon} alt={`${team?.name ?? fallback} logo`} className={cn("shrink-0", compact ? "h-5 w-5 text-xl" : "h-10 w-10 text-3xl sm:h-11 sm:w-11 sm:text-4xl")} />
      <span
        className={cn(
          "min-w-0 truncate font-bold",
          compact ? "text-sm" : "w-full text-sm sm:text-base",
          isMine ? "text-[#f0d58a]" : "text-white/85",
        )}
      >
        {team?.name ?? fallback}
      </span>
      {isMine && (
        <span className="shrink-0 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.16em] text-[#d4af37]/75">
          (Your Team)
        </span>
      )}
    </div>
  );

  const outcomeLabel =
    outcome === "won" ? "🏆 You won" : outcome === "lost" ? "Loss" : outcome === "draw" ? "Draw" : null;

  return (
    <section
      className={cn(
        "champ-surface champ-fade-in relative overflow-hidden",
        compact ? "p-4 sm:p-5" : "p-6 sm:p-8",
        status === "live" && "champ-live-glow border-[#f0576a]/30",
        display === "ready" && "border-[#d4af37]/30",
      )}
    >
      {/* Warm core behind the fixture, a touch of crimson while it is live. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-28 h-56 opacity-60 blur-3xl",
          status === "live"
            ? "bg-[radial-gradient(closest-side,rgba(240,87,106,0.22),transparent)]"
            : "bg-[radial-gradient(closest-side,rgba(122,84,255,0.26),transparent)]",
        )}
      />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MatchStatusBadge status={display} />
          {/* An upcoming fixture shows its kick-off large below, so it is not
              repeated here. */}
          {!(status === "upcoming" && kickoff) && (
            <span className="text-[11px] uppercase tracking-wider champ-meta">{matchTimingLabel(match)}</span>
          )}
        </div>

        <p className={cn("text-center champ-eyebrow", compact ? "mt-3" : "mt-5")}>{heading}</p>

        {compact ? (
          /* One balanced row: team · score · team. */
          <div className="mt-3 grid w-full items-center gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-10">
            <div className="justify-self-start text-left">
              {teamSide(teamA, "Team A", match.teamAId === myTeamId)}
            </div>
            <p className="champ-scoreline shrink-0 text-2xl font-black text-white sm:text-3xl">
              {match.teamAScore}
              <span className="mx-1.5 align-middle text-base text-white/25">:</span>
              {match.teamBScore}
            </p>
            <div className="justify-self-end text-right">
              {teamSide(teamB, "Team B", match.teamBId === myTeamId)}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-center gap-4 sm:gap-8">
              {teamSide(teamA, "Team A", match.teamAId === myTeamId)}
              <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.22em] text-white/25">vs</span>
              {teamSide(teamB, "Team B", match.teamBId === myTeamId)}
            </div>

            {status === "upcoming" ? (
              kickoff && (
                <p className="mt-5 text-center text-lg font-bold text-[#e7c766] sm:text-xl">{kickoff}</p>
              )
            ) : (
              <p className="champ-scoreline mt-5 text-center text-5xl font-black text-white sm:text-6xl">
                {match.teamAScore}
                <span className="mx-3 align-middle text-2xl text-white/25 sm:text-3xl">:</span>
                {match.teamBScore}
              </p>
            )}
          </>
        )}

        {outcomeLabel && (
          <p
            className={cn(
              "text-center text-xs font-black uppercase tracking-[0.2em] text-white/55",
              compact ? "mt-2.5" : "mt-3",
            )}
          >
            {outcomeLabel}
          </p>
        )}

        <p
          className={cn(
            "mx-auto max-w-md text-center leading-relaxed champ-meta",
            compact ? "mt-1.5 text-xs" : "mt-5 text-sm",
          )}
        >
          {explanation}
        </p>

        <div className={cn("flex justify-center", compact ? "mt-4" : "mt-6")}>
          {status === "live" && canJoin ? (
            <Button
              onClick={onJoin}
              disabled={joining}
              className="champ-btn-gold w-full text-base sm:w-auto sm:min-w-60"
            >
              {joining ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
              {joining ? "Joining match…" : "Join match"}
            </Button>
          ) : status === "completed" ? (
            <Button onClick={onViewResult} className="champ-btn-gold champ-btn-sm w-full sm:w-auto sm:min-w-44">
              <Trophy className="mr-2 h-4 w-4" /> View result
            </Button>
          ) : (
            <Button variant="outline" className="champ-btn-ghost w-full sm:w-auto sm:min-w-52" onClick={onOpen}>
              {status === "live" ? (
                <>
                  <Eye className="mr-2 h-4 w-4" /> Watch live
                </>
              ) : (
                <>
                  <CalendarClock className="mr-2 h-4 w-4" /> View match
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function MyChampionship() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, []);

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [joiningMatchId, setJoiningMatchId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The completed match whose result dialog is open. Holding the match itself
  // means the dialog needs no lookup and no request of its own.
  const [resultMatch, setResultMatch] = useState<ChampionshipMatchSummary | null>(null);

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
  // The most recent finished fixture, surfaced as its own line only when the
  // panel above is showing something else (a live or upcoming match). Straight
  // off the existing grouping - no new derivation.
  const latestResult = myGrouped.completed[0] && myGrouped.completed[0].id !== focusMatch?.id
    ? myGrouped.completed[0]
    : null;

  const standings = detailQuery.data?.standings ?? [];
  const champion = detailQuery.data?.champion ?? null;

  const roster = teamQuery.data?.members ?? [];
  const memberCount = teamMemberIds(myTeam).length;
  // Captain's display name, read from the roster the team panel already loaded.
  const captainMember = myTeam ? roster.find(member => member.id === myTeam.captainId) : undefined;
  const captainName = captainMember ? displayName(captainMember) : null;

  // Join flow.
  //
  // Joining JOINS - it no longer starts the match. This used to send
  // start_team_battle for whichever captain arrived, so the fixture began the
  // moment a captain pressed Join (and, once the attendance guard landed, the
  // moment the SECOND captain pressed it). Play now begins only when a captain
  // presses Start Match on the game screen, which sends that same event.
  //
  // Membership, access and navigation are unchanged, as is every other mode:
  // normal Team Battle and Rapid Fire start from their own setup flow and never
  // came through here.
  const joinMatch = async (match: ChampionshipMatchSummary) => {
    setJoiningMatchId(match.id);
    try {
      const response = await apiRequest("POST", `/api/championship-matches/${match.id}/join`, {});
      const access = await response.json();
      setupGameSocket();
      window.setTimeout(() => navigateToTeamBattleGame(setLocation, access.gameSessionId), 100);
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
          onViewResult={() => setResultMatch(match)}
          size="sm"
        />
      }
    />
  );

  if (dashboardQuery.isLoading) {
    return (
      <div className={cn(PAGE_SHELL, "flex items-center justify-center")}>
        <Loader2 className="h-10 w-10 animate-spin text-[#d4af37]" />
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className={cn(PAGE_SHELL, "flex items-center justify-center p-6")}>
        <div className="champ-surface champ-fade-in w-full max-w-md p-7 text-center">
          <FaithIQTreeMark className="mx-auto h-10 w-10 text-[#d4af37]" />
          <p className="champ-eyebrow mt-3">FaithIQ Championship</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Championship unavailable</h1>
          <p className="mt-2 text-sm champ-meta">
            {dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Please try again."}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={() => dashboardQuery.refetch()} className="champ-btn-gold">
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
            <Button variant="outline" className="champ-btn-ghost" onClick={() => setLocation("/")}>
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
        <div className="champ-surface champ-fade-in w-full max-w-md p-8 text-center">
          <FaithIQTreeMark className="mx-auto h-12 w-12 text-[#d4af37]" />
          <p className="champ-eyebrow mt-3">FaithIQ Championship</p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">No championship is running</h1>
          <div className="champ-divider mx-auto my-4 max-w-[12rem]" />
          <p className="text-sm champ-meta">
            There is no active championship at the moment. When the next one starts, your team and fixtures appear here.
          </p>
          <Button className="champ-btn-gold mt-6" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL}>
      <div className="mx-auto max-w-5xl space-y-7 px-4 py-5 sm:space-y-9 sm:py-7">
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" className="champ-btn-ghost" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Home
          </Button>
          <Button
            variant="ghost"
            className="champ-meta hover:bg-white/10 hover:text-white"
            onClick={() => void refreshAll()}
            disabled={refreshing}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* 1 — Championship hero. The tournament identity and the player's own
            standing in it share one panel, divided by a gold rule. */}
        <header className="champ-hero champ-fade-in">
          {/* The app's own tree mark, used as a faint crest rather than imagery. */}
          <FaithIQTreeMark className="champ-watermark -right-10 -top-16 h-64 w-64 sm:h-80 sm:w-80" />

          <div className="relative px-5 pb-5 pt-7 sm:px-10 sm:pb-6 sm:pt-9">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2.5">
                <FaithIQTreeMark className="h-5 w-5 text-[#d4af37]" />
                <p className="champ-eyebrow">FaithIQ Championship</p>
              </div>
              <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.34em] text-white/30">
                Bible Trivia Tournament
              </p>

              <h1 className="mt-5 break-words text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
                {championship.name}
              </h1>
              {championship.description && (
                <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed champ-meta">
                  {championship.description}
                </p>
              )}

              <div className="mt-5 flex justify-center">
                <ChampionshipStatusBadge status={championshipStatusOf(championship)} />
              </div>
            </div>

            <div className="champ-divider my-6" />

            {/* 2 — Where the player stands, aligned with the tournament above. */}
            {myTeam ? (
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 sm:justify-between">
                <div className="flex min-w-0 items-center gap-3.5">
                  <TeamAvatar logoUrl={myTeam.logoUrl} emoticon={myTeam.emoticon} alt={`${myTeam.name} logo`} className="h-12 w-12 shrink-0 rounded-xl border border-[#d4af37]/25 bg-white/[0.04] p-1 text-2xl" />
                  <div className="min-w-0">
                    <p className="champ-eyebrow">Your team</p>
                    <p className="mt-1 truncate text-xl font-bold text-white">{myTeam.name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TeamRoleBadge isCaptain={isCaptain} />
                  <ParticipationBadge participating />
                </div>
              </div>
            ) : (
              /* Badge only. The panel below carries the full explanation, so the
                 same sentence is not printed twice. */
              <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <ParticipationBadge participating={false} />
                <p className="text-sm champ-meta">You are following this championship as a spectator.</p>
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
              onViewResult={() => setResultMatch(focusMatch)}
            />
          ) : (
            <EmptyState
              icon={CalendarX}
              title="No upcoming match"
              description={`${myTeam.name} has no scheduled match right now. This section will show your fixture as soon as one is scheduled.`}
            />
          )
        ) : (
          /* Informational only. Championship teams and rosters are assigned by
             an administrator, so there is nothing for a player to act on here. */
          <EmptyState
            icon={UserRound}
            tone="info"
            dashed={false}
            title="You are not participating"
            description="You are not currently assigned to a championship team. Please contact the championship administrator or your team captain to be added to a team."
          />
        )}

        {/* 4 — Latest result, when the section above is showing something else.
            Uses the already-grouped completed list; nothing new is derived. */}
        {myTeam && latestResult && (
          <button
            type="button"
            onClick={() => setResultMatch(latestResult)}
            className="champ-surface champ-fixture flex w-full items-center gap-3 p-3.5 pl-4 text-left sm:gap-4"
            data-accent={matchOutcome(latestResult, myTeam.id) ?? "completed"}
          >
            <span className="champ-eyebrow shrink-0">Latest result</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/85">
              {teams.get(latestResult.teamAId)?.name ?? "Team A"}{" "}
              <span className="tabular-nums text-white">{latestResult.teamAScore}</span>
              <span className="mx-1.5 text-white/30">–</span>
              <span className="tabular-nums text-white">{latestResult.teamBScore}</span>{" "}
              {teams.get(latestResult.teamBId)?.name ?? "Team B"}
            </span>
            {matchOutcome(latestResult, myTeam.id) && (
              <MatchOutcomeBadge outcome={matchOutcome(latestResult, myTeam.id)!} className="shrink-0" />
            )}
          </button>
        )}

        {/* 4 — Everything the player's own team plays, grouped by state. */}
        {myTeam && (
          <section>
            <SectionHeader
              icon={Gamepad2}
              title="Your championship journey"
              description="Every fixture your team is playing."
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
                    <h3 className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ff9aa6]">
                      <Radio className="h-3.5 w-3.5" /> Live now
                    </h3>
                    <div className="grid gap-3">{myGrouped.live.map(match => renderMatchCard(match, "mine"))}</div>
                  </div>
                )}
                {myGrouped.upcoming.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#e7c766]">
                      <CalendarClock className="h-3.5 w-3.5" /> Upcoming
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {myGrouped.upcoming.map(match => renderMatchCard(match, "mine"))}
                    </div>
                  </div>
                )}
                {myGrouped.completed.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
                      <Trophy className="h-3.5 w-3.5" /> Played
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

        {/* 6 — Team identity. Read-only: the roster is administered elsewhere. */}
        {myTeam && (
          <section className="champ-surface relative overflow-hidden p-4 pl-5 sm:p-5 sm:pl-6">
            {/* Gold side accent - the team's identity marker. */}
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#f0d58a] via-[#d4af37] to-transparent" />

            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                <TeamAvatar logoUrl={myTeam.logoUrl} emoticon={myTeam.emoticon} alt={`${myTeam.name} logo`} className="h-16 w-16 shrink-0 rounded-2xl border border-[#d4af37]/20 bg-white/[0.04] p-1 text-4xl" />
                <div className="min-w-0">
                  <p className="champ-eyebrow">Your team</p>
                  <h2 className="mt-1 truncate text-2xl font-black text-white sm:text-3xl">{myTeam.name}</h2>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm champ-meta">
                    {captainName && (
                      <span className="inline-flex items-center gap-1.5">
                        <Crown className="h-3.5 w-3.5 text-[#d4af37]" />
                        {captainName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {memberCount} {memberCount === 1 ? "member" : "members"}
                    </span>
                  </p>
                </div>
              </div>
              {/* Captain and member get the same action: this page never
                  manages a roster, whichever role the player holds. */}
              <Button
                variant="outline"
                className="champ-btn-ghost"
                onClick={() => setLocation(`/championship-teams/${myTeam.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" /> View team
              </Button>
            </div>

            {roster.length > 0 && (
              <>
                <div className="champ-divider my-3.5 opacity-50" />
                <ul className="flex flex-wrap gap-2">
                  {roster.map(member => (
                    <li
                      key={member.id}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                        member.id === user?.id
                          ? "border-[#d4af37]/35 bg-[#d4af37]/10 text-[#f0d58a]"
                          : "border-white/10 bg-white/[0.04] text-white/75",
                      )}
                    >
                      <span className="max-w-[12rem] truncate">{displayName(member)}</span>
                      {member.id === myTeam.captainId && (
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40">Captain</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="mt-3.5 text-xs text-white/35">
              Your team and its roster are managed by the championship administrator.
            </p>
          </section>
        )}

        {/* 7 — Standings: the tournament table. */}
        {standings.length > 0 && (
          <section>
            <SectionHeader
              icon={ListOrdered}
              title="Championship standings"
              description="Two points for a win. Your team is highlighted."
            />
            {champion && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#d4af37]/35 bg-gradient-to-r from-[#d4af37]/15 to-transparent p-4">
                <Trophy className="h-6 w-6 shrink-0 text-[#e7c766]" />
                <p className="font-bold text-white">
                  Champion: <span className="text-[#f0d58a]">{champion.name}</span>
                </p>
              </div>
            )}
            <div className="champ-surface overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                    <th className="w-14 py-3.5 pl-4 text-left font-bold">Rank</th>
                    <th className="py-3.5 text-left font-bold">Team</th>
                    <th className="w-12 py-3.5 text-center font-bold" title="Played">P</th>
                    <th className="w-12 py-3.5 text-center font-bold" title="Wins">W</th>
                    <th className="w-12 py-3.5 text-center font-bold" title="Draws">D</th>
                    <th className="w-12 py-3.5 text-center font-bold" title="Losses">L</th>
                    <th className="w-16 py-3.5 pr-4 text-right font-bold" title="Points">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, index) => {
                    const isMine = !!myTeam && row.id === myTeam.id;
                    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-t border-white/[0.06] transition-colors",
                          isMine ? "champ-you-row" : index % 2 === 1 ? "bg-white/[0.015]" : undefined,
                        )}
                      >
                        <td className="py-3.5 pl-4 text-base tabular-nums">
                          {medal ? (
                            <span aria-label={`Rank ${index + 1}`}>{medal}</span>
                          ) : (
                            <span className="text-sm font-bold text-white/45">{index + 1}</span>
                          )}
                        </td>
                        <td className="py-3.5 pr-3">
                          <span className="flex items-center gap-2">
                            <TeamAvatar logoUrl={row.logoUrl} emoticon={row.emoticon} alt={`${row.name} logo`} className="h-5 w-5" />
                            <span className={cn("truncate font-semibold", isMine ? "text-[#f0d58a]" : "text-white/90")}>
                              {row.name}
                            </span>
                            {isMine && (
                              <span className="rounded-full border border-[#d4af37]/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#d4af37]">
                                You
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3.5 text-center tabular-nums champ-meta">{row.played}</td>
                        <td className="py-3.5 text-center tabular-nums champ-meta">{row.wins}</td>
                        <td className="py-3.5 text-center tabular-nums champ-meta">{row.draws}</td>
                        <td className="py-3.5 text-center tabular-nums champ-meta">{row.losses}</td>
                        <td
                          className={cn(
                            "py-3.5 pr-4 text-right text-base font-black tabular-nums",
                            isMine ? "text-[#f0d58a]" : "text-white",
                          )}
                        >
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 8 — Championship activity the player is not part of: deliberately
            the quietest section on the page. */}
        {(otherMatches.length > 0 || !myTeam) && (
          <section>
            <SectionHeader
              icon={Eye}
              title={myTeam ? "Other matches" : "Championship matches"}
              description={
                myTeam
                  ? "Matches between other teams — you can watch, but not play in these."
                  : "Matches between championship teams. You can watch these, but you cannot join a match unless an administrator has assigned you to one of the teams playing."
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

        {/* Standings and other teams' fixtures come from the public championship
            payload. If that read fails the player's own state above is still
            complete, so the page degrades to a note rather than an error screen. */}
        {detailQuery.isError && (
          <p className="text-center text-xs text-white/40">
            Standings and other championship matches are unavailable right now.
          </p>
        )}
      </div>

      {/* Result of a finished fixture, shown in place. Everything it renders is
          already-loaded page data, so opening it issues no request. */}
      <MatchResultModal
        match={resultMatch}
        teamA={resultMatch ? teams.get(resultMatch.teamAId) : undefined}
        teamB={resultMatch ? teams.get(resultMatch.teamBId) : undefined}
        myTeamId={myTeam?.id ?? null}
        onClose={() => setResultMatch(null)}
      />
    </div>
  );
}
