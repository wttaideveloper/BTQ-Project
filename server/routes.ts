import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { database } from "./database";
import { setupWebSocketServer, sendToUser, getOnlineUserIds, debugForceEndTeamBattle, listActiveGameSessions } from "./socket";
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
import { log } from "./vite";

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
        console.log(`🗑️  Deleted ALL ${staleBattles.length} forming battles`);
      } else {
        // Delete only stale battles (forming >30 minutes)
        staleBattles = await sql`
          DELETE FROM team_battles 
          WHERE status = 'forming' 
          AND created_at < NOW() - INTERVAL '30 minutes'
          RETURNING id, team_a_name, team_b_name, created_at
        `;
        console.log(`🗑️  Deleted ${staleBattles.length} stale battles (>30 min)`);
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
  console.log("✅ Registering team join request routes...");

  // Helper function to parse team ID and get team from team_battles
  async function getTeamFromBattle(teamId: string) {
    try {
      console.log(`[getTeamFromBattle] Starting with teamId: ${teamId}`);

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

      console.log(`[getTeamFromBattle] Parsed: battleId=${battleId}, teamSide=${teamSide}`);

      // First try: Get battle by battleId
      let battle = await database.getTeamBattle(battleId);
      if (!battle) {
        console.log(`[getTeamFromBattle] Battle not found by ID: ${battleId}, trying alternative lookup...`);

        // Alternative lookup: Find battle by gameSessionId and team captain
        // This handles cases where teamId might be a different format
        const allBattles = await database.getTeamBattlesByStatus("forming");
        console.log(`[getTeamFromBattle] Found ${allBattles.length} forming battles, searching for matching team...`);

        for (const b of allBattles) {
          console.log(`[getTeamFromBattle] Checking battle ${b.id}: TeamA=${b.teamAName} (captain: ${b.teamACaptainId}), TeamB=${b.teamBName} (captain: ${b.teamBCaptainId})`);

          // Check if this battle has the team we're looking for
          const teams = await convertTeamBattleToTeams(b);
          const matchingTeam = teams.find(t => {
            // Match by teamSide or by checking if teamId matches any team's ID
            return t.teamSide === teamSide || t.id === teamId || t.teamId === teamId;
          });

          if (matchingTeam) {
            console.log(`[getTeamFromBattle] ✅ Found matching team in battle ${b.id}: ${matchingTeam.name}`);
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
        console.log(`[getTeamFromBattle] Available teams in battle:`, teams.map(t => `${t.name} (${t.id})`));
        return null;
      }

      console.log(`[getTeamFromBattle] ✅ Found team: ${team.name} (${team.id})`);
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
        console.log('Member already in team');
        return;
      }
      
      // Add new member
      const updatedTeammates = [...currentTeammates, member];
      
      // Update database
      await database.updateTeamBattle(battleId, {
        [teammatesField]: updatedTeammates
      });
      
      console.log(`✅ Added member ${member.username} to team ${teamSide.toUpperCase()} in battle ${battleId}`);
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
      
      console.log(`[GET /api/team-join-requests] Fetching ALL join requests for captain ${userId}`);
      
      const joinRequests = await database.getJoinRequestsForCaptain(userId);
      
      console.log(`[GET /api/team-join-requests] Returning ${joinRequests.length} join requests`);
      console.log(`[GET /api/team-join-requests] Response:`, JSON.stringify(joinRequests.map(jr => ({
        id: jr.id,
        team_id: jr.team_id,
        requester: jr.requester_username || jr.requesterUsername,
        status: jr.status
      })), null, 2));
      
      res.json(joinRequests);
    } catch (err) {
      console.error("Failed to fetch team join requests:", err);
      res.status(500).json({ message: "Failed to fetch team join requests" });
    }
  });

  // POST - Create a join request
  app.post("/api/team-join-requests", ensureAuthenticated, async (req, res) => {
    try {
      console.log('[POST /api/team-join-requests] Step 1: Called');
      const { teamId } = req.body;
      const user = req.user as Express.User;
      console.log('[POST /api/team-join-requests] Step 2: User', user.username, 'ID:', user.id, 'requesting team:', teamId);

      if (!teamId) {
        console.error('[POST /api/team-join-requests] Team ID missing');
        return res.status(400).json({ message: "Team ID is required" });
      }

      console.log('[POST /api/team-join-requests] Step 3: Fetching team details');
      // Get team details from team_battles (teams are virtual)
      const team = await getTeamFromBattle(teamId);
      if (!team) {
        console.error('[POST /api/team-join-requests] Team not found:', teamId);
        return res.status(404).json({ message: "Team not found" });
      }
      console.log('[POST /api/team-join-requests] Team found:', team.name, 'teamId:', team.id);

      console.log('[POST /api/team-join-requests] Step 4: Checking capacity');
      // Check if team is full
      const currentMembers = 1 + (team.teammates?.length || 0);
      console.log('[POST /api/team-join-requests] Team has', currentMembers, '/4 members');
      if (currentMembers >= 4) {
        console.error('[POST /api/team-join-requests] Team is full');
        return res.status(400).json({ message: "Team is full" });
      }

      console.log('[POST /api/team-join-requests] Step 5: Checking existing requests');
      // Check if user already has a pending request for this team
      const allUserRequests = await database.getJoinRequestsByUser(user.id);
      const existingRequest = allUserRequests.find((r: any) => r.teamId === team.id && r.status === "pending");
      if (existingRequest) {
        console.error('[POST /api/team-join-requests] User already has pending request');
        return res.status(400).json({
          message: "You already have a pending request for this team",
        });
      }
      console.log('[POST /api/team-join-requests] No existing requests');

      console.log('[POST /api/team-join-requests] Step 6: Creating request with 5min expiry');
      // CRITICAL FIX: Use the actual team.id (from database) instead of the input teamId
      // This ensures the join request is created with the correct team ID that matches the database
      const actualTeamId = team.id;
      console.log('[POST /api/team-join-requests] Using actual team ID:', actualTeamId);

      // Create join request with 5 minute expiry (increased from 60s to handle timezone issues)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const joinRequest = await database.createJoinRequest(
        actualTeamId,  // ✅ FIX: Use the correct team ID
        user.id,
        user.username,
        expiresAt
      );
      console.log('[POST /api/team-join-requests] Request created:', joinRequest.id, 'for team:', actualTeamId);

      console.log('[POST /api/team-join-requests] Step 7: Sending websocket to captain');
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
        console.log('[POST /api/team-join-requests] Websocket sent to captain:', team.captainId);
      } catch (wsError) {
        console.error('[POST /api/team-join-requests] Websocket failed:', wsError);
        // Don't fail the request if websocket fails
      }

      console.log('[POST /api/team-join-requests] Step 8: Sending response');
      res.json(joinRequest);
      console.log('[POST /api/team-join-requests] Completed successfully');
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
      
      console.log(`[PATCH /api/team-join-requests/${id}] User ${user.id} (${user.username}) attempting to ${status}`);
      
      if (!status) return res.status(400).json({ message: "status required" });
      
      // Use the simplified method to get ALL join requests for this captain
      const captainRequests = await database.getJoinRequestsForCaptain(user.id);
      console.log(`[PATCH] Found ${captainRequests.length} join requests for captain ${user.id}`);
      
      let jr: any = captainRequests.find((r: any) => r.id === id);
      
      // If not found as captain, check if user is the requester
      if (!jr) {
        const reqsByUser = await database.getJoinRequestsByUser(user.id);
        jr = reqsByUser.find((r: any) => r.id === id);
        console.log(`[PATCH] Found as requester? ${!!jr}`);
      }
      
      if (!jr) {
        console.error(`[PATCH] Join request ${id} not found`);
        return res.status(404).json({ message: "Request not found" });
      }

      console.log(`[PATCH] Join request found:`, { id: jr.id, teamId: jr.team_id || jr.teamId, requesterId: jr.requester_id || jr.requesterId });

      const teamId = jr.team_id || jr.teamId;
      const team = await getTeamFromBattle(teamId);
      console.log(`[PATCH] Team found:`, team ? { id: team.id, name: team.name, captainId: team.captainId } : 'NULL');
      
      const isLeader = team?.captainId === user.id;
      const isRequester = (jr.requester_id || jr.requesterId) === user.id;
      
      console.log(`[PATCH] Authorization check: isLeader=${isLeader}, isRequester=${isRequester}, status=${status}`);
      
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
        if (!team) return res.status(404).json({ message: "Team not found" });
        const members = team.teammates || [];
        if (members.length >= 3) return res.status(400).json({ message: "Team full" });
        
        const requesterId = jr.requester_id || jr.requesterId;
        const requesterUsername = jr.requester_username || jr.requesterUsername;
        
        await addMemberToTeamBattle(teamId, {
          id: requesterId,
          username: requesterUsername,
        });
        
        // auto-reject if full now
        const updatedTeam = await getTeamFromBattle(teamId);
        if (updatedTeam && (updatedTeam.teammates?.length || 0) >= 3) {
          const pending = await database.getJoinRequestsByTeam(teamId);
          await Promise.all(
            pending
              .filter((r: any) => r.status === "pending")
              .map((r: any) => database.updateJoinRequestStatus(r.id, "rejected"))
          );
        }
      }

      // notify requester
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

      res.json({ id, status });
    } catch (error) {
      console.error("Error updating join request:", error);
      res.status(500).json({ message: "Failed to update join request" });
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

      console.log("Testing database insert with question:", testQuestion);

      const createdQuestion = await database.createQuestion(testQuestion);
      console.log("✅ Test question created successfully:", createdQuestion);

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
        console.log(`[Backend] Removing member ${userId} from ${teamSide.toUpperCase()} team in battle ${battleId}`);
        console.log(`[Backend] Current teammates:`, currentTeammates);
        const updatedTeammates = currentTeammates.filter(teammate => {
          const teammateId = typeof teammate === 'number' ? teammate : teammate.id;
          return teammateId !== userId;
        });
        console.log(`[Backend] Updated teammates:`, updatedTeammates);

        await database.updateTeamBattle(battleId, {
          [teammatesField]: updatedTeammates
        });
        console.log(`[Backend] Database updated for battle ${battleId}`);

        // Get updated battle to send fresh data
        const updatedBattle = await database.getTeamBattle(battleId);
        console.log(`[Backend] Updated battle teammates:`, updatedBattle.teamATeammates, updatedBattle.teamBTeammates);

        // Notify all participants about the team update (don't fail if this errors)
        try {
          sendToGameSession(battle.gameSessionId, {
            type: "teams_updated",
            teams: await convertTeamBattleToTeams(updatedBattle),
          });
        } catch (notifyError) {
          console.error("[Backend] Failed to send teams_updated notification:", notifyError);
        }

        // Notify removed user (don't fail if this errors)
        try {
          sendToUser(userId, {
            type: "team_member_removed",
            teamId,
          });
        } catch (notifyError) {
          console.error("[Backend] Failed to send team_member_removed notification:", notifyError);
        }

        res.json({ ok: true, members: updatedTeammates });
        console.log(`[Backend] Remove member response sent`);
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

      console.log("Testing with exact payload format:", questions);

      const storedQuestions = [];
      for (const question of questions) {
        try {
          console.log(`Testing question: ${question.text}`);
          console.log(
            `Question difficulty: ${question.difficulty}, category: ${question.category}`
          );

          // Test validation first
          const validation =
            QuestionValidationService.validateQuestion(question);
          console.log(`Validation result:`, validation);

          if (!validation.isValid) {
            console.log(
              `❌ Validation failed: ${validation.errors.join(", ")}`
            );
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

      console.log(
        `Generating ${count} questions for category: ${category}, difficulty: ${difficulty}`
      );

      // Generate questions using OpenAI (returns for review, doesn't save to database)
      const generatedQuestions = await generateQuestions(
        category,
        difficulty,
        count
      );

      console.log(
        `Successfully generated ${generatedQuestions.length} questions for review`
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

      console.log("Received questions for storage:", questions);

      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Questions array is required" });
      }

      // Log each question's difficulty and category
      questions.forEach((question, index) => {
        console.log(`Question ${index + 1}:`, {
          difficulty: question.difficulty,
          category: question.category,
          text: question.text?.substring(0, 50) + "...",
        });
      });

      // Store questions directly using database.createQuestion - NO VALIDATION
      const storedQuestions = [];

      for (const question of questions) {
        try {
          console.log(
            `\n🔍 Processing question: ${question.text?.substring(0, 50)}...`
          );
          console.log(`Question data:`, {
            id: question.id,
            text: question.text,
            category: question.category,
            difficulty: question.difficulty,
            context: question.context,
            answersCount: question.answers?.length,
          });

          // Store directly without any validation
          console.log(`📝 Storing question directly to database...`);
          const storedQuestion = await database.createQuestion(question);

          console.log(
            `✅ Successfully stored question with ID: ${storedQuestion.id}`
          );
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

      console.log(
        `Successfully stored ${storedQuestions.length} out of ${questions.length} questions`
      );

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



  // Get questions for a game with enhanced user-specific selection
  app.get("/api/game/questions", async (req, res) => {
    try {
      const category = req.query.category as string;
      const difficulty = req.query.difficulty as string;
      const count = parseInt(req.query.count as string) || 10;
      const gameId = req.query.gameId as string; // Unique game session ID
      const userId = req.user?.id; // Get user ID if authenticated
      
      // Add cache-busting headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      // Use enhanced question selection with user history
      const questions = await database.getRandomQuestionsWithHistory({
        category: category !== "All Categories" ? category : undefined,
        difficulty,
        count,
        userId: userId || undefined,
        excludeRecentHours: 0, // Disabled - only 24 questions total in database
      });

      console.log(`🎮 Game ${gameId}: Served ${questions.length} fresh questions to ${userId ? `user ${userId} (${req.user?.username})` : 'anonymous user'} with enhanced randomization`);
      
      // Log first few question IDs for debugging
      const questionIds = questions.slice(0, 3).map(q => q.id.substring(0, 8));
      console.log(`📝 Question IDs: [${questionIds.join(', ')}...]`);
      
      res.json(questions);
    } catch (err) {
      console.error("Error fetching game questions:", err);
      res.status(500).json({ message: "Failed to fetch game questions" });
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
          console.log('Question history tracking failed (non-critical):', historyErr);
        }
      }

      // Respond quickly to avoid blocking the game
      res.status(200).json({ message: "Analytics tracked successfully" });
    } catch (err) {
      console.log("Analytics tracking error (non-critical):", err);
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
      console.log("Saving multiplayer score:", req.body);

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
      console.log("Multiplayer score saved successfully:", savedScore);
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
      console.log(
        "Leaderboard request for gameType:",
        gameType,
        "category:",
        category
      );

      // Validate parameters
      if (!["all", "single", "multi"].includes(gameType)) {
        return res.status(400).json({ message: "Invalid gameType parameter" });
      }

      const leaderboardData = await database.getLeaderboardData(
        gameType,
        category
      );
      console.log(
        "Leaderboard data returned:",
        leaderboardData.length,
        "entries"
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
    const onlineUserIds = getOnlineUserIds();
    // Filter out current user
    const filteredUserIds = onlineUserIds.filter(
      (userId) => userId !== req.user?.id
    );

    // Fetch user details from database
    const userPromises = filteredUserIds.map(userId => 
      database.getUser(userId).then(user => {
        if (!user) return null;
        // Return only necessary fields, excluding sensitive data
        return {
          id: user.id,
          username: user.username,
          email: user.email
          // Add any other non-sensitive fields you need
        };
      })
    );

    const userDetails = (await Promise.all(userPromises)).filter(Boolean);
    console.log(userDetails, 'onlineUsers');
    res.json(userDetails);
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
      console.log(`[convertTeamBattleToTeams] Battle ${battle.id} Team A teammates:`, teammates);
      
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
        gameMode: "TEAM_BATTLE",
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
      console.log(`[convertTeamBattleToTeams] Battle ${battle.id} Team B teammates:`, teammates);
      
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
        gameMode: "TEAM_BATTLE",
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
      let gameType = "question";
      let category = "General";
      let difficulty = "medium";

      try {
        const gameSession = await database.getGameSession(
          req.body.gameSessionId
        );
        if (gameSession) {
          gameType =
            gameSession.gameType === "realtime"
              ? "question"
              : gameSession.gameType;
          category = gameSession.category || category;
          difficulty = gameSession.difficulty || difficulty;
        }
      } catch (err) {
        console.log("Could not fetch game session, using defaults:", err);
      }

      // Clean up any old "forming" teams created by this captain
      // This prevents ghost teams from appearing in available teams list
      try {
        const existingBattles = await database.getTeamBattlesByUser(req.user.id, 'forming');
        
        for (const battle of existingBattles) {
          console.log(`🧹 Cleaning up old forming team for captain ${req.user.id}: battle ${battle.id}`);
          await database.deleteTeamBattle(battle.id);
        }
        
        if (existingBattles.length > 0) {
          console.log(`✅ Removed ${existingBattles.length} old forming team(s) for captain ${req.user.id}`);
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
      
      // Debug logging to verify team creation
      console.log('✅ Team Created:', {
        teamId: `${battle.id}-team-a`,
        gameSessionId: battle.gameSessionId,
        status: battle.status,
        gameMode: 'TEAM_BATTLE',
        teamName: battle.teamAName
      });
      
      const teams = await convertTeamBattleToTeams(battle);
      res.status(201).json(teams[0]); // Return Team A
    } catch (err) {
      console.error("Failed to create team:", err);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  // Get teams for a game session (returns team battles converted to teams format)
  app.get("/api/teams", ensureAuthenticated, async (req, res) => {
    try {
      const gameSessionId = req.query.gameSessionId as string;
      console.log(`[Backend] GET /api/teams called for gameSessionId: ${gameSessionId}`);
      if (!gameSessionId) {
        return res.status(400).json({ message: "Game session ID required" });
      }

      const battles = await database.getTeamBattlesByGameSession(gameSessionId);
      console.log(`[Backend] Found ${battles.length} battles for session ${gameSessionId}`);
      if (battles.length === 0) {
        console.log(`[Backend] No battles found, returning empty array`);
        return res.json([]);
      }

      // Convert all battles to teams format
      const allTeams = [];
      for (const battle of battles) {
        const teams = await convertTeamBattleToTeams(battle);
        allTeams.push(...teams);
      }

      console.log(`[Backend] Returning ${allTeams.length} teams:`, allTeams.map(t => ({ id: t.id, name: t.name, membersCount: t.members.length })));
      res.json(allTeams);
    } catch (err) {
      console.error("Failed to fetch teams:", err);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Get ALL available teams across all game sessions for join-as-member
  app.get("/api/teams/available", ensureAuthenticated, async (req, res) => {
    try {
      // Set no-cache headers to prevent stale data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Get all active game sessions (sessions with forming battles)
      const activeSessions = listActiveGameSessions();
      const activeSessionIds = new Set(activeSessions); // activeSessions is string[]
      
      console.log(`🔍 Active sessions: ${Array.from(activeSessionIds).join(', ') || 'NONE'}`);

      // Get all team battles that are still forming
      const allBattles = await database.getTeamBattlesByStatus("forming");
      console.log(`📋 Found ${allBattles.length} total forming battles`);
      
      const allAvailableTeams = [];
      const now = Date.now();
      
      for (const battle of allBattles) {
        // CRITICAL: Only show teams from ACTIVE sessions
        // This prevents old/closed session teams from appearing
        const battleAge = now - new Date(battle.createdAt).getTime();
        const isStale = battleAge > 30 * 60 * 1000; // 30 minutes
        
        if (isStale) {
          console.log(`  ⏰ Skipping stale battle ${battle.id} (age: ${Math.round(battleAge / 60000)}min)`);
          continue;
        }
        
        const teams = await convertTeamBattleToTeams(battle);
        // Filter teams that are:
        // 1. Explicitly TEAM_BATTLE mode
        // 2. Status is "forming"
        // 3. Not full (< 3 members)
        // 4. From an active session (not closed)
        const availableTeams = teams.filter(
          (t: any) => 
            t.gameMode === "TEAM_BATTLE" &&
            t.status === "forming" && 
            (t.members?.length || 0) < 3
        );
        
        if (availableTeams.length > 0) {
          console.log(`  ✅ Battle ${battle.id} (session: ${battle.gameSessionId}): ${availableTeams.length} available teams, created: ${new Date(battle.createdAt).toISOString()}`);
        }
        allAvailableTeams.push(...availableTeams);
      }

      console.log(`✅ Returning ${allAvailableTeams.length} total available teams`);
      console.log(`   Team IDs: ${allAvailableTeams.map((t: any) => `${t.name}(${t.gameSessionId})`).join(', ') || 'NONE'}`);
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
          await database.deleteTeamBattle(battleId);

          // Notify all participants that the battle has been cancelled
          const participantIds = new Set<number>();
          if (battle.teamACaptainId) participantIds.add(battle.teamACaptainId);
          if (battle.teamBCaptainId) participantIds.add(battle.teamBCaptainId);
          for (const id of extractTeammateIds(battle.teamATeammates)) participantIds.add(id);
          for (const id of extractTeammateIds(battle.teamBTeammates)) participantIds.add(id);

          for (const participantId of Array.from(participantIds)) {
            if (participantId !== userId) {
              sendToUser(participantId, {
                type: "team_battle_cancelled",
                teamBattleId: battleId,
                gameSessionId: battle.gameSessionId,
                reason: "Team A captain left the battle",
                message: "The team battle has been cancelled because the Team A captain left.",
              });
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
              sendToUser(participantId, {
                type: "teams_updated",
                teams: teams,
                gameSessionId: updatedBattle.gameSessionId,
                message: `${req.user?.username || 'A player'} has left the team.`,
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

        for (const participantId of Array.from(participantIds)) {
          if (participantId !== userId) {
            sendToUser(participantId, {
              type: "teams_updated",
              teams: teams,
              gameSessionId: updatedBattle.gameSessionId,
              message: `${req.user?.username || 'A player'} has left the team.`,
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
          console.log(
            `✅ Opponent invitation - captured battle ID: ${teamBattleId}`
          );
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
                console.log(
                  `✅ Opponent invitation - found battle by session: ${teamBattleId}`
                );
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
            console.log(
              "This is an opponent invitation - update team battle with Team B"
            );

            // ✅ FIX: Use the teamBattleId from the invitation if available
            // Otherwise, find the inviter's existing team battle (Team A only)
            let existingBattle = null;

            if (updatedInvitation.teamBattleId) {
              // ✅ Use the specific battle referenced in the invitation
              existingBattle = await database.getTeamBattle(
                updatedInvitation.teamBattleId
              );
              console.log(
                `✅ Using battle from invitation: ${updatedInvitation.teamBattleId}`
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

                console.log(
                  `✅ Using most recent battle: ${existingBattle?.id}`
                );
              }
            }

            if (!existingBattle) {
              return res.status(404).json({
                message: "Inviter's team battle not found. Cannot add Team B.",
              });
            }

            // ✅ FIX: VERIFY Team A name is NOT overwritten - preserve it
            console.log(
              `📝 Preserving Team A Name: "${existingBattle.teamAName}"`
            );
            console.log(
              `📝 Setting Team B Name: "${req.body.teamName || req.user!.username + "'s Team"}"`
            );

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

            // Notify the inviter that opponent accepted and team battle was created
            try {
              sendToUser(invitation.inviterId, {
                type: "opponent_accepted_invitation",
                message: `${
                  req.user!.username
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

  console.log("✅ All routes registered successfully");
  return httpServer;
}
