import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 50, className = '' }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 200 200" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block ${className}`}
    >
      {/* Background circle */}
      <circle cx="100" cy="100" r="95" fill="#2C3E50" stroke="#FFD54F" strokeWidth="10" />
      
      {/* Crown Symbol */}
      <path 
        d="M50 70L75 110L100 60L125 110L150 70V130H50V70Z" 
        fill="#FFD54F" 
        stroke="#2C3E50" 
        strokeWidth="4"
      />
      
      {/* Book Symbol */}
      <path 
        d="M60 130C60 120 140 120 140 130V160C140 170 60 170 60 160V130Z" 
        fill="#3498DB" 
        stroke="#2C3E50" 
        strokeWidth="4"
      />
      
      {/* Book Spine */}
      <path 
        d="M100 130V170" 
        stroke="#2C3E50" 
        strokeWidth="4"
      />
      
      {/* Cross Icon */}
      <path 
        d="M95 140H105V150H115V160H105V170H95V160H85V150H95V140Z" 
        fill="#FFD54F" 
        stroke="#2C3E50" 
        strokeWidth="2"
      />
      
      {/* Letters FI initials for FaithIQ */}
      <text x="65" y="105" fill="#FFFFFF" fontSize="40" fontWeight="bold" fontFamily="Arial">FI</text>
    </svg>
  );
};

export default Logo;