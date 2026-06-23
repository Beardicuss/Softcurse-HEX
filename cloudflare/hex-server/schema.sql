CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ka',
  assistant_mode TEXT NOT NULL DEFAULT 'hex',
  persona_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_normalized_name
ON profiles(normalized_name);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  label TEXT,
  platform TEXT,
  app_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  device_id TEXT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_goal TEXT,
  current_surface TEXT,
  browser_url TEXT,
  browser_title TEXT,
  last_user_message TEXT,
  last_assistant_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_profile_updated
ON sessions(profile_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  role TEXT NOT NULL,
  surface TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created
ON messages(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.7,
  source_session_id TEXT,
  source_message_id TEXT,
  tags_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memories_profile_kind
ON memories(profile_id, kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  pref_key TEXT NOT NULL,
  pref_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_preferences_profile_key
ON preferences(profile_id, pref_key);

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personas_profile_active
ON personas(profile_id, is_active DESC, updated_at DESC);


CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  session_id TEXT,
  device_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  surface TEXT,
  action_type TEXT,
  summary TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_profile_created
ON activity_events(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_session_created
ON activity_events(session_id, created_at DESC);
