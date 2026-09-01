import { useEffect, useState } from "react";
import { CalendarDays, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AutoScheduleStep = "format" | "settings" | "preview";

type PlannedMatch = {
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  scheduledAt: string;
};

type SkippedPair = {
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  reason: string;
};

type PreviewResponse = {
  summary: {
    teamCount: number;
    possibleMatches: number;
    newMatches: number;
    skippedMatches: number;
    minimumTeamRestMinutes: number;
    matchesPerDay: number;
  };
  matches: PlannedMatch[];
  skipped: SkippedPair[];
  errors: string[];
};

const DEFAULTS = {
  minimumTeamRestMinutes: 30,
  matchesPerDay: 1,
};

const formatLocalDateTime = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const formatPreviewKickoff = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time to be announced";
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
};

export function AutoScheduleDialog({
  open,
  onOpenChange,
  championshipId,
  championshipStatus,
  teamCount,
  endDate,
  autoStartEnabled = false,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  championshipId: string;
  championshipStatus: string;
  teamCount: number;
  endDate?: string | null;
  autoStartEnabled?: boolean;
  onCreated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<AutoScheduleStep>("format");
  const [startAt, setStartAt] = useState("");
  const [minimumTeamRestMinutes, setMinimumTeamRestMinutes] = useState(String(DEFAULTS.minimumTeamRestMinutes));
  const [matchesPerDay, setMatchesPerDay] = useState(String(DEFAULTS.matchesPerDay));
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const possibleMatches = teamCount >= 2 ? (teamCount * (teamCount - 1)) / 2 : 0;
  const minDateTime = formatLocalDateTime(new Date());
  const minimumRestValue = Number(minimumTeamRestMinutes);
  const perDayValue = Number(matchesPerDay);
  const settingsValid =
    !!startAt &&
    Number.isInteger(minimumRestValue) && minimumRestValue >= 0 &&
    Number.isInteger(perDayValue) && perDayValue >= 1;
  const canGenerate = !!preview && preview.errors.length === 0 && preview.matches.length > 0 && !creating;
  const allAlreadyScheduled = !!preview && preview.errors.length === 0 && preview.matches.length === 0;

  const payload = () => ({
    startAt,
    minimumTeamRestMinutes: minimumRestValue,
    matchesPerDay: perDayValue,
  });

  useEffect(() => {
    if (!open) return;
    setStep("format");
    setStartAt(formatLocalDateTime(new Date()));
    setMinimumTeamRestMinutes(String(DEFAULTS.minimumTeamRestMinutes));
    setMatchesPerDay(String(DEFAULTS.matchesPerDay));
    setPreview(null);
    setConfirmOpen(false);
    setPreviewing(false);
    setCreating(false);
  }, [open]);

  const close = () => {
    if (previewing || creating) return;
    onOpenChange(false);
  };

  const handlePreview = async () => {
    if (!settingsValid || previewing) return;
    setPreviewing(true);
    try {
      const response = await apiRequest("POST", `/api/championships/${championshipId}/auto-schedule/preview`, payload());
      const data: PreviewResponse = await response.json();
      setPreview(data);
      setStep("preview");
    } catch (error) {
      toast({
        title: "Could not generate preview",
        description: error instanceof Error ? error.message : "Please check the schedule settings",
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setCreating(true);
    try {
      const response = await apiRequest("POST", `/api/championships/${championshipId}/auto-schedule`, payload());
      const data: PreviewResponse & { created?: unknown[] } = await response.json();
      const count = data.created?.length ?? data.summary.newMatches;
      await onCreated();
      setConfirmOpen(false);
      onOpenChange(false);
      toast({
        title: `${count} match${count === 1 ? "" : "es"} scheduled successfully.`,
      });
    } catch (error) {
      toast({
        title: "Could not create schedule",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const autoStartCopy = autoStartEnabled
    ? "Matches will automatically start at their scheduled time."
    : "Matches are created as upcoming. An admin must start them manually.";

  return <>
    <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1.5 border-b p-4 text-left sm:p-6">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="text-amber-500" size={18} /> Auto Schedule
          </DialogTitle>
          <DialogDescription>
            {step === "format" && `Generate a Round Robin schedule. ${autoStartCopy}`}
            {step === "settings" && "Choose the first match time, team rest, and the daily match limit."}
            {step === "preview" && "Review the generated fixtures before they are created."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {step === "format" && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Format</p>
                <p className="mt-1 text-lg font-black text-slate-900">Round Robin</p>
                <p className="mt-1 text-sm text-slate-600">Every team plays every other team once.</p>
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {teamCount} team{teamCount === 1 ? "" : "s"} → {possibleMatches} match{possibleMatches === 1 ? "" : "es"}
              </p>
              {championshipStatus === "completed" && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Auto Schedule is not available for a completed championship.</p>
              )}
              {endDate && (
                <p className="text-xs text-slate-500">
                  Matches must fall on or before {new Date(endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
                </p>
              )}
            </div>
          )}

          {step === "settings" && (
            <div className="grid gap-4">
              <label className="text-sm font-semibold text-slate-800" htmlFor="auto-schedule-start">
                First match date and time
                <Input
                  id="auto-schedule-start"
                  className="mt-1 h-11 font-normal"
                  type="datetime-local"
                  min={minDateTime}
                  value={startAt}
                  onChange={event => { setStartAt(event.target.value); setPreview(null); }}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-800" htmlFor="auto-schedule-rest">
                  Minimum rest between matches (minutes)
                  <Input
                    id="auto-schedule-rest"
                    className="mt-1 h-11 font-normal"
                    type="number"
                    min={0}
                    max={1440}
                    inputMode="numeric"
                    value={minimumTeamRestMinutes}
                    onChange={event => { setMinimumTeamRestMinutes(event.target.value); setPreview(null); }}
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Teams will have at least this much time between their matches.</span>
                </label>
                <label className="text-sm font-semibold text-slate-800" htmlFor="auto-schedule-per-day">
                  Matches per day
                  <Input
                    id="auto-schedule-per-day"
                    className="mt-1 h-11 font-normal"
                    type="number"
                    min={1}
                    max={48}
                    inputMode="numeric"
                    value={matchesPerDay}
                    onChange={event => { setMatchesPerDay(event.target.value); setPreview(null); }}
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Maximum number of matches scheduled per day.</span>
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Fixtures are ordered to give teams rest and avoid consecutive appearances where another fixture can be played. Match completion still comes from normal gameplay; no match duration is estimated.
                {" "}{autoStartCopy}
              </p>
            </div>
          )}

          {step === "preview" && preview && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Auto Schedule Preview</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Teams", value: preview.summary.teamCount },
                    { label: "Possible", value: preview.summary.possibleMatches },
                    { label: "New", value: preview.summary.newMatches },
                    { label: "Skipped", value: preview.summary.skippedMatches },
                  ].map(stat => (
                    <div key={stat.label} className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-xl font-black text-slate-900">{stat.value}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Minimum team rest: {preview.summary.minimumTeamRestMinutes} min · Matches per day: {preview.summary.matchesPerDay}
                </p>
              </div>

              {preview.errors.length > 0 && (
                <div className="space-y-2" role="alert">
                  {preview.errors.map(error => (
                    <p key={error} className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>
                  ))}
                </div>
              )}

              {allAlreadyScheduled && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">All Round Robin matches are already scheduled.</p>
              )}

              {preview.matches.length > 0 && (
                <ol className="space-y-2">
                  {preview.matches.map((match, index) => (
                    <li key={`${match.teamAId}-${match.teamBId}`} className="rounded-xl border bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{index + 1}</p>
                      <p className="truncate font-semibold text-slate-900">
                        {match.teamAName} <span className="text-slate-400">vs</span> {match.teamBName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatPreviewKickoff(match.scheduledAt)}</p>
                    </li>
                  ))}
                </ol>
              )}

              {preview.skipped.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-700">Already scheduled — skipped</h4>
                  <ul className="mt-2 space-y-2">
                    {preview.skipped.map(pair => (
                      <li key={`${pair.teamAId}-${pair.teamBId}`} className="rounded-xl border border-dashed bg-slate-50 p-3">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {pair.teamAName} <span className="text-slate-400">vs</span> {pair.teamBName}
                        </p>
                        <p className="text-xs text-slate-500">Skipped</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t p-4 sm:p-6">
          {step === "format" && <>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              disabled={teamCount < 2 || championshipStatus === "completed"}
              onClick={() => setStep("settings")}
            >
              Continue
            </Button>
          </>}
          {step === "settings" && <>
            <Button variant="outline" disabled={previewing} onClick={() => setStep("format")}>Back</Button>
            <Button disabled={!settingsValid || previewing} onClick={handlePreview}>
              <CalendarDays size={16} />
              {previewing ? "Generating Preview…" : "Preview Schedule"}
            </Button>
          </>}
          {step === "preview" && <>
            <Button variant="outline" disabled={creating} onClick={() => setStep("settings")}>Back</Button>
            {!allAlreadyScheduled && (
              <Button disabled={!canGenerate} onClick={() => setConfirmOpen(true)}>
                {creating ? "Creating Schedule…" : "Generate Schedule"}
              </Button>
            )}
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmOpen} onOpenChange={openState => { if (!creating) setConfirmOpen(openState); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create {preview?.matches.length ?? 0} upcoming match{(preview?.matches.length ?? 0) === 1 ? "" : "es"}?</AlertDialogTitle>
          <AlertDialogDescription>
            These matches will be added to the championship schedule. {autoStartCopy}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={creating}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={creating} onClick={event => { event.preventDefault(); void handleGenerate(); }}>
            {creating ? "Creating Schedule…" : "Create Schedule"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
