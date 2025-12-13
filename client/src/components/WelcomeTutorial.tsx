import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Users,
  Trophy,
  Play,
  Clock,
  Target,
  HelpCircle,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";

interface WelcomeTutorialProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGame: () => void;
}

const WelcomeTutorial: React.FC<WelcomeTutorialProps> = ({
  isOpen,
  onClose,
  onStartGame,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const tutorialSteps = [
    {
      title: "🎉 Welcome to FaithIQ Bible Trivia!",
      subtitle: "Your journey to biblical knowledge starts here...",
      content: (
        <div className="text-center space-y-4">
          <div className="text-4xl sm:text-5xl lg:text-6xl mb-4">📖</div>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
            Test your Bible knowledge with the ultimate trivia experience! Join
            thousands of players in this exciting journey through scripture.
          </p>
          <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Perfect for:</strong> Bible study groups, families,
              individuals, and anyone who loves learning about God's Word!
            </p>
          </div>
        </div>
      ),
      icon: <BookOpen className="h-8 w-8 text-blue-600" />,
    },
    {
      title: "Choose Your Game Mode",
      subtitle: "Find the perfect way to play",
      content: (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <Card className="border-green-200 bg-green-50 hover:shadow-md transition-shadow h-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-green-100 p-2 rounded-lg flex-shrink-0">
                    <Target className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-green-800 text-sm sm:text-base">
                      Single Player
                    </h4>
                    <p className="text-xs sm:text-sm text-green-700 leading-relaxed">
                      Learn at your own pace, earn rewards, and track your
                      progress
                    </p>
                    <Badge
                      variant="secondary"
                      className="mt-2 bg-green-200 text-green-800 text-xs"
                    >
                      Best for beginners
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50 hover:shadow-md transition-shadow h-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-purple-100 p-2 rounded-lg flex-shrink-0">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-purple-800 text-sm sm:text-base">
                      Multiplayer
                    </h4>
                    <p className="text-xs sm:text-sm text-purple-700 leading-relaxed">
                      Compete with friends on one device - take turns answering
                      questions
                    </p>
                    <Badge
                      variant="secondary"
                      className="mt-2 bg-purple-200 text-purple-800 text-xs"
                    >
                      Great for groups
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50 hover:shadow-md transition-shadow h-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 p-2 rounded-lg flex-shrink-0">
                    <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-orange-800 text-sm sm:text-base">
                      Team Battle
                    </h4>
                    <p className="text-xs sm:text-sm text-orange-700 leading-relaxed">
                      Two teams compete in real-time multiplayer action
                    </p>
                    <Badge
                      variant="secondary"
                      className="mt-2 bg-orange-200 text-orange-800 text-xs"
                    >
                      Most exciting
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ),
      icon: <Play className="h-8 w-8 text-green-600" />,
    },
    {
      title: "Pick Your Challenge Type",
      subtitle: "Different ways to experience the game",
      content: (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Card className="border-blue-200 bg-blue-50 hover:shadow-md transition-shadow h-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg flex-shrink-0">
                    <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-blue-800 text-sm sm:text-base">
                      Question-Based Mode
                    </h4>
                    <p className="text-xs sm:text-sm text-blue-700 leading-relaxed">
                      Answer 10 carefully selected questions at your own pace
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
                      <span className="text-xs text-blue-600 font-medium">
                        5-15 minutes
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50 hover:shadow-md transition-shadow h-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-red-100 p-2 rounded-lg flex-shrink-0">
                    <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-red-800 text-sm sm:text-base">
                      Time-Based Mode
                    </h4>
                    <p className="text-xs sm:text-sm text-red-700 leading-relaxed">
                      Race against the clock! Answer as many questions as
                      possible in 15 minutes
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Target className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                      <span className="text-xs text-red-600 font-medium">
                        Fast-paced action
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ),
      icon: <Clock className="h-8 w-8 text-blue-600" />,
    },
    {
      title: "Customize Your Experience",
      subtitle: "Make the game perfect for you",
      content: (
        <div className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-yellow-50 rounded-lg border border-yellow-200 hover:shadow-sm transition-shadow">
              <div className="bg-yellow-100 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-yellow-800 text-sm sm:text-base">
                  Categories
                </h4>
                <p className="text-xs sm:text-sm text-yellow-700 leading-relaxed">
                  Choose from Old Testament, New Testament, Bible Stories, and
                  more!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-green-50 rounded-lg border border-green-200 hover:shadow-sm transition-shadow">
              <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                <Target className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-green-800 text-sm sm:text-base">
                  Difficulty Levels
                </h4>
                <p className="text-xs sm:text-sm text-green-700 leading-relaxed">
                  Beginner, Intermediate, or Advanced - start easy and level up!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-purple-50 rounded-lg border border-purple-200 hover:shadow-sm transition-shadow">
              <div className="bg-purple-100 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-purple-800 text-sm sm:text-base">
                  Rewards & Achievements
                </h4>
                <p className="text-xs sm:text-sm text-purple-700 leading-relaxed">
                  Earn books, caps, t-shirts, and certificates for your
                  progress!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-blue-50 rounded-lg border border-blue-200 hover:shadow-sm transition-shadow">
              <div className="bg-blue-100 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
                <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-blue-800 text-sm sm:text-base">
                  Voice Narration
                </h4>
                <p className="text-xs sm:text-sm text-blue-700 leading-relaxed">
                  Let Dr. HB Holmes read questions aloud to help you learn!
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
      icon: <Trophy className="h-8 w-8 text-purple-600" />,
    },
    {
      title: "Ready to Play!",
      subtitle: "Your biblical adventure awaits",
      content: (
        <div className="text-center space-y-4 sm:space-y-6">
          <div className="text-3xl sm:text-4xl lg:text-6xl">🎯</div>
          <div className="bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 text-white text-center p-4 sm:p-6 rounded-xl shadow-lg border border-blue-400/20">
            <h3 className="text-base sm:text-lg lg:text-xl font-bold mb-3 sm:mb-4 text-center">
              Remember :
            </h3>
            <ul className="space-y-2 sm:space-y-3 text-xs sm:text-sm lg:text-base max-w-md mx-auto">
              <li className="text-center">
                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-300 inline mr-3" />
                <span className="leading-relaxed">
                  You can pause anytime and resume later
                </span>
              </li>
              <li className="text-center">
                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-300 inline mr-3" />
                <span className="leading-relaxed">
                  Wrong answers help you learn too!
                </span>
              </li>
              <li className="text-center">
                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-300 inline mr-3" />
                <span className="leading-relaxed">
                  Check the leaderboard to see how you rank
                </span>
              </li>
              <li className="text-center">
                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 text-green-300 inline mr-3" />
                <span className="leading-relaxed">
                  Visit the FAQ anytime for help
                </span>
              </li>
            </ul>
          </div>
          <p className="text-gray-600 italic text-sm sm:text-base px-4">
            "For the word of God is alive and active..." - Hebrews 4:12
          </p>
        </div>
      ),
      icon: <CheckCircle className="h-8 w-8 text-green-600" />,
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
    // Tutorial shown this session - will show again in new session
    onClose();
  };

  const handleSkip = () => {
    // Skip the tutorial - still counts as shown for this session
    onClose();
  };

  const handleStartGame = () => {
    handleClose();
    onStartGame();
  };

  const currentTutorialStep = tutorialSteps[currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:w-[95vw] max-w-none sm:max-w-4xl max-h-[95vh] overflow-y-auto p-0 bg-white shadow-2xl border-2 border-accent/20 rounded-none sm:rounded-xl">
        <DialogHeader className="p-3 sm:p-5 pb-2 sm:pb-3 pt-4 sm:pt-5 pr-10 sm:pr-12 lg:pr-16 border-b bg-gradient-to-r from-accent/5 to-accent/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0">{currentTutorialStep.icon}</div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 truncate break-words">
                  {currentTutorialStep.title}
                </DialogTitle>
                <p className="text-xs sm:text-sm text-gray-600 mt-1 hidden sm:block">
                  {currentTutorialStep.subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-1 sm:gap-2 mt-3 sm:mt-4 px-1">
            {tutorialSteps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 sm:h-2 lg:h-3 flex-1 rounded-full transition-all duration-300 ${
                  index <= currentStep ? "bg-accent shadow-sm" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs sm:text-sm lg:text-base text-gray-500 text-center mt-2 sm:mt-3 font-medium">
            Step {currentStep + 1} of {tutorialSteps.length}
          </p>
        </DialogHeader>

        <div className="p-3 sm:p-5 lg:p-8 flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto">{currentTutorialStep.content}</div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-5 pt-2 sm:pt-3 lg:p-6 lg:pt-4 border-t bg-gradient-to-r from-gray-50 to-gray-100">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="flex items-center justify-center gap-2 order-2 sm:order-1 disabled:opacity-50"
            size="sm"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          <div className="flex gap-2 sm:gap-3 order-1 sm:order-2 flex-1 sm:flex-initial justify-center sm:justify-end">
            {currentStep === tutorialSteps.length - 1 ? (
              <>
                <Button
                  variant="secondary"
                  onClick={handleSkip}
                  className="flex-1 sm:flex-initial text-xs sm:text-sm shadow-sm focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  size="sm"
                >
                  Skip Tutorial
                </Button>
                <Button
                  onClick={handleStartGame}
                  className="flex-1 sm:flex-initial bg-gradient-to-r from-accent to-accent-dark hover:from-accent-dark hover:to-accent text-white shadow-lg hover:shadow-xl transition-all duration-200 text-xs sm:text-sm font-semibold"
                  size="sm"
                >
                  🎯 Start Playing!
                </Button>
              </>
            ) : (
              <div className="flex gap-3 sm:gap-4">
                <Button
                  variant="secondary"
                  onClick={handleSkip}
                  className="text-xs sm:text-sm shadow-sm focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  size="sm"
                >
                  Skip Tutorial
                </Button>
                <Button
                  onClick={nextStep}
                  className="flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white shadow-md hover:shadow-lg transition-all duration-200 text-xs sm:text-sm"
                  size="sm"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeTutorial;
