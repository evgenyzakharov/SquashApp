-- Supabase schema for SquashApp
-- Run this in the Supabase SQL editor to set up the database

-- Players
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  player1_id TEXT NOT NULL REFERENCES players(id),
  player2_id TEXT NOT NULL REFERENCES players(id),
  score1 INT NOT NULL,
  score2 INT NOT NULL,
  elo_before_p1 REAL NOT NULL,
  elo_before_p2 REAL NOT NULL,
  elo_after_p1 REAL NOT NULL,
  elo_after_p2 REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rating snapshots (for rating history chart)
CREATE TABLE rating_snapshots (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  match_id TEXT NOT NULL REFERENCES matches(id),
  ratings JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_matches_date ON matches(date);
CREATE INDEX idx_matches_player1 ON matches(player1_id);
CREATE INDEX idx_matches_player2 ON matches(player2_id);
CREATE INDEX idx_rating_snapshots_date ON rating_snapshots(date);

-- Row Level Security: allow anonymous read/write (for club use)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on matches" ON matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on rating_snapshots" ON rating_snapshots FOR ALL USING (true) WITH CHECK (true);
