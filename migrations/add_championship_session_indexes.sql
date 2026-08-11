-- Forward migration: Championship <-> Team Battle session indexes
--
-- Context
-- -------
-- A Championship match is linked to its Team Battle purely by a shared
-- game_session_id value:
--
--   championship_matches.game_session_id  ==  team_battles.game_session_id
--
-- There is no foreign key between them (team_battles.game_session_id is not
-- unique), and until now neither column was indexed. Both are looked up on the
-- hot path:
--
--   * server/socket.ts broadcastChampionshipQuestion() - once per question
--   * server/socket.ts broadcastChampionshipScore()    - once per scored question
--   * server/socket.ts endTeamBattle()                 - once per match
--   * server/database.ts getTeamBattlesByGameSession() - on nearly every
--     socket event (authenticate, get_game_state, start, ready, disconnect)
--
-- This migration is additive and idempotent. It creates no tables, alters no
-- columns and deletes no data.
--
-- Safe to run more than once. Safe to run on a database that already contains
-- championship data.

-- 1. One Championship match : one Team Battle session.
--
--    UNIQUE enforces the intended business relationship - two matches can never
--    share a Team Battle session. Only POST /api/championship-matches/:id/start
--    ever assigns game_session_id (as a fresh uuid per match), so a duplicate is
--    always a bug.
--
--    NULL is permitted and repeatable: PostgreSQL unique indexes allow many NULL
--    rows, which is required because every 'upcoming' match has a NULL
--    game_session_id until it is started.
--
--    This unique index also serves the equality lookups above, so no separate
--    non-unique index is needed on this column.
CREATE UNIQUE INDEX IF NOT EXISTS championship_matches_game_session_id_key
  ON championship_matches (game_session_id);

-- 2. Team Battle lookup by session.
--
--    NOT unique: existing production data legitimately contains several
--    game_session_id values with more than one team_battles row (verified), so a
--    unique index here would fail. This is a plain lookup index only.
CREATE INDEX IF NOT EXISTS idx_team_battles_game_session_id
  ON team_battles (game_session_id);
