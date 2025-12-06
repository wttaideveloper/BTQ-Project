import "dotenv/config";
import postgres from "postgres";

async function setupDatabase() {
  let client: postgres.Sql;
  
  try {
    console.log("🚀 Setting up PostgreSQL database for Bible Trivia Quest...");
    
    // Step 1: Connect as postgres user to create application user and database (primarily for local dev)
    console.log("📋 Step 1: Connecting as postgres user...");
    client = postgres(process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/postgres");
    
    // Step 2: Create application user
    console.log("👤 Step 2: Creating application user...");
    try {
      await client`CREATE USER faithiq_user WITH PASSWORD 'faithiq_password123'`;
      console.log("✅ User 'faithiq_user' created successfully");
    } catch (error: any) {
      if (error.message.includes("already exists")) {
        console.log("ℹ️  User 'faithiq_user' already exists");
      } else {
        throw error;
      }
    }
    
    // Step 3: Create database
    console.log("🗄️  Step 3: Creating database...");
    try {
      await client`CREATE DATABASE bible_trivia_db`;
      console.log("✅ Database 'bible_trivia_db' created successfully");
    } catch (error: any) {
      if (error.message.includes("already exists")) {
        console.log("ℹ️  Database 'bible_trivia_db' already exists");
      } else {
        throw error;
      }
    }
    
    // Step 4: Grant privileges
    console.log("🔐 Step 4: Granting privileges...");
    await client`GRANT ALL PRIVILEGES ON DATABASE bible_trivia_db TO faithiq_user`;
    await client`ALTER USER faithiq_user CREATEDB`;
    console.log("✅ Privileges granted successfully");
    
    // Close connection to postgres database
    await client.end();
    
    // Step 5: Test connection with application user
    console.log("🧪 Step 5: Testing application user connection...");
    const appClient = postgres(process.env.DATABASE_URL || "postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
    
    const testResult = await appClient`SELECT 1 as test`;
    console.log("✅ Application user connection successful:", testResult[0]);
    
    await appClient.end();
    
    console.log("");
    console.log("🎉 Database setup completed successfully!");
    console.log("");
    console.log("📋 Database Configuration:");
    console.log("   Database: bible_trivia_db");
    console.log("   User: faithiq_user");
    console.log("   Password: faithiq_password123");
    console.log("   Connection: postgresql://faithiq_user:faithiq_password123@localhost:5432/bible_trivia_db");
    console.log("");
    console.log("🔄 Next steps:");
    console.log("   1. Run: npm run db:init");
    console.log("   2. Start application: npm run dev");
    
  } catch (error) {
    console.error("❌ Error setting up database:", error);
    
    if (error instanceof Error) {
      if (error.message.includes("connection refused")) {
        console.log("\n🔧 PostgreSQL is not running. Please start it:");
        console.log("   sudo systemctl start postgresql");
      } else if (error.message.includes("authentication failed")) {
        console.log("\n🔧 Authentication failed. Please check PostgreSQL configuration:");
        console.log("   sudo nano /etc/postgresql/*/main/pg_hba.conf");
        console.log("   Change 'peer' to 'md5' for local connections");
        console.log("   sudo systemctl restart postgresql");
      } else if (error.message.includes("role \"postgres\" does not exist")) {
        console.log("\n🔧 PostgreSQL is not properly installed. Please install it:");
        console.log("   sudo apt update && sudo apt install postgresql postgresql-contrib");
      }
    }
    
    process.exit(1);
  }
}

// Run the setup
setupDatabase(); 