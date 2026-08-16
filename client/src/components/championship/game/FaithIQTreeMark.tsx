/**
 * The FaithIQ tree mark.
 *
 * The paths are the app's existing artwork from client/src/assets/FaithIQ-Logo.svg,
 * which ships the tree on its own precisely so the wordmark can be set in React
 * (see the comment at the end of that file). Inlined here rather than loaded as
 * an <img> so it can inherit `currentColor` and be tinted gold or white for the
 * championship lockup. No new logo is invented.
 */
export function FaithIQTreeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 500 260" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M250 170 Q250 170 245 160 Q240 150 250 135 Q260 150 255 160 Q250 170 250 170 Z" />
      <path d="M250 170 Q230 165 220 155 Q210 145 225 130 Q235 145 240 150 Q245 155 250 170 Z" />
      <path d="M250 170 Q270 165 280 155 Q290 145 275 130 Q265 145 260 150 Q255 155 250 170 Z" />
      <path d="M225 130 Q215 125 205 115 Q195 105 210 90 Q220 105 225 110 Q230 115 225 130 Z" />
      <path d="M275 130 Q285 125 295 115 Q305 105 290 90 Q280 105 275 110 Q270 115 275 130 Z" />
      <path d="M250 135 Q245 125 245 115 Q245 105 250 90 Q255 105 255 115 Q255 125 250 135 Z" />
      <path d="M210 90 Q200 85 195 75 Q190 65 205 50 Q215 65 215 70 Q215 75 210 90 Z" />
      <path d="M250 90 Q245 80 245 70 Q245 60 250 45 Q255 60 255 70 Q255 80 250 90 Z" />
      <path d="M290 90 Q300 85 305 75 Q310 65 295 50 Q285 65 285 70 Q285 75 290 90 Z" />
      <path d="M250 170 L250 200 Q245 205 250 210 Q255 205 250 200 Z" />
    </svg>
  );
}

/** Horizontal FaithIQ lockup: tree mark + wordmark + tagline. */
export function FaithIQLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
      <FaithIQTreeMark className={compact ? "h-7 w-7 text-white" : "h-9 w-9 sm:h-10 sm:w-10 text-white"} />
      <div className="min-w-0 leading-none">
        <p className={`font-black tracking-[0.14em] text-white ${compact ? "text-sm" : "text-base sm:text-lg"}`}>
          FAITHIQ
        </p>
        {!compact && (
          <p className="mt-1 text-[8px] sm:text-[9px] font-semibold tracking-[0.22em] text-white/55">
            FAITH. VALUE. REWARD.
          </p>
        )}
      </div>
    </div>
  );
}
