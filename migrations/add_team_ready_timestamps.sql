-- Migration: Add teamAReadyAt and teamBReadyAt timestamps to team_battles table
-- Purpose: Make database the single source of truth for ready state
-- Date: 2025-01-XX

-- Add ready timestamp columns (nullable - null = not ready, timestamp = ready)
ALTER TABLE team_battles
ADD COLUMN IF NOT EXISTS team_a_ready_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS team_b_ready_at TIMESTAMP NULL;

-- Create index for faster queries on ready state
CREATE INDEX IF NOT EXISTS idx_team_battles_ready_state 
ON team_battles(team_a_ready_at, team_b_ready_at) 
WHERE team_a_ready_at IS NOT NULL OR team_b_ready_at IS NOT NULL;

-- For existing battles with status "ready" or "playing", set both teams as ready
-- This preserves existing state during migration
UPDATE team_battles
SET 
  team_a_ready_at = COALESCE(team_a_ready_at, NOW()),
  team_b_ready_at = COALESCE(team_b_ready_at, NOW())
WHERE status IN ('ready', 'playing')
  AND (team_a_ready_at IS NULL OR team_b_ready_at IS NULL);

-- Add comment explaining the columns
COMMENT ON COLUMN team_battles.team_a_ready_at IS 'Timestamp when Team A marked ready. NULL = not ready, timestamp = ready';
COMMENT ON COLUMN team_battles.team_b_ready_at IS 'Timestamp when Team B marked ready. NULL = not ready, timestamp = ready';

