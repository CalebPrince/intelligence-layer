"use client";

import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  FileText,
  FolderInput,
  FolderOpen,
  GitFork,
  RefreshCw,
  LayoutGrid,
  List,
  MoreHorizontal,
  Loader2,
  Plus,
  ScanSearch,
  Star,
  X,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectImage } from "@/components/projects/ProjectImage";
import { ImportProjectsModal } from "@/components/projects/ImportProjectsModal";
import {
  createProject,
  excludeWatchedFolder,
  getAllProjectStats,
  getWatchStatus,
  listProjects,
  scanWatchNow,
  stopWatching,
  syncProject,
  updateProject,
  updateWatch,
} from "@/lib/api";
import { SAMPLE_TEAM } from "@/lib/sampleWorkspace";
import type { Project, ProjectStats, ProjectStatus, WatchStatus } from "@/types";

// TODO: replace with the signed-in user's id once auth is wired up.
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";
const FAVORITES_KEY = "magl:favorite-projects";

const CATEGORIES = ["Web", "Mobile", "AI", "E-commerce", "Research", "Internal", "Other"];
const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "planning", label: "Planning" },
  { value: "research", label: "Research" },
];

// literal class names so Tailwind's static scan finds them
const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600",
  planning: "bg-blue-50 text-blue-600",
  research: "bg-violet-50 text-violet-600",
  archived: "bg-ink/[0.06] text-ink/60",
};
const TILE_TONES = [
  "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600",
  "bg-orange-100 text-orange-600",
  "bg-rose-100 text-rose-600",
  "bg-violet-100 text-violet-600",
  "bg-amber-100 text-amber-600",
];

function tileTone(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_TONES[hash % TILE_TONES.length];
}

function loadFavorites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

type Tab = "all" | "active" | "archived" | "mine";
type SortKey = "updated" | "name" | "created";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function since(iso?: string | null): string {
  if (!iso) return "not yet";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return timeAgo(iso);
}

function SelectBox({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 appearance-none rounded-xl border border-ink/10 bg-white pl-3.5 pr-9 text-sm text-ink/80 outline-none focus:border-ink/30"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" strokeWidth={2} />
    </div>
  );
}

function ProjectsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [projects, setProjects] = useState<Project[]>([]);
  const [statsById, setStatsById] = useState<Record<string, ProjectStats>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<SortKey>("updated");
  const [category, setCategory] = useState("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [importOpen, setImportOpen] = useState(false);
  const [watchStatus, setWatchStatus] = useState<WatchStatus | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const lastSeenImport = useRef<string | null>(null);
  const lastSeenUpdate = useRef<string | null>(null);
  const [creating, setCreating] = useState(searchParams.get("new") === "1");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newStatus, setNewStatus] = useState<ProjectStatus>("active");
  const [newTags, setNewTags] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setFavorites(loadFavorites()); // read after mount, localStorage isn't available during SSR
  }, []);

  // "+ New Project" in the top bar links here with ?new=1
  useEffect(() => {
    if (searchParams.get("new") === "1") setCreating(true);
  }, [searchParams]);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      } catch {
        // private browsing / storage disabled: favorite just won't persist this session
      }
      return next;
    });
  }

  function refresh(silent = false) {
    if (!silent) setLoading(true);
    Promise.all([listProjects(DEMO_OWNER_ID), getAllProjectStats(DEMO_OWNER_ID).catch(() => null)])
      .then(([data, stats]) => {
        setProjects(data);
        if (stats) setStatsById(stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  function pushToast(text: string) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  }

  // Live scanner status. The backend scans on its own schedule (default every
  // 30s); we poll a bit faster so the "checked Ns ago" label and new projects
  // show up promptly, and refresh the grid when something was auto-imported.
  async function pollWatch() {
    try {
      const status = await getWatchStatus(DEMO_OWNER_ID);
      setWatchStatus(status);
      // Keep cards live: files changed on disk (refreshed by the scanner) or
      // context added/removed in the app both show up without a reload.
      refresh(true);

      const newestUpdate = status.updates.at(-1)?.at ?? null;
      if (lastSeenUpdate.current === null) {
        lastSeenUpdate.current = newestUpdate ?? "";
      } else {
        const changed = status.updates.filter((u) => u.at > (lastSeenUpdate.current as string));
        if (changed.length > 0) {
          lastSeenUpdate.current = newestUpdate ?? lastSeenUpdate.current;
          pushToast(
            changed.length === 1
              ? `Refreshed ${changed[0].name} from disk`
              : `Refreshed ${changed.length} projects from disk`
          );
        }
      }

      const newest = status.recent.at(-1)?.at ?? null;
      if (lastSeenImport.current === null) {
        lastSeenImport.current = newest ?? "";
        return;
      }
      const fresh = status.recent.filter((r) => r.at > (lastSeenImport.current as string));
      if (fresh.length > 0) {
        lastSeenImport.current = newest ?? lastSeenImport.current;
        pushToast(
          fresh.length === 1
            ? `New project detected: ${fresh[0].name}`
            : `${fresh.length} new projects detected: ${fresh.map((f) => f.name).join(", ")}`
        );
        refresh(true);
      }
    } catch {
      // backend briefly unavailable: keep the last known status
    }
  }

  useEffect(() => {
    pollWatch();
    const timer = setInterval(pollWatch, 10_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleScanNow(watchId: string) {
    setScanningId(watchId);
    try {
      const { imported, refreshed } = await scanWatchNow(watchId);
      const parts: string[] = [];
      if (imported.length > 0) {
        parts.push(imported.length === 1 ? `New project: ${imported[0].name}` : `${imported.length} new projects added`);
      }
      if (refreshed > 0) parts.push(`${refreshed} refreshed from disk`);
      pushToast(parts.length > 0 ? parts.join(", ") : "Everything is up to date.");
      refresh(true);
      pollWatch();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanningId(null);
    }
  }

  async function handleSyncProject(project: Project) {
    setMenuOpenId(null);
    try {
      const { changes } = await syncProject(project.id);
      pushToast(changes.length > 0 ? `${project.name} refreshed: ${changes.join(", ")}` : `${project.name} is up to date`);
      refresh(true);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Sync failed");
    }
  }

  async function handleToggleAuto(watchId: string, autoImport: boolean) {
    await updateWatch(watchId, { autoImport }).catch(() => null);
    pollWatch();
  }

  async function handleStopWatching(watchId: string) {
    await stopWatching(watchId).catch(() => null);
    pollWatch();
  }

  async function handleExcludeFolder(watchId: string, path: string) {
    try {
      const updated = await excludeWatchedFolder(watchId, path);
      setWatchStatus((current) => current && { ...current, watches: current.watches.map((watch) => (watch.id === updated.id ? updated : watch)) });
      pushToast("Folder ignored by this watcher");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Could not ignore that folder");
    }
  }

  const counts = useMemo(
    () => ({
      all: projects.length,
      active: projects.filter((p) => !p.archived).length,
      archived: projects.filter((p) => p.archived).length,
      // only one owner exists until auth lands, so "mine" is everything
      mine: projects.length,
    }),
    [projects]
  );

  // last modified = newest of the project's own update time and its latest in-app activity
  function modifiedAt(p: Project): number {
    const activity = statsById[p.id]?.last_activity_at;
    return Math.max(Date.parse(p.updated_at) || 0, activity ? Date.parse(activity) || 0 : 0);
  }

  const categories = useMemo(
    () => [...new Set(projects.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [projects]
  );

  const visible = useMemo(() => {
    let list = projects;
    if (tab === "active") list = list.filter((p) => !p.archived);
    if (tab === "archived") list = list.filter((p) => p.archived);
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (q) {
      list = list.filter((p) =>
        [p.name, p.description ?? "", p.category ?? "", ...p.tags].some((f) => f.toLowerCase().includes(q))
      );
    }
    // default: most recently modified first (file changes on disk, or activity in the app)
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (sort === "created") return Date.parse(b.created_at) - Date.parse(a.created_at);
      return modifiedAt(b) - modifiedAt(a);
    });
  }, [projects, tab, category, q, sort, statsById]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const project = await createProject({
        ownerId: DEMO_OWNER_ID,
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        status: newStatus,
        category: newCategory || undefined,
        tags: newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 6),
      });
      router.push(`/overview?project=${project.id}`);
    } catch {
      setSubmitting(false);
    }
  }

  async function patchProject(project: Project, params: Parameters<typeof updateProject>[1]) {
    setMenuOpenId(null);
    const updated = await updateProject(project.id, params).catch(() => null);
    if (updated) setProjects((prev) => prev.map((p) => (p.id === project.id ? updated : p)));
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "all", label: "All Projects" },
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
    { key: "mine", label: "My Projects" },
  ];

  const createCard = creating ? (
    <form
      onSubmit={handleCreate}
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col gap-2.5 rounded-2xl border-2 border-dashed border-ink/20 bg-white p-5"
    >
      <input
        autoFocus
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="Project name"
        className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
      />
      <textarea
        value={newDescription}
        onChange={(e) => setNewDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm outline-none"
        >
          <option value="">Category</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as ProjectStatus)}
          className="rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <input
        value={newTags}
        onChange={(e) => setNewTags(e.target.value)}
        placeholder="Tags, comma separated"
        className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !newName.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setCreating(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink/50 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  ) : (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setCreating(true);
      }}
      className={`flex items-center justify-center rounded-2xl border-2 border-dashed border-ink/15 bg-white/50 text-center transition hover:border-ink/30 hover:bg-white ${
        view === "list" ? "flex-row gap-4 px-6 py-4" : "min-h-[236px] flex-col gap-3 p-8"
      }`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111827] text-white">
        <Plus className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className={view === "list" ? "text-left" : "contents"}>
        <span className="block font-display text-base font-bold">Create New Project</span>
        <span className="mt-1 block max-w-[240px] text-[13px] leading-snug text-ink/55">
          Start a new project and connect your files, tools and team.
        </span>
      </span>
    </button>
  );

  return (
    <main className="h-full overflow-y-auto bg-[#F7F8FB]" onClick={() => setMenuOpenId(null)}>
      {/* header */}
      <div className="grid grid-cols-1 items-stretch gap-6 bg-white px-8 pt-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,520px)] xl:gap-10">
        <div className="pb-2 lg:pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/50">Projects</p>
          <h1 className="mt-2 font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] xl:text-[44px]">All Projects</h1>
          <p className="mt-4 text-lg leading-snug text-ink/60">
            Manage all your projects in one place. Connect your files, tools and team, and get the best from Claude,
            ChatGPT, Gemini and more.
          </p>
        </div>

        <div className="relative mb-8 min-h-[150px] w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#F0F7F3] to-[#DFF0E6] lg:mb-0">
          <svg viewBox="0 0 520 160" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
            <path d="M260 160C300 60 360 10 420 40s70 60 100 30V160Z" fill="#12A150" fillOpacity="0.18" />
            <path d="M330 160C380 90 430 60 480 90s40 30 40 30V160Z" fill="#12A150" fillOpacity="0.22" />
          </svg>
          <div className="relative p-7">
            <p className="font-display text-lg font-bold leading-tight">
              Different projects.
              <br />
              One intelligence layer.
            </p>
            <p className="mt-1.5 text-[13px] text-ink/60">Claude. ChatGPT. Gemini. Together.</p>
            <div className="mt-3 flex gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FCE6DC]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/claude-color.svg" alt="Claude" className="h-6 w-6" />
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#12A150]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/openai.svg" alt="ChatGPT" className="h-6 w-6 brightness-0 invert" />
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E9E6FF]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/gemini-color.svg" alt="Gemini" className="h-6 w-6" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* tabs + toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.07] bg-white px-8">
        <div className="flex items-center gap-2">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition ${
                tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-ink/60 hover:text-ink"
              }`}
            >
              {label}
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs ${
                  tab === key ? "bg-blue-50 text-blue-600" : "bg-ink/[0.05] text-ink/50"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 py-2">
          <button
            onClick={() => setImportOpen(true)}
            className="flex h-10 items-center gap-2 rounded-xl border border-ink/10 bg-white px-3.5 text-sm font-medium text-ink/80 transition hover:border-ink/25 hover:bg-ink/[0.02]"
          >
            <FolderInput className="h-4 w-4" strokeWidth={1.75} /> Import
          </button>
          <SelectBox value={category} onChange={setCategory}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectBox>
          <SelectBox value={sort} onChange={(v) => setSort(v as SortKey)}>
            <option value="updated">Last updated</option>
            <option value="created">Date created</option>
            <option value="name">Name</option>
          </SelectBox>
          <div className="flex items-center gap-1 rounded-xl border border-ink/10 bg-white p-1">
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={`rounded-lg p-2 ${view === "grid" ? "bg-blue-50 text-blue-600" : "text-ink/45 hover:text-ink"}`}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              onClick={() => setView("list")}
              aria-label="List view"
              className={`rounded-lg p-2 ${view === "list" ? "bg-blue-50 text-blue-600" : "text-ink/45 hover:text-ink"}`}
            >
              <List className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {watchStatus?.watches.map((w) => (
        <div
          key={w.id}
          className="mx-8 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-[13px]"
        >
          <span className="relative flex h-2.5 w-2.5">
            {w.exists && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${w.exists ? "bg-emerald-500" : "bg-amber-500"}`} />
          </span>
          <span className="font-medium text-emerald-900">Live scan</span>
          <span className="min-w-0 truncate rounded-md bg-white/70 px-2 py-0.5 font-mono text-xs text-ink/70">{w.path}</span>
          <span className="text-ink/55">
            {!w.exists
              ? "Folder not reachable right now"
              : w.pending.length > 0
                ? w.auto_import
                  ? `${w.pending.length} new folder${w.pending.length === 1 ? "" : "s"} detected, adding shortly`
                  : `${w.pending.length} new folder${w.pending.length === 1 ? "" : "s"} waiting to be added`
                : `Checked ${since(w.last_scan_at)}, every ${watchStatus.interval_seconds}s`}
          </span>
          {w.pending.length > 0 && (
            <div className="flex basis-full flex-wrap items-center gap-1.5 pl-5">
              <span className="text-xs text-ink/45">Pending:</span>
              {w.pending.map((path) => (
                <span key={path} className="inline-flex max-w-full items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-xs text-ink/65">
                  <span className="max-w-[240px] truncate font-mono">{path}</span>
                  <button onClick={() => handleExcludeFolder(w.id, path)} className="font-semibold text-ink/45 hover:text-red-600" title="Ignore this folder">
                    Ignore
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-ink/70">
              <input
                type="checkbox"
                checked={w.auto_import}
                onChange={(e) => handleToggleAuto(w.id, e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600"
              />
              Add new folders automatically
            </label>
            <button
              onClick={() => handleScanNow(w.id)}
              disabled={scanningId === w.id}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
            >
              {scanningId === w.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ScanSearch className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              Scan now
            </button>
            <button
              onClick={() => handleStopWatching(w.id)}
              aria-label="Stop watching this folder"
              title="Stop watching"
              className="rounded-lg p-1.5 text-ink/40 hover:bg-white hover:text-ink"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      ))}

      {q && (
        <p className="px-8 pt-5 text-sm text-ink/55">
          Showing results for <span className="font-medium text-ink">&ldquo;{searchParams.get("q")}&rdquo;</span>{" "}
          <button onClick={() => router.push("/projects")} className="ml-1 text-blue-600 hover:underline">
            Clear
          </button>
        </p>
      )}

      {loading ? (
        <p className="px-8 py-10 text-sm text-ink/40">Loading…</p>
      ) : (
        <div
          className={`grid gap-4 p-8 ${
            view === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : "grid-cols-1"
          }`}
        >
          {createCard}

          {visible.map((project) => {
            const stats = statsById[project.id];
            const statusKey = project.archived ? "archived" : project.status;
            const statusLabel = project.archived
              ? "Archived"
              : (STATUSES.find((s) => s.value === project.status)?.label ?? "Active");
            const list = view === "list";
            return (
              <div
                key={project.id}
                onClick={() => router.push(`/overview?project=${project.id}`)}
                className={`relative cursor-pointer rounded-2xl border border-ink/[0.07] bg-white p-5 shadow-[0_1px_2px_rgba(11,14,20,0.03)] transition hover:border-ink/20 hover:shadow-md ${
                  project.archived ? "opacity-70" : ""
                } ${list ? "flex items-center gap-6 py-4" : "flex min-h-[236px] flex-col"}`}
              >
                <div className={`flex items-start gap-3 ${list ? "w-[240px] shrink-0" : ""}`}>
                  <ProjectImage />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-display text-[15px] font-bold leading-tight">{project.name}</p>
                    <span
                      className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_PILL[statusKey]}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {!list && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <FavoriteButton
                        active={favorites.has(project.id)}
                        onToggle={() => toggleFavorite(project.id)}
                      />
                      <CardMenu
                        project={project}
                        open={menuOpenId === project.id}
                        onToggle={() => setMenuOpenId((id) => (id === project.id ? null : project.id))}
                        onPatch={(params) => patchProject(project, params)}
                        onSync={() => handleSyncProject(project)}
                      />
                    </div>
                  )}
                </div>

                <p
                  className={`text-[14px] leading-snug text-ink/60 ${
                    list ? "min-w-0 flex-1 line-clamp-2" : "mt-3 line-clamp-3"
                  }`}
                >
                  {project.description ?? "No description yet."}
                </p>

                {project.tags.length > 0 && (
                  <div className={`flex flex-wrap gap-1.5 ${list ? "hidden w-[210px] shrink-0 2xl:flex" : "mt-3"}`}>
                    {project.tags.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-md bg-ink/[0.05] px-2 py-1 text-xs text-ink/60">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* placeholder team until auth exists (same source as the Overview page) */}
                <div className={`flex items-center gap-2 ${list ? "w-[130px] shrink-0" : "mt-3"}`}>
                  <span className="flex -space-x-2">
                    {SAMPLE_TEAM.shown.slice(0, 3).map((m) => (
                      <span
                        key={m.initials}
                        className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold text-ink ring-2 ring-white ${m.cls}`}
                      >
                        {m.initials}
                      </span>
                    ))}
                  </span>
                  <span className="text-xs text-ink/60">{SAMPLE_TEAM.total} members</span>
                </div>

                <div
                  className={`flex items-center gap-3 whitespace-nowrap text-[11.5px] text-ink/50 ${
                    list ? "w-[290px] shrink-0" : "mt-auto border-t border-ink/[0.06] pt-3"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {stats?.context_count ?? "–"} {stats?.context_count === 1 ? "file" : "files"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <GitFork className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {stats?.decisions_count ?? "–"} {stats?.decisions_count === 1 ? "decision" : "decisions"}
                  </span>
                  <span className="ml-auto">Updated {timeAgo(new Date(modifiedAt(project)).toISOString())}</span>
                </div>

                {list && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <FavoriteButton active={favorites.has(project.id)} onToggle={() => toggleFavorite(project.id)} />
                    <CardMenu
                      project={project}
                      open={menuOpenId === project.id}
                      onToggle={() => setMenuOpenId((id) => (id === project.id ? null : project.id))}
                      onPatch={(params) => patchProject(project, params)}
                      onSync={() => handleSyncProject(project)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {visible.length === 0 && !creating && (
            <p className="col-span-full text-sm text-ink/40">
              {q ? "No projects match your search." : "No projects in this view yet."}
            </p>
          )}
        </div>
      )}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {t.text}
            </div>
          ))}
        </div>
      )}

      {importOpen && (
        <ImportProjectsModal ownerId={DEMO_OWNER_ID} onClose={() => setImportOpen(false)} onImported={() => {
            refresh(true);
            pollWatch();
          }}
        />
      )}
    </main>
  );
}

function FavoriteButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={active ? "Unstar" : "Star"}
      className="rounded-full p-1.5 text-ink/35 hover:bg-ink/5 hover:text-ink"
    >
      <Star className={`h-4 w-4 ${active ? "fill-amber-400 text-amber-400" : ""}`} strokeWidth={1.75} />
    </button>
  );
}

function CardMenu({
  project,
  open,
  onToggle,
  onPatch,
  onSync,
}: {
  project: Project;
  open: boolean;
  onToggle: () => void;
  onPatch: (params: { archived?: boolean; status?: ProjectStatus }) => void;
  onSync: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label="Project actions"
        className="rounded-full p-1.5 text-ink/35 hover:bg-ink/5 hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg"
        >
          {project.source_path && (
            <button
              onClick={onSync}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink/70 hover:bg-ink/5"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} /> Sync from folder
            </button>
          )}
          {!project.archived &&
            STATUSES.filter((s) => s.value !== project.status).map((s) => (
              <button
                key={s.value}
                onClick={() => onPatch({ status: s.value })}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink/70 hover:bg-ink/5"
              >
                <FileText className="h-3.5 w-3.5" strokeWidth={2} /> Mark as {s.label}
              </button>
            ))}
          <button
            onClick={() => onPatch({ archived: !project.archived })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink/70 hover:bg-ink/5"
          >
            {project.archived ? (
              <>
                <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={2} /> Unarchive
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" strokeWidth={2} /> Archive
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<main className="flex h-full items-center justify-center text-sm text-ink/40">Loading…</main>}>
      <ProjectsInner />
    </Suspense>
  );
}
