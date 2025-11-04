import postgres from "postgres";

async function createDatabase() {
  try {
    console.log("Checking database connection...");
    
    // Connect to default postgres database using postgres user for initial setup
    // Use hardcoded connection to avoid environment variable issues
    const defaultConnectionString = "postgresql://postgres:postgres_password123@localhost:5432/postgres";
    const client = postgres(defaultConnectionString);
    
    // Get database name from connection string or use default
    const dbName = process.env.DATABASE_URL?.split('/').pop() || "bible_trivia_db";
    
    console.log(`Checking if database '${dbName}' exists...`);
    
    // Check if database exists
    const result = await client`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    
    if (result.length === 0) {
      console.log(`Creating database '${dbName}'...`);
      await client`CREATE DATABASE ${client(dbName)}`;
      console.log(`Database '${dbName}' created successfully!`);
    } else {
      console.log(`Database '${dbName}' already exists.`);
    }
    
    await client.end();
    console.log("Database check completed!");
    
  } catch (error) {
    console.error("Error creating database:", error);
    console.log("\nPlease make sure PostgreSQL is running and accessible.");
    console.log("You can also manually create the database using:");
    console.log(`createdb ${process.env.DATABASE_URL?.split('/').pop() || "bible_trivia_db"}`);
    process.exit(1);
  }
}

createDatabase(); 