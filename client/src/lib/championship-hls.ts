import Hls from "hls.js";

/**
 * Shared live HLS attach used by Watch Live and the championship player screen.
 * Playback config is unchanged from the original WatchMatch effect.
 */
export const CHAMPIONSHIP_HLS_CONFIG = {
  liveSyncDurationCount: 2,
  maxBufferLength: 10,
} as const;

export function attachChampionshipHls(
  video: HTMLVideoElement,
  url: string,
  handlers: {
    onPlayError?: (error: unknown) => void;
    onFatalError?: (message: string) => void;
  } = {},
): () => void {
  const play = () => {
    video.play().catch(error => handlers.onPlayError?.(error));
  };

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    play();
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }

  if (Hls.isSupported()) {
    const hls = new Hls({ ...CHAMPIONSHIP_HLS_CONFIG });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => play());
    hls.on(Hls.Events.ERROR, (_event, details) => {
      if (!details.fatal) return;
      if (details.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (details.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else handlers.onFatalError?.("The live stream is temporarily unavailable.");
    });
    return () => hls.destroy();
  }

  handlers.onFatalError?.("HLS playback is not supported by this browser.");
  return () => undefined;
}
