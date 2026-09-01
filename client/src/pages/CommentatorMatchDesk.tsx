import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Check, Loader2, LogOut, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { onEvent, sendGameEvent, setupGameSocket } from "@/lib/socket";
import { FaithIQLockup } from "@/components/championship/game/FaithIQTreeMark";
import { TeamAvatar } from "@/components/championship/TeamAvatar";
import type { WatchQuestion, WatchQuestionOption, WatchQuestionResult } from "@/components/watch/WatchQuestionPanel";
import type { WatchToss, WatchTossResult } from "@/components/watch/WatchTossPanel";

type MatchPayload = {
  championship: { id: string; name: string; status: string };
  match: {
    id: string;
    status: string;
    teamAScore: number;
    teamBScore: number;
    winnerTeamId?: string | null;
  };
  teamA: { id: string; name: string; emoticon: string; logoUrl?: string | null } | null;
  teamB: { id: string; name: string; emoticon: string; logoUrl?: string | null } | null;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function possessive(name: string) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

export default function CommentatorMatchDesk() {
  const { matchId } = useParams<{ matchId: string }>();
  const [, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch } = useQuery<MatchPayload>({
    queryKey: ["/api/commentator/matches", matchId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/commentator/matches/${matchId}`);
      return response.json();
    },
    refetchInterval: 15_000,
  });

  const [gameplayStarted, setGameplayStarted] = useState(false);
  const [waitingForAdvance, setWaitingForAdvance] = useState(false);
  const [liveQuestion, setLiveQuestion] = useState<WatchQuestion | null>(null);
  const [questionResult, setQuestionResult] = useState<WatchQuestionResult | null>(null);
  const [toss, setToss] = useState<WatchToss | null>(null);
  const [tossResult, setTossResult] = useState<WatchTossResult | null>(null);
  const currentQuestionIdRef = useRef<string | null>(null);
  currentQuestionIdRef.current = liveQuestion?.questionId ?? null;

  useEffect(() => {
    setupGameSocket();
    sendGameEvent({ type: "watch_match", matchId });
    const offConnected = onEvent("connection_established", () => {
      sendGameEvent({ type: "watch_match", matchId });
      void refetch();
    });
    const offUpdate = onEvent("match_updated", event => {
      if (event.match?.id === matchId) void refetch();
    });
    const offStart = onEvent("match_started", event => {
      if (event.match?.id === matchId) void refetch();
    });
    const offEnd = onEvent("match_ended", event => {
      if (event.match?.id !== matchId) return;
      setGameplayStarted(false);
      setWaitingForAdvance(false);
      setLiveQuestion(null);
      setQuestionResult(null);
      setToss(null);
      void refetch();
    });
    const offQuestionStarted = onEvent("question_started", event => {
      if (event.matchId !== matchId) return;
      setGameplayStarted(true);
      setWaitingForAdvance(false);
      setToss(null);
      setTossResult(null);
      setQuestionResult(null);
      setLiveQuestion(
        event.questionId
          ? {
              questionId: event.questionId,
              questionNumber: event.questionNumber,
              totalQuestions: event.totalQuestions,
              questionText: event.questionText,
              options: Array.isArray(event.options) ? event.options : [],
              answeringTeamId: event.answeringTeamId,
              answeringTeamName: event.answeringTeamName,
            }
          : null,
      );
    });
    const offTossStarted = onEvent("toss_started", event => {
      if (event.matchId !== matchId) return;
      setGameplayStarted(true);
      setWaitingForAdvance(false);
      setTossResult(null);
      setToss({
        questionId: event.questionId,
        questionText: event.questionText,
        options: Array.isArray(event.options) ? event.options : [],
      });
    });
    const offTossResolved = onEvent("toss_resolved", event => {
      if (event.matchId !== matchId) return;
      setTossResult({
        questionId: event.questionId,
        winnerTeamId: event.winnerTeamId,
        winnerTeamName: event.winnerTeamName,
        firstTurnTeamName: event.firstTurnTeamName,
        correctAnswerId: event.correctAnswerId ?? null,
      });
    });
    const offQuestionAnswered = onEvent("question_answered", event => {
      if (event.matchId !== matchId) return;
      if (currentQuestionIdRef.current && event.questionId !== currentQuestionIdRef.current) return;
      setWaitingForAdvance(true);
      setQuestionResult({
        questionId: event.questionId,
        selectedAnswerId: event.selectedAnswerId ?? null,
        correctAnswerId: event.correctAnswerId ?? null,
        isCorrect: !!event.isCorrect,
        pointsAwarded: event.pointsAwarded ?? 0,
      });
    });
    const offRestore = onEvent("match_state_restored", event => {
      if (event.matchId !== matchId) return;
      setGameplayStarted(!!event.gameplayStarted);
      setWaitingForAdvance(!!event.waitingForAdvance);
      const restored = event.currentQuestion;
      setToss(
        restored?.isToss && Array.isArray(restored.options)
          ? { questionId: restored.questionId, questionText: restored.questionText, options: restored.options }
          : null,
      );
      setTossResult(null);
      setLiveQuestion(
        !restored?.isToss && restored?.questionId && Array.isArray(restored.options)
          ? {
              questionId: restored.questionId,
              questionNumber: restored.questionNumber,
              totalQuestions: restored.totalQuestions,
              questionText: restored.questionText,
              options: restored.options,
              answeringTeamId: restored.answeringTeamId,
              answeringTeamName: restored.answeringTeamName,
            }
          : null,
      );
      const last = event.lastResult;
      setQuestionResult(
        last && last.questionId && last.questionId === restored?.questionId
          ? {
              questionId: last.questionId,
              selectedAnswerId: last.selectedAnswerId ?? null,
              correctAnswerId: last.correctAnswerId ?? null,
              isCorrect: !!last.isCorrect,
              pointsAwarded: last.pointsAwarded ?? 0,
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
      offRestore();
    };
  }, [matchId, refetch]);

  const nextQuestion = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/commentator/matches/${matchId}/next-question`);
      return response.json();
    },
    onError: (error: Error) => {
      toast({ title: "Could not send next question", description: error.message, variant: "destructive" });
    },
  });

  const status = data?.match.status ?? "upcoming";
  const isLive = status === "live";
  const isCompleted = status === "completed";
  const resolved = questionResult && liveQuestion && questionResult.questionId === liveQuestion.questionId
    ? questionResult
    : null;
  const isToss = !!toss;
  const isFinalQuestion = !!liveQuestion?.totalQuestions
    && !!liveQuestion.questionNumber
    && liveQuestion.questionNumber >= liveQuestion.totalQuestions;
  const canAdvance = isLive
    && gameplayStarted
    && !isToss
    && !!resolved
    && waitingForAdvance
    && !isFinalQuestion
    && !nextQuestion.isPending;

  const phaseLabel = useMemo(() => {
    if (isCompleted) return "Match complete";
    if (!isLive) return "Waiting for match";
    if (!gameplayStarted) return "Waiting for captains to start";
    if (isToss) return tossResult ? "Toss resolved" : "Toss in progress";
    if (nextQuestion.isPending) return "Sending next question…";
    if (resolved && isFinalQuestion) return "Final result — match completing";
    if (resolved && waitingForAdvance) return "Result shown — waiting for you";
    if (liveQuestion) return `${liveQuestion.answeringTeamName || "A team"} is answering…`;
    return "Waiting for the next question";
  }, [isCompleted, isLive, gameplayStarted, isToss, tossResult, nextQuestion.isPending, resolved, isFinalQuestion, waitingForAdvance, liveQuestion]);

  const answeringTeam = liveQuestion?.answeringTeamId === data?.teamA?.id
    ? data?.teamA ?? null
    : liveQuestion?.answeringTeamId === data?.teamB?.id
      ? data?.teamB ?? null
      : null;

  if (isLoading) {
    return (
      <main className="champ-portal grid min-h-screen place-items-center text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  if (isError || !data) {
    const inactiveChampionship = error instanceof Error
      && /championship is not active/i.test(error.message);
    return (
      <main className="champ-portal grid min-h-screen place-items-center px-4 text-center text-white">
        <div>
          <p className="text-lg font-bold">
            {inactiveChampionship ? "This championship is not active." : "This championship match was not found"}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {inactiveChampionship
              ? "The commentator desk only covers matches in the currently active championship."
              : "It may have been removed, or the link is incorrect."}
          </p>
          <Button className="mt-6" variant="outline" onClick={() => setLocation("/commentator")}>Back to desk</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="champ-portal min-h-screen font-heading lg:h-screen lg:overflow-hidden">
      <header className="border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setLocation("/commentator")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <FaithIQLockup compact />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-white/50 sm:inline">{user?.username}</span>
            <Button
              variant="ghost"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => setLocation("/commentator/login") })}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:h-[calc(100vh-4.25rem)] lg:overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f0d58a]">
              <Mic className="h-3.5 w-3.5" />
              FaithIQ Commentator
            </p>
            <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">{data.championship.name}</h1>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
            isLive ? "border-red-400/50 bg-red-500/15 text-red-200" : isCompleted ? "border-white/20 bg-white/10 text-white/70" : "border-white/15 bg-white/5 text-white/55"
          }`}>
            Match status: {status}
          </span>
        </div>

        <div className="grid items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[1fr_auto_1fr] sm:p-5">
          <TeamScore team={data.teamA} score={data.match.teamAScore} active={liveQuestion?.answeringTeamId === data.teamA?.id} align="left" winner={isCompleted && data.match.winnerTeamId === data.teamA?.id} />
          <div className="text-center">
            <p className="text-3xl font-black tabular-nums text-white sm:text-5xl">
              {data.match.teamAScore} <span className="text-white/30">:</span> {data.match.teamBScore}
            </p>
          </div>
          <TeamScore team={data.teamB} score={data.match.teamBScore} active={liveQuestion?.answeringTeamId === data.teamB?.id} align="right" winner={isCompleted && data.match.winnerTeamId === data.teamB?.id} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          {isCompleted ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Match complete</p>
                <p className="mt-3 text-3xl font-black text-white">
                  {data.match.winnerTeamId
                    ? `${data.match.winnerTeamId === data.teamA?.id ? data.teamA?.name : data.teamB?.name} wins`
                    : "Draw"}
                </p>
                <p className="mt-2 text-lg font-bold text-[#f0d58a]">
                  Final score {data.match.teamAScore} : {data.match.teamBScore}
                </p>
              </div>
            </div>
          ) : isToss ? (
            <TossBoard toss={toss} result={tossResult} />
          ) : liveQuestion ? (
            <QuestionBoard
              question={liveQuestion}
              result={resolved}
              answeringTeam={answeringTeam}
            />
          ) : (
            <div className="grid h-full min-h-[12rem] place-items-center text-center text-white/55">
              <p className="text-base font-semibold">{phaseLabel}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:flex sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Status</p>
            <p className="mt-1 text-base font-bold text-white">{phaseLabel}</p>
            {resolved && liveQuestion?.answeringTeamName && (
              <p className={`mt-1 text-sm font-semibold ${resolved.isCorrect ? "text-emerald-300" : "text-red-300"}`}>
                {liveQuestion.answeringTeamName} answered {resolved.isCorrect ? "correctly" : "incorrectly"}
                {resolved.isCorrect ? ` · +${resolved.pointsAwarded} points` : ""}
              </p>
            )}
          </div>
          {isFinalQuestion && resolved ? null : (
            <Button
              className="mt-4 h-14 w-full bg-accent text-lg font-black text-primary hover:bg-accent/90 disabled:opacity-40 sm:mt-0 sm:w-auto sm:min-w-[220px]"
              disabled={!canAdvance}
              onClick={() => nextQuestion.mutate()}
            >
              {nextQuestion.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {nextQuestion.isPending ? "Sending…" : "Next question"}
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}

function TeamScore({
  team,
  score,
  active,
  align,
  winner,
}: {
  team: MatchPayload["teamA"];
  score: number;
  active: boolean;
  align: "left" | "right";
  winner: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <TeamAvatar logoUrl={team?.logoUrl} emoticon={team?.emoticon ?? "👏"} alt={`${team?.name ?? "Team"} logo`} className="h-12 w-12 text-3xl sm:h-14 sm:w-14" />
      <div className="min-w-0">
        <p className={`truncate text-sm font-bold sm:text-lg ${active ? "text-[#f0d58a]" : "text-white"}`}>
          {team?.name ?? "—"}
          {winner ? " · Winner" : ""}
        </p>
        <p className="text-2xl font-black tabular-nums text-white/80 sm:hidden">{score}</p>
      </div>
    </div>
  );
}

function QuestionBoard({
  question,
  result,
  answeringTeam,
}: {
  question: WatchQuestion;
  result: WatchQuestionResult | null;
  answeringTeam: MatchPayload["teamA"];
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {question.questionNumber && (
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/70">
            Question {question.questionNumber}{question.totalQuestions ? ` / ${question.totalQuestions}` : ""}
          </span>
        )}
        {question.answeringTeamName && (
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
            result ? "border-white/15 bg-white/5 text-white/70" : "border-[#d4af37]/50 bg-[#d4af37]/12 text-[#f0d58a]"
          }`}>
            <TeamAvatar logoUrl={answeringTeam?.logoUrl} emoticon={answeringTeam?.emoticon ?? "👏"} alt="" className="h-5 w-5 text-base" />
            {possessive(question.answeringTeamName)} turn
          </span>
        )}
      </div>
      <p className="mt-4 text-center text-xl font-black leading-snug text-white sm:text-2xl lg:text-3xl">
        {question.questionText}
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {question.options.map((option, index) => (
          <OptionCard key={option.id} option={option} letter={LETTERS[index] ?? String(index + 1)} result={result} />
        ))}
      </div>
    </div>
  );
}

function TossBoard({ toss, result }: { toss: WatchToss; result: WatchTossResult | null }) {
  return (
    <div>
      <p className="text-center text-[11px] font-black uppercase tracking-[0.2em] text-[#f0d58a]">Toss question</p>
      <p className="mt-3 text-center text-xl font-black text-white sm:text-2xl">{toss.questionText}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {toss.options.map((option, index) => (
          <OptionCard
            key={option.id}
            option={option}
            letter={LETTERS[index] ?? String(index + 1)}
            result={result?.correctAnswerId ? { questionId: toss.questionId ?? "", selectedAnswerId: null, correctAnswerId: result.correctAnswerId, isCorrect: true, pointsAwarded: 0 } : null}
          />
        ))}
      </div>
      {result?.winnerTeamName && (
        <p className="mt-4 text-center text-sm font-bold text-[#f0d58a]">
          {result.winnerTeamName} won the toss and takes the first turn
        </p>
      )}
    </div>
  );
}

function OptionCard({
  option,
  letter,
  result,
}: {
  option: WatchQuestionOption;
  letter: string;
  result: WatchQuestionResult | null;
}) {
  const isCorrect = !!result && result.correctAnswerId === option.id;
  const isSelected = !!result && result.selectedAnswerId === option.id;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${
      isCorrect
        ? "border-emerald-400/50 bg-emerald-500/15"
        : isSelected
          ? "border-red-400/40 bg-red-500/10"
          : "border-white/12 bg-white/[0.04]"
    }`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/20 text-sm font-black text-white">
        {letter}
      </span>
      <p className="pt-1 text-sm font-semibold text-white sm:text-base">{option.text}</p>
      {isCorrect && <Check className="ml-auto h-5 w-5 shrink-0 text-emerald-300" />}
    </div>
  );
}
