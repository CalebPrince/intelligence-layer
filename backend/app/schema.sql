-- Model-Agnostic Layer — SQLite schema (local dev; no cloud project needed).
-- Same shape as the Postgres/Supabase design it replaced, minus what SQLite
-- can't do: no pgvector (project_context embeddings/RAG would need e.g.
-- sqlite-vec later), no RLS (single-process local dev, not multi-tenant),
-- UUIDs generated in Python instead of gen_random_uuid().

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',
  category    TEXT,
  tags        TEXT NOT NULL DEFAULT '[]',
  source_path TEXT,
  fingerprint TEXT,
  detected    TEXT,
  synced_at   TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  github_action_mode TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS project_context (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('document', 'note', 'url', 'file')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  folder      TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS project_context_project_id_idx ON project_context(project_id);

CREATE TABLE IF NOT EXISTS conversations (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title          TEXT NOT NULL DEFAULT 'New conversation',
  created_at     TEXT NOT NULL,
  agent_key      TEXT,     -- e.g. 'sage': routes through app/sage_client.py instead of router.py
  external_token TEXT      -- the real agent's own session token (e.g. prince-web-app's sage_chats.token)
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  context_used    TEXT
);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);

-- editable without a deploy, same idea as before — unpopulated until an ops
-- workflow writes to it; config.py's MODEL_REGISTRY remains the real source
-- of truth until then
CREATE TABLE IF NOT EXISTS model_registry (
  id                 TEXT PRIMARY KEY,
  model_id           TEXT UNIQUE NOT NULL,
  provider           TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  context_window     INTEGER NOT NULL,
  cost_per_1k_input  REAL NOT NULL,
  cost_per_1k_output REAL NOT NULL,
  capabilities       TEXT NOT NULL DEFAULT '[]',
  speed_tier         INTEGER NOT NULL DEFAULT 2,
  avg_latency_ms     INTEGER,
  is_active          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS routing_rules (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  conditions    TEXT NOT NULL DEFAULT '{}',
  mode          TEXT NOT NULL CHECK (mode IN ('single', 'parallel', 'deliberation')),
  target_models TEXT NOT NULL DEFAULT '[]',
  priority      INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS model_responses (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  model_id    TEXT NOT NULL,
  provider    TEXT NOT NULL,
  phase       TEXT NOT NULL DEFAULT 'initial' CHECK (phase IN ('initial', 'critique', 'synthesis')),
  content     TEXT,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0,
  latency_ms  INTEGER NOT NULL DEFAULT 0,
  success     INTEGER NOT NULL DEFAULT 1,
  error       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS model_responses_message_id_idx ON model_responses(message_id);

CREATE TABLE IF NOT EXISTS error_logs (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT,
  source      TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'error',
  message     TEXT NOT NULL,
  detail      TEXT,
  path        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS error_logs_owner_created_idx ON error_logs(owner_id, created_at);

-- which perspective the user actually acted on, and under what ask
-- (task_type/mode) — router.py's per-project affinity signal reads this
CREATE TABLE IF NOT EXISTS decisions (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  message_id          TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chosen_response_id  TEXT NOT NULL REFERENCES model_responses(id) ON DELETE CASCADE,
  task_type           TEXT NOT NULL DEFAULT 'general',
  mode                TEXT NOT NULL CHECK (mode IN ('single', 'parallel', 'deliberation')),
  rationale           TEXT,
  decided_at          TEXT NOT NULL,
  title               TEXT,
  status              TEXT NOT NULL DEFAULT 'in_progress',
  tags                TEXT NOT NULL DEFAULT '[]',
  implemented_at      TEXT
);
CREATE INDEX IF NOT EXISTS decisions_project_task_idx ON decisions(project_id, task_type);

CREATE TABLE IF NOT EXISTS usage_logs (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  model_response_id  TEXT REFERENCES model_responses(id) ON DELETE SET NULL,
  tokens_in          INTEGER NOT NULL DEFAULT 0,
  tokens_out         INTEGER NOT NULL DEFAULT 0,
  cost_usd           REAL NOT NULL DEFAULT 0,
  latency_ms         INTEGER NOT NULL DEFAULT 0,
  success            INTEGER NOT NULL DEFAULT 1,
  error_message      TEXT,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_logs_project_id_idx ON usage_logs(project_id);

CREATE TABLE IF NOT EXISTS watched_folders (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  path         TEXT NOT NULL,
  auto_import  INTEGER NOT NULL DEFAULT 1,
  known        TEXT NOT NULL DEFAULT '[]',
  last_scan_at TEXT,
  created_at   TEXT NOT NULL
);

-- Earlier text of a context item, kept whenever it is replaced (edit, sync, restore).
CREATE TABLE IF NOT EXISTS context_versions (
  id         TEXT PRIMARY KEY,
  context_id TEXT NOT NULL REFERENCES project_context(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  source     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS context_versions_context_id_idx ON context_versions(context_id);

-- Credit you loaded per provider (entered by hand: providers do not expose balances).
CREATE TABLE IF NOT EXISTS credit_accounts (
  provider    TEXT PRIMARY KEY,
  balance_usd REAL NOT NULL,
  set_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  target_date TEXT,
  is_done     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS milestones_project_id_idx ON milestones(project_id);

-- One row per owner (matches the DEMO_OWNER_ID convention used everywhere
-- else until real auth exists). Fixed columns, not generic key/value, since
-- the Settings page's General tab has a fixed, known shape.
CREATE TABLE IF NOT EXISTS settings (
  owner_id               TEXT PRIMARY KEY,
  workspace_name         TEXT NOT NULL DEFAULT 'My Workspace',
  default_view           TEXT NOT NULL DEFAULT 'dashboard',
  default_model          TEXT,
  response_style         TEXT NOT NULL DEFAULT 'balanced',
  auto_save_context      INTEGER NOT NULL DEFAULT 1,
  multi_model_default    INTEGER NOT NULL DEFAULT 1,
  auto_save_decisions    INTEGER NOT NULL DEFAULT 1,
  include_files_context  INTEGER NOT NULL DEFAULT 1,
  updated_at             TEXT NOT NULL
);

-- A pasted token/key per (owner, service). `status` is set by the last
-- test-connection call, not trusted blindly — see app/integrations.py.
CREATE TABLE IF NOT EXISTS integration_credentials (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL,
  service         TEXT NOT NULL,
  credential      TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('connected', 'invalid', 'unknown')),
  status_detail   TEXT,
  last_checked_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (owner_id, service)
);

-- A folder can exist with zero items (created empty, or emptied by deletes);
-- project_context.folder alone can't represent that. Renaming updates both
-- this row and every item's folder column together.
CREATE TABLE IF NOT EXISTS context_folders (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, name)
);

-- Shared memory for agents used by this app and prince-web-app. The key is
-- intentionally independent of a local project so both applications can use
-- the authenticated workspace user as the same memory owner.
CREATE TABLE IF NOT EXISTS shared_agent_memory (
  id         TEXT PRIMARY KEY,
  memory_key TEXT NOT NULL,
  agent_key  TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_agent_memory_lookup_idx
  ON shared_agent_memory (memory_key, agent_key, created_at);

CREATE TABLE IF NOT EXISTS github_oauth_states (
  state TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_webhook_events (
  delivery_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_action_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'manual', 'reject')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'rejected', 'executed', 'failed')),
  message TEXT NOT NULL,
  files TEXT NOT NULL,
  branch TEXT,
  commit_sha TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
