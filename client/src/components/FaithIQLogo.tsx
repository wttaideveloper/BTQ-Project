import React from 'react';

interface FaithIQLogoProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

// Direct SVG representation as JSX
const FaithIQLogo: React.FC<FaithIQLogoProps> = ({ 
  size = 140, 
  className = '', 
  animate = true
}) => {
  return (
    <div 
      className={`relative ${animate ? 'animate-float' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 300 300" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className={`${animate ? 'animate-pulse-slow' : ''}`}
        style={{
          filter: 'drop-shadow(0 2px 5px rgba(0, 0, 0, 0.2))',
        }}
      >
        {/* Background */}
        <rect width="300" height="300" rx="20" fill="url(#gradient)" />
        
        {/* Tree */}
        <g className={`${animate ? 'animate-grow-leaves' : ''}`}>
          <path d="M150 110 Q150 110 140 95 Q130 80 150 55 Q170 80 160 95 Q150 110 150 110 Z" fill="white"/>
          <path d="M150 110 Q130 105 120 95 Q110 85 125 70 Q135 85 140 90 Q145 95 150 110 Z" fill="white"/>
          <path d="M150 110 Q170 105 180 95 Q190 85 175 70 Q165 85 160 90 Q155 95 150 110 Z" fill="white"/>
          <path d="M125 70 Q115 65 105 55 Q95 45 110 30 Q120 45 125 50 Q130 55 125 70 Z" fill="white"/>
          <path d="M175 70 Q185 65 195 55 Q205 45 190 30 Q180 45 175 50 Q170 55 175 70 Z" fill="white"/>
          <path d="M150 55 Q145 45 145 35 Q145 25 150 10 Q155 25 155 35 Q155 45 150 55 Z" fill="white"/>
          <path d="M150 110 L150 140 Q145 145 150 150 Q155 145 150 140 Z" fill="white"/>
        </g>
        
        {/* FAITHIQ Text */}
        <text 
          x="150" 
          y="220" 
          fontFamily="Arial, sans-serif" 
          fontSize="35" 
          fontWeight="bold" 
          textAnchor="middle" 
          fill="white"
          className={`${animate ? 'animate-shimmer' : ''}`}
        >
          FAITHIQ
        </text>
        
        {/* Tagline */}
        <text 
          x="150" 
          y="250" 
          fontFamily="Arial, sans-serif" 
          fontSize="12" 
          fontWeight="600" 
          textAnchor="middle" 
          fill="rgba(255,255,255,0.9)"
          className={`${animate ? 'animate-shimmer' : ''}`}
        >
          FAITH. VALUE. REWARD.
        </text>
        
        {/* Underline */}
        <line x1="100" y1="260" x2="200" y2="260" stroke="white" strokeWidth="2" />
        
        {/* Gradient definition */}
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="1" />
            <stop offset="100%" stopColor="#5b21b6" stopOpacity="1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default FaithIQLogo;