import { Radio } from "lucide-react";

export interface CommentaryEntry {
  id: number;
  /** Wall-clock time the spectator's client received the event. */
  at: number;
  label: string;
  detail?: string;
  tone: "live" | "score" | "question" | "final";
}

const TONES: Record<CommentaryEntry["tone"], string> = {
  live: "border-[#f0576a]/45 text-[#ff9aa6]",
  score: "border-[#d4af37]/45 text-[#f0d58a]",
  question: "border-white/20 text-white/70",
  final: "border-[#4fd1a5]/40 text-[#7ee2be]",
};

/**
 * Live match activity.
 *
 * Fed only by the championship events this page is ALREADY subscribed to
 * (match started, score updated, question started, match ended). Nothing is
 * inferred or invented: if no event has arrived yet the panel says so rather
 * than inventing play-by-play.
 */
export function WatchCommentary({ entries }: { entries: CommentaryEntry[] }) {
  return (
    <section className="champ-panel rounded-2xl p-4 sm:p-5" aria-label="Live commentary">
      <div className="flex items-center gap-2">
        <Radio className="h-3.5 w-3.5 text-[#d4af37]" />
        <h2 className="champ-eyebrow">Live commentary</h2>
      </div>
      <div className="champ-divider my-3" />

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm champ-meta">
          Live commentary will appear here as the match plays.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map(entry => (
            <li
              key={entry.id}
              className={`rounded-xl border bg-white/[0.03] px-3 py-2.5 ${TONES[entry.tone]}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em]">{entry.label}</p>
                <span className="shrink-0 text-[10px] tabular-nums champ-meta">
                  {new Date(entry.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              {entry.detail && <p className="mt-1 text-sm text-white/80">{entry.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
