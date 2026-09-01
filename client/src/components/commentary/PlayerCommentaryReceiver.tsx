import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { onEvent, sendGameEvent } from "@/lib/socket";
import {
  commentaryIceServers,
  createListenerPeer,
  sendCommentarySignal,
  type CommentaryIceServer,
} from "@/lib/commentary-rtc";

export function PlayerCommentaryReceiver({ matchId }: { matchId: string }) {
  const [live, setLive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>(commentaryIceServers());
  const selfPeerIdRef = useRef<string | null>(null);

  const closePeer = () => {
    peerRef.current?.close();
    peerRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  };

  const subscribe = () => {
    sendGameEvent({ type: "commentary_listen", matchId });
  };

  const attachRemote = (stream: MediaStream) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    audio.muted = mutedRef.current;
    const play = audio.play();
    if (play && typeof play.then === "function") {
      play.catch(() => setNeedsTap(true));
    }
  };

  useEffect(() => {
    subscribe();
    const offStatus = onEvent("commentary_status", event => {
      if (event.matchId !== matchId) return;
      if (event.iceServers) iceServersRef.current = commentaryIceServers(event.iceServers as CommentaryIceServer[]);
      if (event.live) {
        setLive(true);
      } else {
        setLive(false);
        closePeer();
      }
    });
    const offSignal = onEvent("commentary_signal", event => {
      if (event.matchId !== matchId) return;
      if (event.peerId) selfPeerIdRef.current = event.peerId;
      const peerId = event.peerId || selfPeerIdRef.current;
      if (!peerId) return;
      if (event.kind === "offer" && event.sdp) {
        peerRef.current?.close();
        const pc = createListenerPeer(
          iceServersRef.current,
          attachRemote,
          candidate => sendCommentarySignal({ matchId, peerId, kind: "ice", candidate }),
        );
        peerRef.current = pc;
        void (async () => {
          await pc.setRemoteDescription({ type: "offer", sdp: event.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (answer.sdp) sendCommentarySignal({ matchId, peerId, kind: "answer", sdp: answer.sdp });
        })();
      } else if (event.kind === "ice" && event.candidate) {
        void peerRef.current?.addIceCandidate(event.candidate);
      }
    });
    const offEnded = onEvent("match_ended", event => {
      if (event.match?.id !== matchId) return;
      setLive(false);
      closePeer();
    });
    const offConnected = onEvent("connection_established", () => {
      subscribe();
    });
    return () => {
      offStatus();
      offSignal();
      offEnded();
      offConnected();
      closePeer();
    };
  }, [matchId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  return (
    <div className="pointer-events-auto fixed bottom-3 left-3 z-30 w-[11.5rem] rounded-xl border border-white/15 bg-[#121628]/90 px-2.5 py-2 shadow-lg backdrop-blur-md sm:bottom-4 sm:left-4">
      <audio ref={audioRef} autoPlay playsInline />
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/80">
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-red-400" : "bg-white/35"}`} />
        {live ? "Commentary LIVE" : "Commentary off"}
      </p>
      <button
        type="button"
        className="mt-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white hover:bg-white/10"
        onClick={() => {
          setMuted(current => !current);
          if (needsTap) {
            void audioRef.current?.play().then(() => setNeedsTap(false)).catch(() => undefined);
          }
        }}
        aria-label={muted ? "Unmute commentary" : "Mute commentary"}
        title={muted ? "Unmute commentary" : "Mute commentary"}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
