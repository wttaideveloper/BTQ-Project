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
 */
export function ChampionshipScoreboard({
  playerTeam,
  opposingTeam,
  isYourTurn,
  answeringTeamName,
  questionNumber,
  totalQuestions,
}: {
  playerTeam: ScoreboardTeam;
  opposingTeam: ScoreboardTeam;
  /** Existing gameState.isYourTurn - undefined is treated as "yours", as the page does. */
  isYourTurn: boolean;
  answeringTeamName?: string;
  questionNumber?: number;
  totalQuestions?: number;
}) {
  const side = (team: ScoreboardTeam, mine: boolean) => {
    const active = mine ? isYourTurn : !isYourTurn;
    return (
      <div
        className={`flex-1 min-w-0 rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3 transition-all ${
          active ? "champ-turn-active bg-white/[0.07]" : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
          {mine && <Crown className="h-3 w-3 text-[#d8b25f]" />}
          {mine ? "Your team" : "Opponent"}
        </p>
        <p className="mt-1 truncate text-sm sm:text-base font-bold text-white">{team.name ?? "—"}</p>
        <p
          className={`mt-1 text-2xl sm:text-3xl font-black tabular-nums transition-colors ${
            active ? "champ-gold-text" : "text-white/80"
          }`}
        >
          {team.score ?? 0}
        </p>
      </div>
    );
  };

  return (
    <section className="champ-panel rounded-2xl p-3 sm:p-4" aria-label="Match scoreboard">
      <div className="flex items-stretch gap-2 sm:gap-4">
        {side(playerTeam, true)}
        <div className="flex shrink-0 flex-col items-center justify-center px-1">
          <span className="text-[10px] font-black tracking-[0.2em] text-white/35">VS</span>
        </div>
        {side(opposingTeam, false)}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-[0.14em] ${
            isYourTurn
              ? "border-[#d8b25f]/60 bg-[#d8b25f]/15 text-[#f0d08a]"
              : "border-white/15 bg-white/5 text-white/60"
          }`}
        >
          <span aria-hidden="true">✦</span>
          {isYourTurn ? "Your team's turn" : `${answeringTeamName || "Opponent"}'s turn`}
        </span>

        {questionNumber && totalQuestions ? (
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-[0.14em] text-white/70 tabular-nums">
            Question {String(questionNumber).padStart(2, "0")} / {totalQuestions}
          </span>
        ) : null}
      </div>
    </section>
  );
}
