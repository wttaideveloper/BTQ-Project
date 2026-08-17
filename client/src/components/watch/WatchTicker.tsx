/**
 * Bottom broadcast ticker.
 *
 * Every item is a fact from the match payload this page already holds. There is
 * no news feed behind it, so nothing is generated: with only the fixture known
 * it simply carries the championship line.
 */
export function WatchTicker({ items }: { items: string[] }) {
  const line = items.length ? items : ["FaithIQ Championship • Live Bible Trivia"];
  return (
    <div className="watch-ticker overflow-hidden py-2.5">
      <div className="watch-ticker-track">
        {/* Duplicated once so the marquee wraps without a visible seam. */}
        {[0, 1].map(copy => (
          <div key={copy} className="inline-flex items-center gap-10" aria-hidden={copy === 1}>
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-[#f0d58a]">
              FaithIQ Championship
            </span>
            {line.map((item, index) => (
              <span
                key={`${copy}-${index}`}
                className="inline-flex items-center gap-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60"
              >
                <span className="text-[#d4af37]/60">•</span>
                {item}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
