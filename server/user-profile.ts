import fs from "fs";
import path from "path";
import multer from "multer";
import type { User } from "@shared/schema";

const avatarsDir = path.join(process.cwd(), "uploads", "avatars");

if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

export const registerAvatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed for profile pictures"));
    }
  },
});

export function sanitizeUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    profileImage: user.profileImage,
    bio: user.bio,
    country: user.country,
    isAdmin: user.isAdmin,
    isEmailVerified: user.isEmailVerified,
    isOnline: user.isOnline,
    isInTeamBattle: user.isInTeamBattle,
    lastSeen: user.lastSeen,
    lastLoginAt: user.lastLoginAt,
    totalGames: user.totalGames,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
  };
}

export function sanitizeUserForAdmin(user: User) {
  return sanitizeUser(user);
}
