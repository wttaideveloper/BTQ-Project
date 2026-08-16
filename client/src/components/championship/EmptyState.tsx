import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateTone = "muted" | "amber" | "info";

const TONES: Record<EmptyStateTone, { panel: string; icon: string }> = {
  muted: { panel: "border-white/[0.07] bg-white/[0.02]", icon: "bg-white/[0.05] text-white/45" },
  amber: { panel: "border-[#d4af37]/25 bg-[#d4af37]/[0.05]", icon: "bg-[#d4af37]/12 text-[#e7c766]" },
  info: { panel: "border-[#6d4aff]/25 bg-[#6d4aff]/[0.06]", icon: "bg-[#6d4aff]/15 text-[#b9a6ff]" },
};

/**
 * A section with nothing in it still has to answer the player's question, so
 * every empty state says what is missing and, where there is one, what to do.
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
        "rounded-2xl border px-5 py-6 text-center sm:px-7 sm:py-8 sm:text-left",
        dashed ? "border-dashed" : "",
        styles.panel,
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-5">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-white sm:text-lg">{title}</h3>
          {description && (
            <p className="mt-1.5 text-sm leading-relaxed champ-meta">{description}</p>
          )}
          {children && <div className="mt-5">{children}</div>}
        </div>
      </div>
    </div>
  );
}
