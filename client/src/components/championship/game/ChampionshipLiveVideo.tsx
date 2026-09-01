import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { onEvent } from "@/lib/socket";
import { attachChampionshipHls } from "@/lib/championship-hls";
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

type MatchStreamPayload = {
  match?: {
    id?: string;
    status?: string;
    streamUrl?: string | null;
  };
};

/**
 * Small championship-player HLS pip. Playback is the shared Watch Live helper;
 * only the card size and placement differ. Commentator WebRTC is separate.
 */
export function ChampionshipLiveVideo({ matchId }: { matchId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamError, setStreamError] = useState("");
  const [sound, setSound] = useState<WatchSoundState>(emptyWatchSoundState());

  const { data, refetch, isLoading } = useQuery<MatchStreamPayload>({
    queryKey: ["/api/championship-matches", matchId],
    queryFn: async () => {
      const response = await fetch(`/api/championship-matches/${matchId}`);
      if (!response.ok) throw new Error("Match not found");
      return response.json();
    },
    refetchInterval: 15_000,
  });

  const streamUrl = data?.match?.streamUrl;
  const isLive = data?.match?.status === "live";
  const hasStreamVideo = isLive && !!streamUrl;

  useEffect(() => {
    setSound(emptyWatchSoundState());
  }, [streamUrl, data?.match?.status]);

  const noteAutoplayBlocked = (error: unknown) => {
    if (isAutoplayBlocked(error)) {
      setSound(current => ({ ...current, playbackBlocked: true, soundOn: false }));
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || !isLive) return;
    setStreamError("");
    return attachChampionshipHls(video, streamUrl, {
      onPlayError: noteAutoplayBlocked,
      onFatalError: setStreamError,
    });
  }, [streamUrl, isLive]);

  useEffect(() => {
    const offUpdate = onEvent("match_updated", event => {
      if (event.match?.id === matchId) void refetch();
    });
    const offStart = onEvent("match_started", event => {
      if (event.match?.id === matchId) void refetch();
    });
    const offEnd = onEvent("match_ended", event => {
      if (event.match?.id === matchId) void refetch();
    });
    return () => {
      offUpdate();
      offStart();
      offEnd();
    };
  }, [matchId, refetch]);

  const kind = watchSoundKind(sound);
  const toggleWatchSound = () => {
    const video = videoRef.current;
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

  return (
    <section
      className="w-[200px] max-w-full shrink-0 overflow-hidden rounded-lg border border-[#d8b25f]/35 bg-[#121628]/90 shadow-lg sm:w-[280px] lg:w-[320px]"
      aria-label="Live event video"
    >
      <p className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-red-300">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
        Live event
      </p>
      {hasStreamVideo ? (
        <div className="relative aspect-video w-full bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted={!sound.soundOn}
            playsInline
            controls={false}
            onLoadedMetadata={event => {
              const available = streamHasAudioTrack(event.currentTarget);
              if (available === null) return;
              setSound(current => ({ ...current, audioAvailable: available }));
            }}
            onPause={event => event.currentTarget.play().catch(() => undefined)}
            className="absolute inset-0 h-full w-full max-w-full bg-black object-contain"
          />
          {shouldShowWatchSoundControl(true) && (
            <WatchSoundControl kind={kind} onToggle={toggleWatchSound} compact />
          )}
          {streamError && (
            <div className="absolute inset-x-1 bottom-1 rounded border border-red-400/30 bg-red-950/90 px-1.5 py-1 text-center text-[10px] leading-tight text-red-100">
              {streamError}
            </div>
          )}
        </div>
      ) : isLoading && !data ? (
        <div className="aspect-video w-full bg-black/50" />
      ) : (
        <div className="px-2 py-2 text-center text-[10px] leading-snug text-white/55">
          Live video unavailable
        </div>
      )}
    </section>
  );
}
