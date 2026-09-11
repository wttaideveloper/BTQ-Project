/**
 * The live stream's control plane.
 *
 * The mixer that produces the stream does not run here. It sits on another
 * machine behind a Cloudflare tunnel with no inbound ports, so it cannot be
 * called; it calls us. Its director polls `/api/broadcast/agent` every few
 * seconds for two things: whether it should be on air, and what is live worth
 * putting there. It reports back what it actually did on
 * `/api/broadcast/agent/heartbeat`, which is what the admin panel displays.
 *
 * The consequence worth knowing: the admin's Go Live is not a command, it is a
 * setting. It takes effect on the director's next poll, within a few seconds.
 *
 * Adding a new kind of streamable event is a change to `listLiveEvents` below
 * and nothing else. The director renders whatever page it is handed and knows
 * nothing about championships, team battles, or anything that comes later.
 */
import type { Express, RequestHandler } from "express";
import { database } from "./database";
import { championships, championshipMatches, championshipTeams } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const db = database.db;

/** Shared secret the director authenticates with. Unset means no stream. */
const AGENT_TOKEN = process.env.BROADCAST_TOKEN || "";
/** Public address of the Watch page, for the link in the admin card. */
const STREAM_URL = process.env.STREAM_URL || "";
/** A director is considered present if it has polled within this window. */
const HEARTBEAT_STALE_MS = 30_000;

export type LiveEvent = {
  /** Stable identifier, unique across every kind. */
  id: string;
  /** What sort of thing this is, for the admin panel and for logging. */
  kind: string;
  /** One line naming it, e.g. "Grace Warriors v Cedar Prophets". */
  title: string;
  /**
   * Path on this server that renders it for a viewer. The director turns this
   * into an absolute URL against the public address and adds ?broadcast=1, so
   * never put a hostname here.
   */
  watchPath: string;
  /** ISO timestamp, used to prefer the most recently started event. */
  startedAt: string | null;
};

type Heartbeat = {
  at: number;
  program: string | null;
  event: string | null;
  outputs: unknown[];
  error: string | null;
};

let heartbeat: Heartbeat | null = null;

let ready: Promise<void> | null = null;

/**
 * The settings table. Additive: it creates its own table and touches nothing
 * that already exists, so it is safe to deploy against a live database.
 */
async function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS broadcast_settings (
          id TEXT PRIMARY KEY DEFAULT 'default',
          following BOOLEAN NOT NULL DEFAULT FALSE,
          destination TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(`
        INSERT INTO broadcast_settings (id) VALUES ('default')
        ON CONFLICT (id) DO NOTHING;
      `);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

async function getSettings(): Promise<{ following: boolean; destination: string }> {
  await ensureTable();
  const r: any = await db.execute(
    sql`SELECT following, destination FROM broadcast_settings WHERE id = 'default'`
  );
  const row = (r?.rows ?? r)?.[0];
  return { following: !!row?.following, destination: String(row?.destination ?? "") };
}

async function setFollowing(on: boolean): Promise<void> {
  await ensureTable();
  await db.execute(
    sql`UPDATE broadcast_settings SET following = ${on}, updated_at = NOW() WHERE id = 'default'`
  );
}

// The destination is typed by an admin and contains a stream key. Bind it;
// never interpolate it into the statement.
async function setDestination(url: string): Promise<void> {
  await ensureTable();
  await db.execute(
    sql`UPDATE broadcast_settings SET destination = ${url}, updated_at = NOW() WHERE id = 'default'`
  );
}

/** An RTMP address with its stream key hidden: rtmp://host/app/********. */
export function maskDestination(url: string): string {
  if (!url) return "";
  const cut = url.lastIndexOf("/");
  if (cut < 0) return url;
  const head = url.slice(0, cut);
  const key = url.slice(cut + 1);
  if (!key || head.split("/").length < 4) return url;
  return `${head}/${"*".repeat(Math.min(key.length, 8))}`;
}

/**
 * Everything currently live and worth streaming, newest first.
 *
 * This is the one place that knows what "an event" is. Today only championship
 * matches have a spectator page; when team battles or anything else grow one,
 * add a block here that returns its watchPath and the director will carry it
 * without being changed at all.
 */
export async function listLiveEvents(): Promise<LiveEvent[]> {
  const events: LiveEvent[] = [];

  const rows = await db
    .select({
      id: championshipMatches.id,
      startedAt: championshipMatches.startedAt,
      championshipId: championshipMatches.championshipId,
      teamAId: championshipMatches.teamAId,
      teamBId: championshipMatches.teamBId,
    })
    .from(championshipMatches)
    .where(eq(championshipMatches.status, "live"));

  if (rows.length) {
    const teamRows = await db
      .select({ id: championshipTeams.id, name: championshipTeams.name })
      .from(championshipTeams);
    const names = new Map(teamRows.map((t: any) => [t.id, t.name]));
    for (const m of rows as any[]) {
      const a = names.get(m.teamAId) || "Team A";
      const b = names.get(m.teamBId) || "Team B";
      events.push({
        id: m.id,
        kind: "championship-match",
        title: `${a} v ${b}`,
        watchPath: `/watch/${m.id}`,
        startedAt: m.startedAt ? new Date(m.startedAt).toISOString() : null,
      });
    }
  }

  events.sort((x, y) => (y.startedAt || "").localeCompare(x.startedAt || ""));
  return events;
}

/** The page to show when nothing is live: the active championship, if any. */
async function fallbackPath(): Promise<string | null> {
  const rows = await db
    .select({ id: championships.id })
    .from(championships)
    .where(eq(championships.status, "active"))
    .limit(1);
  const id = (rows as any[])[0]?.id;
  return id ? `/championships/${id}` : null;
}

/** Bearer check for the director. Constant work, no early return on length. */
const ensureAgent: RequestHandler = (req, res, next) => {
  if (!AGENT_TOKEN) {
    res.status(503).json({ error: "broadcasting is not configured on this server" });
    return;
  }
  const header = String(req.headers.authorization || "");
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (given !== AGENT_TOKEN) {
    res.status(401).json({ error: "bad token" });
    return;
  }
  next();
};

export function registerBroadcastRoutes(app: Express, ensureAdmin: RequestHandler): void {
  // What the admin panel's Live stream card reads. Everything it shows about
  // the mixer comes from the director's last heartbeat, so a director that has
  // stopped polling shows as not connected rather than as silently fine.
  app.get("/api/broadcast", ensureAdmin, async (_req, res) => {
    try {
      const [settings, live] = await Promise.all([getSettings(), listLiveEvents()]);
      const fresh = !!heartbeat && Date.now() - heartbeat.at < HEARTBEAT_STALE_MS;
      res.json({
        configured: !!AGENT_TOKEN,
        connected: fresh,
        following: settings.following,
        destination: maskDestination(settings.destination),
        stream_url: STREAM_URL,
        program: fresh ? heartbeat!.program : null,
        match: fresh ? heartbeat!.event : null,
        outputs: fresh ? heartbeat!.outputs : [],
        error: !AGENT_TOKEN
          ? null
          : fresh
            ? heartbeat!.error
            : "the mixer has not checked in",
        live,
      });
    } catch (e: any) {
      res.status(500).json({ configured: !!AGENT_TOKEN, error: e?.message || String(e) });
    }
  });

  app.post("/api/broadcast/go-live", ensureAdmin, async (_req, res) => {
    try {
      await setFollowing(true);
      res.json({ following: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.post("/api/broadcast/off-air", ensureAdmin, async (_req, res) => {
    try {
      await setFollowing(false);
      res.json({ following: false });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // Where the stream goes besides the built-in server behind the Watch page:
  // a full RTMP address including the stream key, or empty to send nowhere
  // else. The key is never echoed back to the browser.
  app.post("/api/broadcast/destination", ensureAdmin, async (req, res) => {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (url && !/^rtmps?:\/\/\S+$/.test(url)) {
      res.status(400).json({ error: "The destination must be an rtmp:// or rtmps:// address" });
      return;
    }
    try {
      await setDestination(url);
      res.json({ destination: maskDestination(url) });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // The director's poll. This is the only place the full RTMP address leaves
  // the server, and it is behind the shared token.
  app.get("/api/broadcast/agent", ensureAgent, async (_req, res) => {
    try {
      const [settings, live, fallback] = await Promise.all([
        getSettings(),
        listLiveEvents(),
        fallbackPath(),
      ]);
      res.json({
        following: settings.following,
        destination: settings.destination,
        live,
        fallbackPath: fallback,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.post("/api/broadcast/agent/heartbeat", ensureAgent, (req, res) => {
    const b = req.body || {};
    heartbeat = {
      at: Date.now(),
      program: typeof b.program === "string" ? b.program : null,
      event: typeof b.event === "string" ? b.event : null,
      outputs: Array.isArray(b.outputs) ? b.outputs : [],
      error: typeof b.error === "string" && b.error ? b.error : null,
    };
    res.json({ ok: true });
  });
}
