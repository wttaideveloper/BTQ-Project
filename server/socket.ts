import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { v4 as uuidv4 } from "uuid";
import { database } from "./database";
import {
  Player,
  GameSession,
  Challenge,
  ChallengeResult,
  ChallengeAnswer,
  Question,
  Notification,
} from "@shared/schema";

/**
 * Helper function to extract user IDs from teammates array.
 * Teammates can be stored as numbers or objects {id, username}.
 */
function extractTeammateIds(teammates: any[] | undefined): number[] {
  if (!teammates) return [];
  return teammates
    .map(teammate => {
      if (typeof teammate === 'number') return teammate;
      if (typeof teammate === 'object' && teammate !== null && typeof teammate.id === 'number') {
        return teammate.id;
      }
      return null;
    })
    .filter((id): id is number => id !== null);
}

interface Client {
  id: string;
  ws: WebSocket;
  gameId?: string;
  gameSessionId?: string;
  playerName?: string;
  userId?: number; // Added userId for authenticated clients
}

interface GameEvent {
  type: string;
  gameId?: string;
  playerId?: string;
  playerName?: string;
  userId?: number; // Added userId for authentication
  questionId?: string;
  answerId?: string;
  isCorrect?: boolean;
  timeSpent?: number;
  message?: string;
  leaderboard?: Player[] | any[];
  challengeId?: string;
  challengeeId?: number;
  category?: string;
  difficulty?: string;
  gameType?: string;
  challengeResult?: any;
  challengeDetails?: any;
  notificationId?: string;
  // Team-based multiplayer fields
  teamId?: string;
  teamName?: string;
  inviteeUserId?: number;
  inviteeEmail?: string;
  captainId?: number;
  finalAnswer?: {
    questionId: string;
    answerId: string;
  };
  // Additional team event fields
  gameState?: any; // Added for game_state_update
  playerTeam?: any; // Added for game_state_update
  team?: any;
  teams?: any[];
  invitation?: any;
  email?: string;
  gameSessionId?: string;
  waitingForOpponents?: boolean;
  opposingTeam?: any;
  inviterName?: string;
  gameHistory?: any;
  recruiterId?: number;
  correctAnswer?: any;
  recruiterName?: string;
  teamResults?: any[];
  // Team battle disconnect fields
  disconnectedPlayerName?: string;
  disconnectedTeamName?: string;
  severity?: string;
  timestamp?: Date;
  winnerTeamId?: string;
  winnerTeamName?: string;
  yourTeamId?: string;
  isWinner?: boolean;
  reason?: string;
  finalScores?: any[];
  error?: boolean;
  // Join request fields
  requesterId?: number;
  requesterUsername?: string;
  joinRequestId?: string;
  expiresAt?: Date;
  status?: string;
  // Online status fields
  onlineUsers?: Array<{
    id: number;
    username: string;
    isOnline: boolean;
  }>;
  newMember?: any;
  inviteeName?: string;
  opposingCaptainInvitationSent?: boolean;
  memberName?: string;
  question?: any;
  correctAnswerId?: string;
  winner?: any;
  answersReceived?: number;
  questionNumber?: number;
  isDraw?: boolean;
  totalMembers?: number;
  totalQuestions?: number;
  timeLimit?: number;
  yourTeam?: any;
  username?: string;
  points?: number;
  teamBattleId?: string;
  teamSide?: "A" | "B";
  teamAReady?: boolean;
  teamBReady?: boolean;
  seconds?: number;
  newCaptainId?: number;
  newCaptainName?: string;
  captainName?: string; // Captain name for various events
  removedMemberName?: string; // Name of removed member
  // Team battle question fields
  isYourTurn?: boolean;
  answeringTeamName?: string;
  answeringTeamId?: string;
  wasYourTurn?: boolean;
  opposingTeamName?: string;
  invitationId?: string;
  // DB-authoritative state fields
  updatedAt?: Date | number | string | null;
  serverTime?: number;
  shouldRefetch?: boolean;
}

// Store active WebSocket clients
const clients: Map<string, Client> = new Map();

// Store active game sessions
interface ActiveGameSession {
  id: string;
  players: Player[];
  status: "waiting" | "playing" | "finished";
  gameType: string; // 'realtime' or 'async' or 'team_battle'
  currentQuestionIndex?: number;
  questions?: any[];
  teams?: any[];
  category?: string;
  difficulty?: string;
  questionTimeout?: NodeJS.Timeout;
  // ========================================================================
  // PLAYER LIFECYCLE: tracks players who have permanently LEFT the battle.
  // Lifecycle: JOIN → ACTIVE → LEFT → (ARCHIVED on battle end)
  // Once a player is in leftPlayerIds, they are NEVER restored to the battle.
  // ========================================================================
  leftPlayerIds?: Set<number>;
}
const gameSessions: Map<string, ActiveGameSession> = new Map();

// In-memory ready state for team battles (per battle, per side)
export const teamBattleReadyState: Map<
  string,
  {
    teamAReady: boolean;
    teamBReady: boolean;
  }
> = new Map();

// ============================================================================
// CENTRALIZED BATTLE STATE RESET FUNCTION
// ============================================================================
// This function consolidates all battle cleanup/reset logic into one place.
// It prevents duplication and ensures consistent state management across:
// - Team captain leaves/disconnects
// - Battle ends (normal finish)
// - Battle abandoned (mid-game exit)
// - Cleanup endpoints
// ============================================================================

export type BattleResetReason =
  | "team_a_left"      // Team A captain left - battle will be deleted
  | "team_b_left"      // Team B captain left - reset to forming
  | "battle_end"       // Normal battle completion
  | "abandoned"        // Mid-game abandonment
  | "cleanup";         // Cleanup endpoint triggered

export interface BattleResetOptions {
  battleId: string;
  reason: BattleResetReason;
  gameSessionId?: string;
  notifyUserIds?: number[];       // Users to notify of reset
  deleteBattle?: boolean;         // Whether to delete the battle entirely
  newStatus?: "forming" | "finished"; // Status to set if not deleting
}

/**
 * Centralized function to reset battle state.
 * Handles: in-memory cleanup, DB cleanup, and optional notifications.
 * 
 * @param options - Reset configuration
 * @returns Promise<void>
 */
export async function resetBattleState(options: BattleResetOptions): Promise<void> {
  const {
    battleId,
    reason,
    gameSessionId,
    notifyUserIds = [],
    deleteBattle = false,
    newStatus
  } = options;


  // ========================================================================
  // STEP 1: Clear in-memory ready state (always)
  // ========================================================================
  if (teamBattleReadyState.has(battleId)) {
    teamBattleReadyState.delete(battleId);
  }

  // ========================================================================
  // STEP 2: Handle database operations based on deleteBattle flag
  // ========================================================================
  if (deleteBattle) {
    // Delete the battle entirely from DB
    try {
      // Fetch battle participants before deletion so we can clear their mode
      let battleRecord = null;
      try {
        battleRecord = await database.getTeamBattle(battleId);
      } catch (err) {
        // proceed even if fetch fails
      }

      await database.deleteTeamBattle(battleId);

      // If we have battle participants, clear their team battle status/mode
      if (battleRecord) {
        const participantIds: number[] = [];
        if (battleRecord.teamACaptainId) participantIds.push(battleRecord.teamACaptainId);
        if (battleRecord.teamBCaptainId) participantIds.push(battleRecord.teamBCaptainId);
        const aTeammates = Array.isArray(battleRecord.teamATeammates) ? battleRecord.teamATeammates : [];
        const bTeammates = Array.isArray(battleRecord.teamBTeammates) ? battleRecord.teamBTeammates : [];
        for (const t of aTeammates) {
          const tt: any = t;
          const id = typeof tt === "number" ? tt : (tt && (tt.id ?? tt.userId)) ?? null;
          if (typeof id === "number") participantIds.push(id);
        }
        for (const t of bTeammates) {
          const tt: any = t;
          const id = typeof tt === "number" ? tt : (tt && (tt.id ?? tt.userId)) ?? null;
          if (typeof id === "number") participantIds.push(id);
        }

        // Deduplicate and clear DB status for these users
        const uniqueIds = Array.from(new Set(participantIds));
        for (const uid of uniqueIds) {
          try {
            await database.setUserTeamBattleStatus(uid, false, null);
          } catch (err) {
            console.error(`[resetBattleState] Failed to clear user ${uid} team battle status:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[resetBattleState] ❌ Failed to delete battle ${battleId}:`, err);
    }
  } else {
    // Reset ready timestamps in DB (set to NULL)
    try {
      await database.resetTeamReadyState(battleId);
    } catch (err) {
      console.error(`[resetBattleState] ❌ Failed to reset ready timestamps for battle ${battleId}:`, err);
    }

    // Update battle status if specified
    if (newStatus) {
      try {
        await database.updateTeamBattle(battleId, { status: newStatus });
      } catch (err) {
        console.error(`[resetBattleState] ❌ Failed to update battle ${battleId} status:`, err);
      }
    }
  }

  // ========================================================================
  // STEP 3: Notify users of reset (if any)
  // ========================================================================
  if (notifyUserIds.length > 0 && gameSessionId) {
    const notifyPayload = {
      type: "team_ready_status" as const,
      teamBattleId: battleId,
      gameSessionId: gameSessionId,
      teamAReady: false,
      teamBReady: false,
      updatedAt: new Date(),
      reason: reason === "team_b_left" || reason === "team_a_left" ? "opponent_left" : reason,
    };

    for (const userId of notifyUserIds) {
      sendToUser(userId, notifyPayload);
    }
  }

}

// ============================================================================
// CENTRALIZED PLAYER LEAVE: markPlayerAsLeft
// ============================================================================
// Permanent lifecycle transition: ACTIVE → LEFT
// Once called, the player is fully detached from the battle in:
//   1. In-memory gameSession (leftPlayerIds, teams[].members, players[])
//   2. activeTeamMemberships map
//   3. client object (gameId, gameSessionId cleared)
//   4. Online status broadcast (player becomes available again)
//
// This function is IDEMPOTENT — calling it twice for the same player is safe.
// ============================================================================
interface MarkPlayerAsLeftOptions {
  clientId: string;
  gameId: string;          // the gameSessions key (battle session id)
  userId: number;
  reason: string;          // descriptive reason for logging
}

async function markPlayerAsLeft(options: MarkPlayerAsLeftOptions): Promise<boolean> {
  const { clientId, gameId, userId, reason } = options;

  const gameSession = gameSessions.get(gameId);
  if (!gameSession) {
    return false;
  }

  // Initialize leftPlayerIds if needed
  if (!gameSession.leftPlayerIds) {
    gameSession.leftPlayerIds = new Set<number>();
  }

  // Idempotent — skip if already marked as left
  if (gameSession.leftPlayerIds.has(userId)) {
    return false; // already processed
  }

  // ========================================================================
  // STEP 1: Mark as LEFT in the gameSession (permanent, irreversible)
  // ========================================================================
  gameSession.leftPlayerIds.add(userId);

  // ========================================================================
  // STEP 2: Remove from in-memory teams[].members (prevents endTeamBattle
  //         from incorrectly cleaning up this player's NEW team membership)
  // ========================================================================
  if (gameSession.teams) {
    for (const team of gameSession.teams) {
      if (team.members && Array.isArray(team.members)) {
        const idx = team.members.findIndex((m: any) => m.userId === userId);
        if (idx !== -1) {
          const removedMember = team.members.splice(idx, 1)[0];
        }
      }
    }
  }

  // ========================================================================
  // STEP 3: Remove from players[] array
  // ========================================================================
  if (gameSession.players) {
    const playerIdx = gameSession.players.findIndex((p: Player) => p.userId === userId);
    if (playerIdx !== -1) {
      gameSession.players.splice(playerIdx, 1);
    }
  }

  // ========================================================================
  // STEP 4: Remove from activeTeamMemberships (makes player "available" again)
  // Always attempt to delete the entry so the user becomes available immediately.
  // ========================================================================
  activeTeamMemberships.delete(userId);

  // Broadcast availability update so lobby clients immediately see this user as available.
  // Use the same online status broadcast used when users come online / teams change.
  try {
    broadcastOnlineStatusUpdate().catch((err: any) => {
      console.error(`[markPlayerAsLeft] ❌ broadcastOnlineStatusUpdate failed:`, err);
    });
  } catch (err) {
    console.error(`[markPlayerAsLeft] ❌ broadcastOnlineStatusUpdate error:`, err);
  }

  // ========================================================================
  // STEP 6: Persistently remove user from legacy teams.members and
  //         from the team_battles teammates arrays for this battle.
  // ========================================================================
  (async () => {
    try {
      // 1) Remove from all regular teams' members JSON
      try {
        await database.removeUserFromAllTeams(userId);
      } catch (err) {
        console.error(`[markPlayerAsLeft] ❌ removeUserFromAllTeams error:`, err);
      }

      // 2 & 3) Remove from team_battles.team_a_teammates / team_b_teammates for this battle only
      try {
        const battle = await database.getTeamBattle(gameId);
        if (battle) {
          const origA = Array.isArray(battle.teamATeammates) ? extractTeammateIds(battle.teamATeammates) : [];
          const origB = Array.isArray(battle.teamBTeammates) ? extractTeammateIds(battle.teamBTeammates) : [];
          const newA = origA.filter((id) => id !== userId);
          const newB = origB.filter((id) => id !== userId);
          const updates: any = {};
          if (newA.length !== origA.length) updates.teamATeammates = newA;
          if (newB.length !== origB.length) updates.teamBTeammates = newB;
          if (Object.keys(updates).length > 0) {
            try {
              await database.updateTeamBattle(battle.id, updates);
            } catch (err) {
              console.error(`[markPlayerAsLeft] ❌ Failed to update team_battles for ${battle.id}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`[markPlayerAsLeft] ❌ team_battles teammate cleanup error:`, err);
      }
    } catch (err) {
      // top-level tolerant catch
      console.error(`[markPlayerAsLeft] ❌ Persistent cleanup error:`, err);
    }
  })();

  // ========================================================================
  // STEP 5: Clear client session state (gameId + gameSessionId) for ALL
  //         active WebSocket connections of this user (multi-device safe).
  //         This prevents ws.on("close") from re-triggering disconnect for
  //         the old battle, and prevents handleAuthenticate from restoring it.
  //
  //         We scan the FULL clients map (not just userConnections) as a
  //         safety net, because userConnections may be stale if a device
  //         reconnected without re-authenticating.
  // ========================================================================
  let clearedCount = 0;
  for (const [connId, connClient] of clients.entries()) {
    if (connClient.userId === userId && connClient.gameId === gameId) {
      connClient.gameId = undefined;
      connClient.gameSessionId = undefined;
      clearedCount++;
    }
  }
  if (clearedCount > 0) {
  }

  // ========================================================================
  // STEP 6: Persist LEFT to DB — remove from teamATeammates/teamBTeammates
  //         This survives server restarts and ensures handleAuthenticate
  //         won't re-associate the player with the battle via DB lookup.
  //         MUST be synchronous (await) to avoid race conditions.
  // ========================================================================
  try {
    await persistPlayerLeftToDB(gameId, userId);
  } catch (err) {
    console.error(`[markPlayerAsLeft] Failed to persist LEFT to DB:`, err);
  }

  // ========================================================================
  // STEP 7: Broadcast online status update (await to ensure cross-instance reads)
  // ========================================================================
  try {
    await broadcastOnlineStatusUpdate();
  } catch (err) {
    console.error(`[markPlayerAsLeft] Failed to broadcast online status:`, err);
  }

  return true; // player was newly marked as left
}

/**
 * Persist the LEFT transition to the database.
 * Removes the player from teamATeammates or teamBTeammates in the team_battles table.
 * This ensures that even after a server restart, handleAuthenticate won't
 * find this player in any active battle's teammate arrays.
 */
async function persistPlayerLeftToDB(gameId: string, userId: number): Promise<void> {
  try {
    // Find the battle associated with this gameSession
    // gameId in team battles can be the battle ID directly, or a session ID
    let battle = await database.getTeamBattle(gameId);

    if (!battle) {
      // Try looking up by game session
      const battles = await database.getTeamBattlesByGameSession(gameId);
      const activeBattle = battles.find(b => b.status === "playing" || b.status === "ready" || b.status === "forming");
      if (activeBattle) {
        battle = activeBattle;
      }
    }

    if (!battle) {
      return;
    }

    // Determine which team the player was on and remove from teammates array
    const updates: Record<string, any> = {};

    if (battle.teamACaptainId === userId) {
      // Player was Team A captain — handled by captain transfer logic elsewhere
    }

    if (battle.teamBCaptainId === userId) {
      // Player was Team B captain — handled by captain transfer logic elsewhere
    }

    // Remove from teamATeammates if present
    const teamATeammates = battle.teamATeammates || [];
    if (teamATeammates.includes(userId)) {
      updates.teamATeammates = teamATeammates.filter((id: number) => id !== userId);
    }

    // Remove from teamBTeammates if present
    const teamBTeammates = battle.teamBTeammates || [];
    if (teamBTeammates.includes(userId)) {
      updates.teamBTeammates = teamBTeammates.filter((id: number) => id !== userId);
    }

    if (Object.keys(updates).length > 0) {
      await database.updateTeamBattle(battle.id, updates);
    }

    // Additive: mark player as LEFT in team_battle_players if that table/column exists.
    // This is the DB-authoritative LEFT flag used by authenticate and gameplay guards.
    try {
      await database.markTeamBattlePlayerLeft(battle.id, userId);
    } catch (err) {
      // Tolerant — database method logs internally if not supported.
    }
  } catch (error) {
    console.error(`[persistPlayerLeftToDB] Error persisting LEFT for user ${userId} in gameId ${gameId}:`, error);
  }
}

// Helper: Check if a player has left a specific game session
export function hasPlayerLeft(gameId: string, userId: number): boolean {
  const gameSession = gameSessions.get(gameId);
  return gameSession?.leftPlayerIds?.has(userId) ?? false;
}

// Helper: Check if a player has left ANY active game session (used by handleAuthenticate)
export function hasPlayerLeftAnyActiveGame(userId: number): { left: boolean; gameId?: string } {
  for (const [gameId, session] of gameSessions.entries()) {
    if (session.gameType === "team_battle" && session.leftPlayerIds?.has(userId)) {
      return { left: true, gameId };
    }
  }
  return { left: false };
}

// Authoritative busy check (DB-backed). Returns true if user is busy.
export async function isUserBusy(userId: number): Promise<boolean> {
  try {
    // Look for forming or playing battles and see if the user is a member/captain
    const forming = await database.getTeamBattlesByStatus("forming");
    const playing = await database.getTeamBattlesByStatus("playing");
    const battles = [...forming, ...playing];

    for (const battle of battles) {
      const captainMatch = battle.teamACaptainId === userId || battle.teamBCaptainId === userId;
      const teammatesA = Array.isArray(battle.teamATeammates) ? extractTeammateIds(battle.teamATeammates) : [];
      const teammatesB = Array.isArray(battle.teamBTeammates) ? extractTeammateIds(battle.teamBTeammates) : [];
      const teammateMatch = teammatesA.includes(userId) || teammatesB.includes(userId);

      if (captainMatch || teammateMatch) {
        // If DB explicitly marks user as LEFT for this battle, they are NOT busy
        const dbLeft = await database.getTeamBattlePlayerLeftStatus(battle.id, userId);
        if (dbLeft === true) {
          return false;
        }
        return true;
      }
    }

    return false;
  } catch (err) {
    // On error, be conservative: treat user as not busy so availability is not blocked.
    console.error("[isUserBusy] error:", err);
    return false;
  }
}

// In-memory Team Join Requests (id -> request)
type JoinRequestStatus = "pending" | "accepted" | "rejected" | "expired" | "cancelled";
interface JoinRequest {
  id: string;
  teamId: string;
  requesterId: number;
  requesterUsername: string;
  status: JoinRequestStatus;
  createdAt: number;
  expiresAt?: number | null;
}
const joinRequests: Map<string, JoinRequest> = new Map();

export function listJoinRequestsForUser(userId: number): JoinRequest[] {
  const result: JoinRequest[] = [];
  joinRequests.forEach((jr) => {
    if (jr.requesterId === userId) result.push(jr);
  });
  return result;
}

export function listJoinRequestsForTeam(teamId: string): JoinRequest[] {
  const result: JoinRequest[] = [];
  joinRequests.forEach((jr) => {
    if (jr.teamId === teamId) result.push(jr);
  });
  return result;
}

// ============================================================================
// CONNECTION LIVENESS TRACKING (Ping/Pong)
// ============================================================================
// Track when each connection was last active to detect stale connections
// This ensures we clean up dead connections and don't send to them
// CRITICAL: lastSeen must be updated on EVERY incoming message, including ping
// ============================================================================
const connectionLastSeen: Map<string, number> = new Map();
// INCREASED THRESHOLD: 3 minutes (180 seconds) - must be much longer than ping interval (25s)
// This prevents false "captain left" errors when connections are idle but alive
const STALE_CONNECTION_THRESHOLD = 180000; // 180 seconds = 3 minutes

// Update connection last seen time - MUST be called on every incoming message
function updateConnectionLastSeen(clientId: string) {
  const now = Date.now();
  connectionLastSeen.set(clientId, now);
}

// Initialize connection lastSeen when client first connects
function initializeConnectionLastSeen(clientId: string) {
  connectionLastSeen.set(clientId, Date.now());
}

// Periodic cleanup of stale connections (every 60 seconds - less aggressive)
setInterval(() => {
  const now = Date.now();
  const staleClientIds: string[] = [];

  for (const [clientId, lastSeen] of connectionLastSeen.entries()) {
    const timeSinceLastSeen = now - lastSeen;
    if (timeSinceLastSeen > STALE_CONNECTION_THRESHOLD) {
      const client = clients.get(clientId);
      staleClientIds.push(clientId);
    }
  }

  for (const clientId of staleClientIds) {
    const client = clients.get(clientId);
    if (client) {
      // CRITICAL: Double-check WebSocket readyState before marking as stale
      // readyState 1 = OPEN (still connected)
      if (client.ws && client.ws.readyState === 1) {
        // Connection is still open - might be alive but idle
        // Update lastSeen and skip cleanup this round
        connectionLastSeen.set(clientId, Date.now() - (STALE_CONNECTION_THRESHOLD / 2)); // Give 50% more time
        continue;
      }


      // Remove from userConnections
      if (client.userId) {
        const connections = userConnections.get(client.userId) || [];
        const filtered = connections.filter(id => id !== clientId);
        if (filtered.length > 0) {
          userConnections.set(client.userId, filtered);
        } else {
          userConnections.delete(client.userId);
        }
      }

      // Close the websocket if still connected
      try {
        if (client.ws && client.ws.readyState === 1) {
          client.ws.close();
        }
      } catch (e) {
        // Ignore close errors
      }

      clients.delete(clientId);
    }
    connectionLastSeen.delete(clientId);
  }

  if (staleClientIds.length > 0) {
  }
}, 60000); // Check every 60 seconds (less aggressive)

// ============================================================================
// DATABASE KEEP-ALIVE (Prevents Neon serverless cold start)
// ============================================================================
// Ping database every 2 minutes to prevent Neon from sleeping.
// This ensures the database is always warm when users click Ready.
// ============================================================================
let lastDbPingTime = Date.now();
setInterval(async () => {
  try {
    // Simple lightweight query to keep connection alive
    const startTime = Date.now();
    await database.getUser(1);
    const duration = Date.now() - startTime;
    lastDbPingTime = Date.now();
  } catch (error: any) {
    console.error(`[Database] ❌ Keep-alive ping failed:`, error?.message || error);
    // Connection might be dead - the next actual request will re-establish it
  }
}, 2 * 60 * 1000); // Every 2 minutes

// Export function to check if database was recently active
export function isDatabaseWarm(): boolean {
  return Date.now() - lastDbPingTime < 3 * 60 * 1000; // Active in last 3 minutes
}

export function createJoinRequest(teamId: string, requesterId: number, requesterUsername: string, gameSessionId?: string): JoinRequest {
  const id = `jr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Date.now() + 60_000;
  const jr: JoinRequest = {
    id,
    teamId,
    requesterId,
    requesterUsername,
    status: "pending",
    createdAt: Date.now(),
    expiresAt,
  };
  joinRequests.set(id, jr);

  // Create the broadcast payload with gameSessionId if provided
  const broadcastPayload: GameEvent = {
    type: "join_request_created",
    teamId,
    requesterId,
    requesterUsername,
    joinRequestId: id,
    expiresAt: new Date(expiresAt),
  };

  // Add gameSessionId to payload if provided for session-specific filtering
  if (gameSessionId) {
    broadcastPayload.gameSessionId = gameSessionId;
  }

  broadcast(broadcastPayload);
  // auto-expire
  setTimeout(() => {
    const current = joinRequests.get(id);
    if (current && current.status === "pending") {
      current.status = "expired";
      joinRequests.set(id, current);
      broadcast({
        type: "join_request_updated",
        joinRequestId: id,
        status: "expired",
        teamId,
        requesterId,
      });
    }
  }, 60_000);
  return jr;
}

export async function updateJoinRequest(
  id: string,
  status: JoinRequestStatus,
  actorId: number
): Promise<JoinRequest | null> {
  const jr = joinRequests.get(id);
  if (!jr) return null;
  jr.status = status;
  joinRequests.set(id, jr);

  // On accept, add member to team
  if (status === "accepted") {
    const team = await database.getTeam(jr.teamId);
    if (team) {
      const members = Array.isArray(team.members) ? team.members : [];
      if (members.length < 3) {
        members.push({ userId: jr.requesterId, username: jr.requesterUsername, role: "member", joinedAt: new Date() });
        await database.updateTeamMembers(jr.teamId, members);
      } else {
        // Team full; mark rejected
        jr.status = "rejected";
        joinRequests.set(id, jr);
      }
    }
  }

  broadcast({
    type: "join_request_updated",
    joinRequestId: id,
    status,
    teamId: jr.teamId,
    requesterId: jr.requesterId,
  });
  return jr;
}

function broadcast(payload: any) {
  clients.forEach((client) => {
    try {
      client.ws.send(JSON.stringify(payload));
    } catch { }
  });
}

export function getOnlineUserIds(): number[] {
  const onlineUserIds = new Set<number>();

  // Get all clients with userIds using forEach
  clients.forEach((client) => {
    if (client.userId) {
      onlineUserIds.add(client.userId);
    }
  });

  return Array.from(onlineUserIds);
}

async function resolveCaptainAndSessionForTeamId(teamId: string): Promise<{
  captainId: number | null;
  gameSessionId?: string;
}> {
  const parts = teamId.split("-team-");
  if (parts.length !== 2) {
    return { captainId: null };
  }

  const rawBattleId = parts[0];
  const battleId = rawBattleId.startsWith("battle-")
    ? rawBattleId.substring("battle-".length)
    : rawBattleId;
  const teamSide = parts[1].toLowerCase();

  let battle = await database.getTeamBattle(battleId);
  if (!battle && rawBattleId !== battleId) {
    battle = await database.getTeamBattle(rawBattleId);
  }
  if (!battle) {
    return { captainId: null };
  }

  const captainId =
    teamSide === "a" ? battle.teamACaptainId : battle.teamBCaptainId ?? null;

  return {
    captainId: captainId ?? null,
    gameSessionId: battle.gameSessionId || undefined,
  };
}

function notifyJoinRequestExpired(
  jr: any,
  requesterId: number,
  options?: {
    captainId?: number | null;
    gameSessionId?: string;
    message?: string;
  }
): void {
  const teamId = jr.team_id || jr.teamId;
  const expiredPayload = {
    type: "join_request_updated" as const,
    joinRequestId: jr.id,
    status: "expired" as const,
    teamId,
    requesterId,
    gameSessionId: options?.gameSessionId,
    message:
      options?.message ||
      "This join request has expired because you joined another team.",
  };

  sendToUser(requesterId, expiredPayload);

  const captainId = options?.captainId;
  if (captainId && captainId !== requesterId) {
    sendToUser(captainId, expiredPayload);
  }
}

/**
 * Expire pending join requests from a user to a specific team and notify both parties.
 * Used when a player joins via invitation while a join request is still pending.
 */
export async function expireJoinRequestsForUserOnTeamAndNotify(
  userId: number,
  teamId: string,
  gameSessionId?: string,
  message?: string
): Promise<void> {
  try {
    const expiredRows = await database.expirePendingJoinRequestsForUserOnTeam(
      userId,
      teamId
    );
    if (expiredRows.length === 0) {
      return;
    }

    const { captainId, gameSessionId: resolvedSessionId } =
      await resolveCaptainAndSessionForTeamId(teamId);

    for (const jr of expiredRows) {
      notifyJoinRequestExpired(jr, userId, {
        captainId,
        gameSessionId: gameSessionId || resolvedSessionId,
        message:
          message ||
          "This join request expired because the player accepted your team invitation.",
      });
    }
  } catch (error) {
    console.error(
      "[expireJoinRequestsForUserOnTeamAndNotify] Error expiring join requests:",
      error
    );
  }
}

/**
 * Expires all pending join requests and invitations for a user when they join a team.
 * This ensures a member can only be in one team at a time.
 */
export async function expireAllPendingRequestsAndInvitationsForUser(userId: number): Promise<void> {
  try {
    // Get all pending join requests for this user
    const pendingJoinRequests = await database.getJoinRequestsByUser(userId);
    const pendingRequests = pendingJoinRequests.filter(
      (jr: any) => jr.status === "pending"
    );

    // Expire all pending join requests
    for (const jr of pendingRequests) {
      await database.updateJoinRequestStatus(jr.id, "expired");

      const teamId = jr.team_id || jr.teamId;
      const { captainId, gameSessionId } = teamId
        ? await resolveCaptainAndSessionForTeamId(teamId)
        : { captainId: null, gameSessionId: undefined };

      notifyJoinRequestExpired(jr, userId, {
        captainId,
        gameSessionId,
        message:
          "This join request has expired because you joined another team.",
      });
    }

    // Get all pending invitations for this user
    const pendingInvitations = await database.getTeamInvitationsByUser(userId, "pending");

    // Expire all pending invitations
    for (const invitation of pendingInvitations) {
      await database.updateTeamInvitation(invitation.id, {
        status: "expired",
      });

      // Notify the user that their invitation expired
      sendToUser(userId, {
        type: "invitation_expired",
        invitation: invitation,
        message: "This invitation has expired because you joined another team.",
      });
    }

  } catch (error) {
    console.error(
      "[expireAllPendingRequestsAndInvitationsForUser] Error expiring requests/invitations:",
      error
    );
  }
}

// Store users' WebSocket connections for notifications
const userConnections: Map<number, string[]> = new Map();

// Store active team memberships for quick availability checking
export const activeTeamMemberships: Map<number, string> = new Map(); // userId -> teamId

// Export function to check if a user is in an active team
export function isUserInActiveTeam(userId: number): boolean {
  return activeTeamMemberships.has(userId);
}

// Export function to get available user IDs (online and not in active teams)
export function getAvailableUserIds(): number[] {
  const onlineUserIds = getOnlineUserIds();
  return onlineUserIds.filter(userId => !activeTeamMemberships.has(userId));
}

// Track pending disconnects with grace period (to handle page reload dialogs)
interface PendingDisconnect {
  userId: number;
  gameSessionId: string;
  clientId: string;
  timeout: NodeJS.Timeout;
  cancelled: boolean;
}
const pendingDisconnects: Map<string, PendingDisconnect> = new Map(); // clientId -> PendingDisconnect

// Small helper type guard used when filtering optional arrays from maps
function present<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    const clientId = uuidv4();

    // Store client in map
    clients.set(clientId, { id: clientId, ws });

    // CRITICAL: Initialize connectionLastSeen immediately when client connects
    // This prevents new connections from being incorrectly marked as stale
    initializeConnectionLastSeen(clientId);

    // Handle incoming messages
    ws.on("message", (message) => {
      try {
        const event: GameEvent = JSON.parse(message.toString());
        handleGameEvent(clientId, event);
      } catch (err) {
        // Silent error handling
      }
    });

    // Handle client disconnection
    ws.on("close", async () => {
      const client = clients.get(clientId);

      if (client) {
        // Handle team setup disconnect (when user is in team but not in active battle)
        // Add grace period to handle page reload dialogs - user might cancel and reconnect
        if (client.userId && client.gameSessionId && !client.gameId) {
          // Check if there's already a pending disconnect for this client
          const existingPending = pendingDisconnects.get(clientId);
          if (existingPending) {
            // Cancel the existing pending disconnect
            clearTimeout(existingPending.timeout);
            existingPending.cancelled = true;
            pendingDisconnects.delete(clientId);
          }

          // Create a pending disconnect with grace period (3 seconds)
          const pendingDisconnect: PendingDisconnect = {
            userId: client.userId,
            gameSessionId: client.gameSessionId,
            clientId: clientId,
            timeout: setTimeout(async () => {
              // Check if this disconnect was cancelled (user reconnected)
              if (pendingDisconnect.cancelled) {
                pendingDisconnects.delete(clientId);
                return;
              }

              // Check if user has reconnected (same userId with same gameSessionId)
              const hasReconnected = Array.from(clients.values()).some(
                (c: Client) =>
                  c.userId === client.userId &&
                  c.gameSessionId === client.gameSessionId &&
                  c.id !== clientId &&
                  c.ws &&
                  c.ws.readyState === WebSocket.OPEN
              );

              if (hasReconnected) {
                // User reconnected - cancel the disconnect
                pendingDisconnects.delete(clientId);
                return;
              }

              // User didn't reconnect - process the disconnect
              pendingDisconnects.delete(clientId);

              // Use values from pendingDisconnect (they're guaranteed to exist)
              const disconnectUserId = pendingDisconnect.userId;
              const disconnectGameSessionId = pendingDisconnect.gameSessionId;

              try {
                const battles = await database.getTeamBattlesByGameSession(disconnectGameSessionId);
                if (battles.length > 0) {
                  const battle = battles[0];
                  let updatedBattle = battle;
                  let teamRemoved = false;

                  // Check if the disconnected user is a captain
                  if (battle.teamACaptainId === disconnectUserId) {
                    // Team A captain disconnected - remove Team A (required for battle)
                    // IMPORTANT: capture existing Team A teammates BEFORE deleting, so we can notify them
                    const oldTeamATeammateIds = extractTeammateIds(battle.teamATeammates);
                    const oldTeamAName = battle.teamAName || "Team A";

                    // CENTRALIZED: Use resetBattleState for cleanup
                    await resetBattleState({
                      battleId: battle.id,
                      reason: "team_a_left",
                      deleteBattle: true, // Team A leaves = delete entire battle
                    });
                    teamRemoved = true;

                    // Notify all participants
                    const participantIds = new Set<number>();
                    if (battle.teamACaptainId) participantIds.add(battle.teamACaptainId);
                    if (battle.teamBCaptainId) participantIds.add(battle.teamBCaptainId);
                    for (const id of extractTeammateIds(battle.teamATeammates)) participantIds.add(id);
                    for (const id of extractTeammateIds(battle.teamBTeammates)) participantIds.add(id);

                    for (const userId of Array.from(participantIds)) {
                      if (userId !== disconnectUserId) {
                        // Check if this participant is a Team A member (they should see captain_left_team)
                        const isTeamAMember = userId === battle.teamACaptainId ||
                          oldTeamATeammateIds.includes(userId);

                        if (isTeamAMember) {
                          // Team A members see captain_left_team popup
                          sendToUser(userId, {
                            type: "captain_left_team",
                            gameSessionId: disconnectGameSessionId,
                            captainName: client.playerName || "The captain",
                            teamName: oldTeamAName,
                            message: `Your captain (${client.playerName || "The captain"}) left ${oldTeamAName}. The battle has been cancelled.`,
                          });
                        } else {
                          // Team B (opponents) see opponent_disconnected popup
                          sendToUser(userId, {
                            type: "opponent_disconnected",
                            gameSessionId: disconnectGameSessionId,
                            disconnectedPlayerName: client.playerName || 'A player',
                            disconnectedTeamName: oldTeamAName,
                            message: `⚠️ ${client.playerName || 'A player'} (Team A captain) has left the lobby. The battle has been cancelled.`,
                            severity: "warning",
                            timestamp: new Date(),
                          });
                        }
                      }
                    }
                  } else if (battle.teamBCaptainId === disconnectUserId) {
                    // Team B captain disconnected - remove Team B (optional)
                    // IMPORTANT: capture Team B teammates BEFORE clearing them, otherwise they won't receive any updates
                    const oldTeamBTeammateIds = extractTeammateIds(battle.teamBTeammates);
                    const oldTeamBName = battle.teamBName || "Team B";

                    // Clear Team B data from battle (this is specific to Team B leave)
                    updatedBattle = await database.updateTeamBattle(battle.id, {
                      teamBCaptainId: null,
                      teamBName: null,
                      teamBTeammates: [],
                    });

                    // CENTRALIZED: Use resetBattleState for ready state cleanup
                    // Collect Team A members to notify
                    const teamACaptainId = battle.teamACaptainId;
                    const teamATeammates = extractTeammateIds(battle.teamATeammates);
                    const allTeamAMembers = [teamACaptainId, ...teamATeammates].filter((id): id is number => id !== undefined);

                    await resetBattleState({
                      battleId: battle.id,
                      reason: "team_b_left",
                      gameSessionId: disconnectGameSessionId,
                      notifyUserIds: allTeamAMembers,
                      deleteBattle: false,
                      newStatus: "forming",
                    });

                    // Notify remaining participants
                    const participantIds = new Set<number>();
                    participantIds.add(battle.teamACaptainId);
                    for (const id of extractTeammateIds(battle.teamATeammates)) participantIds.add(id);

                    for (const userId of Array.from(participantIds)) {
                      sendToUser(userId, {
                        type: "opponent_disconnected",
                        gameSessionId: client.gameSessionId,
                        disconnectedPlayerName: client.playerName || 'A player',
                        disconnectedTeamName: oldTeamBName,
                        message: `⚠️ ${client.playerName || 'A player'} (Team B captain) left the lobby. You can invite a new opponent captain to continue.`,
                        severity: "warning",
                        timestamp: new Date(),
                      });
                    }

                    // Notify Team B teammates (they get dropped from teams_updated once Team B is cleared)
                    for (const teammateId of oldTeamBTeammateIds) {
                      if (teammateId !== disconnectUserId) {
                        sendToUser(teammateId, {
                          type: "team_member_removed",
                          gameSessionId: disconnectGameSessionId,
                          message: `Your captain left the lobby (${oldTeamBName}). You’ve been removed from this match. Please join/create a team again.`,
                        });
                      }
                    }
                  } else {
                    // Regular teammate disconnected - remove from their team
                    const isTeamAMember = extractTeammateIds(battle.teamATeammates).includes(disconnectUserId);
                    const isTeamBMember = extractTeammateIds(battle.teamBTeammates).includes(disconnectUserId);

                    if (isTeamAMember) {
                      const updatedTeammates = extractTeammateIds(battle.teamATeammates).filter(id => id !== disconnectUserId);
                      updatedBattle = await database.updateTeamBattle(battle.id, {
                        teamATeammates: updatedTeammates,
                      });
                    } else if (isTeamBMember) {
                      const updatedTeammates = extractTeammateIds(battle.teamBTeammates).filter(id => id !== disconnectUserId);
                      updatedBattle = await database.updateTeamBattle(battle.id, {
                        teamBTeammates: updatedTeammates,
                      });
                    }

                    // Separate same-team members from opposing team members
                    const sameTeamMemberIds = new Set<number>();
                    const opposingTeamMemberIds = new Set<number>();

                    // Add Team A members
                    if (isTeamAMember) {
                      sameTeamMemberIds.add(battle.teamACaptainId);
                      for (const id of extractTeammateIds(battle.teamATeammates)) {
                        if (id !== disconnectUserId) sameTeamMemberIds.add(id);
                      }
                      // Team B members are opposing
                      if (battle.teamBCaptainId) opposingTeamMemberIds.add(battle.teamBCaptainId);
                      for (const id of extractTeammateIds(battle.teamBTeammates)) {
                        opposingTeamMemberIds.add(id);
                      }
                    } else if (isTeamBMember && battle.teamBCaptainId) {
                      sameTeamMemberIds.add(battle.teamBCaptainId);
                      for (const id of extractTeammateIds(battle.teamBTeammates)) {
                        if (id !== disconnectUserId) sameTeamMemberIds.add(id);
                      }
                      // Team A members are opposing
                      opposingTeamMemberIds.add(battle.teamACaptainId);
                      for (const id of extractTeammateIds(battle.teamATeammates)) {
                        opposingTeamMemberIds.add(id);
                      }
                    }

                    // For opposing team members:
                    // - If captain disconnects → show popup (opponent_disconnected)
                    // - If member disconnects → show toast (opponent_team_member_disconnected)
                    // Check if disconnected user is a captain
                    const isDisconnectedCaptain = (isTeamAMember && battle.teamACaptainId === disconnectUserId) ||
                      (isTeamBMember && battle.teamBCaptainId === disconnectUserId);

                    for (const userId of Array.from(opposingTeamMemberIds)) {
                      if (isDisconnectedCaptain) {
                        // Captain disconnected from opponent team → show popup
                        sendToUser(userId, {
                          type: "opponent_disconnected",
                          gameSessionId: disconnectGameSessionId,
                          disconnectedPlayerName: client.playerName || 'A player',
                          disconnectedTeamName: isTeamAMember ? (battle.teamAName || 'Team A') : (isTeamBMember ? (battle.teamBName || 'Team B') : 'Unknown'),
                          message: `⚠️ ${client.playerName || 'A player'} (Captain) has disconnected from team setup.`,
                          severity: "warning",
                          timestamp: new Date(),
                        });
                      } else {
                        // Member disconnected from opponent team → show toast (not popup)
                        sendToUser(userId, {
                          type: "opponent_team_member_disconnected",
                          gameSessionId: disconnectGameSessionId,
                          disconnectedPlayerName: client.playerName || 'A player',
                          disconnectedTeamName: isTeamAMember ? (battle.teamAName || 'Team A') : (isTeamBMember ? (battle.teamBName || 'Team B') : 'Unknown'),
                          message: `${client.playerName || 'A player'} from team "${isTeamAMember ? (battle.teamAName || 'Team A') : (battle.teamBName || 'Team B')}" has disconnected from team setup.`,
                        });
                      }
                    }

                    // Send "teammate_disconnected" to same-team members (simple toast, not popup)
                    for (const userId of Array.from(sameTeamMemberIds)) {
                      sendToUser(userId, {
                        type: "teammate_disconnected",
                        gameSessionId: disconnectGameSessionId,
                        disconnectedPlayerName: client.playerName || 'A player',
                        teamName: isTeamAMember ? (battle.teamAName || 'Team A') : (battle.teamBName || 'Team B'),
                        message: `${client.playerName || 'A player'} has left your team.`,
                      });
                    }
                  }

                  // Send updated teams data if battle still exists
                  if (!teamRemoved) {
                    const teams = await getTeamsForTeamBattleSession(disconnectGameSessionId);
                    const allClientsInSession = Array.from(clients.values()).filter(
                      (c: Client) => c.userId && teams.some(team => team.members.some((m: any) => m.userId === c.userId))
                    );

                    for (const sessionClient of allClientsInSession) {
                      sendToClient(sessionClient.id, {
                        type: "teams_updated",
                        teams: teams,
                        gameSessionId: disconnectGameSessionId,
                        message: `${client.playerName || 'A player'} has disconnected from team setup.`,
                      });
                    }
                  }
                }
              } catch (error) {
                console.error("[Disconnect Grace Period] Error processing disconnect:", error);
                // Silent error handling
              }
            }, 3000), // 3 second grace period
            cancelled: false,
          };

          pendingDisconnects.set(clientId, pendingDisconnect);
          // Don't process disconnect immediately - wait for grace period
        }

        if (client.gameId) {
          // Check if this is a team battle game
          const gameSession = gameSessions.get(client.gameId);

          if (gameSession?.gameType === "team_battle") {
            // ================================================================
            // LIFECYCLE GUARD: If player already LEFT, skip disconnect handler.
            // markPlayerAsLeft already cleared client.gameId, but check anyway
            // in case of race conditions or edge cases.
            // ================================================================
            if (client.userId && hasPlayerLeft(client.gameId, client.userId)) {
            } else {
              // Handle team battle disconnect
              try {
                await handleTeamBattlePlayerDisconnect(
                  clientId,
                  client.gameId,
                  client.userId
                );
              } catch (error) {
                // Silent error handling
              }
            }
          } else {
            // Handle regular game disconnect
            handlePlayerLeave(
              clientId,
              client.gameId,
              client.playerName || "Unknown Player"
            );
          }
        }

        // Remove client from user connections map
        if (client.userId) {

          const connections = userConnections.get(client.userId) || [];
          const updatedConnections = connections.filter(
            (id) => id !== clientId
          );

          if (updatedConnections.length > 0) {
            userConnections.set(client.userId, updatedConnections);
          } else {
            userConnections.delete(client.userId);
            // Set user offline when no more connections
            database.setUserOnline(client.userId, false).catch(console.error);
            // Broadcast online status update
            broadcastOnlineStatusUpdate();
          }
        }
      }

      // Remove client from map
      clients.delete(clientId);

      // Clean up connectionLastSeen
      connectionLastSeen.delete(clientId);
    });

    // Send initial connection confirmation
    ws.send(
      JSON.stringify({
        type: "connection_established",
        clientId,
        message: "Connected to Bible Trivia Game Server",
      })
    );
  });

  return wss;
}

function handleGameEvent(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client) return;

  // Update connection liveness on every message
  updateConnectionLastSeen(clientId);

  switch (event.type) {
    // ========================================================================
    // PING/PONG - Keep connection alive
    // ========================================================================
    case "ping":
      // CRITICAL: Explicitly update lastSeen on ping (in addition to the call above)
      // This ensures idle connections sending pings are never marked as stale
      updateConnectionLastSeen(clientId);
      sendToClient(clientId, { type: "pong", serverTime: Date.now() });
      break;

    // Real-time multiplayer events
    case "authenticate":
      handleAuthenticate(clientId, event);
      break;
    case "join_game":
      handleJoinGame(clientId, event);
      break;
    case "create_game":
      handleCreateGame(clientId, event);
      break;
    case "start_game":
      handleStartGame(event.gameId!);
      break;
    case "submit_answer":
      handleSubmitAnswer(clientId, event);
      break;
    case "leave_game":
      if (client.gameId) {
        // Check if this is a team battle or regular game
        const leaveGameSession = gameSessions.get(client.gameId);
        if (leaveGameSession?.gameType === "team_battle") {
          // LIFECYCLE GUARD: Skip if player already LEFT
          if (client.userId && hasPlayerLeft(client.gameId, client.userId)) {
          } else {
            // Team battle: use proper handler that cleans up "busy" status
            handleTeamBattlePlayerDisconnect(clientId, client.gameId, client.userId);
          }
        } else if (client.playerName) {
          // Regular game: use existing handler
          handlePlayerLeave(clientId, client.gameId, client.playerName);
        }
      }
      break;

    // Asynchronous challenge events
    case "create_challenge":
      handleCreateChallenge(clientId, event);
      break;
    case "accept_challenge":
      handleAcceptChallenge(clientId, event);
      break;
    case "decline_challenge":
      handleDeclineChallenge(clientId, event);
      break;
    case "submit_challenge_answer":
      handleSubmitChallengeAnswer(clientId, event);
      break;
    case "complete_challenge":
      handleCompleteChallenge(clientId, event);
      break;

    // Notification events
    case "mark_notification_read":
      handleMarkNotificationRead(clientId, event);
      break;

    // Team-based multiplayer events
    case "create_team":
      handleCreateTeam(clientId, event);
      break;
    case "join_team":
      handleJoinTeam(clientId, event);
      break;
    case "invite_to_team":
      handleInviteToTeam(clientId, event);
      break;
    case "accept_team_invitation":
      handleAcceptTeamInvitation(clientId, event);
      break;
    case "decline_team_invitation":
      handleDeclineTeamInvitation(clientId, event);
      break;
    case "recruit_player":
      handleRecruitPlayer(clientId, event);
      break;
    case "send_email_invitation":
      handleSendEmailInvitation(clientId, event);
      break;
    case "submit_team_answer":
      handleSubmitTeamAnswer(clientId, event);
      break;
    case "finalize_team_answer":
      handleFinalizeTeamAnswer(clientId, event);
      break;
    case "team_option_selected":
      handleTeamOptionSelected(clientId, event);
      break;
    case "team_ready":
      handleTeamReady(clientId, event);
      break;
    case "start_team_battle":
      handleStartTeamBattle(clientId, event);
      break;
    case "get_game_state":
      handleGetGameState(clientId, event);
      break;
    case "rejoin_team":
      handleRejoinTeam(clientId, event);
      break;

    // Team battle specific ready flow
    case "team_battle_ready":
      handleTeamBattleReady(clientId, event);
      break;

    case "team_battle_unready":
      handleTeamBattleUnready(clientId, event);
      break;

    // Request current ready status for a team battle
    case "request_ready_status":
      handleRequestReadyStatus(clientId, event);
      break;

    // Get ready state (for refresh/reconnect)
    case "get_ready_state":
      handleGetReadyState(clientId, event);
      break;

    // Bind a websocket connection to the current team-battle lobby session.
    // This enables disconnect notifications during the team setup (lobby) phase.
    case "team_battle_setup_session": {
      if (client.userId && event.gameSessionId) {
        client.gameSessionId = event.gameSessionId;
      }
      break;
    }

    // Handle player leaving team battle (intentional leave or page unload)
    case "player_leaving_team_battle":
      handlePlayerLeavingTeamBattle(clientId, event);
      break;

    // Handle player leaving team setup (page reload, exit, network issues)
    case "player_leaving_team_setup":
      handlePlayerLeavingTeamSetup(clientId, event);
      break;

    default:
    // Unknown event type
  }
}

// Authentication handler to associate userId with socket connection
async function handleAuthenticate(clientId: string, event: GameEvent) {
  const { userId, playerName } = event;
  if (!userId) return;

  const client = clients.get(clientId);
  if (!client) return;

  try {
    // Check if user was already connected and clean up old connections
    const existingConnections = userConnections.get(userId) || [];
    existingConnections.forEach((oldClientId) => {
      if (oldClientId !== clientId) {
        const oldClient = clients.get(oldClientId);
        if (oldClient) {
          // Clean up old client's game state if it's stale
          oldClient.gameId = undefined;
        }
      }
    });

    // Update client with user information
    client.userId = userId;
    if (playerName) {
      client.playerName = playerName;
    }

    // Cancel any pending disconnects for this user (they reconnected)
    for (const [pendingClientId, pending] of pendingDisconnects.entries()) {
      if (pending.userId === userId && pending.gameSessionId === client.gameSessionId) {
        clearTimeout(pending.timeout);
        pending.cancelled = true;
        pendingDisconnects.delete(pendingClientId);
      }
    }

    // Add current connection to user's connection list (multi-device safe)
    const existingConns = userConnections.get(userId) || [];
    if (!existingConns.includes(clientId)) {
      existingConns.push(clientId);
    }
    userConnections.set(userId, existingConns);

    // Check if user is in any active team and restore their game state
    // Get all teams from all game sessions
    const allGameSessions = await database.getGameResults(); // This will help us find active sessions
    let userTeam = null;

    // Search through all possible game sessions for user's team
    const teamSearchPromises = [];
    const possibleSessions = [
      "test-session-fixes",
      "multiplayer-session-1",
      "team-battle-session",
      "final-test-session",
    ];

    for (const sessionId of possibleSessions) {
      teamSearchPromises.push(database.getTeamsByGameSession(sessionId));
    }

    // Also search for teams without specific session IDs
    teamSearchPromises.push(database.getTeamsByGameSession(""));

    const allTeamArrays = await Promise.all(teamSearchPromises);
    const allTeams = allTeamArrays.flat().filter((team) => team); // Remove any null/undefined teams

    userTeam = allTeams.find(
      (team) =>
        team.members.some((member) => member.userId === userId) &&
        (team.status === "forming" ||
          team.status === "ready" ||
          team.status === "playing")
    );

    if (userTeam) {
      // ====================================================================
      // LIFECYCLE GUARD: Never restore a battle where player has LEFT
      // ====================================================================
      // Check ALL active game sessions: if the player is in leftPlayerIds
      // for any session, they have permanently left and must NOT be restored.
      // This prevents the #1 cause of stale state after mid-game leave.
      // ====================================================================
      const leftCheck = hasPlayerLeftAnyActiveGame(userId);
      if (leftCheck.left) {
        // Don't set gameSessionId or gameId — player starts clean
        client.gameSessionId = undefined;
        client.gameId = undefined;
      } else {
        // Restore user's team context (only if NOT left)
        client.gameSessionId = userTeam.gameSessionId;

        // CRITICAL: Check database battle phase FIRST (server-authoritative)
        // This works even if server was restarted and gameSessions is empty
        try {
          const battles = await database.getTeamBattlesByGameSession(userTeam.gameSessionId);
          if (battles.length > 0) {
            const battle = battles.sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0];

            // CRITICAL FIX: Skip finished battles - don't restore stale state
            // This prevents "play again" scenarios from seeing old ready states
            if (battle.status === "finished") {
              // Don't restore any team context for finished battles
              client.gameSessionId = undefined;
            } else {
              // DB Guard: If the player has previously LEFT this battle according to DB, never restore.
              try {
                const dbLeft = await database.getTeamBattlePlayerLeftStatus(battle.id, userId);
                if (dbLeft === true) {
                  client.gameSessionId = undefined;
                  client.gameId = undefined;
                }
              } catch (err) {
                // Tolerant — treat as not-left if DB helper unavailable
              }
              // PRODUCTION-SAFE: Get ready state from database and sync to client
              const readyState = await database.getTeamReadyState(battle.id);

              // Send current ready status to client
              sendToClient(clientId, {
                type: "team_ready_status",
                teamBattleId: battle.id,
                gameSessionId: userTeam.gameSessionId,
                teamAReady: readyState.teamAReady,
                teamBReady: readyState.teamBReady,
                updatedAt: readyState.updatedAt,
              });
            }

            // If battle status is "playing" (IN_GAME), send team_battle_started event
            // This ensures client navigates even if in-memory gameSessions is empty
            if (battle.status === "playing") {
              sendToClient(clientId, {
                type: "team_battle_started",
                gameId: battle.id, // Use battle ID as gameId
                gameSessionId: userTeam.gameSessionId,
                teams: [], // Will be populated by get_game_state if needed
                message: "Reconnected to active battle!",
              });
              client.gameId = battle.id;
            }
          }
        } catch (error) {
          console.error(`[handleAuthenticate] Failed to check database battle phase:`, error);
        }

        // ALSO check in-memory gameSessions (for faster response if available)
        const activeBattleSession = Array.from(gameSessions.values()).find(
          (session) =>
            session.gameType === "team_battle" &&
            session.teams &&
            session.teams.some((t: any) => t.id === userTeam.id) &&
            // LIFECYCLE GUARD: Skip sessions where player has LEFT
            !session.leftPlayerIds?.has(userId)
        );

        if (activeBattleSession) {
          // User is in an active battle - set gameId to battle session ID
          client.gameId = activeBattleSession.id;

          // Send battle started event if battle is playing
          if (activeBattleSession.status === "playing") {
            sendToClient(clientId, {
              type: "team_battle_started",
              gameId: activeBattleSession.id,
              gameSessionId: userTeam.gameSessionId,
              teams: activeBattleSession.teams || [],
              message: "Reconnected to active battle!",
            });

            // If questions are loaded, send current question
            if (activeBattleSession.questions && activeBattleSession.questions.length > 0) {
              const currentIndex = activeBattleSession.currentQuestionIndex || 0;
              const currentQuestion = activeBattleSession.questions[currentIndex];
              if (currentQuestion) {
                // Determine which team should answer
                const questionNumber = currentIndex + 1;
                const isTeamATurn = questionNumber % 2 === 1;
                const answeringTeam = activeBattleSession.teams?.find((team: any) => {
                  if (team.teamSide) {
                    return isTeamATurn ? team.teamSide === "A" : team.teamSide === "B";
                  }
                  return false;
                }) || (isTeamATurn ? activeBattleSession.teams?.[0] : activeBattleSession.teams?.[1]);

                const playerTeam = activeBattleSession.teams?.find((t: any) => t.id === userTeam.id);
                const isYourTurn = playerTeam && playerTeam.id === answeringTeam?.id;

                // Choose event type based on session mode/gameType to avoid emitting both pipelines
                if ((activeBattleSession as any).mode === "rapid_fire" || (activeBattleSession as any).gameType === "rapid_fire") {
                  sendToClient(
                    clientId,
                    buildRapidFireQuestionReconnectEvent(
                      activeBattleSession,
                      activeBattleSession.id,
                      currentQuestion,
                      questionNumber,
                      activeBattleSession.questions.length,
                      userTeam.id,
                      {
                        isYourTurn: isYourTurn || false,
                        answeringTeamName: answeringTeam?.name,
                      }
                    )
                  );
                } else {
                  sendToClient(clientId, {
                    type: "team_battle_question",
                    gameId: activeBattleSession.id,
                    question: currentQuestion,
                    questionNumber: questionNumber,
                    totalQuestions: activeBattleSession.questions.length,
                    teamId: userTeam.id,
                    timeLimit: 15000,
                    isYourTurn: isYourTurn || false,
                    answeringTeamName: answeringTeam?.name,
                  });
                }
              }
            }
          }
        } else {
          // No active battle in memory - gameId already set from database check above if battle is playing
          if (!client.gameId) {
            client.gameId = userTeam.gameSessionId;
          }
        }
      }

      // Cancel any pending disconnects for this user with this gameSessionId (they reconnected)
      for (const [pendingClientId, pending] of pendingDisconnects.entries()) {
        if (pending.userId === userId && pending.gameSessionId === userTeam.gameSessionId) {
          clearTimeout(pending.timeout);
          pending.cancelled = true;
          pendingDisconnects.delete(pendingClientId);
        }
      }

      // Send team restoration data
      sendToClient(clientId, {
        type: "team_state_restored",
        team: userTeam,
        gameSessionId: userTeam.gameSessionId,
        message: "Reconnected to your team!",
      });

      // Get all teams in the session
      const allTeamsInSession = await database.getTeamsByGameSession(
        userTeam.gameSessionId
      );
      sendToClient(clientId, {
        type: "teams_updated",
        gameSessionId: userTeam.gameSessionId,
        teams: allTeamsInSession,
      });
    }

    // Update user's online status in the database (handle case where user might not exist)
    try {
      await database.setUserOnline(userId, true);
    } catch (error) {
      // User not found in storage
    }

    // Get user details for authentication response
    let username = event.username;
    if (!username) {
      try {
        const user = await database.getUser(userId);
        username = user?.username;
      } catch (error) {
        console.error("Error fetching user for authentication:", error);
      }
    }

    // Acknowledge authentication
    sendToClient(clientId, {
      type: "authenticated",
      userId,
      username,
      message: "Successfully authenticated",
    });

    // Broadcast user online status to all connected clients
    broadcastOnlineStatusUpdate();

    // Send any unread notifications
    sendUnreadNotifications(userId);
  } catch (error) {
    // Silent error handling
  }
}

// Send unread notifications to a user
async function sendUnreadNotifications(userId: number) {
  try {
    const notifications = await database.getNotifications(userId, false);

    // Send each notification to all of the user's connections
    const connections = userConnections.get(userId) || [];
    for (const notification of notifications) {
      for (const clientId of connections) {
        sendToClient(clientId, {
          type: "notification",
          message: notification.message,
          notificationId: notification.id,
          challengeId: notification.challengeId,
        });
      }
    }
  } catch (error) {
    // Silent error handling
  }
}

// Broadcast online status updates to all connected clients
export async function broadcastOnlineStatusUpdate() {
  try {
    const onlineUsers = await database.getOnlineUsers();

    // Determine availability using authoritative DB-backed helper
    const availabilityChecks = await Promise.all(
      onlineUsers.map(async (user) => {
        try {
          const busy = await isUserBusy(user.id);
          return { user, busy };
        } catch (err) {
          // If check fails, conservatively treat user as not busy (available)
          return { user, busy: false };
        }
      })
    );
    const availableUsers = availabilityChecks
      .filter((c) => c.user.isOnline && !c.busy)
      .map((c) => c.user);

    // Send updated online user list to all connected clients
    const allClientIds = Array.from(clients.keys());
    for (const clientId of allClientIds) {
      sendToClient(clientId, {
        type: "online_users_updated",
        onlineUsers: availableUsers.map((user) => ({
          id: user.id,
          username: user.username,
          isOnline: user.isOnline ?? false,
        })),
      });
    }
  } catch (error) {
    // Silent error handling
  }
}

// Broadcast team updates to all clients in a game session
export async function broadcastTeamUpdates(gameSessionId: string) {
  try {
    const teams = await database.getTeamsByGameSession(gameSessionId);

    const event: GameEvent = {
      type: "teams_updated",
      teams: teams,
    };

    const connectedClients = Array.from(clients.values());

    // Send to all clients that might be viewing this game session
    for (const client of connectedClients) {
      // Send to authenticated clients (they might be on the team battle page)
      if (client.userId) {
        sendToClient(client.id, event);
      }
    }
  } catch (error) {
    // Silent error handling
  }
}

// Helper function to get all active teams across all game sessions
async function getAllActiveTeams() {
  try {
    // Get all teams by iterating through known game sessions
    const allTeams = [];

    // Check teams from all connected clients' game sessions
    const gameSessionIds = new Set();
    for (const client of Array.from(clients.values())) {
      if (client.gameId) {
        gameSessionIds.add(client.gameId);
      }
    }

    // Also check gameSessions map
    for (const sessionId of Array.from(gameSessions.keys())) {
      gameSessionIds.add(sessionId);
    }

    // Get teams for each known session
    for (const sessionId of Array.from(gameSessionIds)) {
      try {
        const teams = await database.getTeamsByGameSession(sessionId as string);
        allTeams.push(
          ...teams.filter(
            (team) =>
              team.status === "forming" ||
              team.status === "ready" ||
              team.status === "playing"
          )
        );
      } catch (error) {
        // Session might not exist, continue
      }
    }

    // As fallback, also check some recent sessions by checking recent team creation patterns
    // This handles cases where teams are created with unique session IDs
    const recentTimestamp = Date.now() - 10 * 60 * 1000; // Last 10 minutes
    const possibleSessionIds = [];

    // Try to get teams from storage using a broader approach
    // We'll iterate through possible session ID patterns
    for (let i = 0; i < 50; i++) {
      try {
        const testSessionId = `session-${recentTimestamp + i}`;
        const teams = await database.getTeamsByGameSession(testSessionId);
        if (teams.length > 0) {
          allTeams.push(
            ...teams.filter(
              (team) =>
                team.status === "forming" ||
                team.status === "ready" ||
                team.status === "playing"
            )
          );
        }
      } catch (error) {
        // Continue checking
      }
    }

    return allTeams;
  } catch (error) {
    return [];
  }
}

// Helper to derive team-battle teams for a game session
// This mirrors the convertTeamBattleToTeams helper in routes.ts but is local
// to the WebSocket layer so we don't depend on the legacy teams table.
async function getTeamsForTeamBattleSession(gameSessionId: string) {
  const battles = await database.getTeamBattlesByGameSession(gameSessionId);
  const teamsForSession: any[] = [];

  const getUserInfo = async (userId: number) => {
    const user = await database.getUser(userId);
    return user ? { userId: user.id, username: user.username } : null;
  };

  for (const battle of battles) {
    const hasOpponent = Boolean(battle.teamBCaptainId && battle.teamBName);

    // Team A members
    const teamAMembers: any[] = [];
    const teamACaptainInfo = await getUserInfo(battle.teamACaptainId);
    teamAMembers.push({
      userId: battle.teamACaptainId,
      username: teamACaptainInfo?.username || "Unknown",
      role: "captain" as const,
      joinedAt: battle.createdAt,
    });
    for (const teammateId of extractTeammateIds(battle.teamATeammates)) {
      const info = await getUserInfo(teammateId);
      if (info) {
        teamAMembers.push({
          userId: info.userId,
          username: info.username,
          role: "member" as const,
          joinedAt: battle.createdAt,
        });
      }
    }

    teamsForSession.push({
      id: `${battle.id}-team-a`,
      teamBattleId: battle.id,
      teamSide: "A" as const,
      hasOpponent,
      name: battle.teamAName,
      captainId: battle.teamACaptainId,
      gameSessionId: battle.gameSessionId,
      members: teamAMembers,
      score: battle.teamAScore || 0,
      correctAnswers: battle.teamACorrectAnswers || 0,
      incorrectAnswers: battle.teamAIncorrectAnswers || 0,
      averageTime: 0,
      finalAnswers: [],
      status: battle.status,
      createdAt: battle.createdAt,
    });

    // Team B (if exists)
    if (battle.teamBCaptainId && battle.teamBName) {
      const teamBMembers: any[] = [];
      const teamBCaptainInfo = await getUserInfo(battle.teamBCaptainId);
      teamBMembers.push({
        userId: battle.teamBCaptainId,
        username: teamBCaptainInfo?.username || "Unknown",
        role: "captain" as const,
        joinedAt: battle.createdAt,
      });
      for (const teammateId of extractTeammateIds(battle.teamBTeammates)) {
        const info = await getUserInfo(teammateId);
        if (info) {
          teamBMembers.push({
            userId: info.userId,
            username: info.username,
            role: "member" as const,
            joinedAt: battle.createdAt,
          });
        }
      }

      teamsForSession.push({
        id: `${battle.id}-team-b`,
        teamBattleId: battle.id,
        teamSide: "B" as const,
        hasOpponent: true,
        name: battle.teamBName,
        captainId: battle.teamBCaptainId,
        gameSessionId: battle.gameSessionId,
        members: teamBMembers,
        score: battle.teamBScore || 0,
        correctAnswers: battle.teamBCorrectAnswers || 0,
        incorrectAnswers: battle.teamBIncorrectAnswers || 0,
        averageTime: 0,
        finalAnswers: [],
        status: battle.status,
        createdAt: battle.createdAt,
      });
    }
  }

  return teamsForSession;
}

// REAL-TIME MULTIPLAYER HANDLERS

function handleJoinGame(clientId: string, event: GameEvent) {
  const { gameId, playerName } = event;
  if (!gameId || !playerName) return;

  const client = clients.get(clientId);
  if (!client) return;

  // Update client information
  client.gameId = gameId;
  client.playerName = playerName;

  // Check if game exists
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) {
    sendToClient(clientId, {
      type: "error",
      message: "Game session not found",
    });
    return;
  }

  // Add player to game
  const player: Player = {
    id: clientId,
    name: playerName,
    score: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    averageTime: 0,
    isReady: false,
  };

  gameSession.players.push(player);

  // Notify all players in the game
  sendToGame(gameId, {
    type: "player_joined",
    playerName,
    playerId: clientId,
    leaderboard: gameSession.players,
  });
}

function handleCreateGame(clientId: string, event: GameEvent) {
  const {
    playerName,
    gameType = "realtime",
    category = "All",
    difficulty = "Beginner",
  } = event;
  if (!playerName) return;

  const client = clients.get(clientId);
  if (!client) return;

  // Create new game ID
  const gameId = uuidv4();

  // Update client information
  client.gameId = gameId;
  client.playerName = playerName;

  // Create new game session
  const gameSession = {
    id: gameId,
    players: [
      {
        id: clientId,
        name: playerName,
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        isReady: true,
      },
    ],
    status: "waiting" as const,
    gameType,
  };

  gameSessions.set(gameId, gameSession);

  // Also persist to storage for async games
  if (gameType === "async" && client.userId) {
    createAsyncGameSession(gameId, client.userId, category, difficulty);
  }

  // Notify client of successful game creation
  sendToClient(clientId, {
    type: "game_created",
    gameId,
    gameType,
    message: "Game created successfully",
    leaderboard: gameSession.players,
  });
}

async function createAsyncGameSession(
  gameId: string,
  creatorId: number,
  category: string,
  difficulty: string
) {
  try {
    // Create a game session in storage with random questions for the challenge
    // Use history-aware selection to exclude ALL previously answered questions
    const questions = await database.getRandomQuestionsWithHistory({
      category: category !== "All" ? category : undefined,
      difficulty: difficulty !== "All" ? difficulty : undefined,
      count: 10, // Standard 10 questions for challenges
      userId: creatorId || undefined,
      // Don't pass excludeRecentHours - will exclude ALL answered questions automatically
      // If all questions are answered, they'll be reused with word shuffling
    });

    const now = new Date();

    await database.createGameSession({
      id: gameId,
      players: [],
      currentQuestion: 0,
      gameType: "async",
      category,
      difficulty,
      startTime: now,
      status: "waiting",
    });
  } catch (error) {
    // Silent error handling
  }
}

async function handleStartGame(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  // Update game status
  gameSession.status = "playing";

  // For team games, we need to handle differently
  if (gameSession.gameType === "teams") {
    // Get the game session ID from team data
    const allTeams = await database.getTeamsByGameSession("");
    const gameTeams = allTeams.filter((team) =>
      team.members.some((member) =>
        gameSession.players.some((player) => player.userId === member.userId)
      )
    );

    // Create async game session in storage for team battle
    if (gameTeams.length >= 2) {
      const firstTeam = gameTeams[0];
      await createAsyncGameSession(
        gameId,
        firstTeam.captainId,
        "mixed",
        "medium"
      );
    }

    // Notify all players in the team game
    sendToGame(gameId, {
      type: "team_game_started",
      gameId: gameId,
      leaderboard: gameSession.players,
      teams: gameTeams,
    });
  } else {
    // Regular multiplayer game
    sendToGame(gameId, {
      type: "game_started",
      leaderboard: gameSession.players,
    });
  }
}

function handleSubmitAnswer(clientId: string, event: GameEvent) {
  const { gameId, questionId, answerId, isCorrect, timeSpent } = event;
  const client = clients.get(clientId);

  if (!client || !client.gameId) return;
  if (!gameId || !questionId || !answerId) return;

  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  // Find player in game
  const playerIndex = gameSession.players.findIndex((p) => p.id === clientId);
  if (playerIndex === -1) return;

  // Update player score and stats
  const player = gameSession.players[playerIndex];

  if (isCorrect) {
    player.score += 1;
    player.correctAnswers += 1;
  } else {
    player.incorrectAnswers += 1;
  }

  // Update average time
  const totalAnswers = player.correctAnswers + player.incorrectAnswers;
  const currentTotalTime = player.averageTime * (totalAnswers - 1);
  player.averageTime = (currentTotalTime + (timeSpent || 0)) / totalAnswers;

  // Update player in game session
  gameSession.players[playerIndex] = player;

  // Notify all players in the game
  sendToGame(gameId, {
    type: "answer_submitted",
    playerId: clientId,
    playerName: player.name,
    questionId,
    answerId,
    isCorrect,
    leaderboard: gameSession.players,
  });
}

function handlePlayerLeave(
  clientId: string,
  gameId: string,
  playerName: string
) {

  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  // Attempt to find client's userId so we can remove the correct player
  const client = clients.get(clientId);
  const leavingUserId = client?.userId;

  // Remove player from game by matching userId when possible, otherwise fall back to clientId
  if (typeof leavingUserId !== 'undefined') {
    gameSession.players = gameSession.players.filter(
      (p: any) => p.userId !== leavingUserId && p.id !== clientId
    );
  } else {
    gameSession.players = gameSession.players.filter((p: any) => p.id !== clientId);
  }

  // If game is empty, remove it
  if (gameSession.players.length === 0) {
    gameSessions.delete(gameId);
    return;
  }

  // Notify all remaining players (use userId when possible for playerId)
  sendToGame(gameId, {
    type: "player_left",
    playerName,
    playerId: typeof leavingUserId !== 'undefined' ? String(leavingUserId) : clientId,
    leaderboard: gameSession.players,
  });
}

// ASYNC CHALLENGE HANDLERS

async function handleCreateChallenge(clientId: string, event: GameEvent) {
  const { challengeeId, category, difficulty } = event;
  const client = clients.get(clientId);

  if (!client || !client.userId || !challengeeId) return;
  if (client.userId === challengeeId) {
    sendToClient(clientId, {
      type: "error",
      message: "You cannot challenge yourself",
    });
    return;
  }

  try {
    // Check if challengee exists
    const challengee = await database.getUser(challengeeId);
    if (!challengee) {
      sendToClient(clientId, {
        type: "error",
        message: "Challenge recipient not found",
      });
      return;
    }

    // Create a game session
    const gameId = uuidv4();

    // Prepare the session with random questions
    await createAsyncGameSession(
      gameId,
      client.userId,
      category || "All Categories",
      difficulty || "Beginner"
    );

    const gameSession = await database.getGameSession(gameId);
    if (!gameSession) {
      sendToClient(clientId, {
        type: "error",
        message: "Failed to create game session",
      });
      return;
    }

    // Set expiration date (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create the challenge
    const challenge = await database.createChallenge({
      id: uuidv4(),
      challengerId: client.userId,
      challengeeId: challengeeId,
      gameSessionId: gameId,
      status: "pending",
      category: category || "All Categories",
      difficulty: difficulty || "Beginner",
      createdAt: new Date(),
      expiresAt,
      challengerCompleted: false,
      challengeeCompleted: false,
      isDraw: false,
      notificationSent: true,
    });

    // Create a notification for the challengee
    const notification = await database.createNotification({
      id: uuidv4(),
      userId: challengeeId,
      type: "challenge_received",
      message: `${client.playerName || "Someone"
        } has challenged you to a Bible Trivia duel!`,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date(),
    });

    // Send notification to challengee if they're online
    sendToUser(challengeeId, {
      type: "notification",
      message: notification.message,
      notificationId: notification.id,
      challengeId: challenge.id,
    });

    // Notify the challenger that their challenge was sent
    sendToClient(clientId, {
      type: "challenge_created",
      challengeId: challenge.id,
      message: `Challenge sent to ${challengee.username}`,
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to create challenge",
    });
  }
}

async function handleAcceptChallenge(clientId: string, event: GameEvent) {
  const { challengeId } = event;
  const client = clients.get(clientId);

  if (!client || !client.userId || !challengeId) return;

  try {
    // Get the challenge
    const challenge = await database.getChallenge(challengeId);
    if (!challenge) {
      sendToClient(clientId, {
        type: "error",
        message: "Challenge not found",
      });
      return;
    }

    // Verify this user is the challengee
    if (challenge.challengeeId !== client.userId) {
      sendToClient(clientId, {
        type: "error",
        message: "You are not the recipient of this challenge",
      });
      return;
    }

    // Check if challenge is still pending
    if (challenge.status !== "pending") {
      sendToClient(clientId, {
        type: "error",
        message: `Challenge cannot be accepted (status: ${challenge.status})`,
      });
      return;
    }

    // Update challenge status
    await database.updateChallenge(challengeId, {
      status: "accepted",
    });

    // Get the challenger
    const challenger = await database.getUser(challenge.challengerId);

    // Create a notification for the challenger
    const notification = await database.createNotification({
      id: uuidv4(),
      userId: challenge.challengerId,
      type: "challenge_completed", // Using an allowed notification type
      message: `${client.playerName || challenger?.username || "Someone"
        } has accepted your challenge!`,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date(),
    });

    // Send notification to challenger if they're online
    sendToUser(challenge.challengerId, {
      type: "notification",
      message: notification.message,
      notificationId: notification.id,
      challengeId: challenge.id,
    });

    // Notify the challengee that the challenge was accepted
    sendToClient(clientId, {
      type: "challenge_accepted",
      challengeId: challenge.id,
      message: "Challenge accepted. You can now play your round.",
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to accept challenge",
    });
  }
}

async function handleDeclineChallenge(clientId: string, event: GameEvent) {
  const { challengeId } = event;
  const client = clients.get(clientId);

  if (!client || !client.userId || !challengeId) return;

  try {
    // Get the challenge
    const challenge = await database.getChallenge(challengeId);
    if (!challenge) {
      sendToClient(clientId, {
        type: "error",
        message: "Challenge not found",
      });
      return;
    }

    // Verify this user is the challengee
    if (challenge.challengeeId !== client.userId) {
      sendToClient(clientId, {
        type: "error",
        message: "You are not the recipient of this challenge",
      });
      return;
    }

    // Check if challenge is still pending
    if (challenge.status !== "pending") {
      sendToClient(clientId, {
        type: "error",
        message: `Challenge cannot be declined (status: ${challenge.status})`,
      });
      return;
    }

    // Update challenge status
    await database.updateChallenge(challengeId, {
      status: "declined",
    });

    // Get the challenger
    const challenger = await database.getUser(challenge.challengerId);

    // Create a notification for the challenger
    const notification = await database.createNotification({
      id: uuidv4(),
      userId: challenge.challengerId,
      type: "challenge_declined",
      message: `${client.playerName || challenger?.username || "Someone"
        } has declined your challenge.`,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date(),
    });

    // Send notification to challenger if they're online
    sendToUser(challenge.challengerId, {
      type: "notification",
      message: notification.message,
      notificationId: notification.id,
      challengeId: challenge.id,
    });

    // Notify the challengee that the challenge was declined
    sendToClient(clientId, {
      type: "challenge_declined",
      challengeId: challenge.id,
      message: "Challenge declined successfully.",
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to decline challenge",
    });
  }
}

async function handleSubmitChallengeAnswer(clientId: string, event: GameEvent) {
  const { challengeId, questionId, answerId, isCorrect, timeSpent } = event;
  const client = clients.get(clientId);

  if (!client || !client.userId || !challengeId || !questionId || !answerId)
    return;

  try {
    // Get the challenge
    const challenge = await database.getChallenge(challengeId);
    if (!challenge) {
      sendToClient(clientId, {
        type: "error",
        message: "Challenge not found",
      });
      return;
    }

    // Verify this user is either the challenger or challengee
    if (
      challenge.challengerId !== client.userId &&
      challenge.challengeeId !== client.userId
    ) {
      sendToClient(clientId, {
        type: "error",
        message: "You are not part of this challenge",
      });
      return;
    }

    // Check if challenge is in the right state
    if (challenge.status !== "accepted" && challenge.status !== "pending") {
      sendToClient(clientId, {
        type: "error",
        message: `Cannot submit answer (challenge status: ${challenge.status})`,
      });
      return;
    }

    // If challenger is playing and status is 'pending', auto-update to 'accepted'
    if (
      challenge.status === "pending" &&
      challenge.challengerId === client.userId
    ) {
      await database.updateChallenge(challengeId, {
        status: "accepted",
      });
    }

    // Get or create challenge result for this user
    let challengeResult = (
      await database.getChallengeResultsByChallenge(challengeId)
    ).find((result) => result.userId === client.userId);

    if (!challengeResult) {
      challengeResult = await database.createChallengeResult({
        id: uuidv4(),
        challengeId,
        userId: client.userId,
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        answers: [],
      });
    }

    // Create new answer record
    const newAnswer: ChallengeAnswer = {
      questionId,
      answerId,
      isCorrect: isCorrect || false,
      timeSpent: timeSpent || 20, // Default to max time if not provided
    };

    // Update challenge result with new answer
    const answers = [...challengeResult.answers, newAnswer];
    let correctAnswers = challengeResult.correctAnswers;
    let incorrectAnswers = challengeResult.incorrectAnswers;

    if (isCorrect) {
      correctAnswers += 1;
    } else {
      incorrectAnswers += 1;
    }

    const totalAnswers = correctAnswers + incorrectAnswers;
    const totalTime = answers.reduce((sum, ans) => sum + ans.timeSpent, 0);
    const averageTime = totalTime / totalAnswers;

    // Update challenge result
    await database.updateChallengeResult(challengeResult.id, {
      answers,
      score: correctAnswers, // 1 point per correct answer
      correctAnswers,
      incorrectAnswers,
      averageTime,
    });

    // Notify client of successful answer submission
    sendToClient(clientId, {
      type: "challenge_answer_submitted",
      challengeId,
      questionId,
      answerId,
      isCorrect,
      message: `Answer submitted. Current score: ${correctAnswers}/${totalAnswers}`,
      leaderboard: [
        {
          id: clientId,
          name: client.playerName || "Player",
          score: correctAnswers,
          correctAnswers,
          incorrectAnswers,
          averageTime,
          isReady: true,
        },
      ],
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to submit answer",
    });
  }
}

async function handleCompleteChallenge(clientId: string, event: GameEvent) {
  const { challengeId } = event;
  const client = clients.get(clientId);

  if (!client || !client.userId || !challengeId) return;

  try {
    // Get the challenge
    const challenge = await database.getChallenge(challengeId);
    if (!challenge) {
      sendToClient(clientId, {
        type: "error",
        message: "Challenge not found",
      });
      return;
    }

    // Verify this user is either the challenger or challengee
    const isChallenger = challenge.challengerId === client.userId;
    const isChallengee = challenge.challengeeId === client.userId;

    if (!isChallenger && !isChallengee) {
      sendToClient(clientId, {
        type: "error",
        message: "You are not part of this challenge",
      });
      return;
    }

    // Get challenge result for this user
    const challengeResults = await database.getChallengeResultsByChallenge(
      challengeId
    );
    const userResult = challengeResults.find(
      (result) => result.userId === client.userId
    );

    if (!userResult) {
      sendToClient(clientId, {
        type: "error",
        message: "No answers submitted for this challenge",
      });
      return;
    }

    // Mark this player as completed
    const updates: Partial<Challenge> = {};
    if (isChallenger) {
      updates.challengerCompleted = true;
    } else if (isChallengee) {
      updates.challengeeCompleted = true;
    }

    // Update challenge result with completion timestamp
    await database.updateChallengeResult(userResult.id, {
      completedAt: new Date(),
    });

    // Update challenge
    await database.updateChallenge(challengeId, updates);

    // Get updated challenge to check if both players have completed
    const updatedChallenge = await database.getChallenge(challengeId);
    if (!updatedChallenge) return;

    // If both players have completed, determine winner and update stats
    if (
      updatedChallenge.challengerCompleted &&
      updatedChallenge.challengeeCompleted
    ) {
      await finalizeChallenge(updatedChallenge.id);
    } else {
      // Notify the other player that this player has completed their turn
      const otherPlayerId = isChallenger
        ? updatedChallenge.challengeeId
        : updatedChallenge.challengerId;
      const otherPlayerName =
        (await database.getUser(otherPlayerId))?.username || "Your opponent";

      // Create a notification for the other player
      const notification = await database.createNotification({
        id: uuidv4(),
        userId: otherPlayerId,
        type: "challenge_completed",
        message: `${client.playerName || "Your opponent"
          } has completed their turn in your challenge!`,
        read: false,
        challengeId: challenge.id,
        createdAt: new Date(),
      });

      // Send notification to the other player if they're online
      sendToUser(otherPlayerId, {
        type: "notification",
        message: notification.message,
        notificationId: notification.id,
        challengeId: challenge.id,
      });
    }

    // Notify the player that their round is complete
    sendToClient(clientId, {
      type: "challenge_round_completed",
      challengeId,
      message: "Your challenge round has been completed successfully.",
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to complete challenge round",
    });
  }
}

async function finalizeChallenge(challengeId: string) {
  try {
    // Get the challenge
    const challenge = await database.getChallenge(challengeId);
    if (!challenge) return;

    // Get both players' results
    const results = await database.getChallengeResultsByChallenge(challengeId);
    const challengerResult = results.find(
      (r) => r.userId === challenge.challengerId
    );
    const challengeeResult = results.find(
      (r) => r.userId === challenge.challengeeId
    );

    if (!challengerResult || !challengeeResult) return;

    // Determine the winner
    let winnerUserId: number | undefined;
    let isDraw = false;

    if (challengerResult.score > challengeeResult.score) {
      winnerUserId = challenge.challengerId;
    } else if (challengeeResult.score > challengerResult.score) {
      winnerUserId = challenge.challengeeId;
    } else {
      // It's a draw
      isDraw = true;
    }

    // Update challenge status
    await database.updateChallenge(challengeId, {
      status: "completed",
      winnerUserId,
      isDraw,
    });

    // Update user stats
    if (isDraw) {
      // Update both users' draw count
      const challengerUser = await database.getUser(challenge.challengerId);
      const challengeeUser = await database.getUser(challenge.challengeeId);

      if (challengerUser) {
        const currentTotalGames =
          challengerUser.totalGames === null ? 0 : challengerUser.totalGames;
        const currentDraws =
          challengerUser.draws === null ? 0 : challengerUser.draws;

        await database.updateUser(challenge.challengerId, {
          totalGames: currentTotalGames + 1,
          draws: currentDraws + 1,
        });
      }

      if (challengeeUser) {
        const currentTotalGames =
          challengeeUser.totalGames === null ? 0 : challengeeUser.totalGames;
        const currentDraws =
          challengeeUser.draws === null ? 0 : challengeeUser.draws;

        await database.updateUser(challenge.challengeeId, {
          totalGames: currentTotalGames + 1,
          draws: currentDraws + 1,
        });
      }
    } else if (winnerUserId) {
      // Update winner's stats
      const winnerUser = await database.getUser(winnerUserId);
      if (winnerUser) {
        const currentTotalGames =
          winnerUser.totalGames === null ? 0 : winnerUser.totalGames;
        const currentWins = winnerUser.wins === null ? 0 : winnerUser.wins;

        await database.updateUser(winnerUserId, {
          totalGames: currentTotalGames + 1,
          wins: currentWins + 1,
        });
      }

      // Update loser's stats
      const loserId =
        winnerUserId === challenge.challengerId
          ? challenge.challengeeId
          : challenge.challengerId;

      const loserUser = await database.getUser(loserId);
      if (loserUser) {
        const currentTotalGames =
          loserUser.totalGames === null ? 0 : loserUser.totalGames;
        const currentLosses = loserUser.losses === null ? 0 : loserUser.losses;

        await database.updateUser(loserId, {
          totalGames: currentTotalGames + 1,
          losses: currentLosses + 1,
        });
      }
    }

    // Send notifications to both players
    const challenger = await database.getUser(challenge.challengerId);
    const challengee = await database.getUser(challenge.challengeeId);

    if (!challenger || !challengee) return;

    // Create result messages
    let challengerMessage = "";
    let challengeeMessage = "";

    if (isDraw) {
      challengerMessage = `Your challenge with ${challengee.username} ended in a draw! (${challengerResult.score} - ${challengeeResult.score})`;
      challengeeMessage = `Your challenge with ${challenger.username} ended in a draw! (${challengeeResult.score} - ${challengerResult.score})`;
    } else if (winnerUserId === challenge.challengerId) {
      challengerMessage = `You won your challenge against ${challengee.username}! (${challengerResult.score} - ${challengeeResult.score})`;
      challengeeMessage = `${challenger.username} won the challenge against you. (${challengeeResult.score} - ${challengerResult.score})`;
    } else {
      challengerMessage = `${challengee.username} won the challenge against you. (${challengerResult.score} - ${challengeeResult.score})`;
      challengeeMessage = `You won your challenge against ${challenger.username}! (${challengeeResult.score} - ${challengerResult.score})`;
    }

    // Create and send notifications
    const challengerNotification = await database.createNotification({
      id: uuidv4(),
      userId: challenge.challengerId,
      type: "challenge_result",
      message: challengerMessage,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date(),
    });

    const challengeeNotification = await database.createNotification({
      id: uuidv4(),
      userId: challenge.challengeeId,
      type: "challenge_result",
      message: challengeeMessage,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date(),
    });

    // Send notifications to both players if they're online
    sendToUser(challenge.challengerId, {
      type: "challenge_result",
      message: challengerMessage,
      notificationId: challengerNotification.id,
      challengeId: challenge.id,
      challengeResult: {
        challenger: {
          name: challenger.username,
          score: challengerResult.score,
          correctAnswers: challengerResult.correctAnswers,
          averageTime: challengerResult.averageTime,
        },
        challengee: {
          name: challengee.username,
          score: challengeeResult.score,
          correctAnswers: challengeeResult.correctAnswers,
          averageTime: challengeeResult.averageTime,
        },
        isDraw,
        winnerUserId,
      },
    });

    sendToUser(challenge.challengeeId, {
      type: "challenge_result",
      message: challengeeMessage,
      notificationId: challengeeNotification.id,
      challengeId: challenge.id,
      challengeResult: {
        challenger: {
          name: challenger.username,
          score: challengerResult.score,
          correctAnswers: challengerResult.correctAnswers,
          averageTime: challengerResult.averageTime,
        },
        challengee: {
          name: challengee.username,
          score: challengeeResult.score,
          correctAnswers: challengeeResult.correctAnswers,
          averageTime: challengeeResult.averageTime,
        },
        isDraw,
        winnerUserId,
      },
    });
  } catch (error) {
    // Silent error handling
  }
}

async function handleMarkNotificationRead(clientId: string, event: GameEvent) {
  const { notificationId } = event;
  const client = clients.get(clientId);

  if (!client || !client.userId || !notificationId) return;

  try {
    // Mark notification as read
    await database.markNotificationAsRead(notificationId);

    // Acknowledge to client
    sendToClient(clientId, {
      type: "notification_marked_read",
      notificationId,
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to mark notification as read",
    });
  }
}

// Helper function to send message to all connections of a user
export function sendToUser(userId: number, message: GameEvent) {
  const connections = userConnections.get(userId) || [];

  for (const clientId of connections) {
    sendToClient(clientId, message);
  }
}

// Helper functions to send messages
function sendToGame(gameId: string, message: GameEvent) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  for (const player of gameSession.players) {
    sendToClient(player.id, message);
  }
}

function sendToClient(clientId: string, message: GameEvent) {
  const client = clients.get(clientId);
  if (!client) {
    return;
  }

  if (!client.ws) {
    return;
  }

  if (client.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    client.ws.send(JSON.stringify(message));
  } catch (error) {
    console.error(`[sendToClient] ❌ Failed to send to client ${clientId}:`, error);
    // Silent error handling
  }
}

export async function endGame(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  // Update game status
  gameSession.status = "finished";

  // Get players with user IDs
  const authenticatedPlayers = gameSession.players.filter((player) => {
    // Find client with this player ID
    const clientsArray = Array.from(clients.values());
    const client = clientsArray.find(
      (c) => c.gameId === gameId && c.id === player.id
    );
    return client && client.userId;
  });

  // Save game results and update user stats
  for (const player of gameSession.players) {
    // Save game result to storage
    await database.saveGameResult({
      id: uuidv4(),
      playerName: player.name,
      score: player.score,
      correctAnswers: player.correctAnswers,
      incorrectAnswers: player.incorrectAnswers,
      averageTime: player.averageTime,
      category: gameSession.category || "All Categories",
      difficulty: gameSession.difficulty || "Beginner",
      timestamp: new Date().toISOString(),
    });

    // Find client with this player ID
    const client = Array.from(clients.values()).find(
      (c) => c.gameId === gameId && c.id === player.id
    );

    // Update user stats for authenticated players only
    if (client && client.userId) {
      try {
        const user = await database.getUser(client.userId);
        if (user) {
          // Update user stats
          const totalGames = (user.totalGames || 0) + 1;

          // Determine win/loss/draw status
          let wins = user.wins || 0;
          let losses = user.losses || 0;
          let draws = user.draws || 0;

          // For multiplayer, determine winner
          if (gameSession.players.length > 1) {
            // Sort players by score to find winners
            const sortedPlayers = [...gameSession.players].sort(
              (a, b) => b.score - a.score
            );

            if (sortedPlayers[0].id === player.id) {
              // This player has the highest score (might be tied)
              const isTied =
                sortedPlayers.length > 1 &&
                sortedPlayers[0].score === sortedPlayers[1].score;

              if (isTied) {
                draws++;
              } else {
                wins++;
              }
            } else {
              // Not the highest score
              const playerScore = player.score;
              const highestScore = sortedPlayers[0].score;

              if (playerScore === highestScore) {
                draws++;
              } else {
                losses++;
              }
            }
          }

          await database.updateUser(client.userId, {
            totalGames,
            wins,
            losses,
            draws,
          });
        }
      } catch (error) {
        // Silent error handling
      }
    }
  }

  // Notify all players in the game
  sendToGame(gameId, {
    type: "game_ended",
    leaderboard: gameSession.players,
  });

  // Remove game session after a delay
  setTimeout(() => {
    gameSessions.delete(gameId);
  }, 60000); // Keep game session for 1 minute to allow players to see results
}

// ==== TEAM-BASED MULTIPLAYER HANDLERS ====

async function handleCreateTeam(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId) return;

  try {
    const teamData = {
      id: uuidv4(),
      name: event.teamName || `${client.playerName || "Player"}'s Team`,
      captainId: client.userId,
      gameSessionId: event.gameId || uuidv4(),
      members: [
        {
          userId: client.userId,
          username: client.playerName || "Player",
          role: "captain" as const,
          joinedAt: new Date(),
        },
      ],
      score: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      averageTime: 0,
      finalAnswers: [],
      status: "forming" as const,
      createdAt: new Date(),
    };

    const team = await database.createTeam(teamData);

    // Update activeTeamMemberships cache for team creator
    activeTeamMemberships.set(client.userId, team.id);

    sendToClient(clientId, {
      type: "team_created",
      teamId: team.id,
      team,
    });

    // Update availability immediately after team creation
    await broadcastOnlineStatusUpdate();
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to create team",
    });
  }
}

async function handleJoinTeam(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamId) return;

  try {
    const team = await database.getTeam(event.teamId);
    if (!team) {
      sendToClient(clientId, {
        type: "error",
        message: "Team not found",
      });
      return;
    }

    if (team.members.length >= 3) {
      sendToClient(clientId, {
        type: "error",
        message: "Team is full",
      });
      return;
    }

    const newMember = {
      userId: client.userId,
      username: client.playerName || "Player",
      role: "member" as const,
      joinedAt: new Date(),
    };

    const updatedTeam = await database.updateTeam(event.teamId, {
      members: [...team.members, newMember],
    });

    // Notify all team members
    const teamMemberConnections = updatedTeam.members
      .map((member) => userConnections.get(member.userId))
      .filter(present)
      .flat();

    teamMemberConnections.forEach((connectionId: string | undefined) => {
      if (connectionId) {
        sendToClient(connectionId, {
          type: "team_updated",
          team: updatedTeam,
        });
      }
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to join team",
    });
  }
}

async function handleInviteToTeam(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.inviteeUserId) return;

  try {
    // Get all teams for this game session
    const gameSessionId = event.gameId || client.gameId;
    if (!gameSessionId) {
      sendToClient(clientId, {
        type: "error",
        message: "Game session not found",
      });
      return;
    }

    const teams = await database.getTeamsByGameSession(gameSessionId);

    // Check if invitee is already in a team
    const inviteeInTeam = teams.find((team) =>
      team.members.some((member) => member.userId === event.inviteeUserId)
    );

    if (inviteeInTeam) {
      sendToClient(clientId, {
        type: "error",
        message: "Player is already in a team",
      });
      return;
    }

    // Find the inviter's team
    let inviterTeam = teams.find((team) =>
      team.members.some((member) => member.userId === client.userId)
    );

    // If no teams exist yet, create the first team automatically
    if (teams.length === 0) {
      const teamData = {
        id: uuidv4(),
        name: `${client.playerName || "Player"}'s Team`,
        captainId: client.userId,
        gameSessionId,
        members: [
          {
            userId: client.userId,
            username: client.playerName || "Player",
            role: "captain" as const,
            joinedAt: new Date(),
          },
        ],
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        finalAnswers: [],
        status: "forming" as const,
        createdAt: new Date(),
      };

      inviterTeam = await database.createTeam(teamData);

      sendToClient(clientId, {
        type: "team_created",
        teamId: inviterTeam.id,
        team: inviterTeam,
      });
    }

    if (!inviterTeam) {
      sendToClient(clientId, {
        type: "error",
        message: "You must be in a team to invite players",
      });
      return;
    }

    // Check if inviter is the captain
    if (inviterTeam.captainId !== client.userId) {
      sendToClient(clientId, {
        type: "error",
        message: "Only team captains can send invitations",
      });
      return;
    }

    // Check if team is already full (3 members)
    if (inviterTeam.members.length >= 3) {
      sendToClient(clientId, {
        type: "error",
        message: "Your team is already full",
      });
      return;
    }

    const inviteeUser = await database.getUser(event.inviteeUserId);
    if (!inviteeUser) {
      sendToClient(clientId, {
        type: "error",
        message: "Player not found",
      });
      return;
    }

    // Check if there's already a pending invitation for team captaincy
    const existingInvitations = await database.getTeamInvitationsByUser(
      event.inviteeUserId,
      "pending"
    );
    const existingTeamInvitation = existingInvitations.find(
      (inv) => inv.teamBattleId === inviterTeam.id
    );

    if (existingTeamInvitation) {
      sendToClient(clientId, {
        type: "error",
        message: "An invitation to this user is already pending",
      });
      return;
    }

    // Team recruitment is now handled by handleRecruitPlayer function
    // This function only handles regular team member invitations

    // Regular team member invitation
    const invitationData = {
      id: uuidv4(),
      // store the team id in the teamBattleId field so it matches TeamInvitation
      teamBattleId: inviterTeam.id,
      inviterId: client.userId,
      inviterUsername: client.playerName || "Player",
      inviteeId: event.inviteeUserId,
      invitationType: "teammate" as const,
      teamSide: null,
      status: "pending" as const,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
    } as any;

    const invitation = await database.createTeamInvitation(invitationData);

    // Send invitation to invitee
    sendToUser(event.inviteeUserId, {
      type: "team_invitation_received",
      invitation,
      team: inviterTeam,
      inviterName: client.playerName,
    });

    sendToClient(clientId, {
      type: "invitation_sent",
      invitation,
      message: `Invitation sent to ${inviteeUser.username}`,
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to send invitation",
    });
  }
}

async function handleSendEmailInvitation(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamId || !event.inviteeEmail) return;

  try {
    const team = await database.getTeam(event.teamId);
    if (!team) {
      sendToClient(clientId, {
        type: "error",
        message: "Team not found",
      });
      return;
    }

    if (team.captainId !== client.userId) {
      sendToClient(clientId, {
        type: "error",
        message: "Only team captain can send invitations",
      });
      return;
    }

    // Send email invitation via API
    const response = await fetch("/api/team-invitations/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: event.teamId,
        inviteeEmail: event.inviteeEmail,
        teamName: team.name,
      }),
    });

    if (response.ok) {
      sendToClient(clientId, {
        type: "email_invitation_sent",
        email: event.inviteeEmail,
      });
    } else {
      sendToClient(clientId, {
        type: "error",
        message: "Failed to send email invitation",
      });
    }
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to send email invitation",
    });
  }
}

async function handleSubmitTeamAnswer(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (
    !client ||
    !client.userId ||
    !event.teamId ||
    !event.questionId ||
    !event.answerId
  )
    return;

  try {
    // ====================================================================
    // AUTHORITATIVE VALIDATION: client.gameId is the ONLY trusted source.
    // event.gameId is NEVER used — prevents stale events from old sessions.
    // ====================================================================
    if (!client.gameId) {
      // Attempt to recover gameId from event.gameSessionId if provided and matches team
      if (event.gameSessionId) {
        const maybeSession = gameSessions.get(event.gameSessionId);
        if (maybeSession && Array.isArray(maybeSession.teams) && maybeSession.teams.some((t: any) => t.id === event.teamId)) {
          client.gameId = event.gameSessionId;
        } else {
          return;
        }
      } else {
        return;
      }
    }

    // DB GUARD: If database indicates the player has LEFT this battle, ignore silently.
    try {
      const dbLeft = await database.getTeamBattlePlayerLeftStatus(
        client.gameId,
        client.userId
      );
      if (dbLeft === true) {
        return;
      }
    } catch (err) {
      // Tolerant: if DB helper fails, continue (will rely on in-memory guard below)
    }

    // LIFECYCLE GUARD: Reject if player has LEFT this game (in-memory)
    if (hasPlayerLeft(client.gameId, client.userId)) {
      sendToClient(clientId, { type: "error", message: "You have left this battle" });
      return;
    }

    const gameSession = client.gameId ? gameSessions.get(client.gameId) || null : null;

    // If the session is in toss phase, route to toss handler and return immediately.
    if (gameSession && (gameSession as any).phase === "toss") {
      const sessionTeam = gameSession.teams?.find((t: any) => t.id === event.teamId);
      if (sessionTeam) {
        try {
          await handleTossSubmission(clientId, client, gameSession, sessionTeam, event);
        } catch (err) {
          console.error(`[handleSubmitTeamAnswer] Error in handleTossSubmission at top-level:`, err);
        }
        return;
      } else {
        // No matching team in game session for this toss; ignore to be safe.
        return;
      }
    }

    // Rapid-fire mode: route to rapid-fire submission handler (isolation from normal flow)
    if (gameSession && (gameSession as any).mode === "rapid_fire") {
      const sessionTeam = gameSession.teams?.find((t: any) => t.id === event.teamId);
      if (sessionTeam) {
        try {
          await handleRapidFireSubmission(clientId, client, gameSession, sessionTeam, event);
        } catch (err) {
          console.error(`[handleSubmitTeamAnswer] Error in handleRapidFireSubmission at top-level:`, err);
        }
        return; // MUST return to prevent normal question pipeline
      } else {
        return;
      }
    }

    const isTeamBattle = gameSession?.gameType === "team_battle";

    // Team-battle path: use in-memory teams derived from team_battles
    if (isTeamBattle && gameSession && gameSession.teams) {
      const sessionTeam = gameSession.teams.find(
        (t: any) => t.id === event.teamId
      );
      if (!sessionTeam) return;

      // STRICT ISOLATION: If we're currently in toss phase, handle toss submission separately and return
      if ((gameSession as any).phase === "toss") {
        try {
          await handleTossSubmission(clientId, client, gameSession, sessionTeam, event);
        } catch (err) {
          console.error(`[handleSubmitTeamAnswer] Error in handleTossSubmission:`, err);
        }
        return; // MUST return to prevent normal question pipeline
      }

      // Update member's individual answer
      const memberIndex = sessionTeam.members.findIndex(
        (member: any) => member.userId === client.userId
      );
      if (memberIndex === -1) return;

      // Store individual member answer in memory (game session)
      if (!sessionTeam.memberAnswers) sessionTeam.memberAnswers = {};
      if (!sessionTeam.memberAnswers[event.questionId]) {
        sessionTeam.memberAnswers[event.questionId] = {};
      }

      sessionTeam.memberAnswers[event.questionId][client.userId.toString()] = {
        answerId: event.answerId,
        submittedAt: new Date(),
        timeSpent: event.timeSpent || 0,
      };

      // Notify team members of answer submission
      const teamClients = Array.from(clients.values()).filter((c) =>
        sessionTeam.members.some((member: any) => member.userId === c.userId)
      );

      for (const teamClient of teamClients) {
        sendToClient(teamClient.id, {
          type: "team_member_answered",
          teamId: sessionTeam.id,
          questionId: event.questionId,
          memberName: client.playerName,
          answersReceived: Object.keys(
            sessionTeam.memberAnswers[event.questionId] || {}
          ).length,
          totalMembers: sessionTeam.members.length,
        });
      }

      // If we're in toss phase and this is the toss question, check for immediate correct submission
      if (
        gameSession &&
        (gameSession as any).phase === "toss" &&
        (gameSession as any).tossQuestion &&
        event.questionId === (gameSession as any).tossQuestion.id
      ) {
        const tossQ = (gameSession as any).tossQuestion;
        const correctAnswer = tossQ.answers?.find((a: any) => a.isCorrect);
        const isCorrect = !!(correctAnswer && event.answerId === correctAnswer.id);
        // Send immediate feedback to submitting client
        sendToClient(clientId, {
          type: "team_battle_toss_feedback",
          gameId: client.gameId,
          questionId: event.questionId,
          answerId: event.answerId,
          isCorrect: isCorrect,
          correctAnswerId: correctAnswer?.id,
          message: isCorrect ? "Correct!" : "Incorrect",
        });
        if (client.userId) {
          try {
            sendToUser(client.userId, {
              type: "team_battle_toss_feedback",
              gameId: client.gameId,
              questionId: event.questionId,
              answerId: event.answerId,
              isCorrect: isCorrect,
              correctAnswerId: correctAnswer?.id,
              message: isCorrect ? "Correct!" : "Incorrect",
            });
          } catch (e) {
            console.error(`[Toss] Failed to send toss feedback to all connections for user ${client.userId}:`, e);
          }
        }

        if (isCorrect) {
          // First correct submission wins the toss
          if (!(gameSession as any).tossWinnerTeamId) {
            await finalizeTossWinner(client.gameId, sessionTeam.id, client.userId);
          }
        }
      }

      // Check if all team members have answered
      const allAnswered =
        sessionTeam.members.length ===
        Object.keys(sessionTeam.memberAnswers[event.questionId] || {}).length;

      if (allAnswered) {
        // Auto-finalize team answer for battle mode using majority vote
        await autoFinalizeTeamAnswer(sessionTeam.id, event.questionId);
      }

      sendToClient(clientId, {
        type: "team_answer_submitted",
        teamId: sessionTeam.id,
        questionId: event.questionId,
        answerId: event.answerId,
        userId: client.userId,
        username: client.playerName,
        message: "Your answer has been submitted to the team",
      });

      // Notify all team members of the answer submission (WebSocket connections)
      const teamMemberConnections = sessionTeam.members
        .map((member: any) => userConnections.get(member.userId))
        .filter(present)
        .flat();

      teamMemberConnections.forEach((connectionId: string | undefined) => {
        if (connectionId) {
          sendToClient(connectionId, {
            type: "team_member_answered",
            teamId: sessionTeam.id,
            userId: client.userId,
            username: client.playerName,
          });
        }
      });

      return;
    }

    // Legacy non-team-battle path using teams table
    const team = await database.getTeam(event.teamId);
    if (!team) return;

    // Update member's individual answer
    const memberIndex = team.members.findIndex(
      (member) => member.userId === client.userId
    );
    if (memberIndex === -1) return;

    // Store individual member answer in memory (game session)
    // Resolve session strictly from the authoritative client.gameId (never use event.gameId)
    const currentGameSession = gameSessions.get(client.gameId) || null;
    let sessionTeam = null;
    if (currentGameSession && currentGameSession.teams) {
      sessionTeam = currentGameSession.teams.find((t) => t.id === team.id);
      if (sessionTeam) {
        if (!sessionTeam.memberAnswers) sessionTeam.memberAnswers = {};
        if (!sessionTeam.memberAnswers[event.questionId])
          sessionTeam.memberAnswers[event.questionId] = {};

        sessionTeam.memberAnswers[event.questionId][client.userId.toString()] =
        {
          answerId: event.answerId,
          submittedAt: new Date(),
          timeSpent: event.timeSpent || 0,
        };
      }
    }

    // Notify team members of answer submission
    const teamClients = Array.from(clients.values()).filter((c) =>
      team.members.some((member) => member.userId === c.userId)
    );

    for (const teamClient of teamClients) {
      sendToClient(teamClient.id, {
        type: "team_member_answered",
        teamId: team.id,
        questionId: event.questionId,
        memberName: client.playerName,
        answersReceived: Object.keys(
          sessionTeam?.memberAnswers?.[event.questionId] || {}
        ).length,
        totalMembers: team.members.length,
      });
    }

    // If we're in toss phase and this is the toss question, check for immediate correct submission
    if (
      currentGameSession &&
      (currentGameSession as any).phase === "toss" &&
      (currentGameSession as any).tossQuestion &&
      event.questionId === (currentGameSession as any).tossQuestion.id
    ) {
      const tossQ = (currentGameSession as any).tossQuestion;
      const correctAnswer = tossQ.answers?.find((a: any) => a.isCorrect);
      const isCorrect = !!(correctAnswer && event.answerId === correctAnswer.id);
      sendToClient(clientId, {
        type: "team_battle_toss_feedback",
        gameId: client.gameId,
        questionId: event.questionId,
        answerId: event.answerId,
        isCorrect: isCorrect,
        correctAnswerId: correctAnswer?.id,
        message: isCorrect ? "Correct!" : "Incorrect",
      });
      // Also send to all connections of this user (in case clientId isn't the active one)
      if (client.userId) {
        try {
          sendToUser(client.userId, {
            type: "team_battle_toss_feedback",
            gameId: client.gameId,
            questionId: event.questionId,
            answerId: event.answerId,
            isCorrect: isCorrect,
            correctAnswerId: correctAnswer?.id,
            message: isCorrect ? "Correct!" : "Incorrect",
          });
        } catch (e) {
          console.error(`[Toss] Failed to send toss feedback to all connections for user ${client.userId}:`, e);
        }
      }
      if (isCorrect) {
        if (!(currentGameSession as any).tossWinnerTeamId) {
          await finalizeTossWinner(client.gameId, sessionTeam?.id || team.id, client.userId);
        }
      }
    }

    // Check if all team members have answered
    const allAnswered =
      team.members.length ===
      Object.keys(sessionTeam?.memberAnswers?.[event.questionId] || {}).length;

    if (allAnswered) {
      // Notify captain that all answers are in and they can finalize
      const captain = team.members.find((m) => m.role === "captain");
      if (captain) {
        sendToUser(captain.userId, {
          type: "all_team_answers_received",
          teamId: team.id,
          questionId: event.questionId,
          message:
            "All team members have answered. You can now finalize the team answer.",
        });
      }
    }

    sendToClient(clientId, {
      type: "team_answer_submitted",
      teamId: team.id,
      questionId: event.questionId,
      message: "Your answer has been submitted to the team",
    });

    const updatedMembers = [...team.members];
    updatedMembers[memberIndex] = {
      ...updatedMembers[memberIndex],
      answer: {
        questionId: event.questionId,
        answerId: event.answerId,
        timeSpent: event.timeSpent || 0,
      },
    };

    await database.updateTeam(event.teamId, { members: updatedMembers });

    // Notify all team members of the answer submission
    const teamMemberConnections = team.members
      .map((member) => userConnections.get(member.userId))
      .filter(present)
      .flat();

    teamMemberConnections.forEach((connectionId: string | undefined) => {
      if (connectionId) {
        sendToClient(connectionId, {
          type: "team_member_answered",
          teamId: event.teamId,
          userId: client.userId,
          username: client.playerName,
        });
      }
    });
  } catch (error) {
    // Silent error handling
  }
}

// Handle player leaving team setup (page reload, exit, network issues)
async function handlePlayerLeavingTeamSetup(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId) return;

  const { gameSessionId, userId, username } = event;
  if (!gameSessionId || !userId) return;

  try {
    // Get all teams in the session to find the user's team
    const sessionTeams = await getTeamsForTeamBattleSession(gameSessionId);

    if (!sessionTeams || sessionTeams.length === 0) {
      return;
    }

    // Find which team the leaving player belonged to
    const leavingTeam = sessionTeams.find((team: any) =>
      team.members.some((member: any) => member.userId === userId)
    );

    if (!leavingTeam) {
      return;
    }

    // Check if the leaving user is a captain or a member
    const isCaptain = leavingTeam.captainId === userId;
    const isMember = leavingTeam.members.some((m: any) => m.userId === userId && m.role === "member");

    // Handle removal based on team storage type
    // First check if it's a team_battles team (has teamBattleId)
    if (leavingTeam.teamBattleId) {
      // If it's a member (not captain), remove them from the team in the database
      if (isMember) {
        const battle = await database.getTeamBattle(leavingTeam.teamBattleId);
        if (battle) {
          if (leavingTeam.teamSide === "A") {
            // Remove from Team A teammates
            const updatedTeammates = extractTeammateIds(battle.teamATeammates).filter(
              (id) => id !== userId
            );
            await database.updateTeamBattle(leavingTeam.teamBattleId, {
              teamATeammates: updatedTeammates,
            });
          } else if (leavingTeam.teamSide === "B") {
            // Remove from Team B teammates
            const updatedTeammates = extractTeammateIds(battle.teamBTeammates).filter(
              (id) => id !== userId
            );
            await database.updateTeamBattle(leavingTeam.teamBattleId, {
              teamBTeammates: updatedTeammates,
            });
          }
        }
      } else if (isCaptain) {
        // If captain disconnects, handle it differently
        // Team A captain disconnect - remove entire battle
        if (leavingTeam.teamSide === "A" && leavingTeam.teamBattleId) {
          // CENTRALIZED: Use resetBattleState for cleanup
          await resetBattleState({
            battleId: leavingTeam.teamBattleId,
            reason: "team_a_left",
            deleteBattle: true, // Team A leaves = delete entire battle
          });

          // Notify all participants that battle was cancelled
          const participantIds = new Set<number>();
          for (const team of sessionTeams) {
            for (const member of team.members) {
              if (member.userId !== userId) {
                participantIds.add(member.userId);
              }
            }
          }

          for (const participantId of Array.from(participantIds)) {
            sendToUser(participantId, {
              type: "team_battle_cancelled",
              teamBattleId: leavingTeam.teamBattleId,
              gameSessionId: gameSessionId,
              reason: "Team A captain disconnected",
              message: "The team battle has been cancelled because the Team A captain disconnected.",
            });
          }
          return; // Exit early since battle was deleted
        } else if (leavingTeam.teamSide === "B" && leavingTeam.teamBattleId) {
          // Team B captain disconnect - remove Team B
          // IMPORTANT: capture Team B teammates BEFORE clearing them, otherwise they won't receive any updates
          const battleForNotification = await database.getTeamBattle(leavingTeam.teamBattleId);
          const oldTeamBTeammateIds = battleForNotification
            ? extractTeammateIds(battleForNotification.teamBTeammates)
            : [];
          const oldTeamBName =
            battleForNotification?.teamBName || leavingTeam.name || "Team B";

          // Clear Team B data from battle (this is specific to Team B leave)
          await database.updateTeamBattle(leavingTeam.teamBattleId, {
            teamBCaptainId: null,
            teamBName: null,
            teamBTeammates: [],
          });

          // CENTRALIZED: Use resetBattleState for ready state cleanup
          // Get Team A members to notify
          const teamAMembersNotify: number[] = [];
          if (battleForNotification) {
            if (battleForNotification.teamACaptainId) teamAMembersNotify.push(battleForNotification.teamACaptainId);
            const teamATeammates = extractTeammateIds(battleForNotification.teamATeammates);
            teamAMembersNotify.push(...teamATeammates);
          }

          await resetBattleState({
            battleId: leavingTeam.teamBattleId,
            reason: "team_b_left",
            gameSessionId: gameSessionId,
            notifyUserIds: teamAMembersNotify,
            deleteBattle: false,
            newStatus: "forming",
          });

          // Notify Team B teammates (who would otherwise be dropped from any lobby updates)
          for (const teammateId of oldTeamBTeammateIds) {
            if (teammateId !== userId) {
              sendToUser(teammateId, {
                type: "team_member_removed",
                gameSessionId: gameSessionId,
                message: `Your captain left the lobby (${oldTeamBName}). You've been removed from this match. Please join/create a team again.`,
              });
            }
          }
        }
      }
    } else {
      // Fallback: Handle teams stored in the teams table (legacy system)
      // Try to find the team in the teams table
      const teamsFromTable = await database.getTeamsByGameSession(gameSessionId);
      const teamFromTable = teamsFromTable.find((team: any) =>
        team.members.some((member: any) => member.userId === userId)
      );

      if (teamFromTable) {
        // Remove member from team
        if (isMember) {
          await database.removeMemberFromTeam(teamFromTable.id, userId);
        } else if (isCaptain) {
          // If captain leaves, we might want to assign a new captain or remove the team
          // For now, just remove the member (captain) from the team
          await database.removeMemberFromTeam(teamFromTable.id, userId);
        }
      }
    }

    // Remove from activeTeamMemberships cache
    activeTeamMemberships.delete(userId);

    // Get updated teams after removal
    const updatedTeams = await getTeamsForTeamBattleSession(gameSessionId);

    // Separate same-team members from opposing team members
    const sameTeamMemberIds = new Set<number>();
    const opposingTeamMemberIds = new Set<number>();

    for (const team of updatedTeams) {
      const isSameTeam = team.id === leavingTeam.id;
      for (const member of team.members) {
        if (member.userId !== userId) { // Don't notify the leaving user themselves
          if (isSameTeam) {
            sameTeamMemberIds.add(member.userId);
          } else {
            opposingTeamMemberIds.add(member.userId);
          }
        }
      }
    }

    // For opposing team members:
    // - If captain disconnects → show popup (opponent_disconnected)
    // - If member disconnects → show toast (opponent_team_member_disconnected)
    for (const participantId of Array.from(opposingTeamMemberIds)) {
      if (isCaptain) {
        // Captain disconnected from opponent team → show popup
        sendToUser(participantId, {
          type: "opponent_disconnected",
          gameSessionId: gameSessionId,
          disconnectedPlayerName: username || client.playerName || "A player",
          disconnectedTeamName: leavingTeam.name,
          message: `⚠️ ${username || client.playerName || "A player"} (Captain) from team "${leavingTeam.name}" has disconnected from team setup.`,
          severity: "warning",
          timestamp: new Date(),
        });
      } else {
        // Member disconnected from opponent team → show toast (not popup)
        sendToUser(participantId, {
          type: "opponent_team_member_disconnected",
          gameSessionId: gameSessionId,
          disconnectedPlayerName: username || client.playerName || "A player",
          disconnectedTeamName: leavingTeam.name,
          message: `${username || client.playerName || "A player"} from team "${leavingTeam.name}" has disconnected from team setup.`,
        });
      }
    }

    // For same-team members, send a simple teammate_disconnected event (or just rely on teams_updated)
    // This will show a toast notification instead of the full popup
    // Also send teammate_left specifically to the captain for clarity
    const captainId = leavingTeam.captainId;
    for (const participantId of Array.from(sameTeamMemberIds)) {
      sendToUser(participantId, {
        type: "teammate_disconnected",
        gameSessionId: gameSessionId,
        disconnectedPlayerName: username || client.playerName || "A player",
        teamName: leavingTeam.name,
        message: `${username || client.playerName || "A player"} has left your team.`,
      });
      // Send specific notification to captain
      if (participantId === captainId) {
        sendToUser(participantId, {
          type: "teammate_left",
          gameSessionId: gameSessionId,
          userId: userId,
          playerName: username || client.playerName || "A player",
          teamName: leavingTeam.name,
          message: `${username || client.playerName || "A player"} has left ${leavingTeam.name}.`,
        });
      }
    }

    // Broadcast updated teams to all participants so captain sees the updated team without disconnected member
    const allClientsInSession = Array.from(clients.values()).filter(
      (c: Client) => c.userId && updatedTeams.some(team => team.members.some((m: any) => m.userId === c.userId))
    );

    for (const sessionClient of allClientsInSession) {
      sendToClient(sessionClient.id, {
        type: "teams_updated",
        gameSessionId: gameSessionId,
        teams: updatedTeams,
        message: `${username || client.playerName || "A player"} has disconnected from team setup.`,
      });
    }

    // Update availability status
    await broadcastOnlineStatusUpdate();
  } catch (error) {
    console.error("[handlePlayerLeavingTeamSetup] Error:", error);
    // Silent error handling
  }
}

// Lightweight per-question suggestion event for team battles. This does not
// change game state or scores; it only broadcasts which option a member
// clicked so the UI can render suggestion capsules on each answer.
async function handleTeamOptionSelected(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamId || !event.answerId) return;

  try {
    // ====================================================================
    // AUTHORITATIVE VALIDATION: client.gameId is the ONLY trusted source.
    // ====================================================================
    if (!client.gameId) {
      return;
    }

    // DB GUARD: If database indicates the player has LEFT this battle, ignore silently.
    try {
      const dbLeft = await database.getTeamBattlePlayerLeftStatus(
        client.gameId,
        client.userId
      );
      if (dbLeft === true) {
        return;
      }
    } catch (err) {
      // Tolerant: if DB helper fails, continue (will rely on in-memory guard below)
    }

    if (hasPlayerLeft(client.gameId, client.userId)) {
      return;
    }

    // Resolve a display name for this user so the client can show it in
    // suggestion capsules. Prefer the in-memory playerName, then any
    // username sent on the event, and finally fall back to the database.
    let displayName = client.playerName || event.username;
    if (!displayName) {
      try {
        const user = await database.getUser(client.userId);
        displayName = user?.username || `Player ${client.userId}`;
      } catch (error) {
        displayName = `Player ${client.userId}`;
      }
    }

    const gameSession = client.gameId ? gameSessions.get(client.gameId) || null : null;
    const isTeamBattle = (gameSession as any)?.gameType === "team_battle";

    if (isTeamBattle && gameSession && gameSession.teams) {
      const sessionTeam = gameSession.teams.find(
        (t: any) => t.id === event.teamId
      );
      if (!sessionTeam) return;

      // CRITICAL: Check if this question has already been finalized
      // If so, reject the selection and notify the user
      const existingFinalAnswers = sessionTeam.finalAnswers || [];
      const questionAlreadyFinalized = existingFinalAnswers.some(
        (fa: any) => fa.questionId === event.questionId
      );

      if (questionAlreadyFinalized) {
        sendToClient(clientId, {
          type: "error",
          message: "This question has already been finalized by your team",
        });
        return;
      }

      const isRapidFireOption = (gameSession as any)?.mode === "rapid_fire";
      if (isRapidFireOption && event.questionId) {
        if (isRapidFireQuestionResolved(gameSession, event.questionId)) {
          sendToClient(clientId, {
            type: "error",
            message: "This question is no longer active",
          });
          return;
        }
        const activeQuestionId = getActiveRapidFireQuestionId(gameSession);
        if (!activeQuestionId || event.questionId !== activeQuestionId) {
          sendToClient(clientId, {
            type: "error",
            message: "This question is no longer active",
          });
          return;
        }

        // Persist suggestions server-side for captain reconnect
        if (!sessionTeam.memberAnswers) sessionTeam.memberAnswers = {};
        if (!sessionTeam.memberAnswers[event.questionId]) {
          sessionTeam.memberAnswers[event.questionId] = {};
        }
        sessionTeam.memberAnswers[event.questionId][client.userId!.toString()] = {
          answerId: event.answerId,
          submittedAt: new Date(),
          username: displayName,
        };
      }

      const teamMemberConnections = sessionTeam.members
        .map((member: any) => userConnections.get(member.userId))
        .filter(present)
        .flat();

      const payload: GameEvent = {
        type: "team_option_selected",
        teamId: event.teamId,
        userId: client.userId,
        username: displayName,
        questionId: event.questionId,
        answerId: event.answerId,
      };

      teamMemberConnections.forEach((connectionId: string | undefined) => {
        if (connectionId) {
          sendToClient(connectionId, payload);
        }
      });
      return;
    }

    const team = await database.getTeam(event.teamId);
    if (!team) return;

    const teamMemberConnections = team.members
      .map((member) => userConnections.get(member.userId))
      .filter(present)
      .flat();

    const payload: GameEvent = {
      type: "team_option_selected",
      teamId: event.teamId,
      userId: client.userId,
      username: displayName,
      questionId: event.questionId,
      answerId: event.answerId,
    };

    teamMemberConnections.forEach((connectionId: string | undefined) => {
      if (connectionId) {
        sendToClient(connectionId, payload);
      }
    });
  } catch (error) {
    // Silent error handling
  }
}

async function handleFinalizeTeamAnswer(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamId || !event.finalAnswer) return;

  try {
    const gameSession = client.gameId ? gameSessions.get(client.gameId) || null : null;
    if (gameSession && (gameSession as any).phase === "toss") {
      // Silently ignore finalize attempts during toss phase (do not send error)
      return;
    }
    // ====================================================================
    // AUTHORITATIVE VALIDATION: client.gameId is the ONLY trusted source.
    // ====================================================================
    if (!client.gameId) {
      return;
    }

    // DB GUARD: If database indicates the player has LEFT this battle, ignore silently.
    try {
      const dbLeft = await database.getTeamBattlePlayerLeftStatus(
        client.gameId,
        client.userId
      );
      if (dbLeft === true) {
        return;
      }
    } catch (err) {
      // Tolerant: if DB helper fails, continue (will rely on in-memory guard below)
    }

    if (hasPlayerLeft(client.gameId, client.userId)) {
      sendToClient(clientId, { type: "error", message: "You have left this battle" });
      return;
    }

    const isTeamBattle = (gameSession as any)?.gameType === "team_battle";
    const isRapidFire = (gameSession as any)?.mode === "rapid_fire";

    if (isTeamBattle && gameSession && gameSession.teams) {
      const sessionTeam = gameSession.teams.find(
        (t: any) => t.id === event.teamId
      );
      if (!sessionTeam) return;

      if (sessionTeam.captainId !== client.userId) {
        sendToClient(clientId, {
          type: "error",
          message: "Only team captain can finalize answers",
        });
        return;
      }

      const finalAnswer = {
        questionId: event.finalAnswer.questionId,
        answerId: event.finalAnswer.answerId,
        isCorrect: false, // Will be determined by game logic
        timeSpent: event.timeSpent || 0,
        submittedBy: client.userId,
      };

      // Rapid Fire: reject stale or already-resolved questions before mutating state
      if (isRapidFire) {
        const activeQuestionId = getActiveRapidFireQuestionId(gameSession);
        if (!activeQuestionId || finalAnswer.questionId !== activeQuestionId) {
          sendToClient(clientId, {
            type: "error",
            message: "This question is no longer active",
          });
          return;
        }
        if (isRapidFireQuestionResolved(gameSession, finalAnswer.questionId)) {
          sendToClient(clientId, {
            type: "error",
            message: "This question has already been resolved",
          });
          return;
        }
      }

      // Fixed: Prevent duplicate finalization for the same question
      const existingFinalAnswers = sessionTeam.finalAnswers || [];
      const alreadyFinalized = existingFinalAnswers.some(
        (fa: any) => fa.questionId === finalAnswer.questionId
      );

      if (alreadyFinalized) {
        sendToClient(clientId, {
          type: "error",
          message: "This question has already been finalized by your team",
        });
        return;
      }

      sessionTeam.finalAnswers = [...existingFinalAnswers, finalAnswer];

      // Notify all team members
      const teamMemberConnections = sessionTeam.members
        .map((member: any) => userConnections.get(member.userId))
        .filter(present)
        .flat();

      teamMemberConnections.forEach((connectionId: string | undefined) => {
        if (connectionId) {
          sendToClient(connectionId, {
            type: "team_answer_finalized",
            teamId: event.teamId,
            finalAnswer,
          });
        }
      });

      // Rapid Fire: evaluate only the captain's finalized answer (first correct across teams wins)
      if (isRapidFire) {
        await evaluateRapidFireFinalizedAnswer(
          gameSession,
          sessionTeam,
          finalAnswer.questionId,
          finalAnswer.answerId,
          client
        );
        return;
      }

      // In alternating format, only one team answers per question
      // So when a team finalizes, we can immediately process results
      // (no need to wait for the other team since they don't answer this question)
      if (gameSession && gameSession.teams && gameSession.teams.length > 0) {
        const currentQuestionId = finalAnswer.questionId;
        const currentQuestion = gameSession.questions?.find(
          (q: any) => q.id === currentQuestionId
        );

        if (currentQuestion) {
          const currentIndex = gameSession.questions?.indexOf(currentQuestion) ?? -1;
          const questionNumber = currentIndex + 1;
          const isTeamATurn = questionNumber % 2 === 1;

          // Find which team should have answered
          let answeringTeam = gameSession.teams.find((team: any) => {
            if (team.teamSide) {
              if (isTeamATurn) {
                return team.teamSide === "A";
              } else {
                return team.teamSide === "B";
              }
            }
            return false;
          });

          // Fallback: if no teamSide, use team order
          if (!answeringTeam && gameSession.teams.length >= 2) {
            answeringTeam = isTeamATurn ? gameSession.teams[0] : gameSession.teams[1];
          }

          // If this is the team that should answer, process immediately
          if (answeringTeam && sessionTeam.id === answeringTeam.id) {
            // Clear timeout to prevent double processing
            if (gameSession.questionTimeout) {
              clearTimeout(gameSession.questionTimeout);
              gameSession.questionTimeout = undefined;
            }
            // Process answers immediately (with a small delay for UX)
            setTimeout(async () => {
              await processTeamBattleAnswers(gameSession.id);
            }, 500); // Small delay to show the answer was locked
          }
        }
      }

      return;
    }

    const team = await database.getTeam(event.teamId);
    if (!team) return;

    if (team.captainId !== client.userId) {
      sendToClient(clientId, {
        type: "error",
        message: "Only team captain can finalize answers",
      });
      return;
    }

    const finalAnswer = {
      questionId: event.finalAnswer.questionId,
      answerId: event.finalAnswer.answerId,
      isCorrect: false, // Will be determined by game logic
      timeSpent: event.timeSpent || 0,
      submittedBy: client.userId,
    };

    const updatedFinalAnswers = [...team.finalAnswers, finalAnswer];
    await database.updateTeam(event.teamId, {
      finalAnswers: updatedFinalAnswers,
    });

    // Notify all team members
    const teamMemberConnections = team.members
      .map((member) => userConnections.get(member.userId))
      .filter(present)
      .flat();

    teamMemberConnections.forEach((connectionId: string | undefined) => {
      if (connectionId) {
        sendToClient(connectionId, {
          type: "team_answer_finalized",
          teamId: event.teamId,
          finalAnswer,
        });
      }
    });
  } catch (error) {
    // Silent error handling
  }
}

async function handleTeamReady(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamId) return;

  try {
    const team = await database.getTeam(event.teamId);
    if (!team) return;

    if (team.captainId !== client.userId) {
      sendToClient(clientId, {
        type: "error",
        message: "Only team captain can mark team as ready",
      });
      return;
    }

    if (team.members.length < 1) {
      sendToClient(clientId, {
        type: "error",
        message: "Team must have at least 1 member",
      });
      return;
    }

    await database.updateTeam(event.teamId, { status: "ready" });

    // Check if both teams exist and are ready to start the game
    const allTeams = await database.getTeamsByGameSession(team.gameSessionId);
    const readyTeams = allTeams.filter((t) => t.status === "ready");

    // Ensure we have exactly 2 teams and both are ready
    if (allTeams.length >= 2 && readyTeams.length >= 2) {
      // Create a new game session for the team battle
      const gameId = uuidv4();

      // Create players array from all team members
      const allPlayers: Player[] = [];
      for (const readyTeam of readyTeams) {
        for (const member of readyTeam.members) {
          allPlayers.push({
            id: member.userId.toString(),
            name: member.username,
            score: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            averageTime: 0,
            isReady: true,
            userId: member.userId,
            teamId: readyTeam.id,
          });
        }
      }

      // Create game session
      gameSessions.set(gameId, {
        id: gameId,
        players: allPlayers,
        status: "waiting",
        gameType: "teams",
      });

      // Update all team members' client gameId
      const gameClients = Array.from(clients.values()).filter((c) =>
        allTeams.some((team) =>
          team.members.some((member) => member.userId === c.userId)
        )
      );

      for (const gameClient of gameClients) {
        gameClient.gameId = gameId;
        sendToClient(gameClient.id, {
          type: "team_battle_starting",
          gameId: gameId,
          gameSessionId: team.gameSessionId,
          teams: readyTeams,
        });
      }

      // Update team statuses to playing
      for (const readyTeam of readyTeams) {
        await database.updateTeam(readyTeam.id, { status: "playing" });
      }

      // Start the game after a brief delay
      setTimeout(() => {
        handleStartGame(gameId);
      }, 2000);
    } else {
      sendToClient(clientId, {
        type: "team_ready_confirmed",
        teamId: event.teamId,
        waitingForOpponents: true,
        message:
          allTeams.length < 2
            ? "Waiting for opposing team to be created"
            : "Waiting for opposing team to be ready",
      });
    }
  } catch (error) {
    // Silent error handling
  }
}

// DEPRECATED: No longer needed - database is source of truth
// Kept for backward compatibility but always reads from DB
async function initializeTeamBattleReadyState(battleId: string) {
  try {
    const readyState = await database.getTeamReadyState(battleId);
    return {
      teamAReady: readyState.teamAReady,
      teamBReady: readyState.teamBReady,
    };
  } catch (error) {
    console.error(`[initializeTeamBattleReadyState] Failed to get ready state...:`, error);
    return { teamAReady: false, teamBReady: false };
  }
}

// PRODUCTION-SAFE: Team battle ready handler (database-first, atomic operations)
// Database is the single source of truth - no in-memory state dependency
async function handleTeamBattleReady(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamBattleId || !event.teamSide) {
    return;
  }

  try {
    // STEP 1: Validate battle exists
    const battle = await database.getTeamBattle(event.teamBattleId);
    if (!battle) {
      sendToClient(clientId, {
        type: "error",
        message: "Battle not found",
      });
      return;
    }

    // STEP 2: Validate captain authorization
    if (
      (event.teamSide === "A" && battle.teamACaptainId !== client.userId) ||
      (event.teamSide === "B" && battle.teamBCaptainId !== client.userId)
    ) {
      sendToClient(clientId, {
        type: "error",
        message: "Only team captain can mark team as ready",
      });
      return;
    }

    // STEP 3: Get current ready state from database (before update)
    const previousState = await database.getTeamReadyState(battle.id);
    const wasBothReady = previousState.teamAReady && previousState.teamBReady;

    // STEP 4: Check if already ready (prevent duplicate clicks)
    const isAlreadyReady = event.teamSide === "A"
      ? previousState.teamAReady
      : previousState.teamBReady;

    if (isAlreadyReady) {
      sendToClient(clientId, {
        type: "error",
        message: "Your team is already marked as ready",
      });
      // Still broadcast current state to ensure client is in sync
      await broadcastReadyState(battle.id, battle.gameSessionId);
      return;
    }

    // STEP 5: ATOMIC UPDATE - Mark team as ready in database
    // This operation is atomic and prevents race conditions
    const newState = await database.markTeamReady(battle.id, event.teamSide);
    const bothReady = newState.teamAReady && newState.teamBReady;

    // STEP 6: Send IMMEDIATE confirmation to requesting client (instant feedback)
    // This provides instant UI update before broadcasting to all participants
    sendToClient(clientId, {
      type: "team_ready_status",
      teamBattleId: battle.id,
      gameSessionId: battle.gameSessionId,
      teamAReady: newState.teamAReady,
      teamBReady: newState.teamBReady,
      updatedAt: newState.updatedAt,
    });

    // STEP 7: Broadcast updated ready state to ALL participants
    // Database update happened FIRST, now broadcast the truth to everyone
    await broadcastReadyState(battle.id, battle.gameSessionId, newState.updatedAt);

    // STEP 8: If both teams just became ready, update battle status and start countdown
    if (bothReady && !wasBothReady) {
      // ================================================================
      // DEFENSIVE INVARIANT GUARDS BEFORE COUNTDOWN
      // ================================================================
      // These guards ensure countdown CANNOT start unless the battle state
      // is 100% valid. This is a safety net that prevents future lifecycle
      // regressions as features grow.
      // ================================================================

      // Guard 1: Re-fetch battle to get latest state
      const freshBattle = await database.getTeamBattle(battle.id);

      // Guard 2: Battle must exist and be in "forming" phase
      if (!freshBattle) {
        return;
      }
      if (freshBattle.status !== "forming") {
        return; // Already transitioned - don't double-start
      }

      // Guard 3: Both teams must exist (Team A always exists, Team B might not)
      const teamAExists = Boolean(freshBattle.teamACaptainId && freshBattle.teamAName);
      const teamBExists = Boolean(freshBattle.teamBCaptainId && freshBattle.teamBName);
      if (!teamAExists || !teamBExists) {
        return;
      }

      // Guard 4: Both teams must have ready timestamps in database
      const teamAReadyAt = freshBattle.teamAReadyAt;
      const teamBReadyAt = freshBattle.teamBReadyAt;
      if (!teamAReadyAt || !teamBReadyAt) {
        return;
      }


      try {
        // Update battle status to "ready" (COUNTDOWN phase) in database
        await database.updateTeamBattle(battle.id, {
          status: "ready", // COUNTDOWN phase
        });

        // Broadcast countdown to all participants
        const countdownSeconds = 5;
        await broadcastCountdown(battle.id, battle.gameSessionId, countdownSeconds);

        // After countdown, automatically start the team battle
        setTimeout(() => {
          try {
            const allClients = Array.from(clients.values());
            const captainClient =
              allClients.find((c) => c.userId === battle.teamACaptainId) ||
              (battle.teamBCaptainId
                ? allClients.find((c) => c.userId === battle.teamBCaptainId)
                : undefined);

            if (captainClient) {
              handleStartTeamBattle(captainClient.id, {
                type: "start_team_battle",
                gameSessionId: battle.gameSessionId,
              } as GameEvent);
            }
          } catch (err) {
            console.error(`[handleTeamBattleReady] Failed to start battle:`, err);
          }
        }, countdownSeconds * 1000);
      } catch (error) {
        console.error(`[handleTeamBattleReady] Failed to update battle status:`, error);
        sendToClient(clientId, {
          type: "error",
          message: "Failed to mark team as ready. Please try again.",
        });
      }
    }
  } catch (error) {
    console.error(`[handleTeamBattleReady] Error:`, error);
    sendToClient(clientId, {
      type: "error",
      message: "Failed to mark team as ready. Please try again.",
    });
  }
}

// Cancel ready status before the match starts (forming phase only)
async function handleTeamBattleUnready(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamBattleId || !event.teamSide) {
    return;
  }

  try {
    const battle = await database.getTeamBattle(event.teamBattleId);
    if (!battle) {
      sendToClient(clientId, {
        type: "error",
        message: "Battle not found",
      });
      return;
    }

    if (
      (event.teamSide === "A" && battle.teamACaptainId !== client.userId) ||
      (event.teamSide === "B" && battle.teamBCaptainId !== client.userId)
    ) {
      sendToClient(clientId, {
        type: "error",
        message: "Only team captain can cancel ready status",
      });
      return;
    }

    if (battle.status !== "forming") {
      sendToClient(clientId, {
        type: "error",
        message: "Cannot cancel ready — the match is already starting",
      });
      return;
    }

    const previousState = await database.getTeamReadyState(battle.id);
    const isCurrentlyReady =
      event.teamSide === "A"
        ? previousState.teamAReady
        : previousState.teamBReady;

    if (!isCurrentlyReady) {
      sendToClient(clientId, {
        type: "error",
        message: "Your team is not marked as ready",
      });
      await broadcastReadyState(battle.id, battle.gameSessionId);
      return;
    }

    const newState = await database.clearTeamReady(battle.id, event.teamSide);

    if (teamBattleReadyState.has(battle.id)) {
      const mem = teamBattleReadyState.get(battle.id)!;
      if (event.teamSide === "A") {
        mem.teamAReady = false;
      } else {
        mem.teamBReady = false;
      }
      teamBattleReadyState.set(battle.id, mem);
    }

    sendToClient(clientId, {
      type: "team_ready_status",
      teamBattleId: battle.id,
      gameSessionId: battle.gameSessionId,
      teamAReady: newState.teamAReady,
      teamBReady: newState.teamBReady,
      updatedAt: newState.updatedAt || new Date(),
    });

    await broadcastReadyState(
      battle.id,
      battle.gameSessionId,
      newState.updatedAt || undefined
    );
  } catch (error) {
    console.error(`[handleTeamBattleUnready] Error:`, error);
    sendToClient(clientId, {
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to cancel ready status. Please try again.",
    });
  }
}

// Helper: Broadcast ready state notification to all participants
// IMPORTANT: This is a NOTIFICATION only - clients must refetch from /api/team-battle/state
// The event includes data for backwards compatibility but clients should NOT trust it as authoritative
async function broadcastReadyState(
  battleId: string,
  gameSessionId: string,
  updatedAt?: Date
) {
  // Get fresh state from database (always authoritative)
  const readyState = await database.getTeamReadyState(battleId);

  // Get battle to collect participant IDs
  const battle = await database.getTeamBattle(battleId);
  if (!battle) return;

  // Collect all participant userIds (captains + teammates)
  const participantIds = new Set<number>();
  participantIds.add(battle.teamACaptainId);
  if (battle.teamBCaptainId) {
    participantIds.add(battle.teamBCaptainId);
  }

  for (const id of extractTeammateIds(battle.teamATeammates)) {
    participantIds.add(id);
  }
  for (const id of extractTeammateIds(battle.teamBTeammates)) {
    participantIds.add(id);
  }

  // NOTIFICATION message - tells clients state changed, they should refetch from API
  // Include data for backwards compatibility but mark as notification-only
  const readyStatusMessage = {
    type: "team_ready_status",
    teamBattleId: battleId,
    gameSessionId: gameSessionId,
    // Include data for backwards compatibility but clients should refetch
    teamAReady: readyState.teamAReady,
    teamBReady: readyState.teamBReady,
    updatedAt: updatedAt || readyState.updatedAt || new Date(),
    // NEW: Signal that this is a notification - clients MUST refetch from API
    shouldRefetch: true,
    serverTime: Date.now(),
  };


  // Send to all participants via sendToUser (handles multiple connections per user)
  for (const userId of Array.from(participantIds)) {
    sendToUser(userId, readyStatusMessage);
  }
}

// Helper: Broadcast countdown to all participants
async function broadcastCountdown(
  battleId: string,
  gameSessionId: string,
  seconds: number
) {
  const battle = await database.getTeamBattle(battleId);
  if (!battle) return;

  const participantIds = new Set<number>();
  participantIds.add(battle.teamACaptainId);
  if (battle.teamBCaptainId) {
    participantIds.add(battle.teamBCaptainId);
  }

  for (const id of extractTeammateIds(battle.teamATeammates)) {
    participantIds.add(id);
  }
  for (const id of extractTeammateIds(battle.teamBTeammates)) {
    participantIds.add(id);
  }

  const countdownMessage = {
    type: "team_battle_countdown",
    gameSessionId: gameSessionId,
    seconds: seconds,
  };

  for (const userId of Array.from(participantIds)) {
    sendToUser(userId, countdownMessage);
  }
}

// PRODUCTION-SAFE: Handle request for current ready status (database-first)
async function handleRequestReadyStatus(clientId: string, event: GameEvent) {
  if (!event.teamBattleId) return;

  try {
    // Get fresh state from database (always authoritative)
    const readyState = await database.getTeamReadyState(event.teamBattleId);

    sendToClient(clientId, {
      type: "ready_status_response",
      teamBattleId: event.teamBattleId,
      gameSessionId: event.gameSessionId,
      teamAReady: readyState.teamAReady,
      teamBReady: readyState.teamBReady,
      updatedAt: readyState.updatedAt,
    });
  } catch (error) {
    console.error(`[handleRequestReadyStatus] Failed to get ready status:`, error);
    sendToClient(clientId, {
      type: "error",
      message: "Failed to get ready status",
    });
  }
}

// PRODUCTION-SAFE: Handle get_ready_state request (for client refresh/reconnect)
async function handleGetReadyState(clientId: string, event: GameEvent) {
  if (!event.teamBattleId) return;

  try {
    // Get fresh state from database (always authoritative)
    const readyState = await database.getTeamReadyState(event.teamBattleId);

    sendToClient(clientId, {
      type: "ready_status_response",
      teamBattleId: event.teamBattleId,
      gameSessionId: event.gameSessionId,
      teamAReady: readyState.teamAReady,
      teamBReady: readyState.teamBReady,
      updatedAt: readyState.updatedAt,
    });
  } catch (error) {
    console.error(`[handleGetReadyState] Failed to get ready status:`, error);
  }
}

async function handleRecruitPlayer(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId) return;

  try {
    const {
      inviteeUserId,
      gameSessionId: initialGameSessionId,
      recruiterId,
      recruiterName,
    } = event;
    if (!inviteeUserId || !initialGameSessionId || !recruiterId) return;

    // Use a mutable variable for gameSessionId that can be updated
    let gameSessionId = initialGameSessionId;

    // Processing recruitment

    // Check if invitee is already in a game (active WebSocket connection with gameId)
    const inviteeClient = Array.from(clients.values()).find(
      (c) => c.userId === inviteeUserId
    );
    if (inviteeClient && inviteeClient.gameId) {
      sendToClient(clientId, {
        type: "error",
        message: "Player is currently in a game and cannot be recruited",
      });
      return;
    }

    // Get all teams for this game session
    const existingTeams = await database.getTeamsByGameSession(gameSessionId);

    // Also check if there are any teams where this user is a member (in case gameSessionId mismatch)
    const allTeams = await database.getTeamsByGameSession(""); // Get all teams
    const userTeamsInAnySession = allTeams.filter((team) =>
      team.members.some((member) => member.userId === recruiterId)
    );

    // Check if invitee is in a team within the SAME game session (different sessions should be allowed)
    const inviteeTeamMembership = existingTeams.find((team) => {
      const isMember = team.members.some(
        (member) => member.userId === inviteeUserId
      );
      return isMember;
    });

    if (inviteeTeamMembership) {
      sendToClient(clientId, {
        type: "error",
        message: "Player is already in a team in this game session",
      });
      return;
    }

    // Note: Removed overly restrictive captain recruitment check that was blocking normal team formation

    // Check if recruiter is trying to invite someone who invited them
    const existingInvitationsFromInvitee =
      await database.getTeamInvitationsByUser(recruiterId, "pending");
    const bidirectionalInvitation = existingInvitationsFromInvitee.find(
      (inv) => inv.inviterId === inviteeUserId
    );

    if (bidirectionalInvitation) {
      sendToClient(clientId, {
        type: "error",
        message:
          "You cannot invite someone who has already invited you. Please accept or decline their invitation first.",
      });
      return;
    }

    // Check for existing pending invitations
    const existingInvitations = await database.getTeamInvitationsByUser(
      inviteeUserId,
      "pending"
    );
    const pendingInvitation = existingInvitations.find(
      (inv) => inv.inviterId === recruiterId
    );

    if (pendingInvitation) {
      sendToClient(clientId, {
        type: "error",
        message: "An invitation to this user is already pending",
      });
      return;
    }

    const inviteeUser = await database.getUser(inviteeUserId);
    if (!inviteeUser) {
      sendToClient(clientId, {
        type: "error",
        message: "Player not found",
      });
      return;
    }

    // Check if recruiter is in a team - first check session-specific teams, then all teams
    let recruiterTeam = existingTeams.find((team) =>
      team.members.some((member) => member.userId === recruiterId)
    );

    // If not found in session teams, check if user has a team in any session
    if (!recruiterTeam && userTeamsInAnySession.length > 0) {
      recruiterTeam = userTeamsInAnySession[0]; // Take the first team they're in
      // Update the working gameSessionId to match the team's session
      gameSessionId = recruiterTeam.gameSessionId;
      // Re-fetch teams for the correct session
      const correctSessionTeams = await database.getTeamsByGameSession(
        gameSessionId
      );
      existingTeams.splice(0, existingTeams.length, ...correctSessionTeams);

      // Re-check if invitee is in any team after updating the session context
      const inviteeInUpdatedTeams = correctSessionTeams.find((team) =>
        team.members.some((member) => member.userId === inviteeUserId)
      );

      if (inviteeInUpdatedTeams) {
        sendToClient(clientId, {
          type: "error",
          message: "Player is already in a team and cannot be recruited",
        });
        return;
      }
    }

    // Recruitment logic check

    // Determine recruitment type based on game state

    if (existingTeams.length === 2) {
      // Both teams exist (both captains established) - always send member invitations

      if (!recruiterTeam) {
        sendToClient(clientId, {
          type: "error",
          message: "You must be in a team to recruit players",
        });
        return;
      }

      if (recruiterTeam.members.length >= 3) {
        sendToClient(clientId, {
          type: "error",
          message: "Your team is already full (3 members maximum)",
        });
        return;
      }

      const invitationData = {
        id: uuidv4(),
        teamBattleId: recruiterTeam.id,
        inviterId: recruiterId,
        inviterUsername: recruiterName || "Player",
        inviteeId: inviteeUserId,
        invitationType: "teammate" as const,
        teamSide: null,
        status: "pending" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      } as any;

      const invitation = await database.createTeamInvitation(invitationData);

      // Send member invitation
      sendToUser(inviteeUserId, {
        type: "team_member_invitation_received",
        invitation,
        team: recruiterTeam,
        inviterName: recruiterName,
        message: `${recruiterName} has invited you to join their team "${recruiterTeam.name}"!`,
      });

      sendToClient(clientId, {
        type: "team_member_invitation_sent",
        invitation,
        inviteeName: inviteeUser.username,
        message: `Team member invitation sent to ${inviteeUser.username}`,
      });
    } else if (
      recruiterTeam &&
      existingTeams.length === 1 &&
      recruiterTeam.members.length >= 2
    ) {
      // Team has captain + at least 1 member and there's only 1 team - send captain invitation for opposing team

      const invitationData = {
        id: uuidv4(),
        teamBattleId: null,
        inviterId: recruiterId,
        inviterUsername: recruiterName || "Player",
        inviteeId: inviteeUserId,
        invitationType: "opponent" as const,
        teamSide: null,
        status: "pending" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      } as any;

      const invitation = await database.createTeamInvitation(invitationData);

      // Send invitation to be opposing team captain
      sendToUser(inviteeUserId, {
        type: "team_captain_invitation_received",
        invitation,
        inviterName: recruiterName,
        message: `${recruiterName}'s team "${recruiterTeam.name}" has invited you to become captain of the opposing team in a Bible trivia battle!`,
      });

      sendToClient(clientId, {
        type: "opposing_captain_invitation_sent",
        invitation,
        inviteeName: inviteeUser.username,
        message: `Opposing team captain invitation sent to ${inviteeUser.username}`,
      });
    } else if (recruiterTeam && recruiterTeam.members.length < 3) {
      // Regular team member recruitment - recruiter has a team and wants to add a member

      const invitationData = {
        id: uuidv4(),
        teamBattleId: recruiterTeam.id,
        inviterId: recruiterId,
        inviterUsername: recruiterName || "Player",
        inviteeId: inviteeUserId,
        invitationType: "teammate" as const,
        teamSide: null,
        status: "pending" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      } as any;

      const invitation = await database.createTeamInvitation(invitationData);

      // Send regular team member invitation
      sendToUser(inviteeUserId, {
        type: "team_member_invitation_received",
        invitation,
        team: recruiterTeam,
        inviterName: recruiterName,
        message: `${recruiterName} has invited you to join their team "${recruiterTeam.name}"!`,
      });

      sendToClient(clientId, {
        type: "team_member_invitation_sent",
        invitation,
        inviteeName: inviteeUser.username,
        message: `Team member invitation sent to ${inviteeUser.username}`,
      });
    } else if (!recruiterTeam && existingTeams.length === 0) {
      // First recruitment ever - send invitation to be opposing team captain AND create initial player's team
      const invitationData = {
        id: uuidv4(),
        teamBattleId: null,
        inviterId: recruiterId,
        inviterUsername: recruiterName || "Player",
        inviteeId: inviteeUserId,
        invitationType: "opponent" as const,
        teamSide: null,
        status: "pending" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      } as any;

      const invitation = await database.createTeamInvitation(invitationData);

      // Create the initial player's team now
      const initialTeamData = {
        id: uuidv4(),
        name: `${recruiterName || "Player"}'s Team`,
        captainId: recruiterId,
        gameSessionId: gameSessionId,
        members: [
          {
            userId: recruiterId,
            username: recruiterName || "Player",
            role: "captain" as const,
            joinedAt: new Date(),
          },
        ],
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        finalAnswers: [],
        status: "forming" as const,
        createdAt: new Date(),
      };

      const initialTeam = await database.createTeam(initialTeamData);

      // Send invitation to be opposing team captain
      sendToUser(inviteeUserId, {
        type: "team_captain_invitation_received",
        invitation,
        inviterName: recruiterName,
        message: `${recruiterName} has invited you to become captain of the opposing team in a Bible trivia match!`,
      });

      sendToClient(clientId, {
        type: "team_created_and_invitation_sent",
        team: initialTeam,
        message: `Your team "${initialTeam.name}" has been created and team captain invitation sent to ${inviteeUser.username}. You can now recruit up to 2 more team members.`,
      });
    } else if (!recruiterTeam && existingTeams.length > 0) {
      // Initial player wants to recruit after sending captain invite but hasn't created team yet
      // Check if they have any pending captain invitations they sent
      const sentCaptainInvitations = await database.getTeamInvitationsByUser(
        recruiterId,
        "pending"
      );
      const hasSentCaptainInvite = sentCaptainInvitations.some(
        (inv) =>
          inv.inviterId === recruiterId && (inv.teamBattleId === null && inv.invitationType === "opponent")
      );

      if (hasSentCaptainInvite) {
        // Create their team now and then send regular team invitation
        const initialTeamData = {
          id: uuidv4(),
          name: `${recruiterName || "Player"}'s Team`,
          captainId: recruiterId,
          gameSessionId: gameSessionId,
          members: [
            {
              userId: recruiterId,
              username: recruiterName || "Player",
              role: "captain" as const,
              joinedAt: new Date(),
            },
          ],
          score: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          averageTime: 0,
          finalAnswers: [],
          status: "forming" as const,
          createdAt: new Date(),
        };

        const initialTeam = await database.createTeam(initialTeamData);

        // Now send regular team invitation
        const invitationData = {
          id: uuidv4(),
          teamBattleId: initialTeam.id,
          inviterId: recruiterId,
          inviterUsername: recruiterName || "Player",
          inviteeId: inviteeUserId,
          invitationType: "teammate" as const,
          teamSide: null,
          status: "pending" as const,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        } as any;

        const invitation = await database.createTeamInvitation(invitationData);

        // Send invitation to join team
        sendToUser(inviteeUserId, {
          type: "team_invitation_received",
          invitation,
          team: initialTeam,
          inviterName: recruiterName,
          message: `${recruiterName} has invited you to join their team "${initialTeam.name}"`,
        });

        sendToClient(clientId, {
          type: "team_created_and_invitation_sent",
          team: initialTeam,
          message: `Your team "${initialTeam.name}" has been created and invitation sent to ${inviteeUser.username}`,
        });
      } else {
        sendToClient(clientId, {
          type: "error",
          message:
            "You must be in a team to recruit players. Create a team first or join an existing one.",
        });
      }
    } else if (recruiterTeam) {
      // Regular team member recruitment - send invitation to join existing team
      if (recruiterTeam.members.length >= 3) {
        sendToClient(clientId, {
          type: "error",
          message: "Your team is already full",
        });
        return;
      }

      const invitationData = {
        id: uuidv4(),
        teamBattleId: recruiterTeam.id,
        inviterId: recruiterId,
        inviterUsername: recruiterName || "Player",
        inviteeId: inviteeUserId,
        invitationType: "teammate" as const,
        teamSide: null,
        status: "pending" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      } as any;

      const invitation = await database.createTeamInvitation(invitationData);

      // Send invitation to join team
      sendToUser(inviteeUserId, {
        type: "team_invitation_received",
        invitation,
        team: recruiterTeam,
        inviterName: recruiterName,
        message: `${recruiterName} has invited you to join their team "${recruiterTeam.name}"`,
      });

      sendToClient(clientId, {
        type: "invitation_sent",
        message: `Team invitation sent to ${inviteeUser.username}`,
      });
    } else {
      // Recruiter is not in any team and there are existing teams
      sendToClient(clientId, {
        type: "error",
        message:
          "You must be in a team to recruit players. Create a team first or join an existing one.",
      });
    }
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to recruit player",
    });
  }
}

async function handleAcceptTeamInvitation(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.invitation?.id) return;

  try {
    const invitation = await database.getTeamInvitation(event.invitation.id);
    if (!invitation) {
      sendToClient(clientId, {
        type: "error",
        message: "Invitation not found",
      });
      return;
    }

    if (invitation.inviteeId !== client.userId) {
      sendToClient(clientId, {
        type: "error",
        message: "You are not the recipient of this invitation",
      });
      return;
    }

    if (invitation.status !== "pending") {
      sendToClient(clientId, {
        type: "error",
        message: "Invitation is no longer valid",
      });
      return;
    }

    // Check if this is a team captain invitation
    if (invitation.teamBattleId === null && invitation.invitationType === "opponent") {
      // Create opposing team with this user as captain
      // First, need to get the game session ID from the inviter's team
      const inviterUser = await database.getUser(invitation.inviterId);
      const allTeams = await database.getTeamsByGameSession(""); // Get all teams to find the right session
      let gameSessionId = event.gameSessionId;

      // Find the inviter's team to get the correct game session ID
      const inviterTeams = await database.getTeamsByGameSession("");
      for (const team of inviterTeams) {
        if (
          team.members.some((member) => member.userId === invitation.inviterId)
        ) {
          gameSessionId = team.gameSessionId;
          break;
        }
      }

      if (!gameSessionId) {
        gameSessionId = uuidv4();
      }

      const opposingTeamData = {
        id: uuidv4(),
        name: `${client.playerName || "Player"}'s Team`,
        captainId: client.userId,
        gameSessionId,
        members: [
          {
            userId: client.userId,
            username: client.playerName || "Player",
            role: "captain" as const,
            joinedAt: new Date(),
          },
        ],
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        finalAnswers: [],
        status: "forming" as const,
        createdAt: new Date(),
      };

      const opposingTeam = await database.createTeam(opposingTeamData);

      // Update activeTeamMemberships cache for team captain
      activeTeamMemberships.set(client.userId, opposingTeam.id);

      // Update invitation status
      await database.updateTeamInvitation(invitation.id, {
        status: "accepted",
      });

      // Notify both players
      sendToClient(clientId, {
        type: "team_captain_assigned",
        team: opposingTeam,
        message: `You are now captain of "${opposingTeam.name}"! You can recruit up to 2 team members.`,
      });

      sendToUser(invitation.inviterId, {
        type: "opposing_team_created",
        message: `${client.playerName} has accepted and created the opposing team!`,
        opposingTeam,
      });

      // Broadcast comprehensive team updates to ALL connected clients
      const allTeamsNow = await database.getTeamsByGameSession(gameSessionId);

      // Notify ALL connected clients about team changes
      Array.from(clients.values()).forEach((gameClient) => {
        sendToClient(gameClient.id, {
          type: "teams_updated",
          teams: allTeamsNow,
          message: "Team composition has changed",
        });

        // Also send team_update for backward compatibility
        sendToClient(gameClient.id, {
          type: "team_update",
          teams: allTeamsNow,
        });
      });

      // Update player availability immediately after team captain assignment
      await broadcastOnlineStatusUpdate();

      // Send additional notifications to ensure UI updates
      setTimeout(() => {
        Array.from(clients.values()).forEach((gameClient) => {
          sendToClient(gameClient.id, {
            type: "force_refresh_teams",
            teams: allTeamsNow,
          });
        });
      }, 500);
    } else {
      // Regular team member invitation
      const team = await database.getTeam(invitation.teamBattleId!);
      if (!team) {
        sendToClient(clientId, {
          type: "error",
          message: "Team not found",
        });
        return;
      }

      // Check if team is full
      if (team.members.length >= 3) {
        sendToClient(clientId, {
          type: "error",
          message: "Team is already full",
        });
        return;
      }

      // Check if user is already in any team for this game session
      const allTeams = await database.getTeamsByGameSession(team.gameSessionId);
      const userAlreadyInTeam = allTeams.find((t) =>
        t.members.some((member) => member.userId === client.userId)
      );

      if (userAlreadyInTeam) {
        sendToClient(clientId, {
          type: "error",
          message: "You are already in a team for this game. You cannot join multiple teams.",
        });
        return;
      }

      // Add user to team
      const newMember = {
        userId: client.userId,
        username: client.playerName || "Player",
        role: "member" as const,
        joinedAt: new Date(),
      };

      const updatedTeam = await database.updateTeam(team.id, {
        members: [...team.members, newMember],
      });

      // Update activeTeamMemberships cache
      activeTeamMemberships.set(client.userId, team.id);

      // Update invitation status
      await database.updateTeamInvitation(invitation.id, {
        status: "accepted",
      });

      // 🔒 CRITICAL: Expire all other pending join requests and invitations for this user
      // This ensures a member can only join one team (the first one that accepts)
      await expireAllPendingRequestsAndInvitationsForUser(client.userId);

      // Update availability immediately after joining team
      await broadcastOnlineStatusUpdate();

      // Notify the new member that they've successfully joined
      sendToClient(clientId, {
        type: "team_joined_successfully",
        team: updatedTeam,
        message: `You have successfully joined "${updatedTeam.name}"!`,
      });

      // Notify all team members (including the new member) with complete team data
      updatedTeam.members.forEach((member) => {
        sendToUser(member.userId, {
          type: "team_updated",
          team: updatedTeam,
          message: `${client.playerName} has joined the team!`,
        });
      });

      // Send specific notification to team captain with updated member list
      const captain = updatedTeam.members.find((m) => m.role === "captain");
      if (captain && captain.userId !== client.userId) {
        sendToUser(captain.userId, {
          type: "team_member_joined",
          team: updatedTeam,
          newMember: newMember,
          message: `${client.playerName} has joined your team!`,
        });
      }

      // Broadcast to all clients in the game session with updated teams data
      const allTeamsInSession = await database.getTeamsByGameSession(
        team.gameSessionId
      );
      const gameClients = Array.from(clients.values()).filter(
        (c) =>
          c.gameId === team.gameSessionId ||
          (c.userId &&
            allTeamsInSession.some((team) =>
              team.members.some((member) => member.userId === c.userId)
            ))
      );

      for (const gameClient of gameClients) {
        sendToClient(gameClient.id, {
          type: "teams_updated",
          gameSessionId: team.gameSessionId,
          teams: allTeamsInSession,
        });
      }

      // CRITICAL FIX: Update player availability immediately after team join
      await broadcastOnlineStatusUpdate();
    }
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to accept invitation",
    });
  }
}

async function handleStartTeamBattle(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.gameSessionId) {
    return;
  }

  try {

    // Get battles for this session
    const battles = await database.getTeamBattlesByGameSession(event.gameSessionId);

    if (battles.length === 0) {
      sendToClient(clientId, {
        type: "error",
        message: "No team battle found for this session. Please create teams first.",
      });
      return;
    }

    // Get the most recent forming battle
    const battle = battles.find(b => b.status === 'forming') || battles[0];

    if (!battle) {
      sendToClient(clientId, {
        type: "error",
        message: "No active battle found. Please create teams first.",
      });
      return;
    }

    // Check if user is a captain
    const isTeamACaptain = battle.teamACaptainId === client.userId;
    const isTeamBCaptain = battle.teamBCaptainId === client.userId;

    if (!isTeamACaptain && !isTeamBCaptain) {
      sendToClient(clientId, {
        type: "error",
        message: "Only team captains can start battles",
      });
      return;
    }

    // Validate both teams exist and have at least 1 member
    if (!battle.teamBCaptainId || !battle.teamBName) {
      sendToClient(clientId, {
        type: "error",
        message: "Opposing team not created yet. Waiting for opponent captain to accept invitation.",
      });
      return;
    }

    // Count team members (captain + teammates)
    const teamASize = 1 + (battle.teamATeammates?.length || 0);
    const teamBSize = 1 + (battle.teamBTeammates?.length || 0);

    if (teamASize < 1 || teamBSize < 1) {
      sendToClient(clientId, {
        type: "error",
        message: `Both teams need at least 1 member. Current: Team A has ${teamASize}, Team B has ${teamBSize}`,
      });
      return;
    }


    // CRITICAL: Get all teams in the session (derived from team battles) and validate COMPREHENSIVELY
    // This ensures teams are properly registered before phase advancement
    const allTeams = await getTeamsForTeamBattleSession(event.gameSessionId);

    // CRITICAL VALIDATION #1: Exactly 2 teams must exist
    if (allTeams.length !== 2) {
      sendToClient(clientId, {
        type: "error",
        message: `Invalid team configuration: Found ${allTeams.length} teams. Need exactly 2 teams to start battle.`,
      });
      return;
    }

    // CRITICAL VALIDATION #2: Each team must have a captain
    for (const team of allTeams) {
      if (!team.captainId) {
        sendToClient(clientId, {
          type: "error",
          message: `Team ${team.name} is missing a captain. Cannot start battle.`,
        });
        return;
      }

      // Verify captain is in members list
      const captainInMembers = team.members.some((m: any) => m.userId === team.captainId && m.role === "captain");
      if (!captainInMembers) {
        sendToClient(clientId, {
          type: "error",
          message: `Team ${team.name} captain is not properly registered. Cannot start battle.`,
        });
        return;
      }
    }

    // CRITICAL VALIDATION #3: Each team must have at least 1 member (captain counts)
    const eligibleTeams = allTeams.filter(
      (team) =>
        team.members.length >= 1 &&
        (team.status === "ready" || team.status === "forming")
    );

    if (eligibleTeams.length < 2) {
      sendToClient(clientId, {
        type: "error",
        message: "Need 2 teams with at least 1 member each to start battle",
      });
      return;
    }

    // CRITICAL VALIDATION #4: Verify all members are properly registered
    // Collect all participant user IDs (captains + members)
    const participantIds = new Set<number>();
    for (const team of eligibleTeams) {
      if (!team.captainId || typeof team.captainId !== 'number') {
        sendToClient(clientId, {
          type: "error",
          message: `Team ${team.name} has no valid captain. Cannot start battle.`,
        });
        return;
      }
      participantIds.add(team.captainId);

      for (const member of team.members) {
        const memberUserId = member.userId;
        if (memberUserId && typeof memberUserId === 'number') {
          participantIds.add(memberUserId);
        } else {
          sendToClient(clientId, {
            type: "error",
            message: `Team ${team.name} has invalid member data. Cannot start battle.`,
          });
          return;
        }
      }
    }

    // CRITICAL VALIDATION #5: Verify we have participants from both teams
    if (participantIds.size < 2) {
      sendToClient(clientId, {
        type: "error",
        message: "Need at least 2 participants (one from each team) to start battle",
      });
      return;
    }


    // Use eligible teams
    const readyTeams = eligibleTeams;

    const gameId = uuidv4();

    // Create players array from all team members
    const allPlayers: Player[] = [];
    for (const team of readyTeams) {
      for (const member of team.members) {
        allPlayers.push({
          id: member.userId.toString(),
          name: member.username,
          score: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          averageTime: 0,
          isReady: true,
          userId: member.userId,
          teamId: team.id,
        });
      }
    }

    // CRITICAL: Only update battle status to "playing" (IN_GAME phase) AFTER all validations pass
    // This ensures teams are complete before phase advancement
    try {
      await database.updateTeamBattle(battle.id, {
        status: "playing", // IN_GAME phase
        startedAt: new Date(),
      });
    } catch (error) {
      console.error(`[handleStartTeamBattle] ❌ Failed to update battle status:`, error);
      sendToClient(clientId, {
        type: "error",
        message: "Failed to start battle. Please try again.",
      });
      return;
    }

    // Create team battle game session
    gameSessions.set(gameId, {
      id: gameId,
      players: allPlayers,
      status: "playing",
      gameType: "team_battle",
      currentQuestionIndex: 0,
      questions: [],
      teams: readyTeams,
      category: battle.category,
      difficulty: battle.difficulty,
    });
    // If this battle was created as rapid_fire, mark session mode
    if (battle && (battle as any).gameType === "rapid_fire") {
      const session = gameSessions.get(gameId);
      if (session) (session as any).mode = "rapid_fire";
    }

    // Update all team members' client gameId and gameSessionId and notify battle start
    // CRITICAL FIX: Get all clients for all players, including those that may connect later
    const gameClients = Array.from(clients.values()).filter((c) =>
      allPlayers.some((player) => player.userId === c.userId)
    );

    // CRITICAL FIX: Use sendToUser to ensure ALL user connections (including multiple tabs) receive the event
    // This is more reliable than sendToClient for individual connections
    for (const player of allPlayers) {
      // CRITICAL: Skip if player.userId is undefined (should not happen after validation, but safety check)
      if (!player.userId || typeof player.userId !== 'number') {
        console.warn(`[handleStartTeamBattle] Skipping player with invalid userId:`, player);
        continue;
      }

      // Set gameId for all connections of this user
      const userConnectionsList = userConnections.get(player.userId) || [];
      for (const connectionId of userConnectionsList) {
        const client = clients.get(connectionId);
        if (client) {
          client.gameId = gameId;
          client.gameSessionId = event.gameSessionId;
        }
      }

      // Send to ALL connections for this user (handles multiple tabs)
      sendToUser(player.userId, {
        type: "team_battle_started",
        gameId: gameId,
        gameSessionId: event.gameSessionId,
        teams: readyTeams,
        gameType: (battle as any).gameType,
        message: "Team battle has begun!",
      });
    }

    // ADDITIONAL FIX: Also send directly to currently connected clients as backup
    // This ensures immediate delivery even if userConnections is not fully updated
    for (const gameClient of gameClients) {
      gameClient.gameId = gameId;
      gameClient.gameSessionId = event.gameSessionId;
      sendToClient(gameClient.id, {
        type: "team_battle_started",
        gameId: gameId,
        gameSessionId: event.gameSessionId,
        teams: readyTeams,
        gameType: (battle as any).gameType,
        message: "Team battle has begun!",
      });
    }

    // Update team statuses to playing
    for (const team of readyTeams) {
      team.status = "playing";
    }

    // Start delivering questions after ensuring all clients are notified
    // Use a longer delay to ensure all clients have received team_battle_started
    // Start delivering questions after ensuring all clients are notified
    // Use a longer delay to ensure all clients have received team_battle_started
    // RAPID FIRE: Increase delay significantly (to 6s) to allow room for the 5s "Rapid Fire Rules" dialog/countdown
    const isRapidFire = battle && (battle as any).gameType === "rapid_fire";
    const startDelay = isRapidFire ? 6000 : 3000;

    setTimeout(() => {
      try {
        if (isRapidFire) {
          const s = gameSessions.get(gameId);
          if (s) (s as any).mode = "rapid_fire";
          startRapidFireQuestions(gameId);
        } else {
          startTeamBattleQuestions(gameId);
        }
      } catch (err) {
        console.error(`[handleStartTeamBattle] Error starting questions for gameId ${gameId}:`, err);
        // Fallback to normal flow
        startTeamBattleQuestions(gameId);
      }
    }, startDelay);
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to start team battle",
    });
  }
}

async function startTeamBattleQuestions(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  try {

    // Collect all user IDs from all team members to exclude their recent questions
    const allUserIds: number[] = [];
    if (gameSession.teams && Array.isArray(gameSession.teams)) {
      for (const team of gameSession.teams) {
        if (team.members && Array.isArray(team.members)) {
          for (const member of team.members) {
            if (member.userId && typeof member.userId === 'number' && !allUserIds.includes(member.userId)) {
              allUserIds.push(member.userId);
            }
          }
        }
      }
    }


    // Get questions excluded by ALL team members (union of all their recent questions)
    let allExcludedQuestionIds: string[] = [];
    if (allUserIds.length > 0) {
      const excludeRecentHours = 48; // Exclude questions seen in last 48 hours
      const historyPromises = allUserIds.map(userId =>
        database.getUserQuestionHistory(userId, excludeRecentHours)
      );
      const allHistories = await Promise.all(historyPromises);

      // Combine all excluded question IDs (union - no duplicates)
      const excludedSet = new Set<string>();
      for (const history of allHistories) {
        for (const entry of history) {
          excludedSet.add(entry.questionId);
        }
      }
      allExcludedQuestionIds = Array.from(excludedSet);
    }

    // Use the first user ID for tracking purposes (needed for toss and question selection)
    const primaryUserId = allUserIds.length > 0 ? allUserIds[0] : undefined;

    // -----------------------
    // NEW: Toss question phase
    // -----------------------
    try {
      // Fetch one toss question (history-aware)
      const tossCandidates = await database.getRandomQuestionsWithHistory({
        count: 1,
        category: gameSession.category && gameSession.category !== "All Categories" ? gameSession.category : undefined,
        difficulty: gameSession.difficulty || undefined,
        userId: primaryUserId,
        excludeRecentHours: 0,
      });

      const validToss = (tossCandidates || []).find(
        (q: any) => q && q.id && q.text && q.answers && Array.isArray(q.answers) && q.answers.length > 0
      );

      if (validToss) {
        // Store toss question in session and mark phase
        (gameSession as any).tossQuestion = validToss;
        (gameSession as any).phase = "toss";
        (gameSession as any).tossWinnerTeamId = undefined;

        // Broadcast toss question to all players in this game
        const gameClients = Array.from(clients.values()).filter((c) => {
          if (!c.gameId) return false;
          return c.gameId === gameId;
        });

        for (const client of gameClients) {
          sendToClient(client.id, {
            type: "team_battle_toss",
            gameId,
            question: validToss,
            // timeLimit removed for indefinite toss
            message: "Toss question: first correct team wins the toss!",
          });
        }

        // Create a promise that will be resolved when toss completes (winner decided)
        let tossResolve: ((value?: any) => void) | undefined;
        const tossPromise = new Promise((resolve) => {
          tossResolve = resolve;
        });
        (gameSession as any)._tossResolve = tossResolve;
        (gameSession as any)._tossPromise = tossPromise;

        // No timeout for toss - wait indefinitely for answers

        // Wait for toss to finish before continuing to generate main questions
        await tossPromise;
      }
    } catch (err) {
      console.error(`[TeamBattle] Failed to initialize toss question for gameId ${gameId}:`, err);
      // Non-fatal: continue to generate questions without toss
    }

    // Get questions for the battle using history-aware selection
    // Exclude questions seen by ANY team member in the last 48 hours
    // Total 10 questions: Team A gets 5 (odd: 1,3,5,7,9), Team B gets 5 (even: 2,4,6,8,10)
    const questions = await database.getRandomQuestionsWithHistory({
      count: 10,
      category: gameSession.category && gameSession.category !== "All Categories" ? gameSession.category : undefined,
      difficulty: gameSession.difficulty || undefined,
      userId: primaryUserId,
      excludeRecentHours: 0, // We'll manually exclude below
    });

    // Validate that we got questions from database first
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      console.error(`[TeamBattle] No questions returned from database for gameId: ${gameId}`);
      const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
      for (const client of gameClients) {
        sendToClient(client.id, {
          type: "error",
          message: "No questions available. The battle cannot continue.",
        });
      }
      endTeamBattle(gameId, "No questions available");
      return;
    }

    // Filter out any invalid questions FIRST before history filtering
    const validQuestions = questions.filter(
      (q) => q && q.id && q.text && q.answers && Array.isArray(q.answers) && q.answers.length > 0
    );

    if (validQuestions.length === 0) {
      console.error(`[TeamBattle] No valid questions from database for gameId: ${gameId}`);
      const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
      for (const client of gameClients) {
        sendToClient(client.id, {
          type: "error",
          message: "No valid questions available. Please try again.",
        });
      }
      endTeamBattle(gameId, "No valid questions available");
      return;
    }

    // Manually filter out questions that were seen by any team member
    // BUT: If all questions are filtered out, use the original questions anyway
    // (we'll reuse them to ensure we always have 10)
    let filteredQuestions = validQuestions;
    if (allExcludedQuestionIds.length > 0) {
      const historyFiltered = validQuestions.filter(q => !allExcludedQuestionIds.includes(q.id));
      if (historyFiltered.length > 0) {
        // We have some questions after history filtering - use them
        filteredQuestions = historyFiltered;
      } else {
        // All questions were filtered out - use original questions anyway
        // (we'll reuse them to ensure variety)
        console.warn(`[TeamBattle] All questions were seen recently. Using original questions anyway (will reuse for variety).`);
        filteredQuestions = validQuestions;
      }
    }


    // CRITICAL: Ensure we always have exactly 10 UNIQUE questions
    // Use filteredQuestions (after history filtering) as the base
    let finalQuestions = [...filteredQuestions];
    const usedQuestionIds = new Set<string>();

    // First, add all unique questions from filteredQuestions
    const uniqueFiltered: any[] = [];
    for (const q of filteredQuestions) {
      if (q && q.id && !usedQuestionIds.has(q.id)) {
        uniqueFiltered.push(q);
        usedQuestionIds.add(q.id);
      }
    }
    finalQuestions = uniqueFiltered;

    // If we don't have enough unique questions, try to get more from database
    if (finalQuestions.length < 10) {
      console.warn(`[TeamBattle] Only ${finalQuestions.length} unique questions available (requested 10) for gameId: ${gameId}. Attempting to fetch more...`);

      try {
        // Try to get additional questions, excluding the ones we already have
        const additionalNeeded = 10 - finalQuestions.length;
        const additionalQuestions = await database.getRandomQuestionsWithHistory({
          count: additionalNeeded * 2, // Get more than needed to account for duplicates
          userId: primaryUserId,
          excludeRecentHours: 0,
        });

        // Add unique questions from additional fetch
        for (const q of additionalQuestions) {
          if (q && q.id && !usedQuestionIds.has(q.id) && finalQuestions.length < 10) {
            // Validate question has required fields
            if (q.text && q.answers && Array.isArray(q.answers) && q.answers.length > 0) {
              finalQuestions.push(q);
              usedQuestionIds.add(q.id);
            }
          }
        }

      } catch (error) {
        console.error(`[TeamBattle] Failed to fetch additional questions:`, error);
      }
    }

    // If we still don't have 10 unique questions, we'll use what we have
    // (This should rarely happen if database has enough questions)
    if (finalQuestions.length < 10) {
      console.warn(`[TeamBattle] Only ${finalQuestions.length} unique questions available after all attempts. Using available questions.`);
    } else if (finalQuestions.length > 10) {
      // If we have more than 10, take only 10 unique ones and shuffle them
      // Shuffle using gameId as seed for consistent randomization per game
      let seed = 0;
      for (let i = 0; i < gameId.length; i++) {
        seed += gameId.charCodeAt(i);
      }
      for (let i = finalQuestions.length - 1; i > 0; i--) {
        const j = Math.floor((seed + i) % (i + 1));
        [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
      }
      finalQuestions = finalQuestions.slice(0, 10);
    } else {
      // Exactly 10 unique questions - just shuffle them for variety
      let seed = 0;
      for (let i = 0; i < gameId.length; i++) {
        seed += gameId.charCodeAt(i);
      }
      for (let i = finalQuestions.length - 1; i > 0; i--) {
        const j = Math.floor((seed + Date.now() + i) % (i + 1));
        [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
      }
    }

    // CRITICAL: Final validation - ensure all questions are unique
    const finalQuestionIds = new Set<string>();
    const validatedQuestions: any[] = [];
    for (const q of finalQuestions) {
      if (q && q.id && !finalQuestionIds.has(q.id)) {
        validatedQuestions.push(q);
        finalQuestionIds.add(q.id);
      }
    }
    finalQuestions = validatedQuestions;


    gameSession.questions = finalQuestions;
    gameSession.currentQuestionIndex = 0;


    // Track question history for ALL team members (non-blocking)
    // This ensures users don't see the same questions in future games
    if (allUserIds.length > 0 && finalQuestions.length > 0) {
      // Track history for all users asynchronously (don't block game start)
      Promise.all(
        allUserIds.map(async (userId) => {
          try {
            for (const question of finalQuestions) {
              await database.addUserQuestionHistory({
                userId,
                questionId: question.id,
                category: question.category,
                difficulty: question.difficulty,
              });
            }
          } catch (error) {
            console.error(`[TeamBattle] Failed to track question history for user ${userId}:`, error);
            // Non-critical error - continue even if history tracking fails
          }
        })
      ).catch((error) => {
        console.error(`[TeamBattle] Error tracking question history:`, error);
        // Non-critical - game continues even if history tracking fails
      });
    }

    // Before sending any normal questions, ensure toss phase is completed.
    // If toss was initialized and still active, wait for its promise to resolve.
    const session = gameSessions.get(gameId);
    if (session && (session as any).phase === "toss" && (session as any)._tossPromise) {
      try {
        await (session as any)._tossPromise;
      } catch (err) {
        console.error(`[startTeamBattleQuestions] Error waiting for tossPromise for gameId ${gameId}:`, err);
      }
    }

    // Send first question to the appropriate team (Team A for question 1)
    // CRITICAL FIX: Double-check questions are loaded before sending
    // Add a small delay to ensure all clients are ready and have received team_battle_started
    setTimeout(() => {
      const s = gameSessions.get(gameId);
      if (s && s.questions && s.questions.length > 0) {
        sendTeamBattleQuestion(gameId);
      } else {
        console.error(`[startTeamBattleQuestions] Questions not loaded for gameId: ${gameId}, retrying...`);
        // Retry after another delay
        setTimeout(() => {
          const retrySession = gameSessions.get(gameId);
          if (retrySession && retrySession.questions && retrySession.questions.length > 0) {
            sendTeamBattleQuestion(gameId);
          } else {
            // Still no questions - notify all clients and end battle gracefully
            console.error(`[startTeamBattleQuestions] Questions still not loaded after retry for gameId: ${gameId}`);
            const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
            for (const client of gameClients) {
              sendToClient(client.id, {
                type: "error",
                message: "Failed to load questions. Please try starting a new battle.",
              });
            }
            endTeamBattle(gameId, "Failed to load questions");
          }
        }, 2000);
      }
    }, 1000); // Increased from 500 to 1000 to ensure all clients are ready
  } catch (error) {
    console.error(`[TeamBattle] Error loading questions for gameId: ${gameId}:`, error);
    // Fixed: Notify clients and gracefully end battle if questions cannot be loaded
    try {
      const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
      for (const client of gameClients) {
        sendToClient(client.id, {
          type: "error",
          message: error instanceof Error ? `Error loading questions: ${error.message}` : "Error loading questions. The battle cannot continue.",
        });
      }
      endTeamBattle(gameId, `Error loading questions: ${error instanceof Error ? error.message : "Unknown error"}`);
    } catch (err) {
      console.error(`[TeamBattle] Error notifying clients:`, err);
    }
  }
}

function sendTeamBattleQuestion(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) {
    console.error(`[TeamBattle] Game session not found for gameId: ${gameId}`);
    return;
  }

  // If this session is configured for rapid-fire, delegate to the rapid pipeline
  if ((gameSession as any).mode === "rapid_fire" || (gameSession as any).gameType === "rapid_fire") {
    try {
      // Ensure we use the rapid pipeline which emits only team_battle_rapid_question
      sendRapidFireQuestion(gameId);
    } catch (err) {
      console.error(`[TeamBattle] Failed to send rapid-fire question for gameId ${gameId}:`, err);
    }
    return;
  }

  if (!gameSession.questions) {
    console.error(`[TeamBattle] Questions not initialized for gameId: ${gameId}`);
    return;
  }

  // Prevent sending normal questions while toss phase is active
  if ((gameSession as any).phase === "toss") {
    return;
  }

  if (!gameSession.teams || gameSession.teams.length === 0) {
    console.error(`[TeamBattle] Teams not found for gameId: ${gameId}`);
    return;
  }

  const currentIndex = gameSession.currentQuestionIndex || 0;

  // CRITICAL: Check if questions array is empty or invalid - don't end battle, just wait
  if (!gameSession.questions || gameSession.questions.length === 0) {
    console.warn(`[TeamBattle] Questions array is empty for gameId: ${gameId}. Waiting for questions to be loaded...`);
    // Don't end battle - questions might still be loading
    // Retry after a delay with exponential backoff
    let retryCount = (gameSession as any).questionRetryCount || 0;
    if (retryCount < 5) { // Max 5 retries
      (gameSession as any).questionRetryCount = retryCount + 1;
      setTimeout(() => {
        const retrySession = gameSessions.get(gameId);
        if (retrySession && retrySession.questions && retrySession.questions.length > 0) {
          (retrySession as any).questionRetryCount = 0; // Reset retry count
          sendTeamBattleQuestion(gameId);
        } else {
          console.warn(`[TeamBattle] Questions still not loaded after ${retryCount + 1} retries for gameId: ${gameId}`);
          // Continue retrying
          sendTeamBattleQuestion(gameId);
        }
      }, 1000 * (retryCount + 1)); // Exponential backoff: 1s, 2s, 3s, 4s, 5s
    } else {
      // Too many retries - notify clients and end battle
      console.error(`[TeamBattle] Questions failed to load after ${retryCount} retries for gameId: ${gameId}`);
      const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
      for (const client of gameClients) {
        sendToClient(client.id, {
          type: "error",
          message: "Failed to load questions after multiple attempts. The battle cannot continue.",
        });
      }
      endTeamBattle(gameId, "Questions failed to load after retries");
    }
    return;
  }

  // Reset retry count if questions are loaded
  if ((gameSession as any).questionRetryCount) {
    (gameSession as any).questionRetryCount = 0;
  }

  const currentQuestion = gameSession.questions[currentIndex];

  if (!currentQuestion) {
    // Check if we've actually run out of questions or if there's an issue
    if (currentIndex >= gameSession.questions.length && gameSession.questions.length > 0) {
      // Legitimately out of questions - only end if we have questions and have gone through them all
      endTeamBattle(gameId);
    } else if (gameSession.questions.length === 0) {
      // Questions not loaded yet - wait and retry
      console.warn(`[TeamBattle] Questions not loaded yet for gameId: ${gameId} at index ${currentIndex}. Waiting...`);
      setTimeout(() => {
        const retrySession = gameSessions.get(gameId);
        if (retrySession && retrySession.questions && retrySession.questions.length > 0) {
          sendTeamBattleQuestion(gameId);
        } else {
          console.error(`[TeamBattle] Questions still not loaded after retry for gameId: ${gameId}`);
        }
      }, 1000);
    } else {
      // Question missing at index - this might be a temporary issue, don't end battle
      console.warn(`[TeamBattle] Question missing at index ${currentIndex} for gameId: ${gameId}. Total questions: ${gameSession.questions.length}. Waiting...`);
      // Don't end battle - questions might still be loading or there's a temporary issue
    }
    return;
  }

  if (gameSession.questionTimeout) {
    clearTimeout(gameSession.questionTimeout);
    gameSession.questionTimeout = undefined;
  }

  // Determine which team should answer this question
  // Question numbers: 1,2,3,4,5,6,7,8,9,10
  // Team A answers odd questions (1,3,5,7,9)
  // Team B answers even questions (2,4,6,8,10)
  const questionNumber = currentIndex + 1;
  const isTeamATurn = questionNumber % 2 === 1; // Odd numbers = Team A

  // Find the team that should answer (Team A or Team B)
  // If teams don't have teamSide, assign by order (first team = A, second = B)
  let answeringTeam = gameSession.teams.find((team) => {
    if (team.teamSide) {
      if (isTeamATurn) {
        return team.teamSide === "A";
      } else {
        return team.teamSide === "B";
      }
    }
    return false;
  });

  // Fallback: if no teamSide is set, use team order
  if (!answeringTeam && gameSession.teams.length >= 2) {
    answeringTeam = isTeamATurn ? gameSession.teams[0] : gameSession.teams[1];
  }

  // Find the opposing team
  const opposingTeam = gameSession.teams.find((team) => team.id !== answeringTeam?.id);

  if (!answeringTeam) {
    console.error(`[TeamBattle] Cannot determine answering team for gameId: ${gameId}, question ${questionNumber}`);
    // Send to all teams as last resort
    const gameClients = Array.from(clients.values()).filter(
      (c) => c.gameId === gameId
    );
    for (const client of gameClients) {
      const player = gameSession.players.find((p) => p.userId === client.userId);
      if (player) {
        if ((gameSession as any).mode === "rapid_fire" || (gameSession as any).gameType === "rapid_fire") {
          sendToClient(client.id, {
            type: "team_battle_rapid_question",
            gameId: gameId,
            question: currentQuestion,
            questionNumber: questionNumber,
            totalQuestions: gameSession.questions.length,
            teamId: player.teamId,
            timeLimit: 10000,
            isYourTurn: true,
          });
        } else {
          sendToClient(client.id, {
            type: "team_battle_question",
            gameId: gameId,
            question: currentQuestion,
            questionNumber: questionNumber,
            totalQuestions: gameSession.questions.length,
            teamId: player.teamId,
            timeLimit: 15000,
            isYourTurn: true,
          });
        }
      }
    }
    return;
  }

  // CRITICAL FIX: Send question info to both teams, but indicate whose turn it is
  // Filter clients by gameId AND verify they're actually in the game session
  const gameClients = Array.from(clients.values()).filter((c) => {
    if (c.gameId !== gameId) return false;
    // Double-check: verify this client's userId is in the players list
    if (!c.userId) return false;
    return gameSession.players.some((p) => p.userId === c.userId);
  });

  // ADDITIONAL FIX: Also send to clients that might have userId in players but gameId not set yet
  // This handles race conditions where client connects but gameId isn't set yet
  const playersByUserId = new Map(gameSession.players.map(p => [p.userId, p]));
  const additionalClients = Array.from(clients.values()).filter((c) => {
    if (!c.userId) return false;
    if (c.gameId === gameId) return false; // Already included above
    // If this client's userId is in players but gameId isn't set, set it and include them
    if (playersByUserId.has(c.userId)) {
      c.gameId = gameId;
      c.gameSessionId = gameSession.teams?.[0]?.gameSessionId || "";
      return true;
    }
    return false;
  });

  // Combine both sets of clients
  const allGameClients = [...gameClients, ...additionalClients];

  // Ensure we send question to ALL clients in the game
  for (const client of allGameClients) {
    const player = gameSession.players.find((p) => p.userId === client.userId);
    if (!player) {
      console.warn(`[TeamBattle] Player not found for client ${client.id} in gameId: ${gameId}`);
      // Still send question to client even if player not found
      sendToClient(client.id, {
        type: "team_battle_question",
        gameId: gameId,
        question: currentQuestion,
        questionNumber: questionNumber,
        totalQuestions: gameSession.questions.length,
        timeLimit: 15000,
        isYourTurn: false,
        answeringTeamName: answeringTeam.name,
      });
      continue;
    }

    if (player.teamId === answeringTeam.id) {
      // Send question to members of the answering team (their turn)
      sendToClient(client.id, {
        type: "team_battle_question",
        gameId: gameId,
        question: currentQuestion,
        questionNumber: questionNumber,
        totalQuestions: gameSession.questions.length,
        teamId: player.teamId,
        timeLimit: 15000,
        isYourTurn: true,
        answeringTeamName: answeringTeam.name,
      });
    } else if (opposingTeam && player.teamId === opposingTeam.id) {
      // Send question info to the waiting team (read-only view) - CRITICAL: Always send to opposing team
      sendToClient(client.id, {
        type: "team_battle_question",
        gameId: gameId,
        question: currentQuestion,
        questionNumber: questionNumber,
        totalQuestions: gameSession.questions.length,
        teamId: player.teamId,
        timeLimit: 15000,
        isYourTurn: false,
        answeringTeamName: answeringTeam.name,
        opposingTeamName: opposingTeam.name,
      });
    } else {
      // Player's team not found in the battle - send question anyway (read-only)
      console.warn(`[TeamBattle] Player ${player.userId} team ${player.teamId} not found in battle teams. Sending read-only question.`);
      sendToClient(client.id, {
        type: "team_battle_question",
        gameId: gameId,
        question: currentQuestion,
        questionNumber: questionNumber,
        totalQuestions: gameSession.questions.length,
        teamId: player.teamId,
        timeLimit: 15000,
        isYourTurn: false,
        answeringTeamName: answeringTeam.name,
      });
    }
  }


  gameSession.questionTimeout = setTimeout(() => {
    processTeamBattleAnswers(gameId);
  }, 15000);
}

async function processTeamBattleAnswers(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession || !gameSession.questions || !gameSession.teams) return;

  if (gameSession.questionTimeout) {
    clearTimeout(gameSession.questionTimeout);
    gameSession.questionTimeout = undefined;
  }

  // CRITICAL: Prevent duplicate processing of the same question
  // If we're already processing this question, return early
  if ((gameSession as any).isProcessingAnswers) {
    return;
  }

  // Mark that we're processing answers
  (gameSession as any).isProcessingAnswers = true;

  const currentIndex = gameSession.currentQuestionIndex ?? 0;
  const currentQuestion = gameSession.questions[currentIndex];

  // Safety guard: if for any reason the current question or its answers
  // are missing, avoid crashing the server. This can happen if a timer
  // fires after the battle has been cleaned up or questions were not
  // initialized correctly.
  if (!currentQuestion || !Array.isArray((currentQuestion as any).answers)) {
    // Fixed: Notify clients about the error and end the battle gracefully
    (gameSession as any).isProcessingAnswers = false; // Reset flag
    try {
      const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
      for (const client of gameClients) {
        sendToClient(client.id, {
          type: "error",
          message: "Error processing question: Question data is missing or invalid.",
        });
      }
      endTeamBattle(gameId, "Error processing question");
    } catch (error) {
      // Silent error handling
    }
    return;
  }

  const correctAnswer = (currentQuestion as any).answers.find((a: any) => a.isCorrect);

  // Determine which team should have answered this question
  // Question numbers: 1,2,3,4,5,6,7,8,9,10
  // Team A answers odd questions (1,3,5,7,9)
  // Team B answers even questions (2,4,6,8,10)
  const questionNumber = currentIndex + 1;
  const isTeamATurn = questionNumber % 2 === 1; // Odd numbers = Team A

  // Find the team that should have answered
  let answeringTeam = gameSession.teams.find((team) => {
    if (team.teamSide) {
      if (isTeamATurn) {
        return team.teamSide === "A";
      } else {
        return team.teamSide === "B";
      }
    }
    return false;
  });

  // Fallback: if no teamSide is set, use team order
  if (!answeringTeam && gameSession.teams.length >= 2) {
    answeringTeam = isTeamATurn ? gameSession.teams[0] : gameSession.teams[1];
  }

  // Calculate team scores for this question
  const teamResults = [];
  for (const team of gameSession.teams) {
    // Only process answer from the team that should have answered
    if (team.id !== answeringTeam?.id) {
      // Other team didn't answer (they weren't supposed to)
      teamResults.push({
        teamId: team.id,
        teamName: team.name,
        answered: false,
        correct: false,
        score: 0,
      });
      continue;
    }

    const teamAnswer = team.finalAnswers?.find(
      (fa: any) => fa.questionId === currentQuestion.id
    );
    const isCorrect = teamAnswer && teamAnswer.answerId === correctAnswer?.id;

    teamResults.push({
      teamId: team.id,
      teamName: team.name,
      answered: !!teamAnswer,
      correct: isCorrect,
      score: isCorrect ? 100 : 0,
    });

    // Update team score only for the answering team
    if (isCorrect) {
      team.score = (team.score || 0) + 100;
      team.correctAnswers = (team.correctAnswers || 0) + 1;
    } else {
      team.incorrectAnswers = (team.incorrectAnswers || 0) + 1;
    }

    if (team.teamBattleId && team.teamSide) {
      const battleUpdates: any = {};
      if (team.teamSide === "A") {
        battleUpdates.teamAScore = team.score;
        battleUpdates.teamACorrectAnswers = team.correctAnswers;
        battleUpdates.teamAIncorrectAnswers = team.incorrectAnswers;
      } else if (team.teamSide === "B") {
        battleUpdates.teamBScore = team.score;
        battleUpdates.teamBCorrectAnswers = team.correctAnswers;
        battleUpdates.teamBIncorrectAnswers = team.incorrectAnswers;
      }

      if (Object.keys(battleUpdates).length > 0) {
        await database.updateTeamBattle(team.teamBattleId, battleUpdates);
      }
    }
  }

  // CRITICAL FIX: Send results to all players (both teams see the results)
  // Filter by gameId AND verify they're in the players list
  const gameClients = Array.from(clients.values()).filter((c) => {
    if (c.gameId !== gameId) return false;
    if (!c.userId) return false;
    return gameSession.players.some((p) => p.userId === c.userId);
  });

  // Also include clients with userId in players but gameId not set
  const playersByUserId = new Map(gameSession.players.map(p => [p.userId, p]));
  const additionalClients = Array.from(clients.values()).filter((c) => {
    if (!c.userId) return false;
    if (c.gameId === gameId) return false;
    if (playersByUserId.has(c.userId)) {
      c.gameId = gameId;
      c.gameSessionId = gameSession.teams?.[0]?.gameSessionId || "";
      return true;
    }
    return false;
  });

  const allGameClients = [...gameClients, ...additionalClients];

  for (const client of allGameClients) {
    const player = gameSession.players.find((p) => p.userId === client.userId);
    const playerTeam = player ? gameSession.teams.find((t) => t.id === player.teamId) : null;
    const wasPlayerTeamTurn = playerTeam && playerTeam.id === answeringTeam?.id;

    sendToClient(client.id, {
      type: "team_battle_question_results",
      gameId: gameId,
      question: currentQuestion,
      correctAnswer: correctAnswer,
      teamResults: teamResults,
      leaderboard: gameSession.teams
        .map((t) => ({
          teamId: t.id,
          teamName: t.name,
          score: t.score || 0,
        }))
        .sort((a, b) => b.score - a.score),
      // Include info about whose turn it was
      answeringTeamId: answeringTeam?.id,
      answeringTeamName: answeringTeam?.name,
      wasYourTurn: wasPlayerTeamTurn || false, // Explicitly tell client if it was their turn
    });
  }

  // Move to next question or end battle
  // CRITICAL: Increment index AFTER processing current question to prevent repeats
  const nextIndex = (gameSession.currentQuestionIndex || 0) + 1;
  gameSession.currentQuestionIndex = nextIndex;

  // CRITICAL: Only check if battle is complete if we have questions loaded
  // If questions array is empty, don't end battle - questions might still be loading
  if (!gameSession.questions || gameSession.questions.length === 0) {
    console.warn(`[TeamBattle] Questions array is empty in processTeamBattleAnswers for gameId: ${gameId}. Waiting for questions...`);
    // Don't end battle - questions might still be loading
    (gameSession as any).isProcessingAnswers = false; // Reset flag
    return;
  }

  if (nextIndex >= gameSession.questions.length) {
    // Battle completed - give teams a moment to see final results
    (gameSession as any).isProcessingAnswers = false; // Reset flag
    setTimeout(() => endTeamBattle(gameId), 2000);
  } else {
    // Next question - send after a brief delay to show results
    (gameSession as any).isProcessingAnswers = false; // Reset flag before sending next question
    setTimeout(() => {
      sendTeamBattleQuestion(gameId);
    }, 2000); // 2 seconds to show results before next question (reduced from 3)
  }
}

// -----------------------
// Toss handling helpers
// -----------------------
async function handleTossSubmission(
  clientId: string,
  client: Client,
  gameSession: any,
  sessionTeam: any,
  event: GameEvent
) {
  try {
    const tossQuestion = (gameSession as any).tossQuestion;
    const qid = event.questionId as string;
    if (!tossQuestion || qid !== tossQuestion.id) {
      // Not a toss question submission
      return;
    }

    // Initialize tossMemberAnswers storage
    if (!sessionTeam.tossMemberAnswers) sessionTeam.tossMemberAnswers = {};
    if (!sessionTeam.tossMemberAnswers[qid]) sessionTeam.tossMemberAnswers[qid] = {};

    // Store temporary toss answer (isolated from normal memberAnswers)
    sessionTeam.tossMemberAnswers[qid][client.userId!.toString()] = {
      answerId: event.answerId,
      submittedAt: new Date(),
      timeSpent: event.timeSpent || 0,
    };

    // Broadcast suggestion to all teammates so captain sees member picks
    let displayName = client.playerName || event.username;
    if (!displayName) {
      try {
        const user = await database.getUser(client.userId!);
        displayName = user?.username || `Player ${client.userId}`;
      } catch {
        displayName = `Player ${client.userId}`;
      }
    }

    const teamMemberConnections = sessionTeam.members
      .map((member: any) => userConnections.get(member.userId))
      .filter(present)
      .flat();

    const suggestionPayload: GameEvent = {
      type: "team_option_selected",
      teamId: sessionTeam.id,
      userId: client.userId,
      username: displayName,
      questionId: event.questionId,
      answerId: event.answerId,
    };

    teamMemberConnections.forEach((connectionId: string | undefined) => {
      if (connectionId) {
        sendToClient(connectionId, suggestionPayload);
      }
    });

    // Evaluate correctness
    const correctAnswer = tossQuestion.answers?.find((a: any) => a.isCorrect);
    const isCorrect = !!(correctAnswer && event.answerId === correctAnswer.id);

    // Send feedback only to submitting user (and all their connections)
    const payload: GameEvent = {
      type: "team_battle_toss_feedback",
      gameId: client.gameId,
      questionId: event.questionId,
      answerId: event.answerId,
      isCorrect,
      correctAnswerId: correctAnswer?.id,
      message: isCorrect ? "Correct!" : "Incorrect",
    };

    sendToClient(clientId, payload);
    if (client.userId) {
      sendToUser(client.userId, payload);
    }

    // If correct and toss not yet decided -> finalize winner
    if (isCorrect && !(gameSession as any).tossWinnerTeamId) {
      await finalizeTossWinner(client.gameId!, sessionTeam.id, client.userId);
      return;
    }

    // If both teams have submitted and none correct -> trigger retry processing
    const teamsSubmitted = gameSession.teams.filter((t: any) => {
      const answers = (t as any).tossMemberAnswers?.[qid] || {};
      return Object.keys(answers).length > 0;
    }).length;

    if (teamsSubmitted >= 2) {
      // Let processTossResult handle retry/new toss flow (reads tossMemberAnswers)
      await processTossResult(gameSession.id);
      return;
    }

    // Otherwise just wait for timeout or other submissions
  } catch (err) {
    console.error(`[handleTossSubmission] Error:`, err);
  }
}

async function processTossResult(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession || !gameSession.teams) return;

  try {
    const tossQuestion = (gameSession as any).tossQuestion;
    if (!tossQuestion || !tossQuestion.answers) {
      // Nothing to process - pick random fallback
      const randomWinner = gameSession.teams[0]?.id || gameSession.teams[1]?.id;
      await finalizeTossWinner(gameId, randomWinner, undefined);
      return;
    }

    // Collect all individual submissions for toss question across teams
    const correctAnswer = tossQuestion.answers.find((a: any) => a.isCorrect);
    const correctSubmissions: Array<{ teamId: string; userId: number; submittedAt: Date }> = [];

    for (const team of gameSession.teams) {
      // Prefer toss-specific temporary answers to avoid mixing with normal answers
      const memberAnswers =
        (team as any).tossMemberAnswers?.[tossQuestion.id] ||
        team.memberAnswers?.[tossQuestion.id] ||
        {};
      for (const [userIdStr, entry] of Object.entries(memberAnswers)) {
        const userId = Number(userIdStr);
        const answerId = (entry as any)?.answerId;
        const submittedAtRaw = (entry as any)?.submittedAt;
        if (answerId && correctAnswer && answerId === correctAnswer.id) {
          correctSubmissions.push({
            teamId: team.id,
            userId,
            submittedAt: submittedAtRaw ? new Date(submittedAtRaw) : new Date(),
          });
        }
      }
    }

    if (correctSubmissions.length > 0) {
      // Find earliest correct submission
      correctSubmissions.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
      const winner = correctSubmissions[0];
      await finalizeTossWinner(gameId, winner.teamId, winner.userId);
      return;
    }

    // No correct submissions -> check if BOTH teams submitted wrong answers

    const teamSubmissionMap: Record<string, boolean> = {};

    for (const team of gameSession.teams) {
      const memberAnswers =
        (team as any).tossMemberAnswers?.[tossQuestion.id] || {};

      teamSubmissionMap[team.id] =
        Object.keys(memberAnswers).length > 0;
    }

    const teamsSubmitted = Object.values(teamSubmissionMap).filter(Boolean).length;

    if (teamsSubmitted >= 2) {
      // Both teams tried and none were correct -> issue a new toss question (re-run toss)
      try {
        // Clear previous toss answers for toss question to avoid mixing
        for (const team of gameSession.teams) {
          if ((team as any).tossMemberAnswers && (team as any).tossMemberAnswers[tossQuestion.id]) {
            delete (team as any).tossMemberAnswers[tossQuestion.id];
          }
          if (team.memberAnswers && team.memberAnswers[tossQuestion.id]) {
            delete team.memberAnswers[tossQuestion.id];
          }
        }

        // Fetch a new toss question
        const tossCandidates = await database.getRandomQuestionsWithHistory({
          count: 1,
          userId: undefined,
          excludeRecentHours: 0,
          excludeIds: [tossQuestion.id],
        });
        const newToss = (tossCandidates || []).find(
          (q: any) => q && q.id && q.text && q.answers && Array.isArray(q.answers) && q.answers.length > 0
        );

        if (newToss) {
          (gameSession as any).tossQuestion = newToss;
          // Broadcast new toss question
          const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
          for (const client of gameClients) {
            sendToClient(client.id, {
              type: "team_battle_toss",
              gameId,
              question: newToss,
              // timeLimit removed
              message: "Both teams answered incorrectly. New Toss: first correct answer wins!",
            });
          }

          // No timeout for re-toss either - wait indefinitely

          // Do not resolve toss Promise yet - wait for retry to finish
          return;
        }
      } catch (err) {
        console.error(`[Toss] Failed to fetch retry toss question for gameId ${gameId}:`, err);
      }
    } else {
      // Waiting for other team to answer...
      return;
    }

    // Fallback moved inside unexpected error catch or removed because we wait indefinitely
  } catch (err) {
    console.error(`[Toss] processTossResult error for gameId ${gameId}:`, err);
  }
}

async function finalizeTossWinner(
  gameId: string,
  winningTeamId: string,
  winningUserId?: number
) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession || !gameSession.teams) return;

  try {
    if ((gameSession as any).tossWinnerTeamId) return;

    (gameSession as any).tossWinnerTeamId = winningTeamId;

    // 🔥 CRITICAL FIX
    (gameSession as any).phase = "in_game";

    if ((gameSession as any).tossTimeout) {
      clearTimeout((gameSession as any).tossTimeout);
      (gameSession as any).tossTimeout = undefined;
    }

    for (const team of gameSession.teams) {
      team.teamSide = team.id === winningTeamId ? "A" : "B";
    }

    const gameClients = Array.from(clients.values())
      .filter((c) => c.gameId === gameId);

    for (const client of gameClients) {
      sendToClient(client.id, {
        type: "team_battle_toss_result",
        gameId,
        winnerTeamId: winningTeamId,
        userId: winningUserId,
        message: "Toss complete. First turn assigned.",
      });
    }

    if ((gameSession as any)?._tossResolve) {
      (gameSession as any)._tossResolve({});
      (gameSession as any)._tossResolve = undefined;
    }

  } catch (err) {
    console.error(`[Toss] finalizeTossWinner error:`, err);
  }
}

// -----------------------
// Rapid-fire helpers (separate from normal team battle)
// -----------------------
async function startRapidFireQuestions(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  try {
    // Mark mode and phase for this session
    (gameSession as any).mode = "rapid_fire";
    (gameSession as any).phase = "rapid_fire";

    // Choose primary user if available for history-aware selection
    const allUserIds = (gameSession.players || []).map((p: any) => p.userId).filter(Boolean);
    const primaryUserId = allUserIds.length > 0 ? allUserIds[0] : undefined;

    // Load questions (history-aware) - 10 by default
    const questions = await database.getRandomQuestionsWithHistory({
      count: 10,
      userId: primaryUserId,
      excludeRecentHours: 0,
    });

    const validQuestions = (questions || []).filter(
      (q: any) => q && q.id && q.text && q.answers && Array.isArray(q.answers) && q.answers.length > 0
    );

    gameSession.questions = validQuestions;
    gameSession.currentQuestionIndex = 0;

    // Initialize rapid-fire awarded map and timeouts
    (gameSession as any)._rapidAwardedMap = {};
    (gameSession as any)._rapidQuestionTimeout = undefined;

    // Send first rapid-fire question after a short delay
    setTimeout(() => {
      sendRapidFireQuestion(gameId);
    }, 500);
  } catch (err) {
    console.error(`[RapidFire] Failed to initialize rapid-fire for gameId ${gameId}:`, err);
  }
}

function sendRapidFireQuestion(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  // Only operate in rapid_fire mode
  if ((gameSession as any).mode !== "rapid_fire") return;

  const currentIndex = gameSession.currentQuestionIndex || 0;
  const question = gameSession.questions ? gameSession.questions[currentIndex] : null;
  if (!question) {
    endTeamBattle(gameId, "rapid_fire_complete");
    return;
  }

  // Reset per-team rapid answer storage for this question
  for (const team of gameSession.teams || []) {
    if (!(team as any).rapidMemberAnswers) (team as any).rapidMemberAnswers = {};
    (team as any).rapidMemberAnswers[question.id] = {};
  }

  // Reset awarded flag for this question
  if (!(gameSession as any)._rapidAwardedMap) (gameSession as any)._rapidAwardedMap = {};
  (gameSession as any)._rapidAwardedMap[question.id] = false;

  // Broadcast rapid-fire question to all clients in the game
  const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
  // Uses existing currentIndex variable from line 6953
  const totalQuestions = gameSession.questions?.length || 5;

  for (const client of gameClients) {
    sendToClient(client.id, {
      type: "team_battle_rapid_question",
      gameId,
      question,
      questionNumber: currentIndex + 1,
      totalQuestions: totalQuestions,
      timeLimit: 20000,
      message: "Rapid-fire: first correct answer wins the point!",
    });
  }

  // Set timeout to process result if nobody answers correctly in time
  if ((gameSession as any)._rapidQuestionTimeout) {
    clearTimeout((gameSession as any)._rapidQuestionTimeout);
  }
  (gameSession as any)._rapidQuestionTimeout = setTimeout(() => {
    processRapidFireResult(gameId, question.id).catch((err) => {
      console.error(`[RapidFire] Error processing rapid-fire timeout for gameId ${gameId}:`, err);
    });
  }, 20000);
}

function isSoloTeam(team: any): boolean {
  const members = team?.members;
  if (!members || !Array.isArray(members)) return false;
  const validCount = members.filter((m: any) => m?.userId != null).length;
  return validCount <= 1;
}

function getActiveRapidFireQuestion(gameSession: any): any | null {
  if (!gameSession?.questions?.length) return null;
  const idx = gameSession.currentQuestionIndex ?? 0;
  return gameSession.questions[idx] ?? null;
}

function getActiveRapidFireQuestionId(gameSession: any): string | null {
  const q = getActiveRapidFireQuestion(gameSession);
  return q?.id ?? null;
}

/** True once a question was awarded OR timed out / closed with no award. */
function isRapidFireQuestionResolved(gameSession: any, questionId: string): boolean {
  return !!(gameSession as any)._rapidAwardedMap?.[questionId];
}

function markRapidFireQuestionResolved(gameSession: any, questionId: string): void {
  if (!(gameSession as any)._rapidAwardedMap) (gameSession as any)._rapidAwardedMap = {};
  (gameSession as any)._rapidAwardedMap[questionId] = true;
}

function buildRapidFireRestorePayload(gameSession: any, teamId: string, questionId: string) {
  const memoryTeam = gameSession.teams?.find((t: any) => t.id === teamId);
  if (!memoryTeam) return { suggestions: [], finalAnswer: null };

  const suggestions: Array<{ userId: number; username: string; answerId: string }> = [];
  const memberAnswersForQ = memoryTeam.memberAnswers?.[questionId] || {};
  for (const [userIdStr, entry] of Object.entries(memberAnswersForQ)) {
    const entryAny = entry as any;
    const userId = parseInt(userIdStr, 10);
    const member = memoryTeam.members?.find((m: any) => m.userId === userId);
    suggestions.push({
      userId,
      username: entryAny.username || member?.username || `Player ${userIdStr}`,
      answerId: entryAny.answerId,
    });
  }

  const finalAnswer =
    (memoryTeam.finalAnswers || []).find((fa: any) => fa.questionId === questionId) || null;

  return { suggestions, finalAnswer };
}

function buildRapidFireQuestionReconnectEvent(
  gameSession: any,
  gameId: string,
  question: any,
  questionNumber: number,
  totalQuestions: number,
  userTeamId: string,
  extras: Record<string, any> = {}
) {
  const restore = buildRapidFireRestorePayload(gameSession, userTeamId, question.id);
  return {
    type: "team_battle_rapid_question",
    gameId,
    question,
    questionNumber,
    totalQuestions,
    teamId: userTeamId,
    timeLimit: 20000,
    restoredSuggestions: restore.suggestions,
    restoredFinalAnswer: restore.finalAnswer,
    message: "Rapid-fire: first correct answer wins the point!",
    ...extras,
  };
}

function hasTeamFinalizedRapidQuestion(team: any, questionId: string): boolean {
  return (team.finalAnswers || []).some((fa: any) => fa.questionId === questionId);
}

function allTeamsFinalizedRapidQuestion(gameSession: any, questionId: string): boolean {
  return (gameSession.teams || []).every((t: any) =>
    hasTeamFinalizedRapidQuestion(t, questionId)
  );
}

async function tryAwardRapidFireCorrectAnswer(
  gameSession: any,
  sessionTeam: any,
  qid: string,
  userId?: number
): Promise<boolean> {
  if (isRapidFireQuestionResolved(gameSession, qid)) {
    return false;
  }

  const activeQuestionId = getActiveRapidFireQuestionId(gameSession);
  if (!activeQuestionId || qid !== activeQuestionId) {
    return false;
  }

  markRapidFireQuestionResolved(gameSession, qid);

  if ((gameSession as any)._rapidQuestionTimeout) {
    clearTimeout((gameSession as any)._rapidQuestionTimeout);
    (gameSession as any)._rapidQuestionTimeout = undefined;
  }

  const points = 10;
  const teamObj = gameSession.teams.find((t: any) => t.id === sessionTeam.id);
  if (teamObj) {
    teamObj.score = (teamObj.score || 0) + points;
    teamObj.correctAnswers = (teamObj.correctAnswers || 0) + 1;
  }

  const leaderboard = gameSession.teams
    .map((t: any) => ({
      teamId: t.id,
      teamName: t.name,
      score: t.score || 0,
    }))
    .sort((a: any, b: any) => b.score - a.score);

  const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameSession.id);
  for (const c of gameClients) {
    sendToClient(c.id, {
      type: "rapid_fire_awarded",
      gameId: gameSession.id,
      questionId: qid,
      teamId: sessionTeam.id,
      userId,
      points,
      teams: gameSession.teams,
      leaderboard,
      message: "Rapid-fire: first correct answer awarded",
    });
  }

  gameSession.currentQuestionIndex = (gameSession.currentQuestionIndex || 0) + 1;
  setTimeout(() => {
    sendRapidFireQuestion(gameSession.id);
  }, 1200);

  return true;
}

async function evaluateRapidFireFinalizedAnswer(
  gameSession: any,
  sessionTeam: any,
  questionId: string,
  answerId: string,
  client: Client
) {
  const activeQuestionId = getActiveRapidFireQuestionId(gameSession);
  if (!activeQuestionId || questionId !== activeQuestionId) {
    return;
  }
  if (isRapidFireQuestionResolved(gameSession, questionId)) {
    return;
  }

  const question = (gameSession.questions || []).find((q: any) => q.id === questionId);
  if (!question) return;

  const correctAnswer = question.answers?.find((a: any) => a.isCorrect);
  const isCorrect = !!(correctAnswer && answerId === correctAnswer.id);

  const feedbackPayload: GameEvent = {
    type: "rapid_fire_feedback",
    gameId: client.gameId,
    questionId,
    answerId,
    isCorrect,
    correctAnswerId: correctAnswer?.id,
    message: isCorrect ? "Correct!" : "Incorrect",
  };

  if (client.userId) {
    try {
      sendToUser(client.userId, feedbackPayload);
    } catch (e) {
      console.error(`[RapidFire] Failed to send finalize feedback to user ${client.userId}:`, e);
    }
  }

  if (isCorrect) {
    await tryAwardRapidFireCorrectAnswer(
      gameSession,
      sessionTeam,
      questionId,
      client.userId
    );
    return;
  }

  if (
    allTeamsFinalizedRapidQuestion(gameSession, questionId) &&
    !isRapidFireQuestionResolved(gameSession, questionId)
  ) {
    if ((gameSession as any)._rapidQuestionTimeout) {
      clearTimeout((gameSession as any)._rapidQuestionTimeout);
      (gameSession as any)._rapidQuestionTimeout = undefined;
    }
    processRapidFireResult(gameSession.id, questionId).catch((err) => {
      console.error(`[RapidFire] Error processing all-finalized-incorrect result:`, err);
    });
  }
}

async function processRapidFireResult(gameId: string, questionId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  try {
    // Idempotent: question already awarded or permanently closed
    if (isRapidFireQuestionResolved(gameSession, questionId)) {
      return;
    }

    // CRITICAL: Mark resolved before advancing so stale finalizes cannot score
    markRapidFireQuestionResolved(gameSession, questionId);

    // No correct submissions within time limit -> broadcast no-award and advance
    const gameClients = Array.from(clients.values()).filter((c) => c.gameId === gameId);
    for (const client of gameClients) {
      sendToClient(client.id, {
        type: "rapid_fire_no_award",
        gameId,
        questionId,
        message: "No correct answers - moving to next question.",
      });
    }

    // Advance index and send next question if available
    gameSession.currentQuestionIndex = (gameSession.currentQuestionIndex || 0) + 1;
    const nextQuestion = gameSession.questions ? gameSession.questions[gameSession.currentQuestionIndex] : null;
    if (nextQuestion) {
      // Small delay to show result
      setTimeout(() => sendRapidFireQuestion(gameId), 1000);
    } else {
      // No more questions - end or mark finished (reuse endTeamBattle behavior)
      // For now, end the team battle gracefully using existing endTeamBattle
      endTeamBattle(gameId, "rapid_fire_complete");
    }
  } catch (err) {
    console.error(`[RapidFire] processRapidFireResult error for gameId ${gameId}:`, err);
  } finally {
    if ((gameSession as any)?._rapidQuestionTimeout) {
      clearTimeout((gameSession as any)._rapidQuestionTimeout);
      (gameSession as any)._rapidQuestionTimeout = undefined;
    }
  }
}

async function handleRapidFireSubmission(
  clientId: string,
  client: Client,
  gameSession: any,
  sessionTeam: any,
  event: GameEvent
) {
  try {
    const qid = event.questionId as string;

    if (isRapidFireQuestionResolved(gameSession, qid)) {
      return;
    }
    const activeQuestionId = getActiveRapidFireQuestionId(gameSession);
    if (!activeQuestionId || qid !== activeQuestionId) {
      sendToClient(clientId, {
        type: "error",
        message: "This question is no longer active",
      });
      return;
    }

    const question = (gameSession.questions || []).find((q: any) => q.id === qid);
    if (!question) {
      return;
    }

    // Multi-player teams: member submissions are suggestions only (captain finalizes separately)
    if (!isSoloTeam(sessionTeam)) {
      if (sessionTeam.captainId !== client.userId) {
        if (hasTeamFinalizedRapidQuestion(sessionTeam, qid)) {
          sendToClient(clientId, {
            type: "error",
            message: "This question has already been finalized by your team",
          });
          return;
        }

        if (!sessionTeam.memberAnswers) sessionTeam.memberAnswers = {};
        if (!sessionTeam.memberAnswers[qid]) sessionTeam.memberAnswers[qid] = {};
        sessionTeam.memberAnswers[qid][client.userId!.toString()] = {
          answerId: event.answerId,
          submittedAt: new Date(),
          timeSpent: event.timeSpent || 0,
          username: client.playerName,
        };

        const teamClients = Array.from(clients.values()).filter((c) =>
          sessionTeam.members.some((member: any) => member.userId === c.userId)
        );
        for (const teamClient of teamClients) {
          sendToClient(teamClient.id, {
            type: "team_member_answered",
            teamId: sessionTeam.id,
            questionId: qid,
            memberName: client.playerName,
            userId: client.userId,
            username: client.playerName,
            answersReceived: Object.keys(sessionTeam.memberAnswers[qid] || {}).length,
            totalMembers: sessionTeam.members.length,
          });
        }

        sendToClient(clientId, {
          type: "team_answer_submitted",
          teamId: sessionTeam.id,
          questionId: qid,
          answerId: event.answerId,
          userId: client.userId,
          username: client.playerName,
          message: "Your suggestion has been sent to the captain",
        });
        return;
      }

      sendToClient(clientId, {
        type: "error",
        message: "Only the captain can submit the team's final answer",
      });
      return;
    }

    // 1v1 (solo captain): immediate evaluation — preserve original rapid-fire race behavior
    if (!sessionTeam.rapidMemberAnswers) sessionTeam.rapidMemberAnswers = {};
    if (!sessionTeam.rapidMemberAnswers[qid]) sessionTeam.rapidMemberAnswers[qid] = {};

    if (sessionTeam.rapidMemberAnswers[qid][client.userId!.toString()]) {
      return;
    }

    sessionTeam.rapidMemberAnswers[qid][client.userId!.toString()] = {
      answerId: event.answerId,
      submittedAt: new Date(),
      timeSpent: event.timeSpent || 0,
    };

    const correctAnswer = question.answers?.find((a: any) => a.isCorrect);
    const isCorrect = !!(correctAnswer && event.answerId === correctAnswer.id);

    const payload: GameEvent = {
      type: "rapid_fire_feedback",
      gameId: client.gameId,
      questionId: event.questionId,
      answerId: event.answerId,
      isCorrect,
      correctAnswerId: correctAnswer?.id,
      message: isCorrect ? "Correct!" : "Incorrect",
    };

    sendToClient(clientId, payload);
    if (client.userId) {
      try {
        sendToUser(client.userId, payload);
      } catch (e) {
        console.error(`[RapidFire] Failed to send feedback to all connections for user ${client.userId}:`, e);
      }
    }

    if (isCorrect) {
      await tryAwardRapidFireCorrectAnswer(
        gameSession,
        sessionTeam,
        qid,
        client.userId
      );
    } else {
      const allTeamsParticipated = (gameSession.teams || []).every((t: any) => {
        if (!isSoloTeam(t)) {
          return hasTeamFinalizedRapidQuestion(t, qid);
        }
        const teamAnswers = (t as any).rapidMemberAnswers?.[qid];
        return teamAnswers && Object.keys(teamAnswers).length > 0;
      });

      if (allTeamsParticipated && !isRapidFireQuestionResolved(gameSession, qid)) {

        if ((gameSession as any)._rapidQuestionTimeout) {
          clearTimeout((gameSession as any)._rapidQuestionTimeout);
          (gameSession as any)._rapidQuestionTimeout = undefined;
        }

        processRapidFireResult(gameSession.id, qid).catch((err) => {
          console.error(`[RapidFire] Error processing immediate result:`, err);
        });
      }
    }
  } catch (err) {
    console.error(`[handleRapidFireSubmission] Error:`, err);
  }
}

async function endTeamBattle(gameId: string, reason?: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession || !gameSession.teams) return;

  try {
    // Determine winner
    const sortedTeams = gameSession.teams
      .map((t) => ({ ...t, score: t.score || 0 }))
      .sort((a, b) => b.score - a.score);

    const winner = sortedTeams[0];
    const isDraw =
      sortedTeams.length > 1 && sortedTeams[0].score === sortedTeams[1].score;

    // Get game session data for history
    const sessionData = await database.getGameSession(gameId);
    const startTime = sessionData?.startTime || new Date();
    const endTime = new Date();

    // Send battle results to all players
    const gameClients = Array.from(clients.values()).filter(
      (c) => c.gameId === gameId
    );
    for (const client of gameClients) {
      const player = gameSession.players.find(
        (p) => p.userId === client.userId
      );
      const playerTeam = gameSession.teams.find((t) => t.id === player?.teamId);

      sendToClient(client.id, {
        type: "team_battle_ended",
        gameId: gameId,
        winner: isDraw ? null : winner,
        isDraw: isDraw,
        finalScores: sortedTeams,
        yourTeam: playerTeam,
        reason: reason || "Battle completed",
        gameHistory: {
          duration: Math.floor(
            (endTime.getTime() - startTime.getTime()) / 1000
          ),
          totalQuestions: gameSession.questions?.length || 0,
          averageScore:
            gameSession.players.reduce((sum, p) => sum + p.score, 0) /
            gameSession.players.length,
        },
      });

      // Clear gameId
      client.gameId = undefined;
    }

    // Update team statuses to finished (persisted on team_battles rows)
    for (const team of gameSession.teams) {
      if (team.teamBattleId) {
        // Update battle status to finished first
        await database.updateTeamBattle(team.teamBattleId, {
          status: "finished",
          finishedAt: new Date(),
        });

        // CENTRALIZED: Use resetBattleState for ready state cleanup
        // Note: We don't delete the battle or change status (already set to "finished" above)
        await resetBattleState({
          battleId: team.teamBattleId,
          reason: "battle_end",
          deleteBattle: false,
          // Don't set newStatus since we already set it to "finished"
        });
      }
    }

    // CRITICAL FIX: Remove REMAINING team members from activeTeamMemberships cache
    // LIFECYCLE GUARD: Skip players who have already LEFT (they may have joined a NEW team)
    const removedUserIds: number[] = [];
    const leftPlayers = gameSession.leftPlayerIds || new Set<number>();
    for (const team of gameSession.teams) {
      if (team.members && Array.isArray(team.members)) {
        for (const member of team.members) {
          if (member.userId && typeof member.userId === 'number' && !leftPlayers.has(member.userId)) {
            activeTeamMemberships.delete(member.userId);
            removedUserIds.push(member.userId);
          } else if (member.userId && leftPlayers.has(member.userId)) {
          }
        }
      }
    }
    if (leftPlayers.size > 0) {
    }

    // Clean up game session
    gameSessions.delete(gameId);

    // CRITICAL FIX: Broadcast online status update so all clients see updated available opponents
    setTimeout(async () => {
      try {
        await broadcastOnlineStatusUpdate();

        // Additional broadcast after a longer delay to catch any missed clients
        setTimeout(async () => {
          try {
            await broadcastOnlineStatusUpdate();
          } catch (retryError) {
            console.error(`[endTeamBattle] Second broadcast failed:`, retryError);
          }
        }, 1000); // 1 second delay for second broadcast
      } catch (error) {
        console.error(`[endTeamBattle] Error broadcasting online status update:`, error);
        // Retry once after a short delay
        setTimeout(async () => {
          try {
            await broadcastOnlineStatusUpdate();
          } catch (retryError) {
            console.error(`[endTeamBattle] Retry failed:`, retryError);
          }
        }, 500);
      }
    }, 300); // Increased from 100ms to 300ms for better reliability
  } catch (error) {
    console.error(`[endTeamBattle] Error ending battle:`, error);

    // Still send basic results even if history saving fails
    const gameClients = Array.from(clients.values()).filter(
      (c) => c.gameId === gameId
    );
    for (const client of gameClients) {
      sendToClient(client.id, {
        type: "team_battle_ended",
        gameId: gameId,
        winner: null,
        isDraw: true,
        finalScores: [],
        reason: "Battle ended with error",
      });
      client.gameId = undefined;
    }

    // CRITICAL FIX: Even on error, try to clean up memberships and broadcast
    // LIFECYCLE GUARD: Skip players who have already LEFT
    const removedUserIdsOnError: number[] = [];
    const leftPlayersOnError = gameSession.leftPlayerIds || new Set<number>();
    try {
      for (const team of gameSession.teams || []) {
        if (team.members && Array.isArray(team.members)) {
          for (const member of team.members) {
            if (member.userId && typeof member.userId === 'number' && !leftPlayersOnError.has(member.userId)) {
              activeTeamMemberships.delete(member.userId);
              removedUserIdsOnError.push(member.userId);
            }
          }
        }
      }
      // Broadcast with retry on error
      setTimeout(async () => {
        try {
          await broadcastOnlineStatusUpdate();
        } catch (cleanupError) {
          console.error(`[endTeamBattle] Error broadcasting in cleanup:`, cleanupError);
          setTimeout(async () => {
            try {
              await broadcastOnlineStatusUpdate();
            } catch (finalError) {
              console.error(`[endTeamBattle] Final retry failed:`, finalError);
            }
          }, 500);
        }
      }, 100);
    } catch (cleanupError) {
      console.error(`[endTeamBattle] Error during cleanup:`, cleanupError);
    }

    gameSessions.delete(gameId);
  }
}

async function autoFinalizeTeamAnswer(teamId: string, questionId: string) {
  try {
    // Get team from game session for memberAnswers
    let sessionTeam: any | null = null;
    let parentGameSession: any | null = null;
    for (const [, gameSession] of Array.from(gameSessions)) {
      if (gameSession.gameType === "team_battle" && gameSession.teams) {
        const found = gameSession.teams.find((t: any) => t.id === teamId);
        if (found) {
          sessionTeam = found;
          parentGameSession = gameSession as any;
          break;
        }
      }
    }

    // Safety: Do not auto-finalize during toss phase or for toss question ids
    if (parentGameSession && (parentGameSession as any).phase === "toss") {
      return;
    }

    if (
      !sessionTeam ||
      !sessionTeam.memberAnswers ||
      !sessionTeam.memberAnswers[questionId]
    )
      return;

    const memberAnswers = sessionTeam.memberAnswers[questionId];
    const answerCounts: Record<string, number> = {};

    // Count votes for each answer
    Object.values(memberAnswers).forEach((answer: any) => {
      const answerId = answer.answerId;
      answerCounts[answerId] = (answerCounts[answerId] || 0) + 1;
    });

    // Find the answer with the most votes (majority rule)
    let finalAnswerId = "";
    let maxVotes = 0;

    for (const [answerId, votes] of Object.entries(answerCounts)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        finalAnswerId = answerId;
      }
    }

    // Create team answer
    const teamAnswer = {
      questionId: questionId,
      answerId: finalAnswerId,
      isCorrect: false, // Will be determined later
      timeSpent: 0,
      submittedBy: sessionTeam.captainId, // Use captain's userId
    };

    // Update team with final answer in memory
    const existingFinalAnswers = sessionTeam.finalAnswers || [];
    sessionTeam.finalAnswers = [...existingFinalAnswers, teamAnswer];

    // Notify team members
    const teamClients = Array.from(clients.values()).filter((c) =>
      sessionTeam.members.some((member: any) => member.userId === c.userId)
    );

    for (const teamClient of teamClients) {
      sendToClient(teamClient.id, {
        type: "team_answer_finalized",
        teamId: teamId,
        questionId: questionId,
        finalAnswer: teamAnswer,
        message: "Team answer finalized by majority vote",
      });
    }
  } catch (error) {
    // Silent error handling
  }
}

// Handle team battle player disconnect - checks if entire team is offline
async function handleTeamBattlePlayerDisconnect(
  clientId: string,
  gameId: string,
  userId: number | undefined
) {

  const gameSession = gameSessions.get(gameId);
  if (!gameSession) {
    return;
  }

  if (gameSession.gameType !== "team_battle") {
    return;
  }

  if (!gameSession.teams) {
    return;
  }

  if (!userId || typeof userId !== 'number') {
    return;
  }

  const client = clients.get(clientId);
  if (!client) return;

  // ========================================================================
  // LIFECYCLE CHECK: If player already LEFT, skip entirely (idempotent)
  // ========================================================================
  if (hasPlayerLeft(gameId, userId)) {
    return;
  }

  // ========================================================================
  // CAPTURE team info BEFORE markPlayerAsLeft removes the player from members
  // ========================================================================
  const disconnectedTeam = gameSession.teams.find((team: any) =>
    team.members.some((member: any) => member.userId === userId)
  );

  if (!disconnectedTeam) {
    // Player not in any team — just do minimal cleanup
    await markPlayerAsLeft({ clientId, gameId, userId, reason: "disconnect_no_team" });
    return;
  }

  // Capture member info and captain status BEFORE removal
  const disconnectedMember = disconnectedTeam.members.find(
    (m: any) => m.userId === userId
  );
  const isCaptainDisconnect = disconnectedTeam.captainId === userId;
  const disconnectedTeamId = disconnectedTeam.id;
  const disconnectedTeamName = disconnectedTeam.name;

  // ========================================================================
  // LIFECYCLE TRANSITION: ACTIVE → LEFT (centralized, permanent)
  // This removes the player from memory maps, clears client state, broadcasts.
  // Must happen BEFORE captain/team logic so member arrays are already updated.
  // ========================================================================
  await markPlayerAsLeft({ clientId, gameId, userId, reason: "mid_game_disconnect" });

  try {
    if (isCaptainDisconnect) {
      // FIRST: Notify same-team members that the captain disconnected (before captain change)
      await notifySameTeamOfDisconnect(
        gameId,
        disconnectedTeam,
        disconnectedMember?.username || "Unknown Player",
        userId
      );

      // Find another connected team member
      const connectedTeamMembers = disconnectedTeam.members.filter((member: any) => {
        const memberClient = Array.from(clients.values()).find(
          (c: Client) => c.userId === member.userId && c.gameId === gameId &&
            c.ws && c.ws.readyState === WebSocket.OPEN
        );
        return memberClient;
      });

      if (connectedTeamMembers.length > 0) {
        // Assign new captain (first connected member)
        const newCaptain = connectedTeamMembers[0];

        // Update in-memory team
        disconnectedTeam.captainId = newCaptain.userId;

        // Update database
        if (disconnectedTeam.teamBattleId && disconnectedTeam.teamSide) {
          const updateField = disconnectedTeam.teamSide === "A" ? "teamACaptainId" : "teamBCaptainId";
          await database.updateTeamBattle(disconnectedTeam.teamBattleId, {
            [updateField]: newCaptain.userId
          });
        }

        // SECOND: Notify team members about new captain (after teammate disconnect notification)
        // Add a small delay to ensure teammate_disconnected notification is processed first
        await new Promise(resolve => setTimeout(resolve, 100));

        const teamClients = Array.from(clients.values()).filter(
          (c: Client) => disconnectedTeam.members.some((m: any) => m.userId === c.userId)
        );

        for (const client of teamClients) {
          sendToClient(client.id, {
            type: "captain_changed",
            teamId: disconnectedTeam.id,
            newCaptainId: newCaptain.userId,
            newCaptainName: newCaptain.username,
            reason: "Previous captain disconnected"
          });
        }

        // Auto-finalize answer if all members have answered AND the battle is still active
        const currentQuestion = gameSession.questions?.[gameSession.currentQuestionIndex || 0];
        const isBattleActive = gameSession.status === "playing" &&
          gameSession.currentQuestionIndex !== undefined &&
          gameSession.currentQuestionIndex < (gameSession.questions?.length || 0);

        if (currentQuestion && isBattleActive && (gameSession as any).phase !== "toss") {
          const questionId = currentQuestion.id;
          const memberAnswers = disconnectedTeam.memberAnswers?.[questionId] || {};
          const teamAlreadyFinalized = disconnectedTeam.finalAnswers?.some(
            (fa: any) => fa.questionId === questionId
          );

          if (!teamAlreadyFinalized && Object.keys(memberAnswers).length === disconnectedTeam.members.length) {
            // All members have answered, finalize
            const answerCounts: Record<string, number> = {};
            Object.values(memberAnswers).forEach((answer: any) => {
              const answerId = answer.answerId;
              answerCounts[answerId] = (answerCounts[answerId] || 0) + 1;
            });

            let finalAnswerId = "";
            let maxVotes = 0;
            for (const [answerId, votes] of Object.entries(answerCounts)) {
              if (votes > maxVotes) {
                maxVotes = votes;
                finalAnswerId = answerId;
              }
            }

            const teamAnswer = {
              questionId: questionId,
              answerId: finalAnswerId,
              isCorrect: false, // Will be determined later
              timeSpent: 0,
              submittedBy: disconnectedTeam.captainId,
            };

            const existingFinalAnswers = disconnectedTeam.finalAnswers || [];
            disconnectedTeam.finalAnswers = [...existingFinalAnswers, teamAnswer];

            // Notify team members
            const teamClients = Array.from(clients.values()).filter(
              (c: Client) => disconnectedTeam.members.some((m: any) => m.userId === c.userId)
            );

            for (const client of teamClients) {
              sendToClient(client.id, {
                type: "team_answer_finalized",
                teamId: disconnectedTeam.id,
                questionId: questionId,
                finalAnswer: teamAnswer,
                message: "Team answer finalized by majority vote",
              });
            }
          }
        }

        // Send updated teams to all clients in the session
        // Prefer in-memory `gameSession.teams` (authoritative and immediate) to avoid
        // DB read/write races between markPlayerAsLeft and DB reads. Fall back to DB
        // helper only if in-memory data is missing.
        const sessionIdForTeams = gameId; // gameId IS the session id for team battles
        let updatedTeams: any[] = [];
        if (gameSession && Array.isArray(gameSession.teams) && gameSession.teams.length > 0) {
          // shallow-serialize in-memory teams to avoid sharing mutable objects
          updatedTeams = JSON.parse(JSON.stringify(gameSession.teams));
        } else {
          updatedTeams = await getTeamsForTeamBattleSession(sessionIdForTeams);
        }

        const allClientsInSession = Array.from(clients.values()).filter(
          (c: Client) =>
            c.gameId === gameId ||
            (c.userId &&
              updatedTeams.some((team) =>
                team.members.some((m: any) => m.userId === c.userId)
              ))
        );

        for (const sessionClient of allClientsInSession) {
          sendToClient(sessionClient.id, {
            type: "teams_updated",
            teams: updatedTeams,
            gameSessionId: sessionIdForTeams,
          });
        }
      } else {
        // No connected team members left after captain disconnect - entire team is offline
        // Declare opponent as winner immediately
        const opposingTeam = gameSession.teams?.find(
          (t: any) => t.id !== disconnectedTeamId
        );

        if (opposingTeam) {
          await declareTeamBattleWinner(
            gameId,
            opposingTeam,
            `Opponent team (${disconnectedTeamName}) has disconnected - all members left`
          );
          return; // Exit early since battle is ended
        }
      }
    }

    // Get remaining team members' client connections (player already removed by markPlayerAsLeft)
    const teamClientConnections = Array.from(clients.values()).filter(
      (c: Client) =>
        c.gameId === gameId &&
        disconnectedTeam.members.some((m: any) => m.userId === c.userId)
    );

    // Check if ENTIRE team is now offline (remaining members after the leave)
    const allTeamMembersOffline =
      teamClientConnections.length === 0 ||
      teamClientConnections.every(
        (c: Client) =>
          !c.ws ||
          c.ws.readyState === WebSocket.CLOSED ||
          c.ws.readyState === WebSocket.CLOSING
      );

    if (allTeamMembersOffline) {
      // Entire team is offline - declare winner
      const opposingTeam = gameSession.teams?.find(
        (t: any) => t.id !== disconnectedTeamId
      );

      if (opposingTeam) {
        await declareTeamBattleWinner(
          gameId,
          opposingTeam,
          `Opponent team (${disconnectedTeamName}) has disconnected`
        );
      }
    } else {
      // Only one player disconnected - notify both opposing team AND same-team members
      const opposingTeam = gameSession.teams?.find(
        (t: any) => t.id !== disconnectedTeamId
      );

      // Notify opposing team about partial disconnect
      if (opposingTeam) {
        await notifyOpponentTeamOfDisconnect(
          gameId,
          opposingTeam,
          disconnectedMember?.username || "Unknown Player",
          disconnectedTeamName
        );
      }

      // Notify same-team members about teammate disconnect
      if (!isCaptainDisconnect) {
        await notifySameTeamOfDisconnect(
          gameId,
          disconnectedTeam,
          disconnectedMember?.username || "Unknown Player",
          userId
        );
      }
    }
  } catch (error) {
    console.error(`[handleTeamBattlePlayerDisconnect] Error:`, error);
  }
}

// Notify opposing team that an opponent player has disconnected
async function notifyOpponentTeamOfDisconnect(
  gameId: string,
  opposingTeam: any,
  disconnectedPlayerName: string,
  disconnectedTeamName: string
) {
  try {
    const opposingTeamClients = Array.from(clients.values()).filter(
      (c: Client) =>
        c.gameId === gameId &&
        opposingTeam.members.some((m: any) => m.userId === c.userId)
    );

    const message = `⚠️ ${disconnectedPlayerName} from team ${disconnectedTeamName} has disconnected!`;

    for (const client of opposingTeamClients) {
      sendToClient(client.id, {
        type: "opponent_team_member_disconnected",
        gameId: gameId,
        disconnectedPlayerName: disconnectedPlayerName,
        disconnectedTeamName: disconnectedTeamName,
        message: message,
        severity: "warning",
        timestamp: new Date(),
      });
    }
  } catch (error) {
    // Silent error handling
  }
}

// Notify same-team members and captain that a teammate has disconnected
async function notifySameTeamOfDisconnect(
  gameId: string,
  disconnectedTeam: any,
  disconnectedPlayerName: string,
  disconnectedUserId: number | undefined
) {
  try {
    // Get all connected same-team members (excluding the disconnected user)
    const sameTeamClients = Array.from(clients.values()).filter(
      (c: Client) =>
        c.gameId === gameId &&
        disconnectedTeam.members.some((m: any) => m.userId === c.userId && m.userId !== disconnectedUserId) &&
        c.ws &&
        c.ws.readyState === WebSocket.OPEN
    );

    const message = `⚠️ ${disconnectedPlayerName} from your team has disconnected!`;

    for (const client of sameTeamClients) {
      sendToClient(client.id, {
        type: "teammate_disconnected",
        gameId: gameId,
        disconnectedPlayerName: disconnectedPlayerName,
        teamName: disconnectedTeam.name,
        message: message,
        severity: "warning",
        timestamp: new Date(),
      });
    }
  } catch (error) {
    // Silent error handling
  }
}

// Declare winner when opposing team becomes completely unavailable
async function declareTeamBattleWinner(
  gameId: string,
  winningTeam: any,
  reason: string
) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession || !gameSession.teams) return;

  try {
    // Clear any pending question timeouts
    if ((gameSession as any).questionTimeout) {
      clearTimeout((gameSession as any).questionTimeout);
      delete (gameSession as any).questionTimeout;
    }

    // Prepare final scores
    const finalScores = gameSession.teams
      .map((t: any) => ({
        teamId: t.id,
        teamName: t.name,
        score: t.score || 0,
        correctAnswers: t.correctAnswers || 0,
        incorrectAnswers: t.incorrectAnswers || 0,
      }))
      .sort((a: any, b: any) => b.score - a.score);

    // Send results to all players
    const gameClients = Array.from(clients.values()).filter(
      (c: Client) => c.gameId === gameId
    );

    // Declaring winner

    for (const client of gameClients) {
      const player = gameSession.players.find(
        (p: Player) => p.userId === client.userId
      );
      const isWinner = player?.teamId === winningTeam.id;

      sendToClient(client.id, {
        type: "team_battle_ended_opponent_disconnect",
        gameId: gameId,
        winnerTeamId: winningTeam.id,
        winnerTeamName: winningTeam.name,
        yourTeamId: player?.teamId,
        isWinner: isWinner,
        reason: reason,
        message: isWinner
          ? `🎉 Victory! Opponent team disconnected - ${winningTeam.name} wins!`
          : `❌ Defeat! Opponent team disconnected - ${winningTeam.name} wins!`,
        finalScores: finalScores,
        timestamp: new Date(),
      });

      // Clear gameId
      client.gameId = undefined;
    }

    // Update database with final results
    for (const team of gameSession.teams) {
      if (team.teamBattleId) {
        const finalScore = finalScores.find((s: any) => s.teamId === team.id);
        // Update battle status to finished first
        await database.updateTeamBattle(team.teamBattleId, {
          status: "finished",
          finishedAt: new Date(),
        });

        // CENTRALIZED: Use resetBattleState for ready state cleanup
        // Note: We don't delete the battle or change status (already set to "finished" above)
        await resetBattleState({
          battleId: team.teamBattleId,
          reason: "battle_end",
          deleteBattle: false,
          // Don't set newStatus since we already set it to "finished"
        });
      }
    }

    // CRITICAL FIX: Remove REMAINING team members from activeTeamMemberships cache
    // LIFECYCLE GUARD: Skip players who have already LEFT (they may have joined a NEW team)
    const removedUserIds: number[] = [];
    const leftPlayersWin = gameSession.leftPlayerIds || new Set<number>();
    for (const team of gameSession.teams) {
      if (team.members && Array.isArray(team.members)) {
        for (const member of team.members) {
          if (member.userId && typeof member.userId === 'number' && !leftPlayersWin.has(member.userId)) {
            activeTeamMemberships.delete(member.userId);
            removedUserIds.push(member.userId);
          } else if (member.userId && leftPlayersWin.has(member.userId)) {
          }
        }
      }
    }
    if (leftPlayersWin.size > 0) {
    }

    // Clean up game session
    gameSessions.delete(gameId);

    // CRITICAL FIX: Broadcast online status update so all clients see updated available opponents
    setTimeout(async () => {
      try {
        await broadcastOnlineStatusUpdate();
      } catch (error) {
        console.error(`[declareTeamBattleWinner] Error broadcasting online status update:`, error);
        // Retry once after a short delay
        setTimeout(async () => {
          try {
            await broadcastOnlineStatusUpdate();
          } catch (retryError) {
            console.error(`[declareTeamBattleWinner] Retry failed:`, retryError);
          }
        }, 500);
      }
    }, 300);
  } catch (error) {
    // Silent error handling

    // Still notify players even if database update fails
    const gameClients = Array.from(clients.values()).filter(
      (c: Client) => c.gameId === gameId
    );

    for (const client of gameClients) {
      sendToClient(client.id, {
        type: "team_battle_ended_opponent_disconnect",
        gameId: gameId,
        message: "Battle ended due to opponent disconnect",
        error: true,
        timestamp: new Date(),
      });
      client.gameId = undefined;
    }

    // CRITICAL FIX: Even on error, try to clean up memberships and broadcast
    // LIFECYCLE GUARD: Skip players who have already LEFT
    const removedUserIdsOnError: number[] = [];
    const leftPlayersOnWinError = gameSession.leftPlayerIds || new Set<number>();
    try {
      for (const team of gameSession.teams || []) {
        if (team.members && Array.isArray(team.members)) {
          for (const member of team.members) {
            if (member.userId && typeof member.userId === 'number' && !leftPlayersOnWinError.has(member.userId)) {
              activeTeamMemberships.delete(member.userId);
              removedUserIdsOnError.push(member.userId);
            }
          }
        }
      }
      // Broadcast with retry on error
      setTimeout(async () => {
        try {
          await broadcastOnlineStatusUpdate();
        } catch (cleanupError) {
          console.error(`[declareTeamBattleWinner] Error broadcasting in cleanup:`, cleanupError);
        }
      }, 100);
    } catch (cleanupError) {
      console.error(`[declareTeamBattleWinner] Error during cleanup:`, cleanupError);
    }

    gameSessions.delete(gameId);
  }
}

// Debug helper: force-end a team battle (dev-only)
export async function debugForceEndTeamBattle(
  gameId: string,
  winningTeamId?: string
) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) {
    return { ok: false, message: "game_not_found" };
  }

  if (!gameSession.teams || gameSession.teams.length === 0) {
    return { ok: false, message: "no_teams" };
  }

  const winningTeam =
    (winningTeamId && gameSession.teams.find((t: any) => t.id === winningTeamId)) ||
    gameSession.teams[0];

  if (!winningTeam) {
    return { ok: false, message: "winning_team_not_found" };
  }

  try {
    await declareTeamBattleWinner(
      gameId,
      winningTeam,
      `Force-ended via debug endpoint`
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Debug helper: list active game session IDs (dev/admin)
export function listActiveGameSessions() {
  try {
    return Array.from(gameSessions.keys());
  } catch (error) {
    return [];
  }
}

// Handle reconnection and game state restoration (team-battle focused)
async function handleGetGameState(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId) return;

  try {
    // Require a gameSessionId for this simplified team-battle flow
    if (!event.gameSessionId) {
      sendToClient(clientId, {
        type: "no_active_game",
        message: "No active team or game found",
      });
      await broadcastOnlineStatusUpdate();
      return;
    }

    // Fetch all teams for this specific session (derived from team battles)
    const sessionTeams = await getTeamsForTeamBattleSession(event.gameSessionId);

    if (!sessionTeams || sessionTeams.length === 0) {
      sendToClient(clientId, {
        type: "no_active_game",
        message: "No active team or game found",
      });
      await broadcastOnlineStatusUpdate();
      return;
    }

    // Derive the user's team from this session (fallback to first team if not found)
    const userTeam =
      sessionTeams.find((team) =>
        team.members.some((member: any) => member.userId === client.userId)
      ) || sessionTeams[0];

    const opposingTeam = sessionTeams.find((team) => team.id !== userTeam.id);

    // Send basic team state back to the client (do not change gameId yet)
    sendToClient(clientId, {
      type: "game_state_restored",
      team: userTeam,
      gameSessionId: userTeam.gameSessionId,
      message: "Reconnected to your team",
    });

    // Also send full teams list so client can derive player/opponent
    sendToClient(clientId, {
      type: "teams_updated",
      gameSessionId: userTeam.gameSessionId,
      teams: sessionTeams,
    });

    // For team battles, find the active battle session that includes these teams
    const battleSession = Array.from(gameSessions.values()).find(
      (session) =>
        session.gameType === "team_battle" &&
        session.teams &&
        session.teams.some((t: any) => t.id === userTeam.id)
    );

    if (battleSession) {
      // Always associate this client with the active team battle session so that
      // future team_battle_question broadcasts (which target gameId) reach it.
      client.gameId = battleSession.id;
      client.gameSessionId = event.gameSessionId;

      // Determine game phase based on battle status
      let gamePhase: "waiting" | "ready" | "playing" | "question" | "results" | "finished" = "waiting";
      if (battleSession.status === "playing") {
        gamePhase = "playing";
      } else if (battleSession.status === "finished") {
        gamePhase = "finished";
      }

      // CRITICAL FIX: If battle is playing but questions aren't loaded yet, send team_battle_started
      // instead of trying to send a question that doesn't exist
      if (battleSession.status === "playing" && (!battleSession.questions || battleSession.questions.length === 0)) {
        sendToClient(clientId, {
          type: "team_battle_started",
          gameId: battleSession.id,
          gameSessionId: event.gameSessionId,
          teams: battleSession.teams || sessionTeams,
          message: "Team battle has begun! Loading questions...",
        });
        // Also send game state update
        sendToClient(clientId, {
          type: "game_state_update",
          gameState: {
            phase: "playing",
            teams: battleSession.teams || sessionTeams,
          },
          playerTeam: userTeam,
          opposingTeam: opposingTeam,
        });
        // CRITICAL: Don't return yet - wait a bit and check again for questions
        // This handles the case where questions are loading asynchronously
        setTimeout(() => {
          const retrySession = gameSessions.get(battleSession.id);
          if (retrySession && retrySession.questions && retrySession.questions.length > 0) {
            // Questions loaded - send current question
            const currentIndex = retrySession.currentQuestionIndex || 0;
            const currentQuestion = retrySession.questions[currentIndex];
            if (currentQuestion) {
              const questionNumber = currentIndex + 1;
              const isTeamATurn = questionNumber % 2 === 1;
              const answeringTeam = retrySession.teams?.find((team: any) => {
                if (team.teamSide) {
                  return isTeamATurn ? team.teamSide === "A" : team.teamSide === "B";
                }
                return false;
              }) || (isTeamATurn ? retrySession.teams?.[0] : retrySession.teams?.[1]);

              const opposingTeam = retrySession.teams?.find((team: any) => team.id !== answeringTeam?.id);
              const isYourTurn = userTeam && userTeam.id === answeringTeam?.id;

              // Choose event type based on session mode/gameType to avoid emitting both pipelines
              if ((retrySession as any).mode === "rapid_fire" || (retrySession as any).gameType === "rapid_fire") {
                sendToClient(
                  clientId,
                  buildRapidFireQuestionReconnectEvent(
                    retrySession,
                    retrySession.id,
                    currentQuestion,
                    questionNumber,
                    retrySession.questions.length,
                    userTeam.id,
                    {
                      isYourTurn: isYourTurn || false,
                      answeringTeamName: answeringTeam?.name,
                      opposingTeamName: opposingTeam?.name,
                    }
                  )
                );
              } else {
                sendToClient(clientId, {
                  type: "team_battle_question",
                  gameId: retrySession.id,
                  question: currentQuestion,
                  questionNumber: questionNumber,
                  totalQuestions: retrySession.questions.length,
                  teamId: userTeam.id,
                  timeLimit: 15000,
                  isYourTurn: isYourTurn || false,
                  answeringTeamName: answeringTeam?.name,
                  opposingTeamName: opposingTeam?.name,
                });
              }
            }
          }
        }, 2000); // Wait 2 seconds for questions to load
        return; // Don't try to send question yet
      }

      const isRapidFireSession =
        (battleSession as any).mode === "rapid_fire" ||
        (battleSession as any).gameType === "rapid_fire";

      // Send complete game state update
      sendToClient(clientId, {
        type: "game_state_update",
        gameState: {
          phase: gamePhase,
          teams: battleSession.teams || sessionTeams,
          currentQuestion: battleSession.questions?.[battleSession.currentQuestionIndex || 0],
          questionNumber: (battleSession.currentQuestionIndex || 0) + 1,
          totalQuestions: battleSession.questions?.length || 0,
          ...(isRapidFireSession
            ? { mode: "rapid_fire", gameType: "rapid_fire" }
            : {}),
        },
        playerTeam: userTeam,
        opposingTeam: opposingTeam,
      });

      if (battleSession.questions && battleSession.questions.length > 0) {
        const currentIndex = battleSession.currentQuestionIndex || 0;
        const currentQuestion = battleSession.questions[currentIndex];

        if (currentQuestion && battleSession.status === "playing") {
          // Determine which team should answer this question
          const questionNumber = currentIndex + 1;
          const isTeamATurn = questionNumber % 2 === 1;
          const answeringTeam = battleSession.teams?.find((team: any) => {
            if (team.teamSide) {
              return isTeamATurn ? team.teamSide === "A" : team.teamSide === "B";
            }
            return false;
          }) || (isTeamATurn ? battleSession.teams?.[0] : battleSession.teams?.[1]);

          const opposingTeam = battleSession.teams?.find((team: any) => team.id !== answeringTeam?.id);
          const isYourTurn = userTeam && userTeam.id === answeringTeam?.id;

          // Send current question if battle is active
          if ((battleSession as any).mode === "rapid_fire" || (battleSession as any).gameType === "rapid_fire") {
            sendToClient(
              clientId,
              buildRapidFireQuestionReconnectEvent(
                battleSession,
                battleSession.id,
                currentQuestion,
                questionNumber,
                battleSession.questions.length,
                userTeam.id,
                {
                  isYourTurn: isYourTurn || false,
                  answeringTeamName: answeringTeam?.name,
                  opposingTeamName: opposingTeam?.name,
                }
              )
            );
          } else {
            sendToClient(clientId, {
              type: "team_battle_question",
              gameId: battleSession.id,
              question: currentQuestion,
              questionNumber: questionNumber,
              totalQuestions: battleSession.questions.length,
              teamId: userTeam.id,
              timeLimit: 15000,
              isYourTurn: isYourTurn || false,
              answeringTeamName: answeringTeam?.name,
              opposingTeamName: opposingTeam?.name,
            });
          }
        }
      }
    }

    // Update availability status
    await broadcastOnlineStatusUpdate();
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to restore game state",
    });
  }
}

// Handle team rejoin after disconnection
async function handleRejoinTeam(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamId) return;

  try {
    const team = await database.getTeam(event.teamId);
    if (!team) {
      sendToClient(clientId, {
        type: "error",
        message: "Team not found",
      });
      return;
    }

    // Verify user is a member of this team
    const isMember = team.members.some(
      (member) => member.userId === client.userId
    );
    if (!isMember) {
      sendToClient(clientId, {
        type: "error",
        message: "You are not a member of this team",
      });
      return;
    }

    // Update client game session
    client.gameId = team.gameSessionId;

    sendToClient(clientId, {
      type: "team_rejoined",
      team: team,
      gameSessionId: team.gameSessionId,
      message: "Successfully rejoined your team",
    });

    // Notify other team members of reconnection
    const teamClients = Array.from(clients.values()).filter(
      (c) =>
        c.userId !== client.userId &&
        team.members.some((member) => member.userId === c.userId)
    );

    for (const teamClient of teamClients) {
      sendToClient(teamClient.id, {
        type: "team_member_reconnected",
        memberName: client.playerName || "Team Member",
        teamId: team.id,
      });
    }

    // Update availability status
    await broadcastOnlineStatusUpdate();
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to rejoin team",
    });
  }
}

async function handleDeclineTeamInvitation(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.invitation?.id) return;

  try {
    const invitation = await database.getTeamInvitation(event.invitation.id);
    if (!invitation) {
      sendToClient(clientId, {
        type: "error",
        message: "Invitation not found",
      });
      return;
    }

    if (invitation.inviteeId !== client.userId) {
      sendToClient(clientId, {
        type: "error",
        message: "You are not the recipient of this invitation",
      });
      return;
    }

    if (invitation.status !== "pending") {
      sendToClient(clientId, {
        type: "error",
        message: "Invitation is no longer valid",
      });
      return;
    }

    // Update invitation status
    await database.updateTeamInvitation(invitation.id, { status: "declined" });

    // Notify inviter
    sendToUser(invitation.inviterId, {
      type: "invitation_declined",
      message: `${client.playerName} has declined your team invitation`,
      inviterName: client.playerName,
      inviteeId: invitation.inviteeId,
      invitationId: invitation.id,
      invitationType: invitation.invitationType,
    });

    // Notify invitee
    sendToClient(clientId, {
      type: "invitation_declined_confirmed",
      message: "Invitation declined successfully",
    });
  } catch (error) {
    // Silent error handling
    sendToClient(clientId, {
      type: "error",
      message: "Failed to decline invitation",
    });
  }
}


// Handle player leaving team battle (intentional leave or page unload)
async function handlePlayerLeavingTeamBattle(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId) return;

  const { gameSessionId, userId, username } = event;
  if (!gameSessionId || !userId) return;

  try {
    const gameSession = gameSessions.get(gameSessionId);
    if (!gameSession || gameSession.gameType !== "team_battle") {
      return;
    }

    if (!gameSession.teams) {
      return;
    }

    // ========================================================================
    // LIFECYCLE CHECK: If player already LEFT, skip entirely (idempotent)
    // ========================================================================
    if (hasPlayerLeft(gameSessionId, userId)) {
      return;
    }

    // ========================================================================
    // CAPTURE team info BEFORE markPlayerAsLeft removes the player
    // ========================================================================
    const leavingTeam = gameSession.teams.find((team: any) =>
      team.members.some((member: any) => member.userId === userId)
    );

    if (!leavingTeam) {
      // Player not in any team — just do minimal cleanup
      await markPlayerAsLeft({ clientId, gameId: gameSessionId, userId, reason: "intentional_leave_no_team" });
      return;
    }

    const isCaptainLeave = leavingTeam.captainId === userId;
    const leavingMemberName = leavingTeam.members.find((m: any) => m.userId === userId)?.username || username || "Unknown Player";
    const leavingTeamId = leavingTeam.id;
    const leavingTeamName = leavingTeam.name;

    // ========================================================================
    // LIFECYCLE TRANSITION: ACTIVE → LEFT (centralized, permanent)
    // ========================================================================
    await markPlayerAsLeft({ clientId, gameId: gameSessionId, userId, reason: "intentional_leave" });

    // Captain transfer (if needed) — uses REMAINING members (after removal)
    if (isCaptainLeave) {
      const connectedTeamMembers = leavingTeam.members.filter((member: any) => {
        const memberClient = Array.from(clients.values()).find(
          (c: Client) => c.userId === member.userId && c.gameId === gameSessionId &&
            c.ws && c.ws.readyState === WebSocket.OPEN
        );
        return memberClient;
      });

      if (connectedTeamMembers.length > 0) {
        const newCaptain = connectedTeamMembers[0];
        leavingTeam.captainId = newCaptain.userId;

        if (leavingTeam.teamBattleId && leavingTeam.teamSide) {
          const updateField = leavingTeam.teamSide === "A" ? "teamACaptainId" : "teamBCaptainId";
          await database.updateTeamBattle(leavingTeam.teamBattleId, {
            [updateField]: newCaptain.userId
          });
        }

        const teamClients = Array.from(clients.values()).filter(
          (c: Client) => leavingTeam.members.some((m: any) => m.userId === c.userId)
        );

        for (const teamClient of teamClients) {
          sendToClient(teamClient.id, {
            type: "captain_changed",
            teamId: leavingTeamId,
            newCaptainId: newCaptain.userId,
            newCaptainName: newCaptain.username,
            reason: "Captain left the game"
          });
        }

        const updatedTeams = await getTeamsForTeamBattleSession(gameSessionId);
        const allClientsInSession = Array.from(clients.values()).filter(
          (c: Client) => c.gameId === gameSessionId || (c.userId && updatedTeams.some(team => team.members.some((m: any) => m.userId === c.userId)))
        );

        for (const sessionClient of allClientsInSession) {
          sendToClient(sessionClient.id, {
            type: "teams_updated",
            teams: updatedTeams,
            gameSessionId: gameSessionId
          });
        }
      }
    }

    // Check if ENTIRE team is now offline (remaining members after the leave)
    const teamClientConnections = Array.from(clients.values()).filter(
      (c: Client) =>
        c.gameId === gameSessionId &&
        leavingTeam.members.some((m: any) => m.userId === c.userId)
    );

    const allTeamMembersOffline =
      teamClientConnections.length === 0 ||
      teamClientConnections.every(
        (c: Client) =>
          !c.ws ||
          c.ws.readyState === WebSocket.CLOSED ||
          c.ws.readyState === WebSocket.CLOSING
      );

    if (allTeamMembersOffline) {
      // Entire team offline — declare winner
      const opposingTeam = gameSession.teams?.find(
        (t: any) => t.id !== leavingTeamId
      );

      if (opposingTeam) {
        // Mark ALL remaining team members as LEFT too (team is gone)
        for (const member of leavingTeam.members) {
          if (member.userId && typeof member.userId === 'number') {
            // Find their client connection
            const memberConnections = userConnections.get(member.userId) || [];
            const memberClientId = memberConnections[0] || clientId;
            markPlayerAsLeft({ clientId: memberClientId, gameId: gameSessionId, userId: member.userId, reason: "team_fully_offline" });
          }
        }

        await declareTeamBattleWinner(
          gameSessionId,
          opposingTeam,
          `Opponent team (${leavingTeamName}) has left the battle`
        );
      }
    } else {
      // Only one player left — notify opposing team
      const opposingTeam = gameSession.teams?.find(
        (t: any) => t.id !== leavingTeamId
      );

      if (opposingTeam) {
        await notifyOpponentTeamOfDisconnect(
          gameSessionId,
          opposingTeam,
          leavingMemberName,
          leavingTeamName
        );
      }
    }
  } catch (error) {
    console.error(`[handlePlayerLeavingTeamBattle] Error:`, error);
  }
}
