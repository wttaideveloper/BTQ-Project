/**
 * Live commentator audio signaling.
 *
 * Media itself is WebRTC (browser-to-browser). This module only authorizes
 * publishers/listeners and forwards SDP/ICE over the existing /ws socket.
 * Audio bytes never travel in JSON WebSocket messages.
 */

import { eq } from "drizzle-orm";
import { championshipMatches, championshipTeams, championships } from "@shared/schema";
import { database } from "./database";
import { isActiveChampionshipStatus } from "./commentator-access";

export type CommentaryIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type CommentaryClient = {
  id: string;
  userId?: number;
  verifiedUserId?: number | null;
  identityResolved?: Promise<void>;
};

export type CommentarySignalPayload = {
  matchId: string;
  peerId: string;
  kind: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
};

type CommentarySession = {
  matchId: string;
  publisherClientId: string;
  publisherUserId: number;
  listeners: Set<string>;
};

export function getCommentaryIceServers(
  env: NodeJS.ProcessEnv = process.env,
): CommentaryIceServer[] {
  const servers: CommentaryIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = env.TURN_URL?.trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: env.TURN_USERNAME || undefined,
      credential: env.TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}

export function canPublishCommentary(options: {
  user: { isCommentator?: boolean | null; isAdmin?: boolean | null } | null | undefined;
  championshipStatus?: string | null;
  matchStatus?: string | null;
}): { ok: true } | { ok: false; status: number; message: string } {
  if (!options.user) {
    return { ok: false, status: 401, message: "Authentication required" };
  }
  if (!options.user.isCommentator || options.user.isAdmin) {
    return { ok: false, status: 403, message: "Commentator access required" };
  }
  if (!isActiveChampionshipStatus(options.championshipStatus)) {
    return { ok: false, status: 403, message: "This championship is not active." };
  }
  if (options.matchStatus !== "live") {
    return { ok: false, status: 409, message: "Commentary is only available during a live match" };
  }
  return { ok: true };
}

export function canListenCommentary(options: {
  userId: number | null | undefined;
  memberIds: number[];
  championshipStatus?: string | null;
  matchStatus?: string | null;
}): { ok: true } | { ok: false; status: number; message: string } {
  if (!options.userId) {
    return { ok: false, status: 401, message: "Authentication required" };
  }
  if (!isActiveChampionshipStatus(options.championshipStatus)) {
    return { ok: false, status: 403, message: "This championship is not active." };
  }
  if (options.matchStatus !== "live") {
    return { ok: false, status: 409, message: "Commentary is only available during a live match" };
  }
  if (!options.memberIds.includes(options.userId)) {
    return { ok: false, status: 403, message: "You are not playing this match" };
  }
  return { ok: true };
}

export function canForwardCommentarySignal(options: {
  senderClientId: string;
  peerId: string;
  publisherClientId: string;
  listenerClientIds: Iterable<string>;
}): boolean {
  const listeners = new Set(options.listenerClientIds);
  if (options.senderClientId === options.publisherClientId) {
    return listeners.has(options.peerId);
  }
  return options.senderClientId === options.peerId && listeners.has(options.senderClientId);
}

export type CommentaryIO = {
  sendToClient: (clientId: string, message: Record<string, unknown>) => void;
  getClient: (clientId: string) => CommentaryClient | undefined;
  listClients: () => Iterable<CommentaryClient>;
};

export class CommentaryRegistry {
  private readonly sessions = new Map<string, CommentarySession>();
  private readonly waitingListeners = new Map<string, Set<string>>();
  private readonly clientMatch = new Map<string, { matchId: string; role: "publisher" | "listener" }>();

  constructor(private readonly io: CommentaryIO) {}

  isLive(matchId: string): boolean {
    return this.sessions.has(matchId);
  }

  publisherClientId(matchId: string): string | undefined {
    return this.sessions.get(matchId)?.publisherClientId;
  }

  listenerClientIds(matchId: string): string[] {
    return [...(this.sessions.get(matchId)?.listeners ?? [])];
  }

  async publish(clientId: string, matchId: string | undefined): Promise<void> {
    if (!matchId) return;
    const userId = await this.resolvedUserId(clientId);
    const user = userId ? await database.getUser(userId) : undefined;
    const context = await loadMatchContext(matchId);
    const decision = canPublishCommentary({
      user,
      championshipStatus: context?.championship.status,
      matchStatus: context?.match.status,
    });
    if (!decision.ok) {
      this.io.sendToClient(clientId, {
        type: "commentary_error",
        matchId,
        message: decision.message,
      });
      return;
    }
    if (!userId || !context) return;

    const existing = this.sessions.get(matchId);
    const waiting = [...(this.waitingListeners.get(matchId) ?? [])];
    if (existing && existing.publisherClientId !== clientId) {
      this.stopMatch(matchId, "replaced");
    }

    this.sessions.set(matchId, {
      matchId,
      publisherClientId: clientId,
      publisherUserId: userId,
      listeners: new Set(),
    });
    this.clientMatch.set(clientId, { matchId, role: "publisher" });

    const iceServers = getCommentaryIceServers();
    const livePayload = { type: "commentary_status", matchId, live: true, iceServers };
    this.io.sendToClient(clientId, livePayload);
    this.notifyMatchMembers(context.memberIds, livePayload, clientId);

    for (const listenerId of waiting) {
      void this.listen(listenerId, matchId);
    }
  }

  unpublish(clientId: string, matchId: string | undefined): void {
    if (!matchId) return;
    const session = this.sessions.get(matchId);
    if (!session || session.publisherClientId !== clientId) return;
    this.stopMatch(matchId, "stopped");
  }

  async listen(clientId: string, matchId: string | undefined): Promise<void> {
    if (!matchId) return;
    const userId = await this.resolvedUserId(clientId);
    const context = await loadMatchContext(matchId);
    const decision = canListenCommentary({
      userId,
      memberIds: context?.memberIds ?? [],
      championshipStatus: context?.championship.status,
      matchStatus: context?.match.status,
    });
    if (!decision.ok) {
      this.io.sendToClient(clientId, {
        type: "commentary_error",
        matchId,
        message: decision.message,
      });
      return;
    }

    const session = this.sessions.get(matchId);
    if (!session) {
      const waiting = this.waitingListeners.get(matchId) ?? new Set<string>();
      waiting.add(clientId);
      this.waitingListeners.set(matchId, waiting);
      this.clientMatch.set(clientId, { matchId, role: "listener" });
      this.io.sendToClient(clientId, {
        type: "commentary_status",
        matchId,
        live: false,
        iceServers: getCommentaryIceServers(),
      });
      return;
    }

    this.clientMatch.set(clientId, { matchId, role: "listener" });
    if (session.listeners.has(clientId)) {
      this.io.sendToClient(clientId, {
        type: "commentary_status",
        matchId,
        live: true,
        iceServers: getCommentaryIceServers(),
      });
      return;
    }

    session.listeners.add(clientId);
    this.io.sendToClient(clientId, {
      type: "commentary_status",
      matchId,
      live: true,
      iceServers: getCommentaryIceServers(),
    });
    this.io.sendToClient(session.publisherClientId, {
      type: "commentary_listener_joined",
      matchId,
      peerId: clientId,
    });
  }

  signal(clientId: string, payload: CommentarySignalPayload): void {
    const session = this.sessions.get(payload.matchId);
    if (!session) return;
    if (!canForwardCommentarySignal({
      senderClientId: clientId,
      peerId: payload.peerId,
      publisherClientId: session.publisherClientId,
      listenerClientIds: session.listeners,
    })) {
      return;
    }
    const targetId = clientId === session.publisherClientId ? payload.peerId : session.publisherClientId;
    this.io.sendToClient(targetId, {
      type: "commentary_signal",
      matchId: payload.matchId,
      peerId: payload.peerId,
      kind: payload.kind,
      sdp: payload.sdp,
      candidate: payload.candidate,
    });
  }

  disconnect(clientId: string): void {
    const binding = this.clientMatch.get(clientId);
    if (!binding) {
      for (const waiting of this.waitingListeners.values()) waiting.delete(clientId);
      return;
    }
    if (binding.role === "publisher") {
      this.stopMatch(binding.matchId, "disconnected");
      return;
    }
    this.removeListener(binding.matchId, clientId);
  }

  stopMatch(matchId: string, reason: "stopped" | "disconnected" | "ended" | "replaced" = "ended"): void {
    const session = this.sessions.get(matchId);
    this.sessions.delete(matchId);
    this.waitingListeners.delete(matchId);
    const offline = { type: "commentary_status", matchId, live: false, reason };
    if (session) {
      this.clientMatch.delete(session.publisherClientId);
      this.io.sendToClient(session.publisherClientId, offline);
      for (const listenerId of session.listeners) {
        this.clientMatch.delete(listenerId);
        this.io.sendToClient(listenerId, offline);
      }
    }
  }

  private removeListener(matchId: string, clientId: string): void {
    this.waitingListeners.get(matchId)?.delete(clientId);
    const session = this.sessions.get(matchId);
    if (session?.listeners.delete(clientId)) {
      this.io.sendToClient(session.publisherClientId, {
        type: "commentary_listener_left",
        matchId,
        peerId: clientId,
      });
    }
    this.clientMatch.delete(clientId);
  }

  private async resolvedUserId(clientId: string): Promise<number | null> {
    const client = this.io.getClient(clientId);
    if (!client) return null;
    if (client.identityResolved) {
      try {
        await client.identityResolved;
      } catch {
        return null;
      }
    }
    const fresh = this.io.getClient(clientId);
    const userId = fresh?.verifiedUserId ?? fresh?.userId ?? null;
    return typeof userId === "number" ? userId : null;
  }

  private notifyMatchMembers(memberIds: number[], payload: Record<string, unknown>, exceptClientId?: string): void {
    const allowed = new Set(memberIds);
    for (const client of this.io.listClients()) {
      if (client.id === exceptClientId) continue;
      const userId = client.userId ?? client.verifiedUserId;
      if (typeof userId === "number" && allowed.has(userId)) {
        this.io.sendToClient(client.id, payload);
      }
    }
  }
}

async function loadMatchContext(matchId: string) {
  const db = database.db;
  const [match] = await db.select().from(championshipMatches).where(eq(championshipMatches.id, matchId));
  if (!match) return null;
  const [championship] = await db.select().from(championships).where(eq(championships.id, match.championshipId));
  if (!championship) return null;
  const teams = await db.select().from(championshipTeams).where(eq(championshipTeams.championshipId, match.championshipId));
  const memberIds = teams
    .filter(team => team.id === match.teamAId || team.id === match.teamBId)
    .flatMap(team => team.memberIds ?? []);
  return { match, championship, memberIds };
}

let activeRegistry: CommentaryRegistry | null = null;

export function setCommentaryRegistry(registry: CommentaryRegistry | null): void {
  activeRegistry = registry;
}

export function stopCommentaryForMatch(matchId: string): void {
  activeRegistry?.stopMatch(matchId, "ended");
}

export function handleCommentaryDisconnect(clientId: string): void {
  activeRegistry?.disconnect(clientId);
}

export function getActiveCommentaryRegistry(): CommentaryRegistry | null {
  return activeRegistry;
}
