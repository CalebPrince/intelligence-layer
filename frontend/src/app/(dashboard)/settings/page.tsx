"use client";

import {
  Bell,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Database,
  Download,
  Folder,
  FileText,
  Palette,
  Plug,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PageHero } from "@/components/dashboard/PageHero";
import { createMcpConnection, deleteMcpConnection, getAnalytics, getSettings, getWorkspaceInstructions, listMcpConnections, listProjects, saveWorkspaceInstructions, updateSettings } from "@/lib/api";
import type { McpConnection, Project } from "@/types";

const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";
const STORAGE_CAP_GB = 10; // no real quota system exists yet — this ceiling is illustrative

const TABS = [
  { key: "general", label: "General", icon: SettingsIcon },
  { key: "account", label: "Account", icon: CircleUserRound },
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "models", label: "Models", icon: Database },
  { key: "instructions", label: "Global Instructions", icon: FileText },
  { key: "mcp", label: "MCP Connections", icon: Plug },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "security", label: "Security", icon: Shield },
  { key: "team", label: "Team", icon: Users },
  { key: "billing", label: "Billing", icon: CreditCard },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-ink/15"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function ToggleRow({ title, body, on, onChange }: { title: string; body: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink/55">{body}</p>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-ink/75">{label}</label>
      <div className="mt-1.5">{children}</div>
      <p className="mt-1.5 text-xs text-ink/45">{hint}</p>
    </div>
  );
}

const SELECT_CLS = "h-10 w-full rounded-lg border border-ink/12 bg-white px-3 text-sm outline-none focus:border-blue-400";
const INPUT_CLS = "h-10 w-full rounded-lg border border-ink/12 bg-white px-3 text-sm outline-none focus:border-blue-400";

const PROFILE_ROWS = [
  { label: "Full Name", value: "Caleb Akakpo" },
  { label: "Email Address", value: "caleb@princecaleb.dev" },
  { label: "Timezone", value: "(GMT+0) Accra" },
  { label: "Language", value: "English" },
];

const QUICK_ACTIONS = [
  { icon: Download, title: "Export all data", body: "Download your projects, context and decisions" },
  { icon: Upload, title: "Import data", body: "Import projects or context from another source" },
  { icon: Trash2, title: "Clear cache", body: "Remove temporary data (does not delete projects)" },
  { icon: RotateCcw, title: "Reset workspace", body: "Reset settings to default (projects will not be deleted)" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("general");
  const [workspaceName, setWorkspaceName] = useState("PrinceCaleb.dev");
  const [autoSave, setAutoSave] = useState(true);
  const [multiModel, setMultiModel] = useState(true);
  const [autoDecisions, setAutoDecisions] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [storageBytes, setStorageBytes] = useState(0);
  const [defaultView, setDefaultView] = useState("dashboard");
  const [defaultModel, setDefaultModel] = useState("");
  const [responseStyle, setResponseStyle] = useState("balanced");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mcpProjectId, setMcpProjectId] = useState("");
  const [mcpConnections, setMcpConnections] = useState<McpConnection[]>([]);
  const [mcpForm, setMcpForm] = useState({ name: "", url: "", headers: "", tools: "" });
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpMessage, setMcpMessage] = useState<string | null>(null);
  const [instructionContent, setInstructionContent] = useState("");
  const [instructionActive, setInstructionActive] = useState(true);
  const [instructionVersion, setInstructionVersion] = useState(0);
  const [instructionUpdatedAt, setInstructionUpdatedAt] = useState<string | null>(null);
  const [instructionBusy, setInstructionBusy] = useState(false);
  const [instructionMessage, setInstructionMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAnalytics(DEMO_OWNER_ID, 30), getSettings(DEMO_OWNER_ID), listProjects(DEMO_OWNER_ID), getWorkspaceInstructions(DEMO_OWNER_ID)])
      .then(([analytics, settings, projectRows, globalInstructions]) => {
        setStorageBytes(analytics.storage_bytes);
        setWorkspaceName(settings.workspace_name);
        setDefaultView(settings.default_view);
        setDefaultModel(settings.default_model ?? "");
        setResponseStyle(settings.response_style);
        setAutoSave(settings.auto_save_context);
        setMultiModel(settings.multi_model_default);
        setAutoDecisions(settings.auto_save_decisions);
        setIncludeFiles(settings.include_files_context);
        setProjects(projectRows);
        setMcpProjectId(projectRows[0]?.id ?? "");
        setInstructionContent(globalInstructions.content);
        setInstructionActive(globalInstructions.is_active);
        setInstructionVersion(globalInstructions.version);
        setInstructionUpdatedAt(globalInstructions.updated_at);
      })
      .catch(() => setStorageBytes(0))
      .finally(() => setSettingsLoading(false));
  }, []);

  useEffect(() => {
    if (!mcpProjectId) { setMcpConnections([]); return; }
    listMcpConnections(mcpProjectId).then(setMcpConnections).catch((error) => setMcpMessage(error instanceof Error ? error.message : "Could not load MCP connections"));
  }, [mcpProjectId]);

  async function saveInstructions() {
    setInstructionBusy(true); setInstructionMessage(null);
    try {
      const saved = await saveWorkspaceInstructions(DEMO_OWNER_ID, instructionContent, instructionActive);
      setInstructionVersion(saved.version); setInstructionUpdatedAt(saved.updated_at); setInstructionMessage("Global instructions saved");
    } catch (error) { setInstructionMessage(error instanceof Error ? error.message : "Could not save global instructions"); }
    finally { setInstructionBusy(false); }
  }

  async function addMcpConnection() {
    if (!mcpProjectId || !mcpForm.name.trim() || !mcpForm.url.trim()) return;
    setMcpBusy(true); setMcpMessage(null);
    try {
      const headers = mcpForm.headers.trim() ? JSON.parse(mcpForm.headers) : {};
      await createMcpConnection(mcpProjectId, {
        name: mcpForm.name.trim(), url: mcpForm.url.trim(), headers,
        allowed_tools: mcpForm.tools.split(",").map((value) => value.trim()).filter(Boolean), is_enabled: true,
      });
      setMcpForm({ name: "", url: "", headers: "", tools: "" });
      setMcpConnections(await listMcpConnections(mcpProjectId));
      setMcpMessage("MCP connection added");
    } catch (error) { setMcpMessage(error instanceof Error ? error.message : "Could not add MCP connection"); }
    finally { setMcpBusy(false); }
  }

  async function removeMcpConnection(connectionId: string) {
    if (!mcpProjectId) return;
    setMcpBusy(true); setMcpMessage(null);
    try {
      await deleteMcpConnection(mcpProjectId, connectionId);
      setMcpConnections((rows) => rows.filter((row) => row.id !== connectionId));
      setMcpMessage("MCP connection removed");
    } catch (error) { setMcpMessage(error instanceof Error ? error.message : "Could not remove MCP connection"); }
    finally { setMcpBusy(false); }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsMessage(null);
    try {
      await updateSettings(DEMO_OWNER_ID, {
        workspace_name: workspaceName.trim() || "My Workspace",
        default_view: defaultView,
        default_model: defaultModel || null,
        response_style: responseStyle,
        auto_save_context: autoSave,
        multi_model_default: multiModel,
        auto_save_decisions: autoDecisions,
        include_files_context: includeFiles,
      });
      setSettingsMessage("Settings saved");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSettingsSaving(false);
    }
  }

  const usingRealStorage = storageBytes > 0;
  const storageDisplayGb = usingRealStorage ? storageBytes / 1024 ** 3 : 2.4;
  const storagePct = Math.min(100, (storageDisplayGb / STORAGE_CAP_GB) * 100);
  const storageLabel = usingRealStorage
    ? storageBytes < 1024 ** 2
      ? `${(storageBytes / 1024).toFixed(1)} KB`
      : storageBytes < 1024 ** 3
        ? `${(storageBytes / 1024 ** 2).toFixed(1)} MB`
        : `${storageDisplayGb.toFixed(1)} GB`
    : `${storageDisplayGb.toFixed(1)} GB`;

  return (
    <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5">
      <div className="mx-auto max-w-[1300px] space-y-4">
        <PageHero
          eyebrow="Settings"
          title="Settings"
          description="Customize your workspace, manage your account and configure how Inteli-Space works for you."
          icon={<SettingsIcon className="h-7 w-7" strokeWidth={1.75} />}
          bannerTitle={
            <>
              Your workspace.
              <br />
              Your rules.
            </>
          }
          bannerBody="Configure, customize and optimize your AI workflow."
        />

        <div className={`${CARD} flex flex-wrap gap-1 p-1.5`}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                tab === key ? "bg-blue-600 text-white" : "text-ink/60 hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>

        {tab === "instructions" ? (
          <section className={`${CARD} p-6`}>
            <div><p className="font-display text-lg font-bold">Global Workspace Instructions</p><p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/55">These durable instructions apply to every project, model, and connected agent in this workspace. Project-specific instructions can add narrower rules from each project’s Instructions & Tools page.</p></div>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] px-4 py-3.5">
              <div><p className="text-sm font-semibold">Use global instructions</p><p className="mt-0.5 text-[13px] text-ink/50">Turn this off across the workspace without deleting the instruction document.</p></div>
              <Toggle on={instructionActive} onChange={setInstructionActive}/>
            </div>
            <div className="mt-5">
              <div className="flex items-end justify-between gap-4"><div><label className="text-[13px] font-medium text-ink/75">Instruction document</label><p className="mt-0.5 text-xs text-ink/45">Markdown is supported. Include goals, constraints, terminology, response rules, and approval requirements.</p></div><p className="shrink-0 text-xs text-ink/40">Version {instructionVersion}{instructionUpdatedAt ? ` · ${new Date(instructionUpdatedAt).toLocaleString()}` : ""}</p></div>
              <textarea value={instructionContent} onChange={(event) => setInstructionContent(event.target.value)} rows={18} placeholder="# Workspace principles\n\n# Response rules\n- Ground answers in available project context.\n\n# Security rules\n- Ask before external writes." className="mt-3 w-full resize-y rounded-xl border border-ink/12 bg-white p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-blue-400"/>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink/45">{instructionContent.length.toLocaleString()} characters · approximately {Math.ceil(instructionContent.length / 4).toLocaleString()} tokens</p><div className="flex items-center gap-3">{instructionMessage && <p className={`text-xs ${instructionMessage === "Global instructions saved" ? "text-emerald-600" : "text-rose-600"}`}>{instructionMessage}</p>}<button type="button" onClick={saveInstructions} disabled={instructionBusy} className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{instructionBusy ? "Saving..." : "Save global instructions"}</button></div></div>
            </div>
          </section>
        ) : tab === "mcp" ? (
          <section className={`${CARD} p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="font-display text-lg font-bold">MCP Connections</p><p className="mt-1 text-[13px] text-ink/55">Connect Streamable HTTP MCP servers to a project. Models can discover and call the allowed tools.</p></div>
              <select value={mcpProjectId} onChange={(event) => setMcpProjectId(event.target.value)} className="h-10 min-w-64 rounded-lg border border-ink/12 bg-white px-3 text-sm outline-none focus:border-blue-400">
                {projects.length === 0 && <option value="">No projects available</option>}
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <div className="mt-5 grid gap-4 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] p-4 sm:grid-cols-2">
              <Field label="Connection name" hint="Used to namespace tools exposed to models."><input value={mcpForm.name} onChange={(event) => setMcpForm({...mcpForm, name:event.target.value})} placeholder="Company tools" className={INPUT_CLS}/></Field>
              <Field label="Server URL" hint="HTTPS is required, except for localhost development."><input value={mcpForm.url} onChange={(event) => setMcpForm({...mcpForm, url:event.target.value})} placeholder="https://example.com/mcp" className={INPUT_CLS}/></Field>
              <Field label="Authentication headers" hint="JSON object. Values stay server-side and are never returned."><input type="password" value={mcpForm.headers} onChange={(event) => setMcpForm({...mcpForm, headers:event.target.value})} placeholder={'{"Authorization":"Bearer ..."}'} className={INPUT_CLS}/></Field>
              <Field label="Allowed tools" hint="Comma-separated. Leave blank to expose every tool from this server."><input value={mcpForm.tools} onChange={(event) => setMcpForm({...mcpForm, tools:event.target.value})} placeholder="search, create_ticket" className={INPUT_CLS}/></Field>
              <div className="flex items-center gap-3 sm:col-span-2"><button type="button" onClick={addMcpConnection} disabled={mcpBusy || !mcpProjectId || !mcpForm.name.trim() || !mcpForm.url.trim()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Plus className="h-4 w-4"/>{mcpBusy ? "Saving..." : "Add connection"}</button>{mcpMessage && <p className="text-xs text-ink/55">{mcpMessage}</p>}</div>
            </div>
            <div className="mt-5 space-y-3">
              {mcpProjectId && mcpConnections.length === 0 && <div className="rounded-xl border border-dashed border-ink/15 px-5 py-8 text-center text-sm text-ink/45">No MCP connections for this project yet.</div>}
              {mcpConnections.map((connection) => <div key={connection.id} className="flex items-start justify-between gap-4 rounded-xl border border-ink/[0.07] px-4 py-3.5"><div className="flex min-w-0 gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Plug className="h-5 w-5"/></span><div className="min-w-0"><p className="text-sm font-semibold">{connection.name}</p><p className="truncate text-[13px] text-ink/55">{connection.url}</p><p className="mt-1 text-xs text-ink/40">Headers: {connection.header_names.join(", ") || "none"} · Tools: {connection.allowed_tools.join(", ") || "all discovered tools"}</p></div></div><button type="button" onClick={() => removeMcpConnection(connection.id)} disabled={mcpBusy} aria-label={`Remove ${connection.name}`} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4"/></button></div>)}
            </div>
          </section>
        ) : tab !== "general" ? (
          <div className={`${CARD} flex flex-col items-center px-6 py-16 text-center`}>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              {(() => {
                const Icon = TABS.find((t) => t.key === tab)!.icon;
                return <Icon className="h-6 w-6" strokeWidth={1.75} />;
              })()}
            </span>
            <p className="mt-4 font-display text-xl font-bold">{TABS.find((t) => t.key === tab)?.label} settings</p>
            <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-ink/55">This section is coming soon.</p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <div className={`${CARD} p-5`}>
                <p className="font-display text-lg font-bold">Workspace Settings</p>
                <p className="text-[13px] text-ink/55">Configure your workspace preferences and defaults.</p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Workspace Name" hint="This name appears across your workspace.">
                    <input disabled={settingsLoading} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className={INPUT_CLS} />
                  </Field>
                  <Field label="Default Project View" hint="Choose the page you see after login.">
                    <select disabled={settingsLoading} value={defaultView} onChange={(e) => setDefaultView(e.target.value)} className={SELECT_CLS}>
                      <option value="dashboard">Main Dashboard</option>
                      <option value="overview">Overview</option>
                      <option value="chat">Chat</option>
                    </select>
                  </Field>
                  <Field label="Default Model" hint="The default model for new chats.">
                    <select disabled={settingsLoading} value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} className={SELECT_CLS}>
                      <option value="">System default</option>
                      <option value="openai/gpt-4o">ChatGPT</option>
                      <option value="anthropic/claude-sonnet">Claude</option>
                      <option value="google/gemini">Gemini</option>
                    </select>
                  </Field>
                  <Field label="Default Response Style" hint="Controls the tone and detail of responses.">
                    <select disabled={settingsLoading} value={responseStyle} onChange={(e) => setResponseStyle(e.target.value)} className={SELECT_CLS}>
                      <option value="balanced">Balanced</option>
                      <option value="concise">Concise</option>
                      <option value="detailed">Detailed</option>
                    </select>
                  </Field>
                </div>
              </div>

              <div className={`${CARD} p-5`}>
                <p className="font-display text-lg font-bold">Project Defaults</p>
                <p className="text-[13px] text-ink/55">Set default settings for new projects.</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ToggleRow title="Auto-save context" body="Automatically save important information from conversations." on={autoSave} onChange={setAutoSave} />
                  <ToggleRow title="Enable multi-model perspective" body="Get multiple model responses by default on new projects." on={multiModel} onChange={setMultiModel} />
                  <ToggleRow title="Save decisions automatically" body="Extract and save decisions from chats." on={autoDecisions} onChange={setAutoDecisions} />
                  <ToggleRow title="Include files in context" body="Index uploaded files for better responses." on={includeFiles} onChange={setIncludeFiles} />
                </div>
                <div className="mt-4 flex items-center justify-end gap-3 border-t border-ink/[0.06] pt-4">
                  {settingsMessage && <p className={`text-xs ${settingsMessage === "Settings saved" ? "text-emerald-600" : "text-rose-600"}`}>{settingsMessage}</p>}
                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={settingsLoading || settingsSaving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {settingsSaving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>

              <div className={`${CARD} p-5`}>
                <p className="font-display text-lg font-bold">Data & Storage</p>
                <p className="text-[13px] text-ink/55">Manage your stored data, files and usage.</p>
                <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Database className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-[220px] flex-1">
                    <p className="text-sm font-semibold">Storage Used</p>
                    <p className="text-[13px] text-ink/55">
                      {storageLabel} of {STORAGE_CAP_GB} GB
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/[0.08]">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${storagePct}%` }} />
                    </div>
                  </div>
                  <button className="flex items-center gap-1.5 rounded-lg border border-ink/12 px-3.5 py-2 text-[13px] font-medium hover:border-ink/30">
                    <Folder className="h-3.5 w-3.5" strokeWidth={2} /> Manage Files
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-[15px] font-bold">Your Profile</p>
                  <button className="rounded-lg border border-ink/12 px-3 py-1.5 text-[13px] font-medium hover:border-ink/30">Update Profile</button>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-400 text-base font-bold text-ink">
                    CA
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">Caleb Akakpo</p>
                    <p className="truncate text-[13px] text-ink/55">caleb@princecaleb.dev</p>
                    <p className="text-xs text-ink/45">Owner</p>
                  </div>
                </div>
                <ul className="mt-4 divide-y divide-ink/[0.06]">
                  {PROFILE_ROWS.map((r) => (
                    <li key={r.label} className="flex items-center justify-between py-2.5 text-[13px]">
                      <span className="text-ink/55">{r.label}</span>
                      <span className="flex items-center gap-1.5 font-medium">
                        {r.value}
                        <ChevronRight className="h-3.5 w-3.5 text-ink/35" strokeWidth={2} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`${CARD} p-5`}>
                <p className="font-display text-[15px] font-bold">Quick Actions</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  {QUICK_ACTIONS.map(({ icon: Icon, title, body }) => (
                    <button key={title} className="flex items-center gap-3.5 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] px-4 py-3 text-left transition hover:border-ink/20">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{title}</span>
                        <span className="block text-xs leading-snug text-ink/50">{body}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                <p className="font-display text-[15px] font-bold text-red-700">Danger Zone</p>
                <p className="mt-1.5 text-[13px] leading-snug text-red-700/80">Permanently delete your account and all data. This action cannot be undone.</p>
                <button className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700">Delete Account</button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
