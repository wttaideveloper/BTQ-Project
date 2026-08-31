import { Volume2, VolumeX } from "lucide-react";
import { watchSoundCopy, type WatchSoundKind } from "@/lib/watch-sound";

/**
 * Compact Enable Sound / Mute control for the Watch Live HLS <video>.
 * Rendered only when a stream element is on the stage.
 */
export function WatchSoundControl({
  kind,
  onToggle,
}: {
  kind: WatchSoundKind;
  onToggle: () => void;
}) {
  const copy = watchSoundCopy(kind);
  const Icon = kind === "muted" || kind === "none" ? VolumeX : Volume2;

  return (
    <button
      type="button"
      disabled={copy.disabled}
      aria-label={copy.aria}
      aria-pressed={kind === "on"}
      onClick={onToggle}
      className="pointer-events-auto absolute right-3 top-3 z-20 inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full border border-amber-400/40 bg-[#110b2e]/90 px-3 text-xs font-bold text-amber-100 shadow-lg backdrop-blur-sm hover:border-amber-300/70 hover:bg-[#171238] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{copy.label}</span>
    </button>
  );
}
