-- Cleanup script for old team battles
-- Run with: psql your_database_url < cleanup-battles.sql

-- 1. Show expired join requests
SELECT 'Expired Join Requests:' as info;
SELECT id, team_id, requester_username, created_at, expires_at 
FROM team_join_request 
WHERE expires_at < NOW()
ORDER BY created_at DESC;

-- 2. Delete expired join requests
DELETE FROM team_join_request 
WHERE expires_at < NOW();

-- 3. Show old join requests (>1 hour)
SELECT 'Old Join Requests (>1 hour):' as info;
SELECT id, team_id, requester_username, created_at, expires_at 
FROM team_join_request 
WHERE created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- 4. Delete old join requests
DELETE FROM team_join_request 
WHERE created_at < NOW() - INTERVAL '1 hour';

-- 5. Show stale battles (forming for >30 minutes)
SELECT 'Stale Battles (forming >30 min):' as info;
SELECT id, team_a_name, team_b_name, status, created_at, 
       EXTRACT(EPOCH FROM (NOW() - created_at))/60 as age_minutes,
       game_session_id
FROM team_battles 
WHERE status = 'forming' 
AND created_at < NOW() - INTERVAL '30 minutes'
ORDER BY created_at DESC;

-- 6. UNCOMMENT TO DELETE STALE BATTLES:
-- DELETE FROM team_battles 
-- WHERE status = 'forming' 
-- AND created_at < NOW() - INTERVAL '30 minutes';

-- 7. Show current active battles
SELECT 'Current Active Battles:' as info;
SELECT id, team_a_name, team_b_name, status, created_at,
       EXTRACT(EPOCH FROM (NOW() - created_at))/60 as age_minutes,
       game_session_id
FROM team_battles 
WHERE status = 'forming'
ORDER BY created_at DESC;
