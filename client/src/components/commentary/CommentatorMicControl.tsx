import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { onEvent, sendGameEvent } from "@/lib/socket";
import {
  commentaryIceServers,
  createPublisherPeer,
  microphoneErrorMessage,
  sendCommentarySignal,
  setAudioTracksEnabled,
  startMicrophone,
  stopMediaStream,
  type CommentaryIceServer,
} from "@/lib/commentary-rtc";

type MicState = "off" | "connecting" | "live" | "error";

export function CommentatorMicControl({ matchId, matchLive }: { matchId: string; matchLive: boolean }) {
  const [state, setState] = useState<MicState>("off");
  const [micMuted, setMicMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const iceServersRef = useRef<RTCIceServer[]>(commentaryIceServers());
  const wantLiveRef = useRef(false);

  const closePeers = () => {
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
  };

  const stop = (notifyServer: boolean) => {
    wantLiveRef.current = false;
    closePeers();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setMicMuted(false);
    setState("off");
    if (notifyServer) sendGameEvent({ type: "commentary_unpublish", matchId });
  };

  const attachPeer = async (peerId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    peersRef.current.get(peerId)?.close();
    const pc = createPublisherPeer(stream, iceServersRef.current, candidate => {
      sendCommentarySignal({ matchId, peerId, kind: "ice", candidate });
    });
    peersRef.current.set(peerId, pc);
    const offer = await pc.createOffer({ offerToReceiveAudio: false });
    await pc.setLocalDescription(offer);
    if (offer.sdp) sendCommentarySignal({ matchId, peerId, kind: "offer", sdp: offer.sdp });
  };

  const start = async () => {
    if (!matchLive) return;
    setError(null);
    setState("connecting");
    wantLiveRef.current = true;
    try {
      const stream = await startMicrophone();
      if (!wantLiveRef.current) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;
      sendGameEvent({ type: "commentary_publish", matchId });
    } catch (err) {
      wantLiveRef.current = false;
      setState("error");
      setError(microphoneErrorMessage(err));
    }
  };

  useEffect(() => {
    const offStatus = onEvent("commentary_status", event => {
      if (event.matchId !== matchId) return;
      if (event.iceServers) iceServersRef.current = commentaryIceServers(event.iceServers as CommentaryIceServer[]);
      if (event.live && wantLiveRef.current && streamRef.current) {
        setState("live");
        return;
      }
      if (!event.live && wantLiveRef.current && event.reason === "ended") {
        stop(false);
      }
    });
    const offJoined = onEvent("commentary_listener_joined", event => {
      if (event.matchId !== matchId || !event.peerId) return;
      void attachPeer(event.peerId);
    });
    const offLeft = onEvent("commentary_listener_left", event => {
      if (event.matchId !== matchId || !event.peerId) return;
      peersRef.current.get(event.peerId)?.close();
      peersRef.current.delete(event.peerId);
    });
    const offSignal = onEvent("commentary_signal", event => {
      if (event.matchId !== matchId || !event.peerId) return;
      const pc = peersRef.current.get(event.peerId);
      if (!pc) return;
      if (event.kind === "answer" && event.sdp) {
        void pc.setRemoteDescription({ type: "answer", sdp: event.sdp });
      } else if (event.kind === "ice" && event.candidate) {
        void pc.addIceCandidate(event.candidate);
      }
    });
    const offError = onEvent("commentary_error", event => {
      if (event.matchId !== matchId) return;
      setState("error");
      setError(typeof event.message === "string" ? event.message : "Could not start commentary.");
      wantLiveRef.current = false;
      closePeers();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    });
    const offEnded = onEvent("match_ended", event => {
      if (event.match?.id === matchId) stop(false);
    });
    const offConnected = onEvent("connection_established", () => {
      if (wantLiveRef.current && streamRef.current) {
        sendGameEvent({ type: "commentary_publish", matchId });
      }
    });
    return () => {
      offStatus();
      offJoined();
      offLeft();
      offSignal();
      offError();
      offEnded();
      offConnected();
    };
  }, [matchId]);

  useEffect(() => {
    if (!matchLive && state !== "off") stop(true);
  }, [matchLive]);

  useEffect(() => () => stop(true), [matchId]);

  const toggleMute = () => {
    const next = !micMuted;
    setAudioTracksEnabled(streamRef.current, !next);
    setMicMuted(next);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:min-w-[240px]">
      <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
        <Mic className="h-3.5 w-3.5" />
        Commentary
      </p>
      {state === "live" ? (
        <p className="mt-2 flex items-center gap-2 text-sm font-bold text-red-300">
          <Radio className="h-4 w-4" />
          LIVE
        </p>
      ) : (
        <p className="mt-2 text-sm font-semibold text-white/70">
          {state === "connecting" ? "Connecting" : state === "error" ? "Microphone unavailable" : "Commentary Off"}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {state === "live" ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10"
              onClick={toggleMute}
            >
              {micMuted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
              {micMuted ? "Unmute Mic" : "Mute Mic"}
            </Button>
            <Button type="button" variant="destructive" onClick={() => stop(true)}>
              Stop Commentary
            </Button>
          </>
        ) : (
          <Button
            type="button"
            className="bg-accent text-primary font-black hover:bg-accent/90"
            disabled={!matchLive || state === "connecting"}
            onClick={() => void start()}
          >
            {state === "connecting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
            {state === "connecting" ? "Connecting…" : "Start Commentary"}
          </Button>
        )}
      </div>
    </div>
  );
}
