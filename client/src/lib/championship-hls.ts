import Hls from "hls.js";

/**
 * Shared live HLS attach used by Watch Live and the championship player screen.
 * Playback config is unchanged from the original WatchMatch effect.
 */
export const CHAMPIONSHIP_HLS_CONFIG = {
  liveSyncDurationCount: 2,
  maxBufferLength: 10,
  // Production Vite bundles can fail to start the transmuxer worker, which
  // leaves a black <video> with no fatal UI. Main-thread transmuxing is the
  // supported fallback and matches local `npm run dev` behavior.
  enableWorker: false,
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

  // Avoid sending the production page URL as Referer to the CDN. Bitmovin's
  // Cloudflare edge returned HTTP 403 for https://triviagame.faithiq.io while
  // the same manifest returned 200 from localhost.
  video.setAttribute("referrerpolicy", "no-referrer");

  // hls.js documented order: use MSE when available. Checking native
  // `canPlayType("application/vnd.apple.mpegurl")` first is wrong on browsers
  // that return "maybe" but cannot actually play HLS, which yields a black
  // video and never constructs hls.js.
  if (Hls.isSupported()) {
    const hls = new Hls({ ...CHAMPIONSHIP_HLS_CONFIG });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => play());
    hls.on(Hls.Events.ERROR, (_event, details) => {
      if (!details.fatal) return;
      if (details.type === Hls.ErrorTypes.NETWORK_ERROR) {
        const status = details.response?.code;
        // 403/404 will never recover via startLoad(); retrying left a black
        // frame and no onFatalError. Other network errors still retry.
        if (status === 403 || status === 404) {
          handlers.onFatalError?.("The live stream is temporarily unavailable.");
          return;
        }
        hls.startLoad();
        return;
      }
      if (details.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
      }
      handlers.onFatalError?.("The live stream is temporarily unavailable.");
    });
    return () => hls.destroy();
  }

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    play();
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }

  handlers.onFatalError?.("HLS playback is not supported by this browser.");
  return () => undefined;
}
