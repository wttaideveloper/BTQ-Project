import { Radio, Trophy } from "lucide-react";
import { FaithIQTreeMark } from "@/components/championship/game/FaithIQTreeMark";
import { TeamAvatar } from "@/components/championship/TeamAvatar";
import { WatchCommentary, type CommentaryEntry } from "@/components/watch/WatchCommentary";
import { WatchQuestionPanel, type WatchQuestion, type WatchQuestionResult } from "@/components/watch/WatchQuestionPanel";
import { WatchTossPanel, type WatchToss, type WatchTossResult } from "@/components/watch/WatchTossPanel";
import {
  broadcastPhase,
  broadcastResultCopy,
  broadcastStateParts,
  broadcastStatusLabel,
} from "@/lib/championship-broadcast";

/**
 * Commentator / OBS desk. Display-only: no buttons, no HLS, no game controls.
 */
export function BroadcastDesk({
  championshipName,
  status,
  gameplayStarted,
  teamA,
  teamB,
  teamAScore,
  teamBScore,
  question,
  questionResult,
  toss,
  tossResult,
  winnerName,
  isDraw,
  events,
  clean,
  scoreFlash,
}: {
  championshipName?: string;
  status: string;
  gameplayStarted: boolean;
  teamA?: { id: string; name: string; emoticon: string; logoUrl?: string | null } | null;
  teamB?: { id: string; name: string; emoticon: string; logoUrl?: string | null } | null;
  teamAScore: number;
  teamBScore: number;
  question: WatchQuestion | null;
  questionResult: WatchQuestionResult | null;
  toss: WatchToss | null;
  tossResult: WatchTossResult | null;
  winnerName?: string | null;
  isDraw: boolean;
  events: CommentaryEntry[];
  clean: boolean;
  scoreFlash: boolean;
}) {
  const phase = broadcastPhase({ status, gameplayStarted, toss, question });
  const statusLabel = broadcastStatusLabel(status, phase);
  const state = broadcastStateParts({
    phase,
    question,
    answeringTeamName: question?.answeringTeamName,
    winnerName,
    isDraw,
  });
  const live = statusLabel === "LIVE";
  const answeringId = question && !questionResult ? question.answeringTeamId : undefined;
  const resultCopy =
    question && questionResult && questionResult.questionId === question.questionId
      ? broadcastResultCopy({
          answeringTeamName: question.answeringTeamName,
          isCorrect: questionResult.isCorrect,
          pointsAwarded: questionResult.pointsAwarded,
        })
      : null;
  const stageKey = question?.questionId ?? toss?.questionId ?? status;

  return (
    <div className={`broadcast-desk overflow-x-hidden ${clean ? "broadcast-desk-clean" : ""}`}>
      <header className="broadcast-header">
        <div className="broadcast-header-brand">
          <FaithIQTreeMark className="h-8 w-8 shrink-0 text-white sm:h-10 sm:w-10" />
          <div className="min-w-0 leading-none">
            <p className="text-sm font-black tracking-[0.2em] text-white sm:text-base md:text-lg">FAITHIQ LIVE</p>
            <p className="mt-1 break-words text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f0d58a]/90 sm:text-[11px]">
              {championshipName || "FaithIQ Championship"}
            </p>
          </div>
        </div>

        <div className="broadcast-header-match">
          <p className="break-words text-center text-sm font-black uppercase tracking-[0.08em] text-white sm:text-base md:text-lg">
            {teamA?.name ?? "Team A"}
            <span className="mx-1.5 font-bold tracking-[0.2em] text-[#e7c766]/80 sm:mx-2">VS</span>
            {teamB?.name ?? "Team B"}
          </p>
        </div>

        <span
          className={`broadcast-live-pill inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] sm:px-3.5 sm:text-xs ${
            live
              ? "border-[#f0576a]/55 bg-[#f0576a]/18 text-[#ff9aa6]"
              : statusLabel === "COMPLETED"
                ? "border-white/15 bg-white/[0.05] text-white/70"
                : "border-[#e7c766]/35 bg-[#e7c766]/10 text-[#e7c766]"
          }`}
        >
          <span className={`h-2 w-2 rounded-full bg-current ${live ? "broadcast-live-dot" : ""}`} />
          {statusLabel}
        </span>
      </header>

      <section
        className={`broadcast-scoreboard ${scoreFlash ? "broadcast-score-flash" : ""}`}
        aria-label="Match score"
      >
        <div className={`broadcast-scoreboard-team broadcast-scoreboard-a ${answeringId === teamA?.id ? "watch-turn-live" : ""}`}>
          <TeamAvatar logoUrl={teamA?.logoUrl} emoticon={teamA?.emoticon} alt={`${teamA?.name ?? "Team A"} logo`} className="broadcast-team-mark" />
          <p className="broadcast-team-name">{teamA?.name ?? "Team A"}</p>
        </div>
        <p className="broadcast-score champ-scoreline" aria-live="polite">
          <span>{teamAScore}</span>
          <span className="broadcast-score-colon">:</span>
          <span>{teamBScore}</span>
        </p>
        <div className={`broadcast-scoreboard-team broadcast-scoreboard-b ${answeringId === teamB?.id ? "watch-turn-live" : ""}`}>
          <TeamAvatar logoUrl={teamB?.logoUrl} emoticon={teamB?.emoticon} alt={`${teamB?.name ?? "Team B"} logo`} className="broadcast-team-mark" />
          <p className="broadcast-team-name">{teamB?.name ?? "Team B"}</p>
        </div>
      </section>

      <div className="broadcast-state" aria-live="polite">
        <p className="broadcast-state-kicker">{state.kicker}</p>
        <p className="broadcast-state-headline">{state.headline}</p>
      </div>

      <div className={`broadcast-body ${clean ? "broadcast-body-clean" : ""}`}>
        <section className="broadcast-stage champ-panel" aria-label="Current question">
          <div key={stageKey} className="broadcast-stage-inner">
            {status === "completed" ? (
              <div className="grid place-items-center py-6 text-center sm:py-10">
                <Trophy className="h-10 w-10 text-[#f0d58a] sm:h-12 sm:w-12" />
                <h2 className="mt-3 text-xl font-black uppercase tracking-[0.14em] text-white sm:text-2xl md:text-3xl">Match complete</h2>
                <p className="mt-2 text-base font-bold text-white/85 sm:text-lg">
                  {isDraw ? "Result · Draw" : winnerName ? `Winner · ${winnerName}` : "Final score"}
                </p>
                <p className="champ-scoreline mt-3 text-4xl font-black text-white sm:text-5xl">
                  {teamAScore} <span className="text-white/25">:</span> {teamBScore}
                </p>
              </div>
            ) : toss ? (
              <WatchTossPanel
                variant="broadcast"
                toss={toss}
                result={tossResult}
                winnerEmoticon={tossResult?.winnerTeamId === teamA?.id ? teamA?.emoticon : tossResult?.winnerTeamId === teamB?.id ? teamB?.emoticon : undefined}
                winnerLogoUrl={tossResult?.winnerTeamId === teamA?.id ? teamA?.logoUrl : tossResult?.winnerTeamId === teamB?.id ? teamB?.logoUrl : undefined}
              />
            ) : question ? (
              <div className="broadcast-question">
                <WatchQuestionPanel
                  variant="broadcast"
                  question={question}
                  result={questionResult}
                  teamEmoticon={
                    question.answeringTeamId === teamA?.id
                      ? teamA?.emoticon
                      : question.answeringTeamId === teamB?.id
                        ? teamB?.emoticon
                        : undefined
                  }
                  teamLogoUrl={
                    question.answeringTeamId === teamA?.id
                      ? teamA?.logoUrl
                      : question.answeringTeamId === teamB?.id
                        ? teamB?.logoUrl
                        : undefined
                  }
                />
                {resultCopy && (
                  <div
                    className={`champ-fade-in mt-4 rounded-xl border px-4 py-3 text-center sm:mt-5 sm:px-5 sm:py-4 ${
                      questionResult?.isCorrect
                        ? "border-[#4fd1a5]/45 bg-[#4fd1a5]/10"
                        : "border-[#c76a7a]/40 bg-[#c76a7a]/10"
                    }`}
                  >
                    <p className={`text-sm font-black uppercase tracking-[0.14em] sm:text-lg md:text-xl ${
                      questionResult?.isCorrect ? "text-[#7ee2be]" : "text-[#e2a3ad]"
                    }`}>
                      {resultCopy.headline}
                    </p>
                    <p className="champ-scoreline mt-1 text-2xl font-black tabular-nums text-white sm:text-3xl">
                      {resultCopy.points}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid place-items-center py-10 text-center">
                <Radio className="h-8 w-8 text-[#ff9aa6]" />
                <p className="mt-3 text-lg font-black uppercase tracking-[0.16em] text-white">
                  {phase === "waiting" || phase === "upcoming" ? "Waiting" : "Stand by"}
                </p>
                <p className="mt-2 max-w-md text-sm champ-meta">{state.headline}</p>
              </div>
            )}
          </div>
        </section>

        {!clean && (
          <aside className="broadcast-events">
            <WatchCommentary entries={events} title="Recent events" />
          </aside>
        )}
      </div>
    </div>
  );
}
