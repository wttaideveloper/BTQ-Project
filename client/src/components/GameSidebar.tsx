import React from 'react';
import { Button } from '@/components/ui/button';
import { Home, Users } from 'lucide-react';
import { Link } from 'wouter';
import Avatar from './Avatar';

interface GameStats {
  correctAnswers: number;
  incorrectAnswers: number;
  averageTime: number;
}

interface PlayerStat {
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageTime: number;
  totalTimeSpent?: number;
}

interface RewardProgress {
  book: {
    current: number;
    required: number;
    achieved: boolean;
  };
  cap: {
    current: number;
    required: number;
    achieved: boolean;
  };
  tshirt: {
    current: number;
    required: number;
    achieved: boolean;
  };
}

interface GameSidebarProps {
  avatarMessage: string;
  avatarAnimation: 'happy' | 'sad' | 'neutral' | 'excited' | 'encouraging' | 'blessing';
  stats: GameStats;
  rewardProgress: RewardProgress;
  playerStats?: PlayerStat[];
  playerNames?: string[];
  currentPlayerIndex?: number;
  isMultiplayer?: boolean;
}

const GameSidebar: React.FC<GameSidebarProps> = ({
  avatarMessage,
  avatarAnimation,
  stats,
  rewardProgress,
  playerStats = [],
  playerNames = [],
  currentPlayerIndex = 0,
  isMultiplayer = false
}) => {
  const accuracy = stats.correctAnswers + stats.incorrectAnswers > 0
    ? Math.round((stats.correctAnswers / (stats.correctAnswers + stats.incorrectAnswers)) * 100)
    : 0;

  // Color schemes for different players
  const playerColors = [
    { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500' },
    { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500' },
    { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500' },
    { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500' }
  ];

  return (
    <div className="w-full md:w-80 flex flex-col gap-3 sm:gap-4">
      {/* Avatar Section - Family Feud Style Host */}
      <div className="bg-gradient-to-r from-secondary to-secondary-dark p-2 rounded-2xl shadow-2xl transform hover:scale-102 transition-transform duration-300">
        <Avatar message={avatarMessage} animation={avatarAnimation} />
      </div>
      
      {/* Player Stats - Family Feud Style Board */}
      <div className="bg-gradient-to-r from-primary to-primary-dark rounded-2xl shadow-2xl overflow-hidden border border-accent/30">
        <div className="p-2 sm:p-3 bg-gradient-to-r from-accent to-accent-dark text-primary font-heading font-bold text-center text-base sm:text-lg flex items-center justify-center gap-1 sm:gap-2">
          {isMultiplayer ? <Users className="h-4 w-4 sm:h-5 sm:w-5" /> : null} 
          PLAYER STATS
        </div>
        
        <div className="p-2 sm:p-3 md:p-4 bg-black">
          {!isMultiplayer || playerStats.length === 0 ? (
            // Single player stats view
            <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
              <div className="flex justify-between items-center bg-primary-dark/50 p-2 sm:p-3 rounded-xl reveal-animation" style={{animationDelay: '0.1s'}}>
                <span className="text-white text-sm sm:text-base font-medium">Correct:</span>
                <span className="font-bold text-green-400 bg-black/30 px-2 sm:px-3 py-0.5 sm:py-1 text-sm sm:text-base rounded-lg">{stats.correctAnswers}</span>
              </div>
              <div className="flex justify-between items-center bg-primary-dark/50 p-2 sm:p-3 rounded-xl reveal-animation" style={{animationDelay: '0.2s'}}>
                <span className="text-white text-sm sm:text-base font-medium">Incorrect:</span>
                <span className="font-bold text-red-400 bg-black/30 px-2 sm:px-3 py-0.5 sm:py-1 text-sm sm:text-base rounded-lg">{stats.incorrectAnswers}</span>
              </div>
              <div className="flex justify-between items-center bg-primary-dark/50 p-2 sm:p-3 rounded-xl reveal-animation" style={{animationDelay: '0.3s'}}>
                <span className="text-white text-sm sm:text-base font-medium">Accuracy:</span>
                <span className="font-bold text-blue-400 bg-black/30 px-2 sm:px-3 py-0.5 sm:py-1 text-sm sm:text-base rounded-lg">{accuracy}%</span>
              </div>
              <div className="flex justify-between items-center bg-primary-dark/50 p-2 sm:p-3 rounded-xl reveal-animation" style={{animationDelay: '0.4s'}}>
                <span className="text-white text-sm sm:text-base font-medium">Avg. Time:</span>
                <span className="font-bold text-yellow-400 bg-black/30 px-2 sm:px-3 py-0.5 sm:py-1 text-sm sm:text-base rounded-lg">{stats.averageTime.toFixed(1)}s</span>
              </div>
            </div>
          ) : (
            // Multiplayer stats view
            <div className="flex flex-col gap-2 sm:gap-3">
              {playerStats.map((playerStat, index) => {
                const colorScheme = playerColors[index % playerColors.length];
                const playerAccuracy = playerStat.correctAnswers + playerStat.incorrectAnswers > 0
                  ? Math.round((playerStat.correctAnswers / (playerStat.correctAnswers + playerStat.incorrectAnswers)) * 100)
                  : 0;
                
                return (
                  <div 
                    key={index} 
                    className={`p-2 sm:p-3 rounded-xl border ${index === currentPlayerIndex ? colorScheme.border : 'border-gray-700'} 
                      ${index === currentPlayerIndex ? colorScheme.bg : 'bg-gray-800/30'}
                      transition-all duration-300 transform ${index === currentPlayerIndex ? 'scale-102 sm:scale-105' : ''}`}
                  >
                    <div className="flex justify-between items-center mb-1 sm:mb-2">
                      <span className={`font-bold text-xs sm:text-sm ${index === currentPlayerIndex ? colorScheme.text : 'text-gray-300'}`}>
                        {playerNames[index] || `Player ${index + 1}`}
                      </span>
                      <span className="font-bold text-accent bg-black/30 px-1.5 sm:px-2 py-0.5 rounded-lg text-xs sm:text-sm">
                        {playerStat.score} pts
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1 sm:gap-2 text-xs sm:text-sm">
                      <div className="flex flex-col items-center bg-black/20 p-1 sm:p-1.5 rounded min-w-0">
                        <span className="text-gray-400 text-[10px] sm:text-xs mb-0.5">Correct</span>
                        <span className="font-bold text-green-400 truncate">{playerStat.correctAnswers}</span>
                      </div>
                      <div className="flex flex-col items-center bg-black/20 p-1 sm:p-1.5 rounded min-w-0">
                        <span className="text-gray-400 text-[10px] sm:text-xs mb-0.5">Wrong</span>
                        <span className="font-bold text-red-400 truncate">{playerStat.incorrectAnswers}</span>
                      </div>
                      <div className="flex flex-col items-center bg-black/20 p-1 sm:p-1.5 rounded min-w-0">
                        <span className="text-gray-400 text-[10px] sm:text-xs mb-0.5">Accuracy</span>
                        <span className="font-bold text-blue-400 truncate">{playerAccuracy}%</span>
                      </div>
                      <div className="flex flex-col items-center bg-black/20 p-1 sm:p-1.5 rounded min-w-0">
                        <span className="text-gray-400 text-[10px] sm:text-xs mb-0.5">Time</span>
                        <span className="font-bold text-yellow-400 truncate">{playerStat.averageTime.toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Rewards Progress - Family Feud Style */}
          <div className="mt-3 sm:mt-4 bg-black/50 p-2 sm:p-3 md:p-4 rounded-xl border border-secondary/30">
            <h4 className="text-white font-bold mb-2 sm:mb-3 text-center text-sm sm:text-base">REWARDS PROGRESS</h4>
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              <div className={`score-indicator text-center p-1 sm:p-2 rounded-xl ${rewardProgress.book.achieved 
                ? 'bg-gradient-to-b from-green-500/30 to-green-700/30 border border-green-500' 
                : 'bg-gradient-to-b from-primary/30 to-primary-dark/30 border border-primary/30'}`}
              >
                <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 mx-auto rounded-full flex items-center justify-center ${
                  rewardProgress.book.achieved ? 'bg-green-500/20' : 'bg-accent/20'
                }`}>
                  <span className={`text-xs sm:text-sm ${rewardProgress.book.achieved ? 'text-green-400' : 'text-accent'}`}>
                    {rewardProgress.book.current}/{rewardProgress.book.required}
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs mt-1 font-bold text-white">Book</p>
                {rewardProgress.book.achieved && 
                  <span className="text-green-400 text-[8px] sm:text-xs">UNLOCKED!</span>
                }
              </div>
              <div className={`score-indicator text-center p-1 sm:p-2 rounded-xl ${rewardProgress.cap.achieved 
                ? 'bg-gradient-to-b from-green-500/30 to-green-700/30 border border-green-500' 
                : 'bg-gradient-to-b from-primary/30 to-primary-dark/30 border border-primary/30'}`}
              >
                <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 mx-auto rounded-full flex items-center justify-center ${
                  rewardProgress.cap.achieved ? 'bg-green-500/20' : 'bg-accent/20'
                }`}>
                  <span className={`text-xs sm:text-sm ${rewardProgress.cap.achieved ? 'text-green-400' : 'text-accent'}`}>
                    {rewardProgress.cap.current}/{rewardProgress.cap.required}
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs mt-1 font-bold text-white">Cap</p>
                {rewardProgress.cap.achieved && 
                  <span className="text-green-400 text-[8px] sm:text-xs">UNLOCKED!</span>
                }
              </div>
              <div className={`score-indicator text-center p-1 sm:p-2 rounded-xl ${rewardProgress.tshirt.achieved 
                ? 'bg-gradient-to-b from-green-500/30 to-green-700/30 border border-green-500' 
                : 'bg-gradient-to-b from-primary/30 to-primary-dark/30 border border-primary/30'}`}
              >
                <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 mx-auto rounded-full flex items-center justify-center ${
                  rewardProgress.tshirt.achieved ? 'bg-green-500/20' : 'bg-accent/20'
                }`}>
                  <span className={`text-xs sm:text-sm ${rewardProgress.tshirt.achieved ? 'text-green-400' : 'text-accent'}`}>
                    {rewardProgress.tshirt.current}/{rewardProgress.tshirt.required}
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs mt-1 font-bold text-white">T-Shirt</p>
                {rewardProgress.tshirt.achieved && 
                  <span className="text-green-400 text-[8px] sm:text-xs">UNLOCKED!</span>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Game Options - Family Feud Style */}
      <div className="mt-3 sm:mt-auto">
        <Link href="/">
          <Button 
            className="w-full bg-gradient-to-r from-red-600 to-red-800 text-white py-2 sm:py-3 rounded-xl hover:from-red-700 hover:to-red-900 font-bold flex items-center justify-center text-sm sm:text-base md:text-lg shadow-lg"
          >
            <Home className="mr-1 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" /> EXIT GAME
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default GameSidebar;
