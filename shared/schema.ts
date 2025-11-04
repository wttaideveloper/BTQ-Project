import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Type definitions
export type Answer = {
  id: string;
  text: string;
  isCorrect: boolean;
};

export type ChallengeAnswer = {
  questionId: string;
  answerId: string;
  isCorrect: boolean;
  timeSpent: number;
};

export type Player = {
  id: string;
  name: string;
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageTime: number;
  isReady: boolean;
  userId?: number;
  teamId?: string;
};

export type Team = {
  id: string;
  name: string;
  captainId: number;
  gameSessionId: string;
  members: TeamMember[];
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageTime: number;
  finalAnswers: TeamAnswer[];
  status: "forming" | "ready" | "playing" | "finished";
  createdAt: Date;
};

export type TeamMember = {
  userId: number;
  username: string;
  role: "captain" | "member";
  joinedAt: Date;
  answer?: {
    questionId: string;
    answerId: string;
    timeSpent: number;
  };
};

export type TeamAnswer = {
  questionId: string;
  answerId: string;
  isCorrect: boolean;
  timeSpent: number;
  submittedBy: number; // captain userId
};

export type TeamInvitation = {
  id: string;
  teamId: string;
  inviterId: number;
  inviteeId: number;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: Date;
  expiresAt: Date;
};

export type Question = {
  id: string;
  text: string;
  context?: string;
  category: string;
  difficulty: string;
  answers: Answer[];
};

export type GameResult = {
  id: string;
  playerName: string;
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageTime: number;
  category: string;
  difficulty: string;
  timestamp: string;
};

export type GameSession = {
  id: string;
  players: Player[];
  currentQuestion: number;
  gameType: string; // 'realtime' or 'async'
  category: string;
  difficulty: string;
  startTime: Date;
  endTime?: Date;
  status: "waiting" | "playing" | "finished";
};

export type Challenge = {
  id: string;
  challengerId: number;
  challengeeId: number;
  gameSessionId: string;
  status: "pending" | "accepted" | "completed" | "expired" | "declined";
  category: string;
  difficulty: string;
  createdAt: Date;
  expiresAt: Date;
  winnerUserId?: number;
  isDraw: boolean;
  challengerCompleted: boolean;
  challengeeCompleted: boolean;
  notificationSent: boolean;
};

export type ChallengeResult = {
  id: string;
  challengeId: string;
  userId: number;
  score: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageTime: number;
  completedAt?: Date;
  answers: ChallengeAnswer[];
};

export type Notification = {
  id: string;
  userId: number;
  type: "challenge_received" | "challenge_completed" | "challenge_declined" | "challenge_expired" | "challenge_result";
  message: string;
  read: boolean;
  challengeId?: string;
  createdAt: Date;
};

// User table schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  isAdmin: boolean("is_admin").default(false),
  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen").defaultNow(),
  // Stats for user profile
  totalGames: integer("total_games").default(0),
  wins: integer("wins").default(0),
  losses: integer("losses").default(0),
  draws: integer("draws").default(0),
});

// Question table schema
export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  context: text("context"),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  answers: json("answers").notNull().$type<Answer[]>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Game result table schema (for multiplayer games)
export const gameResults = pgTable("game_results", {
  id: text("id").primaryKey(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  correctAnswers: integer("correct_answers").notNull(),
  incorrectAnswers: integer("incorrect_answers").notNull(),
  averageTime: integer("average_time").notNull(),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Single player scores table schema
export const singlePlayerScores = pgTable("single_player_scores", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(), // Foreign key to users
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  correctAnswers: integer("correct_answers").notNull(),
  incorrectAnswers: integer("incorrect_answers").notNull(),
  averageTime: text("average_time").notNull(), // Store as text to handle decimal values
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  gameType: text("game_type").notNull(), // 'question' or 'time'
  totalQuestions: integer("total_questions").notNull(),
  timeLimit: integer("time_limit"), // For time-based games
  timestamp: timestamp("timestamp").defaultNow(),
});

// Multiplayer scores table schema
export const multiplayerScores = pgTable("multiplayer_scores", {
  id: text("id").primaryKey(),
  gameSessionId: text("game_session_id").notNull(), // Reference to game session
  playerName: text("player_name").notNull(),
  playerIndex: integer("player_index").notNull(), // Position in the game (0, 1, 2, etc.)
  score: integer("score").notNull(),
  correctAnswers: integer("correct_answers").notNull(),
  incorrectAnswers: integer("incorrect_answers").notNull(),
  averageTime: text("average_time").notNull(), // Store as text to handle decimal values
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  gameType: text("game_type").notNull(), // 'realtime' or 'async'
  totalQuestions: integer("total_questions").notNull(),
  playerCount: integer("player_count").notNull(), // Number of players in the game
  timestamp: timestamp("timestamp").defaultNow(),
});

// Game session table schema
export const gameSessions = pgTable("game_sessions", {
  id: text("id").primaryKey(),
  players: json("players").notNull().$type<Player[]>(),
  currentQuestion: integer("current_question").default(0),
  gameType: text("game_type").notNull(), // 'realtime' or 'async'
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  startTime: timestamp("start_time").defaultNow(),
  endTime: timestamp("end_time"),
  status: text("status").default("waiting"),
});

// Challenge table schema for asynchronous multiplayer
export const challenges = pgTable("challenges", {
  id: text("id").primaryKey(),
  challengerId: integer("challenger_id").notNull(), // Foreign key to users
  challengeeId: integer("challengee_id").notNull(), // Foreign key to users
  gameSessionId: text("game_session_id").notNull(), // Game session with questions
  status: text("status").default("pending"), // pending, accepted, completed, expired, declined
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // When the challenge expires (24h)
  winnerUserId: integer("winner_user_id"), // ID of the winner (if any)
  isDraw: boolean("is_draw").default(false), // True if the game ended in a draw
  challengerCompleted: boolean("challenger_completed").default(false), // Whether challenger completed their turn
  challengeeCompleted: boolean("challengee_completed").default(false), // Whether challengee completed their turn
  notificationSent: boolean("notification_sent").default(false), // Whether result notification was sent
});

// Challenge results table - stores individual player results
export const challengeResults = pgTable("challenge_results", {
  id: text("id").primaryKey(),
  challengeId: text("challenge_id").notNull(), // Foreign key to challenges
  userId: integer("user_id").notNull(), // Foreign key to users
  score: integer("score").default(0),
  correctAnswers: integer("correct_answers").default(0),
  incorrectAnswers: integer("incorrect_answers").default(0),
  averageTime: integer("average_time").default(0),
  completedAt: timestamp("completed_at"),
  answers: json("answers").default([]).$type<ChallengeAnswer[]>(), // Store answers for comparison
});

// Notifications table for in-app notifications
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(), // Foreign key to users
  type: text("type").notNull(), // challenge_received, challenge_completed, etc.
  message: text("message").notNull(),
  read: boolean("read").default(false),
  challengeId: text("challenge_id"), // Optional reference to associated challenge
  createdAt: timestamp("created_at").defaultNow(),
});

// Teams table for multiplayer team-based games
export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  captainId: integer("captain_id").notNull(), // Foreign key to users
  gameSessionId: text("game_session_id").notNull(), // Foreign key to game_sessions
  members: json("members").default([]).$type<TeamMember[]>(),
  score: integer("score").default(0),
  correctAnswers: integer("correct_answers").default(0),
  incorrectAnswers: integer("incorrect_answers").default(0),
  averageTime: integer("average_time").default(0),
  finalAnswers: json("final_answers").default([]).$type<TeamAnswer[]>(),
  memberAnswers: json("member_answers").default({}).$type<Record<string, Record<string, any>>>(),
  status: text("status").default("forming"), // forming, ready, playing, finished
  createdAt: timestamp("created_at").defaultNow(),
});

// Team invitations table
export const teamInvitations = pgTable("team_invitations", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(), // Foreign key to teams
  inviterId: integer("inviter_id").notNull(), // Foreign key to users
  inviteeId: integer("invitee_id").notNull(), // Foreign key to users
  status: text("status").default("pending"), // pending, accepted, declined, expired
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Sessions table for PostgreSQL session store
export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Voice settings table for ElevenLabs voice cloning
export const voiceSettings = pgTable("voice_settings", {
  id: text("id").primaryKey().default("default"),
  elevenlabsVoiceId: text("elevenlabs_voice_id"),
  voiceName: text("voice_name"),
  voiceDescription: text("voice_description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Voice usage tracking table for ElevenLabs credit monitoring
export const voiceUsage = pgTable("voice_usage", {
  id: text("id").primaryKey(),
  voiceId: text("voice_id").notNull(),
  textLength: integer("text_length").notNull(), // Number of characters processed
  estimatedCredits: integer("estimated_credits").notNull(), // Estimated credits used
  requestType: text("request_type").notNull(), // question, feedback, etc.
  gameSessionId: text("game_session_id"), // Optional reference to game session
  userId: integer("user_id"), // Optional reference to user
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas using drizzle-zod
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  isAdmin: true,
});

export const insertQuestionSchema = createInsertSchema(questions);
export const insertGameResultSchema = createInsertSchema(gameResults);
export const insertSinglePlayerScoreSchema = createInsertSchema(singlePlayerScores);
export const insertGameSessionSchema = createInsertSchema(gameSessions);
export const insertChallengeSchema = createInsertSchema(challenges);
export const insertChallengeResultSchema = createInsertSchema(challengeResults);
export const insertNotificationSchema = createInsertSchema(notifications);
export const insertTeamSchema = createInsertSchema(teams);
export const insertTeamInvitationSchema = createInsertSchema(teamInvitations);
export const insertVoiceSettingsSchema = createInsertSchema(voiceSettings);
export const insertVoiceUsageSchema = createInsertSchema(voiceUsage).omit({ id: true, createdAt: true });

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type InsertGameResult = z.infer<typeof insertGameResultSchema>;
export type InsertSinglePlayerScore = z.infer<typeof insertSinglePlayerScoreSchema>;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;
export type InsertChallengeResult = z.infer<typeof insertChallengeResultSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;
export type InsertVoiceSettings = z.infer<typeof insertVoiceSettingsSchema>;
export type VoiceSettings = typeof voiceSettings.$inferSelect;
export type InsertVoiceUsage = z.infer<typeof insertVoiceUsageSchema>;
export type VoiceUsage = typeof voiceUsage.$inferSelect;
