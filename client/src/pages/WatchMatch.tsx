import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { onEvent, sendGameEvent, setupGameSocket } from "@/lib/socket";
import Hls from "hls.js";

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
  const [reactions, setReactions] = useState<Array<{ id: number; emoji: string; side: string }>>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [currentQuestion, setCurrentQuestion] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamError, setStreamError] = useState("");

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
    const video = videoRef.current;
    if (!video || !data?.match?.streamUrl || data.match.status !== "live") return;
    const url = data.match.streamUrl;
    setStreamError("");
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => undefined);
      return () => { video.removeAttribute("src"); video.load(); };
    }
    if (Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 2, maxBufferLength: 10 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => undefined));
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
    const offUpdate = onEvent("match_updated", (e) => e.match?.id === matchId && refetch());
    const offStart = onEvent("match_started", (e) => e.match?.id === matchId && refetch());
    // A finished match has no current question. question_ended is only emitted
    // by the manual admin control, so without this the watch page kept showing
    // "Question N" after the match was over.
    const offEnd = onEvent("match_ended", (e) => {
      if (e.match?.id !== matchId) return;
      setCurrentQuestion(null);
      refetch();
    });
    const offQuestionStarted = onEvent("question_started", (e) => e.matchId === matchId && setCurrentQuestion(e.questionNumber ?? null));
    const offQuestionEnded = onEvent("question_ended", (e) => e.matchId === matchId && setCurrentQuestion(null));
    const offRestore = onEvent("match_state_restored", (e) => {
      if (e.matchId !== matchId) return;
      setCounts(e.reactionCounts ?? {});
      setCurrentQuestion(e.currentQuestion?.questionNumber ?? null);
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
      const id = Date.now() + Math.random();
      setReactions(r => [...r.slice(-35), { id, emoji: e.emoticon, side: e.teamId === data?.teamA?.id ? "left" : "right" }]);
      window.setTimeout(() => setReactions(r => r.filter(x => x.id !== id)), 2400);
    });
    return () => { offConnected(); offUpdate(); offStart(); offEnd(); offQuestionStarted(); offQuestionEnded(); offRestore(); offReaction(); };
  }, [matchId, refetch, data?.teamA?.id, overlay]);

  const support = (team: any) => sendGameEvent({ type: "team_reaction", matchId, teamId: team.id, emoticon: team.emoticon });
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

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-6 flex justify-between items-center">
          <div><p className="text-cyan-400 uppercase tracking-widest text-xs font-bold">FaithIQ Live</p><h1 className="text-3xl font-black">{data.teamA.name} vs {data.teamB.name}</h1></div>
          <span className={`px-4 py-2 rounded-full font-bold uppercase text-xs ${status === "live" ? "bg-red-500 animate-pulse" : "bg-white/10"}`}>{status}</span>
        </header>
        <section className="relative aspect-video rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl">
          {status === "live" && data.match.streamUrl ? (
            <video ref={videoRef} autoPlay muted playsInline controls={false}
              onPause={e => e.currentTarget.play().catch(() => undefined)} className="w-full h-full object-contain" />
          ) : <div className="h-full grid place-items-center text-center text-slate-400">
            {/*
              This placeholder shows whenever there is no video to play, which
              includes a LIVE match that simply has no stream URL configured
              (stream_url is optional). It used to special-case only "upcoming"
              and let everything else fall through to "Match completed", so a
              live, in-progress match displayed the words "Match completed"
              while people were still answering questions. The match status was
              never wrong - only this label was. Driven off status explicitly
              now, so each of the three states says what it means.
            */}
            <div><p className="text-xl font-semibold">{status === "upcoming" ? "Stream begins soon" : status === "live" ? "Match in progress" : "Match completed"}</p>
            {status === "live" && <p className="text-sm mt-1">No video stream for this match — live scores below.</p>}
            {data.match.scheduledAt && <p>{new Date(data.match.scheduledAt).toLocaleString()}</p>}</div>
          </div>}
          {reactions.map(r => <span key={r.id} className={`absolute bottom-8 text-4xl animate-bounce ${r.side === "left" ? "left-[15%]" : "right-[15%]"}`}>{r.emoji}</span>)}
          {streamError && <div className="absolute inset-x-4 bottom-4 rounded-xl bg-red-950/90 border border-red-400/30 p-3 text-center text-sm text-red-100">{streamError}</div>}
        </section>
        <section className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4 bg-white/5 rounded-3xl p-6 border border-white/10">
          {[data.teamA, data.teamB].map((team, i) => <div key={team.id} className={i ? "text-right" : ""}>
            <h2 className="text-xl font-bold">{team.name}</h2><p className="text-sm text-slate-400">{counts[team.id] ?? 0} supporters</p>
            {status === "live" && <button onClick={() => support(team)} className="mt-3 text-4xl bg-white/10 hover:bg-white/20 active:scale-90 transition rounded-2xl p-3">{team.emoticon}</button>}
          </div>)}
          <div className="text-center"><div className="text-6xl font-black">{data.match.teamAScore} <span className="text-slate-600">:</span> {data.match.teamBScore}</div><p className="text-xs uppercase tracking-widest text-slate-500 mt-2">{liveQuestion ? `Question ${liveQuestion}` : "Live score"}</p></div>
        </section>
      </div>
    </main>
  );
}
