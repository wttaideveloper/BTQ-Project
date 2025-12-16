import React from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, HelpCircle, Mic, MicOff, Bug, Pause, Play, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { toggleSound, toggleVoice, isVoiceEnabled } from '@/lib/sounds';
import { toggleBasicSound } from '@/lib/basic-sound';
import SoundTest from './SoundTest';

interface GameHeaderProps {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  voiceEnabled?: boolean;
  setVoiceEnabled?: (enabled: boolean) => void;
  debugMode?: boolean; // Add debug mode flag
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  gameType?: string;
  gameTimeRemaining?: number;
  originalGameTime?: number;
}

const GameHeader: React.FC<GameHeaderProps> = ({ 
  soundEnabled, 
  setSoundEnabled,
  voiceEnabled = isVoiceEnabled(),
  setVoiceEnabled,
  debugMode = false,
  isPaused = false,
  onPause,
  onResume,
  gameType,
  gameTimeRemaining,
  originalGameTime
}) => {
  const { toast } = useToast();
  const [voiceState, setVoiceState] = React.useState(voiceEnabled);
  const [showDebug, setShowDebug] = React.useState(debugMode);

  React.useEffect(() => {
    if (setVoiceEnabled) {
      setVoiceEnabled(voiceState);
    }
    toggleVoice(voiceState);
  }, [voiceState, setVoiceEnabled]);

  const handleSoundToggle = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    toggleSound(newState);
    toggleBasicSound(newState); // Also toggle the basic sound system
    toast({
      title: newState ? "Sound Enabled" : "Sound Disabled",
      description: newState ? "Game sounds are now on" : "Game sounds are now off",
      duration: 2000,
    });
  };
  
  const handleVoiceToggle = () => {
    const newState = !voiceState;
    setVoiceState(newState);
    toast({
      title: newState ? "Voice Narration Enabled" : "Voice Narration Disabled",
      description: newState ? "Question narration is now on" : "Question narration is now off",
      duration: 2000,
    });
  };

  const handleHelp = () => {
    toast({
      title: "How to Play",
      description: "Select the correct answer from the four options. You have 20 seconds per question. Earn points for each correct answer!",
      duration: 5000,
    });
  };
  
  const toggleDebugPanel = () => {
    setShowDebug(prev => !prev);
  };

  const handlePauseResume = () => {
    if (isPaused) {
      onResume?.();
      toast({
        title: "Game Resumed",
        description: "The game has been resumed. Good luck!",
        duration: 2000,
      });
    } else {
      onPause?.();
      toast({
        title: "Game Paused",
        description: "The game has been paused. Take your time!",
        duration: 2000,
      });
    }
  };

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage for time-based games
  const getTimeProgress = () => {
    if (!originalGameTime || !gameTimeRemaining) return 0;
    return ((originalGameTime - gameTimeRemaining) / originalGameTime) * 100;
  };

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <header className="relative flex flex-wrap justify-between items-center mb-2 z-10 gap-2 min-w-0 w-full">
        <div className="flex items-center min-w-0 flex-shrink">
          <h1 className="game-title text-2xl sm:text-3xl md:text-4xl font-heading font-bold text-primary whitespace-nowrap">
            Faith<span className="text-accent">IQ</span>
          </h1>
          <span className="ml-1 sm:ml-2 bg-accent text-primary px-1 sm:px-2 py-1 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap flex-shrink-0">Bible Trivia</span>
        </div>
        
        <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0 flex-wrap">
          {/* Timer for time-based games */}
          {gameType === 'time' && gameTimeRemaining !== undefined && (
            <div className="flex items-center gap-1 sm:gap-2 bg-gradient-to-r from-orange-500 to-red-500 text-white px-2 sm:px-3 py-1 rounded-full shadow-lg flex-shrink-0">
              <Clock size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="font-bold text-xs sm:text-sm whitespace-nowrap">{formatTime(gameTimeRemaining)}</span>
              <div className="w-12 sm:w-16 h-1 bg-white/30 rounded-full overflow-hidden flex-shrink-0">
                <div 
                  className="h-full bg-white transition-all duration-1000 ease-linear"
                  style={{ width: `${getTimeProgress()}%` }}
                />
              </div>
            </div>
          )}

          {/* Pause/Resume Button */}
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handlePauseResume}
            className={`rounded-full transition-all duration-200 ${
              isPaused 
                ? 'bg-green-500 text-white hover:bg-green-600 border-green-500' 
                : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
            }`}
            title={isPaused ? "Resume game" : "Pause game"}
          >
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </Button>

          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleSoundToggle}
            className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
            title={soundEnabled ? "Disable sounds" : "Enable sounds"}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleVoiceToggle}
            className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
            title={voiceState ? "Disable voice narration" : "Enable voice narration"}
          >
            {voiceState ? <Mic size={18} /> : <MicOff size={18} />}
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleHelp}
            className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
            title="How to play"
          >
            <HelpCircle size={18} />
          </Button>
          
          {/* Debug button - hidden in production */}
          {/* <Button 
            variant="outline" 
            size="icon" 
            onClick={toggleDebugPanel}
            className="rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
            title="Debug sound system"
          >
            <Bug size={18} />
          </Button> */}
        </div>
      </header>
      
      {/* Sound test panel */}
      {showDebug && <SoundTest />}
    </div>
  );
};

export default GameHeader;
