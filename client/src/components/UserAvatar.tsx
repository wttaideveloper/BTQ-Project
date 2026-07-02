import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  profileImage?: string | null;
  fullName?: string | null;
  username?: string;
  className?: string;
  fallbackClassName?: string;
};

export function getDisplayInitials(fullName?: string | null, username?: string) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (username ?? "?").slice(0, 2).toUpperCase();
}

export function UserAvatar({
  profileImage,
  fullName,
  username,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const initials = getDisplayInitials(fullName, username);

  return (
    <Avatar className={cn("h-10 w-10", className)}>
      {profileImage ? (
        <AvatarImage src={profileImage} alt={fullName || username || "User avatar"} />
      ) : null}
      <AvatarFallback className={cn("bg-accent/20 text-primary font-semibold", fallbackClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
