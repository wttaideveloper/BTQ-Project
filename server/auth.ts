import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request } from "express";
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
  sanitizeUserForDirectory,
} from "./user-profile";
import { seedDefaultCommentator } from "./commentator-seed";

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
 * The single express-session middleware instance created by setupAuth().
 *
 * Exposed so the WebSocket server can resolve the SAME session, from the same
 * Postgres store and with the same signing secret, for the cookie the browser
 * sends during the WebSocket handshake. This is deliberately a reference to the
 * existing middleware rather than a second authentication path - there is only
 * one session mechanism in this project and WebSockets now reuse it.
 */
let sessionMiddleware: ReturnType<typeof session> | null = null;

export function getSessionMiddleware() {
  return sessionMiddleware;
}

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
      // "auto" keeps cookies usable on HTTP-only staging/IP deployments while
      // still adding Secure when the request arrives through an HTTPS proxy.
      secure: process.env.COOKIE_SECURE === "true" ? true : "auto",
    }
  };

  app.set("trust proxy", 1);
  // Keep a reference so setupWebSocketServer() can resolve the same session for
  // the handshake cookie. setupAuth() runs before setupWebSocketServer() in
  // registerRoutes(), so the reference is always populated in time.
  sessionMiddleware = session(sessionSettings);
  app.use(sessionMiddleware);
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
          isCommentator: false,
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

  // Authenticated user directory.
  //
  // This is the single /api/users handler. A second, unreachable definition
  // used to exist in routes.ts; because setupAuth() runs first, Express never
  // reached it, which made this endpoint admin-only and broke the Championship
  // captain member picker for non-admin players.
  //
  // Admins keep the exact full management payload they had before (used by the
  // admin User Management panel and the admin Championship panel). Non-admin
  // players get a minimal directory of *other* users — see
  // sanitizeUserForDirectory for the field allow-list.
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    const currentUser = req.user as SelectUser;

    try {
      const users = await database.getAllUsers();

      if (currentUser.isAdmin) {
        return res.json(users.map((u: User) => sanitizeUserForAdmin(u)));
      }

      res.json(
        users
          .filter((u: User) => u.id !== currentUser.id)
          .map((u: User) => sanitizeUserForDirectory(u))
      );
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update user (admin only)
  app.put("/api/users/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    const user = req.user as SelectUser;
    if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });

    try {
      const userId = parseInt(req.params.id);
      const updates = { ...req.body };

      delete updates.password;
      delete updates.id;

      const nextIsCommentator =
        updates.isCommentator === undefined ? undefined : Boolean(updates.isCommentator);
      if (nextIsCommentator !== undefined) {
        updates.isCommentator = nextIsCommentator;
      }

      const updatedUser = await database.updateUser(userId, updates);
      if (nextIsCommentator === false) {
        const { championships } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await database.db
          .update(championships)
          .set({ commentatorUserId: null, updatedAt: new Date() })
          .where(eq(championships.commentatorUserId, userId));
      }
      res.json(sanitizeUserForAdmin(updatedUser));
    } catch (err) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  createInitialAdmin();
  void createInitialCommentator();
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
    }
  } catch (err) {
    console.error("Failed to create initial admin user:", err);
  }
}

async function createInitialCommentator() {
  try {
    await seedDefaultCommentator({
      getUserByUsername: username => database.getUserByUsername(username),
      createUser: user => database.createUser(user),
      updateUser: (id, updates) => database.updateUser(id, updates),
      hashPassword,
      resolveDefaultAvatarPath,
      warn: message => console.warn(message),
      info: message => console.log(message),
    });
  } catch (err) {
    console.error("[Auth] Failed to create or update default commentator user:", err);
  }
}
