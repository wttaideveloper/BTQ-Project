import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { onEvent, sendGameEvent, setupGameSocket } from "@/lib/socket";
import Hls from "hls.js";

type MatchPayload = { match: any; teamA: any; teamB: any };

export default function WatchMatch({ overlay = false }: { overlay?: boolean }) {
  const { matchId } = useParams<{ matchId: string }>();
  const { data, refetch } = useQuery<MatchPayload>({
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
    const offUpdate = onEvent("match_updated", (e) => e.match?.id === matchId && refetch());
    const offStart = onEvent("match_started", (e) => e.match?.id === matchId && refetch());
    const offEnd = onEvent("match_ended", (e) => e.match?.id === matchId && refetch());
    const offQuestionStarted = onEvent("question_started", (e) => e.matchId === matchId && setCurrentQuestion(e.questionNumber ?? null));
    const offQuestionEnded = onEvent("question_ended", (e) => e.matchId === matchId && setCurrentQuestion(null));
    const offRestore = onEvent("match_state_restored", (e) => {
      if (e.matchId !== matchId) return;
      setCounts(e.reactionCounts ?? {});
      setCurrentQuestion(e.currentQuestion?.questionNumber ?? null);
    });
    const offReaction = onEvent("team_reaction", (e) => {
      if (e.matchId !== matchId) return;
      setCounts(c => ({ ...c, [e.teamId]: e.count }));
      const id = Date.now() + Math.random();
      setReactions(r => [...r.slice(-35), { id, emoji: e.emoticon, side: e.teamId === data?.teamA?.id ? "left" : "right" }]);
      window.setTimeout(() => setReactions(r => r.filter(x => x.id !== id)), 2400);
    });
    return () => { offUpdate(); offStart(); offEnd(); offQuestionStarted(); offQuestionEnded(); offRestore(); offReaction(); };
  }, [matchId, refetch, data?.teamA?.id]);

  const support = (team: any) => sendGameEvent({ type: "team_reaction", matchId, teamId: team.id, emoticon: team.emoticon });
  const status = data?.match?.status ?? "upcoming";
  if (!data) return <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Loading match…</div>;

  if (overlay) return (
    <main className="min-h-screen bg-transparent text-white p-8 flex items-end">
      <div className="w-full rounded-2xl bg-slate-950/85 border border-white/20 p-5 flex items-center justify-between text-3xl font-black">
        <span>{data.teamA.name} <b className="text-cyan-300">{data.match.teamAScore}</b></span>
          <span className="text-sm uppercase tracking-[.3em] text-red-400">{currentQuestion ? `Question ${currentQuestion}` : status}</span>
        <span><b className="text-fuchsia-300">{data.match.teamBScore}</b> {data.teamB.name}</span>
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
            <div><p className="text-xl font-semibold">{status === "upcoming" ? "Stream begins soon" : "Match completed"}</p>
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
          <div className="text-center"><div className="text-6xl font-black">{data.match.teamAScore} <span className="text-slate-600">:</span> {data.match.teamBScore}</div><p className="text-xs uppercase tracking-widest text-slate-500 mt-2">{currentQuestion ? `Question ${currentQuestion}` : "Live score"}</p></div>
        </section>
      </div>
    </main>
  );
}
