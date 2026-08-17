import { Radio } from "lucide-react";

export interface CommentaryEntry {
  id: number;
  /** Wall-clock time the spectator's client received the event. */
  at: number;
  label: string;
  detail?: string;
  tone: "live" | "score" | "question" | "final";
}

const TONES: Record<CommentaryEntry["tone"], { row: string; chip: string; label: string }> = {
  live: { row: "border-[#f0576a]/40 text-[#ff9aa6]", chip: "bg-[#f0576a]/15 text-[#ff9aa6]", label: "Live" },
  score: { row: "border-[#d4af37]/40 text-[#f0d58a]", chip: "bg-[#d4af37]/15 text-[#f0d58a]", label: "Score" },
  question: { row: "border-white/15 text-white/75", chip: "bg-white/10 text-white/60", label: "Question" },
  final: { row: "border-[#4fd1a5]/40 text-[#7ee2be]", chip: "bg-[#4fd1a5]/15 text-[#7ee2be]", label: "Result" },
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
        // Newest first, capped by the page - the rail stays short and scannable.
        <ul className="space-y-2">
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              // Only the newest line is emphasised; the rest are unchanged.
              className={`champ-fade-in rounded-xl border bg-white/[0.03] px-3 py-2 ${TONES[entry.tone].row} ${
                index === 0 ? "watch-commentary-latest" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${TONES[entry.tone].chip}`}
                >
                  {TONES[entry.tone].label}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums champ-meta">
                  {new Date(entry.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.1em]">{entry.label}</p>
              {entry.detail && <p className="mt-0.5 text-sm text-white/75">{entry.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
