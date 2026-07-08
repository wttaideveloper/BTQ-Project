import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Users,
  Trophy,
  Play,
  Clock,
  Target,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Swords,
  Zap,
  History,
  User,
  Bell,
  Pause,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WelcomeTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGame: () => void;
}

type StepCard = {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  accent: "blue" | "teal" | "purple" | "gold";
};

const accentCard: Record<StepCard["accent"], string> = {
  blue: "border-blue-400/30 bg-blue-500/10",
  teal: "border-teal-400/30 bg-teal-500/10",
  purple: "border-purple-400/30 bg-purple-500/10",
  gold: "border-accent/30 bg-accent/10",
};

function ModeCard({ icon, title, description, badge, accent }: StepCard) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4 h-full transition-colors hover:bg-white/[0.06]",
        accentCard[accent]
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-white text-sm sm:text-base">{title}</h4>
          <p className="text-xs sm:text-sm text-white/65 mt-1 leading-relaxed">
            {description}
          </p>
          {badge && (
            <Badge className="mt-2 bg-white/10 text-white/80 border-white/15 text-xs">
              {badge}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function TipRow({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
      <div className="shrink-0">{icon}</div>
      <div>
        <h4 className="font-medium text-white text-sm">{title}</h4>
        <p className="text-xs sm:text-sm text-white/60 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

const WelcomeTutorial: React.FC<WelcomeTutorialProps> = ({
  isOpen,
  onClose,
  onStartGame,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const tutorialSteps = [
    {
      title: "Welcome to FaithIQ",
      subtitle: "Bible trivia hosted by Dr. HB Holmes",
      icon: <BookOpen className="h-8 w-8 text-accent" />,
      content: (
        <div className="text-center space-y-5">
          <div className="text-5xl sm:text-6xl">📖</div>
          <p className="text-sm sm:text-base text-white/80 leading-relaxed max-w-lg mx-auto">
            Test your Bible knowledge with solo quizzes, same-device multiplayer,
            and live online team battles. Create a free account to save scores,
            track stats, and join Team Battle lobbies.
          </p>
          <div className="rounded-xl border border-accent/25 bg-accent/10 p-4 text-left max-w-md mx-auto">
            <p className="text-sm text-white/85">
              <span className="text-accent font-semibold">Great for:</span> personal
              study, families, youth groups, and friends who want a fun way to
              learn Scripture together.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Choose Your Game Mode",
      subtitle: "Four ways to play from the home screen",
      icon: <Play className="h-8 w-8 text-accent" />,
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <ModeCard
            accent="blue"
            icon={<Target className="h-5 w-5 text-blue-400" />}
            title="Solo Quiz"
            description="Play alone. Pick a category, choose Question-Based or Time-Based mode, and track your score and average answer time."
            badge="Start from home → Solo Quiz"
          />
          <ModeCard
            accent="teal"
            icon={<Users className="h-5 w-5 text-teal-400" />}
            title="Play with Friends"
            description="Pass one device, enter names, take turns, and compare scores at the end. Player limit follows your game settings."
            badge="Same device · no account needed per player"
          />
          <ModeCard
            accent="purple"
            icon={<Swords className="h-5 w-5 text-purple-400" />}
            title="Team Battle"
            description="Two teams compete live online. Create or join a team, invite friends, mark Ready in the lobby, then battle through team questions."
            badge="Online · team lobby"
          />
          <ModeCard
            accent="gold"
            icon={<Zap className="h-5 w-5 text-accent" />}
            title="Rapid Fire"
            description="Team mode with faster timed rounds. Same team setup as Team Battle, but shorter questions and a quicker pace."
            badge="Online · quick match"
          />
        </div>
      ),
    },
    {
      title: "Solo Quiz Options",
      subtitle: "How Question-Based and Time-Based modes work",
      icon: <Clock className="h-8 w-8 text-blue-400" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <ModeCard
              accent="blue"
              icon={<Target className="h-5 w-5 text-blue-400" />}
              title="Question-Based"
              description="10 questions with 20 seconds per question. Answer before time runs out to score points."
              badge="Fixed 10 questions"
            />
            <ModeCard
              accent="gold"
              icon={<Clock className="h-5 w-5 text-accent" />}
              title="Time-Based"
              description="A speed round with a 5, 10, or 15-minute timer. Answer as many questions as you can before the clock hits zero."
              badge="5 / 10 / 15 min"
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <p className="text-sm font-medium text-white">Categories & difficulty</p>
            <p className="text-xs sm:text-sm text-white/65 leading-relaxed">
              Choose from Old Testament, New Testament, Bible Stories, Famous People,
              Theme-Based, or All Categories. Set difficulty to Beginner, Intermediate,
              or Advanced before you start.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "While You Play",
      subtitle: "Scoring, rewards, and in-game tools",
      icon: <Trophy className="h-8 w-8 text-accent" />,
      content: (
        <div className="space-y-3">
          <TipRow
            icon={<Clock className="h-4 w-4 text-yellow-400 mt-0.5" />}
            title="Timer & average time"
            description="Each question gives you up to 20 seconds. Your sidebar shows correct answers, accuracy, and average time per question."
          />
          <TipRow
            icon={<Trophy className="h-4 w-4 text-accent mt-0.5" />}
            title="Unlock rewards (Solo Quiz)"
            description="3 correct answers unlocks a book, 6 unlocks a cap, and 10 correct unlocks a t-shirt in Question-Based mode."
          />
          <TipRow
            icon={<Pause className="h-4 w-4 text-green-400 mt-0.5" />}
            title="Pause anytime"
            description="Solo games can be paused from the top bar. Use Continue Playing on the home screen to resume where you left off."
          />
          <TipRow
            icon={<Volume2 className="h-4 w-4 text-blue-400 mt-0.5" />}
            title="Voice narration"
            description="Dr. HB Holmes can read questions aloud. Toggle sound and voice from the icons in the game header."
          />
        </div>
      ),
    },
    {
      title: "Track Your Progress",
      subtitle: "Profile, history, and team notifications",
      icon: <History className="h-8 w-8 text-teal-400" />,
      content: (
        <div className="space-y-3">
          <TipRow
            icon={<User className="h-4 w-4 text-accent mt-0.5" />}
            title="Your profile"
            description="Tap your name in the top-right corner to view profile details, edit your info, and see game statistics."
          />
          <TipRow
            icon={<History className="h-4 w-4 text-teal-400 mt-0.5" />}
            title="Game History"
            description="Review past solo sessions, last score, average answer time, and accuracy from the Game History page."
          />
          <TipRow
            icon={<Trophy className="h-4 w-4 text-accent mt-0.5" />}
            title="Leaderboard"
            description="Compare your best scores with other players. Home shows a preview; open Leaderboard for full rankings."
          />
          <TipRow
            icon={<Bell className="h-4 w-4 text-purple-400 mt-0.5" />}
            title="Notifications"
            description="Team Battle invites and alerts appear in the bell icon on the home screen. Accept invites to join a lobby."
          />
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-white">Daily extras on Home</p>
            <p className="text-xs sm:text-sm text-white/60 mt-1 leading-relaxed">
              Read the Daily Bible Verse or tap Accept Daily Challenge to jump
              straight into a preset solo quiz.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "You're Ready!",
      subtitle: "A few quick tips before you begin",
      icon: <CheckCircle className="h-8 w-8 text-green-400" />,
      content: (
        <div className="space-y-5">
          <div className="rounded-xl border border-accent/25 bg-gradient-to-br from-accent/15 to-transparent p-5">
            <h3 className="text-sm font-semibold text-white mb-3 text-center">
              Quick tips
            </h3>
            <ul className="space-y-2.5 text-sm text-white/80">
              {[
                "Wrong answers still help you learn — read the feedback after each question.",
                "Team Battle: everyone on your team must tap Ready before the match starts.",
                "Expand FAQ & Help on the home page anytime for mode-specific answers.",
                "Need support? Use Contact Us from the FAQ section.",
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-center text-white/50 text-xs sm:text-sm italic">
            "Your word is a lamp to my feet and a light to my path." — Psalm 119:105
          </p>
        </div>
      ),
    },
  ];

  const nextStep = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = () => {
    setCurrentStep(0);
    onClose();
  };

  const handleStartGame = () => {
    handleClose();
    onStartGame();
  };

  const step = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="w-full sm:w-[95vw] max-w-3xl max-h-[92vh] overflow-hidden p-0 bg-gradient-to-b from-[#1a1f3a] to-[#121628] border border-white/10 shadow-2xl rounded-none sm:rounded-2xl text-white">
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-start gap-3 pr-6">
            <div className="shrink-0">{step.icon}</div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg sm:text-xl font-bold text-white">
                {step.title}
              </DialogTitle>
              <p className="text-xs sm:text-sm text-white/55 mt-1">{step.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-4">
            {tutorialSteps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all duration-300",
                  index <= currentStep ? "bg-accent" : "bg-white/15"
                )}
              />
            ))}
          </div>
          <p className="text-xs text-white/45 text-center mt-2">
            Step {currentStep + 1} of {tutorialSteps.length}
          </p>
        </DialogHeader>

        <div className="p-4 sm:p-6 overflow-y-auto max-h-[50vh] sm:max-h-[55vh]">
          {step.content}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 sm:p-5 border-t border-white/10 bg-black/20">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="order-2 sm:order-1 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white disabled:opacity-40"
            size="sm"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <div className="flex gap-2 order-1 sm:order-2 sm:ml-auto">
            <Button
              variant="ghost"
              onClick={handleClose}
              className="text-white/70 hover:text-white hover:bg-white/10"
              size="sm"
            >
              {isLastStep ? "Close" : "Skip"}
            </Button>
            {isLastStep ? (
              <Button
                onClick={handleStartGame}
                className="bg-accent hover:bg-accent/90 text-primary font-semibold"
                size="sm"
              >
                <Play className="h-4 w-4 mr-1.5" />
                Start Solo Quiz
              </Button>
            ) : (
              <Button
                onClick={nextStep}
                className="bg-accent hover:bg-accent/90 text-primary font-semibold"
                size="sm"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeTutorial;
