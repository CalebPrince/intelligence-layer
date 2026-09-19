"use client";

import { ArrowRight, CheckCircle2, FileText, Loader2, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addContext,
  deleteContext,
  getContextUsed,
  getProjectStats,
  listActivity,
  listContext,
  listDecisions,
  syncProject,
} from "@/lib/api";
import { SAMPLE_INTEGRATIONS, SAMPLE_TEAM } from "@/lib/sampleWorkspace";
import type { ActivityItem, ContextItem, ContextStats, ContextType, ContextUsed, DecisionItem, Project, ProjectStats } from "@/types";

const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";
const TYPES: ContextType[] = ["note", "document", "url", "file"];
const SHOWN = 5;

type Tab = "active" | "relevant" | "activity";

const STATUS_LABEL: Record<string, string> = {
  implemented: "Implemented",
  in_progress: "In Progress",
  under_review: "Under Review",
  archived: "Archived",
};

/** One short line describing a context item, taken from its own content. */
function blurb(item: ContextItem): string {
  if (item.title.toLowerCase().endsWith(".json")) return "Project metadata";
  const line = item.content
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s`]+/, "").trim())
    .find((l) => l.length > 3 && !l.startsWith("{") && !l.startsWith("<"));
  return (line ?? item.type).slice(0, 60);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ChatContextPanel({
  projectId,
  project,
  lastPrompt,
  usedFromResponse,
  statsFromResponse,
  addOpen,
  onCloseAdd,
  refreshKey,
  dialogOnly = false,
}: {
  projectId: string;
  project: Project | null;
  lastPrompt: string;
  usedFromResponse?: ContextUsed[];
  statsFromResponse?: ContextStats;
  addOpen: boolean;
  onCloseAdd: () => void;
  refreshKey: number;
  /** render just the add-context dialog (small screens hide the side panel) */
  dialogOnly?: boolean;
}) {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [usedPreview, setUsedPreview] = useState<ContextUsed[]>([]);
  const [usedPreviewStats, setUsedPreviewStats] = useState<ContextStats | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [showAll, setShowAll] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // add-context dialog
  const [type, setType] = useState<ContextType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      listContext(projectId),
      getProjectStats(projectId),
      listDecisions(projectId),
      listActivity(projectId),
      getContextUsed(projectId, lastPrompt),
    ])
      .then(([c, s, d, a, u]) => {
        setItems(c);
        setStats(s);
        setDecisions(d);
        setActivity(a);
        setUsedPreview(u.items);
        setUsedPreviewStats(u.stats);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load project context"));
  }, [projectId, lastPrompt]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  async function handleSync() {
    setSyncing(true);
    setSyncNote(null);
    try {
      if (project?.source_path) {
        const { changes } = await syncProject(projectId);
        setSyncNote(changes.length > 0 ? `Updated: ${changes.join(", ")}` : "Already up to date");
      } else {
        setSyncNote("Refreshed");
      }
      load();
    } catch (e) {
      setSyncNote(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncNote(null), 3500);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await addContext({ projectId, type, title, content });
      setTitle("");
      setContent("");
      onCloseAdd();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add context");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setItems((cur) => cur.filter((i) => i.id !== id)); // optimistic
    try {
      await deleteContext(projectId, id);
      load();
    } catch {
      load();
    }
  }

  const relevant = useMemo(() => {
    const words = [...new Set(lastPrompt.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])];
    if (words.length === 0) return [];
    return items
      .map((i) => {
        const hay = `${i.title} ${i.content}`.toLowerCase();
        return { item: i, score: words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);
  }, [items, lastPrompt]);

  const list = tab === "relevant" ? relevant : items;
  const visible = showAll ? list : list.slice(0, SHOWN);
  const total = stats?.context_count ?? items.length;

  const used = usedFromResponse && usedFromResponse.length > 0 ? usedFromResponse : usedPreview;
  const usedShown = showAllSources ? used : used.slice(0, 4);
  const usedStats = statsFromResponse ?? usedPreviewStats;
  const decisionNumber = (i: number) => `#${String(decisions.length - i).padStart(3, "0")}`;

  const dialog = (
    <>
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={onCloseAdd} role="dialog" aria-modal="true">
          <form
            onSubmit={handleAdd}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Add context</h2>
              <button type="button" onClick={onCloseAdd} aria-label="Close" className="rounded-full p-1.5 text-ink/45 hover:bg-ink/5">
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <p className="mt-1 text-[13px] text-ink/55">Everything you add here is sent to every model with your questions.</p>
            <div className="mt-4 flex gap-2">
              <select value={type} onChange={(e) => setType(e.target.value as ContextType)} className="rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm">
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What should every model know?"
              rows={6}
              className="mt-2 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onCloseAdd} className="rounded-lg px-4 py-2 text-sm font-medium text-ink/55 hover:text-ink">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !title.trim() || !content.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );

  if (dialogOnly) return dialog;

  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[#F5F7FB] p-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <FileText className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-bold leading-tight tracking-tight">Project Context</p>
            <p className="text-[11.5px] leading-snug text-ink/50">Everything the AI can see for this project</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink/12 px-2.5 py-1.5 text-[13px] font-medium text-ink/80 transition hover:border-ink/30 disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}
            Sync now
          </button>
        </div>
        {syncNote && <p className="mt-2 text-xs text-emerald-700">{syncNote}</p>}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        {/* stats */}
        <div className="mt-4 grid grid-cols-4 divide-x divide-ink/[0.07] rounded-xl border border-ink/[0.07] bg-[#FAFBFD]">
          {[
            [stats?.context_count ?? "–", "Files"],
            [stats?.decisions_count ?? "–", "Decisions"],
            [SAMPLE_TEAM.total, "Team members"],
            [SAMPLE_INTEGRATIONS.length - 1, "Integrations"],
          ].map(([value, label]) => (
            <div key={label as string} className="min-w-0 px-0.5 py-3 text-center">
              <p className="font-display text-xl font-bold leading-none">{value}</p>
              <p className="mt-1 whitespace-nowrap text-[10.5px] leading-tight text-ink/55">{label}</p>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div className="mt-4 flex gap-4 border-b border-ink/[0.07] text-[13px]">
          {(
            [
              ["active", "Active Context"],
              ["relevant", "Relevant Files"],
              ["activity", "Recent Activity"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setShowAll(false);
              }}
              className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 font-medium transition ${
                tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-ink/55 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "activity" ? (
          activity.length === 0 ? (
            <p className="py-6 text-sm text-ink/40">Nothing yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-ink/[0.06]">
              {activity.slice(0, 6).map((a) => (
                <li key={`${a.kind}-${a.id}`} className="flex items-center gap-3 py-3">
                  <FileText className="h-5 w-5 shrink-0 text-ink/45" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.label}</p>
                    <p className="text-xs text-ink/50">{a.kind === "context" ? "Context added" : "Decision recorded"}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink/45">{timeAgo(a.ts)}</span>
                </li>
              ))}
            </ul>
          )
        ) : list.length === 0 ? (
          <p className="py-6 text-sm text-ink/45">
            {tab === "relevant"
              ? lastPrompt
                ? "No context files matched your last question."
                : "Ask a question to see the files most relevant to it."
              : "Nothing added yet. Context you attach is sent to every model."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-ink/[0.06]">
            {visible.map((item) => (
              <li key={item.id} className="group flex items-center gap-3 py-3">
                <FileText className="h-5 w-5 shrink-0 text-ink/55" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="truncate text-xs text-ink/50">{blurb(item)}</p>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  aria-label={`Remove ${item.title}`}
                  className="shrink-0 rounded p-1 text-ink/25 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab !== "activity" && list.length > SHOWN && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-1 flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            Show more files ({(tab === "active" ? total : list.length) - SHOWN}) <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
        {tab === "active" && showAll && total > items.length && (
          <Link href={`/context?project=${projectId}`} className="mt-2 flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700">
            {total - items.length} more in Context Library <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        )}

        {/* used for this response */}
        <div className="mt-4 rounded-xl bg-[#EEF4FF] p-4">
          <p className="font-display text-[15px] font-bold">Used for this response</p>
          {usedStats && usedStats.full_tokens > 0 && (
            <p className="mt-1 text-[11.5px] leading-snug text-ink/55">
              ~{usedStats.sent_tokens.toLocaleString()} tokens sent
              {usedStats.saved_tokens > 0 && (
                <>
                  {" "}
                  · <span className="font-medium text-emerald-700">~{usedStats.saved_tokens.toLocaleString()} saved</span> versus sending
                  everything (~{usedStats.full_tokens.toLocaleString()})
                </>
              )}
            </p>
          )}
          {used.length === 0 ? (
            <p className="mt-2 text-xs text-ink/50">No project context is attached yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2.5">
              {usedShown.map((u) => (
                <li key={u.id} className="flex items-center gap-2.5 text-[13px]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 fill-emerald-500 text-white" strokeWidth={2} />
                  <span className="truncate">{u.title}</span>
                  {u.truncated && (
                    <span className="shrink-0 text-[11px] text-ink/40">
                      ({u.parts ?? 1}/{u.total_parts ?? 1} sections)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {used.length > 4 && (
            <button
              onClick={() => setShowAllSources((v) => !v)}
              className="mt-3 flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700"
            >
              {showAllSources ? "Show fewer sources" : "View all sources"} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* recent decisions */}
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between">
          <p className="font-display text-[16px] font-bold">Recent Decisions</p>
          <Link href={`/decisions?project=${projectId}`} className="text-[13px] font-medium text-blue-600 hover:text-blue-700">
            View all
          </Link>
        </div>
        {decisions.length === 0 ? (
          <p className="mt-3 text-sm text-ink/45">No decisions yet. Use &ldquo;Accept as decision&rdquo; on an answer.</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink/[0.06]">
            {decisions.slice(0, 3).map((d, i) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <span className="rounded-md bg-ink/[0.06] px-1.5 py-1 text-[11px] font-medium text-ink/55">{decisionNumber(i)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.title || d.rationale || `${d.task_type} decision`}</p>
                  <p className="text-xs text-ink/50">{formatDate(d.decided_at)}</p>
                </div>
                <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-600">{STATUS_LABEL[d.status ?? "in_progress"]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog}
    </aside>
  );
}
