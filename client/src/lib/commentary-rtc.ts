import { sendGameEvent } from "@/lib/socket";

export type CommentaryIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const FALLBACK_ICE: CommentaryIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function commentaryIceServers(fromServer?: CommentaryIceServer[] | null): RTCIceServer[] {
  return (fromServer && fromServer.length > 0 ? fromServer : FALLBACK_ICE) as RTCIceServer[];
}

export async function startMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach(track => track.stop());
}

export function setAudioTracksEnabled(stream: MediaStream | null | undefined, enabled: boolean): void {
  stream?.getAudioTracks().forEach(track => {
    track.enabled = enabled;
  });
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission was denied.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found.";
  }
  return "Microphone unavailable.";
}

export function createPublisherPeer(
  stream: MediaStream,
  iceServers: RTCIceServer[],
  onIce: (candidate: RTCIceCandidate) => void,
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers });
  for (const track of stream.getAudioTracks()) {
    pc.addTrack(track, stream);
  }
  pc.onicecandidate = event => {
    if (event.candidate) onIce(event.candidate);
  };
  return pc;
}

export function createListenerPeer(
  iceServers: RTCIceServer[],
  onTrack: (stream: MediaStream) => void,
  onIce: (candidate: RTCIceCandidate) => void,
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers });
  pc.ontrack = event => {
    const stream = event.streams[0] ?? new MediaStream(event.track ? [event.track] : []);
    onTrack(stream);
  };
  pc.onicecandidate = event => {
    if (event.candidate) onIce(event.candidate);
  };
  return pc;
}

export function sendCommentarySignal(options: {
  matchId: string;
  peerId: string;
  kind: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: RTCIceCandidate | null;
}): void {
  sendGameEvent({
    type: "commentary_signal",
    matchId: options.matchId,
    peerId: options.peerId,
    kind: options.kind,
    sdp: options.sdp,
    candidate: options.candidate
      ? {
          candidate: options.candidate.candidate,
          sdpMid: options.candidate.sdpMid,
          sdpMLineIndex: options.candidate.sdpMLineIndex,
        }
      : undefined,
  });
}
