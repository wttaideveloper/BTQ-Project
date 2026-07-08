import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  formatDurationOptionsLabel,
  formatQuestionBasedSummary,
  parseTimeBasedDurationMinutes,
  resolveDefaultTimeBasedDuration,
  resolveTimeBasedDurationOptions,
  type TimeBasedDurationMinutes,
} from "@/lib/game-config";
import { useGameSettings } from "@/hooks/use-game-settings";
import {
  Users,
  X,
  ArrowLeft,
  Play,
  Smartphone,
  Clock,
  ListChecks,
} from "lucide-react";

export interface GameConfig {
  gameMode: "single" | "multi";
  gameType: "question" | "time";
  category: string;
  difficulty: string;
  playerCount?: number;
  gameId?: string;
  playerNames?: string[];
  multiplayerType?: "realtime" | "async" | "teams";
  gameDuration?: number;
}

interface GameSetupProps {
  onStartGame: (config: GameConfig) => void;
  onClose?: () => void;
}

const radioClass =
  "h-5 w-5 shrink-0 border-2 border-white/60 text-accent focus-visible:ring-accent data-[state=checked]:border-accent";

const PLAYER_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-lime-500",
];

const GameSetup: React.FC<GameSetupProps> = ({ onStartGame, onClose }) => {
  const { settings, refetch: refetchGameSettings } = useGameSettings();
  const durationOptions = resolveTimeBasedDurationOptions(
    settings.timeBasedDurationOptions
  );

  useEffect(() => {
    void refetchGameSettings();
  }, [refetchGameSettings]);
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const initialGameType =
    (params.get("gameType") as "question" | "time") || "question";
  const initialCategory = params.get("category") || "All Categories";
  const initialDifficulty = params.get("difficulty") || "Beginner";
  const initialGameDuration = parseTimeBasedDurationMinutes(
    params.get("gameDuration"),
    durationOptions,
    settings.defaultTimeBasedDuration
  ) as TimeBasedDurationMinutes;

  const { user } = useAuth();
  const { toast } = useToast();

  const [gameType, setGameType] = useState<"question" | "time">(initialGameType);
  const [category, setCategory] = useState(initialCategory);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [gameDuration, setGameDuration] = useState<TimeBasedDurationMinutes>(
    durationOptions.includes(initialGameDuration)
      ? initialGameDuration
      : resolveDefaultTimeBasedDuration(durationOptions, settings.defaultTimeBasedDuration)
  );
  const [playerCount, setPlayerCount] = useState(
    Math.min(settings.maxPlayersPerGame, Math.max(settings.minPlayersPerGame, 2))
  );
  const [playerNames, setPlayerNames] = useState(() =>
    Array.from({ length: settings.maxPlayersPerGame }, (_, index) => `Player ${index + 1}`)
  );

  useEffect(() => {
    setPlayerNames((prev) => {
      if (prev.length >= settings.maxPlayersPerGame) {
        return prev.slice(0, settings.maxPlayersPerGame);
      }
      return [
        ...prev,
        ...Array.from(
          { length: settings.maxPlayersPerGame - prev.length },
          (_, index) => `Player ${prev.length + index + 1}`
        ),
      ];
    });
  }, [settings.maxPlayersPerGame]);

  useEffect(() => {
    setPlayerCount((current) =>
      Math.min(settings.maxPlayersPerGame, Math.max(settings.minPlayersPerGame, current))
    );
  }, [settings.maxPlayersPerGame, settings.minPlayersPerGame]);

  useEffect(() => {
    if (!durationOptions.includes(gameDuration)) {
      setGameDuration(resolveDefaultTimeBasedDuration(durationOptions, settings.defaultTimeBasedDuration));
    }
  }, [durationOptions, gameDuration, settings.defaultTimeBasedDuration]);

  const playerCountOptions = Array.from(
    { length: settings.maxPlayersPerGame - settings.minPlayersPerGame + 1 },
    (_, index) => settings.minPlayersPerGame + index
  );

  const questionBasedSummary = formatQuestionBasedSummary(settings);
  const timeBasedSummary = `Speed round — ${formatDurationOptionsLabel(durationOptions)}`;

  useEffect(() => {
    setGameType(initialGameType);
    setCategory(initialCategory);
    setDifficulty(initialDifficulty);
  }, [initialGameType, initialCategory, initialDifficulty]);

  useEffect(() => {
    if (user?.username) {
      setPlayerNames((prev) => [user.username, ...prev.slice(1)]);
    }
  }, [user]);

  useEffect(() => {
    sessionStorage.removeItem("currentGameId");
    sessionStorage.removeItem("questionRead");
  }, []);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.location.href = "/";
    }
  };

  const handleStartGame = () => {
    const names = playerNames.slice(0, playerCount);
    const emptyNames = names.some((name) => !name?.trim());

    if (emptyNames) {
      toast({
        title: "Missing player names",
        description: "Please enter a name for each player before starting.",
        variant: "destructive",
      });
      return;
    }

    sessionStorage.clear();

    onStartGame({
      gameMode: "multi",
      gameType,
      category,
      difficulty,
      playerCount,
      playerNames: names.map((n) => n.trim()),
      multiplayerType: "realtime",
      ...(gameType === "time" ? { gameDuration } : {}),
    });
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black/80 via-primary-dark/80 to-secondary-dark/80 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:py-4 md:py-6 sm:px-4">
      <div className="bg-gradient-to-b from-[#1e2445] to-[#161b35] rounded-none sm:rounded-xl md:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-3xl mx-auto my-auto sm:max-h-[95vh] md:max-h-[90vh] flex flex-col overflow-hidden border-0 sm:border border-white/20">
        {/* Header — same shell size as Team Battle Setup */}
        <div className="bg-gradient-to-r from-[#1a2038] via-[#1e2445] to-teal-900/50 p-3 sm:p-4 md:p-6 relative overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />
          <div className="relative z-10 flex justify-between items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-1.5 sm:gap-2 text-white hover:bg-white/20 transition-all duration-200 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="font-medium">Home</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 sm:p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative z-10 text-center mt-2 sm:mt-3 md:mt-4">
            <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-teal-500/20 text-teal-400 mb-2 sm:mb-3">
              <Users className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-heading font-extrabold text-white mb-1 sm:mb-2 tracking-tight">
              Play with Friends
            </h1>
            <p className="text-white/80 text-xs sm:text-sm md:text-base font-medium px-2">
              Pass the device and take turns — up to {settings.maxPlayersPerGame}{" "}
              players on one screen
            </p>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 p-3 sm:p-4 md:p-6 pb-6 sm:pb-8 space-y-4 sm:space-y-5"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
        >
          <div className="flex gap-3 p-3 sm:p-4 rounded-xl bg-accent/10 border border-accent/20">
            <Smartphone className="h-5 w-5 text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-white/80 leading-relaxed">
              Everyone plays on this device. When a player finishes their turn,
              pass the phone or tablet to the next person.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
            {/* Left column — game settings */}
            <div className="space-y-4">
              <div className="p-3 sm:p-4 md:p-5 rounded-xl border border-white/15 bg-white/5">
                <Label className="text-white/90 mb-2.5 block text-sm font-semibold">
                  Game Type
                </Label>
                <RadioGroup
                  value={gameType}
                  onValueChange={(v) => setGameType(v as "question" | "time")}
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2"
                >
                  <label
                    htmlFor="pwf-question"
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                      gameType === "question"
                        ? "border-accent/50 bg-accent/10"
                        : "border-white/15 bg-white/5 hover:bg-white/8"
                    )}
                  >
                    <RadioGroupItem
                      value="question"
                      id="pwf-question"
                      className={cn(radioClass, "mt-0.5")}
                    />
                    <div>
                      <span className="flex items-center gap-1.5 font-medium text-white text-sm">
                        <ListChecks className="h-4 w-4 text-accent" />
                        Question-Based
                      </span>
                      <p className="text-xs text-white/55 mt-0.5">
                        {questionBasedSummary}
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor="pwf-time"
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                      gameType === "time"
                        ? "border-accent/50 bg-accent/10"
                        : "border-white/15 bg-white/5 hover:bg-white/8"
                    )}
                  >
                    <RadioGroupItem
                      value="time"
                      id="pwf-time"
                      className={cn(radioClass, "mt-0.5")}
                    />
                    <div>
                      <span className="flex items-center gap-1.5 font-medium text-white text-sm">
                        <Clock className="h-4 w-4 text-accent" />
                        Time-Based
                      </span>
                      <p className="text-xs text-white/55 mt-0.5">
                        {timeBasedSummary}
                      </p>
                    </div>
                  </label>
                </RadioGroup>

                {gameType === "time" && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <Label className="text-white/90 mb-2 block text-sm font-semibold">
                      Round Duration
                    </Label>
                    <div className={`grid gap-2 ${durationOptions.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
                      {durationOptions.map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setGameDuration(mins)}
                          className={cn(
                            "py-2.5 rounded-xl border text-sm font-semibold transition-colors",
                            gameDuration === mins
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
                          )}
                        >
                          {mins} min
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 sm:p-4 md:p-5 rounded-xl border border-white/15 bg-white/5 space-y-4">
                <h3 className="text-sm font-semibold text-white/90">
                  Game Configuration
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-4">
                  <div>
                    <Label className="text-white/80 mb-2 block text-xs font-medium">
                      Category
                    </Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="bg-white/10 border-white/25 text-white h-10 sm:h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All Categories">All Categories</SelectItem>
                        <SelectItem value="Old Testament">Old Testament</SelectItem>
                        <SelectItem value="New Testament">New Testament</SelectItem>
                        <SelectItem value="Bible Stories">Bible Stories</SelectItem>
                        <SelectItem value="Famous People">Famous People</SelectItem>
                        <SelectItem value="Theme-Based">Theme-Based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white/80 mb-2 block text-xs font-medium">
                      Difficulty
                    </Label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger className="bg-white/10 border-white/25 text-white h-10 sm:h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Beginner">Beginner</SelectItem>
                        <SelectItem value="Intermediate">Intermediate</SelectItem>
                        <SelectItem value="Advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column — players */}
            <div className="p-3 sm:p-4 md:p-5 rounded-xl border border-white/15 bg-white/5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white/90">Players</h3>
                <Select
                  value={playerCount.toString()}
                  onValueChange={(v) => setPlayerCount(parseInt(v))}
                >
                  <SelectTrigger className="w-[120px] sm:w-[130px] bg-white/10 border-white/25 text-white h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {playerCountOptions.map((count) => (
                      <SelectItem key={count} value={count.toString()}>
                        {count} players
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2.5">
                {Array.from({ length: playerCount }).map((_, index) => (
                  <div className="flex items-center gap-3" key={index}>
                    <div
                      className={cn(
                        "h-9 w-9 rounded-full text-xs font-bold flex items-center justify-center shrink-0",
                        PLAYER_COLORS[index % PLAYER_COLORS.length]
                      )}
                    >
                      {index + 1}
                    </div>
                    <Input
                      value={playerNames[index]}
                      onChange={(e) => {
                        const next = [...playerNames];
                        next[index] = e.target.value;
                        setPlayerNames(next);
                      }}
                      placeholder={`Player ${index + 1}`}
                      className="flex-1 bg-white/10 border-white/25 text-white placeholder:text-white/35 h-10"
                      disabled={index === 0 && Boolean(user)}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/45">
                {user
                  ? "Your username is Player 1 — other names can be edited freely."
                  : "Enter a name for each player."}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-white/10">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/70 border border-white/10">
                {gameType === "question"
                  ? `${settings.questionsPerGame} questions · ${settings.timePerQuestion} sec each`
                  : `${gameDuration} min timer`}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/70 border border-white/10">
                {category}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-accent/15 text-accent border border-accent/25">
                {difficulty}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/70 border border-white/10">
                {playerCount} players
              </span>
            </div>

            <Button
              onClick={handleStartGame}
              className="w-full sm:w-auto sm:min-w-[200px] h-11 sm:h-12 bg-accent hover:bg-accent/90 text-primary font-bold text-base rounded-xl shadow-lg shadow-accent/20 shrink-0"
            >
              <Play className="mr-2 h-5 w-5" />
              Start Game
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export { GameSetup };
export default GameSetup;
