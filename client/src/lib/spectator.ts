import { useEffect, useRef, useState } from "react";
import { onEvent, sendGameEvent, setupGameSocket } from "@/lib/socket";

/**
 * Generic spectator data layer for /live/:kind/:id.
 *
 * This mirrors the pattern WatchMatch.tsx uses for championships, but keeps
 * "kind" as data instead of hardcoding it, so a single page and a single hook
 * serve championship matches, ad-hoc team battles, rapid fire, and whatever
 * comes after. Framework-light on purpose (no JSX) so it can be reused by any
 * future spectator surface, not just the page built alongside it.
 */

export interface SpectatorOption {
  id: string;
  text: string;
}

export interface SpectatorSide {
  id: string;
  name: string;
  score: number;
  emoticon?: string;
  logoUrl?: string;
}

export interface SpectatorPayload {
  kind: string;
  id: string;
  title: string;
  status: "pending" | "live" | "finished";
  sides: SpectatorSide[];
  totalQuestions?: number;
}

export interface SpectatorQuestion {
  questionId: string;
  questionNumber?: number;
  totalQuestions?: number;
  questionText?: string;
  options: SpectatorOption[];
  answeringSideId?: string;
  answeringSideName?: string;
}

export interface SpectatorToss {
  questionId: string;
  questionText?: string;
  options: SpectatorOption[];
}

/** Shape of spectator_answered, once the answering side's answer is settled. */
export interface SpectatorAnsweredResult {
  questionId?: string;
  questionNumber?: number;
  answeringSideId?: string;
  answeringSideName?: string;
  selectedAnswerId: string;
  correctAnswerId: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

/** Shape of spectator_toss_resolved, once a toss winner has been committed. */
export interface SpectatorTossResolvedResult {
  winnerSideId: string;
  winnerSideName: string;
  correctAnswerId: string;
}

// The server's spectator_restored event carries one "result" field that is
// shaped like whichever of the two above was last in play, so the hook keeps
// the same single slot rather than inventing two.
export type SpectatorResult = SpectatorAnsweredResult | SpectatorTossResolvedResult;

/** A toss result has no `pointsAwarded` field; an answered result always does. */
export function isTossResult(result: SpectatorResult): result is SpectatorTossResolvedResult {
  return !("pointsAwarded" in result);
}

export interface SpectatorReadiness {
  sideAReady: boolean;
  sideBReady: boolean;
}

export interface SpectatorEnded {
  sides?: SpectatorSide[];
  winnerSideId: string | null;
  isDraw: boolean;
}

export interface SpectatorState {
  data: SpectatorPayload | null;
  started: boolean;
  question: SpectatorQuestion | null;
  toss: SpectatorToss | null;
  result: SpectatorResult | null;
  readiness: SpectatorReadiness | null;
  sides: SpectatorSide[] | null;
  ended: SpectatorEnded | null;
  error: string | null;
  loading: boolean;
}

function matchesTarget(e: any, kind: string, id: string): boolean {
  return e?.kind === kind && e?.id === id;
}

export function useSpectator(kind: string, id: string): SpectatorState {
  const [data, setData] = useState<SpectatorPayload | null>(null);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState<SpectatorQuestion | null>(null);
  const [toss, setToss] = useState<SpectatorToss | null>(null);
  const [result, setResult] = useState<SpectatorResult | null>(null);
  const [readiness, setReadiness] = useState<SpectatorReadiness | null>(null);
  const [sides, setSides] = useState<SpectatorSide[] | null>(null);
  const [ended, setEnded] = useState<SpectatorEnded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Stale-guard, same reasoning as WatchMatch: a late spectator_answered for a
  // question already replaced on screen must never paint over the newer one.
  const currentQuestionIdRef = useRef<string | null>(null);
  currentQuestionIdRef.current = question?.questionId ?? null;

  useEffect(() => {
    let cancelled = false;

    // Fresh target: drop whatever the previous kind/id left behind rather than
    // showing it while the new snapshot loads.
    setData(null);
    setStarted(false);
    setQuestion(null);
    setToss(null);
    setResult(null);
    setReadiness(null);
    setSides(null);
    setEnded(null);
    setError(null);
    setLoading(true);

    const load = () => {
      fetch(`/api/spectate/${kind}/${id}`)
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => null);
            throw new Error(body?.message || "Not found");
          }
          return r.json() as Promise<SpectatorPayload>;
        })
        .then((payload) => {
          if (cancelled) return;
          setData(payload);
          setSides(payload.sides ?? null);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Not found");
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
    };
    load();

    setupGameSocket();
    const subscribe = () => sendGameEvent({ type: "spectate", kind, id } as any);
    subscribe();

    // Re-subscribe after a dropped connection. A reconnect creates a brand new
    // server-side client with no spectate subscription, so without this a
    // viewer who blipped would silently stop receiving events for good. The
    // refetch closes the gap in score/status that opened while disconnected.
    const offConnected = onEvent("connection_established", () => {
      subscribe();
      load();
    });

    const offRestored = onEvent("spectator_restored", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      setStarted(!!e.started);
      setQuestion(e.question ?? null);
      setToss(e.toss ?? null);
      setResult(e.result ?? null);
      setReadiness(e.readiness ?? null);
      if (e.sides) setSides(e.sides);
    });

    const offStarted = onEvent("spectator_started", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      setStarted(true);
      if (e.sides) setSides(e.sides);
    });

    const offQuestion = onEvent("spectator_question", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      // A new question always clears the previous toss and result, so a late
      // result for whatever just finished can never paint over this one.
      setToss(null);
      setResult(null);
      setQuestion({
        questionId: e.questionId,
        questionNumber: e.questionNumber,
        totalQuestions: e.totalQuestions,
        questionText: e.questionText,
        options: Array.isArray(e.options) ? e.options : [],
        answeringSideId: e.answeringSideId,
        answeringSideName: e.answeringSideName,
      });
    });

    const offAnswered = onEvent("spectator_answered", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      if (e.questionId && currentQuestionIdRef.current && e.questionId !== currentQuestionIdRef.current) return;
      setResult({
        questionId: e.questionId,
        questionNumber: e.questionNumber,
        answeringSideId: e.answeringSideId,
        answeringSideName: e.answeringSideName,
        selectedAnswerId: e.selectedAnswerId,
        correctAnswerId: e.correctAnswerId,
        isCorrect: !!e.isCorrect,
        pointsAwarded: e.pointsAwarded ?? 0,
      });
    });

    const offQuestionEnded = onEvent("spectator_question_ended", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      if (!e.questionId || e.questionId === currentQuestionIdRef.current) setQuestion(null);
    });

    const offToss = onEvent("spectator_toss", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      setQuestion(null);
      setResult(null);
      setToss({
        questionId: e.questionId,
        questionText: e.questionText,
        options: Array.isArray(e.options) ? e.options : [],
      });
    });

    const offTossResolved = onEvent("spectator_toss_resolved", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      setResult({
        winnerSideId: e.winnerSideId,
        winnerSideName: e.winnerSideName,
        correctAnswerId: e.correctAnswerId,
      });
    });

    const offReadiness = onEvent("spectator_readiness", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      setReadiness({ sideAReady: !!e.sideAReady, sideBReady: !!e.sideBReady });
    });

    const offScore = onEvent("spectator_score", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      if (Array.isArray(e.sides)) setSides(e.sides);
    });

    const offEnded = onEvent("spectator_ended", (e) => {
      if (!matchesTarget(e, kind, id)) return;
      if (Array.isArray(e.sides)) setSides(e.sides);
      setEnded({ sides: e.sides, winnerSideId: e.winnerSideId ?? null, isDraw: !!e.isDraw });
      // The game is over: neither a question nor a toss is still in play.
      setQuestion(null);
      setToss(null);
    });

    return () => {
      cancelled = true;
      offConnected();
      offRestored();
      offStarted();
      offQuestion();
      offAnswered();
      offQuestionEnded();
      offToss();
      offTossResolved();
      offReadiness();
      offScore();
      offEnded();
    };
  }, [kind, id]);

  return { data, started, question, toss, result, readiness, sides, ended, error, loading };
}
