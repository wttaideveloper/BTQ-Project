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
  winner?: any;
  answersReceived?: number;
  questionNumber?: number;
  isDraw?: boolean;
  totalMembers?: number;
  totalQuestions?: number;
  timeLimit?: number;
  yourTeam?: any;
  username?: string;
  teamBattleId?: string;
  teamSide?: "A" | "B";
  teamAReady?: boolean;
  teamBReady?: boolean;
  seconds?: number;
  newCaptainId?: number;
  newCaptainName?: string;
}

// Store active WebSocket clients
const clients: Map<string, Client> = new Map();

// Store active game sessions
const gameSessions: Map<
  string,
  {
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
  }
> = new Map();

// In-memory ready state for team battles (per battle, per side)
const teamBattleReadyState: Map<
  string,
  {
    teamAReady: boolean;
    teamBReady: boolean;
  }
> = new Map();

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
    } catch {}
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
      
      // Notify the user that their request expired
      sendToUser(userId, {
        type: "join_request_updated",
        joinRequestId: jr.id,
        status: "expired",
        teamId: jr.team_id || jr.teamId,
        requesterId: userId,
        message: "This join request has expired because you joined another team.",
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

    console.log(
      `[expireAllPendingRequestsAndInvitationsForUser] Expired ${pendingRequests.length} join requests and ${pendingInvitations.length} invitations for user ${userId}`
    );
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
const activeTeamMemberships: Map<number, string> = new Map(); // userId -> teamId

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
                console.log(`[Disconnect Grace Period] User ${client.userId} reconnected, cancelling disconnect`);
                pendingDisconnects.delete(clientId);
                return;
              }

              // User didn't reconnect - process the disconnect
              console.log(`[Disconnect Grace Period] Processing disconnect for user ${pendingDisconnect.userId} after grace period`);
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
                await database.deleteTeamBattle(battle.id);
                teamRemoved = true;

                // Notify all participants that the battle has been cancelled
                const participantIds = new Set<number>();
                if (battle.teamACaptainId) participantIds.add(battle.teamACaptainId);
                if (battle.teamBCaptainId) participantIds.add(battle.teamBCaptainId);
                for (const id of extractTeammateIds(battle.teamATeammates)) participantIds.add(id);
                for (const id of extractTeammateIds(battle.teamBTeammates)) participantIds.add(id);

                for (const userId of Array.from(participantIds)) {
                  if (userId !== disconnectUserId) {
                    sendToUser(userId, {
                      type: "team_battle_cancelled",
                      teamBattleId: battle.id,
                      gameSessionId: battle.gameSessionId,
                      reason: "Team A captain disconnected",
                      message: "The team battle has been cancelled because the Team A captain disconnected.",
                    });
                  }
                }
              } else if (battle.teamBCaptainId === disconnectUserId) {
                // Team B captain disconnected - remove Team B (optional)
                updatedBattle = await database.updateTeamBattle(battle.id, {
                  teamBCaptainId: null,
                  teamBName: null,
                  teamBTeammates: [],
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
                    disconnectedTeamName: battle.teamBName || 'Team B',
                    message: `⚠️ ${client.playerName || 'A player'} (Team B captain) has disconnected from team setup.`,
                    severity: "warning",
                    timestamp: new Date(),
                  });
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
          console.log(`[Disconnect Grace Period] Started grace period for user ${client.userId}, client ${clientId}`);
          // Don't process disconnect immediately - wait for grace period
        }
        
        if (client.gameId) {
          // Check if this is a team battle game
          const gameSession = gameSessions.get(client.gameId);

          if (gameSession?.gameType === "team_battle") {
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

  switch (event.type) {
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
      if (client.gameId && client.playerName) {
        handlePlayerLeave(clientId, client.gameId, client.playerName);
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
        console.log(`[Disconnect Grace Period] User ${userId} reconnected, cancelling pending disconnect for client ${pendingClientId}`);
        clearTimeout(pending.timeout);
        pending.cancelled = true;
        pendingDisconnects.delete(pendingClientId);
      }
    }

    // Replace connections list with current connection
    userConnections.set(userId, [clientId]);
    console.log(`[Socket Auth] User ${userId} authenticated with clientId ${clientId}`);
    console.log(`[Socket Auth] userConnections.get(${userId}):`, userConnections.get(userId));

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
      // Restore user's team context
      client.gameId = userTeam.gameSessionId;
      client.gameSessionId = userTeam.gameSessionId;
      
      // Cancel any pending disconnects for this user with this gameSessionId (they reconnected)
      for (const [pendingClientId, pending] of pendingDisconnects.entries()) {
        if (pending.userId === userId && pending.gameSessionId === userTeam.gameSessionId) {
          console.log(`[Disconnect Grace Period] User ${userId} reconnected with gameSessionId ${userTeam.gameSessionId}, cancelling pending disconnect for client ${pendingClientId}`);
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
async function broadcastOnlineStatusUpdate() {
  try {
    const onlineUsers = await database.getOnlineUsers();

    // Use the activeTeamMemberships cache for quick lookups
    const availableUsers = onlineUsers.filter(
      (user) => user.isOnline && !activeTeamMemberships.has(user.id)
    );

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
    const questions = await database.getRandomQuestions({
      category: category !== "All" ? category : undefined,
      difficulty: difficulty !== "All" ? difficulty : undefined,
      count: 10, // Standard 10 questions for challenges
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
      message: `${
        client.playerName || "Someone"
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
      message: `${
        client.playerName || challenger?.username || "Someone"
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
      message: `${
        client.playerName || challenger?.username || "Someone"
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
        message: `${
          client.playerName || "Your opponent"
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
  console.log(`[sendToUser] Sending to userId ${userId}, type: ${message.type}`);
  console.log(`[sendToUser] Found ${connections.length} connection(s) for user ${userId}`);
  console.log(`[sendToUser] Message:`, message);

  for (const clientId of connections) {
    console.log(`[sendToUser] Sending to clientId: ${clientId}`);
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
    console.log(`[sendToClient] Client ${clientId} not found`);
    return;
  }

  if (!client.ws) {
    console.log(`[sendToClient] Client ${clientId} has no websocket`);
    return;
  }

  if (client.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    client.ws.send(JSON.stringify(message));
    console.log(`[sendToClient] ✅ Successfully sent ${message.type} to client ${clientId}`);
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
    // Check if this is a team battle or regular team game
    const gameSession =
      (client.gameId && gameSessions.get(client.gameId)) ||
      (event.gameId && gameSessions.get(event.gameId)) ||
      null;
    const isTeamBattle = gameSession?.gameType === "team_battle";

    // Team-battle path: use in-memory teams derived from team_battles
    if (isTeamBattle && gameSession && gameSession.teams) {
      const sessionTeam = gameSession.teams.find(
        (t: any) => t.id === event.teamId
      );
      if (!sessionTeam) return;

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
    const currentGameSession = event.gameId
      ? gameSessions.get(event.gameId)
      : null;
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
          await database.deleteTeamBattle(leavingTeam.teamBattleId);
          
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
          await database.updateTeamBattle(leavingTeam.teamBattleId, {
            teamBCaptainId: null,
            teamBName: null,
            teamBTeammates: [],
          });
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
    for (const participantId of Array.from(sameTeamMemberIds)) {
      sendToUser(participantId, {
        type: "teammate_disconnected",
        gameSessionId: gameSessionId,
        disconnectedPlayerName: username || client.playerName || "A player",
        teamName: leavingTeam.name,
        message: `${username || client.playerName || "A player"} has left your team.`,
      });
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

    const gameSession =
      (client.gameId && gameSessions.get(client.gameId)) ||
      (event.gameId && gameSessions.get(event.gameId)) ||
      null;
    const isTeamBattle = gameSession?.gameType === "team_battle";

    if (isTeamBattle && gameSession && gameSession.teams) {
      const sessionTeam = gameSession.teams.find(
        (t: any) => t.id === event.teamId
      );
      if (!sessionTeam) return;

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
    const gameSession =
      (client.gameId && gameSessions.get(client.gameId)) ||
      (event.gameId && gameSessions.get(event.gameId)) ||
      null;
    const isTeamBattle = gameSession?.gameType === "team_battle";

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

      // If all teams in this battle have finalized an answer for this question,
      // immediately process and broadcast the results instead of waiting for
      // the question timeout.
      if (gameSession && gameSession.teams && gameSession.teams.length > 0) {
        const currentQuestionId = finalAnswer.questionId;
        const allTeamsFinalized = gameSession.teams.every((t: any) =>
          (t.finalAnswers || []).some(
            (fa: any) => fa.questionId === currentQuestionId
          )
        );

        if (allTeamsFinalized) {
          // Fixed: Clear timeout to prevent double processing when all teams answer early
          if (gameSession.questionTimeout) {
            clearTimeout(gameSession.questionTimeout);
            gameSession.questionTimeout = undefined;
          }
          await processTeamBattleAnswers(gameSession.id);
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

// Team battle ready handler (for new team_battles flow)
async function handleTeamBattleReady(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamBattleId || !event.teamSide) {
    return;
  }

  try {
    const battle = await database.getTeamBattle(event.teamBattleId);
    if (!battle) {
      return;
    }

    // Only the appropriate captain can mark their side as ready
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

    const current =
      teamBattleReadyState.get(battle.id) ||
      ({ teamAReady: false, teamBReady: false } as {
        teamAReady: boolean;
        teamBReady: boolean;
      });

    const wasBothReady = current.teamAReady && current.teamBReady;

    if (event.teamSide === "A") {
      current.teamAReady = true;
    } else if (event.teamSide === "B") {
      current.teamBReady = true;
    }

    teamBattleReadyState.set(battle.id, current);

    const bothReady = current.teamAReady && current.teamBReady;

    // Collect all participant userIds (captains + teammates)
    const participantIds = new Set<number>();
    participantIds.add(battle.teamACaptainId);
    if (battle.teamBCaptainId) {
      participantIds.add(battle.teamBCaptainId);
    }
    
    // Add all teammates from both teams
    for (const id of extractTeammateIds(battle.teamATeammates)) {
      participantIds.add(id);
    }
    for (const id of extractTeammateIds(battle.teamBTeammates)) {
      participantIds.add(id);
    }

    // Broadcast current ready status to all participants
    for (const userId of Array.from(participantIds)) {
      sendToUser(userId, {
        type: "team_ready_status",
        teamBattleId: battle.id,
        gameSessionId: battle.gameSessionId,
        teamAReady: current.teamAReady,
        teamBReady: current.teamBReady,
      });
    }

    // When both sides become ready (transition from not-both-ready -> both-ready),
    // broadcast a simple countdown event. For now this only drives UI; gameplay start
    // is handled separately.
    if (bothReady && !wasBothReady) {
      const countdownSeconds = 5;
      for (const userId of Array.from(participantIds)) {
        sendToUser(userId, {
          type: "team_battle_countdown",
          gameSessionId: battle.gameSessionId,
          seconds: countdownSeconds,
        });
      }

      // After the shared countdown completes, automatically start the team battle
      // using the existing start_team_battle flow so questions are delivered.
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
          } else {
            // No active captain client found
          }
        } catch (err) {
          // Silent error handling
        }
      }, countdownSeconds * 1000);
    }
  } catch (error) {
    // Silent error handling
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
  if (!client || !client.userId || !event.gameSessionId) return;

  try {
    // Get all teams in the session (derived from team battles)
    const allTeams = await getTeamsForTeamBattleSession(event.gameSessionId);
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

    // Use eligible teams instead of ready teams
    const readyTeams = eligibleTeams;

    // Check if user is a captain of one of the ready teams
    const userTeam = readyTeams.find(
      (team) => team.captainId === client.userId
    );
    if (!userTeam) {
      sendToClient(clientId, {
        type: "error",
        message: "Only team captains can start battles",
      });
      return;
    }

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

    // Create team battle game session
    gameSessions.set(gameId, {
      id: gameId,
      players: allPlayers,
      status: "playing",
      gameType: "team_battle",
      currentQuestionIndex: 0,
      questions: [],
      teams: readyTeams,
    });

    // Update all team members' client gameId and gameSessionId and notify battle start
    const gameClients = Array.from(clients.values()).filter((c) =>
      allPlayers.some((player) => player.userId === c.userId)
    );

    for (const gameClient of gameClients) {
      gameClient.gameId = gameId;
      gameClient.gameSessionId = event.gameSessionId;
      sendToClient(gameClient.id, {
        type: "team_battle_started",
        gameId: gameId,
        gameSessionId: event.gameSessionId,
        teams: readyTeams,
        message: "Team battle has begun!",
      });
    }

    // Update team statuses to playing
    for (const team of readyTeams) {
      team.status = "playing";
    }

    // Start delivering questions
    setTimeout(() => {
      startTeamBattleQuestions(gameId);
    }, 2000);
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
    console.log(`[TeamBattle] Starting to load questions for gameId: ${gameId}`);
    
    // Get questions for the battle using pure random selection (no filters)
    // so that we always have a set of questions regardless of category/difficulty.
    // Total 10 questions: Team A gets 5 (odd: 1,3,5,7,9), Team B gets 5 (even: 2,4,6,8,10)
    const questions = await database.getRandomQuestions({
      count: 10,
    });

    console.log(`[TeamBattle] Received ${questions?.length || 0} questions from database`);

    // Validate questions
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      console.error(`[TeamBattle] Invalid questions array for gameId: ${gameId}`);
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

    // Filter out any invalid questions
    const validQuestions = questions.filter(
      (q) => q && q.id && q.text && q.answers && Array.isArray(q.answers) && q.answers.length > 0
    );

    if (validQuestions.length === 0) {
      console.error(`[TeamBattle] No valid questions after filtering for gameId: ${gameId}`);
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

    if (validQuestions.length < 10) {
      console.warn(`[TeamBattle] Only ${validQuestions.length} valid questions available (requested 10) for gameId: ${gameId}`);
    }

    gameSession.questions = validQuestions;
    gameSession.currentQuestionIndex = 0;

    console.log(`[TeamBattle] Successfully loaded ${gameSession.questions.length} valid questions for gameId: ${gameId}, teams: ${gameSession.teams?.length || 0}`);

    // Send first question to the appropriate team (Team A for question 1)
    // Add a small delay to ensure all clients are ready
    setTimeout(() => {
      sendTeamBattleQuestion(gameId);
    }, 500);
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

  if (!gameSession.questions) {
    console.error(`[TeamBattle] Questions not initialized for gameId: ${gameId}`);
    return;
  }

  if (!gameSession.teams || gameSession.teams.length === 0) {
    console.error(`[TeamBattle] Teams not found for gameId: ${gameId}`);
    return;
  }

  const currentIndex = gameSession.currentQuestionIndex || 0;
  
  // Check if questions array is empty or invalid
  if (!gameSession.questions || gameSession.questions.length === 0) {
    console.error(`[TeamBattle] Questions array is empty for gameId: ${gameId}. Cannot send question.`);
    // Don't end battle - wait for questions to be loaded
    return;
  }
  
  const currentQuestion = gameSession.questions[currentIndex];
  
  if (!currentQuestion) {
    // Check if we've actually run out of questions or if there's an issue
    if (currentIndex >= gameSession.questions.length) {
      // Legitimately out of questions
      console.log(`[TeamBattle] All questions completed for gameId: ${gameId}. Index: ${currentIndex}, Total: ${gameSession.questions.length}`);
      endTeamBattle(gameId);
    } else {
      // Question missing at index - this is an error
      console.error(`[TeamBattle] Question missing at index ${currentIndex} for gameId: ${gameId}. Total questions: ${gameSession.questions.length}`);
      // Don't end battle - this might be a temporary issue
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
    console.log(`[TeamBattle] Using team order fallback. Question ${questionNumber}, isTeamATurn: ${isTeamATurn}, using team: ${answeringTeam.name}`);
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
    return;
  }

  // Send question info to both teams, but indicate whose turn it is
  const gameClients = Array.from(clients.values()).filter(
    (c) => c.gameId === gameId
  );

    // Ensure we send question to ALL clients in the game
    for (const client of gameClients) {
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
    
    console.log(`[TeamBattle] Sent question ${questionNumber} to ${gameClients.length} clients. Answering team: ${answeringTeam.name}`);

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

  const currentIndex = gameSession.currentQuestionIndex ?? 0;
  const currentQuestion = gameSession.questions[currentIndex];

  // Safety guard: if for any reason the current question or its answers
  // are missing, avoid crashing the server. This can happen if a timer
  // fires after the battle has been cleaned up or questions were not
  // initialized correctly.
  if (!currentQuestion || !Array.isArray((currentQuestion as any).answers)) {
    // Fixed: Notify clients about the error and end the battle gracefully
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

  // Send results to all players (both teams see the results)
  const gameClients = Array.from(clients.values()).filter(
    (c) => c.gameId === gameId
  );
  for (const client of gameClients) {
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
    });
  }

  // Move to next question or end battle
  gameSession.currentQuestionIndex =
    (gameSession.currentQuestionIndex || 0) + 1;

  if (gameSession.currentQuestionIndex >= gameSession.questions.length) {
    // Battle completed - give teams a moment to see final results
    console.log(`[TeamBattle] All questions completed for gameId: ${gameId}`);
    setTimeout(() => endTeamBattle(gameId), 3000);
  } else {
    // Next question - send after a brief delay to show results
    console.log(`[TeamBattle] Moving to question ${gameSession.currentQuestionIndex + 1} for gameId: ${gameId}`);
    setTimeout(() => {
      sendTeamBattleQuestion(gameId);
    }, 3000); // 3 seconds to show results before next question
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
        await database.updateTeamBattle(team.teamBattleId, {
          status: "finished",
          finishedAt: new Date(),
        });
      }
    }

    // Clean up game session
    gameSessions.delete(gameId);
  } catch (error) {
    // Silent error handling

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
    gameSessions.delete(gameId);
  }
}

async function autoFinalizeTeamAnswer(teamId: string, questionId: string) {
  try {
    // Get team from game session for memberAnswers
    let sessionTeam: any | null = null;
    for (const [, gameSession] of Array.from(gameSessions)) {
      if (gameSession.gameType === "team_battle" && gameSession.teams) {
        const found = gameSession.teams.find((t: any) => t.id === teamId);
        if (found) {
          sessionTeam = found;
          break;
        }
      }
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

  const client = clients.get(clientId);
  if (!client) return;

  // Teams found

  try {
    // Find which team the disconnected player belonged to
    const disconnectedTeam = gameSession.teams.find((team: any) =>
      team.members.some((member: any) => member.userId === userId)
    );

    if (!disconnectedTeam) {
      return;
    }

    // Disconnected team found

    // Check if disconnected player was the captain
    if (disconnectedTeam.captainId === userId) {
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

        // Notify team members about new captain
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

        if (currentQuestion && isBattleActive) {
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
        const gameSessionId = client.gameSessionId || gameId; // Use gameSessionId from client, fallback to gameId
        const updatedTeams = await getTeamsForTeamBattleSession(gameSessionId);
        const allClientsInSession = Array.from(clients.values()).filter(
          (c: Client) => c.gameId === gameId || (c.userId && updatedTeams.some(team => team.members.some((m: any) => m.userId === c.userId)))
        );

        for (const client of allClientsInSession) {
          sendToClient(client.id, {
            type: "teams_updated",
            teams: updatedTeams,
            gameSessionId: gameSessionId
          });
        }
      }
    }

    // Get all team members' client connections
    const teamClientConnections = Array.from(clients.values()).filter(
      (c: Client) =>
        c.gameId === gameId &&
        disconnectedTeam.members.some((m: any) => m.userId === c.userId)
    );

    // Team client connections check

    // Check if ENTIRE team is now offline
    const allTeamMembersOffline =
      teamClientConnections.length === 0 ||
      teamClientConnections.every(
        (c: Client) =>
          !c.ws ||
          c.ws.readyState === WebSocket.CLOSED ||
          c.ws.readyState === WebSocket.CLOSING
      );

    // All team members offline check

    if (allTeamMembersOffline) {
      // Entire team is offline - declare winner

      // Find opposing team (the other team in the battle)
      const opposingTeam = gameSession.teams.find(
        (t: any) => t.id !== disconnectedTeam.id
      );

      if (opposingTeam) {
        await declareTeamBattleWinner(
          gameId,
          opposingTeam,
          `Opponent team (${disconnectedTeam.name}) has disconnected`
        );
      }
    } else {
      // Only one player disconnected - notify opposing team
      const opposingTeam = gameSession.teams.find(
        (t: any) => t.id !== disconnectedTeam.id
      );

      if (opposingTeam) {
        const disconnectedMember = disconnectedTeam.members.find(
          (m: any) => m.userId === userId
        );

        // Notifying opponent about partial disconnect

        await notifyOpponentTeamOfDisconnect(
          gameId,
          opposingTeam,
          disconnectedMember?.username || "Unknown Player",
          disconnectedTeam.name
        );
      }
    }
  } catch (error) {
    // Silent error handling
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
        await database.updateTeamBattle(team.teamBattleId, {
          status: "finished",
          finishedAt: new Date(),
        });
      }
    }

    // Clean up game session
    gameSessions.delete(gameId);
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

      // Send complete game state update
      sendToClient(clientId, {
        type: "game_state_update",
        gameState: {
          phase: gamePhase,
          teams: battleSession.teams || sessionTeams,
          currentQuestion: battleSession.questions?.[battleSession.currentQuestionIndex || 0],
          questionNumber: (battleSession.currentQuestionIndex || 0) + 1,
          totalQuestions: battleSession.questions?.length || 0,
        },
        playerTeam: userTeam,
        opposingTeam: opposingTeam,
      });

      if (battleSession.questions && battleSession.questions.length > 0) {
        const currentIndex = battleSession.currentQuestionIndex || 0;
        const currentQuestion = battleSession.questions[currentIndex];

        if (currentQuestion && battleSession.status === "playing") {
          // Send current question if battle is active
          sendToClient(clientId, {
            type: "team_battle_question",
            gameId: battleSession.id,
            question: currentQuestion,
            questionNumber: currentIndex + 1,
            totalQuestions: battleSession.questions.length,
            teamId: userTeam.id,
            timeLimit: 15000, // Fixed: Changed from 30000 to 15000 to match frontend expectation
          });
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
    // Get the game session to check if it's a team battle
    const gameSession = gameSessions.get(gameSessionId);
    if (!gameSession || gameSession.gameType !== "team_battle") {
      return;
    }

    if (!gameSession.teams) {
      return;
    }

    // Find which team the leaving player belonged to
    const leavingTeam = gameSession.teams.find((team: any) =>
      team.members.some((member: any) => member.userId === userId)
    );

    if (!leavingTeam) {
      return;
    }

    // Leaving team found

    // Check if leaving player was the captain
    if (leavingTeam.captainId === userId) {
      // Find another connected team member
      const connectedTeamMembers = leavingTeam.members.filter((member: any) => {
        const memberClient = Array.from(clients.values()).find(
          (c: Client) => c.userId === member.userId && c.gameId === gameSessionId &&
            c.ws && c.ws.readyState === WebSocket.OPEN
        );
        return memberClient;
      });

      if (connectedTeamMembers.length > 0) {
        // Assign new captain (first connected member)
        const newCaptain = connectedTeamMembers[0];

        // Update in-memory team
        leavingTeam.captainId = newCaptain.userId;

        // Update database
        if (leavingTeam.teamBattleId && leavingTeam.teamSide) {
          const updateField = leavingTeam.teamSide === "A" ? "teamACaptainId" : "teamBCaptainId";
          await database.updateTeamBattle(leavingTeam.teamBattleId, {
            [updateField]: newCaptain.userId
          });
        }

        // Notify team members about new captain
        const teamClients = Array.from(clients.values()).filter(
          (c: Client) => leavingTeam.members.some((m: any) => m.userId === c.userId)
        );

        for (const client of teamClients) {
          sendToClient(client.id, {
            type: "captain_changed",
            teamId: leavingTeam.id,
            newCaptainId: newCaptain.userId,
            newCaptainName: newCaptain.username,
            reason: "Captain left the game"
          });
        }

        // Send updated teams
        const updatedTeams = await getTeamsForTeamBattleSession(gameSessionId);
        const allClientsInSession = Array.from(clients.values()).filter(
          (c: Client) => c.gameId === gameSessionId || (c.userId && updatedTeams.some(team => team.members.some((m: any) => m.userId === c.userId)))
        );

        for (const client of allClientsInSession) {
          sendToClient(client.id, {
            type: "teams_updated",
            teams: updatedTeams,
            gameSessionId: gameSessionId
          });
        }
      }
    }

    // Get all team members' client connections
    const teamClientConnections = Array.from(clients.values()).filter(
      (c: Client) =>
        c.gameId === gameSessionId &&
        leavingTeam.members.some((m: any) => m.userId === c.userId)
    );

    // Check if ENTIRE team is now offline (after intentional leave)
    const allTeamMembersOffline =
      teamClientConnections.length === 0 ||
      teamClientConnections.every(
        (c: Client) =>
          !c.ws ||
          c.ws.readyState === WebSocket.CLOSED ||
          c.ws.readyState === WebSocket.CLOSING
      );

    if (allTeamMembersOffline) {
      // Entire team left intentionally - declare winner
      const opposingTeam = gameSession.teams.find(
        (t: any) => t.id !== leavingTeam.id
      );

      if (opposingTeam) {
        await declareTeamBattleWinner(
          gameSessionId,
          opposingTeam,
          `Opponent team (${leavingTeam.name}) has left the battle`
        );
      }
    } else {
      // Only one player left - notify opposing team
      const opposingTeam = gameSession.teams.find(
        (t: any) => t.id !== leavingTeam.id
      );

      if (opposingTeam) {
        // Get the leaving member's name
        const leavingMember = leavingTeam.members.find(
          (m: any) => m.userId === userId
        );

        // Notify opposing team members
        await notifyOpponentTeamOfDisconnect(
          gameSessionId,
          opposingTeam,
          leavingMember?.username || username || "Unknown Player",
          leavingTeam.name
        );
      }
    }
  } catch (error) {
    // Silent error handling
  }
}
