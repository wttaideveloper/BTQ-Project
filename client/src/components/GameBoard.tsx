import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { playSound, isVoiceEnabled } from '@/lib/sounds';
import { playBasicSound } from '@/lib/basic-sound';
import { voiceService } from '@/lib/voice-service';
import FeedbackModal from './FeedbackModal';

interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface GameBoardProps {
  question: string;
  questionContext?: string;
  answers: Answer[];
  currentQuestion: number;
  totalQuestions: number | string;
  category: string;
  difficultyLevel: string;
  timeLimit: number;
  onAnswer: (answer: Answer, timeSpent: number) => void;
  onNextQuestion: () => void;
  score: number;
  avatarMessage: string;
  isQuestionAnswered: boolean;
  correctAnswers?: number; // Number of correct answers so far
  isPaused?: boolean; // Pause state
  isMultiplayer?: boolean; // Whether this is a multiplayer game
  currentPlayerName?: string; // Current player's name for multiplayer
  gameMode?: string; // Game mode: 'single', 'multi', etc.
}

const GameBoard: React.FC<GameBoardProps> = ({
  question,
  questionContext,
  answers,
  currentQuestion,
  totalQuestions,
  category,
  difficultyLevel,
  timeLimit,
  onAnswer,
  onNextQuestion,
  score,
  avatarMessage,
  isQuestionAnswered,
  correctAnswers = 0, // Default to 0 if not provided
  isPaused = false, // Default to false if not provided
  isMultiplayer = false, // Default to false if not provided
  currentPlayerName, // Optional current player name
  gameMode = 'single', // Default to 'single' if not provided
}) => {
  const [timeRemaining, setTimeRemaining] = useState(timeLimit);
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [questionSessionId, setQuestionSessionId] = useState<string>('');
  
  // Reset timer when question changes
  useEffect(() => {
    if (!isQuestionAnswered) {
      // Generate unique session ID for this question
      const newSessionId = `q${currentQuestion}-${Date.now()}`;
      setQuestionSessionId(newSessionId);
      
      // Start new voice session for this question - this stops any previous audio
      voiceService.startNewSession(newSessionId);
      
      setTimeRemaining(timeLimit);
      setSelectedAnswer(null);
      setStartTime(Date.now());
      setShowFeedback(false);
      
      // Read the question if voice is enabled
      if (isVoiceEnabled()) {
        // Use question index-specific flag to track if question has been read
        // This prevents voice overlap in multiplayer mode
        const questionKey = `questionRead_${currentQuestion}`;
        const isFreshLoad = !sessionStorage.getItem(questionKey);
        
        if (isFreshLoad) {
          sessionStorage.setItem(questionKey, 'true');
        }
        
        // Ensure voice service is ready before speaking
        const readQuestion = async () => {
          try {
            // Make sure voice status is loaded (especially for first question)
            await voiceService.getVoiceStatus();
            console.log(`🔊 Voice service ready - reading Question ${currentQuestion} with session ${newSessionId}`);
            
            // Only speak if the document is visible and component is still mounted
            // CRITICAL: Only read if this question hasn't been read yet to prevent overlap
            if (document.visibilityState === 'visible' && isFreshLoad && !isPaused) {
              // Just read the question number and question text - no player turn announcements
              const textToSpeak = `Question ${currentQuestion}: ${question}`;
              console.log(`📢 Starting narration for Question ${currentQuestion}: "${textToSpeak.substring(0, 50)}..."`);
              await voiceService.speakWithClonedVoice(textToSpeak, newSessionId);
            } else {
              console.log(`⏭️ Skipping narration for Question ${currentQuestion} - already read or paused`);
            }
          } catch (error) {
            console.error('❌ Error reading question:', error);
          }
        };
        
        // Use a delay to ensure everything is ready
        const questionTimer = setTimeout(() => {
          readQuestion();
        }, 1000); // 1 second delay for question narration
        
        // Clean up function - always clear session when this effect is cleaned up
        return () => {
          clearTimeout(questionTimer);
          // Only clear if this is still the active session
          const currentSession = voiceService.getCurrentSession();
          if (currentSession === newSessionId) {
            console.log(`🧹 Cleaning up session ${newSessionId}`);
            voiceService.clearSession();
          }
        };
      }
    }
  }, [question, currentQuestion, isQuestionAnswered, isPaused, timeLimit]);

  // Timer effect
  useEffect(() => {
    if (isQuestionAnswered || timeRemaining <= 0 || isPaused) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        // Enhanced timer sounds based on remaining time
        
        // Play tick sound at different intervals for game show feel
        if (prev <= 10 && prev > 5) {
          // Regular tick for 10-6 seconds
          if (prev % 2 === 0) { // Only on even seconds for 10-6
            playSound('tick');
            playBasicSound('timeout'); // Use timeout as tick in basic system
          }
        }
        // Play countdown alert sound when less than 5 seconds remain
        else if (prev <= 5 && prev > 3) {
          // Faster ticks for 5-4 seconds
          playSound('tick');
          playBasicSound('timeout'); // Use timeout as tick in basic system
        }
        // Urgent countdown for final 3 seconds
        else if (prev <= 3 && prev > 0) {
          // Urgent sound for last 3 seconds
          playSound('countdownAlert');
          playBasicSound('timeout'); // Use timeout as countdownAlert in basic system
        }
        
        // Time expired handling
        if (prev <= 1) {
          clearInterval(timer);
          // Time's up - record this as an incorrect answer with max time
          const timeSpent = timeLimit;
          
          // Play timeout sequence
          playSound('timeout');
          playBasicSound('timeout'); // Use both sound systems
          
          // Add buzzer after small delay for emphasis
          setTimeout(() => {
            playSound('buzzer');
            playBasicSound('buzzer'); // Use both sound systems
          }, 300);
          
          // Submit the answer as timeout
          onAnswer({ 
            id: 'timeout', 
            text: 'Time expired', 
            isCorrect: false 
          }, timeSpent);
          
          setShowFeedback(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isQuestionAnswered, timeLimit, timeRemaining, onAnswer, isPaused]);

  // Cleanup effect to stop voice when component unmounts
  useEffect(() => {
    return () => {
      console.log('🧹 GameBoard unmounting - clearing voice session');
      voiceService.clearSession();
    };
  }, []);

  const handleAnswerClick = (answer: Answer) => {
    if (isQuestionAnswered || selectedAnswer || isPaused) return;
    
    // Stop any ongoing question narration for this session
    if (questionSessionId) {
      voiceService.clearSession();
    }
    
    const timeSpent = timeLimit - timeRemaining;
    setSelectedAnswer(answer);
    
    if (answer.isCorrect) {
      // For correct answers: play a sequence of game show sounds
      
      // Step 1: Play the primary correct ding immediately
      playSound('correct');
      playBasicSound('correct'); // Use both sound systems
      
      // Step 2: Wait a short delay and then play celebratory sounds
      setTimeout(() => {
        // Fast answers (under 5 seconds) get special praise
        if (timeSpent < 5) {
          // Play exciting fanfare for quick correct answers
          playSound('correctStreak');
          playBasicSound('celebration'); // Use both sound systems
          
          // Add applause after a brief pause for fast answers
          setTimeout(() => {
            playSound('applause');
            playBasicSound('applause'); // Use both sound systems
          }, 300);
        } else {
          // Regular correct answers get standard applause
          playSound('applause');
          playBasicSound('applause'); // Use both sound systems
        }
      }, 300);
      
      // Step 3: Check if this is a milestone score (every 5 correct answers)
      if ((correctAnswers + 1) % 5 === 0) {
        // Add special sound for milestone scores
        setTimeout(() => {
          playSound('points10');
          playBasicSound('fanfare'); // Use fanfare as substitute in basic system
        }, 800);
      }
    } else {
      // For wrong answers: play a sequence of error sounds
      
      // Step 1: Play clear wrong buzzer immediately
      playSound('wrong');
      playBasicSound('wrong'); // Use both sound systems
      
      // Step 2: Add crowd reaction for wrong answers after a short delay
      setTimeout(() => {
        playSound('wrongCrowd');
        playBasicSound('buzzer'); // Use buzzer as substitute in basic system
      }, 300);
    }
    
    onAnswer(answer, timeSpent);
    setShowFeedback(true);
  };

  const handleFeedbackClose = (wasManualContinue?: boolean) => {
    setShowFeedback(false);
    
    // User clicked continue for both correct and wrong answers
    // Go to next question immediately since feedback is skipped
    onNextQuestion(); // No delay at all for manual continue
  };

  const getButtonClass = (answer: Answer) => {
    if (!selectedAnswer || !isQuestionAnswered) {
      return "answer-button bg-primary hover:bg-primary/90 text-white";
    }
    
    if (answer.isCorrect) {
      return "answer-button bg-[#4CAF50] text-white";
    }
    
    if (selectedAnswer.id === answer.id && !answer.isCorrect) {
      return "answer-button bg-[#F44336] text-white incorrect-answer";
    }
    
    return "answer-button bg-primary/50 text-white";
  };

  const timePercentage = (timeRemaining / timeLimit) * 100;
  const labels = ['A', 'B', 'C', 'D'];

  return (
    <div className="flex-grow flex flex-col bg-black rounded-3xl shadow-2xl overflow-hidden relative border-2 border-accent">
      {/* Family Feud Style Header */}
      <div className="bg-gradient-to-r from-primary to-primary-dark p-3 sm:p-4 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0">
        <div className="flex items-center">
          <span className="bg-accent text-primary font-bold rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center mr-2 shadow-glow">
            {currentQuestion}
          </span>
          <span className="text-white font-medium text-sm sm:text-lg">of {totalQuestions}</span>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center sm:justify-end">
          <div className="px-2 sm:px-3 py-1 sm:py-1.5 bg-secondary rounded-xl shadow-md flex items-center gap-1 sm:gap-2">
            <span className="text-white font-medium text-xs sm:text-sm">Category:</span>
            <span className="bg-black/30 text-white px-1.5 sm:px-2 py-0.5 rounded-md text-xs sm:text-sm font-bold animate-pulse-slow">
              {category}
            </span>
          </div>
          
          <div className="px-2 sm:px-3 py-1 sm:py-1.5 bg-secondary rounded-xl shadow-md flex items-center gap-1 sm:gap-2">
            <span className="text-white font-medium text-xs sm:text-sm">Level:</span>
            <span className="bg-black/30 text-white px-1.5 sm:px-2 py-0.5 rounded-md text-xs sm:text-sm font-bold animate-pulse-slow">
              {difficultyLevel}
            </span>
          </div>
        </div>
      </div>
      
      {/* Family Feud Style Timer Bar with Enhanced Visual Indicators */}
      <div className="h-4 bg-black w-full relative overflow-hidden">
        <div 
          className={`timer-bar h-full ${
            timePercentage > 50 
              ? 'bg-gradient-to-r from-accent to-accent-dark border-r-2 border-white/50' 
              : timePercentage > 20 
                ? 'bg-gradient-to-r from-orange-500 to-red-500 border-r-2 border-white/50' 
                : 'bg-gradient-to-r from-red-600 to-red-900 border-r-2 border-white/50'
          }`} 
          style={{ width: `${timePercentage}%` }}
        ></div>
        
        {/* Show pulsing effect for low time */}
        {timePercentage <= 20 && (
          <div className="absolute inset-0 bg-red-500/30 animate-pulse" style={{ width: `${timePercentage * 3}%` }}></div>
        )}
        
        {/* Timer light display - Family Feud style */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 20 }).map((_, index) => (
            <div 
              key={index}
              className={`h-full flex-1 border-r border-black/40 ${
                index < Math.floor(timePercentage / 5) 
                  ? timePercentage <= 20 
                    ? 'bg-red-600/50 animate-pulse' 
                    : timePercentage <= 50 
                      ? 'bg-orange-500/50' 
                      : 'bg-accent/50'
                  : 'bg-transparent'
              }`}
            ></div>
          ))}
        </div>
        
        {/* Countdown seconds display */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-bold ${
            timePercentage <= 20 ? 'text-red-100 animate-pulse' : 'text-white'
          }`}>
            {timeRemaining}s
          </span>
        </div>
      </div>
      
      {/* Family Feud Style Question Display */}
      <div className="p-3 sm:p-5 md:p-8 flex-grow flex flex-col bg-gradient-to-b from-black to-primary-dark/30">
        <div className="mb-4 sm:mb-6 md:mb-8 text-center bg-secondary/20 p-3 sm:p-4 md:p-5 rounded-xl border border-secondary/30">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-heading font-bold text-white mb-2 sm:mb-3 reveal-animation" style={{animationDelay: '0.1s'}}>
            {question}
          </h2>
          {questionContext && (
            <p className="text-white/80 text-sm sm:text-base italic reveal-animation" style={{animationDelay: '0.3s'}}>"{questionContext}"</p>
          )}
        </div>
        
        {/* Family Feud Style Answer Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6 flex-grow">
          {answers.map((answer, index) => (
            <button
              key={answer.id}
              onClick={() => handleAnswerClick(answer)}
              disabled={isQuestionAnswered}
              className={`${getButtonClass(answer)} answer-button font-medium py-3 sm:py-4 md:py-5 px-3 sm:px-5 md:px-6 rounded-xl flex items-center ${
                answer.isCorrect && isQuestionAnswered ? 'correct-answer' : ''
              } reveal-animation`}
              style={{animationDelay: `${0.2 + index * 0.1}s`}}
            >
              <span className="bg-accent text-primary font-bold rounded-full w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 flex items-center justify-center mr-2 sm:mr-3 md:mr-4 shadow-md">
                {labels[index]}
              </span>
              <span className="text-left text-sm sm:text-base md:text-lg text-white line-clamp-2 sm:line-clamp-none flex-1">{answer.text}</span>
              {isQuestionAnswered && answer.isCorrect && 
                <span className="ml-1 bg-green-500 rounded-full w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center text-white">✓</span>
              }
              {isQuestionAnswered && selectedAnswer?.id === answer.id && !answer.isCorrect && 
                <span className="ml-1 bg-red-500 rounded-full w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 flex-shrink-0 flex items-center justify-center text-white">✗</span>
              }
            </button>
          ))}
        </div>
      </div>
      
      {/* Family Feud Style Game Footer */}
      <div className="bg-gradient-to-r from-secondary to-secondary-dark p-3 sm:p-4 md:p-5 flex flex-wrap sm:flex-nowrap justify-between items-center gap-3 sm:gap-2">
        <div className="flex items-center">
          <span className="text-white font-bold mr-2 sm:mr-3 text-sm sm:text-base md:text-lg">SCORE:</span>
          <div className="bg-accent text-primary font-bold px-2 sm:px-3 md:px-4 py-1 sm:py-2 rounded-lg text-base sm:text-lg md:text-xl shadow-glow animate-pulse-slow">
            {score}
          </div>
        </div>
        
        <div className="flex gap-2 sm:gap-4 w-full sm:w-auto justify-end p-1">
          <Button 
            variant="outline" 
            size="sm"
            className="border-2 border-white text-white bg-[#34495e] hover:bg-[#3b3b3b] font-bold text-xs sm:text-sm px-2 sm:px-3 h-8 sm:h-10"
            onClick={() => {
              onAnswer({ id: 'skip', text: 'Skipped', isCorrect: false }, timeLimit - timeRemaining);
              onNextQuestion();
            }}
            disabled={isQuestionAnswered}
          >
            SKIP
          </Button>
          {isQuestionAnswered && (
            <Button 
              size="sm"
              className="bg-accent hover:bg-accent/90 text-primary font-bold animate-pulse-slow text-xs sm:text-sm px-2 sm:px-4 h-8 sm:h-10 shadow-lg border-2 border-accent/90 ml-1"
              onClick={onNextQuestion}
            >
              NEXT
            </Button>
          )}
        </div>
      </div>

      {/* Feedback Modal */}
      {showFeedback && (
        <FeedbackModal
          isCorrect={selectedAnswer?.isCorrect || false}
          question={question}
          correctAnswer={answers.find(a => a.isCorrect)?.text || ''}
          avatarMessage={avatarMessage}
          onClose={handleFeedbackClose}
          gameMode={gameMode}
          questionSessionId={questionSessionId}
        />
      )}
    </div>
  );
};

export default GameBoard;
