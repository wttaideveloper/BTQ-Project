import { database, db } from "./database";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function setupDatabase() {
  try {
    console.log("Setting up database tables...");
    
    // Create tables using Drizzle
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT,
        is_admin BOOLEAN DEFAULT FALSE,
        is_online BOOLEAN DEFAULT FALSE,
        last_seen TIMESTAMP DEFAULT NOW(),
        total_games INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create index for faster username lookups
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // Create index for online users
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online) WHERE is_online = true;
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        captain_id INTEGER NOT NULL,
        game_session_id TEXT NOT NULL,
        members JSON DEFAULT '[]',
        score INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        incorrect_answers INTEGER DEFAULT 0,
        average_time INTEGER DEFAULT 0,
        final_answers JSON DEFAULT '[]',
        status TEXT DEFAULT 'forming',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS team_invitations (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        inviter_id INTEGER NOT NULL,
        invitee_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS game_results (
        id TEXT PRIMARY KEY,
        player_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        correct_answers INTEGER NOT NULL,
        incorrect_answers INTEGER NOT NULL,
        average_time INTEGER NOT NULL,
        category TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS single_player_scores (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    correct_answers INTEGER NOT NULL,
    incorrect_answers INTEGER NOT NULL,
    average_time TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    game_type TEXT NOT NULL,
    total_questions INTEGER NOT NULL,
    time_limit INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    context TEXT,
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    answers JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        players JSON NOT NULL,
        current_question INTEGER DEFAULT 0,
        game_type TEXT NOT NULL,
        category TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        start_time TIMESTAMP DEFAULT NOW(),
        end_time TIMESTAMP,
        status TEXT DEFAULT 'waiting'
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY,
        challenger_id INTEGER NOT NULL,
        challengee_id INTEGER NOT NULL,
        game_session_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        category TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL,
        winner_user_id INTEGER,
        is_draw BOOLEAN DEFAULT FALSE,
        challenger_completed BOOLEAN DEFAULT FALSE,
        challengee_completed BOOLEAN DEFAULT FALSE,
        notification_sent BOOLEAN DEFAULT FALSE
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS challenge_results (
        id TEXT PRIMARY KEY,
        challenge_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        score INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        incorrect_answers INTEGER DEFAULT 0,
        average_time INTEGER DEFAULT 0,
        completed_at TIMESTAMP,
        answers JSON DEFAULT '[]'
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        challenge_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create voice_settings table for ElevenLabs voice cloning
    await db.execute(`
      CREATE TABLE IF NOT EXISTS voice_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        elevenlabs_voice_id TEXT,
        voice_name TEXT,
        voice_description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create voice_usage table for ElevenLabs credit monitoring
    await db.execute(`
      CREATE TABLE IF NOT EXISTS voice_usage (
        id TEXT PRIMARY KEY,
        voice_id TEXT NOT NULL,
        text_length INTEGER NOT NULL,
        estimated_credits INTEGER NOT NULL,
        request_type TEXT NOT NULL,
        game_session_id TEXT,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for better performance
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read) WHERE read = false;
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_challenges_user_id ON challenges(challenger_id, challengee_id);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_challenge_results_user_id ON challenge_results(user_id);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_game_results_player_name ON game_results(player_name);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_teams_captain_id ON teams(captain_id);
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_team_invitations_user_id ON team_invitations(inviter_id, invitee_id);
    `);

    console.log("Database tables created successfully!");
    
    // Create initial admin user
    const adminUser = await db.select().from(users).where(eq(users.username, "admin"));
    if (adminUser.length === 0) {
      const { hashPassword } = await import("./auth");
      await db.insert(users).values({
        username: "admin",
        password: await hashPassword("admin123"),
        isAdmin: true,
        isOnline: false,
        lastSeen: new Date(),
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0
      });
      console.log("Created initial admin user: admin / admin123");
    }

    // Create some sample users for testing
    const sampleUsers = [
      { username: "john_doe", password: "password123", email: "john@example.com" },
      { username: "jane_smith", password: "password123", email: "jane@example.com" },
      { username: "bob_wilson", password: "password123", email: "bob@example.com" },
      { username: "alice_brown", password: "password123", email: "alice@example.com" }
    ];

    for (const sampleUser of sampleUsers) {
      const existingUser = await db.select().from(users).where(eq(users.username, sampleUser.username));
      if (existingUser.length === 0) {
        const { hashPassword } = await import("./auth");
        await db.insert(users).values({
          username: sampleUser.username,
          password: await hashPassword(sampleUser.password),
          email: sampleUser.email,
          isAdmin: false,
          isOnline: false,
          lastSeen: new Date(),
          totalGames: 0,
          wins: 0,
          losses: 0,
          draws: 0
        });
        console.log(`Created sample user: ${sampleUser.username} / ${sampleUser.password}`);
      }
    }

    // Create default voice settings
    const { voiceSettings } = await import("@shared/schema");
    const existingVoiceSettings = await db.select().from(voiceSettings).where(eq(voiceSettings.id, "default"));
    if (existingVoiceSettings.length === 0) {
      await db.insert(voiceSettings).values({
        id: "default",
        elevenlabsVoiceId: null,
        voiceName: "Default Voice",
        voiceDescription: "Default system voice for Bible Trivia",
        isActive: true
      });
      console.log("Created default voice settings");
    }
    
  } catch (error) {
    console.error("Error setting up database:", error);
    throw error;
  }
}

// Run setup if this file is executed directly
setupDatabase()
  .then(() => {
    console.log("Database setup completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Database setup failed:", error);
    process.exit(1);
  });

export { setupDatabase }; 