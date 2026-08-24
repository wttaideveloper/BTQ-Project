import fs from "fs";
import path from "path";
import multer from "multer";

const teamLogosDir = path.join(process.cwd(), "uploads", "team-logos");

if (!fs.existsSync(teamLogosDir)) {
  fs.mkdirSync(teamLogosDir, { recursive: true });
}

const imageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
} as const;

export const teamLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, teamLogosDir),
    filename: (_req, file, callback) => {
      const extension = imageTypes[file.mimetype as keyof typeof imageTypes];
      callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype in imageTypes) return callback(null, true);
    callback(new Error("Team logos must be JPEG, PNG, WebP, or AVIF images"));
  },
});

/** A small defence-in-depth check after Multer's MIME allowlist. */
export function hasAllowedImageSignature(filePath: string, mimeType: string): boolean {
  const bytes = fs.readFileSync(filePath);
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimeType === "image/avif") {
    return bytes.length >= 16 && bytes.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"));
  }
  return false;
}

export function deleteManagedTeamLogo(url: string | null | undefined) {
  if (!url?.startsWith("/uploads/team-logos/")) return;
  const filename = path.basename(url);
  const filePath = path.join(teamLogosDir, filename);
  if (filePath.startsWith(`${teamLogosDir}${path.sep}`) && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
