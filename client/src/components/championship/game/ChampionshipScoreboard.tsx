import type { ReactNode } from "react";
import { Crown } from "lucide-react";

interface ScoreboardTeam {
  name?: string;
  score?: number;
}

/**
 * Championship scoreboard: both teams, their live scores, whose turn it is and
 * how far through the match the players are.
 *
 * Every value is passed in from the page's existing game state - this component
 * computes no score, tracks no turn and holds no state of its own.
 *
 * `liveVideo` is presentation-only: the page passes the existing HLS pip so it
 * sits in the same top strip as the scores. Playback logic stays in that pip.
 */
export function ChampionshipScoreboard({
  playerTeam,
  opposingTeam,
  isYourTurn,
  answeringTeamName,
  questionNumber,
  totalQuestions,
  liveVideo,
}: {
  playerTeam: ScoreboardTeam;
  opposingTeam: ScoreboardTeam;
  /** Existing gameState.isYourTurn - undefined is treated as "yours", as the page does. */
  isYourTurn: boolean;
  answeringTeamName?: string;
  questionNumber?: number;
  totalQuestions?: number;
  liveVideo?: ReactNode;
}) {
  const side = (team: ScoreboardTeam, mine: boolean) => {
    const active = mine ? isYourTurn : !isYourTurn;
    return (
      <div
        className={`flex min-h-0 min-w-0 flex-col justify-center rounded-xl border px-3 py-3 md:h-full md:px-4 md:py-4 ${
          active ? "champ-turn-active bg-white/[0.07]" : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
          {mine && <Crown className="h-3 w-3 text-[#d8b25f]" />}
          {mine ? "Your team" : "Opponent"}
        </p>
        <p className="mt-1 truncate text-sm font-bold text-white sm:text-lg md:text-xl">{team.name ?? "—"}</p>
        <p
          className={`mt-1 text-4xl font-black leading-none tabular-nums transition-colors sm:text-5xl ${
            active ? "champ-gold-text" : "text-white/80"
          }`}
        >
          {team.score ?? 0}
        </p>
      </div>
    );
  };

  return (
    <section className="champ-panel rounded-2xl p-2 sm:p-2.5" aria-label="Match scoreboard">
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-3">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-rows-1">
          {side(playerTeam, true)}
          {side(opposingTeam, false)}
        </div>
        {liveVideo ? (
          <div className="mx-auto w-fit shrink-0 md:mx-0">
            {liveVideo}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] sm:text-xs ${
            isYourTurn
              ? "border-[#d8b25f]/60 bg-[#d8b25f]/15 text-[#f0d08a]"
              : "border-white/15 bg-white/5 text-white/60"
          }`}
        >
          <span aria-hidden="true">✦</span>
          {isYourTurn ? "Your team's turn" : `${answeringTeamName || "Opponent"}'s turn`}
        </span>

        {questionNumber && totalQuestions ? (
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/70 tabular-nums sm:text-xs">
            Question {String(questionNumber).padStart(2, "0")} / {totalQuestions}
          </span>
        ) : null}
      </div>
    </section>
  );
}
