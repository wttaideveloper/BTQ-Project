import { z } from "zod";

const phoneDigitsSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
  ])
  .optional();

const countryTextSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .max(100, "Country name is too long")
      .regex(/^[a-zA-Z\s\-'.]+$/, "Country can only contain letters"),
  ])
  .optional();

export const DEFAULT_AVATARS = [
  { id: "default-1", label: "Ocean Blue", path: "/avatars/default-1.svg" },
  { id: "default-2", label: "Forest Green", path: "/avatars/default-2.svg" },
  { id: "default-3", label: "Sunset Orange", path: "/avatars/default-3.svg" },
  { id: "default-4", label: "Royal Purple", path: "/avatars/default-4.svg" },
  { id: "default-5", label: "Rose Pink", path: "/avatars/default-5.svg" },
  { id: "default-6", label: "Slate Gray", path: "/avatars/default-6.svg" },
] as const;

export const registerUserSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name is too long"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username is too long")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    ),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password is too long"),
  phone: phoneDigitsSchema,
  bio: z
    .string()
    .max(500, "Bio must be 500 characters or less")
    .optional()
    .or(z.literal("")),
  country: countryTextSchema,
  defaultAvatar: z.string().optional(),
});

export function resolveDefaultAvatarPath(avatarId?: string): string {
  const match = DEFAULT_AVATARS.find((a) => a.id === avatarId);
  return match?.path ?? DEFAULT_AVATARS[0].path;
}

export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name is too long"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username is too long")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores"
      ),
    email: z.string().email("Please enter a valid email address"),
    phone: phoneDigitsSchema,
    bio: z
      .string()
      .max(500, "Bio must be 500 characters or less")
      .optional()
      .or(z.literal("")),
    country: countryTextSchema,
    defaultAvatar: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters")
      .max(128, "Password is too long")
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.newPassword && !data.currentPassword) {
        return false;
      }
      return true;
    },
    {
      message: "Current password is required to change your password",
      path: ["currentPassword"],
    }
  );

export type UpdateProfileData = z.infer<typeof updateProfileSchema>;
