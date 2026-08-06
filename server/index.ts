import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { log } from "./logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Increase body size limits for file uploads and large requests
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));

// Add CORS headers
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const configuredOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (requestOrigin && (configuredOrigins.length === 0 || configuredOrigins.includes(requestOrigin))) {
    res.header('Access-Control-Allow-Origin', requestOrigin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Expected when visiting /auth without a session — skip noisy logs
      if (path === "/api/user" && res.statusCode === 401) {
        return;
      }

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database
  const { database } = await import("./database");
  await database.initializeDatabase();

  async function cleanupVeryOldBattles() {
    console.log("🛡 Cleaning stale battles on startup...");

    try {
      // Cleanup stuck PLAYING battles older than 15 minutes
      await database.db.execute(`
        UPDATE team_battles
        SET status = 'finished',
            finished_at = NOW()
        WHERE status = 'playing'
          AND created_at < NOW() - INTERVAL '15 minutes'
      `);

      // Cleanup abandoned FORMING battles older than 30 minutes
      await database.db.execute(`
        UPDATE team_battles
        SET status = 'finished',
            finished_at = NOW()
        WHERE status = 'forming'
          AND created_at < NOW() - INTERVAL '30 minutes'
      `);

      console.log("✅ Stale battle cleanup completed successfully");
    } catch (error) {
      console.error("❌ Error during stale battle cleanup:", error);
    }
  }

  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Error ${status} on ${req.method} ${req.path}: ${message}`);

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    // Production: serve static files from dist/public
    // Development fallback: serve from client/dist
    const isProduction = process.env.NODE_ENV === "production";

    // Resolve the static files path based on environment
    const distPath = isProduction
      ? path.resolve(__dirname, "public")      // Production: dist/public (relative to dist/index.js)
      : path.resolve(__dirname, "..", "client", "dist"); // Development: client/dist

    // Log the resolved path for debugging (visible in PM2 logs)
    console.log(`Serving static files from: ${distPath}`);

    // Serve static files
    app.use(express.static(distPath));

    // SPA fallback: serve index.html for all non-API routes
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  // Serve the app on port 5001
  // this serves both the API and the client.
  const port = 5001;

  // Run passive cleanup of clearly abandoned team_battles before starting the server.
  await cleanupVeryOldBattles();

  server.listen(port, "localhost", () => {
    log(`serving on port ${port}`);
  });
})();
