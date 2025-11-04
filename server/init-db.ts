import { database } from "./database";

async function initializeDatabase() {
  try {
    console.log("🚀 Initializing PostgreSQL database with sample data...");
    
    // Initialize the database with sample data
    await database.initializeDatabase();
    
    console.log("✅ Database initialization completed successfully!");
    console.log("🎉 Your Bible Trivia Quest database is ready!");
    
  } catch (error) {
    console.error("❌ Error initializing PostgreSQL database:", error);
    
    if (error instanceof Error) {
      if (error.message.includes("password authentication failed")) {
        console.log("\n🔧 Authentication Error - Please run the PostgreSQL setup:");
        console.log("sudo ./server/setup-postgres.sh");
      } else if (error.message.includes("connection refused")) {
        console.log("\n🔧 Connection Error - Please make sure PostgreSQL is running:");
        console.log("sudo systemctl start postgresql");
      } else if (error.message.includes("database does not exist")) {
        console.log("\n🔧 Database Error - Please create the database:");
        console.log("sudo ./server/setup-postgres.sh");
      }
    }
    
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase(); 