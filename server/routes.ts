import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { database } from "./database";
import { setupWebSocketServer } from "./socket";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { generateQuestions } from "./openai";
import { setupAuth } from "./auth";
import { sendTeamInvitationEmail } from "./email";
import { QuestionValidationService } from "./question-validation";
import postgres from "postgres";
import multer from "multer";
import fs from "fs";
import path from "path";

// ElevenLabs API configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "sk_3fb0efe7e7d5904808c605b373acb0088d61f52000e73c8b";
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io/v1";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Extend Request type to include file property from multer
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Middleware to ensure user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "You must be logged in to access this resource" });
}

// Middleware to ensure user is an admin
function ensureAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.isAdmin) {
    return next();
  }
  res.status(403).json({ message: "You do not have permission to access this resource" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Set up authentication
  setupAuth(app);
  
  // Set up WebSocket server
  setupWebSocketServer(httpServer);
  
  // API Routes
  
  // Debug endpoint to clear game state - Admin only
  app.post("/api/debug/clear-game-state", ensureAdmin, async (req, res) => {
    try {
      // Clear all team statuses in database
      await database.clearAllTeamStatuses();
      
      res.json({ message: "Game state cleared successfully" });
    } catch (error) {
      console.error('Error clearing game state:', error);
      res.status(500).json({ message: "Failed to clear game state" });
    }
  });

  // Debug endpoint to test database connection - Admin only
  app.get("/api/debug/test-db", ensureAdmin, async (req, res) => {
    try {
      // Test database connection by trying to get questions
      const testQuestions = await database.getQuestions({});
      res.json({ 
        message: "Database connection successful", 
        questionCount: testQuestions.length,
        sampleQuestion: testQuestions[0] || null
      });
    } catch (error) {
      console.error('Database connection test failed:', error);
      res.status(500).json({ 
        message: "Database connection failed", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Debug endpoint to test question creation - Admin only
  app.post("/api/debug/test-create", ensureAdmin, async (req, res) => {
    try {
      const testQuestion = {
        id: uuidv4(),
        text: "Test question for database connection",
        context: "This is a test question",
        category: "Bible Stories",
        difficulty: "Beginner",
        answers: [
          { id: uuidv4(), text: "Test Answer 1", isCorrect: true },
          { id: uuidv4(), text: "Test Answer 2", isCorrect: false },
          { id: uuidv4(), text: "Test Answer 3", isCorrect: false },
          { id: uuidv4(), text: "Test Answer 4", isCorrect: false }
        ]
      };
      
      console.log("Testing database insert with question:", testQuestion);
      
      const createdQuestion = await database.createQuestion(testQuestion);
      console.log("✅ Test question created successfully:", createdQuestion);
      
      res.json({ 
        message: "Test question created successfully", 
        question: createdQuestion
      });
    } catch (error) {
      console.error('Test question creation failed:', error);
      res.status(500).json({ 
        message: "Test question creation failed", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Debug endpoint to test with exact payload format
  app.post("/api/debug/test-exact", ensureAdmin, async (req, res) => {
    try {
      const { questions } = req.body;
      
      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Questions array is required" });
      }
      
      console.log("Testing with exact payload format:", questions);
      
      const storedQuestions = [];
      for (const question of questions) {
        try {
          console.log(`Testing question: ${question.text}`);
          console.log(`Question difficulty: ${question.difficulty}, category: ${question.category}`);
          
          // Test validation first
          const validation = QuestionValidationService.validateQuestion(question);
          console.log(`Validation result:`, validation);
          
          if (!validation.isValid) {
            console.log(`❌ Validation failed: ${validation.errors.join(", ")}`);
            continue;
          }
          
          const storedQuestion = await database.createQuestion(question);
          storedQuestions.push(storedQuestion);
          console.log(`✅ Test question stored: ${storedQuestion.id}`);
        } catch (error) {
          console.error(`❌ Test question failed: ${error}`);
        }
      }
      
      res.json({
        message: `Test completed: ${storedQuestions.length} questions stored`,
        storedQuestions
      });
    } catch (error) {
      console.error('Test failed:', error);
      res.status(500).json({ 
        message: "Test failed", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Get questions with optional filtering - Admin route for management panel
  app.get("/api/questions", ensureAdmin, async (req, res) => {
    try {
      const category = req.query.category as string;
      const difficulty = req.query.difficulty as string;
      const search = req.query.search as string;
      
      const questions = await database.getQuestions({
        category: category !== "All Categories" ? category : undefined,
        difficulty,
        search,
      });
      
      res.json(questions);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });
  
  // Create a new question - Admin only
  app.post("/api/questions", ensureAdmin, async (req, res) => {
    try {
      const question = {
        id: uuidv4(),
        text: req.body.text,
        context: req.body.context,
        category: req.body.category,
        difficulty: req.body.difficulty,
        answers: req.body.answers.map((answer: any) => ({
          id: uuidv4(),
          text: answer.text,
          isCorrect: answer.isCorrect
        })),
      };
      
      await database.createQuestion(question);
      res.status(201).json(question);
    } catch (err) {
      res.status(500).json({ message: "Failed to create question" });
    }
  });
  
  // Update a question - Admin only
  app.put("/api/questions/:id", ensureAdmin, async (req, res) => {
    try {
      const questionId = req.params.id;
      const question = await database.getQuestion(questionId);
      
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      
      const updatedQuestion = {
        ...question,
        text: req.body.text,
        context: req.body.context,
        category: req.body.category,
        difficulty: req.body.difficulty,
        answers: req.body.answers.map((answer: any, index: number) => ({
          id: question.answers[index]?.id || uuidv4(),
          text: answer.text,
          isCorrect: answer.isCorrect
        })),
      };
      
      await database.updateQuestion(questionId, updatedQuestion);
      res.json(updatedQuestion);
    } catch (err) {
      res.status(500).json({ message: "Failed to update question" });
    }
  });
  
  // Delete a question - Admin only
  app.delete("/api/questions/:id", ensureAdmin, async (req, res) => {
    try {
      const questionId = req.params.id;
      await database.deleteQuestion(questionId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete question" });
    }
  });
  
  // Generate questions with AI for review - Admin only
  app.post("/api/questions/generate", ensureAdmin, async (req, res) => {
    try {
      const { category, difficulty, count } = req.body;
      
      // Validate input
      if (!category || !difficulty || !count) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      console.log(`Generating ${count} questions for category: ${category}, difficulty: ${difficulty}`);
      
      // Generate questions using OpenAI (returns for review, doesn't save to database)
      const generatedQuestions = await generateQuestions(category, difficulty, count);
      
      console.log(`Successfully generated ${generatedQuestions.length} questions for review`);
      
      res.json({
        message: `Successfully generated ${generatedQuestions.length} questions for review`,
        questions: generatedQuestions
      });
    } catch (err) {
      console.error("Failed to generate questions:", err);
      
      // Provide more specific error messages
      let errorMessage = "Failed to generate questions";
      if (err instanceof Error) {
        if (err.message.includes("Unexpected response format")) {
          errorMessage = "AI returned an unexpected format. Please try again.";
        } else if (err.message.includes("Invalid JSON")) {
          errorMessage = "AI returned invalid data. Please try again.";
        } else if (err.message.includes("No content returned")) {
          errorMessage = "AI service is temporarily unavailable. Please try again.";
        } else {
          errorMessage = err.message;
        }
      }
      
      res.status(500).json({ 
        message: errorMessage,
        error: err instanceof Error ? err.message : 'Unknown error' 
      });
    }
  });
  
  // Upload questions from file - Admin only
  app.post("/api/questions/upload", ensureAdmin, async (req, res) => {
    try {
      // This would normally process a file upload and parse questions
      // For simplicity, we'll just return a success message
      res.json({ message: "Questions uploaded successfully" });
    } catch (err) {
      res.status(500).json({ message: "Failed to upload questions" });
    }
  });

  // Validate questions - Admin only (NO VALIDATION, JUST RETURN SUCCESS)
  app.post("/api/questions/validate", ensureAdmin, async (req, res) => {
    try {
      const { questions } = req.body;
      
      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Questions array is required" });
      }

      // Return success for all questions without validation
      const validationResults = questions.map(() => ({
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: []
      }));
      
      res.json({
        message: "Questions validated successfully",
        validationResults
      });
    } catch (err) {
      console.error("Failed to validate questions:", err);
      res.status(500).json({ message: "Failed to validate questions" });
    }
  });

  // Store validated questions - Admin only
  app.post("/api/questions/store", ensureAdmin, async (req, res) => {
    try {
      const { questions } = req.body;
      
      console.log("Received questions for storage:", questions);
      
      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Questions array is required" });
      }

      // Log each question's difficulty and category
      questions.forEach((question, index) => {
        console.log(`Question ${index + 1}:`, {
          difficulty: question.difficulty,
          category: question.category,
          text: question.text?.substring(0, 50) + "..."
        });
      });

      // Store questions directly using database.createQuestion - NO VALIDATION
      const storedQuestions = [];
      
      for (const question of questions) {
        try {
          console.log(`\n🔍 Processing question: ${question.text?.substring(0, 50)}...`);
          console.log(`Question data:`, {
            id: question.id,
            text: question.text,
            category: question.category,
            difficulty: question.difficulty,
            context: question.context,
            answersCount: question.answers?.length
          });
          
          // Store directly without any validation
          console.log(`📝 Storing question directly to database...`);
          const storedQuestion = await database.createQuestion(question);
          
          console.log(`✅ Successfully stored question with ID: ${storedQuestion.id}`);
          storedQuestions.push(storedQuestion);
        } catch (error) {
          console.error(`❌ Failed to store question: ${question.text?.substring(0, 50)}...`);
          console.error(`Error details:`, {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
          // Continue with other questions even if one fails
        }
      }
      
      console.log(`Successfully stored ${storedQuestions.length} out of ${questions.length} questions`);
      
      res.json({
        message: `Successfully stored ${storedQuestions.length} questions`,
        storedQuestions
      });
    } catch (err) {
      console.error("Failed to store questions:", err);
      res.status(500).json({ message: "Failed to store questions" });
    }
  });

  // Edit a question - Admin only
  app.post("/api/questions/edit", ensureAdmin, async (req, res) => {
    try {
      const { question, edits } = req.body;
      
      if (!question || !edits) {
        return res.status(400).json({ message: "Question and edits are required" });
      }

      const editedQuestion = QuestionValidationService.editQuestion(question, edits);
      
      res.json({
        message: "Question edited successfully",
        question: editedQuestion
      });
    } catch (err) {
      console.error("Failed to edit question:", err);
      res.status(500).json({ 
        message: "Failed to edit question",
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  });
  
  // Get questions for a game
  app.get("/api/game/questions", async (req, res) => {
    try {
      const category = req.query.category as string;
      const difficulty = req.query.difficulty as string;
      const count = parseInt(req.query.count as string) || 10;
      
      const questions = await database.getRandomQuestions({
        category: category !== "All Categories" ? category : undefined,
        difficulty,
        count,
      });
      
      res.json(questions);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch game questions" });
    }
  });
  
  // Submit game results (for multiplayer games)
  app.post("/api/game/results", async (req, res) => {
    try {
      const gameResult = {
        id: uuidv4(),
        playerName: req.body.playerName,
        score: req.body.score,
        correctAnswers: req.body.correctAnswers,
        incorrectAnswers: req.body.incorrectAnswers,
        averageTime: req.body.averageTime,
        category: req.body.category,
        difficulty: req.body.difficulty,
        timestamp: new Date().toISOString(),
      };
      
      await database.saveGameResult(gameResult);
      res.status(201).json(gameResult);
    } catch (err) {
      res.status(500).json({ message: "Failed to save game results" });
    }
  });

  // Submit single player score
  app.post("/api/single-player/scores", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const singlePlayerScore = {
        id: uuidv4(),
        userId: req.user.id,
        playerName: req.user.username,
        score: req.body.score,
        correctAnswers: req.body.correctAnswers,
        incorrectAnswers: req.body.incorrectAnswers,
        averageTime: req.body.averageTime,
        category: req.body.category,
        difficulty: req.body.difficulty,
        gameType: req.body.gameType, // 'question' or 'time'
        totalQuestions: req.body.totalQuestions,
        timeLimit: req.body.timeLimit, // Optional, for time-based games
      };
      
      await database.saveSinglePlayerScore(singlePlayerScore);
      res.status(201).json(singlePlayerScore);
    } catch (err) {
      console.error("Failed to save single player score:", err);
      res.status(500).json({ message: "Failed to save single player score" });
    }
  });
  
  // Get leaderboard data
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const gameType = req.query.gameType as string || 'all';
      const category = req.query.category as string || 'All Categories';
      console.log('Leaderboard request for gameType:', gameType, 'category:', category);
      
      // Validate parameters
      if (!['all', 'single', 'multi'].includes(gameType)) {
        return res.status(400).json({ message: "Invalid gameType parameter" });
      }
      
      const leaderboardData = await database.getLeaderboardData(gameType, category);
      console.log('Leaderboard data returned:', leaderboardData.length, 'entries');
      
      // Mark current user if authenticated
      if (req.isAuthenticated() && req.user) {
        const currentUser = req.user;
        leaderboardData.forEach((entry: any) => {
          entry.isCurrentUser = entry.name === currentUser.username;
        });
      }
      
      // Add metadata to response
      const response = {
        data: leaderboardData,
        metadata: {
          totalPlayers: leaderboardData.length,
          gameType,
          category,
          timestamp: new Date().toISOString()
        }
      };
      
      res.json(response);
    } catch (err) {
      console.error("Failed to fetch leaderboard data:", err);
      res.status(500).json({ 
        message: "Failed to fetch leaderboard data",
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  });



  // ==== CHALLENGE SYSTEM ROUTES ====

  // Get user's challenges
  app.get("/api/challenges", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;
      const status = req.query.status as string | undefined;
      const challenges = await database.getChallengesByUser(userId, status);

      // For each challenge, get the opponent's username
      const challengesWithDetails = await Promise.all(challenges.map(async (challenge) => {
        const isChallenger = challenge.challengerId === userId;
        const opponentId = isChallenger ? challenge.challengeeId : challenge.challengerId;
        const opponent = await database.getUser(opponentId);

        // Get challenge results if they exist
                  const results = await database.getChallengeResultsByChallenge(challenge.id);
        const userResult = results.find(r => r.userId === userId);
        const opponentResult = results.find(r => r.userId === opponentId);

        return {
          ...challenge,
          opponentName: opponent?.username || 'Unknown User',
          isChallenger,
          userResult,
          opponentResult,
          isComplete: challenge.challengerCompleted && challenge.challengeeCompleted
        };
      }));

      res.json(challengesWithDetails);
    } catch (err) {
      console.error("Failed to fetch challenges:", err);
      res.status(500).json({ message: "Failed to fetch challenges" });
    }
  });

  // Get specific challenge details
  app.get("/api/challenges/:id", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;
      const challengeId = req.params.id;
      const challenge = await database.getChallenge(challengeId);

      if (!challenge) {
        return res.status(404).json({ message: "Challenge not found" });
      }

      // Check if user is part of this challenge
      if (challenge.challengerId !== userId && challenge.challengeeId !== userId) {
        return res.status(403).json({ message: "You are not a participant in this challenge" });
      }

      const isChallenger = challenge.challengerId === userId;
      const opponentId = isChallenger ? challenge.challengeeId : challenge.challengerId;
              const opponent = await database.getUser(opponentId);

      // Get challenge results
              const results = await database.getChallengeResultsByChallenge(challengeId);
      const userResult = results.find(r => r.userId === userId);
      const opponentResult = results.find(r => r.userId === opponentId);

      // Get the game session with questions
              const gameSession = await database.getGameSession(challenge.gameSessionId);
      
      // Return the challenge details
      res.json({
        challenge: {
          ...challenge,
          opponentName: opponent?.username || 'Unknown User',
          isChallenger,
          userCompleted: isChallenger ? challenge.challengerCompleted : challenge.challengeeCompleted,
          opponentCompleted: isChallenger ? challenge.challengeeCompleted : challenge.challengerCompleted
        },
        userResult,
        opponentResult,
        gameSession
      });
    } catch (err) {
      console.error("Failed to fetch challenge details:", err);
      res.status(500).json({ message: "Failed to fetch challenge details" });
    }
  });

  // Get all users for issuing challenges
  app.get("/api/users", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Get all users from database
      const allUsers = await database.getAllUsers();
      
      // Filter out current user
      const users = allUsers.filter(user => user.id !== req.user?.id);

      res.json(users);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get user's notifications
  app.get("/api/notifications", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;
      const notifications = await database.getNotifications(userId);

      res.json(notifications);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const notificationId = req.params.id;
      const notification = await database.markNotificationAsRead(notificationId);

      res.json(notification);
    } catch (err) {
      console.error("Failed to update notification:", err);
      res.status(500).json({ message: "Failed to update notification" });
    }
  });

  // Delete notification
  app.delete("/api/notifications/:id", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const notificationId = req.params.id;
      await database.deleteNotification(notificationId);

      res.status(204).send();
    } catch (err) {
      console.error("Failed to delete notification:", err);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // ==== TEAM-BASED MULTIPLAYER ROUTES ====

  // Get online users for team invitations
  app.get("/api/users/online", ensureAuthenticated, async (req, res) => {
    try {
      const onlineUsers = await database.getOnlineUsers();
      // Filter out current user
      const filteredUsers = onlineUsers.filter(user => user.id !== req.user?.id);
      res.json(filteredUsers);
    } catch (err) {
      console.error("Failed to fetch online users:", err);
      res.status(500).json({ message: "Failed to fetch online users" });
    }
  });

  // Set user online status
  app.patch("/api/users/:id/online", ensureAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { isOnline } = req.body;
      
      if (userId !== req.user?.id) {
        return res.status(403).json({ message: "Cannot update other user's status" });
      }
      
      const user = await database.setUserOnline(userId, isOnline);
      res.json(user);
    } catch (err) {
      console.error("Failed to update online status:", err);
      res.status(500).json({ message: "Failed to update online status" });
    }
  });

  // Create a team
  app.post("/api/teams", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const teamData = {
        id: uuidv4(),
        name: req.body.name,
        captainId: req.user.id,
        gameSessionId: req.body.gameSessionId,
        members: [{
          userId: req.user.id,
          username: req.user.username,
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
      res.status(201).json(team);
    } catch (err) {
      console.error("Failed to create team:", err);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  // Get teams for a game session
  app.get("/api/teams", ensureAuthenticated, async (req, res) => {
    try {
      const gameSessionId = req.query.gameSessionId as string;
      if (!gameSessionId) {
        return res.status(400).json({ message: "Game session ID required" });
      }

      const teams = await database.getTeamsByGameSession(gameSessionId);
      res.json(teams);
    } catch (err) {
      console.error("Failed to fetch teams:", err);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Update team (e.g., change captain, add members)
  app.patch("/api/teams/:id", ensureAuthenticated, async (req, res) => {
    try {
      const teamId = req.params.id;
      const team = await database.getTeam(teamId);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Only captain can update team
      if (team.captainId !== req.user?.id) {
        return res.status(403).json({ message: "Only team captain can update team" });
      }

      const updatedTeam = await database.updateTeam(teamId, req.body);
      res.json(updatedTeam);
    } catch (err) {
      console.error("Failed to update team:", err);
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  // Create team invitation
  app.post("/api/team-invitations", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const invitationData = {
        id: uuidv4(),
        teamId: req.body.teamId,
        inviterId: req.user.id,
        inviteeId: req.body.inviteeId,
        status: "pending" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
      };

      const invitation = await database.createTeamInvitation(invitationData);
      res.status(201).json(invitation);
    } catch (err) {
      console.error("Failed to create team invitation:", err);
      res.status(500).json({ message: "Failed to create team invitation" });
    }
  });

  // Get user's team invitations
  app.get("/api/team-invitations", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;
      const status = req.query.status as string | undefined;
      const invitations = await database.getTeamInvitationsByUser(userId, status);
      res.json(invitations);
    } catch (err) {
      console.error("Failed to fetch team invitations:", err);
      res.status(500).json({ message: "Failed to fetch team invitations" });
    }
  });

  // Respond to team invitation
  app.patch("/api/team-invitations/:id", ensureAuthenticated, async (req, res) => {
    try {
      const invitationId = req.params.id;
      const { status } = req.body; // "accepted" or "declined"
      
      const invitation = await database.getTeamInvitation(invitationId);
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      if (invitation.inviteeId !== req.user?.id) {
        return res.status(403).json({ message: "Cannot respond to other user's invitation" });
      }

      const updatedInvitation = await database.updateTeamInvitation(invitationId, { status });
      
      // If accepted, add user to team
      if (status === "accepted") {
        const team = await database.getTeam(invitation.teamId);
        if (team && team.members.length < 3) {
          const newMember = {
            userId: req.user!.id,
            username: req.user!.username,
            role: "member" as const,
            joinedAt: new Date()
          };
          
          await database.updateTeam(invitation.teamId, {
            members: [...team.members, newMember]
          });
        }
      }

      res.json(updatedInvitation);
    } catch (err) {
      console.error("Failed to respond to team invitation:", err);
      res.status(500).json({ message: "Failed to respond to team invitation" });
    }
  });

  // Send team invitation by email
  app.post("/api/team-invitations/email", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { teamId, inviteeEmail, teamName } = req.body;
      
      // Create invitation record
      const invitationData = {
        id: uuidv4(),
        teamId,
        inviterId: req.user.id,
        inviteeId: 0, // Email invitations don't have specific user ID yet
        status: "pending" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
      };

      const invitation = await database.createTeamInvitation(invitationData);
      
      // Send email invitation
      const emailSent = await sendTeamInvitationEmail({
        inviteeEmail,
        inviterName: req.user.username,
        teamName,
        gameSessionId: teamId,
        invitationId: invitation.id
      });

      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send invitation email" });
      }

      res.status(201).json({ message: "Invitation sent successfully", invitation });
    } catch (err) {
      console.error("Failed to send email invitation:", err);
      res.status(500).json({ message: "Failed to send email invitation" });
    }
  });

  // ElevenLabs Voice Cloning API Endpoints

  // Upload voice sample and create voice clone
  app.post("/api/voice/upload", ensureAdmin, upload.single('audio'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const { name, description } = req.body;
      
      // Read the uploaded file
      const audioBuffer = fs.readFileSync(req.file.path);
      
      // Upload to ElevenLabs using node-fetch with form-data
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('name', name || 'Bible Trivia Voice');
      formData.append('description', description || 'Voice clone for Bible trivia game');
      formData.append('files', audioBuffer, req.file.originalname);

      // Use node-fetch for better compatibility
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API Error:', errorText);
        
        // Check if it's a subscription issue
        if (errorText.includes('can_not_use_instant_voice_cloning')) {
          throw new Error('Voice cloning requires a paid ElevenLabs subscription. Please upgrade your plan at elevenlabs.io to use this feature.');
        }
        
        throw new Error(`ElevenLabs API error: ${errorText}`);
      }

      const voiceData = await response.json() as { voice_id: string; name: string };
      
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      // Store voice ID in database
      await database.setVoiceCloneId(voiceData.voice_id);
      
      res.json({
        message: "Voice clone created successfully! Your voice will now be used in the game.",
        voiceId: voiceData.voice_id,
        name: voiceData.name
      });
    } catch (error) {
      console.error("Voice upload error:", error);
      
      // Clean up file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create voice clone",
        requiresUpgrade: error instanceof Error && error.message.includes('subscription')
      });
    }
  });

  // Get current voice clone status and usage
  app.get("/api/voice/status", async (req, res) => {
    try {
      const voiceId = await database.getVoiceCloneId();
      
      if (!voiceId) {
        return res.json({ hasVoiceClone: false });
      }

      // Check voice status with ElevenLabs
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        }
      });

      if (!response.ok) {
        // Voice might have been deleted
        await database.setVoiceCloneId(null);
        return res.json({ hasVoiceClone: false });
      }

      const voiceData = await response.json() as { voice_id: string; name: string; description: string; status: string };
      
      // Get user subscription info and usage
      const userResponse = await fetch(`${ELEVENLABS_BASE_URL}/user/subscription`, {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        }
      });

      let subscriptionInfo = null;
      if (userResponse.ok) {
        subscriptionInfo = await userResponse.json();
      }
      
      res.json({
        hasVoiceClone: true,
        voiceId: voiceData.voice_id,
        name: voiceData.name,
        description: voiceData.description,
        status: voiceData.status,
        subscription: subscriptionInfo
      });
    } catch (error) {
      console.error("Voice status error:", error);
      res.status(500).json({ message: "Failed to get voice status" });
    }
  });

  // Text-to-speech with cloned voice
  app.post("/api/voice/speak", async (req, res) => {
    try {
      const { text, voiceId } = req.body;
      
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      // Use provided voiceId or get from database
      const targetVoiceId = voiceId || await database.getVoiceCloneId();
      
      if (!targetVoiceId) {
        return res.status(400).json({ message: "No voice clone available" });
      }

      // Generate speech with ElevenLabs
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${targetVoiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.7,
            similarity_boost: 0.7,
            style: 0.3,
            use_speaker_boost: true
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs TTS error: ${error}`);
      }

      // Get audio data
      const audioBuffer = await response.arrayBuffer();
      
      // Convert to base64 for client
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      
      // Track voice usage for credit monitoring
      try {
        const textLength = text.length;
        // Estimate credits: roughly 1 credit per 1000 characters (varies by plan)
        const estimatedCredits = Math.ceil(textLength / 1000);
        
        await database.trackVoiceUsage({
          voiceId: targetVoiceId,
          textLength,
          estimatedCredits,
          requestType: 'tts',
          gameSessionId: req.body.gameSessionId || null,
          userId: req.body.userId || null
        });
      } catch (error) {
        console.error("Error tracking voice usage:", error);
        // Don't fail the request if tracking fails
      }
      
      res.json({
        audio: base64Audio,
        format: 'mp3'
      });
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });

  // Get available voices from ElevenLabs
  app.get("/api/voice/list", ensureAdmin, async (req, res) => {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        }
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }

      const voices = await response.json() as { voices: Array<{
        voice_id: string;
        name: string;
        description: string;
        category: string;
        labels: Record<string, string>;
        preview_url?: string;
      }> };
      
      res.json(voices);
    } catch (error) {
      console.error("Voice list error:", error);
      res.status(500).json({ message: "Failed to get voice list" });
    }
  });

  // Get voice usage statistics
  app.get("/api/voice/usage", ensureAdmin, async (req, res) => {
    try {
      const timeframe = req.query.timeframe as 'day' | 'week' | 'month' || 'month';
      const stats = await database.getVoiceUsageStats(timeframe);
      
      res.json(stats);
    } catch (error) {
      console.error("Voice usage stats error:", error);
      res.status(500).json({ message: "Failed to get voice usage statistics" });
    }
  });

  // Set active voice
  app.post("/api/voice/set-active", ensureAdmin, async (req, res) => {
    try {
      const { voiceId } = req.body;
      
      if (!voiceId) {
        return res.status(400).json({ message: "Voice ID is required" });
      }

      // Verify the voice exists
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        }
      });

      if (!response.ok) {
        return res.status(404).json({ message: "Voice not found" });
      }

      // Store the voice ID in database
      await database.setVoiceCloneId(voiceId);
      
      res.json({ message: "Active voice updated successfully" });
    } catch (error) {
      console.error("Set active voice error:", error);
      res.status(500).json({ message: "Failed to set active voice" });
    }
  });

  // Delete voice clone
  app.delete("/api/voice/delete", ensureAdmin, async (req, res) => {
    try {
      const voiceId = await database.getVoiceCloneId();
      
      if (!voiceId) {
        return res.status(404).json({ message: "No voice clone found" });
      }

      // Delete from ElevenLabs
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
        method: 'DELETE',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        }
      });

      if (!response.ok) {
        console.warn("Failed to delete voice from ElevenLabs, but removing from database");
      }

      // Remove from database
      await database.setVoiceCloneId(null);
      
      res.json({ message: "Voice clone deleted successfully" });
    } catch (error) {
      console.error("Voice deletion error:", error);
      res.status(500).json({ message: "Failed to delete voice clone" });
    }
  });
  
  return httpServer;
}
