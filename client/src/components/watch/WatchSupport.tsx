import { useState } from "react";
import { Check, Heart } from "lucide-react";

export interface SupportTeam {
  id: string;
  name: string;
  emoticon: string;
}

/**
 * The five encouragement reactions. The ids match the server's
 * AUDIENCE_REACTIONS table - the client sends an id, never an emoji, so a
 * viewer can only ever broadcast one of these.
 */
export const AUDIENCE_REACTIONS = [
  { id: "cheer", emoji: "👏", label: "Great job!" },
  { id: "fire", emoji: "🔥", label: "Let's go!" },
  { id: "pray", emoji: "🙏", label: "Keep going!" },
  { id: "celebrate", emoji: "🎉", label: "Amazing!" },
  { id: "strong", emoji: "💪", label: "Come on!" },
] as const;

/**
 * Live audience support.
 *
 * Compact by design: the question is the page, this is the crowd. Every control
 * sends the EXISTING `team_reaction` event through the page's existing handler
 * - no answers, no scores, no match state can be touched from here - and it
 * renders only while the match is live, matching the server's own rule.
 *
 * This panel is the control area only. The reaction animation belongs to the
 * scoreboard - one renderer, driven by the server broadcast - so a single
 * reaction can never draw twice.
 */
export function WatchSupport({
  teamA,
  teamB,
  supporters,
  cooldown,
  onSupport,
}: {
  teamA?: SupportTeam;
  teamB?: SupportTeam;
  supporters: Record<string, number>;
  cooldown: boolean;
  onSupport: (team: SupportTeam, reactionId?: string) => void;
}) {
  // Purely local button feedback - no request, no game state.
  const [justSupported, setJustSupported] = useState<string | null>(null);
  const teams = [teamA, teamB].filter(Boolean) as SupportTeam[];
  if (teams.length === 0) return null;

  const send = (team: SupportTeam, reactionId?: string) => {
    onSupport(team, reactionId);
    if (!reactionId) {
      setJustSupported(team.id);
      window.setTimeout(() => setJustSupported(current => (current === team.id ? null : current)), 1000);
    }
  };

  return (
    <section className="champ-panel rounded-2xl p-4" aria-label="Support your team">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-2 champ-eyebrow">
          <Heart className="h-3 w-3 text-[#d4af37]" /> Support your team
        </p>
        <p className="text-[11px] champ-meta" role="status">
          {cooldown ? "Easy there — give it a second." : "Cheer for your favourite team"}
        </p>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {teams.map(team => {
          const supported = justSupported === team.id;
          return (
            <div
              key={team.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none" aria-hidden="true">
                  {team.emoticon}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">{team.name}</p>
                <p className="shrink-0 text-[11px] champ-meta tabular-nums">
                  {supporters[team.id] ?? 0} supporters
                </p>
              </div>

              <button
                type="button"
                onClick={() => send(team)}
                disabled={cooldown}
                aria-label={`Support ${team.name}`}
                className="watch-support mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                {supported ? (
                  <>
                    <Check className="h-4 w-4 text-[#7ee2be]" /> Supported!
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">{team.emoticon}</span> Support {team.name}
                  </>
                )}
              </button>

              <ul className="mt-2 flex flex-wrap gap-1.5">
                {AUDIENCE_REACTIONS.map(reaction => (
                  <li key={reaction.id}>
                    <button
                      type="button"
                      onClick={() => send(team, reaction.id)}
                      disabled={cooldown}
                      aria-label={`Send ${reaction.label} reaction to ${team.name}`}
                      title={reaction.label}
                      className="watch-support flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2 text-sm text-white/85 transition-transform active:scale-95 disabled:opacity-50"
                    >
                      <span aria-hidden="true">{reaction.emoji}</span>
                      <span className="hidden text-xs font-semibold lg:inline">{reaction.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
