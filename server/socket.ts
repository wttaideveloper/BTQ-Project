import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { v4 as uuidv4 } from "uuid";
import { database } from "./database";
import { Player, GameSession, Challenge, ChallengeResult, ChallengeAnswer, Question, Notification } from "@shared/schema";

interface Client {
  id: string;
  ws: WebSocket;
  gameId?: string;
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
  finalScores?: any[];
  timeLimit?: number;
  yourTeam?: any;
  reason?: string;
  username?: string;
}

// Store active WebSocket clients
const clients: Map<string, Client> = new Map();

// Store active game sessions
const gameSessions: Map<string, {
  id: string;
  players: Player[];
  status: "waiting" | "playing" | "finished";
  gameType: string; // 'realtime' or 'async' or 'team_battle'
  currentQuestionIndex?: number;
  questions?: any[];
  teams?: any[];
  category?: string;
  difficulty?: string;
}> = new Map();

// Store users' WebSocket connections for notifications
const userConnections: Map<number, string[]> = new Map();

// Store active team memberships for quick availability checking
const activeTeamMemberships: Map<number, string> = new Map(); // userId -> teamId

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = uuidv4();
    console.log(`New client connected: ${clientId}`);
    
    // Store client in map
    clients.set(clientId, { id: clientId, ws });

    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const event: GameEvent = JSON.parse(message.toString());
        handleGameEvent(clientId, event);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    // Handle client disconnection
    ws.on('close', () => {
      const client = clients.get(clientId);
      if (client) {
        if (client.gameId) {
          // Remove player from game
          handlePlayerLeave(clientId, client.gameId, client.playerName || 'Unknown Player');
        }
        
        // Remove client from user connections map
        if (client.userId) {
          const connections = userConnections.get(client.userId) || [];
          const updatedConnections = connections.filter(id => id !== clientId);
          
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
      console.log(`Client disconnected: ${clientId}`);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      clientId,
      message: 'Connected to Bible Trivia Game Server'
    }));
  });

  return wss;
}

function handleGameEvent(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (event.type) {
    // Real-time multiplayer events
    case 'authenticate':
      handleAuthenticate(clientId, event);
      break;
    case 'join_game':
      handleJoinGame(clientId, event);
      break;
    case 'create_game':
      handleCreateGame(clientId, event);
      break;
    case 'start_game':
      handleStartGame(event.gameId!);
      break;
    case 'submit_answer':
      handleSubmitAnswer(clientId, event);
      break;
    case 'leave_game':
      if (client.gameId && client.playerName) {
        handlePlayerLeave(clientId, client.gameId, client.playerName);
      }
      break;
    
    // Asynchronous challenge events
    case 'create_challenge':
      handleCreateChallenge(clientId, event);
      break;
    case 'accept_challenge':
      handleAcceptChallenge(clientId, event);
      break;
    case 'decline_challenge':
      handleDeclineChallenge(clientId, event);
      break;
    case 'submit_challenge_answer':
      handleSubmitChallengeAnswer(clientId, event);
      break;
    case 'complete_challenge':
      handleCompleteChallenge(clientId, event);
      break;
    
    // Notification events
    case 'mark_notification_read':
      handleMarkNotificationRead(clientId, event);
      break;
    
    // Team-based multiplayer events
    case 'create_team':
      handleCreateTeam(clientId, event);
      break;
    case 'join_team':
      handleJoinTeam(clientId, event);
      break;
    case 'invite_to_team':
      handleInviteToTeam(clientId, event);
      break;
    case 'accept_team_invitation':
      handleAcceptTeamInvitation(clientId, event);
      break;
    case 'decline_team_invitation':
      handleDeclineTeamInvitation(clientId, event);
      break;
    case 'recruit_player':
      handleRecruitPlayer(clientId, event);
      break;
    case 'send_email_invitation':
      handleSendEmailInvitation(clientId, event);
      break;
    case 'submit_team_answer':
      handleSubmitTeamAnswer(clientId, event);
      break;
    case 'finalize_team_answer':
      handleFinalizeTeamAnswer(clientId, event);
      break;
    case 'team_ready':
      handleTeamReady(clientId, event);
      break;
    case 'start_team_battle':
      handleStartTeamBattle(clientId, event);
      break;
    case 'get_game_state':
      handleGetGameState(clientId, event);
      break;
    case 'rejoin_team':
      handleRejoinTeam(clientId, event);
      break;
      
    default:
      console.log(`Unknown event type: ${event.type}`);
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
    existingConnections.forEach(oldClientId => {
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

    // Replace connections list with current connection
    userConnections.set(userId, [clientId]);

    // Check if user is in any active team and restore their game state
    // Get all teams from all game sessions
    const allGameSessions = await database.getGameResults(); // This will help us find active sessions
    let userTeam = null;
    
    // Search through all possible game sessions for user's team
    const teamSearchPromises = [];
    const possibleSessions = ['test-session-fixes', 'multiplayer-session-1', 'team-battle-session', 'final-test-session'];
    
    for (const sessionId of possibleSessions) {
      teamSearchPromises.push(database.getTeamsByGameSession(sessionId));
    }
    
    // Also search for teams without specific session IDs
    teamSearchPromises.push(database.getTeamsByGameSession(''));
    
    const allTeamArrays = await Promise.all(teamSearchPromises);
    const allTeams = allTeamArrays.flat().filter(team => team); // Remove any null/undefined teams
    
    userTeam = allTeams.find(team => 
      team.members.some(member => member.userId === userId) &&
      (team.status === 'forming' || team.status === 'ready' || team.status === 'playing')
    );

    if (userTeam) {
      // Restore user's team context
      client.gameId = userTeam.gameSessionId;
      
      // Send team restoration data
      sendToClient(clientId, {
        type: 'team_state_restored',
        team: userTeam,
        gameSessionId: userTeam.gameSessionId,
        message: 'Reconnected to your team!'
      });

      // Get all teams in the session
      const allTeamsInSession = await database.getTeamsByGameSession(userTeam.gameSessionId);
      sendToClient(clientId, {
        type: 'teams_updated',
        gameSessionId: userTeam.gameSessionId,
        teams: allTeamsInSession
      });
    }

    // Update user's online status in the database (handle case where user might not exist)
    try {
      await database.setUserOnline(userId, true);
    } catch (error) {
      console.log(`User ${userId} not found in storage, skipping online status update`);
    }

    // Get user details for authentication response
    let username = event.username;
    if (!username) {
      try {
        const user = await database.getUser(userId);
        username = user?.username;
      } catch (error) {
        console.error('Error fetching user for authentication:', error);
      }
    }

    // Acknowledge authentication
    sendToClient(clientId, {
      type: 'authenticated',
      userId,
      username,
      message: 'Successfully authenticated'
    });

    // Broadcast user online status to all connected clients
    broadcastOnlineStatusUpdate();

    // Send any unread notifications
    sendUnreadNotifications(userId);
  } catch (error) {
    console.error('Error in handleAuthenticate:', error);
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
          type: 'notification',
          message: notification.message,
          notificationId: notification.id,
          challengeId: notification.challengeId
        });
      }
    }
  } catch (error) {
    console.error('Error sending unread notifications:', error);
  }
}

// Broadcast online status updates to all connected clients
async function broadcastOnlineStatusUpdate() {
  try {
    const onlineUsers = await database.getOnlineUsers();
    
    // Use the activeTeamMemberships cache for quick lookups
    const availableUsers = onlineUsers.filter(user => 
      user.isOnline && !activeTeamMemberships.has(user.id)
    );
    
    // Send updated online user list to all connected clients
    const allClientIds = Array.from(clients.keys());
    for (const clientId of allClientIds) {
      sendToClient(clientId, {
        type: 'online_users_updated',
        onlineUsers: availableUsers.map(user => ({
          id: user.id,
          username: user.username,
          isOnline: user.isOnline ?? false
        }))
      });
    }
  } catch (error) {
    console.error('Error broadcasting online status:', error);
  }
}

// Broadcast team updates to all clients in a game session
export async function broadcastTeamUpdates(gameSessionId: string) {
  try {
    console.log(`=== BROADCASTING TEAM UPDATES ===`);
    console.log(`Game Session ID: ${gameSessionId}`);
    
    const teams = await database.getTeamsByGameSession(gameSessionId);
    console.log(`Teams found: ${teams.length}`, teams.map(t => ({ id: t.id, name: t.name, captainId: t.captainId })));
    
    const event: GameEvent = {
      type: 'teams_updated',
      teams: teams
    };
    
    const connectedClients = Array.from(clients.values());
    console.log(`Total connected clients: ${connectedClients.length}`);
    
    let broadcastCount = 0;
    // Send to all clients that might be viewing this game session
    for (const client of connectedClients) {
      console.log(`Client ${client.id}: userId=${client.userId}, gameId=${client.gameId}, playerName=${client.playerName}`);
      // Send to authenticated clients (they might be on the team battle page)
      if (client.userId) {
        console.log(`Broadcasting to client ${client.id} (user ${client.userId})`);
        sendToClient(client.id, event);
        broadcastCount++;
      }
    }
    
    console.log(`Broadcasted team updates for session ${gameSessionId} to ${broadcastCount} connected clients`);
  } catch (error) {
    console.error('Failed to broadcast team updates:', error);
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
        allTeams.push(...teams.filter(team => 
          team.status === 'forming' || team.status === 'ready' || team.status === 'playing'
        ));
      } catch (error) {
        // Session might not exist, continue
      }
    }
    
    // As fallback, also check some recent sessions by checking recent team creation patterns
    // This handles cases where teams are created with unique session IDs
    const recentTimestamp = Date.now() - (10 * 60 * 1000); // Last 10 minutes
    const possibleSessionIds = [];
    
    // Try to get teams from storage using a broader approach
    // We'll iterate through possible session ID patterns
    for (let i = 0; i < 50; i++) {
      try {
        const testSessionId = `session-${recentTimestamp + i}`;
        const teams = await database.getTeamsByGameSession(testSessionId);
        if (teams.length > 0) {
          allTeams.push(...teams.filter(team => 
            team.status === 'forming' || team.status === 'ready' || team.status === 'playing'
          ));
        }
      } catch (error) {
        // Continue checking
      }
    }
    
    return allTeams;
  } catch (error) {
    console.error('Error getting active teams:', error);
    return [];
  }
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
      type: 'error',
      message: 'Game session not found'
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
    isReady: false
  };

  gameSession.players.push(player);

  // Notify all players in the game
  sendToGame(gameId, {
    type: 'player_joined',
    playerName,
    playerId: clientId,
    leaderboard: gameSession.players
  });
}

function handleCreateGame(clientId: string, event: GameEvent) {
  const { playerName, gameType = 'realtime', category = 'All', difficulty = 'Beginner' } = event;
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
    players: [{
      id: clientId,
      name: playerName,
      score: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      averageTime: 0,
      isReady: true
    }],
    status: "waiting" as const,
    gameType
  };

  gameSessions.set(gameId, gameSession);

  // Also persist to storage for async games
  if (gameType === 'async' && client.userId) {
    createAsyncGameSession(gameId, client.userId, category, difficulty);
  }

  // Notify client of successful game creation
  sendToClient(clientId, {
    type: 'game_created',
    gameId,
    gameType,
    message: 'Game created successfully',
    leaderboard: gameSession.players
  });
}

async function createAsyncGameSession(gameId: string, creatorId: number, category: string, difficulty: string) {
  try {
    // Create a game session in storage with random questions for the challenge
    const questions = await database.getRandomQuestions({
      category: category !== 'All' ? category : undefined,
      difficulty: difficulty !== 'All' ? difficulty : undefined,
      count: 10 // Standard 10 questions for challenges
    });

    const now = new Date();
    
    await database.createGameSession({
      id: gameId,
      players: [],
      currentQuestion: 0,
      gameType: 'async',
      category,
      difficulty,
      startTime: now,
      status: 'waiting'
    });
  } catch (error) {
    console.error('Error creating async game session:', error);
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
    const allTeams = await database.getTeamsByGameSession('');
    const gameTeams = allTeams.filter(team => 
      team.members.some(member => 
        gameSession.players.some(player => player.userId === member.userId)
      )
    );

    // Create async game session in storage for team battle
    if (gameTeams.length >= 2) {
      const firstTeam = gameTeams[0];
      await createAsyncGameSession(gameId, firstTeam.captainId, 'mixed', 'medium');
    }

    // Notify all players in the team game
    sendToGame(gameId, {
      type: 'team_game_started',
      gameId: gameId,
      leaderboard: gameSession.players,
      teams: gameTeams
    });
  } else {
    // Regular multiplayer game
    sendToGame(gameId, {
      type: 'game_started',
      leaderboard: gameSession.players
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
  const playerIndex = gameSession.players.findIndex(p => p.id === clientId);
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
    type: 'answer_submitted',
    playerId: clientId,
    playerName: player.name,
    questionId,
    answerId,
    isCorrect,
    leaderboard: gameSession.players
  });
}

function handlePlayerLeave(clientId: string, gameId: string, playerName: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  // Remove player from game
  gameSession.players = gameSession.players.filter(p => p.id !== clientId);

  // If game is empty, remove it
  if (gameSession.players.length === 0) {
    gameSessions.delete(gameId);
    return;
  }

  // Notify all remaining players
  sendToGame(gameId, {
    type: 'player_left',
    playerName,
    playerId: clientId,
    leaderboard: gameSession.players
  });
}

// ASYNC CHALLENGE HANDLERS

async function handleCreateChallenge(clientId: string, event: GameEvent) {
  const { challengeeId, category, difficulty } = event;
  const client = clients.get(clientId);
  
  if (!client || !client.userId || !challengeeId) return;
  if (client.userId === challengeeId) {
    sendToClient(clientId, {
      type: 'error',
      message: 'You cannot challenge yourself'
    });
    return;
  }

  try {
    // Check if challengee exists
    const challengee = await database.getUser(challengeeId);
    if (!challengee) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Challenge recipient not found'
      });
      return;
    }

    // Create a game session
    const gameId = uuidv4();
    
    // Prepare the session with random questions
    await createAsyncGameSession(gameId, client.userId, category || 'All Categories', difficulty || 'Beginner');
    
    const gameSession = await database.getGameSession(gameId);
    if (!gameSession) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Failed to create game session'
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
      status: 'pending',
      category: category || 'All Categories',
      difficulty: difficulty || 'Beginner',
      createdAt: new Date(),
      expiresAt,
      challengerCompleted: false,
      challengeeCompleted: false,
      isDraw: false,
      notificationSent: true
    });

    // Create a notification for the challengee
    const notification = await database.createNotification({
      id: uuidv4(),
      userId: challengeeId,
      type: 'challenge_received',
      message: `${client.playerName || 'Someone'} has challenged you to a Bible Trivia duel!`,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date()
    });

    // Send notification to challengee if they're online
    sendToUser(challengeeId, {
      type: 'notification',
      message: notification.message,
      notificationId: notification.id,
      challengeId: challenge.id
    });

    // Notify the challenger that their challenge was sent
    sendToClient(clientId, {
      type: 'challenge_created',
      challengeId: challenge.id,
      message: `Challenge sent to ${challengee.username}`
    });

  } catch (error) {
    console.error('Error creating challenge:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to create challenge'
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
        type: 'error',
        message: 'Challenge not found'
      });
      return;
    }

    // Verify this user is the challengee
    if (challenge.challengeeId !== client.userId) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You are not the recipient of this challenge'
      });
      return;
    }

    // Check if challenge is still pending
    if (challenge.status !== 'pending') {
      sendToClient(clientId, {
        type: 'error',
        message: `Challenge cannot be accepted (status: ${challenge.status})`
      });
      return;
    }

    // Update challenge status
    await database.updateChallenge(challengeId, {
      status: 'accepted'
    });

    // Get the challenger
    const challenger = await database.getUser(challenge.challengerId);

    // Create a notification for the challenger
    const notification = await database.createNotification({
      id: uuidv4(),
      userId: challenge.challengerId,
      type: 'challenge_completed', // Using an allowed notification type
      message: `${client.playerName || challenger?.username || 'Someone'} has accepted your challenge!`,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date()
    });

    // Send notification to challenger if they're online
    sendToUser(challenge.challengerId, {
      type: 'notification',
      message: notification.message,
      notificationId: notification.id,
      challengeId: challenge.id
    });

    // Notify the challengee that the challenge was accepted
    sendToClient(clientId, {
      type: 'challenge_accepted',
      challengeId: challenge.id,
      message: 'Challenge accepted. You can now play your round.'
    });

  } catch (error) {
    console.error('Error accepting challenge:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to accept challenge'
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
        type: 'error',
        message: 'Challenge not found'
      });
      return;
    }

    // Verify this user is the challengee
    if (challenge.challengeeId !== client.userId) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You are not the recipient of this challenge'
      });
      return;
    }

    // Check if challenge is still pending
    if (challenge.status !== 'pending') {
      sendToClient(clientId, {
        type: 'error',
        message: `Challenge cannot be declined (status: ${challenge.status})`
      });
      return;
    }

    // Update challenge status
    await database.updateChallenge(challengeId, {
      status: 'declined'
    });

    // Get the challenger
    const challenger = await database.getUser(challenge.challengerId);

    // Create a notification for the challenger
    const notification = await database.createNotification({
      id: uuidv4(),
      userId: challenge.challengerId,
      type: 'challenge_declined',
      message: `${client.playerName || challenger?.username || 'Someone'} has declined your challenge.`,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date()
    });

    // Send notification to challenger if they're online
    sendToUser(challenge.challengerId, {
      type: 'notification',
      message: notification.message,
      notificationId: notification.id,
      challengeId: challenge.id
    });

    // Notify the challengee that the challenge was declined
    sendToClient(clientId, {
      type: 'challenge_declined',
      challengeId: challenge.id,
      message: 'Challenge declined successfully.'
    });

  } catch (error) {
    console.error('Error declining challenge:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to decline challenge'
    });
  }
}

async function handleSubmitChallengeAnswer(clientId: string, event: GameEvent) {
  const { challengeId, questionId, answerId, isCorrect, timeSpent } = event;
  const client = clients.get(clientId);
  
  if (!client || !client.userId || !challengeId || !questionId || !answerId) return;

  try {
    // Get the challenge
    const challenge = await database.getChallenge(challengeId);
    if (!challenge) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Challenge not found'
      });
      return;
    }

    // Verify this user is either the challenger or challengee
    if (challenge.challengerId !== client.userId && challenge.challengeeId !== client.userId) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You are not part of this challenge'
      });
      return;
    }

    // Check if challenge is in the right state
    if (challenge.status !== 'accepted' && challenge.status !== 'pending') {
      sendToClient(clientId, {
        type: 'error',
        message: `Cannot submit answer (challenge status: ${challenge.status})`
      });
      return;
    }

    // If challenger is playing and status is 'pending', auto-update to 'accepted'
    if (challenge.status === 'pending' && challenge.challengerId === client.userId) {
      await database.updateChallenge(challengeId, {
        status: 'accepted'
      });
    }

    // Get or create challenge result for this user
    let challengeResult = (await database.getChallengeResultsByChallenge(challengeId))
      .find(result => result.userId === client.userId);

    if (!challengeResult) {
      challengeResult = await database.createChallengeResult({
        id: uuidv4(),
        challengeId,
        userId: client.userId,
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        answers: []
      });
    }

    // Create new answer record
    const newAnswer: ChallengeAnswer = {
      questionId,
      answerId,
      isCorrect: isCorrect || false,
      timeSpent: timeSpent || 20 // Default to max time if not provided
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
      averageTime
    });

    // Notify client of successful answer submission
    sendToClient(clientId, {
      type: 'challenge_answer_submitted',
      challengeId,
      questionId,
      answerId,
      isCorrect,
      message: `Answer submitted. Current score: ${correctAnswers}/${totalAnswers}`,
      leaderboard: [{ id: clientId, name: client.playerName || 'Player', score: correctAnswers, correctAnswers, incorrectAnswers, averageTime, isReady: true }]
    });

  } catch (error) {
    console.error('Error submitting challenge answer:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to submit answer'
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
        type: 'error',
        message: 'Challenge not found'
      });
      return;
    }

    // Verify this user is either the challenger or challengee
    const isChallenger = challenge.challengerId === client.userId;
    const isChallengee = challenge.challengeeId === client.userId;
    
    if (!isChallenger && !isChallengee) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You are not part of this challenge'
      });
      return;
    }

    // Get challenge result for this user
    const challengeResults = await database.getChallengeResultsByChallenge(challengeId);
    const userResult = challengeResults.find(result => result.userId === client.userId);
    
    if (!userResult) {
      sendToClient(clientId, {
        type: 'error',
        message: 'No answers submitted for this challenge'
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
      completedAt: new Date()
    });

    // Update challenge
    await database.updateChallenge(challengeId, updates);

    // Get updated challenge to check if both players have completed
    const updatedChallenge = await database.getChallenge(challengeId);
    if (!updatedChallenge) return;

    // If both players have completed, determine winner and update stats
    if (updatedChallenge.challengerCompleted && updatedChallenge.challengeeCompleted) {
      await finalizeChallenge(updatedChallenge.id);
    } else {
      // Notify the other player that this player has completed their turn
      const otherPlayerId = isChallenger ? updatedChallenge.challengeeId : updatedChallenge.challengerId;
      const otherPlayerName = (await database.getUser(otherPlayerId))?.username || 'Your opponent';
      
      // Create a notification for the other player
      const notification = await database.createNotification({
        id: uuidv4(),
        userId: otherPlayerId,
        type: 'challenge_completed',
        message: `${client.playerName || 'Your opponent'} has completed their turn in your challenge!`,
        read: false,
        challengeId: challenge.id,
        createdAt: new Date()
      });

      // Send notification to the other player if they're online
      sendToUser(otherPlayerId, {
        type: 'notification',
        message: notification.message,
        notificationId: notification.id,
        challengeId: challenge.id
      });
    }

    // Notify the player that their round is complete
    sendToClient(clientId, {
      type: 'challenge_round_completed',
      challengeId,
      message: 'Your challenge round has been completed successfully.'
    });

  } catch (error) {
    console.error('Error completing challenge:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to complete challenge round'
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
    const challengerResult = results.find(r => r.userId === challenge.challengerId);
    const challengeeResult = results.find(r => r.userId === challenge.challengeeId);

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
      status: 'completed',
      winnerUserId,
      isDraw
    });

    // Update user stats
    if (isDraw) {
      // Update both users' draw count
      const challengerUser = await database.getUser(challenge.challengerId);
      const challengeeUser = await database.getUser(challenge.challengeeId);

      if (challengerUser) {
        const currentTotalGames = challengerUser.totalGames === null ? 0 : challengerUser.totalGames;
        const currentDraws = challengerUser.draws === null ? 0 : challengerUser.draws;
        
        await database.updateUser(challenge.challengerId, {
          totalGames: currentTotalGames + 1,
          draws: currentDraws + 1
        });
      }

      if (challengeeUser) {
        const currentTotalGames = challengeeUser.totalGames === null ? 0 : challengeeUser.totalGames;
        const currentDraws = challengeeUser.draws === null ? 0 : challengeeUser.draws;
        
        await database.updateUser(challenge.challengeeId, {
          totalGames: currentTotalGames + 1,
          draws: currentDraws + 1
        });
      }
    } else if (winnerUserId) {
      // Update winner's stats
      const winnerUser = await database.getUser(winnerUserId);
      if (winnerUser) {
        const currentTotalGames = winnerUser.totalGames === null ? 0 : winnerUser.totalGames;
        const currentWins = winnerUser.wins === null ? 0 : winnerUser.wins;
        
        await database.updateUser(winnerUserId, {
          totalGames: currentTotalGames + 1,
          wins: currentWins + 1
        });
      }

      // Update loser's stats
      const loserId = winnerUserId === challenge.challengerId 
        ? challenge.challengeeId 
        : challenge.challengerId;
      
      const loserUser = await database.getUser(loserId);
      if (loserUser) {
        const currentTotalGames = loserUser.totalGames === null ? 0 : loserUser.totalGames;
        const currentLosses = loserUser.losses === null ? 0 : loserUser.losses;
        
        await database.updateUser(loserId, {
          totalGames: currentTotalGames + 1,
          losses: currentLosses + 1
        });
      }
    }

    // Send notifications to both players
    const challenger = await database.getUser(challenge.challengerId);
    const challengee = await database.getUser(challenge.challengeeId);
    
    if (!challenger || !challengee) return;

    // Create result messages
    let challengerMessage = '';
    let challengeeMessage = '';

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
      type: 'challenge_result',
      message: challengerMessage,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date()
    });

    const challengeeNotification = await database.createNotification({
      id: uuidv4(),
      userId: challenge.challengeeId,
      type: 'challenge_result',
      message: challengeeMessage,
      read: false,
      challengeId: challenge.id,
      createdAt: new Date()
    });

    // Send notifications to both players if they're online
    sendToUser(challenge.challengerId, {
      type: 'challenge_result',
      message: challengerMessage,
      notificationId: challengerNotification.id,
      challengeId: challenge.id,
      challengeResult: {
        challenger: {
          name: challenger.username,
          score: challengerResult.score,
          correctAnswers: challengerResult.correctAnswers,
          averageTime: challengerResult.averageTime
        },
        challengee: {
          name: challengee.username,
          score: challengeeResult.score,
          correctAnswers: challengeeResult.correctAnswers,
          averageTime: challengeeResult.averageTime
        },
        isDraw,
        winnerUserId
      }
    });

    sendToUser(challenge.challengeeId, {
      type: 'challenge_result',
      message: challengeeMessage,
      notificationId: challengeeNotification.id,
      challengeId: challenge.id,
      challengeResult: {
        challenger: {
          name: challenger.username,
          score: challengerResult.score,
          correctAnswers: challengerResult.correctAnswers,
          averageTime: challengerResult.averageTime
        },
        challengee: {
          name: challengee.username,
          score: challengeeResult.score,
          correctAnswers: challengeeResult.correctAnswers,
          averageTime: challengeeResult.averageTime
        },
        isDraw,
        winnerUserId
      }
    });

  } catch (error) {
    console.error('Error finalizing challenge:', error);
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
      type: 'notification_marked_read',
      notificationId
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to mark notification as read'
    });
  }
}

// Helper function to send message to all connections of a user
function sendToUser(userId: number, message: GameEvent) {
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
  if (!client) return;

  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

export async function endGame(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  // Update game status
  gameSession.status = "finished";

  // Get players with user IDs
  const authenticatedPlayers = gameSession.players.filter(player => {
    // Find client with this player ID
    const clientsArray = Array.from(clients.values());
    const client = clientsArray.find(c => c.gameId === gameId && c.id === player.id);
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
      timestamp: new Date().toISOString()
    });
    
    // Find client with this player ID
    const client = Array.from(clients.values()).find(c => c.gameId === gameId && c.id === player.id);
    
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
            const sortedPlayers = [...gameSession.players].sort((a, b) => b.score - a.score);
            
            if (sortedPlayers[0].id === player.id) {
              // This player has the highest score (might be tied)
              const isTied = sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score;
              
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
            draws
          });
        }
      } catch (error) {
        console.error('Error updating user stats:', error);
      }
    }
  }

  // Notify all players in the game
  sendToGame(gameId, {
    type: 'game_ended',
    leaderboard: gameSession.players
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
      name: event.teamName || `${client.playerName || 'Player'}'s Team`,
      captainId: client.userId,
      gameSessionId: event.gameId || uuidv4(),
      members: [{
        userId: client.userId,
        username: client.playerName || 'Player',
        role: "captain" as const,
        joinedAt: new Date()
      }],
      score: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      averageTime: 0,
      finalAnswers: [],
      status: "forming" as const,
      createdAt: new Date()
    };

    const team = await database.createTeam(teamData);
    
    // Update activeTeamMemberships cache for team creator
    activeTeamMemberships.set(client.userId, team.id);
    
    sendToClient(clientId, {
      type: 'team_created',
      teamId: team.id,
      team
    });

    // Update availability immediately after team creation
    await broadcastOnlineStatusUpdate();
  } catch (error) {
    console.error('Error creating team:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to create team'
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
        type: 'error',
        message: 'Team not found'
      });
      return;
    }

    if (team.members.length >= 3) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Team is full'
      });
      return;
    }

    const newMember = {
      userId: client.userId,
      username: client.playerName || 'Player',
      role: "member" as const,
      joinedAt: new Date()
    };

    const updatedTeam = await database.updateTeam(event.teamId, {
      members: [...team.members, newMember]
    });

    // Notify all team members
    const teamMemberConnections = updatedTeam.members
      .map(member => userConnections.get(member.userId))
      .filter(connections => connections)
      .flat();

    teamMemberConnections.forEach((connectionId: string | undefined) => {
      if (connectionId) {
        sendToClient(connectionId, {
          type: 'team_updated',
          team: updatedTeam
        });
      }
    });
  } catch (error) {
    console.error('Error joining team:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to join team'
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
        type: 'error',
        message: 'Game session not found'
      });
      return;
    }

    const teams = await database.getTeamsByGameSession(gameSessionId);
    
    // Check if invitee is already in a team
    const inviteeInTeam = teams.find(team => 
      team.members.some(member => member.userId === event.inviteeUserId)
    );

    if (inviteeInTeam) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Player is already in a team'
      });
      return;
    }

    // Find the inviter's team
    let inviterTeam = teams.find(team => 
      team.members.some(member => member.userId === client.userId)
    );

    // If no teams exist yet, create the first team automatically
    if (teams.length === 0) {
      const teamData = {
        id: uuidv4(),
        name: `${client.playerName || 'Player'}'s Team`,
        captainId: client.userId,
        gameSessionId,
        members: [{
          userId: client.userId,
          username: client.playerName || 'Player',
          role: "captain" as const,
          joinedAt: new Date()
        }],
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        finalAnswers: [],
        status: "forming" as const,
        createdAt: new Date()
      };

      inviterTeam = await database.createTeam(teamData);
      
      sendToClient(clientId, {
        type: 'team_created',
        teamId: inviterTeam.id,
        team: inviterTeam
      });
    }

    if (!inviterTeam) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You must be in a team to invite players'
      });
      return;
    }

    // Check if inviter is the captain
    if (inviterTeam.captainId !== client.userId) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Only team captains can send invitations'
      });
      return;
    }

    // Check if team is already full (3 members)
    if (inviterTeam.members.length >= 3) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Your team is already full'
      });
      return;
    }

    const inviteeUser = await database.getUser(event.inviteeUserId);
    if (!inviteeUser) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Player not found'
      });
      return;
    }

    // Check if there's already a pending invitation for team captaincy
    const existingInvitations = await database.getTeamInvitationsByUser(event.inviteeUserId, 'pending');
    const existingTeamInvitation = existingInvitations.find(inv => inv.teamId === inviterTeam.id);
    
    if (existingTeamInvitation) {
      sendToClient(clientId, {
        type: 'error',
        message: 'An invitation to this user is already pending'
      });
      return;
    }

    // Team recruitment is now handled by handleRecruitPlayer function
    // This function only handles regular team member invitations

    // Regular team member invitation
    const invitationData = {
      id: uuidv4(),
      teamId: inviterTeam.id,
      inviterId: client.userId,
      inviteeId: event.inviteeUserId,
      status: "pending" as const,
      type: "member" as const, // Default to member invitation for socket-based invitations
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
    };

    const invitation = await database.createTeamInvitation(invitationData);

    // Send invitation to invitee
    sendToUser(event.inviteeUserId, {
      type: 'team_invitation_received',
      invitation,
      team: inviterTeam,
      inviterName: client.playerName
    });

    sendToClient(clientId, {
      type: 'invitation_sent',
      invitation,
      message: `Invitation sent to ${inviteeUser.username}`
    });

  } catch (error) {
    console.error('Error sending team invitation:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to send invitation'
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
        type: 'error',
        message: 'Team not found'
      });
      return;
    }

    if (team.captainId !== client.userId) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Only team captain can send invitations'
      });
      return;
    }

    // Send email invitation via API
    const response = await fetch('/api/team-invitations/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: event.teamId,
        inviteeEmail: event.inviteeEmail,
        teamName: team.name
      })
    });

    if (response.ok) {
      sendToClient(clientId, {
        type: 'email_invitation_sent',
        email: event.inviteeEmail
      });
    } else {
      sendToClient(clientId, {
        type: 'error',
        message: 'Failed to send email invitation'
      });
    }
  } catch (error) {
    console.error('Error sending email invitation:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to send email invitation'
    });
  }
}

async function handleSubmitTeamAnswer(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamId || !event.questionId || !event.answerId) return;

  try {
    const team = await database.getTeam(event.teamId);
    if (!team) return;

    // Check if this is a team battle or regular team game
    const gameSession = client.gameId ? gameSessions.get(client.gameId) : null;
    const isTeamBattle = gameSession?.gameType === 'team_battle';

    // Update member's individual answer
    const memberIndex = team.members.findIndex(member => member.userId === client.userId);
    if (memberIndex === -1) return;

    // Store individual member answer in memory (game session)
    const currentGameSession = event.gameId ? gameSessions.get(event.gameId) : null;
    let sessionTeam = null;
    if (currentGameSession && currentGameSession.teams) {
      sessionTeam = currentGameSession.teams.find(t => t.id === team.id);
      if (sessionTeam) {
        if (!sessionTeam.memberAnswers) sessionTeam.memberAnswers = {};
        if (!sessionTeam.memberAnswers[event.questionId]) sessionTeam.memberAnswers[event.questionId] = {};
        
        sessionTeam.memberAnswers[event.questionId][client.userId.toString()] = {
          answerId: event.answerId,
          submittedAt: new Date(),
          timeSpent: event.timeSpent || 0
        };
      }
    }

    // Notify team members of answer submission
    const teamClients = Array.from(clients.values()).filter(c => 
      team.members.some(member => member.userId === c.userId)
    );

    for (const teamClient of teamClients) {
      sendToClient(teamClient.id, {
        type: 'team_member_answered',
        teamId: team.id,
        questionId: event.questionId,
        memberName: client.playerName,
        answersReceived: Object.keys(sessionTeam?.memberAnswers?.[event.questionId] || {}).length,
        totalMembers: team.members.length
      });
    }

    // Check if all team members have answered
    const allAnswered = team.members.length === Object.keys(sessionTeam?.memberAnswers?.[event.questionId] || {}).length;
    
    if (allAnswered && isTeamBattle) {
      // Auto-finalize team answer for battle mode using majority vote
      await autoFinalizeTeamAnswer(team.id, event.questionId);
    } else if (allAnswered) {
      // Notify captain that all answers are in and they can finalize
      const captain = team.members.find(m => m.role === 'captain');
      if (captain) {
        sendToUser(captain.userId, {
          type: 'all_team_answers_received',
          teamId: team.id,
          questionId: event.questionId,
          message: 'All team members have answered. You can now finalize the team answer.'
        });
      }
    }

    sendToClient(clientId, {
      type: 'team_answer_submitted',
      teamId: team.id,
      questionId: event.questionId,
      message: 'Your answer has been submitted to the team'
    });

    const updatedMembers = [...team.members];
    updatedMembers[memberIndex] = {
      ...updatedMembers[memberIndex],
      answer: {
        questionId: event.questionId,
        answerId: event.answerId,
        timeSpent: event.timeSpent || 0
      }
    };

    await database.updateTeam(event.teamId, { members: updatedMembers });

    // Notify all team members of the answer submission
    const teamMemberConnections = team.members
      .map(member => userConnections.get(member.userId))
      .filter(connections => connections)
      .flat();

    teamMemberConnections.forEach((connectionId: string | undefined) => {
      if (connectionId) {
        sendToClient(connectionId, {
          type: 'team_member_answered',
          teamId: event.teamId,
          userId: client.userId,
          username: client.playerName
        });
      }
    });
  } catch (error) {
    console.error('Error submitting team answer:', error);
  }
}

async function handleFinalizeTeamAnswer(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.teamId || !event.finalAnswer) return;

  try {
    const team = await database.getTeam(event.teamId);
    if (!team) return;

    if (team.captainId !== client.userId) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Only team captain can finalize answers'
      });
      return;
    }

    const finalAnswer = {
      questionId: event.finalAnswer.questionId,
      answerId: event.finalAnswer.answerId,
      isCorrect: false, // Will be determined by game logic
      timeSpent: event.timeSpent || 0,
      submittedBy: client.userId
    };

    const updatedFinalAnswers = [...team.finalAnswers, finalAnswer];
    await database.updateTeam(event.teamId, { finalAnswers: updatedFinalAnswers });

    // Notify all team members
    const teamMemberConnections = team.members
      .map(member => userConnections.get(member.userId))
      .filter(connections => connections)
      .flat();

    teamMemberConnections.forEach((connectionId: string | undefined) => {
      if (connectionId) {
        sendToClient(connectionId, {
          type: 'team_answer_finalized',
          teamId: event.teamId,
          finalAnswer
        });
      }
    });
  } catch (error) {
    console.error('Error finalizing team answer:', error);
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
        type: 'error',
        message: 'Only team captain can mark team as ready'
      });
      return;
    }

    if (team.members.length < 1) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Team must have at least 1 member'
      });
      return;
    }

    await database.updateTeam(event.teamId, { status: 'ready' });

    // Check if both teams exist and are ready to start the game
    const allTeams = await database.getTeamsByGameSession(team.gameSessionId);
    const readyTeams = allTeams.filter(t => t.status === 'ready');
    
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
            teamId: readyTeam.id
          });
        }
      }

      // Create game session
      gameSessions.set(gameId, {
        id: gameId,
        players: allPlayers,
        status: "waiting",
        gameType: "teams"
      });

      // Update all team members' client gameId
      const gameClients = Array.from(clients.values()).filter(c => 
        allTeams.some(team => team.members.some(member => member.userId === c.userId))
      );
      
      for (const gameClient of gameClients) {
        gameClient.gameId = gameId;
        sendToClient(gameClient.id, {
          type: 'team_battle_starting',
          gameId: gameId,
          gameSessionId: team.gameSessionId,
          teams: readyTeams
        });
      }

      // Update team statuses to playing
      for (const readyTeam of readyTeams) {
        await database.updateTeam(readyTeam.id, { status: 'playing' });
      }

      // Start the game after a brief delay
      setTimeout(() => {
        handleStartGame(gameId);
      }, 2000);
    } else {
      sendToClient(clientId, {
        type: 'team_ready_confirmed',
        teamId: event.teamId,
        waitingForOpponents: true,
        message: allTeams.length < 2 ? 'Waiting for opposing team to be created' : 'Waiting for opposing team to be ready'
      });
    }


  } catch (error) {
    console.error('Error marking team as ready:', error);
  }
}

async function handleRecruitPlayer(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId) return;

  try {
    const { inviteeUserId, gameSessionId: initialGameSessionId, recruiterId, recruiterName } = event;
    if (!inviteeUserId || !initialGameSessionId || !recruiterId) return;

    // Use a mutable variable for gameSessionId that can be updated
    let gameSessionId = initialGameSessionId;

    console.log('Processing recruitment:', { inviteeUserId, gameSessionId, recruiterId, recruiterName });

    // Check if invitee is already in a game (active WebSocket connection with gameId)
    const inviteeClient = Array.from(clients.values()).find(c => c.userId === inviteeUserId);
    if (inviteeClient && inviteeClient.gameId) {
      console.log('Invitee is in game, blocking recruitment');
      sendToClient(clientId, {
        type: 'error',
        message: 'Player is currently in a game and cannot be recruited'
      });
      return;
    }

    // Get all teams for this game session
    const existingTeams = await database.getTeamsByGameSession(gameSessionId);
    console.log('Existing teams for session:', existingTeams.length, existingTeams.map(t => ({ id: t.id, name: t.name, members: t.members.length })));
    
    // Also check if there are any teams where this user is a member (in case gameSessionId mismatch)
    const allTeams = await database.getTeamsByGameSession(''); // Get all teams
    const userTeamsInAnySession = allTeams.filter(team => 
      team.members.some(member => member.userId === recruiterId)
    );
    console.log('User teams in any session:', userTeamsInAnySession.length, userTeamsInAnySession.map(t => ({ id: t.id, name: t.name, gameSessionId: t.gameSessionId })));
    
    // Check if invitee is in a team within the SAME game session (different sessions should be allowed)
    const inviteeTeamMembership = existingTeams.find(team => {
      const isMember = team.members.some(member => member.userId === inviteeUserId);
      if (isMember) {
        console.log(`User ${inviteeUserId} found in team ${team.id} in current session`);
      }
      return isMember;
    });

    if (inviteeTeamMembership) {
      console.log(`Recruitment BLOCKED: User ${inviteeUserId} is already in team ${inviteeTeamMembership.id} in current session`);
      sendToClient(clientId, {
        type: 'error',
        message: 'Player is already in a team in this game session'
      });
      return;
    }
    
    console.log(`Recruitment check PASSED: User ${inviteeUserId} is not in any active team`);

    // Note: Removed overly restrictive captain recruitment check that was blocking normal team formation

    // Check if recruiter is trying to invite someone who invited them
    const existingInvitationsFromInvitee = await database.getTeamInvitationsByUser(recruiterId, 'pending');
    const bidirectionalInvitation = existingInvitationsFromInvitee.find(inv => inv.inviterId === inviteeUserId);
    
    if (bidirectionalInvitation) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You cannot invite someone who has already invited you. Please accept or decline their invitation first.'
      });
      return;
    }

    // Check for existing pending invitations
    const existingInvitations = await database.getTeamInvitationsByUser(inviteeUserId, 'pending');
    const pendingInvitation = existingInvitations.find(inv => inv.inviterId === recruiterId);
    
    if (pendingInvitation) {
      sendToClient(clientId, {
        type: 'error',
        message: 'An invitation to this user is already pending'
      });
      return;
    }

    const inviteeUser = await database.getUser(inviteeUserId);
    if (!inviteeUser) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Player not found'
      });
      return;
    }

    // Check if recruiter is in a team - first check session-specific teams, then all teams
    let recruiterTeam = existingTeams.find(team => 
      team.members.some(member => member.userId === recruiterId)
    );
    
    // If not found in session teams, check if user has a team in any session
    if (!recruiterTeam && userTeamsInAnySession.length > 0) {
      recruiterTeam = userTeamsInAnySession[0]; // Take the first team they're in
      console.log('Found recruiter team in different session, updating gameSessionId to:', recruiterTeam.gameSessionId);
      // Update the working gameSessionId to match the team's session
      gameSessionId = recruiterTeam.gameSessionId;
      // Re-fetch teams for the correct session
      const correctSessionTeams = await database.getTeamsByGameSession(gameSessionId);
      existingTeams.splice(0, existingTeams.length, ...correctSessionTeams);
      
      // Re-check if invitee is in any team after updating the session context
      const inviteeInUpdatedTeams = correctSessionTeams.find(team => 
        team.members.some(member => member.userId === inviteeUserId)
      );
      
      if (inviteeInUpdatedTeams) {
        console.log(`Recruitment blocked after session update: User ${inviteeUserId} is in team ${inviteeInUpdatedTeams.id}`);
        sendToClient(clientId, {
          type: 'error',
          message: 'Player is already in a team and cannot be recruited'
        });
        return;
      }
    }
    
    console.log('Recruiter team:', recruiterTeam ? { id: recruiterTeam.id, name: recruiterTeam.name, members: recruiterTeam.members.length } : 'None');
    console.log('Recruitment logic check - recruiterTeam exists:', !!recruiterTeam, 'existingTeams.length:', existingTeams.length);

    // Determine recruitment type based on game state
    console.log('Recruitment context:', {
      hasRecruiterTeam: !!recruiterTeam,
      existingTeamsCount: existingTeams.length,
      recruiterIsCaptain: recruiterTeam?.captainId === recruiterId,
      recruiterTeamMemberCount: recruiterTeam?.members.length || 0,
      captainId: recruiterTeam?.captainId,
      recruiterId
    });

    if (existingTeams.length === 2) {
      // Both teams exist (both captains established) - always send member invitations
      console.log('Both teams exist - sending member invitation');
      
      if (!recruiterTeam) {
        sendToClient(clientId, {
          type: 'error',
          message: 'You must be in a team to recruit players'
        });
        return;
      }

      if (recruiterTeam.members.length >= 3) {
        sendToClient(clientId, {
          type: 'error',
          message: 'Your team is already full (3 members maximum)'
        });
        return;
      }

      const invitationData = {
        id: uuidv4(),
        teamId: recruiterTeam.id,
        inviterId: recruiterId,
        inviteeId: inviteeUserId,
        status: "pending" as const,
        type: "member" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      };

      const invitation = await database.createTeamInvitation(invitationData);

      // Send member invitation
      sendToUser(inviteeUserId, {
        type: 'team_member_invitation_received',
        invitation,
        team: recruiterTeam,
        inviterName: recruiterName,
        message: `${recruiterName} has invited you to join their team "${recruiterTeam.name}"!`
      });

      sendToClient(clientId, {
        type: 'team_member_invitation_sent',
        invitation,
        inviteeName: inviteeUser.username,
        message: `Team member invitation sent to ${inviteeUser.username}`
      });
    } else if (recruiterTeam && existingTeams.length === 1 && recruiterTeam.members.length >= 2) {
      // Team has captain + at least 1 member and there's only 1 team - send captain invitation for opposing team
      console.log('Team with members creating opposing team captain invitation');
      
      const invitationData = {
        id: uuidv4(),
        teamId: 'new-opposing-team',
        inviterId: recruiterId,
        inviteeId: inviteeUserId,
        status: "pending" as const,
        type: "member" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      };

      const invitation = await database.createTeamInvitation(invitationData);

      // Send invitation to be opposing team captain
      sendToUser(inviteeUserId, {
        type: 'team_captain_invitation_received',
        invitation,
        inviterName: recruiterName,
        message: `${recruiterName}'s team "${recruiterTeam.name}" has invited you to become captain of the opposing team in a Bible trivia battle!`
      });

      sendToClient(clientId, {
        type: 'opposing_captain_invitation_sent',
        invitation,
        inviteeName: inviteeUser.username,
        message: `Opposing team captain invitation sent to ${inviteeUser.username}`
      });
    } else if (recruiterTeam && recruiterTeam.members.length < 3) {
      // Regular team member recruitment - recruiter has a team and wants to add a member
      console.log('Regular team member recruitment');
      
      const invitationData = {
        id: uuidv4(),
        teamId: recruiterTeam.id,
        inviterId: recruiterId,
        inviteeId: inviteeUserId,
        status: "pending" as const,
        type: "member" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      };

      const invitation = await database.createTeamInvitation(invitationData);

      // Send regular team member invitation
      sendToUser(inviteeUserId, {
        type: 'team_member_invitation_received',
        invitation,
        team: recruiterTeam,
        inviterName: recruiterName,
        message: `${recruiterName} has invited you to join their team "${recruiterTeam.name}"!`
      });

      sendToClient(clientId, {
        type: 'team_member_invitation_sent',
        invitation,
        inviteeName: inviteeUser.username,
        message: `Team member invitation sent to ${inviteeUser.username}`
      });
    } else if (!recruiterTeam && existingTeams.length === 0) {
      // First recruitment ever - send invitation to be opposing team captain AND create initial player's team
      const invitationData = {
        id: uuidv4(),
        teamId: 'new-opposing-team',
        inviterId: recruiterId,
        inviteeId: inviteeUserId,
        status: "pending" as const,
        type: "member" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      };

      const invitation = await database.createTeamInvitation(invitationData);

      // Create the initial player's team now
      const initialTeamData = {
        id: uuidv4(),
        name: `${recruiterName || 'Player'}'s Team`,
        captainId: recruiterId,
        gameSessionId: gameSessionId,
        members: [{
          userId: recruiterId,
          username: recruiterName || 'Player',
          role: "captain" as const,
          joinedAt: new Date()
        }],
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        finalAnswers: [],
        status: "forming" as const,
        createdAt: new Date()
      };

      const initialTeam = await database.createTeam(initialTeamData);

      // Send invitation to be opposing team captain
      sendToUser(inviteeUserId, {
        type: 'team_captain_invitation_received',
        invitation,
        inviterName: recruiterName,
        message: `${recruiterName} has invited you to become captain of the opposing team in a Bible trivia match!`
      });

      sendToClient(clientId, {
        type: 'team_created_and_invitation_sent',
        team: initialTeam,
        message: `Your team "${initialTeam.name}" has been created and team captain invitation sent to ${inviteeUser.username}. You can now recruit up to 2 more team members.`
      });
    } else if (!recruiterTeam && existingTeams.length > 0) {
      // Initial player wants to recruit after sending captain invite but hasn't created team yet
      // Check if they have any pending captain invitations they sent
      const sentCaptainInvitations = await database.getTeamInvitationsByUser(recruiterId, 'pending');
      const hasSentCaptainInvite = sentCaptainInvitations.some(inv => 
        inv.inviterId === recruiterId && inv.teamId === 'new-opposing-team'
      );

      if (hasSentCaptainInvite) {
        // Create their team now and then send regular team invitation
        const initialTeamData = {
          id: uuidv4(),
          name: `${recruiterName || 'Player'}'s Team`,
          captainId: recruiterId,
          gameSessionId: gameSessionId,
          members: [{
            userId: recruiterId,
            username: recruiterName || 'Player',
            role: "captain" as const,
            joinedAt: new Date()
          }],
          score: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          averageTime: 0,
          finalAnswers: [],
          status: "forming" as const,
          createdAt: new Date()
        };

        const initialTeam = await database.createTeam(initialTeamData);

        // Now send regular team invitation
        const invitationData = {
          id: uuidv4(),
          teamId: initialTeam.id,
          inviterId: recruiterId,
          inviteeId: inviteeUserId,
          status: "pending" as const,
          type: "member" as const,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
        };

        const invitation = await database.createTeamInvitation(invitationData);

        // Send invitation to join team
        sendToUser(inviteeUserId, {
          type: 'team_invitation_received',
          invitation,
          team: initialTeam,
          inviterName: recruiterName,
          message: `${recruiterName} has invited you to join their team "${initialTeam.name}"`
        });

        sendToClient(clientId, {
          type: 'team_created_and_invitation_sent',
          team: initialTeam,
          message: `Your team "${initialTeam.name}" has been created and invitation sent to ${inviteeUser.username}`
        });
      } else {
        sendToClient(clientId, {
          type: 'error',
          message: 'You must be in a team to recruit players. Create a team first or join an existing one.'
        });
      }
    } else if (recruiterTeam) {
      // Regular team member recruitment - send invitation to join existing team
      if (recruiterTeam.members.length >= 3) {
        sendToClient(clientId, {
          type: 'error',
          message: 'Your team is already full'
        });
        return;
      }

      const invitationData = {
        id: uuidv4(),
        teamId: recruiterTeam.id,
        inviterId: recruiterId,
        inviteeId: inviteeUserId,
        status: "pending" as const,
        type: "member" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      };

      const invitation = await database.createTeamInvitation(invitationData);

      // Send invitation to join team
      sendToUser(inviteeUserId, {
        type: 'team_invitation_received',
        invitation,
        team: recruiterTeam,
        inviterName: recruiterName,
        message: `${recruiterName} has invited you to join their team "${recruiterTeam.name}"`
      });

      sendToClient(clientId, {
        type: 'invitation_sent',
        message: `Team invitation sent to ${inviteeUser.username}`
      });
    } else {
      // Recruiter is not in any team and there are existing teams
      sendToClient(clientId, {
        type: 'error',
        message: 'You must be in a team to recruit players. Create a team first or join an existing one.'
      });
    }

  } catch (error) {
    console.error('Error in handleRecruitPlayer:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to recruit player'
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
        type: 'error',
        message: 'Invitation not found'
      });
      return;
    }

    if (invitation.inviteeId !== client.userId) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You are not the recipient of this invitation'
      });
      return;
    }

    if (invitation.status !== 'pending') {
      sendToClient(clientId, {
        type: 'error',
        message: 'Invitation is no longer valid'
      });
      return;
    }

    // Check if this is a team captain invitation
    if (invitation.teamId === 'new-opposing-team') {
      // Create opposing team with this user as captain
      // First, need to get the game session ID from the inviter's team
      const inviterUser = await database.getUser(invitation.inviterId);
      const allTeams = await database.getTeamsByGameSession(''); // Get all teams to find the right session
      let gameSessionId = event.gameSessionId;
      
      // Find the inviter's team to get the correct game session ID
      const inviterTeams = await database.getTeamsByGameSession('');
      for (const team of inviterTeams) {
        if (team.members.some(member => member.userId === invitation.inviterId)) {
          gameSessionId = team.gameSessionId;
          break;
        }
      }
      
      if (!gameSessionId) {
        gameSessionId = uuidv4();
      }
      
      const opposingTeamData = {
        id: uuidv4(),
        name: `${client.playerName || 'Player'}'s Team`,
        captainId: client.userId,
        gameSessionId,
        members: [{
          userId: client.userId,
          username: client.playerName || 'Player',
          role: "captain" as const,
          joinedAt: new Date()
        }],
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        averageTime: 0,
        finalAnswers: [],
        status: "forming" as const,
        createdAt: new Date()
      };

      const opposingTeam = await database.createTeam(opposingTeamData);

      // Update activeTeamMemberships cache for team captain
      activeTeamMemberships.set(client.userId, opposingTeam.id);

      // Update invitation status
      await database.updateTeamInvitation(invitation.id, { status: 'accepted' });

      // Notify both players
      sendToClient(clientId, {
        type: 'team_captain_assigned',
        team: opposingTeam,
        message: `You are now captain of "${opposingTeam.name}"! You can recruit up to 2 team members.`
      });

      sendToUser(invitation.inviterId, {
        type: 'opposing_team_created',
        message: `${client.playerName} has accepted and created the opposing team!`,
        opposingTeam
      });

      // Broadcast comprehensive team updates to ALL connected clients
      const allTeamsNow = await database.getTeamsByGameSession(gameSessionId);
      
      // Notify ALL connected clients about team changes
      Array.from(clients.values()).forEach(gameClient => {
        sendToClient(gameClient.id, {
          type: 'teams_updated',
          teams: allTeamsNow,
          message: 'Team composition has changed'
        });
        
        // Also send team_update for backward compatibility
        sendToClient(gameClient.id, {
          type: 'team_update',
          teams: allTeamsNow
        });
      });

      // Update player availability immediately after team captain assignment
      await broadcastOnlineStatusUpdate();
      
      // Send additional notifications to ensure UI updates
      setTimeout(() => {
        Array.from(clients.values()).forEach(gameClient => {
          sendToClient(gameClient.id, {
            type: 'force_refresh_teams',
            teams: allTeamsNow
          });
        });
      }, 500);
    } else {
      // Regular team member invitation
      const team = await database.getTeam(invitation.teamId);
      if (!team) {
        sendToClient(clientId, {
          type: 'error',
          message: 'Team not found'
        });
        return;
      }

      // Check if team is full
      if (team.members.length >= 3) {
        sendToClient(clientId, {
          type: 'error',
          message: 'Team is already full'
        });
        return;
      }

      // Check if user is already in any team for this game session
      const allTeams = await database.getTeamsByGameSession(team.gameSessionId);
      const userAlreadyInTeam = allTeams.find(t => 
        t.members.some(member => member.userId === client.userId)
      );

      if (userAlreadyInTeam) {
        sendToClient(clientId, {
          type: 'error',
          message: 'You are already in a team for this game'
        });
        return;
      }

      // Add user to team
      const newMember = {
        userId: client.userId,
        username: client.playerName || 'Player',
        role: "member" as const,
        joinedAt: new Date()
      };

      const updatedTeam = await database.updateTeam(team.id, {
        members: [...team.members, newMember]
      });

      // Update activeTeamMemberships cache
      activeTeamMemberships.set(client.userId, team.id);

      // Update invitation status
      await database.updateTeamInvitation(invitation.id, { status: 'accepted' });

      // Update availability immediately after joining team
      await broadcastOnlineStatusUpdate();

      // Notify the new member that they've successfully joined
      sendToClient(clientId, {
        type: 'team_joined_successfully',
        team: updatedTeam,
        message: `You have successfully joined "${updatedTeam.name}"!`
      });

      // Notify all team members (including the new member) with complete team data
      updatedTeam.members.forEach(member => {
        sendToUser(member.userId, {
          type: 'team_updated',
          team: updatedTeam,
          message: `${client.playerName} has joined the team!`
        });
      });

      // Send specific notification to team captain with updated member list
      const captain = updatedTeam.members.find(m => m.role === 'captain');
      if (captain && captain.userId !== client.userId) {
        sendToUser(captain.userId, {
          type: 'team_member_joined',
          team: updatedTeam,
          newMember: newMember,
          message: `${client.playerName} has joined your team!`
        });
      }

      // Broadcast to all clients in the game session with updated teams data
      const allTeamsInSession = await database.getTeamsByGameSession(team.gameSessionId);
      const gameClients = Array.from(clients.values()).filter(c => 
        c.gameId === team.gameSessionId || 
        (c.userId && allTeamsInSession.some(team => team.members.some(member => member.userId === c.userId)))
      );
      
      for (const gameClient of gameClients) {
        sendToClient(gameClient.id, {
          type: 'teams_updated',
          gameSessionId: team.gameSessionId,
          teams: allTeamsInSession
        });
      }

      // CRITICAL FIX: Update player availability immediately after team join
      await broadcastOnlineStatusUpdate();
    }

  } catch (error) {
    console.error('Error accepting team invitation:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to accept invitation'
    });
  }
}

async function handleStartTeamBattle(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId || !event.gameSessionId) return;

  try {
    // Get all teams in the session
    const allTeams = await database.getTeamsByGameSession(event.gameSessionId);
    const eligibleTeams = allTeams.filter(team => 
      team.members.length === 3 && 
      (team.status === 'ready' || team.status === 'forming')
    );

    if (eligibleTeams.length < 2) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Need 2 teams with exactly 3 members each to start battle'
      });
      return;
    }

    // Use eligible teams instead of ready teams
    const readyTeams = eligibleTeams;

    // Check if user is a captain of one of the ready teams
    const userTeam = readyTeams.find(team => team.captainId === client.userId);
    if (!userTeam) {
      sendToClient(clientId, {
        type: 'error',
        message: 'Only team captains can start battles'
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
          teamId: team.id
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
      teams: readyTeams
    });

    // Update all team members' client gameId and notify battle start
    const gameClients = Array.from(clients.values()).filter(c => 
      allPlayers.some(player => player.userId === c.userId)
    );
    
    for (const gameClient of gameClients) {
      gameClient.gameId = gameId;
      sendToClient(gameClient.id, {
        type: 'team_battle_started',
        gameId: gameId,
        gameSessionId: event.gameSessionId,
        teams: readyTeams,
        message: 'Team battle has begun!'
      });
    }

    // Update team statuses to playing
    for (const team of readyTeams) {
      await database.updateTeam(team.id, { status: 'playing' });
    }

    // Start delivering questions
    setTimeout(() => {
      startTeamBattleQuestions(gameId);
    }, 2000);

  } catch (error) {
    console.error('Error starting team battle:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to start team battle'
    });
  }
}

async function startTeamBattleQuestions(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession) return;

  try {
    // Get questions for the battle
    const questions = await database.getRandomQuestions({ 
      category: 'all', 
      difficulty: 'medium', 
      count: 5 
    });

    if (questions.length === 0) {
      // End battle if no questions available
      endTeamBattle(gameId, 'No questions available');
      return;
    }

    gameSession.questions = questions;
    gameSession.currentQuestionIndex = 0;

    // Send first question to all teams
    sendTeamBattleQuestion(gameId);

  } catch (error) {
    console.error('Error getting battle questions:', error);
    endTeamBattle(gameId, 'Error loading questions');
  }
}

function sendTeamBattleQuestion(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession || !gameSession.questions) return;

  const currentQuestion = gameSession.questions[gameSession.currentQuestionIndex || 0];
  if (!currentQuestion) {
    // No more questions, end battle
    endTeamBattle(gameId);
    return;
  }

  // Send question to all team members
  const gameClients = Array.from(clients.values()).filter(c => c.gameId === gameId);
  
  for (const client of gameClients) {
    const player = gameSession.players.find(p => p.userId === client.userId);
    if (player) {
      sendToClient(client.id, {
        type: 'team_battle_question',
        gameId: gameId,
        question: currentQuestion,
        questionNumber: (gameSession.currentQuestionIndex || 0) + 1,
        totalQuestions: gameSession.questions.length,
        teamId: player.teamId,
        timeLimit: 30000
      });
    }
  }

  // Set timer for question timeout
  setTimeout(() => {
    processTeamBattleAnswers(gameId);
  }, 30000);
}

async function processTeamBattleAnswers(gameId: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession || !gameSession.questions || !gameSession.teams) return;

  const currentQuestion = gameSession.questions[gameSession.currentQuestionIndex || 0];
  const correctAnswer = currentQuestion.answers.find((a: any) => a.isCorrect);

  // Calculate team scores for this question
  const teamResults = [];
  for (const team of gameSession.teams) {
    const teamAnswer = team.finalAnswers?.find((fa: any) => fa.questionId === currentQuestion.id);
    const isCorrect = teamAnswer && teamAnswer.answerId === correctAnswer?.id;
    
    teamResults.push({
      teamId: team.id,
      teamName: team.name,
      answered: !!teamAnswer,
      correct: isCorrect,
      score: isCorrect ? 100 : 0
    });

    // Update team score
    if (isCorrect) {
      team.score = (team.score || 0) + 100;
      team.correctAnswers = (team.correctAnswers || 0) + 1;
    } else {
      team.incorrectAnswers = (team.incorrectAnswers || 0) + 1;
    }

    await database.updateTeam(team.id, {
      score: team.score,
      correctAnswers: team.correctAnswers,
      incorrectAnswers: team.incorrectAnswers
    });
  }

  // Send results to all players
  const gameClients = Array.from(clients.values()).filter(c => c.gameId === gameId);
  for (const client of gameClients) {
    sendToClient(client.id, {
      type: 'team_battle_question_results',
      gameId: gameId,
      question: currentQuestion,
      correctAnswer: correctAnswer,
      teamResults: teamResults,
      leaderboard: gameSession.teams.map(t => ({
        teamId: t.id,
        teamName: t.name,
        score: t.score || 0
      })).sort((a, b) => b.score - a.score)
    });
  }

  // Move to next question or end battle
  gameSession.currentQuestionIndex = (gameSession.currentQuestionIndex || 0) + 1;
  
  if (gameSession.currentQuestionIndex >= gameSession.questions.length) {
    // Battle completed
    setTimeout(() => endTeamBattle(gameId), 3000);
  } else {
    // Next question
    setTimeout(() => sendTeamBattleQuestion(gameId), 5000);
  }
}

async function endTeamBattle(gameId: string, reason?: string) {
  const gameSession = gameSessions.get(gameId);
  if (!gameSession || !gameSession.teams) return;

  try {
    // Determine winner
    const sortedTeams = gameSession.teams
      .map(t => ({ ...t, score: t.score || 0 }))
      .sort((a, b) => b.score - a.score);

    const winner = sortedTeams[0];
    const isDraw = sortedTeams.length > 1 && sortedTeams[0].score === sortedTeams[1].score;

    // Get game session data for history
    const sessionData = await database.getGameSession(gameId);
    const startTime = sessionData?.startTime || new Date();
    const endTime = new Date();

    // Send battle results to all players
    const gameClients = Array.from(clients.values()).filter(c => c.gameId === gameId);
    for (const client of gameClients) {
      const player = gameSession.players.find(p => p.userId === client.userId);
      const playerTeam = gameSession.teams.find(t => t.id === player?.teamId);
      
      sendToClient(client.id, {
        type: 'team_battle_ended',
        gameId: gameId,
        winner: isDraw ? null : winner,
        isDraw: isDraw,
        finalScores: sortedTeams,
        yourTeam: playerTeam,
        reason: reason || 'Battle completed',
        gameHistory: {
          duration: Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
          totalQuestions: gameSession.questions?.length || 0,
          averageScore: gameSession.players.reduce((sum, p) => sum + p.score, 0) / gameSession.players.length
        }
      });

      // Clear gameId
      client.gameId = undefined;
    }

    // Update team statuses to finished
    for (const team of gameSession.teams) {
      await database.updateTeam(team.id, { status: 'finished' });
    }

    // Clean up game session
    gameSessions.delete(gameId);

  } catch (error) {
    console.error('Error ending team battle:', error);
    
    // Still send basic results even if history saving fails
    const gameClients = Array.from(clients.values()).filter(c => c.gameId === gameId);
    for (const client of gameClients) {
      sendToClient(client.id, {
        type: 'team_battle_ended',
        gameId: gameId,
        winner: null,
        isDraw: true,
        finalScores: [],
        reason: 'Battle ended with error'
      });
      client.gameId = undefined;
    }
    gameSessions.delete(gameId);
  }
}

async function autoFinalizeTeamAnswer(teamId: string, questionId: string) {
  try {
    const team = await database.getTeam(teamId);
    if (!team) return;

    // Get team from game session for memberAnswers
    let sessionTeam = null;
    for (const [gameId, gameSession] of Array.from(gameSessions)) {
      if (gameSession.teams) {
        sessionTeam = gameSession.teams.find((t: any) => t.id === teamId);
        if (sessionTeam) break;
      }
    }

    if (!sessionTeam || !sessionTeam.memberAnswers || !sessionTeam.memberAnswers[questionId]) return;

    const memberAnswers = sessionTeam.memberAnswers[questionId];
    const answerCounts: Record<string, number> = {};

    // Count votes for each answer
    Object.values(memberAnswers).forEach((answer: any) => {
      const answerId = answer.answerId;
      answerCounts[answerId] = (answerCounts[answerId] || 0) + 1;
    });

    // Find the answer with the most votes (majority rule)
    let finalAnswerId = '';
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
      submittedBy: team.captainId // Use captain's userId
    };

    // Update team with final answer
    const updatedFinalAnswers = [...(team.finalAnswers || []), teamAnswer];
    await database.updateTeam(teamId, { finalAnswers: updatedFinalAnswers });

    // Notify team members
    const teamClients = Array.from(clients.values()).filter(c => 
      team.members.some(member => member.userId === c.userId)
    );

    for (const teamClient of teamClients) {
      sendToClient(teamClient.id, {
        type: 'team_answer_finalized',
        teamId: teamId,
        questionId: questionId,
        finalAnswer: teamAnswer,
        message: 'Team answer finalized by majority vote'
      });
    }

  } catch (error) {
    console.error('Error auto-finalizing team answer:', error);
  }
}

// Handle reconnection and game state restoration
async function handleGetGameState(clientId: string, event: GameEvent) {
  const client = clients.get(clientId);
  if (!client || !client.userId) return;

  try {
    // Check if user is in any active team
    const allTeams = await getAllActiveTeams();
    const userTeam = allTeams.find(team => 
      team.members.some(member => member.userId === client.userId)
    );

    if (userTeam) {
      // User has an active team, restore team state
      client.gameId = userTeam.gameSessionId;
      
      sendToClient(clientId, {
        type: 'game_state_restored',
        team: userTeam,
        gameSessionId: userTeam.gameSessionId,
        message: 'Reconnected to your team'
      });

      // Check if team is in an active battle
      const gameSession = gameSessions.get(userTeam.gameSessionId);
      if (gameSession && gameSession.status === 'playing') {
        sendToClient(clientId, {
          type: 'battle_reconnected',
          gameId: gameSession.id,
          gameSessionId: userTeam.gameSessionId,
          team: userTeam,
          message: 'Reconnected to ongoing battle'
        });
      }
    } else {
      // No active team found
      sendToClient(clientId, {
        type: 'no_active_game',
        message: 'No active team or game found'
      });
    }

    // Update availability status
    await broadcastOnlineStatusUpdate();
  } catch (error) {
    console.error('Error getting game state:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to restore game state'
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
        type: 'error',
        message: 'Team not found'
      });
      return;
    }

    // Verify user is a member of this team
    const isMember = team.members.some(member => member.userId === client.userId);
    if (!isMember) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You are not a member of this team'
      });
      return;
    }

    // Update client game session
    client.gameId = team.gameSessionId;

    sendToClient(clientId, {
      type: 'team_rejoined',
      team: team,
      gameSessionId: team.gameSessionId,
      message: 'Successfully rejoined your team'
    });

    // Notify other team members of reconnection
    const teamClients = Array.from(clients.values()).filter(c => 
      c.userId !== client.userId && 
      team.members.some(member => member.userId === c.userId)
    );

    for (const teamClient of teamClients) {
      sendToClient(teamClient.id, {
        type: 'team_member_reconnected',
        memberName: client.playerName || 'Team Member',
        teamId: team.id
      });
    }

    // Update availability status
    await broadcastOnlineStatusUpdate();
  } catch (error) {
    console.error('Error rejoining team:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to rejoin team'
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
        type: 'error',
        message: 'Invitation not found'
      });
      return;
    }

    if (invitation.inviteeId !== client.userId) {
      sendToClient(clientId, {
        type: 'error',
        message: 'You are not the recipient of this invitation'
      });
      return;
    }

    if (invitation.status !== 'pending') {
      sendToClient(clientId, {
        type: 'error',
        message: 'Invitation is no longer valid'
      });
      return;
    }

    // Update invitation status
    await database.updateTeamInvitation(invitation.id, { status: 'declined' });

    // Notify inviter
    sendToUser(invitation.inviterId, {
      type: 'invitation_declined',
      message: `${client.playerName} has declined your team invitation`,
      inviterName: client.playerName
    });

    // Notify invitee
    sendToClient(clientId, {
      type: 'invitation_declined_confirmed',
      message: 'Invitation declined successfully'
    });

  } catch (error) {
    console.error('Error declining team invitation:', error);
    sendToClient(clientId, {
      type: 'error',
      message: 'Failed to decline invitation'
    });
  }
}
