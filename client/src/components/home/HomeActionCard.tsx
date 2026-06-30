import React from "react";
import { LucideIcon, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type HomeActionAccent = "blue" | "purple" | "gold" | "teal";

interface HomeActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  badge?: string | number;
  accent?: HomeActionAccent;
  className?: string;
  delay?: number;
}

const accentClasses: Record<
  HomeActionAccent,
  { card: string; icon: string }
> = {
  blue: {
    card: "home-action-card--blue",
    icon: "home-icon-blue",
  },
  purple: {
    card: "home-action-card--purple",
    icon: "home-icon-purple",
  },
  gold: {
    card: "home-action-card--gold",
    icon: "home-icon-gold",
  },
  teal: {
    card: "home-action-card--teal",
    icon: "home-icon-teal",
  },
};

const HomeActionCard: React.FC<HomeActionCardProps> = ({
  title,
  description,
  icon: Icon,
  onClick,
  loading = false,
  disabled = false,
  badge,
  accent = "blue",
  className,
  delay = 0,
}) => {
  const styles = accentClasses[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "home-action-card group relative w-full text-left rounded-2xl p-5 sm:p-6",
        "transition-all duration-300 ease-out",
        "hover:scale-[1.02] active:scale-[0.98]",
        "disabled:opacity-60 disabled:pointer-events-none",
        "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500",
        styles.card,
        className
      )}
    >
      {badge !== undefined && (
        <span className="absolute top-4 right-4 min-w-[1.5rem] h-6 px-2 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-md">
          {badge}
        </span>
      )}

      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-md",
            "transition-transform duration-300 group-hover:scale-110",
            styles.icon
          )}
        >
          {loading ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <Icon className="h-7 w-7" strokeWidth={2.25} />
          )}
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <h3 className="text-lg sm:text-xl font-bold text-white mb-1">
            {title}
          </h3>
          <p className="text-sm text-white/75 leading-relaxed">{description}</p>
        </div>

        <ChevronRight className="absolute bottom-5 right-5 h-5 w-5 text-white/35 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
};

export default HomeActionCard;
