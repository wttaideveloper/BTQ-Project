export interface GameEvent {
  type: string;
  playerName?: string;
  playerId?: string;
  userId?: number;
  questionId?: string;
  answerId?: string;
  isCorrect?: boolean;
  timeSpent?: number;
  gameId?: string;
  gameType?: 'realtime' | 'async';
  challengeId?: string;
  challengeeId?: number;
  category?: string;
  difficulty?: string;
  message?: string;
  notificationId?: string;
  clientId?: string;
  leaderboard?: any[];
  challengeResult?: any;
  // Team Battle properties
  gameSessionId?: string;
  teamId?: string;
  teamBattleId?: string;
  teamSide?: "A" | "B";
  teamName?: string;
  username?: string;
  finalAnswer?: {
    questionId: string;
    answerId: string;
  };
}

export interface ChallengeResultData {
  challenger: {
    name: string;
    score: number;
    correctAnswers: number;
    averageTime: number;
  };
  challengee: {
    name: string;
    score: number;
    correctAnswers: number;
    averageTime: number;
  };
  isDraw: boolean;
  winnerUserId?: number;
}

export interface NotificationData {
  id: string;
  type: string;
  message: string;
  read: boolean;
  challengeId?: string;
  createdAt: Date;
}

// Callback types
type GenericCallback = (data: any) => void;
type NotificationCallback = (notification: NotificationData) => void;
type ChallengeCallback = (challengeId: string, data: any) => void;

// Event listeners
const eventListeners: { [key: string]: GenericCallback[] } = {
  // Real-time game events
  'player_joined': [],
  'player_left': [],
  'game_started': [],
  'answer_submitted': [],
  'game_ended': [],
  
  // Challenge events
  'challenge_created': [],
  'challenge_accepted': [],
  'challenge_declined': [],
  'challenge_answer_submitted': [],
  'challenge_round_completed': [],
  'challenge_result': [],
  
  // Notification events
  'notification': [],
  'notification_marked_read': [],
  
  // Error and connection events
  'error': [],
  'authenticated': [],
  'connection_established': []
};

let socket: WebSocket | null = null;
let authenticatedUserId: number | null = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectTimeout: NodeJS.Timeout | null = null;

export function setupGameSocket(userId?: number): WebSocket {
  console.log('setupGameSocket called with userId:', userId);
  console.log('Current socket state:', socket?.readyState);
  
  // Reset reconnection attempts when explicitly setting up socket
  reconnectAttempts = 0;

  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log('Socket already open, reusing connection');
    // If socket is already open and we have a userId, send authenticate event
    if (userId && userId !== authenticatedUserId) {
      authenticateUser(userId);
    }
    return socket;
  }
  
  // Close existing socket if it's not open
  if (socket) {
    console.log('Closing existing socket with state:', socket.readyState);
    try {
      socket.close();
    } catch (e) {
      console.error('Error closing socket:', e);
    }
    socket = null;
  }
  
  // Create a new WebSocket connection
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Ensure we always have a valid host with port
  const host = window.location.host || 'localhost:5001';
  const wsUrl = `${protocol}//${host}/ws`;
  
  console.log('Creating new WebSocket connection to:', wsUrl);
  
  try {
    socket = new WebSocket(wsUrl);
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    throw error;
  }
  
  socket.addEventListener('open', () => {
    console.log('WebSocket connected successfully');
    reconnectAttempts = 0;
    
    // If we have a userId, authenticate the connection
    if (userId) {
      console.log('Authenticating user:', userId);
      authenticateUser(userId);
    }
  });
  
  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Log all messages for debugging
      console.log('[WS Client] Message received:', data.type, data);
      
      // Notify listeners for this event type
      const listeners = eventListeners[data.type] || [];
      console.log(`[WS Client] Found ${listeners.length} listener(s) for ${data.type}`);
      listeners.forEach(callback => {
        console.log(`[WS Client] Calling listener for ${data.type}`);
        callback(data);
      });
      
    } catch (error) {
      console.error('[WS Client] Error parsing message:', error);
    }
  });
  
  socket.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
    console.error('WebSocket URL was:', wsUrl);
    // Notify error listeners
    const listeners = eventListeners['error'] || [];
    listeners.forEach(callback => callback(error));
  });
  
  socket.addEventListener('close', () => {
    console.log('WebSocket closed');
    socket = null;
    
    // Attempt to reconnect if we should
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = Math.min(1000 * (2 ** reconnectAttempts), 30000); // Exponential backoff with max 30s
      console.log(`WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      reconnectTimeout = setTimeout(() => {
        console.log('Attempting WebSocket reconnection...');
        setupGameSocket(authenticatedUserId || undefined);
      }, delay);
    } else {
      console.error('WebSocket max reconnection attempts reached');
    }
  });
  
  return socket;
}

function authenticateUser(userId: number) {
  sendGameEvent({
    type: 'authenticate',
    userId
  });
  authenticatedUserId = userId;
}

export function closeGameSocket() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  reconnectAttempts = maxReconnectAttempts; // Prevent auto-reconnect
  
  if (socket) {
    socket.close();
    socket = null;
  }
  
  authenticatedUserId = null;
}

export function sendGameEvent(event: GameEvent) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    socket = setupGameSocket(authenticatedUserId || undefined);
    // Wait for connection to open
    socket.addEventListener('open', () => {
      socket?.send(JSON.stringify(event));
    });
  } else {
    socket.send(JSON.stringify(event));
  }
}

// Event listener registration functions
export function onPlayerJoined(callback: (player: any) => void) {
  eventListeners['player_joined'].push(callback);
  return () => removeListener('player_joined', callback);
}

export function onPlayerLeft(callback: (player: any) => void) {
  eventListeners['player_left'].push(callback);
  return () => removeListener('player_left', callback);
}

export function onGameStarted(callback: (data: any) => void) {
  eventListeners['game_started'].push(callback);
  return () => removeListener('game_started', callback);
}

export function onAnswerSubmitted(callback: (data: any) => void) {
  eventListeners['answer_submitted'].push(callback);
  return () => removeListener('answer_submitted', callback);
}

export function onGameEnded(callback: (data: any) => void) {
  eventListeners['game_ended'].push(callback);
  return () => removeListener('game_ended', callback);
}

// Challenge event listeners
export function onChallengeCreated(callback: (data: any) => void) {
  eventListeners['challenge_created'].push(callback);
  return () => removeListener('challenge_created', callback);
}

export function onChallengeAccepted(callback: (data: any) => void) {
  eventListeners['challenge_accepted'].push(callback);
  return () => removeListener('challenge_accepted', callback);
}

export function onChallengeDeclined(callback: (data: any) => void) {
  eventListeners['challenge_declined'].push(callback);
  return () => removeListener('challenge_declined', callback);
}

export function onChallengeAnswerSubmitted(callback: (data: any) => void) {
  eventListeners['challenge_answer_submitted'].push(callback);
  return () => removeListener('challenge_answer_submitted', callback);
}

export function onChallengeRoundCompleted(callback: (data: any) => void) {
  eventListeners['challenge_round_completed'].push(callback);
  return () => removeListener('challenge_round_completed', callback);
}

export function onChallengeResult(callback: (data: any) => void) {
  eventListeners['challenge_result'].push(callback);
  return () => removeListener('challenge_result', callback);
}

// Notification event listeners
export function onNotification(callback: NotificationCallback) {
  eventListeners['notification'].push(callback);
  return () => removeListener('notification', callback);
}

export function onNotificationMarkedRead(callback: (data: any) => void) {
  eventListeners['notification_marked_read'].push(callback);
  return () => removeListener('notification_marked_read', callback);
}

export function onAuthenticated(callback: (data: any) => void) {
  eventListeners['authenticated'].push(callback);
  return () => removeListener('authenticated', callback);
}

export function onError(callback: (error: any) => void) {
  eventListeners['error'].push(callback);
  return () => removeListener('error', callback);
}

// Team & Battle events: register common types used by server
// Pre-register keys to enable subscriptions before first message
['team_updated', 'team_created', 'teams_updated', 'team_invitation_received', 'invitation_sent',
 'opponent_accepted_invitation', 'join_request_created', 'join_request_updated',
 'team_battle_ready', 'team_battle_cancelled'].forEach((key) => {
  if (!eventListeners[key]) eventListeners[key] = [];
});

// Generic event subscription for any server-sent event type
export function onEvent(eventType: string, callback: (data: any) => void) {
  if (!eventListeners[eventType]) {
    eventListeners[eventType] = [];
  }
  eventListeners[eventType].push(callback);
  console.log(`[WS Client] Registered listener for '${eventType}'. Total listeners: ${eventListeners[eventType].length}`);
  return () => {
    console.log(`[WS Client] Removing listener for '${eventType}'`);
    removeListener(eventType, callback);
  };
}

// Helper function to remove a listener
function removeListener(eventType: string, callback: GenericCallback) {
  const listeners = eventListeners[eventType] || [];
  const index = listeners.indexOf(callback);
  if (index !== -1) {
    listeners.splice(index, 1);
  }
}

// Challenge-specific functions
export function createChallenge(challengeeId: number, category?: string, difficulty?: string) {
  sendGameEvent({
    type: 'create_challenge',
    challengeeId,
    category,
    difficulty
  });
}

export function acceptChallenge(challengeId: string) {
  sendGameEvent({
    type: 'accept_challenge',
    challengeId
  });
}

export function declineChallenge(challengeId: string) {
  sendGameEvent({
    type: 'decline_challenge',
    challengeId
  });
}

export function submitChallengeAnswer(
  challengeId: string, 
  questionId: string, 
  answerId: string, 
  isCorrect: boolean, 
  timeSpent: number
) {
  sendGameEvent({
    type: 'submit_challenge_answer',
    challengeId,
    questionId,
    answerId,
    isCorrect,
    timeSpent
  });
}

export function completeChallenge(challengeId: string) {
  sendGameEvent({
    type: 'complete_challenge',
    challengeId
  });
}

// Notification functions
export function markNotificationAsRead(notificationId: string) {
  sendGameEvent({
    type: 'mark_notification_read',
    notificationId
  });
}
