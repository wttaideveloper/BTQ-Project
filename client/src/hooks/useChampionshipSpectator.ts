import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { onEvent, sendGameEvent, setupGameSocket } from "@/lib/socket";
import type { CommentaryEntry } from "@/components/watch/WatchCommentary";
import type { WatchQuestion, WatchQuestionResult } from "@/components/watch/WatchQuestionPanel";
import type { WatchToss, WatchTossResult } from "@/components/watch/WatchTossPanel";
import { appendBroadcastEvent } from "@/lib/championship-broadcast";
import { sanitizeChampionshipName } from "@/lib/championship-match-start-popup";

type MatchPayload = { match: any; teamA: any; teamB: any };

/**
 * Spectator-safe live championship state for the commentator desk.
 *
 * Same public GET and the same `watch_match` subscription as /watch.
 * No HLS, no reactions, no gameplay mutations.
 */
export function useChampionshipSpectator(matchId: string | undefined) {
  const { data, refetch, isLoading, isError } = useQuery<MatchPayload>({
    queryKey: ["/api/championship-matches", matchId],
    queryFn: () => fetch(`/api/championship-matches/${matchId}`).then(r => {
      if (!r.ok) throw new Error("Match not found");
      return r.json();
    }),
    enabled: !!matchId,
    refetchInterval: 15000,
  });

  const { data: championships } = useQuery<Array<{ id?: string; name?: string }>>({
    queryKey: ["/api/championships"],
    queryFn: () => fetch("/api/championships").then(r => r.json()),
  });

  const [events, setEvents] = useState<CommentaryEntry[]>([]);
  const [questionNumber, setQuestionNumber] = useState<number | null>(null);
  const [question, setQuestion] = useState<WatchQuestion | null>(null);
  const [questionResult, setQuestionResult] = useState<WatchQuestionResult | null>(null);
  const [gameplayStarted, setGameplayStarted] = useState(false);
  const [toss, setToss] = useState<WatchToss | null>(null);
  const [tossResult, setTossResult] = useState<WatchTossResult | null>(null);
  const [liveScores, setLiveScores] = useState<{ a: number; b: number } | null>(null);
  const lastScoreRef = useRef<{ a: number; b: number } | null>(null);
  const teamNamesRef = useRef({ a: "Team A", b: "Team B" });
  const currentQuestionIdRef = useRef<string | null>(null);
  currentQuestionIdRef.current = question?.questionId ?? null;

  useEffect(() => {
    if (!data?.match) return;
    if (!lastScoreRef.current) lastScoreRef.current = { a: data.match.teamAScore, b: data.match.teamBScore };
    teamNamesRef.current = { a: data.teamA?.name ?? "Team A", b: data.teamB?.name ?? "Team B" };
  }, [data?.match, data?.teamA?.name, data?.teamB?.name]);

  const log = (entry: Omit<CommentaryEntry, "id" | "at">) => {
    setEvents(current => appendBroadcastEvent(current, entry));
  };

  useEffect(() => {
    if (!matchId) return;
    setupGameSocket();
    sendGameEvent({ type: "watch_match", matchId });

    const offConnected = onEvent("connection_established", () => {
      sendGameEvent({ type: "watch_match", matchId });
      refetch();
    });
    const offUpdate = onEvent("match_updated", (e) => {
      if (e.match?.id !== matchId) return;
      const previous = lastScoreRef.current;
      const deltaA = e.match.teamAScore - (previous?.a ?? e.match.teamAScore);
      const deltaB = e.match.teamBScore - (previous?.b ?? e.match.teamBScore);
      lastScoreRef.current = { a: e.match.teamAScore, b: e.match.teamBScore };
      setLiveScores({ a: e.match.teamAScore, b: e.match.teamBScore });
      const gained =
        deltaA > 0
          ? { name: teamNamesRef.current.a, points: deltaA }
          : deltaB > 0
            ? { name: teamNamesRef.current.b, points: deltaB }
            : null;
      log({
        tone: "score",
        label: gained ? `${gained.name} +${gained.points}` : "Score update",
        detail: `${e.match.teamAScore} – ${e.match.teamBScore}`,
      });
      refetch();
    });
    const offStart = onEvent("match_started", (e) => {
      if (e.match?.id !== matchId) return;
      log({ tone: "live", label: "Match started" });
      refetch();
    });
    const offEnd = onEvent("match_ended", (e) => {
      if (e.match?.id !== matchId) return;
      log({
        tone: "final",
        label: "Match complete",
        detail: `Final score ${e.match.teamAScore} – ${e.match.teamBScore}`,
      });
      setQuestionNumber(null);
      setQuestion(null);
      setQuestionResult(null);
      setToss(null);
      setTossResult(null);
      setGameplayStarted(false);
      if (typeof e.match.teamAScore === "number") {
        setLiveScores({ a: e.match.teamAScore, b: e.match.teamBScore });
      }
      refetch();
    });
    const offQuestionStarted = onEvent("question_started", (e) => {
      if (e.matchId !== matchId) return;
      setGameplayStarted(true);
      if (e.questionNumber) {
        log({
          tone: "question",
          label: `Question ${e.questionNumber}`,
          detail: e.answeringTeamName ? `${e.answeringTeamName} is answering` : "In play",
        });
      }
      setQuestionNumber(e.questionNumber ?? null);
      setToss(null);
      setTossResult(null);
      setQuestionResult(null);
      setQuestion(
        e.questionId
          ? {
              questionId: e.questionId,
              questionNumber: e.questionNumber,
              totalQuestions: e.totalQuestions,
              questionText: e.questionText,
              options: Array.isArray(e.options) ? e.options : [],
              answeringTeamId: e.answeringTeamId,
              answeringTeamName: e.answeringTeamName,
            }
          : null,
      );
    });
    const offTossStarted = onEvent("toss_started", (e) => {
      if (e.matchId !== matchId) return;
      setTossResult(null);
      setGameplayStarted(true);
      setToss({
        questionId: e.questionId,
        questionText: e.questionText,
        options: Array.isArray(e.options) ? e.options : [],
      });
      log({ tone: "question", label: "Toss question", detail: "First correct answer wins the toss" });
    });
    const offTossResolved = onEvent("toss_resolved", (e) => {
      if (e.matchId !== matchId) return;
      setTossResult({
        questionId: e.questionId,
        winnerTeamId: e.winnerTeamId,
        winnerTeamName: e.winnerTeamName,
        firstTurnTeamName: e.firstTurnTeamName,
        correctAnswerId: e.correctAnswerId ?? null,
      });
      log({
        tone: "final",
        label: `${e.winnerTeamName ?? "Team"} won the toss`,
        detail: e.firstTurnTeamName ? `${e.firstTurnTeamName} answers first` : undefined,
      });
    });
    const offQuestionAnswered = onEvent("question_answered", (e) => {
      if (e.matchId !== matchId) return;
      if (currentQuestionIdRef.current && e.questionId !== currentQuestionIdRef.current) return;
      setQuestionResult({
        questionId: e.questionId,
        selectedAnswerId: e.selectedAnswerId ?? null,
        correctAnswerId: e.correctAnswerId ?? null,
        isCorrect: !!e.isCorrect,
        pointsAwarded: e.pointsAwarded ?? 0,
      });
      log({
        tone: e.isCorrect ? "final" : "question",
        label: `${e.answeringTeamName ?? "Team"} ${e.isCorrect ? "answered correctly" : "answered incorrectly"}`,
        detail: `+${e.pointsAwarded ?? 0} points`,
      });
    });
    const offQuestionEnded = onEvent("question_ended", (e) => {
      if (e.matchId === matchId) setQuestionNumber(null);
    });
    const offRestore = onEvent("match_state_restored", (e) => {
      if (e.matchId !== matchId) return;
      setQuestionNumber(e.currentQuestion?.questionNumber ?? null);
      setQuestionResult(null);
      setGameplayStarted(!!e.gameplayStarted);
      const restored = e.currentQuestion;
      setToss(
        restored?.isToss && Array.isArray(restored.options)
          ? { questionId: restored.questionId, questionText: restored.questionText, options: restored.options }
          : null,
      );
      setTossResult(null);
      setQuestion(
        !restored?.isToss && e.currentQuestion?.questionId && Array.isArray(e.currentQuestion.options)
          ? {
              questionId: e.currentQuestion.questionId,
              questionNumber: e.currentQuestion.questionNumber,
              totalQuestions: e.currentQuestion.totalQuestions,
              questionText: e.currentQuestion.questionText,
              options: e.currentQuestion.options,
              answeringTeamId: e.currentQuestion.answeringTeamId,
              answeringTeamName: e.currentQuestion.answeringTeamName,
            }
          : null,
      );
    });

    return () => {
      offConnected();
      offUpdate();
      offStart();
      offEnd();
      offQuestionStarted();
      offTossStarted();
      offTossResolved();
      offQuestionAnswered();
      offQuestionEnded();
      offRestore();
    };
  }, [matchId, refetch]);

  const championshipName = sanitizeChampionshipName(
    championships?.find(item => item.id === data?.match?.championshipId)?.name,
  );

  return {
    isLoading,
    isError,
    match: data?.match ?? null,
    teamA: data?.teamA ?? null,
    teamB: data?.teamB ?? null,
    championshipName,
    teamAScore: liveScores?.a ?? data?.match?.teamAScore ?? 0,
    teamBScore: liveScores?.b ?? data?.match?.teamBScore ?? 0,
    questionNumber: data?.match?.status === "live" ? questionNumber : null,
    question,
    questionResult,
    toss,
    tossResult,
    gameplayStarted,
    events,
  };
}
