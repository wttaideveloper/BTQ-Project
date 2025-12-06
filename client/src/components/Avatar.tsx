import React, { useState, useEffect } from 'react';
import holmesImagePath from '@assets/HP HOLMES.jpg';

interface AvatarProps {
  message: string;
  animation: 'happy' | 'sad' | 'neutral' | 'excited' | 'encouraging' | 'blessing';
}

const Avatar: React.FC<AvatarProps> = ({ message, animation }) => {
  const [animationClass, setAnimationClass] = useState('');
  const [speechClass, setSpeechClass] = useState('');
  const [isMessageShowing, setIsMessageShowing] = useState(false);

  // Effect for avatar animation based on emotion - Family Feud style
  useEffect(() => {
    let animClass = '';
    let speechClass = '';
    
    switch (animation) {
      case 'happy':
        animClass = 'animate-bounce-slow';
        speechClass = 'border-green-500 bg-green-500/10';
        break;
      case 'sad':
        animClass = 'animate-shake';
        speechClass = 'border-red-500 bg-red-500/10';
        break;
      case 'excited':
        animClass = 'animate-bounce';
        speechClass = 'border-yellow-500 bg-yellow-500/10';
        break;
      case 'blessing':
        animClass = 'animate-float';
        speechClass = 'border-purple-500 bg-purple-500/10';
        break;
      case 'encouraging':
        animClass = 'animate-pulse-slow';
        speechClass = 'border-blue-500 bg-blue-500/10';
        break;
      default:
        animClass = 'animate-float';
        speechClass = 'border-accent bg-accent/10';
    }
    
    setAnimationClass(animClass);
    setSpeechClass(speechClass);
    
    // Reset message animation for Family Feud style reveal
    setIsMessageShowing(false);
    const timeout = setTimeout(() => {
      setIsMessageShowing(true);
    }, 300);
    
    return () => clearTimeout(timeout);
  }, [animation, message]);

  return (
    <div className="avatar-container bg-black rounded-xl overflow-hidden relative">
      {/* Family Feud Style Host Header */}
      <div className="p-3 bg-gradient-to-r from-accent to-accent-dark text-primary font-heading font-bold text-center text-lg shadow-md relative z-10">
        Kingdom Genius Dr. HB Holmes
      </div>
      
      <div className="flex flex-col items-center px-4 py-5 relative">
        {/* Glow Effect Behind Avatar - Family Feud Style */}
        <div className="absolute top-5 left-1/2 transform -translate-x-1/2 w-28 h-28 bg-accent/30 rounded-full filter blur-md"></div>
        
        {/* Avatar with Animation */}
        <div className={`relative z-10 ${animationClass}`}>
          <img 
            src={holmesImagePath} 
            alt="Kingdom Genius Dr. HB Holmes - Bible Trivia Quiz Master" 
            className="w-28 h-28 rounded-full border-4 border-accent object-cover shadow-2xl mb-4"
          />
          
          {/* Family Feud Style Decorative Elements */}
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-secondary text-white px-3 py-0.5 rounded-full font-bold text-xs whitespace-nowrap shadow-md">
            BIBLE GENIUS
          </div>
        </div>
        
        {/* Family Feud Style Speech Bubble */}
        <div 
          className={`avatar-speech-bubble border-2 ${speechClass} p-4 rounded-xl shadow-xl w-full mt-3 text-center relative ${isMessageShowing ? 'reveal-animation' : 'opacity-0'}`}
        >
          {/* Decorative Top Triangle - Family Feud Style */}
          <div className={`absolute -top-4 left-1/2 transform -translate-x-1/2 w-0 h-0 
            border-l-[10px] border-l-transparent 
            border-r-[10px] border-r-transparent 
            border-b-[15px] ${speechClass.includes('green') 
              ? 'border-b-green-500' 
              : speechClass.includes('red')
                ? 'border-b-red-500'
                : speechClass.includes('yellow')
                  ? 'border-b-yellow-500'
                  : speechClass.includes('purple')
                    ? 'border-b-purple-500'
                    : speechClass.includes('blue')
                      ? 'border-b-blue-500'
                      : 'border-b-accent'
            }`}
          ></div>
          
          <p className="text-white font-medium">"{message}"</p>
        </div>
      </div>
    </div>
  );
};

export default Avatar;
