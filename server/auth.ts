import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, type RequestHandler } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { database } from "./database";
import { User as SelectUser, type User } from "@shared/schema";
import connectPgSimple from "connect-pg-simple";
import {
  registerUserSchema,
  resolveDefaultAvatarPath,
  updateProfileSchema,
} from "@shared/user-validation";
import {
  registerAvatarUpload,
  sanitizeUser,
  sanitizeUserForAdmin,
} from "./user-profile";

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

interface RegisterRequest extends Request {
  file?: Express.Multer.File;
}

const scryptAsync = promisify(scrypt);
const PostgresStore = connectPgSimple(session);

/**
 * Shared authorization policy for every administrator endpoint.
 * Authentication failures and authorization failures intentionally use
 * different status codes so the client can handle expired sessions correctly.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Your admin session has expired. Please log in again." });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "Administrator access is required for this action." });
  }
  return next();
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function recordLogin(userId: number) {
  try {
    await database.updateUser(userId, { lastLoginAt: new Date() });
  } catch (err) {
    console.error("[Auth] Failed to update last login:", err);
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "bible-trivia-secret-key",
    resave: false,
    saveUninitialized: false,
    store: new PostgresStore({
      conString: process.env.DATABASE_URL || "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db",
      tableName: 'sessions'
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      httpOnly: true,
      sameSite: "lax",
      // Follow the actual request protocol. This keeps sessions usable on an
      // HTTP/IP deployment and automatically adds Secure behind an HTTPS proxy.
      secure: "auto",
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await database.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Incorrect username" });
        }
        if (!(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Incorrect password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await database.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Register new user
  app.post(
    "/api/register",
    registerAvatarUpload.single("profileImage"),
    async (req: RegisterRequest, res, next) => {
      try {
        const parsed = registerUserSchema.safeParse({
          fullName: req.body.fullName,
          username: req.body.username,
          email: req.body.email,
          password: req.body.password,
          phone: req.body.phone || undefined,
          bio: req.body.bio || undefined,
          country: req.body.country || undefined,
          defaultAvatar: req.body.defaultAvatar || undefined,
        });

        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0]?.message || "Invalid registration data",
          });
        }

        const data = parsed.data;

        const existingUser = await database.getUserByUsername(data.username);
        if (existingUser) {
          return res.status(400).json({ message: "Username already exists" });
        }

        const existingEmail = await database.getUserByEmail(data.email);
        if (existingEmail) {
          return res.status(400).json({ message: "Email already registered" });
        }

        let profileImage = resolveDefaultAvatarPath(data.defaultAvatar);
        if (req.file) {
          profileImage = `/uploads/avatars/${req.file.filename}`;
        }

        const user = await database.createUser({
          username: data.username,
          password: await hashPassword(data.password),
          email: data.email,
          fullName: data.fullName,
          phone: data.phone || undefined,
          bio: data.bio || undefined,
          country: data.country || undefined,
          profileImage,
          isEmailVerified: false,
          isAdmin: false,
        });

        await recordLogin(user.id);

        req.login(user, (err) => {
          if (err) return next(err);
          res.status(201).json(sanitizeUser(user));
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Login user
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: SelectUser | false, info: { message: string } | undefined) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Authentication failed" });

      req.login(user, async (err: Error | null) => {
        if (err) return next(err);
        await recordLogin(user.id);
        const freshUser = await database.getUser(user.id);
        req.session.save((saveError) => {
          if (saveError) return next(saveError);
          res.status(200).json(sanitizeUser(freshUser ?? user));
        });
      });
    })(req, res, next);
  });

  // Logout user
  app.post("/api/logout", async (req, res, next) => {
    if (req.user?.id) {
      try {
        await database.setUserTeamBattleStatus(req.user.id, false);
      } catch (err) {
        console.error("[Logout] Failed to reset Team Battle status:", err);
      }
    }

    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  async function getAuthenticatedProfile(userId: number) {
    return database.getUser(userId);
  }

  // Get current user
  app.get("/api/user", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const freshUser = await getAuthenticatedProfile((req.user as SelectUser).id);
      if (!freshUser) return res.status(401).json({ message: "Not authenticated" });
      res.json(sanitizeUser(freshUser));
    } catch (err) {
      next(err);
    }
  });

  // Get own profile (includes last login and game stats)
  app.get("/api/profile", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const freshUser = await getAuthenticatedProfile((req.user as SelectUser).id);
      if (!freshUser) return res.status(401).json({ message: "Not authenticated" });
      res.json(sanitizeUser(freshUser));
    } catch (err) {
      next(err);
    }
  });

  // Update own profile
  app.patch(
    "/api/profile",
    registerAvatarUpload.single("profileImage"),
    async (req: RegisterRequest, res, next) => {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      try {
        const currentUser = req.user as SelectUser;
        const parsed = updateProfileSchema.safeParse({
          fullName: req.body.fullName,
          username: req.body.username,
          email: req.body.email,
          phone: req.body.phone || undefined,
          bio: req.body.bio || undefined,
          country: req.body.country || undefined,
          defaultAvatar: req.body.defaultAvatar || undefined,
          currentPassword: req.body.currentPassword || undefined,
          newPassword: req.body.newPassword || undefined,
        });

        if (!parsed.success) {
          return res.status(400).json({
            message: parsed.error.errors[0]?.message || "Invalid profile data",
          });
        }

        const data = parsed.data;

        if (data.username !== currentUser.username) {
          const existingUser = await database.getUserByUsername(data.username);
          if (existingUser && existingUser.id !== currentUser.id) {
            return res.status(400).json({ message: "Username already taken" });
          }
        }

        if (data.email !== currentUser.email) {
          const existingEmail = await database.getUserByEmail(data.email);
          if (existingEmail && existingEmail.id !== currentUser.id) {
            return res.status(400).json({ message: "Email already registered" });
          }
        }

        const updates: Partial<User> = {
          fullName: data.fullName,
          username: data.username,
          email: data.email,
          phone: data.phone || null,
          bio: data.bio || null,
          country: data.country || null,
        };

        if (data.email !== currentUser.email) {
          updates.isEmailVerified = false;
        }

        if (req.file) {
          updates.profileImage = `/uploads/avatars/${req.file.filename}`;
        } else if (req.body.defaultAvatar) {
          updates.profileImage = resolveDefaultAvatarPath(req.body.defaultAvatar);
        }

        if (data.newPassword) {
          const validPassword = await comparePasswords(
            data.currentPassword!,
            currentUser.password
          );
          if (!validPassword) {
            return res.status(400).json({ message: "Current password is incorrect" });
          }
          updates.password = await hashPassword(data.newPassword);
        }

        const updatedUser = await database.updateUser(currentUser.id, updates);
        res.json(sanitizeUser(updatedUser));
      } catch (err) {
        next(err);
      }
    }
  );

  // Get all users (admin only)
  app.get("/api/users", requireAdmin, async (_req, res) => {
    try {
      const users = await database.getAllUsers();
      res.json(users.map((u: User) => sanitizeUserForAdmin(u)));
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update user (admin only)
  app.put("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const updates = { ...req.body };

      delete updates.password;
      delete updates.id;

      const updatedUser = await database.updateUser(userId, updates);
      res.json(sanitizeUserForAdmin(updatedUser));
    } catch (err) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  createInitialAdmin();
}

async function createInitialAdmin() {
  try {
    const adminUser = await database.getUserByUsername("admin");
    if (!adminUser) {
      await database.createUser({
        username: "admin",
        password: await hashPassword("admin123"),
        email: "admin@faithiq.local",
        fullName: "System Administrator",
        profileImage: resolveDefaultAvatarPath("default-4"),
        isAdmin: true,
      });
    } else if (!adminUser.isAdmin) {
      await database.updateUser(adminUser.id, { isAdmin: true });
      console.warn("[Auth] Restored the admin role for the initial admin account.");
    }
  } catch (err) {
    console.error("Failed to create initial admin user:", err);
  }
}
