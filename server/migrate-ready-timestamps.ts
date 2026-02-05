import "dotenv/config";
import postgres from "postgres";

async function migrateReadyTimestamps() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  console.log("🚀 Starting migration: Add team ready timestamps...");
  console.log("🔗 Connecting to database:", connectionString.replace(/:[^:@]*@/, ":****@"));
  console.log("⚠️  IMPORTANT: This migration only adds columns. Ready timestamps will only be set by new READY logic going forward.");

  // Create connection for migration (uses same DATABASE_URL as application)
  const sql = postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
    onnotice: () => {},
  });

  try {
    // Step 1: Add columns
    console.log("📋 Step 1: Adding team_a_ready_at and team_b_ready_at columns...");
    await sql`
      ALTER TABLE team_battles
      ADD COLUMN IF NOT EXISTS team_a_ready_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS team_b_ready_at TIMESTAMP NULL
    `;
    console.log("✅ Columns added successfully");

    // Step 2: Create index (optional - for performance, not required for correctness)
    console.log("📋 Step 2: Creating optional index for ready state queries...");
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_team_battles_ready_state 
        ON team_battles(team_a_ready_at, team_b_ready_at) 
        WHERE team_a_ready_at IS NOT NULL OR team_b_ready_at IS NOT NULL
      `;
      console.log("✅ Index created successfully (optional performance optimization)");
    } catch (error: any) {
      console.log("ℹ️  Index creation skipped (non-critical):", error.message);
    }

    // Step 3: Add comments
    console.log("📋 Step 3: Adding column comments...");
    await sql`
      COMMENT ON COLUMN team_battles.team_a_ready_at IS 'Timestamp when Team A marked ready. NULL = not ready, timestamp = ready'
    `;
    await sql`
      COMMENT ON COLUMN team_battles.team_b_ready_at IS 'Timestamp when Team B marked ready. NULL = not ready, timestamp = ready'
    `;
    console.log("✅ Comments added successfully");

    // Step 4: Verify
    console.log("📋 Step 4: Verifying migration...");
    const verify = await sql`
      SELECT 
        column_name, 
        data_type, 
        is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'team_battles' 
        AND column_name IN ('team_a_ready_at', 'team_b_ready_at')
    `;
    
    if (verify.length === 2) {
      console.log("✅ Migration verified successfully!");
      console.log("   - team_a_ready_at:", verify.find(c => c.column_name === 'team_a_ready_at')?.data_type);
      console.log("   - team_b_ready_at:", verify.find(c => c.column_name === 'team_b_ready_at')?.data_type);
    } else {
      console.log("⚠️  Warning: Could not verify all columns");
    }

    console.log("\n🎉 Migration completed successfully!");
    console.log("✅ Ready to use the new ready state system");

  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    
    if (error.code === "ENOTFOUND" || error.message.includes("ENOTFOUND")) {
      console.error("\n🔍 Network Connection Issue Detected:");
      console.error("   - Cannot resolve database hostname");
      console.error("   - This could be due to:");
      console.error("     1. Internet connection problem");
      console.error("     2. Neon database is paused (wake it up in Neon dashboard)");
      console.error("     3. DNS resolution issue");
      console.error("     4. Firewall/VPN blocking connection");
      console.error("\n💡 Solutions:");
      console.error("   1. Check your internet connection");
      console.error("   2. Visit Neon dashboard and wake up the database if paused");
      console.error("   3. Verify DATABASE_URL in .env file is correct");
      console.error("   4. Try running the migration from a different network");
      console.error("   5. Check if VPN/firewall is blocking Neon connections");
    } else if (error.message.includes("already exists")) {
      console.log("ℹ️  Columns may already exist. This is safe to ignore.");
    } else if (error.message.includes("timeout") || error.message.includes("ECONNREFUSED")) {
      console.error("\n🔍 Connection Timeout/Refused:");
      console.error("   - Database server may be unreachable");
      console.error("   - Check if database is running and accessible");
      console.error("   - Verify DATABASE_URL is correct");
    } else {
      throw error;
    }
  } finally {
    await sql.end();
  }
}

// Run migration
migrateReadyTimestamps()
  .then(() => {
    console.log("\n✅ Migration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration script failed:", error);
    process.exit(1);
  });
