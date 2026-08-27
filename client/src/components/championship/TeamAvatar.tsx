import { useState } from "react";
import { cn } from "@/lib/utils";

/** Presentation-only team identity: an uploaded logo takes precedence over emoji. */
export function TeamAvatar({
  logoUrl,
  emoticon,
  alt,
  className,
  imageClassName,
}: {
  logoUrl?: string | null;
  emoticon?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return <img src={logoUrl} alt={alt} onError={() => setFailed(true)} className={cn("block object-contain", className, imageClassName)} />;
  }
  return <span className={cn("inline-grid place-items-center leading-none", className)} aria-label={alt}>{emoticon || "🏳️"}</span>;
}
