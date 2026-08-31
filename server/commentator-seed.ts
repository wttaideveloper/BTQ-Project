/**
 * Idempotent seed for the dedicated championship commentator account.
 *
 * Password comes from DEFAULT_COMMENTATOR_PASSWORD. If that env var is missing,
 * no account is created or updated and no weak default is invented.
 *
 * If username "commentator" already exists, the password is reset from the env
 * var and commentator/non-admin roles are enforced. Championship assignment is
 * never touched here.
 */

export const DEFAULT_COMMENTATOR_USERNAME = "commentator";
export const DEFAULT_COMMENTATOR_PASSWORD_ENV = "DEFAULT_COMMENTATOR_PASSWORD";

export function readDefaultCommentatorPassword(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env[DEFAULT_COMMENTATOR_PASSWORD_ENV];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type CommentatorSeedDecision =
  | { action: "create"; password: string }
  | { action: "update"; password: string; userId: number }
  | { action: "skip-missing-password" };

export function decideDefaultCommentatorSeed(options: {
  existingUser: { id: number; username: string } | null | undefined;
  password: string | null;
}): CommentatorSeedDecision {
  if (!options.password) return { action: "skip-missing-password" };
  if (options.existingUser) {
    return { action: "update", password: options.password, userId: options.existingUser.id };
  }
  return { action: "create", password: options.password };
}

type SeedUser = {
  username: string;
  password: string;
  email?: string;
  fullName?: string;
  profileImage?: string;
  isAdmin: boolean;
  isCommentator: boolean;
};

type CommentatorSeedUpdates = {
  password: string;
  isAdmin: boolean;
  isCommentator: boolean;
};

export async function seedDefaultCommentator(options: {
  getUserByUsername: (username: string) => Promise<{ id: number; username: string } | undefined>;
  createUser: (user: SeedUser) => Promise<unknown>;
  updateUser: (id: number, updates: CommentatorSeedUpdates) => Promise<unknown>;
  hashPassword: (password: string) => Promise<string>;
  resolveDefaultAvatarPath?: (id: string) => string;
  env?: NodeJS.ProcessEnv;
  warn?: (message: string) => void;
  info?: (message: string) => void;
}): Promise<"created" | "updated" | "missing-password"> {
  const decision = decideDefaultCommentatorSeed({
    existingUser: await options.getUserByUsername(DEFAULT_COMMENTATOR_USERNAME),
    password: readDefaultCommentatorPassword(options.env ?? process.env),
  });

  if (decision.action === "skip-missing-password") {
    options.warn?.(
      `[Auth] ${DEFAULT_COMMENTATOR_PASSWORD_ENV} is not set. The default commentator account was not created or updated.`,
    );
    return "missing-password";
  }

  const hashed = await options.hashPassword(decision.password);

  if (decision.action === "update") {
    await options.updateUser(decision.userId, {
      password: hashed,
      isAdmin: false,
      isCommentator: true,
    });
    options.info?.("[Auth] Updated default commentator account (username: commentator).");
    return "updated";
  }

  await options.createUser({
    username: DEFAULT_COMMENTATOR_USERNAME,
    password: hashed,
    email: "commentator@faithiq.local",
    fullName: "Championship Commentator",
    profileImage: options.resolveDefaultAvatarPath?.("default-4"),
    isAdmin: false,
    isCommentator: true,
  });
  options.info?.("[Auth] Created default commentator account (username: commentator).");
  return "created";
}
