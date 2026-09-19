export type RoutingMode = "single" | "parallel" | "deliberation";

export type Capability =
  | "reasoning"
  | "coding"
  | "research"
  | "fast"
  | "cheap"
  | "long_context"
  | "vision"
  | "function_calling";

export type ResponsePhase = "initial" | "critique" | "synthesis";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelResponse {
  id?: string;
  model_id: string;
  provider: string;
  display_name: string;
  phase: ResponsePhase;
  content?: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  success: boolean;
  error?: string;
}

export interface ContextUsed {
  id: string;
  title: string;
  type: string;
  chars: number;
  truncated: boolean;
  parts?: number;
  total_parts?: number;
  total_chars?: number;
  sections?: string[];
}

/** How much of a project's context was sent versus what sending everything
 * would have cost, from app/retrieval.py's section-based selection. */
export interface ContextStats {
  sent_chars: number;
  full_chars: number;
  sent_tokens: number;
  full_tokens: number;
  saved_tokens: number;
  items_total: number;
  items_used: number;
}

export interface ContextPreview {
  items: ContextUsed[];
  stats: ContextStats;
}

export interface ChatHistoryTurn {
  message_id: string;
  prompt: string;
  sent_at: string;
  mode: RoutingMode;
  responses: ModelResponse[];
  synthesis?: ModelResponse | null;
  chosen_response_id?: string | null;
  context_used?: ContextUsed[];
}

export interface ChatHistory {
  conversation_id?: string | null;
  turns: ChatHistoryTurn[];
}

export interface ChatResponse {
  conversation_id: string;
  message_id: string;
  mode: RoutingMode;
  responses: ModelResponse[];
  chosen_model_id?: string;
  synthesis?: ModelResponse;
  context_used?: ContextUsed[];
  context_stats?: ContextStats;
}

export type ProjectStatus = "active" | "planning" | "research";

export interface Project {
  id: string;
  name: string;
  description?: string;
  archived: boolean;
  status: ProjectStatus;
  category?: string | null;
  tags: string[];
  source_path?: string | null;
  created_at: string;
  updated_at: string;
}

export type ContextType = "document" | "note" | "url" | "file";

export interface ContextItem {
  id: string;
  project_id: string;
  type: ContextType;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ModelSpec {
  id: string;
  provider: string;
  display_name: string;
  context_window: number;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  capabilities: Capability[];
  speed_tier: number;
  is_active: boolean;
}

export interface UsageByModel {
  model_id: string | null;
  request_count: number;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
}

export interface UsageSummary {
  request_count: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  by_model: UsageByModel[];
}

export interface ProjectStats {
  context_count: number;
  decisions_count: number;
  conversation_count: number;
  message_count: number;
  last_activity_at?: string;
}

export interface ActivityItem {
  kind: "context" | "decision";
  id: string;
  label: string;
  detail?: string;
  ts: string;
}

export interface DecisionItem {
  id: string;
  project_id: string;
  message_id: string;
  chosen_response_id: string;
  task_type: string;
  mode: RoutingMode;
  rationale?: string;
  decided_at: string;
  model_id: string;
  provider: string;
  phase: ResponsePhase;
  title?: string | null;
  status?: DecisionStatus;
  tags?: string[];
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string; // "" = the list of drives
  parent?: string | null;
  entries: BrowseEntry[];
}

export interface ImportCandidate {
  name: string;
  path: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  file_count: number;
  already_imported: boolean;
}

export interface ImportResult {
  created: Project[];
  skipped: { path: string; reason: string }[];
  context_items: number;
}

export interface WatchedFolder {
  id: string;
  path: string;
  auto_import: boolean;
  last_scan_at?: string | null;
  created_at: string;
  pending: string[];
  excluded: string[];
  exists: boolean;
}

export interface RecentImport {
  at: string;
  watch_id: string;
  project_id: string;
  name: string;
  path: string;
}

export interface ProjectRefresh {
  at: string;
  project_id: string;
  name: string;
  changes: string[];
}

export interface WatchStatus {
  watches: WatchedFolder[];
  recent: RecentImport[];
  updates: ProjectRefresh[];
  interval_seconds: number;
}

export interface DashboardSummary {
  totals: {
    projects: number;
    projects_this_month: number;
    files: number;
    files_this_week: number;
    decisions: number;
    decisions_this_month: number;
  };
  activity: { date: string; chats: number; files: number; decisions: number }[];
  usage: { total_requests: number; by_provider: Record<string, number> };
  recent: {
    kind: "file" | "context_synced" | "decision" | "project";
    id: string;
    label: string;
    project_name: string;
    project_id: string;
    ts: string;
    count: number;
  }[];
  days: number;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  target_date?: string | null;
  is_done: boolean;
  created_at: string;
}

export interface WorkspaceSettings {
  owner_id: string;
  workspace_name: string;
  default_view: string;
  default_model?: string | null;
  response_style: string;
  auto_save_context: boolean;
  multi_model_default: boolean;
  auto_save_decisions: boolean;
  include_files_context: boolean;
  updated_at: string;
}

export interface IntegrationField {
  key: string;
  label: string;
  secret: boolean;
}

export interface IntegrationCatalogEntry {
  key: string;
  name: string;
  category: string;
  fields: IntegrationField[];
  has_live_check: boolean;
}

export interface IntegrationCredential {
  service: string;
  status: "connected" | "invalid" | "unknown";
  status_detail?: string | null;
  last_checked_at?: string | null;
  updated_at: string;
  fields_set: string[];
}

export interface GitHubRepository {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  description?: string | null;
  default_branch: string;
  html_url: string;
  updated_at?: string | null;
}

export interface GitHubImportResult {
  project: Project;
  context_items: number;
  already_imported: boolean;
}

/** Real usage numbers for /analytics beyond what DashboardSummary covers —
 * see backend/app/api/analytics.py. */
export interface AnalyticsSummary {
  total_requests: number;
  requests_prev_period: number;
  active_projects: number;
  decisions_period: number;
  decisions_prev_period: number;
  usage_by_day: { date: string; openai: number; anthropic: number; gemini: number; other: number }[];
  cost_by_day: { date: string; cost_usd: number }[];
  total_cost_usd: number;
  top_projects: { project_id: string; name: string; requests: number }[];
  heatmap: number[][];
  storage_bytes: number;
  days: number;
}

export type DecisionStatus = "implemented" | "in_progress" | "under_review" | "archived";

export interface DecisionCard {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  snippet: string;
  status: DecisionStatus;
  tags: string[];
  task_type: string;
  mode: RoutingMode;
  provider: string;
  model_id: string;
  decided_at: string;
  implemented_at?: string | null;
}

export interface DecisionStats {
  total: number;
  implemented: number;
  in_progress: number;
  under_review: number;
  archived: number;
  total_this_month: number;
  implemented_this_month: number;
  in_progress_this_month: number;
  under_review_this_month: number;
}

export interface Perspective {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  content?: string | null;
  success: boolean;
}

export interface DecisionDetail extends DecisionCard {
  decision_text: string;
  context: string;
  outcome_note?: string | null;
  context_item_ids?: string[];
  perspectives: Perspective[];
  related_files: number;
  related_decisions: number;
  decided_by: string;
}

export type LibraryKind = "file" | "note" | "link" | "code" | "image" | "conversation";

export interface LibraryItem {
  id: string;
  title: string;
  type: string;
  kind: LibraryKind;
  folder: string;
  created_at: string;
  updated_at: string;
  size: number;
  snippet: string;
  source: "import" | "app" | "link" | "chat";
  edited: boolean;
  url?: string | null;
  original_name?: string | null;
  has_file?: boolean;
  pages?: number | null;
}

export interface LibraryStats {
  files: number;
  links: number;
  notes: number;
  messages: number;
}

export interface LibraryItemDetail extends LibraryItem {
  content: string;
  summary: { overview: string; outline: string[]; words: number; minutes: number; tasks_done: number; tasks_total: number };
  related: { id: string; title: string; folder: string }[];
  used_in: { count: number; recent: { prompt: string; at: string }[] };
  versions: { id: string; title: string; source: string; created_at: string; chars: number }[];
}

export interface ProviderCredit {
  provider: string;
  label: string;
  key_status: "valid" | "invalid" | "unreachable" | "missing";
  balance_usd: number | null;
  set_at: string | null;
  spent_usd: number | null;
  remaining_usd: number | null;
}

export interface CreditSummary {
  providers: ProviderCredit[];
  total_balance_usd: number | null;
  total_spent_usd: number | null;
  total_remaining_usd: number | null;
  tracked_providers: number;
  lifetime_spend_usd: number;
}
