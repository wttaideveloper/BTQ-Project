import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Heading for one dashboard section. The count pill lets a player see how much
 * is in a section before scrolling into it.
 */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  count,
  muted = false,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  count?: number;
  /** Secondary sections (other people's matches) read one step quieter. */
  muted?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-3", className)}>
      <div className="flex items-start gap-3 min-w-0">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            muted ? "bg-white/5 text-white/50" : "home-stat-icon-gold",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h2
            className={cn(
              "flex items-center gap-2 font-bold leading-tight",
              muted ? "text-base text-white/75" : "text-lg sm:text-xl text-white",
            )}
          >
            <span className="truncate">{title}</span>
            {typeof count === "number" && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70 tabular-nums">
                {count}
              </span>
            )}
          </h2>
          {description && <p className="text-sm text-white/50 mt-0.5">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
