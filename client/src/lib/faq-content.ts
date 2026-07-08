import { useMemo } from "react";
import {
  Target,
  Users,
  Swords,
  Zap,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useGameSettings } from "@/hooks/use-game-settings";
import {
  formatDurationOptionsLabel,
  formatMultiplayerPlayerRange,
  formatQuestionBasedSummary,
  formatTimeBasedRoundSummary,
  getTeamBattleQuestionCount,
  type GameSettingsConfig,
} from "@/lib/game-config";

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQSectionData {
  title: string;
  icon: LucideIcon;
  accent: "gold" | "teal" | "purple" | "blue";
  items: FAQItem[];
}

export function buildFaqData(settings: GameSettingsConfig): FAQSectionData[] {
  const questionSummary = formatQuestionBasedSummary(settings);
  const timeRounds = formatTimeBasedRoundSummary(
    settings.timeBasedDurationOptions
  );
  const playerRange = formatMultiplayerPlayerRange(settings);
  const teamBattleQuestions = getTeamBattleQuestionCount(
    settings.questionsPerGame
  );
  const durationChoices = formatDurationOptionsLabel(
    settings.timeBasedDurationOptions
  );

  return [
    {
      title: "Solo Quiz",
      icon: Target,
      accent: "blue",
      items: [
        {
          question: "How do I start a solo game?",
          answer: `Tap "Solo Quiz" on the home screen, pick Question-Based (${questionSummary}) or Time-Based (${timeRounds}), then choose your category and difficulty. Hit Start Solo Quiz and you're in!`,
        },
        {
          question: "Can I pause and come back later?",
          answer:
            "Yes. Solo games auto-save your progress. Use Continue Playing on the home screen to pick up exactly where you left off.",
        },
        {
          question: "What rewards can I earn?",
          answer:
            "In Solo Quiz (Question-Based), unlock rewards as you answer correctly: 3 correct answers earns a book, 6 earns a FaithIQ cap, and 10 correct earns a t-shirt.",
        },
      ],
    },
    {
      title: "Play with Friends",
      icon: Users,
      accent: "teal",
      items: [
        {
          question: "How does same-device multiplayer work?",
          answer: `Tap "Play with Friends" on the home screen. Add ${playerRange} (names for each seat), choose Question-Based (${questionSummary}) or Time-Based (${durationChoices}), and start. Everyone plays on one phone or tablet — pass the device when it's the next player's turn.`,
        },
        {
          question: "How does turn-taking work?",
          answer:
            "Each player answers on their turn. Scores are tracked separately so you can see who's winning throughout the game.",
        },
        {
          question: "Can we pause a friends game?",
          answer:
            "Same-device games run continuously to keep turns fair. Make sure everyone is ready before you tap Start Game.",
        },
      ],
    },
    {
      title: "Team Battle",
      icon: Swords,
      accent: "purple",
      items: [
        {
          question: "What is Team Battle?",
          answer: `Two teams compete live online. Create or join a team, invite teammates, enter the ready lobby, and battle through ${teamBattleQuestions} alternating team questions (${settings.timePerQuestion} sec each). A toss decides who goes first.`,
        },
        {
          question: "How do I join a team?",
          answer:
            'Tap "Team Battle" on the home screen. Create a new team as captain, or accept an invite from the notifications bell. All teammates must mark Ready before the match starts.',
        },
        {
          question: "What if a teammate disconnects?",
          answer:
            "The game continues with remaining players. If the captain leaves, another member is promoted automatically so your team can keep playing.",
        },
      ],
    },
    {
      title: "Rapid Fire",
      icon: Zap,
      accent: "gold",
      items: [
        {
          question: "How is Rapid Fire different from Team Battle?",
          answer: `Rapid Fire uses the same team setup with ${settings.questionsPerGame} questions and ${settings.timePerQuestion} seconds per question. First correct answer wins the point — ideal for a high-energy quick match.`,
        },
        {
          question: "Do the same team rules apply?",
          answer:
            "Yes — create or join a team, get everyone ready in the lobby, then compete. The captain leads answer submissions just like in standard Team Battle.",
        },
      ],
    },
    {
      title: "Scores & Leaderboard",
      icon: Trophy,
      accent: "gold",
      items: [
        {
          question: "Where can I see my stats?",
          answer:
            "Your home screen shows games played, rank, best score, and accuracy. Open Game History for past solo scores and average answer time, or Leaderboard to compare with other players. Tap your profile (top-right) for account details.",
        },
        {
          question: "Does the AI host read questions aloud?",
          answer:
            "Yes! Dr. HB Holmes narrates questions and reacts to your answers. Toggle voice on or off from the in-game settings at any time.",
        },
        {
          question: "Something went wrong — what should I do?",
          answer:
            "Refresh your browser. Solo progress is saved automatically. For Team Battle, reconnect quickly — other players can continue while you rejoin.",
        },
      ],
    },
  ];
}

export function useFaqData(): FAQSectionData[] {
  const { settings } = useGameSettings();
  return useMemo(() => buildFaqData(settings), [settings]);
}
