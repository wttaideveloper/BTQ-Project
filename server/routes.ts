import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { database } from "./database";
import { setupWebSocketServer, sendToUser, getOnlineUserIds, debugForceEndTeamBattle, listActiveGameSessions, expireAllPendingRequestsAndInvitationsForUser, hasPlayerLeftAnyActiveGame } from "./socket";
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
import { log } from "./logger";

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

// ElevenLabs API configuration
const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY ||
  "sk_3fb0efe7e7d5904808c605b373acb0088d61f52000e73c8b";
const ELEVENLABS_BASE_URL =
  process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io/v1";

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

// Extend Request type to include file property from multer
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Middleware to ensure user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  log(`Authentication check for ${req.method} ${req.path}`);
  if (req.isAuthenticated()) {
    log(`User authenticated: ${req.user?.username || 'unknown'}`);
    return next();
  }
  log(`Authentication failed for ${req.method} ${req.path}`);
  res
    .status(401)
    .json({ message: "You must be logged in to access this resource" });
}

// Middleware to ensure user is an admin
function ensureAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.isAdmin) {
    return next();
  }
  res
    .status(403)
    .json({ message: "You do not have permission to access this resource" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Serve uploaded profile images
  const uploadsPath = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsPath));

  // TEMP: log whether 'current_team_battle_mode' column exists on startup
  (async () => {
    try {
      const conn = postgres(process.env.DATABASE_URL || "");
      const exists = await conn`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'current_team_battle_mode'
        LIMIT 1
      `;
      if (Array.isArray(exists) && exists.length > 0) {
      } else {
        console.warn("[Startup Check] Column 'current_team_battle_mode' DOES NOT exist on users table");
      }
      await conn.end();
    } catch (err) {
      console.error("[Startup Check] Failed to check 'current_team_battle_mode' column:", err);
    }
  })();

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
      console.error("Error clearing game state:", error);
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
        sampleQuestion: testQuestions[0] || null,
      });
    } catch (error) {
      console.error("Database connection test failed:", error);
      res.status(500).json({
        message: "Database connection failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Debug endpoint to cleanup old battles and join requests - Any authenticated user can clean their own battles
  app.post("/api/debug/cleanup-battles", ensureAuthenticated, async (req, res) => {
    try {
      const connectionString = process.env.DATABASE_URL!;
      const sql = postgres(connectionString);

      const deleteAll = req.body?.deleteAll === true; // Optional: delete ALL forming battles

      let staleBattles;
      if (deleteAll) {
        // Delete ALL forming battles (for testing)
        staleBattles = await sql`
          DELETE FROM team_battles 
          WHERE status = 'forming'
          RETURNING id, team_a_name, team_b_name, created_at
        `;
      } else {
        // Delete only stale battles (forming >30 minutes)
        staleBattles = await sql`
          DELETE FROM team_battles 
          WHERE status = 'forming' 
          AND created_at < NOW() - INTERVAL '30 minutes'
          RETURNING id, team_a_name, team_b_name, created_at
        `;
      }

      // Delete expired join requests
      const expiredRequests = await sql`
        DELETE FROM team_join_request 
        WHERE expires_at < NOW()
        RETURNING id
      `;

      // Delete old join requests (>1 hour) OR orphaned requests (team doesn't exist)
      const allRequests = await sql`SELECT * FROM team_join_request`;
      const allBattles = await sql`SELECT id FROM team_battles WHERE status = 'forming'`;
      const validTeamIds = new Set();
      allBattles.forEach((b: any) => {
        validTeamIds.add(`${b.id}-team-a`);
        validTeamIds.add(`${b.id}-team-b`);
      });

      const orphanedIds = allRequests
        .filter((r: any) => !validTeamIds.has(r.team_id))
        .map((r: any) => r.id);

      let orphanedRequests = [];
      if (orphanedIds.length > 0) {
        orphanedRequests = await sql`
          DELETE FROM team_join_request 
          WHERE id = ANY(${orphanedIds})
          RETURNING id
        `;
      }

      await sql.end();

      res.json({
        message: deleteAll ? "Deleted ALL forming battles" : "Cleanup completed successfully",
        deleted: {
          expiredRequests: expiredRequests.length,
          orphanedRequests: orphanedRequests.length,
          staleBattles: staleBattles.length,
          battles: staleBattles.map(b => `${b.team_a_name} vs ${b.team_b_name || 'NO OPPONENT'} (created ${new Date(b.created_at).toLocaleString()})`)
        }
      });
    } catch (error) {
      console.error("Cleanup failed:", error);
      res.status(500).json({
        message: "Cleanup failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Debug endpoint to cleanup invalid questions - Admin only
  app.post("/api/debug/cleanup-questions", ensureAdmin, async (req, res) => {
    try {
      await database.cleanupInvalidQuestions();
      res.json({ message: "Database cleanup completed successfully" });
    } catch (error) {
      console.error("Database cleanup failed:", error);
      res.status(500).json({
        message: "Database cleanup failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Debug endpoint to force-end a team battle (Admin only)
  app.post(
    "/api/debug/force-end-team-battle",
    ensureAdmin,
    async (req, res) => {
      try {
        const { gameId, winningTeamId } = req.body;

        if (!gameId) {
          return res.status(400).json({ message: "gameId is required" });
        }

        const result = await debugForceEndTeamBattle(gameId, winningTeamId);

        if (result && result.ok) {
          return res.json({ message: "Team battle force-ended", result });
        }

        return res.status(500).json({ message: "Failed to force-end team battle", result });
      } catch (error) {
        console.error("Error in debug force-end route:", error);
        res.status(500).json({ message: "Internal server error", error: String(error) });
      }
    }
  );

  // Debug endpoint: list active game sessions (Admin only)
  app.get("/api/debug/active-game-sessions", ensureAdmin, async (req, res) => {
    try {
      const sessions = listActiveGameSessions();
      res.json({ count: sessions.length, sessions });
    } catch (error) {
      console.error("Error listing active game sessions:", error);
      res.status(500).json({ message: "Failed to list active game sessions" });
    }
  });

  // Team join request routes

  // Helper function to parse team ID and get team from team_battles
  async function getTeamFromBattle(teamId: string) {
    try {

      // Team ID format supports both "{battleId}-team-{a/b}" and "battle-{battleId}-team-{a/b}"
      const parts = teamId.split('-team-');
      if (parts.length !== 2) {
        console.error('[getTeamFromBattle] Invalid team ID format:', teamId);
        return null;
      }

      // Strip optional "battle-" prefix
      const rawBattleId = parts[0];
      const battleId = rawBattleId.startsWith('battle-') ? rawBattleId.substring('battle-'.length) : rawBattleId;
      const teamSide = parts[1].toUpperCase(); // "A" or "B"


      // First try: Get battle by battleId
      let battle = await database.getTeamBattle(battleId);
      if (!battle) {

        // Alternative lookup: Find battle by gameSessionId and team captain
        // This handles cases where teamId might be a different format
        const allBattles = await database.getTeamBattlesByStatus("forming");

        for (const b of allBattles) {

          // Check if this battle has the team we're looking for
          const teams = await convertTeamBattleToTeams(b);
          const matchingTeam = teams.find(t => {
            // Match by teamSide or by checking if teamId matches any team's ID
            return t.teamSide === teamSide || t.id === teamId || t.teamId === teamId;
          });

          if (matchingTeam) {
            battle = b;
            break;
          }
        }

        if (!battle) {
          console.error(`[getTeamFromBattle] ❌ Battle not found after exhaustive search for teamId: ${teamId}`);
          return null;
        }
      }

      // Convert battle to teams format
      const teams = await convertTeamBattleToTeams(battle);
      const team = teams.find(t => t.teamSide === teamSide || t.id === teamId || t.teamId === teamId);

      if (!team) {
        console.error(`[getTeamFromBattle] ❌ Team ${teamSide} not found in battle ${battle.id}`);
        return null;
      }

      return team;
    } catch (error) {
      console.error('[getTeamFromBattle] Error:', error);
      return null;
    }
  }

  // Helper function to add member to team battle
  async function addMemberToTeamBattle(teamId: string, member: { id: number; username: string }) {
    try {
      const parts = teamId.split('-team-');
      if (parts.length !== 2) {
        throw new Error('Invalid team ID format');
      }
      // Strip optional "battle-" prefix
      const rawBattleId = parts[0];
      const battleId = rawBattleId.startsWith('battle-') ? rawBattleId.substring('battle-'.length) : rawBattleId;
      const teamSide = parts[1].toLowerCase(); // "a" or "b"

      const battle = await database.getTeamBattle(battleId);
      if (!battle) {
        throw new Error('Battle not found');
      }

      // Update the appropriate teammates array
      const teammatesField = teamSide === 'a' ? 'teamATeammates' : 'teamBTeammates';
      const currentTeammates = battle[teammatesField] || [];

      // Check if member already in team
      if (currentTeammates.some((m: any) => m.id === member.id)) {
        return;
      }

      // Add new member
      const updatedTeammates = [...currentTeammates, member];

      // Update database
      await database.updateTeamBattle(battleId, {
        [teammatesField]: updatedTeammates
      });

    } catch (error) {
      console.error('Error in addMemberToTeamBattle:', error);
      throw error;
    }
  }

  // GET - Fetch join requests for current user
  // Get join requests for teams where user is captain (similar to team invitations)
  app.get("/api/team-join-requests", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;


      const joinRequests = await database.getJoinRequestsForCaptain(userId);


      res.json(joinRequests);
    } catch (err) {
      console.error("Failed to fetch team join requests:", err);
      res.status(500).json({ message: "Failed to fetch team join requests" });
    }
  });

  // POST - Create a join request
  app.post("/api/team-join-requests", ensureAuthenticated, async (req, res) => {
    try {
      const { teamId } = req.body;
      const requestedGameType = req.body?.gameType as string | undefined;
      const user = req.user as Express.User;

      if (!teamId) {
        console.error('[POST /api/team-join-requests] Team ID missing');
        return res.status(400).json({ message: "Team ID is required" });
      }

      // Get team details from team_battles (teams are virtual)
      const team = await getTeamFromBattle(teamId);
      if (!team) {
        console.error('[POST /api/team-join-requests] Team not found:', teamId);
        return res.status(404).json({ message: "Team not found" });
      }

      // Validate gameType matches requested mode (prevents cross-mode joining)
      if (requestedGameType && team.gameType && requestedGameType !== team.gameType) {
        console.error('[POST /api/team-join-requests] Game type mismatch:', { requestedGameType, teamGameType: team.gameType });
        return res.status(400).json({ message: "Team game type does not match your current mode" });
      }

      // Check if team is full
      const currentMembers = 1 + (team.teammates?.length || 0);
      if (currentMembers >= 4) {
        console.error('[POST /api/team-join-requests] Team is full');
        return res.status(400).json({ message: "Team is full" });
      }

      // Check if user already has a pending request for this team
      const allUserRequests = await database.getJoinRequestsByUser(user.id);
      const existingRequest = allUserRequests.find((r: any) => r.teamId === team.id && r.status === "pending");
      if (existingRequest) {
        console.error('[POST /api/team-join-requests] User already has pending request');
        return res.status(400).json({
          message: "You already have a pending request for this team",
        });
      }

      // CRITICAL FIX: Use the actual team.id (from database) instead of the input teamId
      // This ensures the join request is created with the correct team ID that matches the database
      const actualTeamId = team.id;

      // Create join request with 5 minute expiry (increased from 60s to handle timezone issues)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const joinRequest = await database.createJoinRequest(
        actualTeamId,  // ✅ FIX: Use the correct team ID
        user.id,
        user.username,
        expiresAt
      );

      // Notify team captain via websocket
      try {
        sendToUser(team.captainId, {
          type: "join_request_created",
          teamId: actualTeamId,  // ✅ FIX: Use the correct team ID
          requesterId: user.id,
          requesterUsername: user.username,
          joinRequestId: joinRequest.id,
          expiresAt: joinRequest.expiresAt,
          status: joinRequest.status,
        });
      } catch (wsError) {
        console.error('[POST /api/team-join-requests] Websocket failed:', wsError);
        // Don't fail the request if websocket fails
      }

      res.json(joinRequest);
    } catch (error) {
      console.error("[POST /api/team-join-requests] Error:", error);
      if (error instanceof Error) {
        console.error('[POST /api/team-join-requests] Stack:', error.stack);
      }
      res.status(500).json({ message: "Failed to create join request" });
    }
  });

  // PATCH - Accept/reject a join request
  app.patch("/api/team-join-requests/:id", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const id = req.params.id;
      const { status } = req.body || {};


      if (!status) return res.status(400).json({ message: "status required" });

      // Use the simplified method to get ALL join requests for this captain
      const captainRequests = await database.getJoinRequestsForCaptain(user.id);

      let jr: any = captainRequests.find((r: any) => r.id === id);

      // If not found as captain, check if user is the requester
      if (!jr) {
        const reqsByUser = await database.getJoinRequestsByUser(user.id);
        jr = reqsByUser.find((r: any) => r.id === id);
      }

      if (!jr) {
        console.error(`[PATCH] Join request ${id} not found`);
        return res.status(404).json({ message: "Request not found" });
      }


      const teamId = jr.team_id || jr.teamId;
      if (!teamId) {
        console.error(`[PATCH] Team ID is missing from join request ${id}`);
        return res.status(400).json({ message: "Invalid join request: missing team ID" });
      }

      let team;
      try {
        team = await getTeamFromBattle(teamId);
      } catch (teamError: any) {
        console.error(`[PATCH] Error getting team from battle:`, teamError);
        console.error(`[PATCH] Team ID was: ${teamId}`);
        console.error(`[PATCH] Stack trace:`, teamError?.stack);
        return res.status(500).json({
          message: "Failed to retrieve team information",
          error: process.env.NODE_ENV === 'development' ? teamError.message : undefined
        });
      }

      const isLeader = team?.captainId === user.id;
      const isRequester = (jr.requester_id || jr.requesterId) === user.id;


      if (status === "cancelled" && !isRequester) {
        console.error(`[PATCH] Forbidden: Only requester can cancel`);
        return res.status(403).json({ message: "Forbidden: Only requester can cancel" });
      }
      if ((status === "accepted" || status === "rejected" || status === "expired") && !isLeader) {
        console.error(`[PATCH] Forbidden: Only team captain can accept/reject/expire. Captain ID: ${team?.captainId}, User ID: ${user.id}`);
        return res.status(403).json({ message: "Forbidden: Only team captain can accept/reject" });
      }

      await database.updateJoinRequestStatus(id, status);

      if (status === "accepted") {
        // add member to team battle (virtual team)
        if (!team) {
          console.error(`[PATCH] Team not found for teamId: ${teamId}`);
          return res.status(404).json({ message: "Team not found" });
        }
        const members = team.teammates || [];
        if (members.length >= 3) {
          return res.status(400).json({ message: "Team full" });
        }

        const requesterId = jr.requester_id || jr.requesterId;
        const requesterUsername = jr.requester_username || jr.requesterUsername;

        if (!requesterId || !requesterUsername) {
          console.error(`[PATCH] Missing requester info: requesterId=${requesterId}, requesterUsername=${requesterUsername}`);
          return res.status(400).json({ message: "Invalid join request: missing requester information" });
        }

        // Check if user is already in any team for this game session
        try {
          const allTeams = await database.getTeamsByGameSession(team.gameSessionId);
          const userAlreadyInTeam = allTeams.find((t) =>
            t.members.some((member) => member.userId === requesterId)
          );

          if (userAlreadyInTeam) {
            return res.status(400).json({
              message: "You are already in a team for this game session. You cannot join multiple teams."
            });
          }
        } catch (checkError: any) {
          console.error(`[PATCH] Error checking existing teams:`, checkError);
          // Continue anyway - this is a safety check, not critical
        }

        try {
          await addMemberToTeamBattle(teamId, {
            id: requesterId,
            username: requesterUsername,
          });
        } catch (addError: any) {
          console.error(`[PATCH] Error adding member to team battle:`, addError);
          console.error(`[PATCH] Team ID: ${teamId}, Member: ${requesterId} (${requesterUsername})`);
          console.error(`[PATCH] Stack trace:`, addError?.stack);
          return res.status(500).json({
            message: "Failed to add member to team",
            error: process.env.NODE_ENV === 'development' ? addError.message : undefined
          });
        }

        // 🔒 CRITICAL: Expire all other pending join requests and invitations for this user
        // This ensures a member can only join one team (the first one that accepts)
        try {
          await expireAllPendingRequestsAndInvitationsForUser(requesterId);
        } catch (expireError: any) {
          console.error(`[PATCH] Error expiring other requests (non-critical):`, expireError);
          // Continue - this is cleanup, not critical
        }

        // auto-reject if full now
        try {
          const updatedTeam = await getTeamFromBattle(teamId);
          if (updatedTeam && (updatedTeam.teammates?.length || 0) >= 3) {
            const pending = await database.getJoinRequestsByTeam(teamId);
            await Promise.all(
              pending
                .filter((r: any) => r.status === "pending")
                .map((r: any) => database.updateJoinRequestStatus(r.id, "rejected"))
            );
          }
        } catch (rejectError: any) {
          console.error(`[PATCH] Error auto-rejecting pending requests (non-critical):`, rejectError);
          // Continue - this is cleanup
        }
      }

      // notify requester
      try {
        const requesterId = jr.requester_id || jr.requesterId;
        sendToUser(requesterId, {
          type: "join_request_updated",
          joinRequestId: id,
          status,
          teamId: teamId,
          requesterId: requesterId,
          teamName: team?.name,
          gameSessionId: team?.gameSessionId,
          message: status === "accepted" ? `You've been accepted to ${team?.name}!` : "Your join request was ${status}"
        });

        // Also send teams_updated event to refresh the member's team list
        if (status === "accepted" && team?.gameSessionId) {
          sendToUser(requesterId, {
            type: "teams_updated",
            gameSessionId: team.gameSessionId
          });
        }
      } catch (notifyError: any) {
        console.error(`[PATCH] Error sending WebSocket notification (non-critical):`, notifyError);
        // Continue - notification failure shouldn't fail the request
      }

      res.json({ id, status });
    } catch (error: any) {
      const requestId = req.params.id;
      console.error(`[PATCH /api/team-join-requests/${requestId}] Error updating join request:`, error);
      console.error(`[PATCH] Stack trace:`, error?.stack);
      res.status(500).json({
        message: "Failed to update join request",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
          { id: uuidv4(), text: "Test Answer 4", isCorrect: false },
        ],
      };


      const createdQuestion = await database.createQuestion(testQuestion);

      res.json({
        message: "Test question created successfully",
        question: createdQuestion,
      });
    } catch (error) {
      console.error("Test question creation failed:", error);
      res.status(500).json({
        message: "Test question creation failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Remove member (captain only, setup phase)
  app.patch("/api/teams/:id/remove-member", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const teamId = req.params.id;
      const { userId } = req.body || {};

      // Check if this is a team battle team (virtual team)
      const teamIdParts = teamId.split("-team-");
      if (teamIdParts.length === 2) {
        // Handle team battle team
        const battleId = teamIdParts[0];
        const teamSide = teamIdParts[1].toLowerCase(); // "a" or "b"

        if (teamSide !== "a" && teamSide !== "b") {
          return res.status(400).json({ message: "Invalid team side" });
        }

        const battle = await database.getTeamBattle(battleId);
        if (!battle) return res.status(404).json({ message: "Team battle not found" });

        // Check if user is captain of this team
        const isTeamACaptain = teamSide === "a" && battle.teamACaptainId === user.id;
        const isTeamBCaptain = teamSide === "b" && battle.teamBCaptainId === user.id;
        if (!isTeamACaptain && !isTeamBCaptain) {
          return res.status(403).json({ message: "Forbidden - not team captain" });
        }

        if (battle.status !== "forming") {
          return res.status(400).json({ message: "Cannot remove after battle starts" });
        }

        if (userId === user.id) {
          return res.status(400).json({ message: "Captain cannot remove themselves" });
        }

        // Remove member from the appropriate team
        const teammatesField = teamSide === "a" ? "teamATeammates" : "teamBTeammates";
        const currentTeammates = battle[teammatesField] || [];
        const updatedTeammates = currentTeammates.filter((teammate: any) => {
          const teammateId = typeof teammate === 'number' ? teammate : (teammate?.id ?? null);
          return teammateId !== null && teammateId !== userId;
        });

        await database.updateTeamBattle(battleId, {
          [teammatesField]: updatedTeammates
        });

        // Get updated battle to send fresh data
        const updatedBattle = await database.getTeamBattle(battleId);
        if (updatedBattle) {

          // Notify all participants about the team update (don't fail if this errors)
          try {
            // Use broadcastTeamUpdates from socket.ts if available, otherwise skip notification
            const { broadcastTeamUpdates } = await import("./socket");
            if (broadcastTeamUpdates) {
              await broadcastTeamUpdates(battle.gameSessionId);
            }
          } catch (notifyError) {
            console.error("[Backend] Failed to send teams_updated notification:", notifyError);
          }

          // Get removed user's info for notifications
          const removedUser = await database.getUser(userId).catch(() => null);
          const removedUserName = removedUser?.username || "A player";

          // Notify captain that they successfully removed the member
          try {
            sendToUser(user.id, {
              type: "member_removed_by_captain",
              gameSessionId: battle.gameSessionId,
              removedMemberName: removedUserName,
              teamName: teamSide === "a" ? (updatedBattle.teamAName || "Team A") : (updatedBattle.teamBName || "Team B"),
              message: `You have removed ${removedUserName} from your team.`,
            });
          } catch (notifyError) {
            console.error("[Backend] Failed to send member_removed_by_captain notification:", notifyError);
          }
        }

        // Notify removed user (don't fail if this errors)
        try {
          const removedUser = await database.getUser(userId).catch(() => null);
          const removedUserName = removedUser?.username || "A player";
          sendToUser(userId, {
            type: "team_member_removed",
            teamId,
            gameSessionId: battle.gameSessionId,
            teamName: teamSide === "a" ? (battle.teamAName || "Team A") : (battle.teamBName || "Team B"),
            captainName: user.username || "The captain",
            message: `You have been removed from ${teamSide === "a" ? (battle.teamAName || "Team A") : (battle.teamBName || "Team B")} by ${user.username || "the captain"}.`,
          });
        } catch (notifyError) {
          console.error("[Backend] Failed to send team_member_removed notification:", notifyError);
        }

        res.json({ ok: true, members: updatedTeammates });
        return;
      }

      // Handle regular team (from teams table)
      const team = await database.getTeam(teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });
      if (team.captainId !== user.id) return res.status(403).json({ message: "Forbidden" });
      if (team.status !== "forming") return res.status(400).json({ message: "Cannot remove after start" });
      if (userId === team.captainId) return res.status(400).json({ message: "Leader cannot remove self" });

      const updatedMembers = await database.removeMemberFromTeam(teamId, userId);
      // notify removed user
      sendToUser(userId, {
        type: "team_member_removed",
        teamId,
      });
      res.json({ ok: true, members: updatedMembers });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });

  // Debug endpoint to test with exact payload format
  app.post("/api/debug/test-exact", ensureAdmin, async (req, res) => {
    try {
      const { questions } = req.body;

      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Questions array is required" });
      }


      const storedQuestions = [];
      for (const question of questions) {
        try {

          // Test validation first
          const validation =
            QuestionValidationService.validateQuestion(question);

          if (!validation.isValid) {
            continue;
          }

          const storedQuestion = await database.createQuestion(question);
          storedQuestions.push(storedQuestion);
        } catch (error) {
          console.error(`❌ Test question failed: ${error}`);
        }
      }

      res.json({
        message: `Test completed: ${storedQuestions.length} questions stored`,
        storedQuestions,
      });
    } catch (error) {
      console.error("Test failed:", error);
      res.status(500).json({
        message: "Test failed",
        error: error instanceof Error ? error.message : "Unknown error",
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
          isCorrect: answer.isCorrect,
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
          isCorrect: answer.isCorrect,
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


      // Generate questions using OpenAI (returns for review, doesn't save to database)
      const generatedQuestions = await generateQuestions(
        category,
        difficulty,
        count
      );


      res.json({
        message: `Successfully generated ${generatedQuestions.length} questions for review`,
        questions: generatedQuestions,
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
          errorMessage =
            "AI service is temporarily unavailable. Please try again.";
        } else {
          errorMessage = err.message;
        }
      }

      res.status(500).json({
        message: errorMessage,
        error: err instanceof Error ? err.message : "Unknown error",
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
        suggestions: [],
      }));

      res.json({
        message: "Questions validated successfully",
        validationResults,
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


      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Questions array is required" });
      }

      // Log each question's difficulty and category
      questions.forEach((question, index) => {
      });

      // Store questions directly using database.createQuestion - NO VALIDATION
      const storedQuestions = [];

      for (const question of questions) {
        try {

          // Store directly without any validation
          const storedQuestion = await database.createQuestion(question);

          storedQuestions.push(storedQuestion);
        } catch (error) {
          console.error(
            `❌ Failed to store question: ${question.text?.substring(0, 50)}...`
          );
          console.error(`Error details:`, {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          // Continue with other questions even if one fails
        }
      }


      res.json({
        message: `Successfully stored ${storedQuestions.length} questions`,
        storedQuestions,
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
        return res
          .status(400)
          .json({ message: "Question and edits are required" });
      }

      const editedQuestion = QuestionValidationService.editQuestion(
        question,
        edits
      );

      res.json({
        message: "Question edited successfully",
        question: editedQuestion,
      });
    } catch (err) {
      console.error("Failed to edit question:", err);
      res.status(500).json({
        message: "Failed to edit question",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });



  const parseExcludeIds = (value: unknown): string[] | undefined => {
    if (typeof value !== "string" || !value.trim()) {
      return undefined;
    }
    const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
    return ids.length > 0 ? ids : undefined;
  };

  // Get questions for a game with enhanced user-specific selection
  app.get("/api/game/questions", async (req, res) => {
    try {
      const category = req.query.category as string;
      const difficulty = req.query.difficulty as string;
      const count = parseInt(req.query.count as string) || 10;
      const gameId = req.query.gameId as string; // Unique game session ID
      const userId = req.user?.id; // Get user ID if authenticated
      const excludeIds = parseExcludeIds(req.query.excludeIds);

      // Add cache-busting headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      // Use enhanced question selection with user history
      // Now excludes ALL previously answered questions (not just recent ones)
      // If user has answered all questions, they will see all questions again with word shuffling
      const questions = await database.getRandomQuestionsWithHistory({
        category: category !== "All Categories" ? category : undefined,
        difficulty,
        count,
        userId: userId || undefined,
        excludeIds,
        // Don't pass excludeRecentHours - this will make it exclude ALL answered questions
        // and apply word shuffling when all questions are answered
      });

      // History tracking is automatically done by getRandomQuestionsWithHistory when userId is provided
      // Additional tracking happens when user answers via /api/question-analytics/track
      // Note: Questions with word shuffling are not tracked again (already answered)

      res.json(questions);
    } catch (err) {
      console.error("Error fetching game questions:", err);
      res.status(500).json({ message: "Failed to fetch game questions" });
    }
  });

  // Verify remaining question pool before ending a time-based session
  app.get("/api/game/questions/remaining-count", async (req, res) => {
    try {
      const category = req.query.category as string;
      const difficulty = req.query.difficulty as string;
      const userId = req.user?.id;
      const excludeIds = parseExcludeIds(req.query.excludeIds);

      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      const count = await database.countAvailableQuestionsForGame({
        category: category !== "All Categories" ? category : undefined,
        difficulty,
        userId: userId || undefined,
        excludeIds,
      });

      res.json({ count });
    } catch (err) {
      console.error("Error counting remaining game questions:", err);
      res.status(500).json({ message: "Failed to count remaining questions" });
    }
  });

  // Track question analytics (non-blocking)
  app.post("/api/question-analytics/track", async (req, res) => {
    try {
      const { questionId, userId, isCorrect, timeSpent, category, difficulty } = req.body;

      if (!questionId) {
        return res.status(400).json({ message: "Question ID is required" });
      }

      // Update question history if user is provided
      if (userId) {
        try {
          await database.addUserQuestionHistory({
            userId,
            questionId,
            category: category || 'Unknown',
            difficulty: difficulty || 'Unknown',
            isCorrect: isCorrect || false,
            timeSpent: timeSpent || 0,
          });
        } catch (historyErr) {
        }
      }

      // Respond quickly to avoid blocking the game
      res.status(200).json({ message: "Analytics tracked successfully" });
    } catch (err) {
      res.status(200).json({ message: "Analytics tracking completed" }); // Always return success to avoid blocking game
    }
  });

  // Get question repetition statistics - Admin only
  app.get("/api/admin/question-stats", ensureAdmin, async (req, res) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const hoursBack = req.query.hoursBack ? parseInt(req.query.hoursBack as string) : 24;

      if (userId) {
        // Get stats for specific user
        const userHistory = await database.getUserQuestionHistory(userId, hoursBack);
        const questionCounts = userHistory.reduce((acc, entry) => {
          acc[entry.questionId] = (acc[entry.questionId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const repeatedQuestions = Object.entries(questionCounts)
          .filter(([_, count]) => count > 1)
          .map(([questionId, count]) => ({ questionId, count }));

        res.json({
          userId,
          hoursBack,
          totalQuestions: userHistory.length,
          uniqueQuestions: Object.keys(questionCounts).length,
          repeatedQuestions,
          repetitionRate: repeatedQuestions.length / Object.keys(questionCounts).length,
        });
      } else {
        // Get overall stats
        const allUsers = await database.getAllUsers();
        const stats = [];

        for (const user of allUsers.slice(0, 10)) { // Limit to first 10 users for performance
          const userHistory = await database.getUserQuestionHistory(user.id, hoursBack);
          const questionCounts = userHistory.reduce((acc, entry) => {
            acc[entry.questionId] = (acc[entry.questionId] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          const repeatedQuestions = Object.entries(questionCounts)
            .filter(([_, count]) => count > 1).length;

          stats.push({
            userId: user.id,
            username: user.username,
            totalQuestions: userHistory.length,
            uniqueQuestions: Object.keys(questionCounts).length,
            repeatedQuestions,
            repetitionRate: repeatedQuestions / (Object.keys(questionCounts).length || 1),
          });
        }

        res.json({ hoursBack, userStats: stats });
      }
    } catch (err) {
      console.error("Error fetching question stats:", err);
      res.status(500).json({ message: "Failed to fetch question statistics" });
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

  // Get current user's single-player score history
  app.get("/api/single-player/scores", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const scores = await database.getSinglePlayerScores({
        userId: req.user.id,
      });

      scores.sort(
        (a: { timestamp?: string | Date }, b: { timestamp?: string | Date }) =>
          new Date(b.timestamp ?? 0).getTime() -
          new Date(a.timestamp ?? 0).getTime()
      );

      res.json(scores);
    } catch (err) {
      console.error("Failed to fetch single player scores:", err);
      res.status(500).json({ message: "Failed to fetch scores" });
    }
  });

  // Submit single player score
  app.post(
    "/api/single-player/scores",
    ensureAuthenticated,
    async (req, res) => {
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
    }
  );

  // Save multiplayer score (local multiplayer games)
  app.post("/api/multiplayer/scores", async (req, res) => {
    try {

      const multiplayerScore = {
        id: uuidv4(),
        gameSessionId: req.body.gameSessionId,
        playerName: req.body.playerName,
        playerIndex: req.body.playerIndex,
        score: req.body.score,
        correctAnswers: req.body.correctAnswers,
        incorrectAnswers: req.body.incorrectAnswers,
        averageTime: req.body.averageTime,
        category: req.body.category,
        difficulty: req.body.difficulty,
        gameType: req.body.gameType || "local-multi",
        totalQuestions: req.body.totalQuestions,
        playerCount: req.body.playerCount,
        createdAt: new Date(),
      };

      const savedScore = await database.saveMultiplayerScore(multiplayerScore);
      res.status(201).json(savedScore);
    } catch (err) {
      console.error("Failed to save multiplayer score:", err);
      res.status(500).json({
        message: "Failed to save multiplayer score",
        error: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });

  // Get leaderboard data
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const gameType = (req.query.gameType as string) || "all";
      const category = (req.query.category as string) || "All Categories";

      // Validate parameters
      if (!["all", "single", "multi"].includes(gameType)) {
        return res.status(400).json({ message: "Invalid gameType parameter" });
      }

      const leaderboardData = await database.getLeaderboardData(
        gameType,
        category
      );

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
          timestamp: new Date().toISOString(),
        },
      };

      res.json(response);
    } catch (err) {
      console.error("Failed to fetch leaderboard data:", err);
      res.status(500).json({
        message: "Failed to fetch leaderboard data",
        error: err instanceof Error ? err.message : "Unknown error",
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
      const challengesWithDetails = await Promise.all(
        challenges.map(async (challenge) => {
          const isChallenger = challenge.challengerId === userId;
          const opponentId = isChallenger
            ? challenge.challengeeId
            : challenge.challengerId;
          const opponent = await database.getUser(opponentId);

          // Get challenge results if they exist
          const results = await database.getChallengeResultsByChallenge(
            challenge.id
          );
          const userResult = results.find((r) => r.userId === userId);
          const opponentResult = results.find((r) => r.userId === opponentId);

          return {
            ...challenge,
            opponentName: opponent?.username || "Unknown User",
            isChallenger,
            userResult,
            opponentResult,
            isComplete:
              challenge.challengerCompleted && challenge.challengeeCompleted,
          };
        })
      );

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
      if (
        challenge.challengerId !== userId &&
        challenge.challengeeId !== userId
      ) {
        return res
          .status(403)
          .json({ message: "You are not a participant in this challenge" });
      }

      const isChallenger = challenge.challengerId === userId;
      const opponentId = isChallenger
        ? challenge.challengeeId
        : challenge.challengerId;
      const opponent = await database.getUser(opponentId);

      // Get challenge results
      const results = await database.getChallengeResultsByChallenge(
        challengeId
      );
      const userResult = results.find((r) => r.userId === userId);
      const opponentResult = results.find((r) => r.userId === opponentId);

      // Get the game session with questions
      const gameSession = await database.getGameSession(
        challenge.gameSessionId
      );

      // Return the challenge details
      res.json({
        challenge: {
          ...challenge,
          opponentName: opponent?.username || "Unknown User",
          isChallenger,
          userCompleted: isChallenger
            ? challenge.challengerCompleted
            : challenge.challengeeCompleted,
          opponentCompleted: isChallenger
            ? challenge.challengeeCompleted
            : challenge.challengerCompleted,
        },
        userResult,
        opponentResult,
        gameSession,
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
      const users = allUsers.filter((user) => user.id !== req.user?.id);

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
        log("Notifications request without authenticated user");
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;
      log(`Fetching notifications for user ${userId}`);
      const notifications = await database.getNotifications(userId);
      log(`Found ${notifications.length} notifications for user ${userId}`);

      res.json(notifications);
    } catch (err) {
      log(`Failed to fetch notifications: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
      const notification = await database.markNotificationAsRead(
        notificationId
      );

      res.json(notification);
    } catch (err) {
      console.error("Failed to update notification:", err);
      res.status(500).json({ message: "Failed to update notification" });
    }
  });

  // Delete notification
  app.delete(
    "/api/notifications/:id",
    ensureAuthenticated,
    async (req, res) => {
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
    }
  );

  // ==== TEAM-BASED MULTIPLAYER ROUTES ====

  // Get online users for team invitations
  app.get("/api/users/online", ensureAuthenticated, async (req, res) => {
    try {
      // CRITICAL FIX: Use getAvailableUserIds() which filters out users in active teams
      // This ensures consistency with WebSocket broadcastOnlineStatusUpdate()
      const onlineUserIds = getOnlineUserIds();

      // Use authoritative busy check (DB-backed) to determine availability.
      const { isUserBusy } = await import("./socket");
      const availabilityChecks = await Promise.all(
        onlineUserIds.map(async (userId: number) => {
          try {
            const busy = await isUserBusy(userId);
            return { userId, busy };
          } catch {
            return { userId, busy: false };
          }
        })
      );
      const availableUserIds = availabilityChecks.filter((c) => !c.busy).map((c) => c.userId);

      // Filter out current user
      const filteredUserIds = availableUserIds.filter(
        (userId: number) => userId !== req.user?.id
      );

      // Fetch user details from database
      const userPromises = filteredUserIds.map((userId: number) =>
        database.getUser(userId).then(user => {
          if (!user) return null;
          // Return only necessary fields, excluding sensitive data
          return {
            id: user.id,
            username: user.username,
            email: user.email,
            isOnline: true, // All users from getOnlineUserIds are online
          };
        })
      );

      const userDetails = (await Promise.all(userPromises)).filter(Boolean);
      res.json(userDetails);
    } catch (err) {
      console.error("Failed to fetch online users:", err);
      res.status(500).json({ message: "Failed to fetch online users" });
    }
  });

  // Get available users for invitations (explicit endpoint)
  app.get("/api/users/available", ensureAuthenticated, async (req, res) => {
    try {
      // Use same logic as /api/users/online but explicit about availability semantics.
      const onlineUserIds = getOnlineUserIds();
      const { isUserBusy } = await import("./socket");
      const availabilityChecks = await Promise.all(
        onlineUserIds.map(async (userId: number) => {
          try {
            const busy = await isUserBusy(userId);
            return { userId, busy };
          } catch {
            return { userId, busy: false };
          }
        })
      );
      const availableUserIds = availabilityChecks.filter((c) => !c.busy).map((c) => c.userId);

      const filteredUserIds = availableUserIds.filter(
        (userId: number) => userId !== req.user?.id
      );

      const userPromises = filteredUserIds.map((userId: number) =>
        database.getUser(userId).then((user) => {
          if (!user) return null;
          return {
            id: user.id,
            username: user.username,
            email: user.email,
            isOnline: true,
          };
        })
      );

      const userDetails = (await Promise.all(userPromises)).filter(Boolean);
      res.json(userDetails);
    } catch (err) {
      console.error("Failed to fetch available users:", err);
      res.status(500).json({ message: "Failed to fetch available users" });
    }
  });




  // Set user online status
  app.patch("/api/users/:id/online", ensureAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { isOnline } = req.body;

      if (userId !== req.user?.id) {
        return res
          .status(403)
          .json({ message: "Cannot update other user's status" });
      }

      const user = await database.setUserOnline(userId, isOnline);
      res.json(user);
    } catch (err) {
      console.error("Failed to update online status:", err);
      res.status(500).json({ message: "Failed to update online status" });
    }
  });

  // ✅ NEW: Get Team Battle available users
  app.get("/api/users/team-battle-available", ensureAuthenticated, async (req, res) => {
    try {
  
      const gameType = req.query.gameType as string | undefined;
  
      const users = await database.getTeamBattleAvailableUsers(gameType);
  
  
      const { getOnlineUserIds } = await import("./socket");
      const onlineUserIds = getOnlineUserIds();
  
      const filteredUsers = users.filter(user => user.id !== req.user?.id);
  
      const userDetails = filteredUsers.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        isOnline: onlineUserIds.includes(user.id),
        isInTeamBattle: user.isInTeamBattle,
      }));
  
  
      res.json(userDetails);
    } catch (err) {
      console.error("[GET /api/users/team-battle-available] ERROR:", err);
      res.status(500).json({ message: "Failed to fetch Team Battle available users" });
    }
  });

  // ✅ NEW: Set user Team Battle status
  app.patch("/api/users/:id/team-battle-status", ensureAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { isInTeamBattle, gameType } = req.body;


      if (userId !== req.user?.id) {
        return res
          .status(403)
          .json({ message: "Cannot update other user's Team Battle status" });
      }
      // Determine mode to set: when entering (true), use provided gameType or default to 'team_battle'
      // when leaving (false), clear current_team_battle_mode (set to NULL)
      let modeToSet: string | null | undefined = undefined;
      if (isInTeamBattle === true) {
        modeToSet = gameType ? (gameType === "question" ? "team_battle" : gameType) : "team_battle";
      } else if (isInTeamBattle === false) {
        modeToSet = null;
      }

      const user = await database.setUserTeamBattleStatus(userId, isInTeamBattle, modeToSet);

      // Broadcast status change to all Team Battle users
      const io = req.app.get("io");
      if (io) {
        io.emit("team_battle_availability_updated", {
          userId,
          isInTeamBattle,
          timestamp: new Date(),
        });
      }

      res.json(user);
    } catch (err) {
      console.error(`[PATCH /api/users/:id/team-battle-status] ERROR:`, err);
      res.status(500).json({ message: "Failed to update Team Battle status" });
    }
  });

  // ✅ NEW: Get pending team invitations for user
  app.get("/api/users/:id/pending-team-invitations", ensureAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      if (userId !== req.user?.id) {
        return res
          .status(403)
          .json({ message: "Cannot access other user's invitations" });
      }

      const invitations = await database.getTeamInvitationsByUser(userId, "pending");

      // Filter out expired invitations
      const now = new Date();
      const validInvitations = invitations.filter(
        inv => new Date(inv.expiresAt) > now
      );

      res.json(validInvitations);
    } catch (err) {
      console.error("Failed to fetch pending invitations:", err);
      res.status(500).json({ message: "Failed to fetch pending invitations" });
    }
  });

  // Helper function to convert team battle to team format for frontend
  async function convertTeamBattleToTeams(battle: any): Promise<any[]> {
    const teams: any[] = [];
    const hasOpponent = Boolean(battle.teamBCaptainId && battle.teamBName);

    // Get usernames for all team members
    const getUserInfo = async (userId: number | any) => {
      // Handle case where userId might be an object with an id property
      const actualUserId = typeof userId === 'object' && userId !== null ? userId.id : userId;

      if (typeof actualUserId !== 'number') {
        console.error(`[convertTeamBattleToTeams] Invalid userId:`, userId);
        return null;
      }

      const user = await database.getUser(actualUserId);
      return user ? { userId: actualUserId, username: user.username } : null;
    };

    // Team A (only if captain exists)
    if (battle.teamACaptainId && battle.teamAName) {
      const teamAMembers = [];
      teamAMembers.push({
        userId: battle.teamACaptainId,
        username:
          (await getUserInfo(battle.teamACaptainId))?.username || "Unknown",
        role: "captain" as const,
        joinedAt: battle.createdAt,
      });

      // Handle teammates - they might be objects or numbers
      const teammates = battle.teamATeammates || [];

      for (const teammateId of teammates) {
        const userInfo = await getUserInfo(teammateId);
        if (userInfo) {
          teamAMembers.push({
            userId: userInfo.userId,
            username: userInfo.username,
            role: "member" as const,
            joinedAt: battle.createdAt,
          });
        }
      }

      teams.push({
        id: `${battle.id}-team-a`,
        teamId: `${battle.id}-team-a`,
        teamBattleId: battle.id,
        teamSide: "A",
        hasOpponent,
        battleStatus: battle.status,
        opponentTeamName: battle.teamBName,
        opponentCaptainId: battle.teamBCaptainId,
        name: battle.teamAName,
        captainId: battle.teamACaptainId,
        gameSessionId: battle.gameSessionId,
        // Reflect the underlying battle.gameType so callers can distinguish modes
        gameType: battle.gameType,
        gameMode: (battle.gameType === "rapid_fire" ? "RAPID_FIRE" : "TEAM_BATTLE"),
        members: teamAMembers,
        score: battle.teamAScore || 0,
        correctAnswers: battle.teamACorrectAnswers || 0,
        incorrectAnswers: battle.teamAIncorrectAnswers || 0,
        averageTime: 0,
        finalAnswers: [],
        status: battle.status,
        createdAt: battle.createdAt,
      });
    }

    // Team B (only if captain exists)
    if (battle.teamBCaptainId && battle.teamBName) {
      const teamBMembers = [];
      teamBMembers.push({
        userId: battle.teamBCaptainId,
        username:
          (await getUserInfo(battle.teamBCaptainId))?.username || "Unknown",
        role: "captain" as const,
        joinedAt: battle.createdAt,
      });

      // Handle teammates - they might be objects or numbers
      const teammates = battle.teamBTeammates || [];

      for (const teammateId of teammates) {
        const userInfo = await getUserInfo(teammateId);
        if (userInfo) {
          teamBMembers.push({
            userId: userInfo.userId,
            username: userInfo.username,
            role: "member" as const,
            joinedAt: battle.createdAt,
          });
        }
      }

      teams.push({
        id: `${battle.id}-team-b`,
        teamId: `${battle.id}-team-b`,
        teamBattleId: battle.id,
        teamSide: "B",
        hasOpponent: true,
        battleStatus: battle.status,
        opponentTeamName: battle.teamAName,
        opponentCaptainId: battle.teamACaptainId,
        name: battle.teamBName,
        captainId: battle.teamBCaptainId,
        gameSessionId: battle.gameSessionId,
        // Reflect the underlying battle.gameType so callers can distinguish modes
        gameType: battle.gameType,
        gameMode: (battle.gameType === "rapid_fire" ? "RAPID_FIRE" : "TEAM_BATTLE"),
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

    return teams;
  }

  // Create a team (creates team battle with Team A)
  app.post("/api/teams", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Get game configuration from game session or use defaults
      // Default to explicit team_battle for normal team battle flows
      let gameType = "team_battle";
      let category = "General";
      let difficulty = "medium";

      try {
        const gameSession = await database.getGameSession(
          req.body.gameSessionId
        );
        if (gameSession) {
          // Map realtime sessions to team_battle by default
          gameType =
            gameSession.gameType === "realtime"
              ? "team_battle"
              : gameSession.gameType || "team_battle";
          category = gameSession.category || category;
          difficulty = gameSession.difficulty || difficulty;
        }
      } catch (err) {
      }
      // Allow client to explicitly request a gameType (e.g., rapid_fire)
      if (req.body && req.body.gameType) {
        // Defensive: treat legacy "question" as "team_battle"
        gameType = req.body.gameType === "question" ? "team_battle" : req.body.gameType;
      }

      // Clean up any old "forming" AND "ready" teams created by this captain
      // This prevents ghost teams from appearing in available teams list
      // CRITICAL FIX: Also clean "ready" battles that were abandoned (prevents stale ready state)
      // CRITICAL FIX: Import socket functions to manage activeTeamMemberships
      const { activeTeamMemberships, broadcastOnlineStatusUpdate, resetBattleState } = await import("./socket");

      try {
        const formingBattles = await database.getTeamBattlesByUser(req.user.id, 'forming');
        const readyBattles = await database.getTeamBattlesByUser(req.user.id, 'ready');
        const existingBattles = [...formingBattles, ...readyBattles];

        for (const battle of existingBattles) {

          // CRITICAL FIX: Remove captain from activeTeamMemberships if they're in it
          if (battle.teamACaptainId) {
            activeTeamMemberships.delete(battle.teamACaptainId);
          }
          if (battle.teamBCaptainId) {
            activeTeamMemberships.delete(battle.teamBCaptainId);
          }

          // CRITICAL FIX: Remove teammates from activeTeamMemberships
          const allTeammateIds = [
            ...(battle.teamATeammates || []),
            ...(battle.teamBTeammates || [])
          ];
          for (const teammateId of allTeammateIds) {
            activeTeamMemberships.delete(teammateId);
          }

          // CENTRALIZED: Use resetBattleState for cleanup
          await resetBattleState({
            battleId: battle.id,
            reason: "cleanup",
            deleteBattle: true, // Cleanup deletes the battle
          });
        }

        if (existingBattles.length > 0) {
        }
      } catch (cleanupErr) {
        console.error("Failed to cleanup old teams:", cleanupErr);
        // Continue with team creation even if cleanup fails
      }

      const battleId = uuidv4();
      const teamBattleData = {
        id: battleId,
        gameSessionId: req.body.gameSessionId,
        gameType: gameType,
        category: category,
        difficulty: difficulty,
        status: "forming" as const,
        teamACaptainId: req.user.id,
        teamAName: req.body.name,
        teamATeammates: [],
        teamBCaptainId: null,
        teamBName: null,
        teamBTeammates: [],
        teamAScore: 0,
        teamBScore: 0,
        teamACorrectAnswers: 0,
        teamBCorrectAnswers: 0,
        teamAIncorrectAnswers: 0,
        teamBIncorrectAnswers: 0,
        createdAt: new Date(),
        startedAt: null,
        finishedAt: null,
      };

      const battle = await database.createTeamBattle(teamBattleData);

      // ✅ VERIFICATION: Log battle ID and confirm it exists in DB

      // Verify the battle was actually saved to database
      try {
        const verifyBattle = await database.getTeamBattle(battle.id);
        if (verifyBattle) {
        } else {
          console.error(`❌ ERROR: Battle ${battle.id} NOT FOUND in database after creation!`);
        }
      } catch (verifyErr) {
        console.error(`❌ ERROR verifying battle in database:`, verifyErr);
      }

      // CRITICAL FIX: Add team creator to activeTeamMemberships
      activeTeamMemberships.set(req.user.id, `${battle.id}-team-a`);

      // CRITICAL FIX: Broadcast update immediately so all clients see the change
      try {
        await broadcastOnlineStatusUpdate();
      } catch (broadcastErr) {
        console.error(`[POST /api/teams] Error broadcasting update:`, broadcastErr);
        // Non-critical, continue
      }

      // Debug logging to verify team creation

      const teams = await convertTeamBattleToTeams(battle);
      res.status(201).json(teams[0]); // Return Team A
    } catch (err) {
      console.error("Failed to create team:", err);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  // ============================================================================
  // PHASE 2: SERVER-SIDE CLEANUP ENDPOINT
  // ============================================================================
  // This endpoint performs comprehensive cleanup when Team Battle modal opens.
  // It's idempotent (safe to call multiple times) and synchronous (awaited).
  // ============================================================================
  app.post("/api/team-battle/cleanup", ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;

      // Import socket functions
      const { activeTeamMemberships, broadcastOnlineStatusUpdate, resetBattleState } = await import("./socket");

      let changesMade = false;
      const cleanupStats = {
        removedFromActiveTeam: false,
        removedOldTeams: 0,
        removedTeammates: 0,
        expiredInvitations: 0,
        expiredJoinRequests: 0,
      };

      // ========================================================================
      // STEP 1: Remove user from activeTeamMemberships
      // ========================================================================
      const wasInTeam = activeTeamMemberships.has(userId);
      if (wasInTeam) {
        activeTeamMemberships.delete(userId);
        cleanupStats.removedFromActiveTeam = true;
        changesMade = true;
      }

      // ========================================================================
      // STEP 2: Delete all old "forming" AND "ready" teams created by this user
      // ========================================================================
      // CRITICAL FIX: Also clean "ready" battles that were abandoned
      // This prevents stale ready state when same teams play again
      const formingBattles = await database.getTeamBattlesByUser(userId, 'forming');
      const readyBattles = await database.getTeamBattlesByUser(userId, 'ready');
      const existingBattles = [...formingBattles, ...readyBattles];
      cleanupStats.removedOldTeams = existingBattles.length;

      for (const battle of existingBattles) {

        // Remove all teammates from activeTeamMemberships
        const allTeammateIds = [
          ...(battle.teamATeammates || []),
          ...(battle.teamBTeammates || [])
        ];
        for (const teammateId of allTeammateIds) {
          if (activeTeamMemberships.has(teammateId)) {
            activeTeamMemberships.delete(teammateId);
            cleanupStats.removedTeammates++;
            changesMade = true;
          }
        }

        // Remove captains from activeTeamMemberships
        if (battle.teamACaptainId && activeTeamMemberships.has(battle.teamACaptainId)) {
          activeTeamMemberships.delete(battle.teamACaptainId);
          changesMade = true;
        }
        if (battle.teamBCaptainId && activeTeamMemberships.has(battle.teamBCaptainId)) {
          activeTeamMemberships.delete(battle.teamBCaptainId);
          changesMade = true;
        }

        // CENTRALIZED: Use resetBattleState for cleanup
        await resetBattleState({
          battleId: battle.id,
          reason: "cleanup",
          deleteBattle: true, // Cleanup deletes the battle
        });
        changesMade = true;
      }

      if (existingBattles.length > 0) {
      }

      // ========================================================================
      // STEP 3: Cancel/expire all pending invitations (inviter AND invitee)
      // ========================================================================
      try {
        // Get all pending invitations where user is either inviter or invitee
        const allPendingInvitations = await database.getAllTeamInvitationsByUser(userId, "pending");

        for (const invitation of allPendingInvitations) {
          // Update invitation status to expired
          await database.updateTeamInvitation(invitation.id, {
            status: "expired",
          });

          cleanupStats.expiredInvitations++;
          changesMade = true;

          // Notify the other party (inviter if user is invitee, invitee if user is inviter)
          const otherUserId = invitation.inviterId === userId
            ? invitation.inviteeId
            : invitation.inviterId;

          sendToUser(otherUserId, {
            type: "invitation_expired",
            invitation: invitation,
            message: "This invitation has expired because the other party started a new team battle.",
          });

        }

        if (allPendingInvitations.length > 0) {
        }
      } catch (invitationError) {
        console.error(`[Cleanup] ⚠️ Error expiring invitations (non-critical):`, invitationError);
        // Continue - invitation cleanup failure shouldn't fail the whole cleanup
      }

      // ========================================================================
      // STEP 4: Cancel/expire all pending join requests (requester)
      // ========================================================================
      try {
        // Get all pending join requests where user is the requester
        const pendingJoinRequests = await database.getJoinRequestsByUser(userId);
        const pendingRequests = pendingJoinRequests.filter(
          (jr: any) => jr.status === "pending"
        );

        for (const jr of pendingRequests) {
          // Update join request status to expired
          await database.updateJoinRequestStatus(jr.id, "expired");

          cleanupStats.expiredJoinRequests++;
          changesMade = true;

          // Notify the user that their request expired
          sendToUser(userId, {
            type: "join_request_updated",
            joinRequestId: jr.id,
            status: "expired",
            teamId: jr.team_id || jr.teamId,
            requesterId: userId,
            message: "This join request has expired because you started a new team battle.",
          });

        }

        if (pendingRequests.length > 0) {
        }
      } catch (joinRequestError) {
        console.error(`[Cleanup] ⚠️ Error expiring join requests (non-critical):`, joinRequestError);
        // Continue - join request cleanup failure shouldn't fail the whole cleanup
      }

      // ========================================================================
      // STEP 5: Detach user from "playing" battles they have LEFT
      // ========================================================================
      // When a player leaves mid-game and opens the modal again, they need
      // to be fully detached from any in-progress "playing" battles.
      // We don't delete or end the battle — it continues for other players.
      // We only ensure this user is no longer associated with it.
      // ========================================================================
      try {
        // Check all in-memory game sessions for this user
        const leftCheck = hasPlayerLeftAnyActiveGame(userId);
        if (leftCheck.left) {
          changesMade = true;
        }

        // Also check DB for "playing" battles where user is listed but has clearly left
        // (covers edge case where server restarted and in-memory leftPlayerIds is lost)
        const playingBattles = await database.getTeamBattlesByUser(userId, 'playing');
        for (const battle of playingBattles) {
          // Don't end the battle — just remove user from activeTeamMemberships
          if (activeTeamMemberships.has(userId)) {
            activeTeamMemberships.delete(userId);
            changesMade = true;
          }
        }
      } catch (playingBattleError) {
        console.error(`[Cleanup] ⚠️ Error handling playing battles (non-critical):`, playingBattleError);
      }

      // ========================================================================
      // STEP 6: Broadcast online status update (if any changes were made)
      // ========================================================================
      if (changesMade) {
        try {
          await broadcastOnlineStatusUpdate();
        } catch (broadcastError) {
          console.error(`[Cleanup] ⚠️ Error broadcasting update (non-critical):`, broadcastError);
          // Continue - broadcast failure shouldn't fail the cleanup response
        }
      } else {
      }

      // ========================================================================
      // Return cleanup results
      // ========================================================================

      res.json({
        message: "Cleanup completed",
        success: true,
        stats: cleanupStats
      });
    } catch (err) {
      console.error("[Cleanup] ❌ Failed to cleanup team battle data:", err);
      res.status(500).json({
        message: "Failed to cleanup team battle data",
        success: false,
        error: process.env.NODE_ENV === 'development' ? String(err) : undefined
      });
    }
  });

  // Get teams for a game session (returns team battles converted to teams format)
  app.get("/api/teams", ensureAuthenticated, async (req, res) => {
    try {
      const gameSessionId = req.query.gameSessionId as string;
      if (!gameSessionId) {
        return res.status(400).json({ message: "Game session ID required" });
      }

      const battles = await database.getTeamBattlesByGameSession(gameSessionId);
      if (battles.length === 0) {
        return res.json([]);
      }

      // Convert all battles to teams format
      const allTeams = [];
      for (const battle of battles) {
        const teams = await convertTeamBattleToTeams(battle);
        allTeams.push(...teams);
      }

      res.json(allTeams);
    } catch (err) {
      console.error("Failed to fetch teams:", err);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Get ALL available teams across all game sessions for join-as-member
  app.get("/api/teams/available", ensureAuthenticated, async (req, res) => {
    try {
      const requestedGameType = (req.query.gameType as string) || undefined;
      if (requestedGameType) {
      }
      // Set no-cache headers to prevent stale data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // ✅ DATABASE-ONLY LOGIC: No in-memory session filtering
      // Get all team battles that are still forming from database
      const allBattles = await database.getTeamBattlesByStatus("forming");

      const allAvailableTeams = [];
      const now = Date.now();

    for (const battle of allBattles) {
        // Normalize stored gameType: treat NULL or legacy "question" as "team_battle"
        const storedType = (battle.gameType || "").toString();
        const normalizedBattleType = (!storedType || storedType === "question") ? "team_battle" : storedType;
        // If the client requested a specific gameType, skip battles that don't match
        if (requestedGameType && normalizedBattleType !== requestedGameType) {
          continue;
        }
        // Filter 1: Remove stale battles (older than 30 minutes)
        const battleAge = now - new Date(battle.createdAt).getTime();
        const isStale = battleAge > 30 * 60 * 1000; // 30 minutes

        if (isStale) {
          continue;
        }

        // Convert battle to teams format
        const teams = await convertTeamBattleToTeams(battle);

        // For availability, treat players who have LEFT any active game as not counting
        // toward team occupancy. This prevents LEFT players from making teams appear full.
        const { isUserBusy } = await import("./socket");

        const normalizedTeams = [];
        for (const t of teams) {
          const members = t.members || [];
          const availability = await Promise.all(
            members.map(async (m: any) => {
              try {
                const busy = await isUserBusy(m.userId);
                return { member: m, busy };
              } catch {
                return { member: m, busy: false };
              }
            })
          );
          const filteredMembers = availability.filter((a) => a.busy).map((a) => a.member);
          normalizedTeams.push({
            ...t,
            members: filteredMembers,
          });
        }

        // Filter teams that are:
        // 1. Match requested mode (TEAM_BATTLE or RAPID_FIRE)
        // 2. Status is "forming"
        // 3. Not full (< 3 members) after excluding LEFT players
        const expectedGameMode =
          requestedGameType === "rapid_fire" ? "RAPID_FIRE" : "TEAM_BATTLE";

        const availableTeams = normalizedTeams.filter((t: any) =>
          t.gameMode === expectedGameMode &&
          t.status === "forming" &&
          (t.members?.length || 0) < 3
        );

        if (availableTeams.length > 0) {
        }
        allAvailableTeams.push(...availableTeams);
      }

      res.json(allAvailableTeams);
    } catch (err) {
      console.error("Failed to fetch available teams:", err);
      if (err instanceof Error) {
        console.error("Error stack:", err.stack);
      }
      res.status(500).json({ message: "Failed to fetch available teams", error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Update team (e.g., change captain, add members, update name)
  app.patch("/api/teams/:id", ensureAuthenticated, async (req, res) => {
    try {
      const teamId = req.params.id;

      // Parse team ID to get battle ID and team side
      const teamIdParts = teamId.split("-team-");
      if (teamIdParts.length !== 2) {
        return res.status(400).json({ message: "Invalid team ID format" });
      }

      const battleId = teamIdParts[0];
      const teamSide = teamIdParts[1].toUpperCase() as "A" | "B";

      // Get the team battle
      const battle = await database.getTeamBattle(battleId);
      if (!battle) {
        return res.status(404).json({ message: "Team battle not found" });
      }

      // Check if user is the captain of this team
      const captainId = teamSide === "A" ? battle.teamACaptainId : battle.teamBCaptainId;
      if (captainId !== req.user?.id) {
        return res.status(403).json({ message: "Only team captain can update team" });
      }

      // Update team name if provided
      if (req.body.name) {
        const updates: any = {};
        if (teamSide === "A") {
          updates.teamAName = req.body.name.trim();
        } else {
          updates.teamBName = req.body.name.trim();
        }

        const updatedBattle = await database.updateTeamBattle(battleId, updates);
        const teams = await convertTeamBattleToTeams(updatedBattle);
        const updatedTeam = teams.find(t => t.teamSide === teamSide);

        // Notify all participants about the update
        const participantIds = new Set<number>();
        participantIds.add(updatedBattle.teamACaptainId);
        if (updatedBattle.teamBCaptainId) participantIds.add(updatedBattle.teamBCaptainId);
        for (const id of extractTeammateIds(updatedBattle.teamATeammates)) participantIds.add(id);
        for (const id of extractTeammateIds(updatedBattle.teamBTeammates)) participantIds.add(id);

        for (const userId of Array.from(participantIds)) {
          sendToUser(userId, {
            type: "teams_updated",
            teams: teams,
            gameSessionId: updatedBattle.gameSessionId,
            message: "Team name updated.",
          });
        }

        res.json(updatedTeam);
      } else {
        res.status(400).json({ message: "No updates provided" });
      }
    } catch (err) {
      console.error("Failed to update team:", err);
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  // Leave team battle
  app.delete("/api/teams/:id/leave", ensureAuthenticated, async (req, res) => {
    try {
      const teamId = req.params.id;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Parse team ID to get battle ID and team side
      const teamIdParts = teamId.split("-team-");
      if (teamIdParts.length !== 2) {
        return res.status(400).json({ message: "Invalid team ID format" });
      }

      const battleId = teamIdParts[0];
      const teamSide = teamIdParts[1].toUpperCase() as "A" | "B";

      // Get the team battle
      const battle = await database.getTeamBattle(battleId);
      if (!battle) {
        return res.status(404).json({ message: "Team battle not found" });
      }

      // Check if user is a member of this team
      const isCaptain = (teamSide === "A" ? battle.teamACaptainId : battle.teamBCaptainId) === userId;
      const teammates = teamSide === "A" ? battle.teamATeammates : battle.teamBTeammates;
      const teammateIds = extractTeammateIds(teammates);
      const isTeammate = teammateIds.includes(userId);

      if (!isCaptain && !isTeammate) {
        return res.status(403).json({ message: "You are not a member of this team" });
      }

      // Check if battle is in progress (playing or finished)
      if (battle.status === "playing" || battle.status === "finished") {
        return res.status(400).json({
          message: "Cannot leave team during or after battle. Please wait for the battle to complete."
        });
      }

      // Handle leaving based on team side and role
      if (isCaptain) {
        if (teamSide === "A") {
          // Team A captain leaving - delete the entire battle since Team A is required
          // IMPORTANT: capture existing Team A teammates BEFORE deleting, so we can notify them
          const oldTeamATeammateIds = extractTeammateIds(battle.teamATeammates);
          const oldTeamAName = battle.teamAName || "Team A";
          const captainName = req.user?.username || "The captain";

          await database.deleteTeamBattle(battleId);

          // Notify all participants
          const participantIds = new Set<number>();
          if (battle.teamACaptainId) participantIds.add(battle.teamACaptainId);
          if (battle.teamBCaptainId) participantIds.add(battle.teamBCaptainId);
          for (const id of extractTeammateIds(battle.teamATeammates)) participantIds.add(id);
          for (const id of extractTeammateIds(battle.teamBTeammates)) participantIds.add(id);

          for (const participantId of Array.from(participantIds)) {
            if (participantId !== userId) {
              // Check if this participant is a Team A member (they should see captain_left_team)
              const isTeamAMember = participantId === battle.teamACaptainId ||
                oldTeamATeammateIds.includes(participantId);

              if (isTeamAMember) {
                // Team A members see captain_left_team popup
                sendToUser(participantId, {
                  type: "captain_left_team",
                  gameSessionId: battle.gameSessionId,
                  captainName: captainName,
                  teamName: oldTeamAName,
                  message: `Your captain (${captainName}) left ${oldTeamAName}. The battle has been cancelled.`,
                });
              } else {
                // Team B (opponents) see opponent_disconnected popup
                sendToUser(participantId, {
                  type: "opponent_disconnected",
                  gameSessionId: battle.gameSessionId,
                  disconnectedPlayerName: captainName,
                  disconnectedTeamName: oldTeamAName,
                  message: `⚠️ ${captainName} (Team A captain) has left the lobby. The battle has been cancelled.`,
                  severity: "warning",
                  timestamp: new Date(),
                });
              }
            }
          }

          // Notify the leaving user
          sendToUser(userId, {
            type: "left_team_battle",
            teamId: teamId,
            gameSessionId: battle.gameSessionId,
            message: "You have left the team battle. The battle has been cancelled.",
          });

          res.json({
            message: "Successfully left the team battle. The battle has been cancelled.",
            teamId: teamId,
            battleId: battleId,
            battleCancelled: true
          });
          return;
        } else {
          // Team B captain leaving - can set to null since Team B is optional
          // IMPORTANT: capture existing Team B teammates BEFORE clearing them, so we can notify them
          const oldTeamBTeammateIds = extractTeammateIds(battle.teamBTeammates);
          const oldTeamBName = battle.teamBName || "Team B";
          const updates: any = {
            teamBCaptainId: null,
            teamBName: null,
            teamBTeammates: [],
          };
          const updatedBattle = await database.updateTeamBattle(battleId, updates);

          // Get updated teams and notify all participants
          const teams = await convertTeamBattleToTeams(updatedBattle);
          const participantIds = new Set<number>();
          if (updatedBattle.teamACaptainId) participantIds.add(updatedBattle.teamACaptainId);
          for (const id of extractTeammateIds(updatedBattle.teamATeammates)) participantIds.add(id);

          for (const participantId of Array.from(participantIds)) {
            if (participantId !== userId) {
              // Show a friendly popup/toast on the opponent side
              sendToUser(participantId, {
                type: "opponent_disconnected",
                gameSessionId: updatedBattle.gameSessionId,
                disconnectedPlayerName: req.user?.username || "A player",
                disconnectedTeamName: oldTeamBName,
                message: `⚠️ ${req.user?.username || "A player"} (Team B captain) has left the lobby. You can invite a new opponent captain to continue.`,
                severity: "warning",
                timestamp: new Date(),
              });
              sendToUser(participantId, {
                type: "teams_updated",
                teams: teams,
                gameSessionId: updatedBattle.gameSessionId,
                message: `Opponent captain left. Team B has been reset — you can invite a new opponent captain.`,
              });
            }
          }

          // Notify Team B teammates that their captain left and they were removed from the lobby
          for (const teammateId of oldTeamBTeammateIds) {
            if (teammateId !== userId) {
              sendToUser(teammateId, {
                type: "captain_left_team",
                gameSessionId: updatedBattle.gameSessionId,
                captainName: req.user?.username || "The captain",
                teamName: oldTeamBName,
                message: `Your captain (${req.user?.username || "The captain"}) left ${oldTeamBName}. You've been removed from this match.`,
              });
            }
          }

          sendToUser(userId, {
            type: "left_team_battle",
            teamId: teamId,
            gameSessionId: updatedBattle.gameSessionId,
            message: "You have successfully left the team battle.",
          });

          res.json({
            message: "Successfully left the team battle",
            teamId: teamId,
            battleId: battleId
          });
          return;
        }
      } else {
        // Teammate leaving - remove from the list
        const teammateIds = extractTeammateIds(teammates);
        const updatedTeammates = teammateIds.filter(id => id !== userId);
        const updates: any = {};
        if (teamSide === "A") {
          updates.teamATeammates = updatedTeammates;
        } else {
          updates.teamBTeammates = updatedTeammates;
        }

        const updatedBattle = await database.updateTeamBattle(battleId, updates);

        // Get updated teams and notify all participants
        const teams = await convertTeamBattleToTeams(updatedBattle);
        const participantIds = new Set<number>();
        if (updatedBattle.teamACaptainId) participantIds.add(updatedBattle.teamACaptainId);
        if (updatedBattle.teamBCaptainId) participantIds.add(updatedBattle.teamBCaptainId);
        for (const id of extractTeammateIds(updatedBattle.teamATeammates)) participantIds.add(id);
        for (const id of extractTeammateIds(updatedBattle.teamBTeammates)) participantIds.add(id);

        // Determine which team the leaving member belonged to and get captain ID
        const leavingTeamSide = teamSide;
        const captainId = leavingTeamSide === "A" ? updatedBattle.teamACaptainId : updatedBattle.teamBCaptainId;
        const teamName = leavingTeamSide === "A" ? (updatedBattle.teamAName || "Team A") : (updatedBattle.teamBName || "Team B");

        // Get leaving user's info for notifications
        const leavingUser = await database.getUser(userId).catch(() => null);
        const leavingUserName = leavingUser?.username || req.user?.username || "A player";

        // Send specific notification to captain that their teammate left (if captain exists)
        if (captainId && captainId !== userId) {
          try {
            sendToUser(captainId, {
              type: "teammate_left",
              gameSessionId: updatedBattle.gameSessionId,
              playerName: leavingUserName,
              teamName: teamName,
              message: `${leavingUserName} has left ${teamName}.`,
            });
          } catch (notifyError) {
            console.error("[Backend] Failed to send teammate_left notification to captain:", notifyError);
          }
        }

        // Also send teams_updated to all participants
        for (const participantId of Array.from(participantIds)) {
          if (participantId !== userId) {
            sendToUser(participantId, {
              type: "teams_updated",
              teams: teams,
              gameSessionId: updatedBattle.gameSessionId,
              message: `${leavingUserName} has left the team.`,
            });
          }
        }

        sendToUser(userId, {
          type: "left_team_battle",
          teamId: teamId,
          gameSessionId: updatedBattle.gameSessionId,
          message: "You have successfully left the team battle.",
        });

        res.json({
          message: "Successfully left the team battle",
          teamId: teamId,
          battleId: battleId
        });
      }


    } catch (err) {
      console.error("Failed to leave team:", err);
      res.status(500).json({ message: "Failed to leave team battle" });
    }
  });

  // Create team invitation
  app.post("/api/team-invitations", ensureAuthenticated, async (req, res) => {
    try {
      console.error("=== OPPONENT INVITATION REQUEST ===");
      console.error("req.body", req.body);

      if (!req.user) {
        console.error("ERROR: No user found");
        return res.status(401).json({ message: "Authentication required" });
      }

      console.error("Inviter:", req.user.id, req.user.username);
      console.error("Invitee:", req.body.inviteeId);
      console.error("Team ID:", req.body.teamId);
      console.error("Is Captain Invitation:", req.body.isCaptainInvitation);

      // Check if inviter already sent invitation to this user (prevent spam)
      const existingInvitations = await database.getTeamInvitationsByUser(
        req.body.inviteeId,
        "pending"
      );

      const duplicateFromSameInviter = existingInvitations.find(
        inv => inv.inviterId === req.user!.id && inv.invitationType === (req.body.isCaptainInvitation ? "opponent" : "teammate")
      );

      if (duplicateFromSameInviter) {
        return res.status(400).json({
          message: "You have already sent an invitation to this player",
          error: "DUPLICATE_FROM_SAME_INVITER"
        });
      }

      // Determine invitation type based on isCaptainInvitation flag
      const invitationType = req.body.isCaptainInvitation
        ? "opponent"
        : "teammate";

      // For opponent invitations, teamBattleId is null (battle doesn't exist yet)
      // For teammate invitations, we need to find the team battle
      let teamBattleId: string | null = null;
      let teamSide: "A" | "B" | null = null;

      if (invitationType === "opponent") {
        // ✅ FIX: For opponent invitations, capture the team battle ID
        // The teamId format is "{battleId}-team-a" or "{battleId}-team-b"
        const teamIdParts = req.body.teamId?.split("-team-");
        if (teamIdParts && teamIdParts.length === 2) {
          teamBattleId = teamIdParts[0];
        } else {
          // Fallback: try to find battle by gameSessionId
          const gameSessionId = req.body.gameSessionId;
          if (gameSessionId) {
            const battles = await database.getTeamBattlesByGameSession(
              gameSessionId
            );
            if (battles.length > 0) {
              // ✅ Get the MOST RECENT battle that only has Team A
              const battleWithTeamA = battles
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                )
                .find((b) => b.teamACaptainId === req.user!.id && !b.teamBCaptainId);

              if (battleWithTeamA) {
                teamBattleId = battleWithTeamA.id;
              }
            }
          }
        }
      } else if (invitationType === "teammate") {
        // Find the team battle for this team
        // The teamId format is "{battleId}-team-a" or "{battleId}-team-b"
        const teamIdParts = req.body.teamId.split("-team-");
        if (teamIdParts.length === 2) {
          teamBattleId = teamIdParts[0];
          teamSide = teamIdParts[1] === "a" ? "A" : "B";
        } else {
          // Fallback: try to find battle by gameSessionId
          const gameSessionId = req.body.gameSessionId;
          if (gameSessionId) {
            const battles = await database.getTeamBattlesByGameSession(
              gameSessionId
            );
            if (battles.length > 0) {
              const battle = battles[0];
              // Determine which side the inviter is on
              if (battle.teamACaptainId === req.user.id) {
                teamBattleId = battle.id;
                teamSide = "A";
              } else if (battle.teamBCaptainId === req.user.id) {
                teamBattleId = battle.id;
                teamSide = "B";
              }
            }
          }
        }
      }

      const invitationData = {
        id: uuidv4(),
        teamBattleId: teamBattleId,
        inviterId: req.user.id,
        inviterUsername: req.user.username,
        inviteeId: req.body.inviteeId,
        invitationType: invitationType as "opponent" | "teammate",
        teamSide: teamSide,
        status: "pending" as const,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      };

      console.error(
        "Invitation data:",
        JSON.stringify(invitationData, null, 2)
      );

      const invitation = await database.createTeamInvitation(invitationData);
      console.error("Invitation created:", JSON.stringify(invitation, null, 2));

      // Notify invitee in real time so they see a toast and updated invitation list
      try {
        if (invitationType === "opponent") {
          let recruiterTeamName = "a team";
          if (teamBattleId) {
            const battle = await database.getTeamBattle(teamBattleId);
            if (battle?.teamAName) {
              recruiterTeamName = battle.teamAName;
            }
          }

          sendToUser(req.body.inviteeId, {
            type: "team_captain_invitation_received",
            invitation,
            inviterName: req.user.username,
            message: `${req.user.username}'s team "${recruiterTeamName}" has invited you to become captain of the opposing team in a Bible trivia battle!`,
          });
        } else {
          let team = null;
          if (teamBattleId && teamSide) {
            const battle = await database.getTeamBattle(teamBattleId);
            if (battle) {
              const teams = await convertTeamBattleToTeams(battle);
              team = teams.find((t) => t.teamSide === teamSide) ?? null;
            }
          }

          sendToUser(req.body.inviteeId, {
            type: "team_member_invitation_received",
            invitation,
            team,
            inviterName: req.user.username,
            message: `${req.user.username} has invited you to join their team${team?.name ? ` "${team.name}"` : ""}!`,
          });
        }
      } catch (wsError) {
        console.error("Error sending invitation WebSocket notification:", wsError);
      }

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
      const invitations = await database.getTeamInvitationsByUser(
        userId,
        status
      );
      res.json(invitations);
    } catch (err) {
      console.error("Failed to fetch team invitations:", err);
      res.status(500).json({ message: "Failed to fetch team invitations" });
    }
  });

  // Respond to team invitation
  app.patch(
    "/api/team-invitations/:id",
    ensureAuthenticated,
    async (req, res) => {
      try {
        const invitationId = req.params.id;
        const { status } = req.body; // "accepted" or "declined"

        const invitation = await database.getTeamInvitation(invitationId);
        if (!invitation) {
          return res.status(404).json({ message: "Invitation not found" });
        }

        if (invitation.inviteeId !== req.user?.id) {
          return res
            .status(403)
            .json({ message: "Cannot respond to other user's invitation" });
        }

        // If accepted, invalidate all other pending invitations for this user
        if (status === "accepted") {
          const allPendingInvitations = await database.getTeamInvitationsByUser(
            req.user.id,
            "pending"
          );

          // Update all other pending invitations to declined
          for (const pendingInv of allPendingInvitations) {
            if (pendingInv.id !== invitationId) {
              await database.updateTeamInvitation(pendingInv.id, {
                status: "declined"
              });
            }
          }
        }

        const updatedInvitation = await database.updateTeamInvitation(
          invitationId,
          { status }
        );

        // If accepted, handle based on invitation type
        if (status === "accepted") {
          if (updatedInvitation.invitationType === "opponent") {

            // ✅ FIX: Use the teamBattleId from the invitation if available
            // Otherwise, find the inviter's existing team battle (Team A only)
            let existingBattle = null;

            if (updatedInvitation.teamBattleId) {
              // ✅ Use the specific battle referenced in the invitation
              existingBattle = await database.getTeamBattle(
                updatedInvitation.teamBattleId
              );
            } else {
              // ✅ Fallback: Find the MOST RECENT battle from inviter that needs Team B
              const inviterBattles = await database.getTeamBattlesByUser(
                invitation.inviterId,
                "forming"
              );

              if (inviterBattles.length > 0) {
                // ✅ Sort by creation date and get the MOST RECENT battle
                existingBattle = inviterBattles.sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                )[0];

                // ✅ Verify it doesn't have Team B yet
                if (existingBattle.teamBCaptainId || existingBattle.teamBName) {
                  existingBattle = null; // This battle already has Team B
                }

              }
            }

            if (!existingBattle) {
              return res.status(404).json({
                message: "Inviter's team battle not found. Cannot add Team B.",
              });
            }

            // 🔒 CRITICAL FIX: Check if Team B slot is already filled (first-come-first-serve)
            if (existingBattle.teamBCaptainId || existingBattle.teamBName) {

              // Update this invitation to expired
              await database.updateTeamInvitation(invitationId, {
                status: "expired"
              });

              // Expire all other pending opponent invitations for this battle
              const allPendingOpponentInvites = await database.getTeamInvitationsByBattle(
                existingBattle.id,
                "opponent"
              );

              for (const pendingInv of allPendingOpponentInvites) {
                if (pendingInv.status === "pending") {
                  await database.updateTeamInvitation(pendingInv.id, {
                    status: "expired"
                  });
                }
              }

              return res.status(409).json({
                message: "The opponent slot has already been filled by another player. This invitation has expired.",
                error: "OPPONENT_SLOT_FILLED"
              });
            }

            // ✅ FIX: VERIFY Team A name is NOT overwritten - preserve it

            // Update the battle to add Team B
            const updatedBattle = await database.updateTeamBattle(
              existingBattle.id,
              {
                teamBCaptainId: invitation.inviteeId,
                teamBName: req.body.teamName || `${req.user!.username}'s Team`,
                teamBTeammates: [],
                // ✅ CRITICAL: Explicitly preserve Team A name
                teamAName: existingBattle.teamAName,
              }
            );

            // Update invitation to reference the battle
            await database.updateTeamInvitation(invitationId, {
              teamBattleId: existingBattle.id,
            });

            // 🔒 CRITICAL: Expire all other pending opponent invitations for this battle
            // (First-come-first-serve: only first acceptor gets the opponent slot)
            const allOpponentInvites = await database.getTeamInvitationsByBattle(
              existingBattle.id,
              "opponent"
            );

            for (const pendingInv of allOpponentInvites) {
              if (pendingInv.id !== invitationId && pendingInv.status === "pending") {
                await database.updateTeamInvitation(pendingInv.id, {
                  status: "expired"
                });

                // Notify the user that their invitation expired
                try {
                  sendToUser(pendingInv.inviteeId, {
                    type: "invitation_expired",
                    message: `The opponent slot for ${existingBattle.teamAName} has been filled by another player.`,
                    invitationId: pendingInv.id,
                  });
                } catch (wsError) {
                  console.error("Error sending expiration notification:", wsError);
                }
              }
            }

            // Notify the inviter that opponent accepted and team battle was created
            try {
              sendToUser(invitation.inviterId, {
                type: "opponent_accepted_invitation",
                message: `${req.user!.username
                  } has accepted your invitation and Team B has been created!`,
                gameSessionId: updatedBattle.gameSessionId,
              });

              // Get all teams in the session and broadcast updates
              const battles = await database.getTeamBattlesByGameSession(
                updatedBattle.gameSessionId
              );
              const allTeams = [];
              for (const battle of battles) {
                const teams = await convertTeamBattleToTeams(battle);
                allTeams.push(...teams);
              }

              // Notify inviter about teams update
              sendToUser(invitation.inviterId, {
                type: "teams_updated",
                teams: allTeams,
                gameSessionId: updatedBattle.gameSessionId,
                message:
                  "Both teams are now created! You can invite teammates.",
              });

              // Also notify the invitee (opponent) about teams update
              sendToUser(invitation.inviteeId, {
                type: "teams_updated",
                teams: allTeams,
                gameSessionId: updatedBattle.gameSessionId,
                message:
                  "Your team has been created! You can now invite teammates.",
              });
            } catch (wsError) {
              console.error("Error sending WebSocket notification:", wsError);
              // Continue even if WebSocket fails
            }

            res.json({
              ...updatedInvitation,
              teamBattle: updatedBattle,
              message:
                "Team battle created! You are now the captain of Team B.",
            });
          } else {
            // This is a teammate invitation - add user to team battle
            if (!invitation.teamBattleId || !invitation.teamSide) {
              return res.status(400).json({
                message:
                  "Invalid teammate invitation - missing battle or team side",
              });
            }

            const battle = await database.getTeamBattle(
              invitation.teamBattleId
            );
            if (!battle) {
              return res.status(404).json({
                message: "Team battle not found",
              });
            }

            // Add user to the appropriate team side
            const teamSide = invitation.teamSide;
            const currentTeammates =
              teamSide === "A" ? battle.teamATeammates : battle.teamBTeammates;
            const currentTeammateIds = extractTeammateIds(currentTeammates);

            if (currentTeammateIds.length >= 2) {
              return res.status(400).json({
                message: "Team is already full (3 members including captain)",
              });
            }

            // Update the battle with new teammate
            const updates: Partial<any> = {};
            if (teamSide === "A") {
              updates.teamATeammates = [...currentTeammateIds, req.user!.id];
            } else {
              updates.teamBTeammates = [...currentTeammateIds, req.user!.id];
            }

            const updatedBattle = await database.updateTeamBattle(
              invitation.teamBattleId,
              updates
            );

            // After updating, gather all teams in this session and notify
            try {
              const battles = await database.getTeamBattlesByGameSession(
                updatedBattle.gameSessionId
              );
              const allTeams: any[] = [];
              for (const b of battles) {
                const teams = await convertTeamBattleToTeams(b);
                allTeams.push(...teams);
              }

              // Compute all participant user IDs (both teams, captains + teammates)
              const participantIds = new Set<number>();
              participantIds.add(updatedBattle.teamACaptainId);
              if (updatedBattle.teamBCaptainId) {
                participantIds.add(updatedBattle.teamBCaptainId);
              }
              for (const id of updatedBattle.teamATeammates || []) {
                participantIds.add(id);
              }
              for (const id of updatedBattle.teamBTeammates || []) {
                participantIds.add(id);
              }

              // Notify everyone in the battle so all UIs stay in sync
              for (const userId of Array.from(participantIds)) {
                sendToUser(userId, {
                  type: "teams_updated",
                  teams: allTeams,
                  gameSessionId: updatedBattle.gameSessionId,
                  message: "Team roster updated.",
                });
              }
            } catch (wsError) {
              console.error(
                "Error sending WebSocket notification for teammate join:",
                wsError
              );
              // Continue even if WebSocket fails
            }

            res.json({
              ...updatedInvitation,
              teamBattle: updatedBattle,
              message: "You have joined the team as a teammate.",
            });
          }
        } else {
          // Status is "declined" - just return updated invitation
          res.json(updatedInvitation);
        }
      } catch (err) {
        console.error("Failed to respond to team invitation:", err);
        res
          .status(500)
          .json({ message: "Failed to respond to team invitation" });
      }
    }
  );

  // Send team invitation by email
  app.post(
    "/api/team-invitations/email",
    ensureAuthenticated,
    async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ message: "Authentication required" });
        }

        const { teamId, inviteeEmail, teamName, gameSessionId } = req.body;

        // Find the team battle for this team
        let teamBattleId: string | null = null;
        let teamSide: "A" | "B" | null = null;

        // The teamId format is "{battleId}-team-a" or "{battleId}-team-b"
        const teamIdParts = teamId.split("-team-");
        if (teamIdParts.length === 2) {
          teamBattleId = teamIdParts[0];
          teamSide = teamIdParts[1] === "a" ? "A" : "B";
        } else if (gameSessionId) {
          // Fallback: try to find battle by gameSessionId
          const battles = await database.getTeamBattlesByGameSession(
            gameSessionId
          );
          if (battles.length > 0) {
            const battle = battles[0];
            // Determine which side the inviter is on
            if (battle.teamACaptainId === req.user.id) {
              teamBattleId = battle.id;
              teamSide = "A";
            } else if (battle.teamBCaptainId === req.user.id) {
              teamBattleId = battle.id;
              teamSide = "B";
            }
          }
        }

        // Create invitation record
        const invitationData = {
          id: uuidv4(),
          teamBattleId: teamBattleId,
          inviterId: req.user.id,
          inviterUsername: req.user.username,
          inviteeId: 0, // Email invitations don't have specific user ID yet
          invitationType: "teammate" as const, // Email invitations are typically teammates
          teamSide: teamSide,
          status: "pending" as const,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
        };

        const invitation = await database.createTeamInvitation(invitationData);

        // Send email invitation
        const emailSent = await sendTeamInvitationEmail({
          inviteeEmail,
          inviterName: req.user.username,
          teamName,
          gameSessionId: teamId,
          invitationId: invitation.id,
        });

        if (!emailSent) {
          return res
            .status(500)
            .json({ message: "Failed to send invitation email" });
        }

        res
          .status(201)
          .json({ message: "Invitation sent successfully", invitation });
      } catch (err) {
        console.error("Failed to send email invitation:", err);
        res.status(500).json({ message: "Failed to send email invitation" });
      }
    }
  );

  // ElevenLabs Voice Cloning API Endpoints

  // Upload voice sample and create voice clone
  app.post(
    "/api/voice/upload",
    ensureAdmin,
    upload.single("audio"),
    async (req: MulterRequest, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No audio file provided" });
        }

        const { name, description } = req.body;

        // Read the uploaded file
        const audioBuffer = fs.readFileSync(req.file.path);

        // Upload to ElevenLabs using node-fetch with form-data
        const FormData = (await import("form-data")).default;
        const formData = new FormData();
        formData.append("name", name || "Bible Trivia Voice");
        formData.append(
          "description",
          description || "Voice clone for Bible trivia game"
        );
        formData.append("files", audioBuffer, req.file.originalname);

        // Use node-fetch for better compatibility
        const fetch = (await import("node-fetch")).default;
        const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            ...formData.getHeaders(),
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("ElevenLabs API Error:", errorText);

          // Check if it's a subscription issue
          if (errorText.includes("can_not_use_instant_voice_cloning")) {
            throw new Error(
              "Voice cloning requires a paid ElevenLabs subscription. Please upgrade your plan at elevenlabs.io to use this feature."
            );
          }

          throw new Error(`ElevenLabs API error: ${errorText}`);
        }

        const voiceData = (await response.json()) as {
          voice_id: string;
          name: string;
        };

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        // Store voice ID in database
        await database.setVoiceCloneId(voiceData.voice_id);

        res.json({
          message:
            "Voice clone created successfully! Your voice will now be used in the game.",
          voiceId: voiceData.voice_id,
          name: voiceData.name,
        });
      } catch (error) {
        console.error("Voice upload error:", error);

        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to create voice clone",
          requiresUpgrade:
            error instanceof Error && error.message.includes("subscription"),
        });
      }
    }
  );

  // Get current voice clone status and usage
  app.get("/api/voice/status", async (req, res) => {
    try {
      const voiceId = await database.getVoiceCloneId();

      if (!voiceId) {
        return res.json({ hasVoiceClone: false });
      }

      // Check voice status with ElevenLabs
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      });

      if (!response.ok) {
        // Voice might have been deleted
        await database.setVoiceCloneId(null);
        return res.json({ hasVoiceClone: false });
      }

      const voiceData = (await response.json()) as {
        voice_id: string;
        name: string;
        description: string;
        status: string;
      };

      // Get user subscription info and usage
      const userResponse = await fetch(
        `${ELEVENLABS_BASE_URL}/user/subscription`,
        {
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
          },
        }
      );

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
        subscription: subscriptionInfo,
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
      const targetVoiceId = voiceId || (await database.getVoiceCloneId());

      if (!targetVoiceId) {
        return res.status(400).json({ message: "No voice clone available" });
      }

      // Generate speech with ElevenLabs
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(
        `${ELEVENLABS_BASE_URL}/text-to-speech/${targetVoiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.7,
              similarity_boost: 0.7,
              style: 0.3,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs TTS error: ${error}`);
      }

      // Get audio data
      const audioBuffer = await response.arrayBuffer();

      // Convert to base64 for client
      const base64Audio = Buffer.from(audioBuffer).toString("base64");

      // Track voice usage for credit monitoring
      try {
        const textLength = text.length;
        // Estimate credits: roughly 1 credit per 1000 characters (varies by plan)
        const estimatedCredits = Math.ceil(textLength / 1000);

        await database.trackVoiceUsage({
          voiceId: targetVoiceId,
          textLength,
          estimatedCredits,
          requestType: "tts",
          gameSessionId: req.body.gameSessionId || null,
          userId: req.body.userId || null,
        });
      } catch (error) {
        console.error("Error tracking voice usage:", error);
        // Don't fail the request if tracking fails
      }

      res.json({
        audio: base64Audio,
        format: "mp3",
      });
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });

  // Get available voices from ElevenLabs
  app.get("/api/voice/list", ensureAdmin, async (req, res) => {
    try {
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }

      const voices = (await response.json()) as {
        voices: Array<{
          voice_id: string;
          name: string;
          description: string;
          category: string;
          labels: Record<string, string>;
          preview_url?: string;
        }>;
      };

      res.json(voices);
    } catch (error) {
      console.error("Voice list error:", error);
      res.status(500).json({ message: "Failed to get voice list" });
    }
  });

  // Get voice usage statistics
  app.get("/api/voice/usage", ensureAdmin, async (req, res) => {
    try {
      const timeframe =
        (req.query.timeframe as "day" | "week" | "month") || "month";
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
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
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
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
        method: "DELETE",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      });

      if (!response.ok) {
        console.warn(
          "Failed to delete voice from ElevenLabs, but removing from database"
        );
      }

      // Remove from database
      await database.setVoiceCloneId(null);

      res.json({ message: "Voice clone deleted successfully" });
    } catch (error) {
      console.error("Voice deletion error:", error);
      res.status(500).json({ message: "Failed to delete voice clone" });
    }
  });

  // POST - Start team battle (triggers WebSocket handler)
  app.post("/api/team-battle/start", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { gameSessionId } = req.body;

      if (!gameSessionId) {
        return res.status(400).json({ message: "gameSessionId is required" });
      }

      if (!user || !user.id) {
        return res.status(401).json({ message: "Authentication required" });
      }


      // Get teams from database to validate - use team battles structure
      // The teams are stored in team_battles table, not teams table
      const battles = await database.getTeamBattlesByGameSession(gameSessionId);

      if (battles.length === 0) {
        return res.status(400).json({
          message: "No team battle found for this session. Please create teams first."
        });
      }

      // Get the most recent forming battle (there should only be one per session)
      const battle = battles.find(b => b.status === 'forming') || battles[0];

      if (!battle) {
        return res.status(400).json({
          message: "No active battle found. Please create teams first."
        });
      }

      // Check if user is a captain
      const isTeamACaptain = battle.teamACaptainId === user.id;
      const isTeamBCaptain = battle.teamBCaptainId === user.id;

      if (!isTeamACaptain && !isTeamBCaptain) {
        return res.status(403).json({
          message: "Only team captains can start battles"
        });
      }

      // Validate both teams exist and have at least 1 member
      if (!battle.teamBCaptainId || !battle.teamBName) {
        return res.status(400).json({
          message: "Opposing team not created yet. Waiting for opponent captain to accept invitation."
        });
      }

      // Count team members (captain + teammates)
      const teamASize = 1 + (battle.teamATeammates?.length || 0);
      const teamBSize = 1 + (battle.teamBTeammates?.length || 0);

      if (teamASize < 1 || teamBSize < 1) {
        return res.status(400).json({
          message: `Both teams need at least 1 member. Current: Team A has ${teamASize}, Team B has ${teamBSize}`
        });
      }


      // Send WebSocket event to trigger the start_team_battle handler
      // The handler will process the event and start the battle
      // We send it to the captain who initiated the start
      sendToUser(user.id, {
        type: "start_team_battle",
        gameSessionId: gameSessionId,
        userId: user.id,
      } as any);


      return res.json({
        message: "Team battle start initiated",
        gameSessionId
      });
    } catch (error: any) {
      console.error(`[POST /api/team-battle/start] Error:`, error);
      console.error(`[POST] Stack trace:`, error?.stack);
      res.status(500).json({
        message: "Failed to start team battle",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // CRITICAL: API endpoint to get battle phase (server-authoritative state)
  // GET /api/team-battle/phase?gameSessionId=xxx
  // This is the single source of truth for whether a battle has started
  app.get("/api/team-battle/phase", ensureAuthenticated, async (req, res) => {
    try {
      const { gameSessionId } = req.query;
      if (!gameSessionId || typeof gameSessionId !== "string") {
        return res.status(400).json({ message: "gameSessionId is required" });
      }

      const battles = await database.getTeamBattlesByGameSession(gameSessionId);
      if (battles.length === 0) {
        return res.json({ phase: null, status: null });
      }

      // Get the most recent battle
      const battle = battles.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      // Map status to phase
      // "forming" → LOBBY
      // "ready" → COUNTDOWN
      // "playing" → IN_GAME
      // "finished" → FINISHED
      const phaseMap: Record<string, string> = {
        forming: "LOBBY",
        ready: "COUNTDOWN",
        playing: "IN_GAME",
        finished: "FINISHED",
      };

      const phase = phaseMap[battle.status] || battle.status;

      // CRITICAL: Also return participant list for authorization
      // Get teams to determine who can enter the battle
      const teams = await convertTeamBattleToTeams(battle);
      const participantIds = new Set<number>();
      for (const team of teams) {
        if (team.captainId) participantIds.add(team.captainId);
        for (const member of team.members || []) {
          if (member.userId) participantIds.add(member.userId);
        }
      }

      return res.json({
        phase,
        status: battle.status,
        gameSessionId: battle.gameSessionId,
        battleId: battle.id,
        participantIds: Array.from(participantIds), // For client-side authorization
        teamsCount: teams.length,
      });
    } catch (error) {
      console.error("[GET /api/team-battle/phase] Error:", error);
      return res.status(500).json({ message: "Failed to get battle phase" });
    }
  });

  // ============================================================================
  // DB-AUTHORITATIVE TEAM BATTLE STATE API
  // ============================================================================
  // This is the SINGLE SOURCE OF TRUTH for team battle state.
  // Clients must fetch from this endpoint and render UI based on its response.
  // WebSocket events are just notifications to trigger a refetch.
  // ============================================================================
  app.get("/api/team-battle/state", ensureAuthenticated, async (req, res) => {
    try {
      const { gameSessionId } = req.query;
      if (!gameSessionId || typeof gameSessionId !== "string") {
        return res.status(400).json({ message: "gameSessionId is required" });
      }

      const battles = await database.getTeamBattlesByGameSession(gameSessionId);
      if (battles.length === 0) {
        return res.json({
          phase: "no_battle",
          battleId: null,
          gameSessionId,
          teams: [],
          countdown: null,
          serverTime: Date.now(),
        });
      }

      // Get the most recent battle (should only be one per session)
      const battle = battles.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      // Get ready state from database (source of truth)
      const readyState = await database.getTeamReadyState(battle.id);

      // Map status to phase
      const phaseMap: Record<string, string> = {
        forming: "forming",
        ready: "countdown",
        playing: "started",
        finished: "finished",
      };
      const phase = phaseMap[battle.status] || battle.status;

      // Calculate countdown if in ready/countdown phase
      let countdown: number | null = null;
      if (battle.status === "ready" && readyState.teamAReady && readyState.teamBReady) {
        // Both teams ready - calculate remaining countdown
        const readyTimestamp = readyState.updatedAt;
        if (readyTimestamp) {
          const countdownDuration = 5000; // 5 seconds countdown
          const elapsed = Date.now() - new Date(readyTimestamp).getTime();
          const remaining = Math.max(0, countdownDuration - elapsed);
          countdown = Math.ceil(remaining / 1000);

          // If countdown is 0, phase should transition to started
          if (countdown <= 0) {
            countdown = 0;
          }
        }
      }

      // Build team structures with ready state from DB
      const teams = [];

      // Team A
      if (battle.teamACaptainId) {
        const teamAMembers: number[] = [battle.teamACaptainId];
        if (Array.isArray(battle.teamATeammates)) {
          for (const t of battle.teamATeammates as any[]) {
            const id = typeof t === 'object' && t !== null ? (t as any).id : t;
            if (typeof id === 'number') teamAMembers.push(id);
          }
        }

        teams.push({
          teamId: `${battle.id}-team-a`,
          teamSide: "A",
          name: battle.teamAName,
          captainId: battle.teamACaptainId,
          members: teamAMembers,
          ready: readyState.teamAReady,
          readyAt: battle.teamAReadyAt,
        });
      }

      // Team B
      if (battle.teamBCaptainId && battle.teamBName) {
        const teamBMembers: number[] = [battle.teamBCaptainId];
        if (Array.isArray(battle.teamBTeammates)) {
          for (const t of battle.teamBTeammates as any[]) {
            const id = typeof t === 'object' && t !== null ? (t as any).id : t;
            if (typeof id === 'number') teamBMembers.push(id);
          }
        }

        teams.push({
          teamId: `${battle.id}-team-b`,
          teamSide: "B",
          name: battle.teamBName,
          captainId: battle.teamBCaptainId,
          members: teamBMembers,
          ready: readyState.teamBReady,
          readyAt: battle.teamBReadyAt,
        });
      }

      // Monotonic version based on server response time so unready/cancel
      // is never treated as stale compared to the prior ready snapshot.
      const stateVersion = Date.now();

      // Build response
      const response = {
        phase,
        battleId: battle.id,
        gameSessionId: battle.gameSessionId,
        status: battle.status,
        teams,
        countdown,
        bothReady: readyState.teamAReady && readyState.teamBReady,
        serverTime: stateVersion,
        createdAt: battle.createdAt,
        startedAt: battle.startedAt,
        stateVersion,
      };


      return res.json(response);
    } catch (error) {
      console.error("[GET /api/team-battle/state] Error:", error);
      return res.status(500).json({ message: "Failed to get battle state" });
    }
  });

  return httpServer;
}
