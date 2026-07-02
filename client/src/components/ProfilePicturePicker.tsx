import React from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_AVATARS } from "@shared/user-validation";
import { cn } from "@/lib/utils";
import { Upload, X } from "lucide-react";

type ProfilePicturePickerProps = {
  selectedDefaultAvatar: string;
  onSelectDefaultAvatar: (avatarId: string) => void;
  profileImagePreview: string | null;
  profileImageFile: File | null;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearUpload: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  variant?: "dark" | "light";
};

export function ProfilePicturePicker({
  selectedDefaultAvatar,
  onSelectDefaultAvatar,
  profileImagePreview,
  profileImageFile,
  onFileChange,
  onClearUpload,
  inputRef,
  variant = "dark",
}: ProfilePicturePickerProps) {
  const isDark = variant === "dark";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "h-16 w-16 rounded-full overflow-hidden border-2 flex items-center justify-center",
            isDark ? "border-white/20 bg-white/10" : "border-gray-200 bg-gray-50"
          )}
        >
          {profileImagePreview ? (
            <img
              src={profileImagePreview}
              alt="Profile preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              src={
                DEFAULT_AVATARS.find((a) => a.id === selectedDefaultAvatar)?.path ??
                DEFAULT_AVATARS[0].path
              }
              alt="Selected avatar"
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={
              isDark
                ? "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                : undefined
            }
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            Upload photo
          </Button>
          {profileImageFile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={
                isDark
                  ? "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  : undefined
              }
              onClick={onClearUpload}
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
      {!profileImageFile && (
        <div className="grid grid-cols-6 gap-2 max-w-xs">
          {DEFAULT_AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              title={avatar.label}
              onClick={() => onSelectDefaultAvatar(avatar.id)}
              className={cn(
                "rounded-full overflow-hidden border-2 transition-all h-10 w-10",
                selectedDefaultAvatar === avatar.id
                  ? "border-accent ring-2 ring-accent/40 scale-105"
                  : isDark
                    ? "border-white/15 hover:border-white/40"
                    : "border-gray-200 hover:border-gray-400"
              )}
            >
              <img
                src={avatar.path}
                alt={avatar.label}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
