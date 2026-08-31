import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { onEvent, sendGameEvent, setupGameSocket } from "@/lib/socket";
import Hls from "hls.js";
import { WatchHeader } from "@/components/watch/WatchHeader";
import { WatchStage } from "@/components/watch/WatchStage";
import { WatchScoreboard } from "@/components/watch/WatchScoreboard";
import { WatchCommentary, type CommentaryEntry } from "@/components/watch/WatchCommentary";
import {
  WatchQuestionPanel,
  type WatchQuestion,
  type WatchQuestionResult,
} from "@/components/watch/WatchQuestionPanel";
import { WatchTossPanel, type WatchToss, type WatchTossResult } from "@/components/watch/WatchTossPanel";
import { WatchSupport } from "@/components/watch/WatchSupport";
import { appendBurst, buildBurst, burstTtlMs, dropParticles, type ReactionParticle } from "@/lib/watch-reactions";
import { WatchTicker } from "@/components/watch/WatchTicker";
import { WatchSoundControl } from "@/components/watch/WatchSoundControl";
import {
  applyWatchSound,
  emptyWatchSoundState,
  isAutoplayBlocked,
  shouldShowWatchSoundControl,
  streamHasAudioTrack,
  watchSoundKind,
  type WatchSoundState,
} from "@/lib/watch-sound";

type MatchPayload = { match: any; teamA: any; teamB: any };



export default function WatchMatch({ overlay = false }: { overlay?: boolean }) {
  const { matchId } = useParams<{ matchId: string }>();
  const { data, refetch, isLoading, isError } = useQuery<MatchPayload>({
    queryKey: ["/api/championship-matches", matchId],
    queryFn: () => fetch(`/api/championship-matches/${matchId}`).then(r => {
      if (!r.ok) throw new Error("Match not found"); return r.json();
    }),
    refetchInterval: 15000,
  });
  // Reaction particles. ONE system: every particle comes from the existing
  // server broadcast, so the viewer who clicked and everyone else see the same
  // burst and a click can never render twice.
  const [reactions, setReactions] = useState<ReactionParticle[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [currentQuestion, setCurrentQuestion] = useState<number | null>(null);
  // Commentary is a log of the championship events this page ALREADY receives -
  // nothing is inferred and nothing is fetched for it. Newest first, capped so a
  // broadcast left open all evening cannot grow without bound.
  const [commentary, setCommentary] = useState<CommentaryEntry[]>([]);
  // Last scores seen, so a score change can be reported as "who gained what"
  // instead of a bare pair of numbers. Display only.
  const lastScoreRef = useRef<{ a: number; b: number } | null>(null);
  const teamNamesRef = useRef<{ a: string; b: string }>({ a: "Team A", b: "Team B" });
  // The question on screen and its result, from the two sanitised championship
  // broadcasts. Keyed by questionId so a late result cannot land on a newer
  // question.
  const [liveQuestionDetail, setLiveQuestionDetail] = useState<WatchQuestion | null>(null);
  const [questionResult, setQuestionResult] = useState<WatchQuestionResult | null>(null);
  // Has play actually begun? A fixture is "live" from the moment an admin opens
  // it, which is before any captain starts the game, so status alone must never
  // drive the stage. Set by the first gameplay broadcast and restored on
  // reconnect from match_state_restored.
  const [gameplayStarted, setGameplayStarted] = useState(false);
  // Which side's captain has arrived. Two booleans from the server; the Watch
  // page never infers readiness itself.
  const [captains, setCaptains] = useState<{ teamACaptainReady: boolean; teamBCaptainReady: boolean } | null>(null);
  // Toss phase, from the same sanitised broadcast pair as the main question.
  const [toss, setToss] = useState<WatchToss | null>(null);
  const [tossResult, setTossResult] = useState<WatchTossResult | null>(null);
  const currentQuestionIdRef = useRef<string | null>(null);
  currentQuestionIdRef.current = liveQuestionDetail?.questionId ?? null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamError, setStreamError] = useState("");
  const [sound, setSound] = useState<WatchSoundState>(emptyWatchSoundState);
  // Set when the server's existing reaction throttle kicks in; disables the
  // controls briefly instead of silently dropping taps.
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const reactionTimersRef = useRef<number[]>([]);

  // Overlay mode must not paint a page background. `body` is styled bg-black in
  // index.css, which propagates to the page canvas and would appear in OBS /
  // Ecamm as a solid rectangle covering the whole video feed. The class is
  // scoped to <body> for the lifetime of the overlay only, so /watch and every
  // other page keep their existing background.
  //
  // Declared here with the other hooks - never inside a branch - so the hook
  // order stays constant across renders.
  useEffect(() => {
    if (!overlay) return;
    document.body.classList.add("overlay-transparent");
    return () => document.body.classList.remove("overlay-transparent");
  }, [overlay]);

  useEffect(() => {
    setSound(emptyWatchSoundState());
  }, [data?.match?.streamUrl, data?.match?.status]);

  const noteAutoplayBlocked = (error: unknown) => {
    if (isAutoplayBlocked(error)) {
      setSound(current => ({ ...current, playbackBlocked: true, soundOn: false }));
    }
  };

  const refreshAudioAvailability = (video: HTMLVideoElement) => {
    const available = streamHasAudioTrack(video);
    if (available === null) return;
    setSound(current => ({ ...current, audioAvailable: available }));
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !data?.match?.streamUrl || data.match.status !== "live") return;
    const url = data.match.streamUrl;
    setStreamError("");
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(noteAutoplayBlocked);
      return () => { video.removeAttribute("src"); video.load(); };
    }
    if (Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 2, maxBufferLength: 10 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(noteAutoplayBlocked));
      hls.on(Hls.Events.ERROR, (_event, details) => {
        if (details.fatal) {
          if (details.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (details.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setStreamError("The live stream is temporarily unavailable.");
        }
      });
      return () => hls.destroy();
    }
    setStreamError("HLS playback is not supported by this browser.");
  }, [data?.match?.streamUrl, data?.match?.status]);

  // Keep the refs the event handlers read in step with the loaded match.
  useEffect(() => {
    if (!data?.match) return;
    if (!lastScoreRef.current) lastScoreRef.current = { a: data.match.teamAScore, b: data.match.teamBScore };
    teamNamesRef.current = { a: data.teamA?.name ?? "Team A", b: data.teamB?.name ?? "Team B" };
  }, [data?.match, data?.teamA?.name, data?.teamB?.name]);

  // Appends one line to the commentary log. Display only: it reads the event
  // payloads the handlers below already receive and touches no game state.
  const logCommentary = (entry: Omit<CommentaryEntry, "id" | "at">) => {
    if (overlay) return; // the OBS overlay renders no commentary
    setCommentary(current => [{ ...entry, id: Date.now() + Math.random(), at: Date.now() }, ...current].slice(0, 12));
  };

  useEffect(() => {
    setupGameSocket();
    sendGameEvent({ type: "watch_match", matchId });
    // Re-subscribe after a dropped connection.
    //
    // The client socket auto-reconnects, but a reconnect creates a brand new
    // server-side client with no match subscription, and nothing re-sent
    // watch_match. Championship events are addressed per match, so a spectator
    // who blipped silently stopped receiving them for good and degraded to the
    // 15s poll - losing question updates entirely, since those are not part of
    // the HTTP payload. The server emits connection_established on every new
    // connection, so that is the resubscribe signal; refetch closes the gap in
    // score/status that opened while disconnected.
    const offConnected = onEvent("connection_established", () => {
      sendGameEvent({ type: "watch_match", matchId });
      refetch();
    });
    const offUpdate = onEvent("match_updated", (e) => {
      if (e.match?.id !== matchId) return;
      // Which side gained, and by how much, read from two consecutive server
      // payloads. Nothing is scored here - this is the difference between
      // numbers the server already sent.
      const previous = lastScoreRef.current;
      const deltaA = e.match.teamAScore - (previous?.a ?? e.match.teamAScore);
      const deltaB = e.match.teamBScore - (previous?.b ?? e.match.teamBScore);
      lastScoreRef.current = { a: e.match.teamAScore, b: e.match.teamBScore };

      const gained =
        deltaA > 0
          ? { name: teamNamesRef.current.a, points: deltaA }
          : deltaB > 0
            ? { name: teamNamesRef.current.b, points: deltaB }
            : null;

      logCommentary({
        tone: "score",
        label: gained ? `${gained.name} +${gained.points}` : "Score update",
        detail: `${e.match.teamAScore} – ${e.match.teamBScore}`,
      });
      refetch();
    });
    const offStart = onEvent("match_started", (e) => {
      if (e.match?.id !== matchId) return;
      logCommentary({ tone: "live", label: "Match started" });
      refetch();
    });
    // A finished match has no current question. question_ended is only emitted
    // by the manual admin control, so without this the watch page kept showing
    // "Question N" after the match was over.
    const offEnd = onEvent("match_ended", (e) => {
      if (e.match?.id !== matchId) return;
      logCommentary({
        tone: "final",
        label: "Match complete",
        detail: `Final score ${e.match.teamAScore} – ${e.match.teamBScore}`,
      });
      setCurrentQuestion(null);
      setGameplayStarted(false);
      refetch();
    });
    const offQuestionStarted = onEvent("question_started", (e) => {
      if (e.matchId !== matchId) return;
      setGameplayStarted(true);
      if (e.questionNumber) {
        logCommentary({
          tone: "question",
          label: `Question ${e.questionNumber}`,
          detail: e.answeringTeamName ? `${e.answeringTeamName} is answering` : "In play",
        });
      }
      setCurrentQuestion(e.questionNumber ?? null);
      // The first fixture question ends the toss display for good.
      setToss(null);
      setTossResult(null);
      // A new question always clears the previous result, so a late result for
      // the question just finished can never paint over the new one.
      setQuestionResult(null);
      setLiveQuestionDetail(
        e.questionId
          ? {
              questionId: e.questionId,
              questionNumber: e.questionNumber,
              totalQuestions: e.totalQuestions,
              questionText: e.questionText,
              options: Array.isArray(e.options) ? e.options : [],
              answeringTeamId: e.answeringTeamId,
              answeringTeamName: e.answeringTeamName,
            }
          : null,
      );
    });
    const offCaptains = onEvent("captains_ready", (e) => {
      if (e.matchId !== matchId) return;
      setCaptains({ teamACaptainReady: !!e.teamACaptainReady, teamBCaptainReady: !!e.teamBCaptainReady });
      logCommentary({
        tone: "question",
        label: e.bothCaptainsReady ? "Both captains ready" : "Captain joined",
        detail: e.bothCaptainsReady ? "Waiting for the match to start" : "Waiting for the other captain",
      });
    });
    const offTossStarted = onEvent("toss_started", (e) => {
      if (e.matchId !== matchId) return;
      setTossResult(null);
      setGameplayStarted(true);
      setToss({
        questionId: e.questionId,
        questionText: e.questionText,
        options: Array.isArray(e.options) ? e.options : [],
      });
      logCommentary({ tone: "question", label: "Toss question", detail: "First correct answer wins the toss" });
    });
    // Sent only after finalizeTossWinner has committed the winner.
    const offTossResolved = onEvent("toss_resolved", (e) => {
      if (e.matchId !== matchId) return;
      setTossResult({
        questionId: e.questionId,
        winnerTeamId: e.winnerTeamId,
        winnerTeamName: e.winnerTeamName,
        firstTurnTeamName: e.firstTurnTeamName,
        correctAnswerId: e.correctAnswerId ?? null,
      });
      logCommentary({
        tone: "final",
        label: `${e.winnerTeamName ?? "Team"} won the toss`,
        detail: e.firstTurnTeamName ? `${e.firstTurnTeamName} answers first` : undefined,
      });
    });

    // Resolution of the question above. The server only sends this once the
    // answer has been evaluated and the score committed, so correctness cannot
    // reach a spectator early.
    const offQuestionAnswered = onEvent("question_answered", (e) => {
      if (e.matchId !== matchId) return;
      // Stale-guard: ignore a result for anything but the question on screen.
      if (currentQuestionIdRef.current && e.questionId !== currentQuestionIdRef.current) return;
      setQuestionResult({
        questionId: e.questionId,
        selectedAnswerId: e.selectedAnswerId ?? null,
        correctAnswerId: e.correctAnswerId ?? null,
        isCorrect: !!e.isCorrect,
        pointsAwarded: e.pointsAwarded ?? 0,
      });
      logCommentary({
        tone: e.isCorrect ? "final" : "question",
        label: `${e.answeringTeamName ?? "Team"} ${e.isCorrect ? "answered correctly" : "answered incorrectly"}`,
        detail: `+${e.pointsAwarded ?? 0} points`,
      });
    });
    const offQuestionEnded = onEvent("question_ended", (e) => e.matchId === matchId && setCurrentQuestion(null));
    const offRestore = onEvent("match_state_restored", (e) => {
      if (e.matchId !== matchId) return;
      setCounts(e.reactionCounts ?? {});
      setCurrentQuestion(e.currentQuestion?.questionNumber ?? null);
      // Rebuild the question panel after a refresh or a dropped connection. The
      // server replays the same public question it already broadcast - never a
      // result - so a reconnecting spectator sees the question in play without
      // learning anything the live audience did not already have.
      setQuestionResult(null);
      // The cache holds whichever is in play; a resolved toss is dropped server
      // side, so an entry marked isToss means the toss is still running.
      setGameplayStarted(!!e.gameplayStarted);
      setCaptains(e.captains ?? null);
      const restored = e.currentQuestion;
      setToss(
        restored?.isToss && Array.isArray(restored.options)
          ? { questionId: restored.questionId, questionText: restored.questionText, options: restored.options }
          : null,
      );
      setTossResult(null);
      setLiveQuestionDetail(
        !restored?.isToss && e.currentQuestion?.questionId && Array.isArray(e.currentQuestion.options)
          ? {
              questionId: e.currentQuestion.questionId,
              questionNumber: e.currentQuestion.questionNumber,
              totalQuestions: e.currentQuestion.totalQuestions,
              questionText: e.currentQuestion.questionText,
              options: e.currentQuestion.options,
              answeringTeamId: e.currentQuestion.answeringTeamId,
              answeringTeamName: e.currentQuestion.answeringTeamName,
            }
          : null,
      );
    });
    const offThrottled = onEvent("reaction_throttled", () => {
      setReactionCooldown(true);
      window.setTimeout(() => setReactionCooldown(false), 1500);
    });
    const offReaction = onEvent("team_reaction", (e) => {
      if (e.matchId !== matchId) return;
      // The overlay renders no reactions. Without this guard it still queued a
      // state update and a 2.4s timer for every incoming tap, re-rendering a
      // component whose output does not contain them - wasteful for a browser
      // source that stays open for the length of a broadcast. Behaviour of the
      // spectator page is unchanged (overlay is false there).
      if (overlay) return;
      setCounts(c => ({ ...c, [e.teamId]: e.count }));

      // One burst per broadcast reaction, composed by buildBurst. Bounded by
      // burst count and particle count so a fast-reacting crowd cannot grow the
      // DOM without limit. Each burst clears itself when its animation is done.
      const particles = buildBurst(e.emoticon, e.teamId);
      setReactions(current => appendBurst(current, particles));
      const timer = window.setTimeout(() => {
        setReactions(current => dropParticles(current, particles.map(particle => particle.id)));
        reactionTimersRef.current = reactionTimersRef.current.filter(id => id !== timer);
      }, burstTtlMs(particles));
      reactionTimersRef.current.push(timer);
    });
    return () => {
      offConnected(); offUpdate(); offStart(); offEnd(); offCaptains(); offTossStarted(); offTossResolved(); offQuestionStarted(); offQuestionAnswered(); offQuestionEnded(); offRestore(); offReaction(); offThrottled();
      for (const timer of reactionTimersRef.current) window.clearTimeout(timer);
      reactionTimersRef.current = [];
    };
  }, [matchId, refetch, data?.teamA?.id, overlay]);

  const toggleWatchSound = () => {
    const video = videoRef.current;
    const kind = watchSoundKind(sound);
    if (!video || kind === "none") return;
    const nextOn = kind !== "on";
    setSound(current => ({
      ...current,
      soundOn: nextOn,
      everEnabled: current.everEnabled || nextOn,
      playbackBlocked: nextOn ? false : current.playbackBlocked,
    }));
    void applyWatchSound(video, nextOn).catch(noteAutoplayBlocked);
  };

  // The existing reaction event. `reactionId` is optional and resolved against
  // the server's whitelist; omitting it keeps the original crest behaviour.
  const support = (team: any, reactionId?: string) =>
    sendGameEvent({ type: "team_reaction", matchId, teamId: team.id, emoticon: team.emoticon, reactionId });
  const status = data?.match?.status ?? "upcoming";
  // Only a live match has a current question, so a stale number can never leak
  // past the end of a match even if a question_ended event is missed.
  const liveQuestion = status === "live" ? currentQuestion : null;
  // A browser source must never flash an application screen over the broadcast,
  // so in overlay mode the not-ready states render nothing at all - the
  // broadcaster sees clean video until there is something real to composite.
  // The spectator page keeps its existing messages unchanged.
  const overlayBlank = <main className="min-h-screen bg-transparent" />;
  if (isLoading) return overlay ? overlayBlank : <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Loading match…</div>;
  // An unknown or deleted match previously fell through to the same "Loading
  // match…" screen forever, because only `!data` was checked and the shared
  // query client is configured with retry: false.
  if (isError || !data) return overlay ? overlayBlank : <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Match not found</div>;

  // Team lookups are optional-chained here on purpose. The app has no React
  // error boundary, so a throw during render unmounts the tree and leaves the
  // browser source permanently blank mid-broadcast with no way for the operator
  // to recover. Phase 3 blocks deleting a team that is used by a match, so this
  // should not happen - but degrading to a missing name is survivable where a
  // crash is not.
  if (overlay) return (
    <main className="min-h-screen bg-transparent text-white p-8 flex items-end">
      <div className="w-full rounded-2xl bg-slate-950/85 border border-white/20 p-5 flex items-center justify-between text-3xl font-black">
        <span>{data.teamA?.name} <b className="text-cyan-300">{data.match.teamAScore}</b></span>
          <span className="text-sm uppercase tracking-[.3em] text-red-400">{liveQuestion ? `Question ${liveQuestion}` : status}</span>
        <span><b className="text-fuchsia-300">{data.match.teamBScore}</b> {data.teamB?.name}</span>
      </div>
    </main>
  );

  // Everything below is read from the match payload this page already loads.
  // The winner is taken from match.winnerTeamId as recorded by the server - it
  // is never recomputed here.
  const winnerName =
    data.match.winnerTeamId === data.teamA?.id
      ? data.teamA?.name
      : data.match.winnerTeamId === data.teamB?.id
        ? data.teamB?.name
        : null;
  const isDraw = status === "completed" && !data.match.winnerTeamId;
  const scheduledLabel = data.match.scheduledAt
    ? new Date(data.match.scheduledAt).toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : null;

  // Ticker lines, built only from facts already on screen.
  const tickerItems = [
    `${data.teamA?.name ?? "Team A"} vs ${data.teamB?.name ?? "Team B"}`,
    status === "completed"
      ? `Final score ${data.match.teamAScore} – ${data.match.teamBScore}`
      : status === "live"
        ? gameplayStarted
          ? `Live score ${data.match.teamAScore} – ${data.match.teamBScore}`
          : "Waiting for the captains to start the match"
        : scheduledLabel
          ? `Scheduled for ${scheduledLabel}`
          : "Kick-off time to be announced",
    ...(liveQuestion ? [`Question ${liveQuestion} in play`] : []),
    ...(status === "completed" && winnerName ? [`Winner · ${winnerName}`] : []),
    ...(isDraw ? ["Result · Draw"] : []),
  ];

  // The stream element is unchanged - same condition, same ref, same handlers -
  // so the HLS effect above keeps driving it exactly as before.
  const hasStreamVideo = status === "live" && !!data.match.streamUrl;
  const media = hasStreamVideo ? (
      <video
        ref={videoRef}
        autoPlay
        muted={!sound.soundOn}
        playsInline
        controls={false}
        onLoadedMetadata={event => refreshAudioAvailability(event.currentTarget)}
        onPause={e => e.currentTarget.play().catch(() => undefined)}
        className="h-full w-full bg-black object-contain"
      />
    ) : undefined;

  return (
    <main className="champ-portal flex min-h-screen flex-col font-heading">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:py-7">
        <WatchHeader
          status={status}
          gameplayStarted={gameplayStarted}
          teamAName={data.teamA?.name}
          teamBName={data.teamB?.name}
        />

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5">
            <WatchStage
              status={status}
              gameplayStarted={gameplayStarted}
              captains={captains}
              teamAName={data.teamA?.name}
              teamBName={data.teamB?.name}
              teamAEmoticon={data.teamA?.emoticon}
              teamBEmoticon={data.teamB?.emoticon}
              teamALogoUrl={data.teamA?.logoUrl}
              teamBLogoUrl={data.teamB?.logoUrl}
              teamAScore={data.match.teamAScore}
              teamBScore={data.match.teamBScore}
              winnerName={winnerName}
              isDraw={isDraw}
              liveQuestion={liveQuestion}
              scheduledLabel={scheduledLabel}
              media={media}
              questionPanel={
                status === "live" && toss ? (
                  <WatchTossPanel
                    toss={toss}
                    result={tossResult}
                    winnerEmoticon={
                      tossResult?.winnerTeamId === data.teamA?.id
                        ? data.teamA?.emoticon
                        : tossResult?.winnerTeamId === data.teamB?.id
                          ? data.teamB?.emoticon
                          : undefined
                    }
                    winnerLogoUrl={
                      tossResult?.winnerTeamId === data.teamA?.id
                        ? data.teamA?.logoUrl
                        : tossResult?.winnerTeamId === data.teamB?.id
                          ? data.teamB?.logoUrl
                          : undefined
                    }
                  />
                ) : status === "live" && liveQuestionDetail ? (
                  <WatchQuestionPanel
                    question={liveQuestionDetail}
                    result={questionResult}
                    teamEmoticon={
                      liveQuestionDetail.answeringTeamId === data.teamA?.id
                        ? data.teamA?.emoticon
                        : liveQuestionDetail.answeringTeamId === data.teamB?.id
                          ? data.teamB?.emoticon
                          : undefined
                    }
                    teamLogoUrl={
                      liveQuestionDetail.answeringTeamId === data.teamA?.id
                        ? data.teamA?.logoUrl
                        : liveQuestionDetail.answeringTeamId === data.teamB?.id
                          ? data.teamB?.logoUrl
                          : undefined
                    }
                  />
                ) : undefined
              }
              overlays={
                <>
                  {shouldShowWatchSoundControl(hasStreamVideo) && (
                    <WatchSoundControl kind={watchSoundKind(sound)} onToggle={toggleWatchSound} />
                  )}
                  {streamError && (
                    <div className="absolute inset-x-4 bottom-4 rounded-xl border border-red-400/30 bg-red-950/90 p-3 text-center text-sm text-red-100">
                      {streamError}
                    </div>
                  )}
                </>
              }
            />

            <WatchScoreboard
              status={status}
              teamA={data.teamA}
              teamB={data.teamB}
              teamAScore={data.match.teamAScore}
              teamBScore={data.match.teamBScore}
              supporters={counts}
              winnerTeamId={data.match.winnerTeamId}
              liveQuestion={liveQuestion}
              answeringTeamId={questionResult ? undefined : liveQuestionDetail?.answeringTeamId}
              particles={reactions}
            />

            {/* Audience support. Live only - the server accepts reactions for a
                live match only, so the controls follow the same rule. */}
            {status === "live" && (
              <WatchSupport
                teamA={data.teamA}
                teamB={data.teamB}
                supporters={counts}
                cooldown={reactionCooldown}
                onSupport={support}
              />
            )}
          </div>

          <aside className="lg:sticky lg:top-5 lg:self-start">
            <WatchCommentary entries={commentary} />
          </aside>
        </div>
      </div>

      <WatchTicker items={tickerItems} />
    </main>
  );
}
