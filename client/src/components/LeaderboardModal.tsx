import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Trophy, Medal, Award, Timer, CheckCircle2, Crown } from 'lucide-react';
import { playSound } from '@/lib/sounds';

export interface Player {
  id: string;
  name: string;
  score: number;
  correctAnswers: number;
  avgTime: number;
  isCurrentUser?: boolean;
}

interface LeaderboardModalProps {
  players: Player[];
  onClose: () => void;
  isGameOver?: boolean;
  onPlayAgain?: () => void;
}

const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ 
  players, 
  onClose,
  isGameOver = false,
  onPlayAgain
}) => {
  // Sort players with proper tie-breaking logic
  const sortedPlayers = [...players].sort((a, b) => {
    // Primary: Sort by score (highest first)
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie-breaker 1: Sort by correct answers (highest first)
    if (b.correctAnswers !== a.correctAnswers) {
      return b.correctAnswers - a.correctAnswers;
    }
    // Tie-breaker 2: Sort by average time (lowest/fastest first)
    // Handle undefined/NaN values
    const aTime = a.avgTime || 0;
    const bTime = b.avgTime || 0;
    return aTime - bTime;
  });
  const hasWinner = sortedPlayers.length > 0 && isGameOver;
  const winner = hasWinner ? sortedPlayers[0] : null;
  
  // Check if there's a tie (multiple players with same score and correct answers)
  // If avgTime is undefined or very close, it's a tie
  const isTie = hasWinner && sortedPlayers.length > 1 && 
    sortedPlayers[0].score === sortedPlayers[1].score &&
    sortedPlayers[0].correctAnswers === sortedPlayers[1].correctAnswers &&
    (
      // Both have no time data, or times are very close (within 0.5 seconds)
      (!sortedPlayers[0].avgTime && !sortedPlayers[1].avgTime) ||
      (sortedPlayers[0].avgTime && sortedPlayers[1].avgTime && 
       Math.abs(sortedPlayers[0].avgTime - sortedPlayers[1].avgTime) < 0.5)
    );
  
  // Debug logging
  console.log("🏆 LeaderboardModal Render:", {
    hasWinner,
    isTie,
    winner: winner ? {
      name: winner.name,
      score: winner.score,
      correctAnswers: winner.correctAnswers,
      avgTime: winner.avgTime
    } : null,
    allPlayers: sortedPlayers.map(p => ({
      name: p.name,
      score: p.score,
      correctAnswers: p.correctAnswers,
      avgTime: p.avgTime
    }))
  });
  
  // Play victory sounds for game over - Game Show style!
  useEffect(() => {
    if (isGameOver && hasWinner) {
      // Initial winning sequence sound
      playSound('fanfare');
      
      // Determine if the winner is a landslide victory or close race
      const isLandslideVictory = sortedPlayers.length > 1 && 
        (sortedPlayers[0].score >= sortedPlayers[1].score * 1.5);
      
      // Different sound sequence based on victory type
      if (isLandslideVictory) {
        // Dramatic celebration for dominant wins
        setTimeout(() => {
          playSound('perfectScore');
        }, 500);
        
        setTimeout(() => {
          playSound('celebration');
        }, 1000);
        
        setTimeout(() => {
          playSound('applause');
        }, 1500);
      } else {
        // More subdued celebration for close wins
        setTimeout(() => {
          playSound('points10');
        }, 600);
        
        setTimeout(() => {
          playSound('applause');
        }, 1200);
      }
      
      // Check if the current user is the winner for extra special sounds
      if (winner?.isCurrentUser) {
        // Extra celebration for user victory
        setTimeout(() => {
          playSound('correctStreak');
        }, 2000);
      }
    } else if (isGameOver) {
      // End of game but no clear winner (tie or empty leaderboard)
      playSound('fanfare');
    }
  }, [isGameOver, hasWinner, winner, sortedPlayers]);
  
  // Define player badge colors - Family Feud style
  const playerColors = [
    { bg: 'bg-accent', text: 'text-primary', border: 'border-accent', glow: 'shadow-accent/50' },
    { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-400', glow: 'shadow-blue-500/50' },
    { bg: 'bg-green-500', text: 'text-white', border: 'border-green-400', glow: 'shadow-green-500/50' },
    { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-400', glow: 'shadow-orange-500/50' }
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="modal-animation w-full max-w-lg p-0 rounded-2xl shadow-2xl overflow-hidden border-2 border-accent">
        {/* Header - Game Show Style */}
        <div className="bg-gradient-to-r from-primary to-primary-dark p-2 sm:p-3 md:p-4">
          <div className="flex items-center justify-center">
            <Trophy className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-accent animate-bounce-slow mr-2 sm:mr-3" />
            <h3 className="text-xl sm:text-2xl md:text-3xl font-heading font-bold text-white">
              {isGameOver ? 'FINAL SCORES' : 'LEADERBOARD'}
            </h3>
            <Trophy className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 text-accent animate-bounce-slow ml-2 sm:ml-3" />
          </div>
        </div>
        
        {/* Content */}
        <div className="bg-black p-3 sm:p-4 md:p-6">
          {/* Winner Highlight - only show if game is over */}
          {hasWinner && isGameOver && winner && (
            <div className="bg-gradient-to-r from-accent/20 to-accent-dark/20 border-2 border-accent rounded-xl p-2 sm:p-3 md:p-4 mb-3 sm:mb-4 md:mb-6 reveal-animation">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Crown className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-accent animate-pulse-slow mr-2 sm:mr-3" />
                  <div>
                    <h4 className="text-lg sm:text-xl md:text-2xl font-bold text-white">
                      {isTie ? "IT'S A TIE!" : winner?.isCurrentUser ? 'YOU WIN!' : `${winner?.name || 'Player'} WINS!`}
                    </h4>
                    <p className="text-accent text-xs sm:text-sm">
                      {isTie ? `Both players: ${winner?.correctAnswers || 0} correct answers` : `${winner?.correctAnswers || 0} correct answers in an average of ${(winner?.avgTime || 0).toFixed(1)}s`}
                    </p>
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-accent animate-pulse-slow">
                  {winner?.score || 0}
                </div>
              </div>
            </div>
          )}
          
          {/* Players List */}
          <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4 md:mb-6">
            {sortedPlayers.map((player, index) => {
              const colorScheme = playerColors[index % playerColors.length];
              
              return (
                <div 
                  key={player.id}
                  className={`flex items-center p-2 sm:p-3 md:p-4 rounded-xl transition-all ${
                    index === 0 && isGameOver 
                      ? 'bg-gradient-to-r from-accent/20 to-accent-dark/20 border border-accent/50 animate-pulse-slow transform scale-102 sm:scale-105' 
                      : 'bg-primary-dark/30 border border-primary-dark/50'
                  }`}
                >
                  {/* Rank Badge */}
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold mr-2 sm:mr-3 md:mr-4 ${colorScheme.bg} ${
                    index === 0 ? 'shadow-glow' : ''
                  }`}>
                    {index === 0 ? (
                      <Trophy className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-primary" />
                    ) : index === 1 ? (
                      <Medal className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                    ) : index === 2 ? (
                      <Award className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                    ) : (
                      <span className="text-white text-xs sm:text-sm md:text-base">{index + 1}</span>
                    )}
                  </div>
                  
                  {/* Player Info */}
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center flex-wrap">
                      <p className={`font-bold text-sm sm:text-base md:text-lg truncate ${
                        player.isCurrentUser ? 'text-accent' : 'text-white'
                      }`}>
                        {player.isCurrentUser ? 'YOU' : player.name}
                      </p>
                      {player.isCurrentUser && (
                        <span className="ml-1 sm:ml-2 bg-accent/20 text-accent text-[8px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full">
                          YOU
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center flex-wrap mt-0.5 sm:mt-1">
                      <div className="flex items-center text-[8px] sm:text-xs text-gray-300 mr-2 sm:mr-3">
                        <CheckCircle2 className="h-2 w-2 sm:h-3 sm:w-3 text-green-400 mr-0.5 sm:mr-1" />
                        <span>Correct: <span className="text-green-400 font-medium">{player.correctAnswers || 0}</span></span>
                      </div>
                      <div className="flex items-center text-[8px] sm:text-xs text-gray-300">
                        <Timer className="h-2 w-2 sm:h-3 sm:w-3 text-yellow-400 mr-0.5 sm:mr-1" />
                        <span>Time: <span className="text-yellow-400 font-medium">{(player.avgTime || 0).toFixed(1)}s</span></span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Score */}
                  <div className={`font-bold text-base sm:text-xl md:text-2xl pl-1 ${
                    index === 0 ? 'text-accent' : 'text-white'
                  }`}>
                    {player.score || 0}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Action Buttons */}
          <div className={`flex gap-2 sm:gap-3 ${isGameOver && onPlayAgain ? 'justify-between' : 'justify-center'}`}>
            {isGameOver && onPlayAgain && (
              <Button 
                onClick={onPlayAgain}
                size="sm"
                className="flex-1 px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 md:py-3 rounded-xl font-bold text-xs sm:text-sm md:text-lg shadow-glow bg-gradient-to-r from-accent to-accent-dark text-primary hover:from-accent-light hover:to-accent animate-pulse-slow"
              >
                PLAY AGAIN
              </Button>
            )}
            <Button 
              onClick={onClose}
              size="sm"
              className={`${isGameOver && onPlayAgain ? 'flex-1' : ''} px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 md:py-3 rounded-xl font-bold text-xs sm:text-sm md:text-lg shadow-glow ${
                isGameOver && !onPlayAgain
                  ? 'bg-gradient-to-r from-accent to-accent-dark text-primary hover:from-accent-light hover:to-accent animate-pulse-slow'
                  : 'bg-gradient-to-r from-secondary to-secondary-dark text-white hover:from-secondary-light hover:to-secondary'
              }`}
            >
              {isGameOver ? 'RETURN TO HOME' : 'CONTINUE PLAYING'}
            </Button>
          </div>
        </div>
        
        {/* Light Decoration - Family Feud Style */}
        <div className="h-3 bg-black flex">
          {Array.from({ length: 20 }).map((_, i) => (
            <div 
              key={i} 
              className={`flex-1 h-full ${
                i % 2 === 0 ? 'bg-accent/80' : 'bg-accent-dark/80'
              } ${i % 3 === 0 ? 'animate-pulse' : i % 3 === 1 ? 'animate-pulse-slow' : 'animate-pulse-slower'}`} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardModal;
