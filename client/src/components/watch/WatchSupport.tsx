import { useState } from "react";
import { Check, Heart } from "lucide-react";
import { TeamAvatar } from "@/components/championship/TeamAvatar";

export interface SupportTeam {
  id: string;
  name: string;
  emoticon: string;
  logoUrl?: string | null;
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
    <section className="watch-support-bar" aria-label="Support your team">
      <p className="hidden shrink-0 items-center gap-1.5 champ-eyebrow sm:flex">
        <Heart className="h-3 w-3 text-[#d4af37]" /> Support your team
      </p>
      <p className="sr-only" role="status">
        {cooldown ? "Easy there — give it a second." : "Cheer for your favourite team"}
      </p>

      <div className="watch-support-teams">
        {teams.map(team => {
          const supported = justSupported === team.id;
          return (
            <div key={team.id} className="watch-support-team">
              <TeamAvatar logoUrl={team.logoUrl} emoticon={team.emoticon} alt={`${team.name} logo`} className="h-6 w-6 shrink-0 text-lg" />
              <p className="hidden min-w-0 truncate text-xs font-bold text-white lg:block">{team.name}</p>
              <button
                type="button"
                onClick={() => send(team)}
                disabled={cooldown}
                aria-label={`Support ${team.name}`}
                className="watch-support flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                {supported ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#7ee2be]" /> Supported
                  </>
                ) : (
                  <span className="truncate">Support {team.name}</span>
                )}
              </button>
              <ul className="flex shrink-0 gap-1.5">
                {AUDIENCE_REACTIONS.map(reaction => (
                  <li key={reaction.id}>
                    <button
                      type="button"
                      onClick={() => send(team, reaction.id)}
                      disabled={cooldown}
                      aria-label={`Send ${reaction.label} reaction to ${team.name}`}
                      title={reaction.label}
                      className="watch-support flex h-9 w-9 items-center justify-center rounded-full text-sm text-white/85 transition-transform active:scale-95 disabled:opacity-50"
                    >
                      <span aria-hidden="true">{reaction.emoji}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hidden shrink-0 text-[10px] champ-meta tabular-nums xl:block">
                {supporters[team.id] ?? 0}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
