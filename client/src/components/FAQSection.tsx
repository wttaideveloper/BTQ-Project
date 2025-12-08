import { useState } from "react";
import { ChevronDown, HelpCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSectionData {
  title: string;
  items: FAQItem[];
}

const faqData: FAQSectionData[] = [
  {
    title: "Single Player Mode",
    items: [
      {
        question: "How does Single Player mode work?",
        answer:
          "Choose between Question-Based (answer 10 questions at your own pace with 20 seconds per question) or Time-Based (answer as many questions as you can in 15 minutes with 20 questions). You can pause anytime and your progress auto-saves!",
      },
      {
        question: "Can I pause and resume my game?",
        answer:
          "Yes! Click pause anytime. Your progress is automatically saved, so you can resume exactly where you left off whenever you're ready.",
      },
      {
        question: "What rewards can I earn?",
        answer:
          "Earn rewards based on correct answers: 5+ for a free book, 9+ for a FaithIQ cap, 12+ for a t-shirt (perfect score only)!",
      },
    ],
  },
  {
    title: "Multiplayer Mode",
    items: [
      {
        question: "How do I play with friends on one device?",
        answer:
          "Select Multiplayer mode and choose Real-time. You can play with 2-3 players on the same device. Enter player names and take turns answering questions!",
      },
      {
        question: "Can I pause in Multiplayer?",
        answer:
          "No, multiplayer runs continuously to keep it fair for all players. Make sure everyone is ready before starting!",
      },
      {
        question: "How does scoring work?",
        answer:
          "Each player takes turns answering questions. Your individual scores are tracked separately, and you can see who's winning as you play!",
      },
    ],
  },
  {
    title: "Team Battle Mode",
    items: [
      {
        question: "How does Team Battle work?",
        answer:
          "Create or join a team, then challenge another team! Team members suggest answers and vote together. The captain makes the final decision on which answer to submit.",
      },
      {
        question: "How do I create or join a team?",
        answer:
          "Go to Team Battle Setup from the home screen. You can create a new team as captain, or accept team invitations from other players.",
      },
      {
        question: "What happens if someone disconnects?",
        answer:
          "The team continues with remaining members. If the captain disconnects, another member is automatically promoted to keep the game going.",
      },
    ],
  },
  {
    title: "Game Features & Settings",
    items: [
      {
        question: "What is the AI Bible guide?",
        answer:
          "Your friendly AI avatar reads questions aloud, celebrates correct answers with encouraging messages, and provides helpful Bible context. You can toggle voice on/off in settings.",
      },
      {
        question: "Can I change game settings?",
        answer:
          "Yes! Adjust voice volume, sound effects, background music, and other preferences from the settings menu or during a paused game.",
      },
      {
        question: "What if the game freezes or I lose connection?",
        answer:
          "Try refreshing your browser. Single player progress is auto-saved. For multiplayer/team games, try reconnecting quickly - the game continues for other players.",
      },
    ],
  },
];

const FAQSection = () => {
  const [openSections, setOpenSections] = useState<number[]>([]);
  const [expandedQuestions, setExpandedQuestions] = useState<string[]>([]);

  const toggleSection = (index: number) => {
    setOpenSections((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId]
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4 px-1">
        <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg">
          <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
        </div>
        <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white">
          Help Center
        </h3>
      </div>

      {/* FAQ Sections */}
      <div className="space-y-2 sm:space-y-3">
        {faqData.map((section, sectionIndex) => (
          <div
            key={sectionIndex}
            className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-lg sm:rounded-xl border border-white/20 overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300"
          >
            {/* Section Header */}
            <button
              onClick={() => toggleSection(sectionIndex)}
              className={cn(
                "w-full px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-4 flex items-center justify-between",
                "bg-gradient-to-r from-purple-600/30 to-blue-600/30",
                "hover:from-purple-600/40 hover:to-blue-600/40",
                "transition-all duration-300",
                openSections.includes(sectionIndex) &&
                  "from-purple-600/40 to-blue-600/40"
              )}
            >
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <div
                  className={cn(
                    "flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-lg",
                    "bg-gradient-to-br from-purple-500 to-blue-500",
                    "flex items-center justify-center",
                    "text-white text-xs sm:text-sm font-bold"
                  )}
                >
                  {sectionIndex + 1}
                </div>
                <h4 className="text-sm sm:text-base md:text-lg font-semibold text-white text-left truncate">
                  {section.title}
                </h4>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 sm:h-5 sm:w-5 text-white/90 flex-shrink-0 ml-2",
                  "transition-transform duration-300",
                  openSections.includes(sectionIndex) && "rotate-180"
                )}
              />
            </button>

            {/* Section Content */}
            {openSections.includes(sectionIndex) && (
              <div className="p-2 sm:p-3 md:p-4 space-y-2 sm:space-y-3 bg-black/20">
                {section.items.map((item, itemIndex) => {
                  const questionId = `${sectionIndex}-${itemIndex}`;
                  const isExpanded = expandedQuestions.includes(questionId);

                  return (
                    <div
                      key={itemIndex}
                      className={cn(
                        "bg-white/5 rounded-lg border border-white/10",
                        "hover:bg-white/10 hover:border-white/20",
                        "transition-all duration-300",
                        "overflow-hidden"
                      )}
                    >
                      {/* Question */}
                      <button
                        onClick={() => toggleQuestion(questionId)}
                        className="w-full px-3 py-3 sm:px-4 sm:py-3 text-left flex items-start gap-2 sm:gap-3"
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">
                              Q
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-semibold text-white text-xs sm:text-sm md:text-base leading-relaxed pr-8">
                            {item.question}
                          </h5>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-white/70 flex-shrink-0 mt-0.5",
                            "transition-transform duration-300",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </button>

                      {/* Answer */}
                      {isExpanded && (
                        <div className="px-3 pb-3 sm:px-4 sm:pb-4 pl-10 sm:pl-12 md:pl-14">
                          <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-lg p-3 sm:p-4 border-l-4 border-blue-400">
                            <p className="text-white/80 text-xs sm:text-sm leading-relaxed">
                              {item.answer}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Support Card */}
      <div className="bg-gradient-to-br from-purple-600/20 to-blue-600/20 backdrop-blur-sm rounded-lg sm:rounded-xl p-4 sm:p-5 md:p-6 border border-white/30 shadow-lg mt-4 sm:mt-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-white mb-1.5 sm:mb-2 text-sm sm:text-base md:text-lg flex items-center gap-2">
              Need More Help?
            </h4>
            <p className="text-white/70 text-xs sm:text-sm leading-relaxed">
              We're here to help! Contact our support team through the settings
              menu, or check out the in-game tutorial for a visual walkthrough
              of all features.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 sm:mt-4 bg-white/10 hover:bg-white/20 text-white border-white/30 text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2"
            >
              Contact Support
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FAQSection;
