import type {
  ActivityItem,
  AnalyticsSummary,
  BrowseResult,
  Capability,
  ChatHistory,
  ChatMessage,
  ChatResponse,
  ContextPreview,
  CreditSummary,
  ContextItem,
  ContextType,
  DashboardSummary,
  DecisionCard,
  DecisionDetail,
  DecisionItem,
  DecisionStats,
  DecisionStatus,
  ImportCandidate,
  ImportResult,
  IntegrationCatalogEntry,
  IntegrationCredential,
  LibraryItem,
  LibraryItemDetail,
  LibraryStats,
  Milestone,
  ModelSpec,
  Project,
  ProjectStats,
  ProjectStatus,
  RoutingMode,
  UsageSummary,
  WatchStatus,
  WatchedFolder,
  WorkspaceSettings,
} from "@/types";

// Client-side requests go through the /api/backend/* rewrite in next.config.ts
// so the backend origin never has to be exposed to the browser. Server
// components have no browser origin for a relative fetch to resolve against,
// so they need the absolute backend URL instead.
const BASE = typeof window === "undefined" ? process.env.BACKEND_URL ?? "http://localhost:8000" : "/api/backend";

export async function sendChat(params: {
  projectId: string;
  conversationId?: string;
  messages: ChatMessage[];
  mode?: RoutingMode;
  capabilities?: Capability[];
  taskType?: string;
  explicitModels?: string[];
}): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: params.projectId,
      conversation_id: params.conversationId,
      messages: params.messages,
      criteria: {
        mode: params.mode ?? "single",
        required_capabilities: params.capabilities ?? [],
        task_type: params.taskType ?? "general",
        explicit_models: params.explicitModels && params.explicitModels.length > 0 ? params.explicitModels : null,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function recordDecision(params: {
  projectId: string;
  messageId: string;
  chosenResponseId: string;
  taskType: string;
  mode: RoutingMode;
  rationale?: string;
}): Promise<void> {
  const res = await fetch(`${BASE}/v1/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: params.projectId,
      message_id: params.messageId,
      chosen_response_id: params.chosenResponseId,
      task_type: params.taskType,
      mode: params.mode,
      rationale: params.rationale,
    }),
  });
  if (!res.ok) throw new Error(`Failed to record decision: ${res.status} ${await res.text()}`);
}

export async function listModels(): Promise<ModelSpec[]> {
  const res = await fetch(`${BASE}/v1/models`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load model registry");
  return res.json();
}

export async function getUsageSummary(projectId: string): Promise<UsageSummary> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/usage`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load usage: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function listDecisions(projectId: string): Promise<DecisionItem[]> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/decisions`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load decisions: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function listProjects(ownerId: string): Promise<Project[]> {
  const res = await fetch(`${BASE}/v1/projects?owner_id=${encodeURIComponent(ownerId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load projects: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getProject(projectId: string): Promise<Project> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load project: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function updateProject(
  projectId: string,
  params: { archived?: boolean; status?: ProjectStatus; category?: string; tags?: string[] }
): Promise<Project> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to update project: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load project stats: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function listActivity(projectId: string): Promise<ActivityItem[]> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/activity`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load activity: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function createProject(params: {
  ownerId: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  category?: string;
  tags?: string[];
}): Promise<Project> {
  const res = await fetch(`${BASE}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_id: params.ownerId,
      name: params.name,
      description: params.description,
      status: params.status,
      category: params.category,
      tags: params.tags,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create project: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function listContext(projectId: string): Promise<ContextItem[]> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/context`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load project context: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function addContext(params: {
  projectId: string;
  type: ContextType;
  title: string;
  content: string;
  folder?: string;
  metadata?: Record<string, unknown>;
}): Promise<ContextItem> {
  const res = await fetch(`${BASE}/v1/projects/${params.projectId}/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: params.type,
      title: params.title,
      content: params.content,
      metadata: params.metadata ?? {},
      folder: params.folder || null,
    }),
  });
  if (!res.ok) throw new Error(`Failed to add context: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function deleteContext(projectId: string, contextId: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/context/${contextId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete context: ${res.status} ${await res.text()}`);
}

// --- import projects from a local folder -----------------------------------

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // not JSON
  }
  return `${fallback} (${res.status})`;
}

export async function browseFolders(path: string): Promise<BrowseResult> {
  const res = await fetch(`${BASE}/v1/import/browse?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not open that folder"));
  return res.json();
}

export async function scanFolder(params: {
  path: string;
  ownerId: string;
  selfFolder?: boolean;
}): Promise<ImportCandidate[]> {
  const qs = new URLSearchParams({ path: params.path, owner_id: params.ownerId });
  if (params.selfFolder) qs.set("self_folder", "true");
  const res = await fetch(`${BASE}/v1/import/scan?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not scan that folder"));
  return res.json();
}

export async function importProjects(params: {
  ownerId: string;
  paths: string[];
  importDocs: boolean;
}): Promise<ImportResult> {
  const res = await fetch(`${BASE}/v1/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner_id: params.ownerId, paths: params.paths, import_docs: params.importDocs }),
  });
  if (!res.ok) throw new Error(await readError(res, "Import failed"));
  return res.json();
}

// --- live folder scanner ----------------------------------------------------

export async function getWatchStatus(ownerId: string): Promise<WatchStatus> {
  const res = await fetch(`${BASE}/v1/watch?owner_id=${encodeURIComponent(ownerId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load folder watchers"));
  return res.json();
}

export async function startWatching(params: { ownerId: string; path: string; autoImport?: boolean }): Promise<WatchedFolder> {
  const res = await fetch(`${BASE}/v1/watch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner_id: params.ownerId, path: params.path, auto_import: params.autoImport ?? true }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not start watching that folder"));
  return res.json();
}

export async function updateWatch(watchId: string, params: { autoImport: boolean }): Promise<WatchedFolder> {
  const res = await fetch(`${BASE}/v1/watch/${watchId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auto_import: params.autoImport }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not update the watcher"));
  return res.json();
}

export async function stopWatching(watchId: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/watch/${watchId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Could not stop watching"));
}

export async function excludeWatchedFolder(watchId: string, path: string): Promise<WatchedFolder> {
  const res = await fetch(`${BASE}/v1/watch/${watchId}/exclude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not ignore that folder"));
  return res.json();
}

export async function unexcludeWatchedFolder(watchId: string, path: string): Promise<WatchedFolder> {
  const res = await fetch(`${BASE}/v1/watch/${watchId}/exclude?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Could not restore that folder"));
  return res.json();
}

export async function scanWatchNow(watchId: string): Promise<{ imported: Project[]; refreshed: number }> {
  const res = await fetch(`${BASE}/v1/watch/${watchId}/scan`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "Scan failed"));
  return res.json();
}

// --- bulk stats + manual sync ------------------------------------------------

export async function getAllProjectStats(ownerId: string): Promise<Record<string, ProjectStats>> {
  const res = await fetch(`${BASE}/v1/projects/stats?owner_id=${encodeURIComponent(ownerId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load project stats"));
  return res.json();
}

export async function syncProject(projectId: string): Promise<{ project: Project; changes: string[] }> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/sync`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "Sync failed"));
  return res.json();
}

export async function getDashboard(ownerId: string, days = 7): Promise<DashboardSummary> {
  const res = await fetch(`${BASE}/v1/dashboard?owner_id=${encodeURIComponent(ownerId)}&days=${days}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load the dashboard"));
  return res.json();
}

export async function getAnalytics(ownerId: string, days = 30): Promise<AnalyticsSummary> {
  const res = await fetch(`${BASE}/v1/analytics?owner_id=${encodeURIComponent(ownerId)}&days=${days}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load analytics"));
  return res.json();
}

// --- workspace settings ------------------------------------------------------

export async function getSettings(ownerId: string): Promise<WorkspaceSettings> {
  const res = await fetch(`${BASE}/v1/settings?owner_id=${encodeURIComponent(ownerId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load workspace settings"));
  return res.json();
}

export async function updateSettings(
  ownerId: string,
  fields: Partial<Omit<WorkspaceSettings, "owner_id" | "updated_at">>
): Promise<WorkspaceSettings> {
  const res = await fetch(`${BASE}/v1/settings?owner_id=${encodeURIComponent(ownerId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save workspace settings"));
  return res.json();
}

// --- integrations ------------------------------------------------------------

export async function getIntegrationCatalog(): Promise<IntegrationCatalogEntry[]> {
  const res = await fetch(`${BASE}/v1/integrations/catalog`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load integrations"));
  return res.json();
}

export async function listIntegrations(ownerId: string): Promise<IntegrationCredential[]> {
  const res = await fetch(`${BASE}/v1/integrations?owner_id=${encodeURIComponent(ownerId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load connected integrations"));
  return res.json();
}

export async function saveIntegration(ownerId: string, service: string, credential: Record<string, string>): Promise<IntegrationCredential> {
  const res = await fetch(`${BASE}/v1/integrations/${encodeURIComponent(service)}?owner_id=${encodeURIComponent(ownerId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save integration"));
  return res.json();
}

export async function deleteIntegration(ownerId: string, service: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/integrations/${encodeURIComponent(service)}?owner_id=${encodeURIComponent(ownerId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Could not disconnect integration"));
}

// --- milestones ----------------------------------------------------------------

export async function getNextMilestone(projectId: string): Promise<Milestone | null> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/milestones/next`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load the milestone"));
  return res.json();
}

export async function listMilestones(projectId: string): Promise<Milestone[]> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/milestones`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load milestones"));
  return res.json();
}

export async function createMilestone(projectId: string, title: string, targetDate?: string): Promise<Milestone> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/milestones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, target_date: targetDate || undefined }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not create the milestone"));
  return res.json();
}

export async function updateMilestone(
  projectId: string,
  milestoneId: string,
  fields: { title?: string; target_date?: string | null; is_done?: boolean }
): Promise<Milestone> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/milestones/${milestoneId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not update the milestone"));
  return res.json();
}

export async function deleteMilestone(projectId: string, milestoneId: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/milestones/${milestoneId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Could not delete the milestone"));
}

// --- real agents (prince-web-app) ---------------------------------------------

export interface SageChatResult {
  conversation_id: string;
  message_id: string;
  response_id: string;
  reply: string;
}

/** Talks to prince-web-app's real, public Sage agent — genuine memory, not a
 * lookalike (see backend/app/sage_client.py). Rate-limited by prince-web-app
 * itself (20 messages/hour, shared across everyone using this backend). */
export async function sageChat(projectId: string, message: string, conversationId?: string): Promise<SageChatResult> {
  const res = await fetch(`${BASE}/v1/agents/sage/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, conversation_id: conversationId, message }),
  });
  if (!res.ok) throw new Error(await readError(res, "Sage could not be reached"));
  return res.json();
}

export interface AgentChatResult {
  agent_key: string;
  conversation_id: string;
  message_id: string;
  response_id: string;
  reply: string;
}

export interface AgentHistory {
  conversation_id: string | null;
  turns: { message_id: string; prompt: string; response_id: string; reply: string }[];
}

export async function getAgentHistory(projectId: string, agentKey: string): Promise<AgentHistory> {
  const res = await fetch(`${BASE}/v1/agents/${encodeURIComponent(agentKey)}/history?project_id=${encodeURIComponent(projectId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res, "Could not load agent memory"));
  return res.json();
}

export async function agentChat(
  projectId: string,
  agentKey: string,
  message: string,
  transcript: { role: "user" | "agent"; text: string }[],
  conversationId?: string,
  memoryKey?: string
): Promise<AgentChatResult> {
  const res = await fetch(`${BASE}/v1/agents/admin/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, agent_key: agentKey, message, transcript, conversation_id: conversationId, memory_key: memoryKey }),
  });
  if (!res.ok) throw new Error(await readError(res, "Agent could not be reached"));
  return res.json();
}

// --- chat: restored history + what context was sent ---------------------------

export async function getChatHistory(projectId: string): Promise<ChatHistory> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/chat/history`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load the conversation"));
  return res.json();
}

export async function getContextUsed(projectId: string, q = ""): Promise<ContextPreview> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/context/used?q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load context sources"));
  return res.json();
}

// --- workspace decisions ------------------------------------------------------

export async function listWorkspaceDecisions(ownerId: string): Promise<{ items: DecisionCard[]; stats: DecisionStats }> {
  const res = await fetch(`${BASE}/v1/decisions?owner_id=${encodeURIComponent(ownerId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load decisions"));
  return res.json();
}

export async function getDecision(id: string): Promise<DecisionDetail> {
  const res = await fetch(`${BASE}/v1/decisions/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load that decision"));
  return res.json();
}

export async function updateDecision(
  id: string,
  params: {
    status?: DecisionStatus;
    title?: string;
    tags?: string[];
    outcome_note?: string | null;
    implemented_at?: string | null;
    context_item_ids?: string[];
  }
): Promise<DecisionDetail> {
  const res = await fetch(`${BASE}/v1/decisions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not update the decision"));
  return res.json();
}

// --- context library ------------------------------------------------------------

export async function getLibrary(projectId: string, days?: number): Promise<{ items: LibraryItem[]; stats: LibraryStats }> {
  const qs = days ? `?days=${days}` : "";
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load the context library"));
  return res.json();
}

export async function getLibraryItem(projectId: string, itemId: string): Promise<LibraryItemDetail> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/${encodeURIComponent(itemId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not open that item"));
  return res.json();
}

export async function listContextFolders(projectId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/folders`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load folders"));
  return res.json();
}

export async function createContextFolder(projectId: string, name: string): Promise<string[]> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not create folder"));
  return res.json();
}

export async function renameContextFolder(projectId: string, name: string, newName: string): Promise<string[]> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/folders/${encodeURIComponent(name)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not rename folder"));
  return res.json();
}

export async function deleteContextFolder(projectId: string, name: string): Promise<string[]> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/folders/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Could not delete folder"));
  return res.json();
}

export async function updateLibraryItem(
  projectId: string,
  itemId: string,
  params: { title?: string; content?: string; folder?: string }
): Promise<LibraryItemDetail> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save changes"));
  return res.json();
}

export async function addLink(projectId: string, url: string, folder?: string): Promise<ContextItem> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, folder: folder || null }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not add that link"));
  return res.json();
}

export async function getVersion(
  projectId: string,
  itemId: string,
  versionId: string
): Promise<{ id: string; title: string; content: string; source: string; created_at: string }> {
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/${encodeURIComponent(itemId)}/versions/${versionId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res, "Could not load that version"));
  return res.json();
}

export async function restoreVersion(projectId: string, itemId: string, versionId: string): Promise<LibraryItemDetail> {
  const res = await fetch(
    `${BASE}/v1/projects/${projectId}/library/${encodeURIComponent(itemId)}/versions/${versionId}/restore`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(await readError(res, "Could not restore that version"));
  return res.json();
}

// --- credits ------------------------------------------------------------------

export async function getCredits(): Promise<CreditSummary> {
  const res = await fetch(`${BASE}/v1/credits`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Could not load credits"));
  return res.json();
}

export async function setCredit(provider: string, balanceUsd: number): Promise<CreditSummary> {
  const res = await fetch(`${BASE}/v1/credits/${provider}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ balance_usd: balanceUsd }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save that amount"));
  return res.json();
}

export async function clearCredit(provider: string): Promise<CreditSummary> {
  const res = await fetch(`${BASE}/v1/credits/${provider}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Could not stop tracking"));
  return res.json();
}

/** PDF, Word, PowerPoint and Excel files: the server extracts the text. */
export async function uploadDocument(projectId: string, file: File, folder?: string): Promise<ContextItem> {
  const qs = new URLSearchParams({ filename: file.name });
  if (folder) qs.set("folder", folder);
  const res = await fetch(`${BASE}/v1/projects/${projectId}/library/upload?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(await readError(res, `Could not read ${file.name}`));
  return res.json();
}

export function originalFileUrl(projectId: string, itemId: string): string {
  return `${BASE}/v1/projects/${projectId}/library/${encodeURIComponent(itemId)}/file`;
}
