import React from "react";

interface BrandLogoProps {
  onClick?: () => void;
  className?: string;
}

const BrandLogo: React.FC<BrandLogoProps> = ({ onClick, className = "" }) => {
  const content = (
    <>
      <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
        <span className="text-primary font-bold text-lg">F</span>
      </div>
      <span className="text-xl font-bold text-white whitespace-nowrap">
        Faith<span className="text-accent">IQ</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-2.5 hover:opacity-90 transition-opacity cursor-pointer ${className}`}
        aria-label="Go to dashboard"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>{content}</div>
  );
};

export default BrandLogo;
