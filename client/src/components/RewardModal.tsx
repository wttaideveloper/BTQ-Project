import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Trophy, Gift, BookOpen, ShoppingBag, Award } from 'lucide-react';
import { playSound } from '@/lib/sounds';
import { playBasicSound } from '@/lib/basic-sound';

export type RewardType = 'book' | 'cap' | 'tshirt' | 'certificate';

interface RewardModalProps {
  type: RewardType;
  message: string;
  onClaim: () => void;
  onClose: () => void;
}

const RewardModal: React.FC<RewardModalProps> = ({
  type,
  message,
  onClaim,
  onClose,
}) => {
  // Play reward sound when modal opens - special sequence for each reward type
  useEffect(() => {
    // Initial fanfare for all rewards
    playSound('fanfare');
    playBasicSound('fanfare'); // Use both sound systems
    
    // Different sequences based on reward importance
    if (type === 'certificate') {
      // Certificate is the highest reward - play perfect score
      setTimeout(() => {
        playSound('perfectScore');
      }, 500);
      setTimeout(() => {
        playSound('applause');
        playBasicSound('applause'); // Use both sound systems
      }, 1200);
    } 
    else if (type === 'tshirt') {
      // T-shirt is a major achievement
      setTimeout(() => {
        playSound('points10');
      }, 500);
      setTimeout(() => {
        playSound('celebration');
      }, 1000);
    }
    else if (type === 'cap') {
      // Cap is a medium achievement
      setTimeout(() => {
        playSound('correctStreak');
      }, 500);
      setTimeout(() => {
        playSound('applause');
      }, 1000);
    }
    else {
      // Book is the entry-level reward
      setTimeout(() => {
        playSound('celebration');
      }, 600);
    }
  }, [type]);
  
  const getRewardInfo = () => {
    switch (type) {
      case 'book':
        return {
          name: 'Bible Study Book',
          description: 'A comprehensive Bible study book with FaithIQ branding',
          icon: <BookOpen className="h-12 w-12 text-yellow-400" />,
          image: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Crect width='180' height='130' x='10' y='10' fill='%23234' rx='5' ry='5'/%3E%3Ctext x='100' y='50' font-family='Arial' font-size='18' fill='%23FFD700' text-anchor='middle'%3EFaithIQ%3C/text%3E%3Ctext x='100' y='80' font-family='Arial' font-size='15' fill='white' text-anchor='middle'%3EBible Study%3C/text%3E%3Ctext x='100' y='110' font-family='Arial' font-size='15' fill='white' text-anchor='middle'%3EBOOK%3C/text%3E%3Cpath d='M30,40 L170,40' stroke='%23FFD700' stroke-width='2'/%3E%3Cpath d='M30,115 L170,115' stroke='%23FFD700' stroke-width='2'/%3E%3Cpath d='M50,60 L60,70 L70,60' fill='none' stroke='white' stroke-width='1'/%3E%3Cpath d='M130,60 L140,70 L150,60' fill='none' stroke='white' stroke-width='1'/%3E%3C/svg%3E`,
          color: 'from-blue-600 to-blue-900',
          bgColor: 'bg-blue-900/30',
          borderColor: 'border-blue-400'
        };
      case 'cap':
        return {
          name: 'FaithIQ Cap',
          description: 'A stylish cap with the official FaithIQ TV show logo',
          icon: <ShoppingBag className="h-12 w-12 text-yellow-400" />,
          image: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Cpath d='M40,90 C40,60 100,50 160,90' fill='%23234' stroke='%23FFD700' stroke-width='3'/%3E%3Cpath d='M40,90 C40,100 50,120 100,120 C150,120 160,100 160,90' fill='%23234' stroke='%23FFD700' stroke-width='3'/%3E%3Cpath d='M100,60 L100,70' stroke='%23FFD700' stroke-width='2'/%3E%3Ctext x='100' y='105' font-family='Arial' font-size='12' fill='white' text-anchor='middle'%3EFaithIQ%3C/text%3E%3Ccircle cx='100' cy='80' r='10' fill='%23FFD700'/%3E%3Ctext x='100' y='84' font-family='Arial' font-size='12' fill='%23234' text-anchor='middle'%3EFI%3C/text%3E%3C/svg%3E`,
          color: 'from-purple-600 to-purple-900',
          bgColor: 'bg-purple-900/30',
          borderColor: 'border-purple-400'
        };
      case 'tshirt':
        return {
          name: 'FaithIQ T-Shirt',
          description: 'A premium quality t-shirt with the Biblical Trivia Champion design',
          icon: <ShoppingBag className="h-12 w-12 text-yellow-400" />,
          image: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Cpath d='M60,40 L85,30 L115,30 L140,40 L150,70 L130,60 L130,120 L70,120 L70,60 L50,70 L60,40' fill='%23234' stroke='%23FFD700' stroke-width='2'/%3E%3Ctext x='100' y='75' font-family='Arial' font-size='16' fill='white' text-anchor='middle'%3EFaithIQ%3C/text%3E%3Ccircle cx='100' cy='45' r='10' fill='%23FFD700'/%3E%3Ctext x='100' y='49' font-family='Arial' font-size='10' fill='%23234' text-anchor='middle'%3EFI%3C/text%3E%3Ctext x='100' y='105' font-family='Arial' font-size='10' fill='%23FFD700' text-anchor='middle'%3ECHAMPION%3C/text%3E%3C/svg%3E`,
          color: 'from-green-600 to-green-900',
          bgColor: 'bg-green-900/30',
          borderColor: 'border-green-400'
        };
      case 'certificate':
        return {
          name: 'Digital Certificate',
          description: 'Official FaithIQ Bible Trivia certificate of achievement',
          icon: <Award className="h-12 w-12 text-yellow-400" />,
          image: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Crect width='180' height='120' x='10' y='15' fill='%23234' stroke='%23FFD700' stroke-width='4' rx='10' ry='10'/%3E%3Ctext x='100' y='45' font-family='Arial' font-size='16' fill='%23FFD700' text-anchor='middle'%3ECertificate of Achievement%3C/text%3E%3Ctext x='100' y='70' font-family='Arial' font-size='14' fill='white' text-anchor='middle'%3EFaithIQ%3C/text%3E%3Ctext x='100' y='90' font-family='Arial' font-size='12' fill='white' text-anchor='middle'%3EBible Trivia Champion%3C/text%3E%3Ccircle cx='50' cy='110' r='15' fill='%23FFD700'/%3E%3Ccircle cx='150' cy='110' r='15' fill='%23FFD700'/%3E%3Cpath d='M30,60 L170,60' stroke='%23FFD700' stroke-width='1' stroke-dasharray='5,5'/%3E%3Cpath d='M30,100 L170,100' stroke='%23FFD700' stroke-width='1' stroke-dasharray='5,5'/%3E%3C/svg%3E`,
          color: 'from-accent to-accent-dark',
          bgColor: 'bg-accent-dark/30',
          borderColor: 'border-accent'
        };
      default:
        return {
          name: 'Reward',
          description: 'You earned a special reward',
          icon: <Gift className="h-12 w-12 text-yellow-400" />,
          image: null,
          color: 'from-primary to-primary-dark',
          bgColor: 'bg-primary-dark/30',
          borderColor: 'border-primary'
        };
    }
  };

  const reward = getRewardInfo();

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className={`modal-animation w-full max-w-lg p-0 rounded-2xl shadow-2xl overflow-hidden border-2 ${reward.borderColor}`}>
        {/* Header - Game Show Style */}
        <div className={`text-center p-3 sm:p-4 bg-gradient-to-r ${reward.color}`}>
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <Trophy className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 text-yellow-300 animate-bounce-slow" />
            <h3 className="text-xl sm:text-2xl md:text-3xl font-heading font-bold text-white">REWARD UNLOCKED!</h3>
            <Trophy className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 text-yellow-300 animate-bounce-slow" />
          </div>
        </div>
        
        {/* Content */}
        <div className="bg-black p-3 sm:p-4 md:p-6">
          {/* Reward Image */}
          <div className="flex flex-col items-center mb-3 sm:mb-4 md:mb-6">
            <div className={`p-2 rounded-xl ${reward.bgColor} border ${reward.borderColor} shadow-xl mb-3 sm:mb-4 w-full max-w-xs`}>
              {reward.image ? (
                <img 
                  src={reward.image} 
                  alt={reward.name} 
                  className="w-full h-auto rounded mx-auto animate-float"
                />
              ) : (
                <div className="flex justify-center py-4 sm:py-6 md:py-8">
                  {reward.icon}
                </div>
              )}
            </div>
            
            <h4 className="text-lg sm:text-xl md:text-2xl font-bold text-accent mb-0.5 sm:mb-1">{reward.name}</h4>
            <p className="text-gray-300 text-xs sm:text-sm text-center">{reward.description}</p>
          </div>
          
          {/* Avatar Message */}
          <div className="bg-primary/20 p-2 sm:p-3 md:p-4 rounded-xl border border-accent/20 mb-3 sm:mb-4 md:mb-5 reveal-animation">
            <p className="italic text-white text-sm sm:text-base">
              "{message}"
            </p>
            <div className="flex justify-end">
              <span className="text-xs sm:text-sm text-accent">- Kingdom Genius Dr. HB Holmes</span>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap sm:flex-nowrap justify-center gap-2 sm:gap-4">
            <Button 
              variant="outline"
              size="sm"
              onClick={onClose}
              className="px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 rounded-xl font-bold bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700 text-xs sm:text-sm"
            >
              CONTINUE
            </Button>
            <Button 
              size="sm"
              onClick={onClaim}
              className={`px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 rounded-xl font-bold text-primary bg-gradient-to-r from-accent to-accent-dark hover:bg-accent shadow-glow animate-pulse-slow text-xs sm:text-sm`}
            >
              CLAIM REWARD
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

export default RewardModal;
