-- ============================================================================
-- Migration: Add Team Battle Availability Tracking
-- Description: Adds isInTeamBattle flag to track users actively in Team Battle
-- Date: 2026-02-12
-- Author: AI Assistant
-- ============================================================================

-- ============================================================================
-- PROBLEM STATEMENT
-- ============================================================================
-- Currently, the system uses a single 'is_online' flag to determine if a user
-- is available for Team Battle invitations. This causes issues because:
--
-- 1. Users appear "available" even when they haven't opened Team Battle
-- 2. Captains can send invitations to users who aren't ready to receive them
-- 3. Invitations get lost because recipients aren't actively in Team Battle
--
-- SOLUTION: Add a separate 'is_in_team_battle' flag that is only TRUE when
-- a user is actively in the Team Battle module.
-- ============================================================================

-- ============================================================================
-- STEP 1: Add new column
-- ============================================================================
ALTER TABLE users 
ADD COLUMN is_in_team_battle BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- STEP 2: Add performance index
-- ============================================================================
-- This index optimizes the query: 
-- SELECT * FROM users WHERE is_online = TRUE AND is_in_team_battle = TRUE
CREATE INDEX idx_users_team_battle_availability 
ON users(is_online, is_in_team_battle) 
WHERE is_online = TRUE AND is_in_team_battle = TRUE;

-- ============================================================================
-- STEP 3: Add column documentation
-- ============================================================================
COMMENT ON COLUMN users.is_in_team_battle IS 
'Indicates if user is currently in the Team Battle module and ready to receive invitations. 
This is separate from is_online which only indicates if user is logged in.

Usage:
- Set to TRUE when user opens Team Battle modal
- Set to FALSE when user closes Team Battle modal or navigates away
- Used to filter available users for Team Battle invitations

Example query to get available users:
SELECT * FROM users 
WHERE is_online = TRUE AND is_in_team_battle = TRUE;';

-- ============================================================================
-- STEP 4: Initialize existing data (optional)
-- ============================================================================
-- Set all existing users to NOT in Team Battle
-- This ensures a clean state after migration
UPDATE users 
SET is_in_team_battle = FALSE 
WHERE is_online = TRUE;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify column was added
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'is_in_team_battle';

-- Verify index was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users' AND indexname = 'idx_users_team_battle_availability';

-- Check current state of users
SELECT 
  id, 
  username, 
  is_online, 
  is_in_team_battle,
  last_seen
FROM users
WHERE is_online = TRUE
ORDER BY last_seen DESC
LIMIT 10;

-- ============================================================================
-- EXPECTED RESULTS
-- ============================================================================
-- After running this migration:
-- 1. All users should have is_in_team_battle = FALSE
-- 2. Index should exist and be ready for use
-- 3. Application can now track Team Battle availability separately from online status
-- ============================================================================

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- If you need to rollback this migration, run:
-- 
-- DROP INDEX IF EXISTS idx_users_team_battle_availability;
-- ALTER TABLE users DROP COLUMN IF EXISTS is_in_team_battle;
-- ============================================================================
