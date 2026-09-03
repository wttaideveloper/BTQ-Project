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

export const HLS_EXTERNAL_HTTP_FAILURE =
  "Live video unavailable. The external HLS stream blocked this site (HTTP 403 / CORS).";

export const HLS_EXTERNAL_NOT_FOUND =
  "Live video unavailable. The external HLS stream was not found (HTTP 404).";

export const HLS_GENERIC_PLAYBACK_FAILURE =
  "Live video unavailable. Playback failed after the stream was requested.";

export const HLS_UNSUPPORTED_BROWSER =
  "HLS playback is not supported by this browser.";

/** CORS-blocked CDNs often surface as HTTP 0 instead of a readable 403. */
export function isNonRetryableHlsHttpStatus(status: number | undefined): boolean {
  return status === 0 || status === 403 || status === 404;
}

export function championshipHlsHttpFailureMessage(status: number | undefined): string {
  if (status === 404) return HLS_EXTERNAL_NOT_FOUND;
  return HLS_EXTERNAL_HTTP_FAILURE;
}

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
        // 403/404 never recover via startLoad(). CORS-blocked CDNs often
        // report code 0, which previously retried forever on a black frame.
        if (isNonRetryableHlsHttpStatus(status)) {
          hls.stopLoad();
          handlers.onFatalError?.(championshipHlsHttpFailureMessage(status));
          return;
        }
        hls.startLoad();
        return;
      }
      if (details.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
      }
      handlers.onFatalError?.(HLS_GENERIC_PLAYBACK_FAILURE);
    });
    return () => hls.destroy();
  }

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    const onNativeError = () => {
      handlers.onFatalError?.(HLS_EXTERNAL_HTTP_FAILURE);
    };
    video.addEventListener("error", onNativeError);
    video.src = url;
    play();
    return () => {
      video.removeEventListener("error", onNativeError);
      video.removeAttribute("src");
      video.load();
    };
  }

  handlers.onFatalError?.(HLS_UNSUPPORTED_BROWSER);
  return () => undefined;
}
