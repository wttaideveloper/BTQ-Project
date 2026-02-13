// Quick script to run the is_in_team_battle migration
const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable not found');
    process.exit(1);
}

console.log('🔗 Connecting to database...');

const sql = postgres(connectionString);

async function runMigration() {
    try {
        console.log('📝 Running migration: Adding is_in_team_battle column...');

        // Add the column
        await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_in_team_battle BOOLEAN DEFAULT FALSE;
    `;
        console.log('✅ Column added successfully');

        // Create the index
        await sql`
      CREATE INDEX IF NOT EXISTS idx_users_team_battle_availability 
      ON users(is_online, is_in_team_battle) 
      WHERE is_online = TRUE AND is_in_team_battle = TRUE;
    `;
        console.log('✅ Index created successfully');

        // Verify the column exists
        const result = await sql`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_in_team_battle';
    `;

        if (result.length > 0) {
            console.log('✅ Migration completed successfully!');
            console.log('📊 Column details:', result[0]);
        } else {
            console.log('⚠️ Column might not have been created');
        }

        await sql.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        await sql.end();
        process.exit(1);
    }
}

runMigration();
