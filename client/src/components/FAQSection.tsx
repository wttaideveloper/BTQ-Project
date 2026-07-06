import { useState } from "react";
import {
  ChevronDown,
  Target,
  Users,
  Swords,
  Zap,
  Trophy,
  Sparkles,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSectionData {
  title: string;
  icon: LucideIcon;
  accent: "gold" | "teal" | "purple" | "blue";
  items: FAQItem[];
}

const faqData: FAQSectionData[] = [
  {
    title: "Solo Quiz",
    icon: Target,
    accent: "blue",
    items: [
      {
        question: "How do I start a solo game?",
        answer:
          'Tap "Solo Quiz" on the home screen, pick Question-Based (10 questions, 20 sec each) or Time-Based (15-minute round), then choose your category and difficulty. Hit Start Solo Quiz and you\'re in!',
      },
      {
        question: "Can I pause and come back later?",
        answer:
          "Yes. Solo games auto-save your progress. Use Continue Playing on the home screen to pick up exactly where you left off.",
      },
      {
        question: "What rewards can I earn?",
        answer:
          "Strong scores unlock rewards: 5+ correct answers earns a free book, 9+ a FaithIQ cap, and a perfect 12/12 can earn a t-shirt!",
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
        answer:
          'Tap "Play with Friends" on the home screen. Add 2–3 player names, choose your settings, and start. Everyone plays on one phone or tablet — pass the device when it\'s the next player\'s turn.',
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
        answer:
          "Two teams compete live online. Create or join a team, invite teammates, enter the ready lobby, and battle through 10 alternating team questions. A toss decides who goes first.",
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
        answer:
          "Rapid Fire uses the same team setup but with faster, timed rounds. It's ideal for a quick match when you want high energy and shorter questions.",
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
          "Your home screen shows games played, rank, accuracy, and win streak. Tap Game History for detailed stats and past solo sessions, or Leaderboard to compare with other players.",
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

const accentStyles = {
  gold: {
    section: "border-accent/25 hover:border-accent/40",
    header: "bg-accent/10",
    icon: "home-icon-gold",
  },
  teal: {
    section: "border-teal-500/25 hover:border-teal-500/40",
    header: "bg-teal-500/10",
    icon: "home-icon-teal",
  },
  purple: {
    section: "border-purple-400/25 hover:border-purple-400/40",
    header: "bg-purple-500/10",
    icon: "home-icon-purple",
  },
  blue: {
    section: "border-blue-400/25 hover:border-blue-400/40",
    header: "bg-blue-500/10",
    icon: "home-icon-blue",
  },
};

interface FAQSectionProps {
  onOpenTutorial?: () => void;
  onContact?: () => void;
}

const FAQSection = ({ onOpenTutorial, onContact }: FAQSectionProps) => {
  const [openSection, setOpenSection] = useState<number | null>(0);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(
    null
  );

  const toggleSection = (index: number) => {
    setOpenSection((prev) => (prev === index ? null : index));
    setExpandedQuestion(null);
  };

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestion((prev) => (prev === questionId ? null : questionId));
  };

  return (
    <div className="home-glass-card rounded-2xl p-4 sm:p-5 space-y-3">
      {faqData.map((section, sectionIndex) => {
        const styles = accentStyles[section.accent];
        const isOpen = openSection === sectionIndex;
        const SectionIcon = section.icon;

        return (
          <div
            key={section.title}
            className={cn(
              "rounded-xl border overflow-hidden transition-colors duration-200",
              styles.section,
              isOpen ? "bg-white/[0.04]" : "bg-white/[0.02]"
            )}
          >
            <button
              type="button"
              onClick={() => toggleSection(sectionIndex)}
              className={cn(
                "w-full px-3 sm:px-4 py-3 sm:py-3.5 flex items-center gap-3 text-left transition-colors",
                isOpen && styles.header
              )}
            >
              <div
                className={cn(
                  "w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                  styles.icon
                )}
              >
                <SectionIcon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
              </div>
              <span className="flex-1 font-semibold text-white text-sm sm:text-base">
                {section.title}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-white/50 shrink-0 transition-transform duration-200",
                  isOpen && "rotate-180 text-accent"
                )}
              />
            </button>

            {isOpen && (
              <div className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-2 border-t border-white/10">
                {section.items.map((item, itemIndex) => {
                  const questionId = `${sectionIndex}-${itemIndex}`;
                  const isExpanded = expandedQuestion === questionId;

                  return (
                    <div
                      key={questionId}
                      className="rounded-lg border border-white/10 overflow-hidden bg-black/15"
                    >
                      <button
                        type="button"
                        onClick={() => toggleQuestion(questionId)}
                        className="w-full px-3 py-2.5 sm:py-3 text-left flex items-start gap-2 sm:gap-3 hover:bg-white/5 transition-colors"
                      >
                        <span className="text-accent font-bold text-xs mt-0.5 shrink-0">
                          Q
                        </span>
                        <span className="flex-1 text-sm text-white/90 font-medium leading-snug pr-2">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-white/40 shrink-0 mt-0.5 transition-transform duration-200",
                            isExpanded && "rotate-180 text-accent"
                          )}
                        />
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 sm:px-4 sm:pb-3.5 pl-7 sm:pl-8">
                          <p className="text-sm text-white/65 leading-relaxed border-l-2 border-accent/50 pl-3">
                            {item.answer}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-accent/10 border border-accent/20">
          <div className="flex items-start gap-3">
            <div className="home-icon-gold w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-white text-sm sm:text-base">
                New to FaithIQ?
              </h4>
              <p className="text-white/60 text-xs sm:text-sm mt-0.5 leading-relaxed">
                Walk through every game mode with our interactive tutorial.
              </p>
            </div>
          </div>
          {onOpenTutorial && (
            <Button
              size="sm"
              className="bg-accent hover:bg-accent/90 text-primary font-semibold w-full"
              onClick={onOpenTutorial}
            >
              Open Tutorial
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 p-4 rounded-xl bg-teal-500/10 border border-teal-500/20">
          <div className="flex items-start gap-3">
            <div className="home-icon-teal w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-white text-sm sm:text-base">
                Still need help?
              </h4>
              <p className="text-white/60 text-xs sm:text-sm mt-0.5 leading-relaxed">
                Reach our support team for bugs, account issues, or feedback.
              </p>
            </div>
          </div>
          {onContact && (
            <Button
              size="sm"
              variant="outline"
              className="home-btn-outline w-full font-semibold"
              onClick={onContact}
            >
              Contact Us
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FAQSection;
