/**
 * Watch Live commentary sound helpers.
 *
 * The HLS <video> starts muted so browsers allow autoplay. Sound is only
 * enabled after a real user gesture on the Watch page. Nothing is persisted
 * and no server event is involved.
 */

export type WatchSoundKind = "enable" | "tap" | "on" | "muted" | "none";

export type WatchSoundState = {
  /** The video element is currently unmuted. */
  soundOn: boolean;
  /** The viewer has unmuted at least once this page session. */
  everEnabled: boolean;
  /** The last video.play() was rejected with NotAllowedError. */
  playbackBlocked: boolean;
  /**
   * Whether the browser reported an audio track.
   * null = unknown (muxed HLS audio is common; do not claim "No audio").
   */
  audioAvailable: boolean | null;
};

export type WatchSoundCopy = {
  label: string;
  aria: string;
  disabled: boolean;
};

export type WatchSoundVideo = {
  muted: boolean;
  volume: number;
  play: () => Promise<void>;
};

export function emptyWatchSoundState(): WatchSoundState {
  return { soundOn: false, everEnabled: false, playbackBlocked: false, audioAvailable: null };
}

export function shouldShowWatchSoundControl(hasVideo: boolean): boolean {
  return hasVideo;
}

export function watchSoundKind(state: WatchSoundState): WatchSoundKind {
  if (state.audioAvailable === false) return "none";
  if (state.soundOn) return "on";
  if (state.playbackBlocked) return "tap";
  if (state.everEnabled) return "muted";
  return "enable";
}

export function watchSoundCopy(kind: WatchSoundKind): WatchSoundCopy {
  switch (kind) {
    case "on":
      return { label: "Sound On", aria: "Sound on. Mute live commentary.", disabled: false };
    case "muted":
      return { label: "Muted", aria: "Muted. Enable live commentary.", disabled: false };
    case "tap":
      return { label: "Tap to enable sound", aria: "Tap to enable sound", disabled: false };
    case "none":
      return { label: "No audio", aria: "This stream has no audio", disabled: true };
    default:
      return { label: "Enable Sound", aria: "Enable sound", disabled: false };
  }
}

export function isAutoplayBlocked(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "NotAllowedError";
}

/** Unmute or mute the existing Watch Live video. Does not create a second media element. */
export function applyWatchSound(video: WatchSoundVideo, soundOn: boolean): Promise<void> {
  video.muted = !soundOn;
  if (soundOn) video.volume = 1;
  return video.play();
}

/**
 * Conservative audio-track probe. Muxed HLS (typical OBS → .m3u8) often has
 * no separate audioTracks list, so unknown must not be treated as "no audio".
 */
export function streamHasAudioTrack(video: object): boolean | null {
  const tracks = (video as { audioTracks?: { length: number } }).audioTracks;
  if (tracks && typeof tracks.length === "number") return tracks.length > 0;
  return null;
}
