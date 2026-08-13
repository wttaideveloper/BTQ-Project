import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateTone = "muted" | "amber" | "info";

const TONES: Record<EmptyStateTone, { panel: string; icon: string }> = {
  muted: { panel: "border-white/10 bg-white/[0.03]", icon: "bg-white/5 text-white/50" },
  amber: { panel: "border-amber-400/30 bg-amber-400/[0.07]", icon: "bg-amber-400/15 text-amber-300" },
  info: { panel: "border-sky-400/25 bg-sky-400/[0.06]", icon: "bg-sky-400/15 text-sky-300" },
};

/**
 * A section with nothing in it still has to answer the player's question, so
 * every empty state says what is missing AND what (if anything) to do next.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  tone = "muted",
  dashed = true,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: EmptyStateTone;
  dashed?: boolean;
  /** Optional actions rendered under the copy. */
  children?: ReactNode;
  className?: string;
}) {
  const styles = TONES[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border p-5 sm:p-6 text-center sm:text-left",
        dashed ? "border-dashed" : "",
        styles.panel,
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-bold text-white">{title}</h3>
          {description && <p className="mt-1 text-sm text-white/60 leading-relaxed">{description}</p>}
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </div>
  );
}
