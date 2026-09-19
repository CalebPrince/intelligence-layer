"""Pydantic request/response models shared between router, api, and database layers."""
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel

from app.config import Capability, RoutingMode

ResponsePhase = Literal["initial", "critique", "synthesis"]
ContextType = Literal["document", "note", "url", "file"]


class RoutingCriteria(BaseModel):
    """What the caller needs — router.py scores the registry against this.
    Capabilities are the primary interface: callers ask for `reasoning`,
    `coding`, `cheap`, etc., never a provider or model name."""

    task_type: str = "general"  # free-text label, used for affinity lookups and logging
    required_capabilities: list[Capability] = []
    max_cost_per_1k_output: Optional[float] = None
    min_context_window: Optional[int] = None
    prefer_speed: bool = False
    mode: RoutingMode = RoutingMode.SINGLE
    max_parallel: int = 3  # cap for PARALLEL / DELIBERATION fan-out
    explicit_models: Optional[list[str]] = None  # override candidate selection entirely
    synthesizer_model: Optional[str] = None  # DELIBERATION only; defaults to the top-ranked candidate
    use_project_affinity: bool = True  # nudge scoring using this project's past accepted decisions


class ChatMessage(BaseModel):
    role: str  # system | user | assistant
    content: str


class ChatRequest(BaseModel):
    project_id: str
    conversation_id: Optional[str] = None
    messages: list[ChatMessage]
    criteria: RoutingCriteria = RoutingCriteria()
    include_project_context: bool = True
    enable_tools: bool = True
    max_tool_rounds: int = 4


class ModelResponse(BaseModel):
    id: Optional[str] = None  # set once persisted (model_responses.id) — needed to record a decision
    model_id: str
    provider: str
    display_name: str
    phase: ResponsePhase = "initial"
    content: Optional[str] = None
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    success: bool = True
    error: Optional[str] = None
    tool_calls: list[dict[str, Any]] = []


class ProjectInstructionsUpdate(BaseModel):
    content: str
    is_active: bool = True


class ProjectInstructions(BaseModel):
    project_id: str
    content: str
    version: int = 1
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class WorkspaceInstructionsUpdate(BaseModel):
    content: str
    is_active: bool = True


class WorkspaceInstructions(BaseModel):
    owner_id: str
    content: str
    version: int = 1
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class ProjectSkillCreate(BaseModel):
    name: str
    description: str
    instructions: str
    tool_names: list[str] = []
    is_enabled: bool = True


class ProjectSkill(ProjectSkillCreate):
    id: str
    project_id: str
    created_at: datetime
    updated_at: datetime


class McpConnectionCreate(BaseModel):
    name: str
    url: str
    headers: dict[str, str] = {}
    allowed_tools: list[str] = []
    is_enabled: bool = True


class McpConnection(BaseModel):
    id: str
    project_id: str
    name: str
    url: str
    header_names: list[str] = []
    allowed_tools: list[str] = []
    is_enabled: bool = True
    created_at: datetime
    updated_at: datetime


class ContextUsed(BaseModel):
    """A project context item that was actually sent to the models."""
    id: str
    title: str
    type: str
    chars: int  # characters of this item actually sent
    truncated: bool = False  # True when only some sections of a longer item were sent
    parts: int = 1  # sections sent
    total_parts: int = 1  # sections the item has
    total_chars: int = 0  # size of the whole item
    sections: list[str] = []  # headings / pages that were sent


class ContextStats(BaseModel):
    sent_chars: int
    full_chars: int
    sent_tokens: int  # estimates (about 4 characters per token)
    full_tokens: int
    saved_tokens: int
    items_total: int
    items_used: int


class ContextPreview(BaseModel):
    items: list[ContextUsed]
    stats: ContextStats


class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    mode: RoutingMode
    responses: list[ModelResponse]  # initial responses, plus critique-phase ones in DELIBERATION
    chosen_model_id: Optional[str] = None  # set for SINGLE when it succeeds
    synthesis: Optional[ModelResponse] = None  # DELIBERATION only
    context_used: list[ContextUsed] = []  # which project context items were sent with this request
    context_stats: Optional[ContextStats] = None


class DecisionRequest(BaseModel):
    project_id: str
    message_id: str
    chosen_response_id: str
    task_type: str = "general"
    mode: RoutingMode = RoutingMode.SINGLE
    rationale: Optional[str] = None


ProjectStatus = Literal["active", "planning", "research"]
GitHubActionMode = Literal["auto", "manual", "reject"]


class ProjectCreate(BaseModel):
    owner_id: str
    name: str
    description: Optional[str] = None
    status: ProjectStatus = "active"
    category: Optional[str] = None
    tags: list[str] = []
    github_action_mode: GitHubActionMode = "manual"


class Project(BaseModel):
    id: str
    owner_id: str
    name: str
    description: Optional[str] = None
    archived: bool = False
    status: ProjectStatus = "active"
    category: Optional[str] = None
    tags: list[str] = []
    source_path: Optional[str] = None
    image_url: Optional[str] = None
    auto_sync: bool = True
    created_at: datetime
    updated_at: datetime
    github_action_mode: GitHubActionMode = "manual"


class ProjectUpdate(BaseModel):
    archived: Optional[bool] = None
    status: Optional[ProjectStatus] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None
    image_url: Optional[str] = None
    auto_sync: Optional[bool] = None
    github_action_mode: Optional[GitHubActionMode] = None


class GitHubFileChange(BaseModel):
    path: str
    content: str


class GitHubActionProposalCreate(BaseModel):
    message: str = "Update files from Inteli-Space"
    files: list[GitHubFileChange]
    mode: Optional[GitHubActionMode] = None


class GitHubActionProposal(BaseModel):
    id: str
    project_id: str
    mode: GitHubActionMode
    status: Literal["pending", "rejected", "executed", "failed"]
    message: str
    files: list[GitHubFileChange]
    branch: Optional[str] = None
    commit_sha: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ProjectContextItem(BaseModel):
    id: str
    project_id: str
    type: ContextType
    title: str
    content: str
    metadata: dict[str, Any] = {}
    created_at: datetime


class ProjectContextCreate(BaseModel):
    type: ContextType
    title: str
    content: str
    metadata: dict[str, Any] = {}
    folder: Optional[str] = None


class ProjectStats(BaseModel):
    context_count: int
    decisions_count: int
    conversation_count: int
    message_count: int
    last_activity_at: Optional[datetime] = None


class ActivityItem(BaseModel):
    kind: Literal["context", "decision"]
    id: str
    label: str
    detail: Optional[str] = None
    ts: datetime


class UsageByModel(BaseModel):
    model_id: Optional[str] = None
    request_count: int
    cost_usd: float
    tokens_in: int
    tokens_out: int


class UsageSummary(BaseModel):
    request_count: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    by_model: list[UsageByModel]


class DecisionItem(BaseModel):
    id: str
    project_id: str
    message_id: str
    chosen_response_id: str
    task_type: str
    mode: RoutingMode
    rationale: Optional[str] = None
    decided_at: datetime
    model_id: str
    provider: str
    phase: ResponsePhase
    title: Optional[str] = None
    status: str = "in_progress"
    tags: list[str] = []


class BrowseEntry(BaseModel):
    name: str
    path: str


class BrowseResult(BaseModel):
    path: str  # "" means "the list of drives / roots"
    parent: Optional[str] = None
    entries: list[BrowseEntry]


class ImportCandidate(BaseModel):
    name: str
    path: str
    description: Optional[str] = None
    category: Optional[str] = None
    tags: list[str] = []
    file_count: int = 0
    already_imported: bool = False


class ImportRequest(BaseModel):
    owner_id: str
    paths: list[str]
    import_docs: bool = True


class ImportSkip(BaseModel):
    path: str
    reason: str


class ImportResult(BaseModel):
    created: list[Project]
    skipped: list[ImportSkip]
    context_items: int = 0


class WatchCreate(BaseModel):
    owner_id: str
    path: str
    auto_import: bool = True


class WatchUpdate(BaseModel):
    auto_import: Optional[bool] = None


class WatchExclude(BaseModel):
    path: str  # a sub-folder's path, ignored by this watch from now on


class Watch(BaseModel):
    id: str
    path: str
    auto_import: bool
    last_scan_at: Optional[datetime] = None
    created_at: datetime
    pending: list[str] = []  # new sub-folders not imported yet
    excluded: list[str] = []  # sub-folders ignored by this watch, never auto-imported
    exists: bool = True  # False if the folder (or drive) is currently unreachable


class RecentImport(BaseModel):
    at: datetime
    watch_id: str
    project_id: str
    name: str
    path: str


class ProjectRefresh(BaseModel):
    at: datetime
    project_id: str
    name: str
    changes: list[str]  # any of: description, tags, category, docs, files


class WatchStatus(BaseModel):
    watches: list[Watch]
    recent: list[RecentImport]
    updates: list[ProjectRefresh] = []
    interval_seconds: int


class WatchScanResult(BaseModel):
    imported: list[Project]
    refreshed: int = 0


class ProjectSyncResult(BaseModel):
    project: Project
    changes: list[str]


class Milestone(BaseModel):
    id: str
    project_id: str
    title: str
    target_date: Optional[date] = None
    is_done: bool = False
    created_at: datetime


class MilestoneCreate(BaseModel):
    title: str
    target_date: Optional[date] = None


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    target_date: Optional[date] = None
    is_done: Optional[bool] = None


class WorkspaceSettings(BaseModel):
    owner_id: str
    workspace_name: str
    default_view: str
    default_model: Optional[str] = None
    response_style: str
    auto_save_context: bool
    multi_model_default: bool
    auto_save_decisions: bool
    include_files_context: bool
    updated_at: datetime


class IntegrationField(BaseModel):
    key: str
    label: str
    secret: bool = True


class IntegrationCatalogEntry(BaseModel):
    key: str
    name: str
    category: str
    fields: list[IntegrationField]
    has_live_check: bool  # False means the credential is stored but never tested (needs an OAuth app)


class IntegrationCredentialCreate(BaseModel):
    credential: dict[str, str]


class IntegrationCredential(BaseModel):
    service: str
    status: Literal["connected", "invalid", "unknown"]
    status_detail: Optional[str] = None
    last_checked_at: Optional[datetime] = None
    updated_at: datetime
    # which fields are filled in, not the raw secret values
    fields_set: list[str] = []


class GitHubRepository(BaseModel):
    id: int
    full_name: str
    name: str
    owner: str
    private: bool
    description: Optional[str] = None
    default_branch: str
    html_url: str
    updated_at: Optional[str] = None


class GitHubImportResult(BaseModel):
    project: Project
    context_items: int
    already_imported: bool = False


class WorkspaceSettingsUpdate(BaseModel):
    workspace_name: Optional[str] = None
    default_view: Optional[str] = None
    default_model: Optional[str] = None
    response_style: Optional[str] = None
    auto_save_context: Optional[bool] = None
    multi_model_default: Optional[bool] = None
    auto_save_decisions: Optional[bool] = None
    include_files_context: Optional[bool] = None


class DashboardTotals(BaseModel):
    projects: int
    projects_this_month: int
    files: int
    files_this_week: int
    decisions: int
    decisions_this_month: int


class DashboardDay(BaseModel):
    date: str
    chats: int
    files: int
    decisions: int


class DashboardUsage(BaseModel):
    total_requests: int
    by_provider: dict[str, int]


class DashboardEvent(BaseModel):
    kind: Literal["file", "context_synced", "decision", "project"]
    id: str
    label: str
    project_name: str
    project_id: str
    ts: datetime
    count: int = 1  # how many similar events happened in the same minute


class DashboardSummary(BaseModel):
    totals: DashboardTotals
    activity: list[DashboardDay]
    usage: DashboardUsage
    recent: list[DashboardEvent]
    days: int


class UsageDay(BaseModel):
    date: str
    openai: int = 0
    anthropic: int = 0
    gemini: int = 0
    other: int = 0


class CostDay(BaseModel):
    date: str
    cost_usd: float


class TopProject(BaseModel):
    project_id: str
    name: str
    requests: int


class AnalyticsSummary(BaseModel):
    """Real usage numbers for the Analytics page (see app/api/analytics.py);
    fields not derivable from usage_logs yet (agent tasks, "time saved") stay
    illustrative on the frontend until that tracking exists."""

    total_requests: int
    requests_prev_period: int
    active_projects: int
    decisions_period: int
    decisions_prev_period: int
    usage_by_day: list[UsageDay]
    cost_by_day: list[CostDay]
    total_cost_usd: float
    top_projects: list[TopProject]
    heatmap: list[list[int]]  # 7 rows (Mon..Sun) x 24 hourly columns
    storage_bytes: int
    days: int


class HistoryTurn(BaseModel):
    message_id: str
    prompt: str
    sent_at: datetime
    mode: RoutingMode
    responses: list[ModelResponse]
    synthesis: Optional[ModelResponse] = None
    chosen_response_id: Optional[str] = None
    context_used: list[ContextUsed] = []


class ChatHistory(BaseModel):
    conversation_id: Optional[str] = None
    turns: list[HistoryTurn] = []


class SageChatRequest(BaseModel):
    project_id: str
    conversation_id: Optional[str] = None
    message: str


class SageChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    response_id: str  # the model_responses row id — pass to POST /v1/decisions to "Accept as decision"
    reply: str


class AgentChatRequest(BaseModel):
    project_id: str
    owner_id: str = "00000000-0000-0000-0000-000000000000"
    agent_key: str
    message: str
    transcript: list[dict[str, str]] = []
    conversation_id: Optional[str] = None
    memory_key: Optional[str] = None


class AgentChatResponse(BaseModel):
    agent_key: str
    conversation_id: str
    message_id: str
    response_id: str
    reply: str
    drafted: Optional[dict[str, Any]] = None


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    turn_count: int
    last_prompt: Optional[str] = None
    last_at: Optional[datetime] = None
    agent_key: Optional[str] = None  # e.g. "sage" — a real external-agent conversation, not multi-model chat


DecisionStatus = Literal["implemented", "in_progress", "under_review", "archived"]


class DecisionCard(BaseModel):
    id: str
    project_id: str
    project_name: str
    title: str
    snippet: str
    status: DecisionStatus
    tags: list[str] = []
    task_type: str
    mode: RoutingMode
    provider: str
    model_id: str
    decided_at: datetime
    implemented_at: Optional[datetime] = None


class DecisionStats(BaseModel):
    total: int
    implemented: int
    in_progress: int
    under_review: int
    archived: int
    total_this_month: int
    implemented_this_month: int
    in_progress_this_month: int
    under_review_this_month: int


class DecisionList(BaseModel):
    items: list[DecisionCard]
    stats: DecisionStats


class Perspective(BaseModel):
    id: str
    provider: str
    model_id: str
    display_name: str
    content: Optional[str] = None
    success: bool = True


class LinkedContextItem(BaseModel):
    id: str
    title: str
    type: str


class DecisionDetail(DecisionCard):
    decision_text: str
    context: str  # what was asked
    perspectives: list[Perspective] = []
    related_files: int = 0
    related_decisions: int = 0
    decided_by: str = "Caleb Akakpo"
    outcome_note: Optional[str] = None
    linked_context: list[LinkedContextItem] = []  # the specific context items behind this decision


class DecisionUpdate(BaseModel):
    status: Optional[DecisionStatus] = None
    title: Optional[str] = None
    tags: Optional[list[str]] = None
    outcome_note: Optional[str] = None
    implemented_at: Optional[datetime] = None  # set by hand; omit to leave as-is, null clears it
    context_item_ids: Optional[list[str]] = None  # replaces the full linked-context set


class LibraryItem(BaseModel):
    id: str
    title: str
    type: str
    kind: str  # file | note | link | code | image | conversation
    folder: str
    created_at: datetime
    updated_at: datetime
    size: int
    snippet: str
    source: str  # import | app | link | chat
    edited: bool = False
    url: Optional[str] = None
    original_name: Optional[str] = None  # set when the text was extracted from an uploaded document
    has_file: bool = False
    pages: Optional[int] = None


class LibraryStats(BaseModel):
    files: int
    links: int
    notes: int
    messages: int


class Library(BaseModel):
    items: list[LibraryItem]
    stats: LibraryStats


class ItemSummary(BaseModel):
    overview: str
    outline: list[str]
    words: int
    minutes: int
    tasks_done: int
    tasks_total: int


class RelatedItem(BaseModel):
    id: str
    title: str
    folder: str


class UsedInMessage(BaseModel):
    prompt: str
    at: datetime


class UsedIn(BaseModel):
    count: int
    recent: list[UsedInMessage]


class VersionInfo(BaseModel):
    id: str
    title: str
    source: str
    created_at: datetime
    chars: int


class LibraryItemDetail(LibraryItem):
    content: str
    summary: ItemSummary
    related: list[RelatedItem]
    used_in: UsedIn
    versions: list[VersionInfo]


class LibraryItemUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    folder: Optional[str] = None


class LinkCreate(BaseModel):
    url: str
    folder: Optional[str] = None


class FolderCreate(BaseModel):
    name: str


class FolderRename(BaseModel):
    name: str  # the new name
