import React, { useEffect, useRef, useState } from "react";

interface ClockCountdownProps {
  countdown: number;
  message?: string;
  subMessage?: string;
}

const ClockCountdown: React.FC<ClockCountdownProps> = ({
  countdown,
  message = "Both teams are ready",
  subMessage,
}) => {
  const [progress, setProgress] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const previousCountdownRef = useRef(countdown);
  const initialCountdownRef = useRef<number | null>(null);

  // Initialize when countdown starts
  useEffect(() => {
    // If countdown increased or is being reset, initialize
    if (countdown > previousCountdownRef.current || initialCountdownRef.current === null) {
      initialCountdownRef.current = countdown;
      previousCountdownRef.current = countdown;
      setProgress(0);
      startTimeRef.current = null;
      
      // Cancel any existing animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
    
    previousCountdownRef.current = countdown;
  }, [countdown]);

  // Smooth progress animation
  useEffect(() => {
    if (countdown <= 0 || initialCountdownRef.current === null) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setProgress(100);
      return;
    }

    const totalTime = initialCountdownRef.current;
    const currentSecond = totalTime - countdown; // How many full seconds have elapsed

    const animate = (timestamp: number) => {
      // Initialize start time
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp - (currentSecond * 1000);
      }

      const elapsed = (timestamp - startTimeRef.current) / 1000; // Total elapsed time in seconds
      const remaining = Math.max(0, totalTime - elapsed);
      
      // Calculate smooth progress (0 to 100%)
      const overallProgress = Math.min(100, (elapsed / totalTime) * 100);
      setProgress(overallProgress);

      // Sync with parent countdown updates
      const expectedRemaining = countdown;
      const expectedElapsed = totalTime - expectedRemaining;
      
      // If we're out of sync (more than 0.2 seconds difference), resync
      if (Math.abs(elapsed - expectedElapsed) > 0.2) {
        startTimeRef.current = timestamp - (expectedElapsed * 1000);
      }

      // Continue animation if there's time remaining
      if (remaining > 0 && countdown > 0) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [countdown]);

  // Calculate circle properties
  const size = 280;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  // Use a consistent color for the loader (blue gradient)
  const ringColor = "rgb(59, 130, 246)"; // blue-500

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="relative flex flex-col items-center justify-center">
        {/* Outer glow effect */}
        <div
          className="absolute rounded-full blur-3xl opacity-30 transition-all duration-500"
          style={{
            width: size + 80,
            height: size + 80,
            background: `radial-gradient(circle, ${ringColor}40, transparent 70%)`,
            animation: "pulse-glow 2s ease-in-out infinite",
          }}
        />

        {/* Main clock container */}
        <div className="relative">
          {/* Circular progress ring */}
          <svg
            width={size}
            height={size}
            className="transform -rotate-90 transition-all duration-300"
            style={{
              filter: `drop-shadow(0 0 20px ${ringColor}60)`,
            }}
          >
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={ringColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-100 ease-linear"
              style={{
                filter: `drop-shadow(0 0 8px ${ringColor})`,
              }}
            />
            {/* Tick marks */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 - 90) * (Math.PI / 180);
              const innerRadius = radius - strokeWidth / 2 - 5;
              const outerRadius = radius - strokeWidth / 2;
              const x1 = size / 2 + innerRadius * Math.cos(angle);
              const y1 = size / 2 + innerRadius * Math.sin(angle);
              const x2 = size / 2 + outerRadius * Math.cos(angle);
              const y2 = size / 2 + outerRadius * Math.sin(angle);

              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Three dot loader */}
            <div className="flex items-center justify-center gap-3 mb-4">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: "16px",
                    height: "16px",
                    backgroundColor: ringColor,
                    animation: `dot-bounce 1.4s ease-in-out infinite`,
                    animationDelay: `${index * 0.2}s`,
                    boxShadow: `0 0 20px ${ringColor}80, 0 0 40px ${ringColor}40`,
                  }}
                />
              ))}
            </div>
            {subMessage ? (
              <p className="text-sm sm:text-base font-medium text-white/90 mt-2 text-center px-4">
                {subMessage}
              </p>
            ) : null}
          </div>
        </div>

        {/* Top message */}
        <div className="mt-8 text-center">
          <p className="text-base sm:text-lg font-semibold text-white/90 mb-1">
            {message}
          </p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: ringColor }}
            />
            <span className="text-sm text-white/70">Preparing battle...</span>
          </div>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.05);
          }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% {
            transform: scale(0.8);
            opacity: 0.6;
          }
          40% {
            transform: scale(1.2);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default ClockCountdown;

