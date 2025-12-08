import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';
import { isVoiceEnabled, playSound } from '@/lib/sounds';
import { playBasicSound } from '@/lib/basic-sound';
import { voiceService } from '@/lib/voice-service';

interface FeedbackModalProps {
  isCorrect: boolean;
  question: string;
  correctAnswer: string;
  avatarMessage: string;
  onClose: (wasManualContinue?: boolean) => void;
  gameMode?: string; // Add gameMode to differentiate between Single/Multi player
  questionSessionId?: string; // Session ID for voice narration
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isCorrect,
  question,
  correctAnswer,
  avatarMessage,
  onClose,
  gameMode = 'single', // Default to single player
  questionSessionId, // Session ID for voice
}) => {
  const [userClickedContinue, setUserClickedContinue] = useState(false);
  const [feedbackSessionId] = useState(() => `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
    // Speak the feedback when the modal appears
  useEffect(() => {
    // If user already clicked continue, don't start any feedback
    if (userClickedContinue) {
      return;
    }

    // Start new feedback session (this will stop question narration)
    voiceService.startNewSession(feedbackSessionId);
    console.log(`🎬 Feedback modal opened with session ${feedbackSessionId}`);

    // Play sequence of game show sounds based on correctness
    if (isCorrect) {
      // For correct answers: a sequence of celebratory sounds
      // Primary correct sound was already played in GameBoard
      
      // Delayed celebration sound - emulating game show applause
      setTimeout(() => {
        playSound('applause');
        playBasicSound('applause'); // Use both sound systems
      }, 300);
      
      // For really enthusiastic effect, add another sound after a delay
      setTimeout(() => {
        // Play a different sound to layer the audio effects
        playSound('celebration');
        playBasicSound('celebration'); // Use both sound systems
      }, 800);
    } else {
      // For wrong answers: emphasize with additional sounds
      // Primary wrong buzzer was already played in GameBoard
      
      // Add crowd reaction for wrong answers
      setTimeout(() => {
        playSound('wrongCrowd');
        playBasicSound('buzzer'); // Use basic sound as there's no equivalent
      }, 300);
    }
    
    // Speak the feedback if voice is enabled and user hasn't clicked continue
    if (isVoiceEnabled() && !userClickedContinue) {
      // For Single Player mode, exclude motivational messages from voice narration
      // Only speak the answer acknowledgement
      const feedback = gameMode === 'single'
        ? (isCorrect 
            ? `Correct answer. ${correctAnswer} is the right answer.`
            : `Incorrect answer. The correct answer is ${correctAnswer}.`)
        : (isCorrect
            ? `Correct! ${correctAnswer} is the right answer. ${avatarMessage}`
            : `Incorrect. The correct answer is ${correctAnswer}. ${avatarMessage}`);
      
      // Longer delay to ensure the previous speech is complete and sound effects finish
      const voiceTimeout = setTimeout(() => {
        // Double check user hasn't clicked continue before starting feedback voice
        if (!userClickedContinue) {
          voiceService.speakWithClonedVoice(feedback, feedbackSessionId);
        }
      }, 2000); // Increased delay to 2 seconds to ensure sound effects are done
      
      // Store the timeout ID so we can clear it if user clicks continue
      return () => {
        clearTimeout(voiceTimeout);
        // Clear this feedback session when modal closes (only if it's still active)
        const currentSession = voiceService.getCurrentSession();
        if (currentSession === feedbackSessionId) {
          console.log(`🧹 Cleaning up feedback session ${feedbackSessionId}`);
          voiceService.clearSession();
        }
      };
    }
  }, [isCorrect, correctAnswer, avatarMessage, onClose, userClickedContinue, gameMode, feedbackSessionId]);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className={`modal-animation w-full max-w-md p-0 rounded-2xl shadow-2xl overflow-hidden ${
        isCorrect 
          ? 'bg-gradient-to-br from-accent to-accent-dark border-2 border-accent' 
          : 'bg-gradient-to-br from-red-600 to-red-800 border-2 border-red-500'
      }`}>
        {/* Header - Game Show Style */}
        <div className={`text-center p-2 sm:p-3 md:p-4 ${
          isCorrect
            ? 'bg-gradient-to-r from-accent-dark to-accent-light'
            : 'bg-gradient-to-r from-red-700 to-red-500'
        }`}>
          <h3 className="text-xl sm:text-2xl md:text-3xl font-heading font-bold text-primary animate-bounce-slow">
            {isCorrect ? 'CORRECT!' : 'INCORRECT!'}
          </h3>
        </div>
        
        {/* Content */}
        <div className="bg-black p-3 sm:p-4 md:p-6">
          {/* Result Icon */}
          <div className="flex justify-center mb-2 sm:mb-3 md:mb-4">
            <div className={`rounded-full p-2 sm:p-3 md:p-4 ${
              isCorrect 
                ? 'bg-green-500/30 animate-pulse-slow' 
                : 'bg-red-500/30 animate-pulse-slow'
            }`}>
              {isCorrect ? (
                <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 md:h-16 md:w-16 text-green-400" />
              ) : (
                <XCircle className="h-10 w-10 sm:h-12 sm:w-12 md:h-16 md:w-16 text-red-400" />
              )}
            </div>
          </div>
          
          {/* Answer */}
          <div className="text-center mb-3 sm:mb-4 md:mb-5">
            <p className="text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2">QUESTION:</p>
            <p className="text-white text-sm sm:text-md mb-2 sm:mb-3 md:mb-4 font-medium">{question}</p>
            <p className="text-gray-300 text-xs sm:text-sm mb-1 sm:mb-2">CORRECT ANSWER:</p>
            <p className={`text-base sm:text-lg md:text-xl font-bold mb-1 ${isCorrect ? 'text-green-400' : 'text-white'}`}>
              {correctAnswer}
            </p>
          </div>
          
          {/* Avatar Message */}
          <div className="bg-primary/20 p-2 sm:p-3 md:p-4 rounded-xl border border-accent/20 mb-3 sm:mb-4 md:mb-5 reveal-animation">
            <p className="italic text-white text-sm sm:text-base">
              "{avatarMessage}"
            </p>
            <div className="flex justify-end">
              <span className="text-xs sm:text-sm text-accent">- Kingdom Genius Dr. HB Holmes</span>
            </div>

          </div>
          
          {/* Action Button - Show for both correct and wrong answers */}
          <div className="flex justify-center">
            <Button 
              onClick={() => {
                setUserClickedContinue(true); // Set flag immediately to prevent feedback voice
                voiceService.clearSession(); // Clear feedback session
                // Clear any pending voice timeouts by triggering useEffect cleanup
                onClose(true); // Pass true to indicate manual continue
              }}
              size="sm"
              className={`px-4 sm:px-6 md:px-8 py-1.5 sm:py-2 md:py-3 rounded-xl font-bold text-sm sm:text-base md:text-lg shadow-glow ${
                isCorrect 
                  ? 'bg-gradient-to-r from-accent to-accent-dark text-primary hover:from-accent-light hover:to-accent animate-pulse-slow'
                  : 'bg-gradient-to-r from-secondary to-secondary-dark text-white hover:from-secondary-light hover:to-secondary'
              }`}
            >
              CONTINUE
            </Button>
          </div>
        </div>
        
        {/* Light Decoration - Family Feud Style */}
        <div className="h-3 bg-black flex">
          {Array.from({ length: 20 }).map((_, i) => (
            <div 
              key={i} 
              className={`flex-1 h-full ${
                isCorrect 
                  ? i % 2 === 0 ? 'bg-accent/80' : 'bg-accent-dark/80'
                  : i % 2 === 0 ? 'bg-red-500/80' : 'bg-red-700/80'
              } ${i % 3 === 0 ? 'animate-pulse' : i % 3 === 1 ? 'animate-pulse-slow' : 'animate-pulse-slower'}`} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
