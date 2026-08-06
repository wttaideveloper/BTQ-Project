CREATE TABLE IF NOT EXISTS championships (
  id text PRIMARY KEY, name text NOT NULL, description text,
  start_date timestamp, end_date timestamp,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','completed')),
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS championship_teams (
  id text PRIMARY KEY, championship_id text NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  name text NOT NULL, captain_id integer NOT NULL REFERENCES users(id),
  member_ids json NOT NULL DEFAULT '[]', emoticon text NOT NULL DEFAULT '👏',
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  UNIQUE (championship_id, name)
);
CREATE TABLE IF NOT EXISTS championship_matches (
  id text PRIMARY KEY, championship_id text NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  team_a_id text NOT NULL REFERENCES championship_teams(id),
  team_b_id text NOT NULL REFERENCES championship_teams(id),
  scheduled_at timestamp, status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','live','completed')),
  stream_url text, team_a_score integer NOT NULL DEFAULT 0,
  team_b_score integer NOT NULL DEFAULT 0, winner_team_id text REFERENCES championship_teams(id),
  game_session_id text, started_at timestamp, completed_at timestamp,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  CHECK (team_a_id <> team_b_id)
);
CREATE INDEX IF NOT EXISTS championship_matches_championship_idx
  ON championship_matches(championship_id, status);
