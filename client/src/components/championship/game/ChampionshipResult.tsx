import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { FaithIQLockup } from "./FaithIQTreeMark";

/**
 * Championship match result.
 *
 * The winner, the draw case and every line of copy are decided by the page's
 * existing finished-phase logic and passed in. Nothing is recomputed here.
 */
export function ChampionshipResult({
  yourTeamName,
  opponentName,
  yourScore,
  opponentScore,
  isDraw,
  isYourTeamWinner,
  headline,
  detail,
  actions,
}: {
  yourTeamName: string;
  opponentName: string;
  yourScore: number;
  opponentScore: number;
  isDraw: boolean;
  isYourTeamWinner: boolean;
  headline: string;
  detail: string;
  /** The page's existing buttons (Return Home, etc.). */
  actions?: ReactNode;
}) {
  const winnerName = isDraw ? null : isYourTeamWinner ? yourTeamName : opponentName;

  const teamBlock = (name: string, score: number, mine: boolean) => {
    const won = !isDraw && (mine ? isYourTeamWinner : !isYourTeamWinner);
    return (
      <div
        className={`flex-1 min-w-0 rounded-xl border px-3 py-4 text-center transition-all ${
          won ? "champ-turn-active bg-[#d8b25f]/10" : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
          {mine ? "Your team" : "Opponent"}
        </p>
        <p className="mt-1 truncate text-sm font-bold text-white sm:text-base">{name}</p>
        <p
          className={`mt-1 text-3xl font-black tabular-nums sm:text-4xl ${
            won ? "champ-gold-text" : "text-white/70"
          }`}
        >
          {score}
        </p>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4">
      <section className="champ-panel champ-enter overflow-hidden rounded-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <FaithIQLockup compact />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] champ-gold-text">
            Championship match
          </span>
        </div>

        <div className="champ-card rounded-t-[2rem] border-t border-[#d8b25f]/70 px-4 py-7 text-center sm:rounded-t-[3rem] sm:px-8 sm:py-9">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#1b2559]/50">
            Match complete
          </p>

          <div className="mt-4 flex justify-center">
            <span
              className={`grid h-16 w-16 place-items-center rounded-full border-2 sm:h-20 sm:w-20 ${
                isDraw
                  ? "border-[#1b2559]/20 bg-[#1b2559]/5 text-[#1b2559]"
                  : "border-[#d8b25f] bg-gradient-to-br from-[#f0d08a] to-[#c99f45] text-[#1b2559] shadow-lg"
              }`}
            >
              <Trophy className="h-8 w-8 sm:h-9 sm:w-9" />
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-black tracking-tight text-[#1b2559] sm:text-3xl">
            {headline}
          </h2>
          {winnerName && (
            <p className="mt-1 text-base font-bold text-[#1b2559]/80 sm:text-lg">{winnerName}</p>
          )}

          <p className="mt-3 text-3xl font-black tabular-nums text-[#1b2559] sm:text-4xl">
            {yourScore} <span className="text-[#1b2559]/30">—</span> {opponentScore}
          </p>

          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#1b2559]/70">{detail}</p>
        </div>

        <div className="flex items-stretch gap-2 p-3 sm:gap-4 sm:p-4">
          {teamBlock(yourTeamName, yourScore, true)}
          {teamBlock(opponentName, opponentScore, false)}
        </div>

        {actions && <div className="flex flex-wrap justify-center gap-3 px-4 pb-5">{actions}</div>}
      </section>
    </div>
  );
}

/**
 * Shared status panel for the championship match's non-question states
 * (connecting, preparing, loading the next question). Same states the Team
 * Battle screen shows - only the presentation differs.
 */
export function ChampionshipStatusPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4">
      <section className="champ-panel champ-enter overflow-hidden rounded-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <FaithIQLockup compact />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] champ-gold-text">
            Championship
          </span>
        </div>
        <div className="champ-card rounded-t-[2rem] border-t border-[#d8b25f]/70 px-4 py-9 text-center sm:rounded-t-[3rem] sm:px-8">
          <div className="flex justify-center gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#d8b25f]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#c99f45] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#3b1e78] [animation-delay:300ms]" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#1b2559] sm:text-2xl">{title}</h2>
          <p className="mt-2 text-sm text-[#1b2559]/65">{description}</p>
          {children && <div className="mt-6 flex w-full justify-center">{children}</div>}
        </div>
      </section>
    </div>
  );
}
