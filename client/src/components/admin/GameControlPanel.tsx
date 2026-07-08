import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import {
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_LIMITS,
  formatDurationOptionsLabel,
  formatQuestionBasedSummary,
  normalizeDurationOptions,
  normalizeGameSettings,
  type GameSettingsConfig,
} from "@shared/game-settings";
import { RefreshCw, Save, Eye } from "lucide-react";

function durationOptionsToInput(options: number[]): string {
  return options.join(", ");
}

export function GameControlPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: savedSettings, isLoading, isError, refetch, isFetching } =
    useQuery<GameSettingsConfig>({
      queryKey: ["/api/admin/game-settings"],
      queryFn: getQueryFn({ on401: "throw" }),
    });

  const [form, setForm] = useState<GameSettingsConfig>(DEFAULT_GAME_SETTINGS);
  const [durationOptionsInput, setDurationOptionsInput] = useState(
    durationOptionsToInput(DEFAULT_GAME_SETTINGS.timeBasedDurationOptions)
  );

  useEffect(() => {
    if (!savedSettings) return;
    setForm(savedSettings);
    setDurationOptionsInput(
      durationOptionsToInput(savedSettings.timeBasedDurationOptions)
    );
  }, [savedSettings]);

  const preview = useMemo(() => {
    const normalized = normalizeGameSettings({
      ...form,
      timeBasedDurationOptions: normalizeDurationOptions(
        durationOptionsInput.split(",").map((part) => parseInt(part.trim(), 10))
      ),
    });

    return {
      questionBased: formatQuestionBasedSummary(normalized),
      timeBased: formatDurationOptionsLabel(normalized.timeBasedDurationOptions),
      multiplayer: `${normalized.minPlayersPerGame}–${normalized.maxPlayersPerGame} players per game`,
      defaultDuration: `${normalized.defaultTimeBasedDuration} min default timer`,
    };
  }, [form, durationOptionsInput]);

  const saveMutation = useMutation({
    mutationFn: async (payload: GameSettingsConfig) => {
      const res = await apiRequest("PUT", "/api/admin/game-settings", payload);
      return (await res.json()) as GameSettingsConfig;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/admin/game-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/game/settings"] });
      setForm(data);
      setDurationOptionsInput(
        durationOptionsToInput(data.timeBasedDurationOptions)
      );
      toast({
        title: "Game settings saved",
        description: "Players will see the updated rules on their next game.",
      });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description:
          error instanceof Error ? error.message : "Could not save game settings.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const durationOptions = normalizeDurationOptions(
      durationOptionsInput.split(",").map((part) => parseInt(part.trim(), 10))
    );

    if (durationOptions.length === 0) {
      toast({
        title: "Invalid duration options",
        description: "Enter at least one round duration (e.g. 5, 10, 15).",
        variant: "destructive",
      });
      return;
    }

    const payload = normalizeGameSettings({
      ...form,
      timeBasedDurationOptions: durationOptions,
    });

    saveMutation.mutate(payload);
  };

  const updateNumber = (
    key: keyof GameSettingsConfig,
    value: string,
    limits: { min: number; max: number }
  ) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    setForm((prev) =>
      normalizeGameSettings({
        ...prev,
        [key]: Math.min(limits.max, Math.max(limits.min, parsed)),
      })
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-12 text-center">
          <p className="text-gray-600 font-medium">Failed to load game settings</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Game Control</h2>
          <p className="text-sm text-gray-500">
            Tune rules that players see in setup and during gameplay
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="border border-blue-100 bg-blue-50/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-blue-900">
            <Eye className="h-4 w-4" />
            Player preview
          </CardTitle>
          <CardDescription className="text-blue-700/80">
            What users will see when starting a game
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-blue-900">
          <p>
            <span className="font-medium">Question mode:</span> {preview.questionBased}
          </p>
          <p>
            <span className="font-medium">Time mode:</span> {preview.timeBased}
          </p>
          <p>
            <span className="font-medium">Multiplayer:</span> {preview.multiplayer}
          </p>
          <p>
            <span className="font-medium">Default timer:</span> {preview.defaultDuration}
          </p>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Game Settings</CardTitle>
          <CardDescription>
            Changes apply platform-wide for all new games
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Time per Question (seconds)
              </label>
              <Input
                type="number"
                value={form.timePerQuestion}
                min={GAME_SETTINGS_LIMITS.timePerQuestion.min}
                max={GAME_SETTINGS_LIMITS.timePerQuestion.max}
                onChange={(e) =>
                  updateNumber(
                    "timePerQuestion",
                    e.target.value,
                    GAME_SETTINGS_LIMITS.timePerQuestion
                  )
                }
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Countdown shown on each question card
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Questions per Game
              </label>
              <Input
                type="number"
                value={form.questionsPerGame}
                min={GAME_SETTINGS_LIMITS.questionsPerGame.min}
                max={GAME_SETTINGS_LIMITS.questionsPerGame.max}
                onChange={(e) =>
                  updateNumber(
                    "questionsPerGame",
                    e.target.value,
                    GAME_SETTINGS_LIMITS.questionsPerGame
                  )
                }
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Multiplayer rounds adjust upward so every player gets equal turns
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Time-Based Round Options (minutes)
              </label>
              <Input
                type="text"
                value={durationOptionsInput}
                onChange={(e) => setDurationOptionsInput(e.target.value)}
                placeholder="5, 10, 15"
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated choices shown in time-based setup
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Default Time-Based Duration (minutes)
              </label>
              <Input
                type="number"
                value={form.defaultTimeBasedDuration}
                min={GAME_SETTINGS_LIMITS.timeBasedDuration.min}
                max={GAME_SETTINGS_LIMITS.timeBasedDuration.max}
                onChange={(e) =>
                  updateNumber(
                    "defaultTimeBasedDuration",
                    e.target.value,
                    GAME_SETTINGS_LIMITS.timeBasedDuration
                  )
                }
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Pre-selected timer when players open time-based mode
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Min Players per Game
              </label>
              <Input
                type="number"
                value={form.minPlayersPerGame}
                min={GAME_SETTINGS_LIMITS.maxPlayersPerGame.min}
                max={form.maxPlayersPerGame}
                onChange={(e) =>
                  updateNumber(
                    "minPlayersPerGame",
                    e.target.value,
                    {
                      min: GAME_SETTINGS_LIMITS.maxPlayersPerGame.min,
                      max: form.maxPlayersPerGame,
                    }
                  )
                }
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Max Players per Game
              </label>
              <Input
                type="number"
                value={form.maxPlayersPerGame}
                min={form.minPlayersPerGame}
                max={GAME_SETTINGS_LIMITS.maxPlayersPerGame.max}
                onChange={(e) =>
                  updateNumber(
                    "maxPlayersPerGame",
                    e.target.value,
                    {
                      min: form.minPlayersPerGame,
                      max: GAME_SETTINGS_LIMITS.maxPlayersPerGame.max,
                    }
                  )
                }
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Controls the player count selector in Play with Friends
              </p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 shadow-sm flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
