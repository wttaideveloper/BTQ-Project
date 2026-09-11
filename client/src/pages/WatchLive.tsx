import { useEffect } from "react";
import { useParams } from "wouter";
import { useSpectator, isTossResult, type SpectatorSide } from "@/lib/spectator";
import {
  WatchQuestionPanel,
  type WatchQuestion,
  type WatchQuestionResult,
} from "@/components/watch/WatchQuestionPanel";
import { WatchTossPanel, type WatchToss, type WatchTossResult } from "@/components/watch/WatchTossPanel";
import { WatchTicker } from "@/components/watch/WatchTicker";

/**
 * Generic spectator page for any kind of live game (championship match, ad-hoc
 * team battle, rapid fire, or a future kind), addressed by kind + id rather
 * than a hardcoded route. WatchMatch.tsx stays as-is for the existing
 * championship deep links; this page is the one new kinds get for free.
 *
 * Deliberately does not use WatchHeader / WatchStage / WatchScoreboard: those
 * take championship-shaped props (logoUrl, scheduledLabel, a fixed two-team
 * video stage) that an ad-hoc battle does not have. The question and toss
 * panels are still shared, since spectators watch those the same way no
 * matter what kind of game is underneath.
 */
export default function WatchLive({ overlay = false }: { overlay?: boolean }) {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const { data, started, question, toss, result, readiness, sides, ended, error, loading } = useSpectator(
    kind,
    id,
  );

  // Same reasoning as WatchMatch: a browser source must never show an
  // application background over the broadcast, so the body class is scoped to
  // the lifetime of this page only.
  useEffect(() => {
    if (!overlay) return;
    document.body.classList.add("overlay-transparent");
    return () => document.body.classList.remove("overlay-transparent");
  }, [overlay]);

  const overlayBlank = <main className="min-h-screen bg-transparent" />;

  if (loading) {
    return overlay ? overlayBlank : (
      <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Loading…</div>
    );
  }

  if (error || !data) {
    return overlay ? overlayBlank : (
      <div className="min-h-screen bg-slate-950 text-white grid place-items-center">
        {error === "Not found" || !error ? "This game could not be found." : error}
      </div>
    );
  }

  const status = data.status;
  const sideList: SpectatorSide[] = sides ?? data.sides ?? [];
  const findSide = (sideId?: string | null) => sideList.find((s) => s.id === sideId);
  const winnerName = ended?.winnerSideId ? findSide(ended.winnerSideId)?.name ?? null : null;

  const questionForPanel: WatchQuestion | null = question
    ? {
        questionId: question.questionId,
        questionNumber: question.questionNumber,
        totalQuestions: question.totalQuestions ?? data.totalQuestions,
        questionText: question.questionText,
        options: question.options,
        answeringTeamId: question.answeringSideId,
        answeringTeamName: question.answeringSideName,
      }
    : null;

  // result never arrives before the fact: it is only ever set once the server
  // has already evaluated and committed the answer or the toss.
  const questionResultForPanel: WatchQuestionResult | null =
    result && !isTossResult(result) && questionForPanel
      ? {
          questionId: result.questionId ?? questionForPanel.questionId,
          selectedAnswerId: result.selectedAnswerId,
          correctAnswerId: result.correctAnswerId,
          isCorrect: result.isCorrect,
          pointsAwarded: result.pointsAwarded,
        }
      : null;

  const answeringSide = findSide(questionForPanel?.answeringTeamId);

  const tossForPanel: WatchToss | null = toss
    ? { questionId: toss.questionId, questionText: toss.questionText, options: toss.options }
    : null;

  const tossResultForPanel: WatchTossResult | null =
    result && isTossResult(result)
      ? {
          questionId: tossForPanel?.questionId,
          winnerTeamId: result.winnerSideId,
          winnerTeamName: result.winnerSideName,
          correctAnswerId: result.correctAnswerId,
        }
      : null;

  const tossWinnerSide = tossResultForPanel ? findSide(tossResultForPanel.winnerTeamId) : undefined;

  // Generic readiness copy: readiness is inherently a two-side signal (the
  // server names them sideAReady / sideBReady), so it is read against the
  // first two sides in the order the payload already lists them.
  const readinessCopy = (() => {
    const [sideA, sideB] = sideList;
    if (!readiness) return "Waiting for both sides to join…";
    if (readiness.sideAReady && readiness.sideBReady) return "Both sides are ready. Waiting for the game to start…";
    if (readiness.sideAReady) return `${sideA?.name ?? "One side"} is ready. Waiting for ${sideB?.name ?? "the other side"}…`;
    if (readiness.sideBReady) return `${sideB?.name ?? "One side"} is ready. Waiting for ${sideA?.name ?? "the other side"}…`;
    return "Waiting for both sides to join…";
  })();

  const questionRailBody = (() => {
    if (status === "finished") {
      return (
        <p className="m-auto text-center text-sm champ-meta">
          {ended?.isDraw ? "Result: draw." : winnerName ? `Winner: ${winnerName}.` : "This game has ended."}
        </p>
      );
    }
    if (status === "pending") {
      return <p className="m-auto text-center text-sm champ-meta">This game has not started yet.</p>;
    }
    // status === "live"
    if (tossForPanel) {
      return (
        <WatchTossPanel
          toss={tossForPanel}
          result={tossResultForPanel}
          winnerEmoticon={tossWinnerSide?.emoticon}
          winnerLogoUrl={tossWinnerSide?.logoUrl}
        />
      );
    }
    if (questionForPanel) {
      return (
        <WatchQuestionPanel
          question={questionForPanel}
          result={questionResultForPanel}
          teamEmoticon={answeringSide?.emoticon}
          teamLogoUrl={answeringSide?.logoUrl}
        />
      );
    }
    if (started) {
      return <p className="m-auto text-center text-sm champ-meta">Waiting for the next question…</p>;
    }
    return <p className="m-auto text-center text-sm champ-meta">{readinessCopy}</p>;
  })();

  if (overlay) {
    return (
      <main className="min-h-screen bg-transparent text-white p-8 flex items-end">
        <div className="w-full flex-wrap rounded-2xl bg-slate-950/85 border border-white/20 p-5 flex items-center justify-center gap-4 text-lg font-black sm:text-2xl">
          {sideList.map((side) => (
            <span key={side.id}>
              {side.name} <b className="text-cyan-300">{side.score}</b>
            </span>
          ))}
          <span className="basis-full text-center text-sm uppercase tracking-[.3em] text-red-400 sm:basis-auto">
            {questionForPanel?.questionNumber ? `Question ${questionForPanel.questionNumber}` : status}
          </span>
        </div>
      </main>
    );
  }

  const scoreLine = sideList.map((s) => `${s.name} ${s.score}`).join(" • ");
  const tickerItems = [
    data.title,
    status === "finished"
      ? `Final score ${scoreLine}`
      : status === "live"
        ? started
          ? `Live score ${scoreLine}`
          : "Waiting for the game to start"
        : "Scheduled to begin soon",
    ...(questionForPanel
      ? [questionForPanel.questionNumber ? `Question ${questionForPanel.questionNumber} in play` : "Question in play"]
      : []),
    ...(status === "finished" && winnerName ? [`Winner: ${winnerName}`] : []),
    ...(status === "finished" && ended?.isDraw ? ["Result: draw"] : []),
  ];

  return (
    <main className="champ-portal min-h-screen flex flex-col font-heading">
      <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <header className="flex flex-col items-center gap-1 text-center">
            <p className="champ-eyebrow">{kind}</p>
            <h1 className="text-lg font-black text-white sm:text-2xl">{data.title}</h1>
          </header>

          <section className="champ-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
              {sideList.map((side) => (
                <div key={side.id} className="flex min-w-[7rem] flex-col items-center gap-1 text-center">
                  <span className="text-sm font-bold text-white/80">{side.name}</span>
                  <span className="text-2xl font-black text-white tabular-nums">{side.score}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="watch-question-rail">
            <p className="watch-rail-heading">
              {status === "live" && <span className="watch-live-dot text-[#f0576a]" aria-hidden="true" />}
              Live question
            </p>
            <div className="champ-divider" />
            <div className="watch-question-body">{questionRailBody}</div>
          </section>
        </div>
      </div>

      <WatchTicker items={tickerItems} />
    </main>
  );
}
