import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { database } from "./database";
import { User as SelectUser, type User } from "@shared/schema";
import connectPgSimple from "connect-pg-simple";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresStore = connectPgSimple(session);

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

export function setupAuth(app: Express) {
  // Debug environment variables
  console.log("🔧 Auth setup - Environment check:");
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");
  console.log("SESSION_SECRET:", process.env.SESSION_SECRET ? "SET" : "NOT SET");
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "bible-trivia-secret-key",
    resave: false,
    saveUninitialized: false,
    store: new PostgresStore({
      conString: "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db",
      tableName: 'sessions'
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
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
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Incorrect username or password" });
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
  app.post("/api/register", async (req, res, next) => {
    try {
      // Check if username already exists
      const existingUser = await database.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create user with hashed password
      const user = await database.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      // Log the user in automatically
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({ 
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin 
        });
      });
    } catch (err) {
      next(err);
    }
  });

  // Login user
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: SelectUser | false, info: { message: string } | undefined) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Authentication failed" });
      
      req.login(user, (err: Error | null) => {
        if (err) return next(err);
        res.status(200).json({ 
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin 
        });
      });
    })(req, res, next);
  });

  // Logout user
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  // Get current user
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    
    const user = req.user as SelectUser;
    res.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin
    });
  });

  // Get all users (admin only)
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    
    const user = req.user as SelectUser;
    if (!user.isAdmin) return res.status(403).json({ message: "Admin access required" });
    
    try {
      const users = await database.getAllUsers();
      res.json(users.map((u: User) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        isAdmin: u.isAdmin,
        isOnline: u.isOnline,
        lastSeen: u.lastSeen,
        totalGames: u.totalGames,
        wins: u.wins,
        losses: u.losses,
        draws: u.draws
      })));
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
      const updates = req.body;
      
      // Don't allow updating password through this endpoint
      delete updates.password;
      
      const updatedUser = await database.updateUser(userId, updates);
      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen,
        totalGames: updatedUser.totalGames,
        wins: updatedUser.wins,
        losses: updatedUser.losses,
        draws: updatedUser.draws
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  
  // Create initial admin user if none exists
  createInitialAdmin();
}

// Create initial admin user
async function createInitialAdmin() {
  try {
    const adminUser = await database.getUserByUsername("admin");
    if (!adminUser) {
      await database.createUser({
        username: "admin",
        password: await hashPassword("admin123"),
        isAdmin: true
      });
      console.log("Created initial admin user: admin / admin123");
    }
  } catch (err) {
    console.error("Failed to create initial admin user:", err);
  }
}