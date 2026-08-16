import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Heading for one portal section: a gold eyebrow rule, the title, and an
 * optional count so a player can size up a section before scrolling into it.
 * Secondary sections (other people's matches) render one step quieter.
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
  muted?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 champ-eyebrow">
            <Icon className={cn("h-3.5 w-3.5", muted ? "text-white/40" : "text-[#d4af37]")} strokeWidth={2.5} />
            {muted ? "Championship" : "FaithIQ Championship"}
          </p>
          <h2
            className={cn(
              "mt-1.5 flex items-center gap-2.5 font-bold leading-tight",
              muted ? "text-lg text-white/70" : "text-xl sm:text-2xl text-white",
            )}
          >
            <span className="truncate">{title}</span>
            {typeof count === "number" && (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-xs font-semibold champ-meta tabular-nums">
                {count}
              </span>
            )}
          </h2>
          {description && <p className="mt-1 text-sm champ-meta">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn("champ-divider mt-3", muted && "opacity-40")} />
    </div>
  );
}
