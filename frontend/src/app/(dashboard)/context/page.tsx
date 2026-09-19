"use client";

import {
  ChevronDown,
  ChevronRight,
  FileUp,
  Folder,
  Lightbulb,
  Link2,
  MessageSquare,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  FileText,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog, EditItemDialog, LinkDialog, NoteDialog } from "@/components/context/ContextDialogs";
import { ItemViewer } from "@/components/context/ItemViewer";
import { KindTile, timeAgo } from "@/components/context/kinds";
import { ProjectImage } from "@/components/projects/ProjectImage";
import {
  addContext,
  addLink,
  createContextFolder,
  deleteContextFolder,
  deleteContext,
  getLibrary,
  getLibraryItem,
  listContextFolders,
  listProjects,
  renameContextFolder,
  updateLibraryItem,
  uploadDocument,
} from "@/lib/api";
import type { LibraryItem, LibraryItemDetail, LibraryStats, Project } from "@/types";

// TODO: replace with the signed-in user's id once auth is wired up.
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";
const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";

type Filter = "all" | "file" | "note" | "link" | "conversation" | "code" | "image" | "imported" | "added" | "edited";
type Sort = "updated" | "name" | "size";

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "file", label: "Files" },
  { key: "note", label: "Notes" },
  { key: "link", label: "Links" },
  { key: "conversation", label: "Conversations" },
  { key: "code", label: "Code" },
  { key: "image", label: "Images" },
];
const MORE: { key: Filter; label: string }[] = [
  { key: "imported", label: "Imported from folder" },
  { key: "added", label: "Added in the app" },
  { key: "edited", label: "Edited in the app" },
];

// Text-based files can be read in the browser and stored as context.
const TEXT_EXT = new Set([
  "md", "markdown", "txt", "json", "csv", "tsv", "xml", "yml", "yaml", "toml", "ini", "env", "html", "htm", "css", "scss",
  "js", "jsx", "ts", "tsx", "mjs", "py", "php", "java", "go", "rs", "c", "h", "cpp", "cs", "rb", "sql", "sh", "ps1", "bat",
  "vue", "svelte", "kt", "swift", "dart", "log", "rst", "tex", "srt", "vtt",
]);
const MAX_UPLOAD = 500_000;
// Documents are read on the server (text only; images inside them are ignored).
const DOC_EXT = new Set(["pdf", "docx", "pptx", "xlsx"]);
const MAX_DOC_UPLOAD = 25 * 1024 * 1024;
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "avif"]);

function matches(item: LibraryItem, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "imported":
      return item.source === "import";
    case "added":
      return item.source === "app" || item.source === "link";
    case "edited":
      return item.edited;
    default:
      return item.kind === filter;
  }
}

function TipCard() {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-[#EFF9F3] to-[#E7F5EC] p-5">
      <p className="flex items-center gap-2 font-display text-[15px] font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Lightbulb className="h-4 w-4" strokeWidth={1.75} />
        </span>
        Better results with context
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {[
          "Add relevant files and documentation",
          "Include project requirements and goals",
          "Save key decisions and notes",
          "Keep everything up to date",
        ].map((t) => (
          <li key={t} className="flex items-center gap-2 text-[13px] text-ink/70">
            <CheckCircle2 className="h-4 w-4 shrink-0 fill-emerald-500 text-white" strokeWidth={2} /> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContextInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const urlQuery = searchParams.get("q") ?? "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [folder, setFolder] = useState<string | null>(null);
  const [managedFolders, setManagedFolders] = useState<string[]>([]);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [search, setSearch] = useState(urlQuery);
  const [sort, setSort] = useState<Sort>("updated");
  const [days, setDays] = useState<number | undefined>(30);
  const [showAll, setShowAll] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LibraryItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [dialog, setDialog] = useState<"note" | "link" | "edit" | "delete" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const flash = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // projects (for the picker) and the default project
  useEffect(() => {
    listProjects(DEMO_OWNER_ID)
      .then((data) => {
        setProjects(data);
        if (!projectId && data.length > 0) router.replace(`/context?project=${data[0].id}`);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSearch(urlQuery);
  }, [urlQuery]);

  // switching project resets the view
  useEffect(() => {
    setFilter("all");
    setFolder(null);
    setManagedFolders([]);
    setSelectedId(null);
    setDetail(null);
    setShowAll(false);
    setLoaded(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    listContextFolders(projectId).then(setManagedFolders).catch(() => setManagedFolders([]));
  }, [projectId]);

  const load = useCallback(() => {
    if (!projectId) return;
    getLibrary(projectId, days)
      .then(({ items: list, stats: st }) => {
        setItems(list);
        setStats(st);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the library"))
      .finally(() => setLoaded(true));
  }, [projectId, days]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const alphabetical = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects]
  );

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    managedFolders.forEach((name) => counts.set(name, 0));
    items.filter((i) => i.kind !== "conversation").forEach((i) => counts.set(i.folder, (counts.get(i.folder) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items, managedFolders]);
  const folderNames = useMemo(() => folders.map(([n]) => n), [folders]);

  async function addFolder() {
    if (!projectId || !newFolderName.trim()) return;
    setFolderBusy(true);
    try {
      setManagedFolders(await createContextFolder(projectId, newFolderName.trim()));
      setNewFolderName("");
      flash("Folder created");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not create folder");
    } finally {
      setFolderBusy(false);
    }
  }

  async function renameFolder(name: string) {
    if (!projectId) return;
    const nextName = window.prompt("Rename folder", name)?.trim();
    if (!nextName || nextName === name) return;
    setFolderBusy(true);
    try {
      setManagedFolders(await renameContextFolder(projectId, name, nextName));
      if (folder === name) setFolder(nextName);
      flash("Folder renamed");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not rename folder");
    } finally {
      setFolderBusy(false);
    }
  }

  async function removeFolder(name: string) {
    if (!projectId || !window.confirm(`Delete the ${name} folder? Items will stay in the library.`)) return;
    setFolderBusy(true);
    try {
      setManagedFolders(await deleteContextFolder(projectId, name));
      if (folder === name) setFolder(null);
      flash("Folder deleted");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not delete folder");
    } finally {
      setFolderBusy(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter((i) => matches(i, filter));
    if (folder) list = list.filter((i) => i.folder === folder);
    if (q) list = list.filter((i) => [i.title, i.snippet, i.folder].some((f) => f.toLowerCase().includes(q)));
    return [...list].sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      if (sort === "size") return b.size - a.size;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
  }, [items, filter, folder, search, sort]);

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((i) => i.id === selectedId)) setSelectedId(visible[0].id);
  }, [visible, selectedId]);

  const loadDetail = useCallback(
    (id: string, quiet = false) => {
      if (!projectId) return;
      if (!quiet) setDetailLoading(true);
      getLibraryItem(projectId, id)
        .then(setDetail)
        .catch(() => setDetail(null))
        .finally(() => setDetailLoading(false));
    },
    [projectId]
  );

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // ---- adding things ----
  async function saveNote(v: { title: string; content: string; folder: string }) {
    if (!projectId) return;
    const item = await addContext({ projectId, type: "note", title: v.title, content: v.content, folder: v.folder, metadata: { source: "app" } });
    setDialog(null);
    flash("Note added");
    load();
    setSelectedId(item.id);
  }

  async function saveLink(v: { url: string; folder: string }) {
    if (!projectId) return;
    const item = await addLink(projectId, v.url, v.folder);
    setDialog(null);
    flash("Link added");
    load();
    setSelectedId(item.id);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !projectId) return;
    let added = 0;
    const problems: string[] = [];
    let last: string | null = null;
    for (const file of Array.from(files)) {
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
      try {
        if (DOC_EXT.has(ext)) {
          if (file.size > MAX_DOC_UPLOAD) {
            problems.push(`${file.name}: over 25 MB`);
            continue;
          }
          flash(`Reading ${file.name}...`);
          const item = await uploadDocument(projectId, file, folder ?? undefined);
          last = item.id;
          added++;
        } else if (TEXT_EXT.has(ext) || file.type.startsWith("text/")) {
          if (file.size > MAX_UPLOAD) {
            problems.push(`${file.name}: text files must be under 500 KB`);
            continue;
          }
          const content = await file.text();
          const item = await addContext({ projectId, type: "file", title: file.name, content, folder: folder ?? undefined, metadata: { source: "app", upload: true } });
          last = item.id;
          added++;
        } else if (IMAGE_EXT.has(ext)) {
          problems.push(`${file.name}: images are not supported (they would add cost to every message)`);
        } else {
          problems.push(`${file.name}: unsupported type`);
        }
      } catch (e) {
        problems.push(`${file.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
    flash(
      [added ? `${added} file${added === 1 ? "" : "s"} added` : "", ...problems].filter(Boolean).join(". ") ||
        "Nothing was added"
    );
    load();
    if (last) setSelectedId(last);
  }

  async function saveEdit(v: { title: string; content: string; folder: string }) {
    if (!projectId || !detail) return;
    const updated = await updateLibraryItem(projectId, detail.id, { title: v.title, content: v.content, folder: v.folder });
    setDetail(updated);
    setDialog(null);
    flash("Saved");
    load();
  }

  async function removeItem() {
    if (!projectId || !detail) return;
    try {
      await deleteContext(projectId, detail.id);
      setDialog(null);
      setSelectedId(null);
      flash("Removed from context");
      load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not remove it");
    }
  }

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(detail?.content ?? "");
      flash("Copied");
    } catch {
      flash("Could not copy");
    }
  }

  const recent = showAll ? visible : visible.slice(0, 8);
  const pq = projectId ? `?project=${projectId}` : "";

  return (
    <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5" onClick={() => { setAddOpen(false); setMoreOpen(false); setSortOpen(false); }}>
      <div className="mx-auto max-w-[1300px] space-y-4">
        {/* header */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,560px)]">
          <div className="px-2 pt-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Context
            </span>
            <h1 className="mt-2 font-display text-[48px] font-extrabold leading-none tracking-[-0.035em]">
              Project <span className="text-brand">Context</span>
            </h1>
            <p className="mt-3 max-w-[640px] text-[17px] leading-snug text-ink/60">
              Your knowledge, in one place. Add files, links, notes and conversations. Inteli-Space keeps context across all
              models, so you get better, more relevant results.
            </p>
          </div>
          <div className="relative min-h-[140px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#EEF6F1] to-[#DDEFE4]">
            <svg viewBox="0 0 560 150" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
              <path d="M300 150C350 60 420 20 490 60s70 60 70 60V150Z" fill="#12A150" fillOpacity="0.16" />
              <path d="M400 150C440 100 500 80 560 100V150Z" fill="#12A150" fillOpacity="0.2" />
            </svg>
            <div className="relative flex items-center gap-5 p-7">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70 text-emerald-600">
                <Folder className="h-8 w-8" strokeWidth={1.75} />
              </span>
              <div>
                <p className="font-display text-[20px] font-bold leading-tight">
                  More context.
                  <br />
                  Better answers.
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-ink/60">
                  All your project knowledge, always available
                  <br />
                  across Claude, ChatGPT, Gemini and more.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* project strip */}
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3 px-1">
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-medium text-ink/80">Current Project</span>
            <div className="relative">
              <div className="flex items-center gap-2.5 rounded-xl border border-ink/10 bg-white py-2 pl-3 pr-9">
                <ProjectImage className="h-7 w-7 rounded-lg" mark="h-4 w-4" />
                <span className="max-w-[180px] truncate text-[15px] font-semibold">{project?.name ?? "Select a project"}</span>
              </div>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" strokeWidth={2} />
              <select
                value={projectId ?? ""}
                onChange={(e) => router.push(`/context?project=${e.target.value}`)}
                aria-label="Current project"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {alphabetical.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-[15px]">
            <Link href={`/overview${pq}`} className="rounded-lg px-4 py-2 text-ink/70 hover:text-ink">
              Overview
            </Link>
            <span className="rounded-lg bg-blue-50 px-4 py-2 font-medium text-blue-600">Context</span>
            <Link href={`/chat${pq}`} className="rounded-lg px-4 py-2 text-ink/70 hover:text-ink">
              Chat
            </Link>
            <Link href={`/decisions${pq}`} className="rounded-lg px-4 py-2 text-ink/70 hover:text-ink">
              Decisions
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFilter("file");
                setFolder(null);
              }}
              className="rounded-lg px-4 py-2 text-ink/70 hover:text-ink"
            >
              Files
            </button>
            <Link href="/settings" className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-ink/70 hover:text-ink">
              Settings <Sparkles className="h-3 w-3 text-blue-400" strokeWidth={2} />
            </Link>
          </nav>
        </section>

        {/* filters + add */}
        <section className="flex flex-wrap items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="relative flex flex-wrap items-center gap-1 rounded-xl border border-ink/10 bg-white p-1">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${filter === key ? "bg-blue-600 text-white" : "text-ink/60 hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className={`flex items-center gap-1 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  MORE.some((m) => m.key === filter) ? "bg-blue-600 text-white" : "text-ink/60 hover:text-ink"
                }`}
              >
                {MORE.find((m) => m.key === filter)?.label ?? "More"} <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              {moreOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
                  {MORE.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => {
                        setFilter(m.key);
                        setMoreOpen(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-[13px] text-ink/75 hover:bg-ink/5"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex w-[300px] items-center gap-2 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-ink/40" strokeWidth={2} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search context..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-ink/40"
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setSortOpen((v) => !v)}
                aria-label="Sort"
                className="rounded-xl border border-ink/10 bg-white p-2.5 text-ink/60 transition hover:border-ink/30 hover:text-ink"
              >
                <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ink/40">Sort by</p>
                  {(
                    [
                      ["updated", "Recently updated"],
                      ["name", "Name"],
                      ["size", "Size"],
                    ] as [Sort, string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => {
                        setSort(k);
                        setSortOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-ink/5 ${sort === k ? "font-semibold text-blue-600" : "text-ink/75"}`}
                    >
                      {label}
                      {sort === k && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setAddOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} /> Add <ChevronDown className="h-4 w-4" strokeWidth={2} />
              </button>
              {addOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
                  {[
                    { icon: FileUp, label: "Upload files", run: () => fileInput.current?.click() },
                    { icon: StickyNote, label: "Add a note", run: () => setDialog("note") },
                    { icon: Link2, label: "Add a link", run: () => setDialog("link") },
                  ].map(({ icon: Icon, label, run }) => (
                    <button
                      key={label}
                      onClick={() => {
                        setAddOpen(false);
                        run();
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-ink/75 hover:bg-ink/5"
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} /> {label}
                    </button>
                  ))}
                  <Link href="/integrations" className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-ink/75 hover:bg-ink/5">
                    <Link2 className="h-4 w-4" strokeWidth={1.75} /> Sync from integrations
                  </Link>
                </div>
              )}
            </div>
          </div>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        </section>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {/* three columns */}
        <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[290px_minmax(0,1fr)_300px]">
          {/* left: folders + recent */}
          <div className="px-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/50">Folders</p>
              <button onClick={() => setFolderManagerOpen(true)} className="text-xs font-medium text-blue-600 hover:text-blue-700">Manage</button>
            </div>
            <ul className="mt-2 flex flex-col">
              {folders.length === 0 && <li className="py-3 text-sm text-ink/45">{loaded ? "No folders yet." : "Loading..."}</li>}
              {folders.map(([name, count]) => (
                <li key={name}>
                  <button
                    onClick={() => setFolder(folder === name ? null : name)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[14px] transition ${
                      folder === name ? "bg-blue-50 text-blue-700" : "text-ink/80 hover:bg-ink/[0.04]"
                    }`}
                  >
                    <Folder className="h-[18px] w-[18px] shrink-0 text-blue-500" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="text-[13px] text-ink/50">{count}</span>
                    <ChevronRight className="h-4 w-4 text-ink/30" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              {folder ? folder : "Recent items"}
              {folder && (
                <button onClick={() => setFolder(null)} className="ml-2 font-medium normal-case tracking-normal text-blue-600 hover:underline">
                  Clear
                </button>
              )}
            </p>
            <ul className="mt-2 flex flex-col">
              {recent.length === 0 && (
                <li className="py-3 text-sm leading-relaxed text-ink/45">
                  {loaded ? "Nothing matches. Add files, notes or links with the Add button." : "Loading..."}
                </li>
              )}
              {recent.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => setSelectedId(i.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                      i.id === selectedId ? "bg-blue-50" : "hover:bg-ink/[0.04]"
                    }`}
                  >
                    <KindTile kind={i.kind} size="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold leading-tight">{i.title}</span>
                      <span className="block truncate text-xs text-ink/50">{i.folder}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink/45">{timeAgo(i.updated_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {visible.length > 8 && (
              <button onClick={() => setShowAll((v) => !v)} className="mt-2 px-2.5 text-[13px] font-medium text-blue-600 hover:text-blue-700">
                {showAll ? "Show fewer" : `Show all (${visible.length})`}
              </button>
            )}
          </div>

          {/* middle: viewer */}
          {projectId && (
            <ItemViewer
              projectId={projectId}
              detail={detail && detail.id === selectedId ? detail : null}
              loading={detailLoading}
              onEdit={() => setDialog("edit")}
              onCopy={copyContent}
              onDelete={() => setDialog("delete")}
              onSelectRelated={(id) => {
                setFilter("all");
                setFolder(null);
                setSelectedId(id);
              }}
              onChanged={(d) => {
                setDetail(d);
                flash("Version restored");
                load();
              }}
            />
          )}

          {/* right: stats and helpers */}
          <div className="flex flex-col gap-4">
            <div className={`${CARD} p-5`}>
              <div className="flex items-center justify-between">
                <p className="font-display text-[16px] font-bold">Context Stats</p>
                <div className="relative">
                  <select
                    value={days ?? 0}
                    onChange={(e) => setDays(Number(e.target.value) || undefined)}
                    aria-label="Stats range"
                    className="appearance-none rounded-lg border border-ink/10 bg-white py-1 pl-2.5 pr-6 text-xs text-ink/60 outline-none"
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={0}>All time</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink/50" strokeWidth={2} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  { icon: FileText, tone: "bg-blue-50 text-blue-600", value: stats?.files, label: "Total files" },
                  { icon: Link2, tone: "bg-blue-50 text-blue-600", value: stats?.links, label: "Links" },
                  { icon: StickyNote, tone: "bg-orange-50 text-orange-500", value: stats?.notes, label: "Notes" },
                  { icon: MessageSquare, tone: "bg-emerald-50 text-emerald-600", value: stats?.messages, label: "Chat messages" },
                ].map(({ icon: Icon, tone, value, label }) => (
                  <div key={label} className="flex items-center gap-2 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] p-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-[20px] font-bold leading-none">{value ?? "–"}</p>
                      <p className="mt-1 whitespace-nowrap text-[10px] text-ink/55">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <TipCard />

            <div className={`${CARD} p-5`}>
              <p className="font-display text-[16px] font-bold">Quick Actions</p>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  { icon: FileUp, tone: "bg-blue-50 text-blue-600", title: "Upload files", body: "PDF, Word, PowerPoint, Excel, text, code", run: () => fileInput.current?.click() },
                  { icon: StickyNote, tone: "bg-orange-50 text-orange-500", title: "Add a note", body: "Capture ideas or information", run: () => setDialog("note") },
                  { icon: Link2, tone: "bg-blue-50 text-blue-600", title: "Add a link", body: "Save important resources", run: () => setDialog("link") },
                ].map(({ icon: Icon, tone, title, body, run }) => (
                  <button
                    key={title}
                    onClick={run}
                    className="flex items-center gap-3 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] px-3.5 py-3 text-left transition hover:border-ink/20"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="block truncate text-xs text-ink/50">{body}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-ink/30" strokeWidth={2} />
                  </button>
                ))}
                <Link
                  href="/integrations"
                  className="flex items-center gap-3 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] px-3.5 py-3 transition hover:border-ink/20"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Link2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Sync from integrations</span>
                    <span className="block truncate text-xs text-ink/50">Notion, GitHub, Google Drive...</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink/30" strokeWidth={2} />
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-[#F4F1FF] to-[#EEF0FF] p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                  <Sparkles className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="font-display text-[15px] font-bold leading-tight">Use this context with any model</p>
                  <p className="mt-1 text-xs leading-snug text-ink/60">Get insights, summaries and answers using Claude, ChatGPT, Gemini and more.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {dialog === "note" && <NoteDialog folders={folderNames} onClose={() => setDialog(null)} onSave={saveNote} />}
      {dialog === "link" && <LinkDialog folders={folderNames} onClose={() => setDialog(null)} onSave={saveLink} />}
      {dialog === "edit" && detail && (
        <EditItemDialog
          title={detail.title}
          content={detail.content}
          folder={detail.folder}
          folders={folderNames}
          imported={detail.source === "import"}
          onClose={() => setDialog(null)}
          onSave={saveEdit}
        />
      )}
      {dialog === "delete" && detail && (
        <ConfirmDialog
          title="Remove from context?"
          body={`"${detail.title}" will no longer be sent to the models.${
            detail.source === "import" ? " It came from a file on disk and can be brought back by Sync now on the project." : ""
          }`}
          confirmLabel="Remove"
          danger
          onClose={() => setDialog(null)}
          onConfirm={removeItem}
        />
      )}

      {folderManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-5" role="dialog" aria-modal="true" aria-labelledby="folder-manager-title">
          <div className={`${CARD} w-full max-w-md p-5`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="folder-manager-title" className="font-display text-lg font-bold">Manage folders</p>
                <p className="mt-1 text-[13px] text-ink/55">Organize context without leaving the library.</p>
              </div>
              <button onClick={() => setFolderManagerOpen(false)} className="text-sm text-ink/45 hover:text-ink">Close</button>
            </div>
            <div className="mt-4 flex gap-2">
              <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="New folder name" className="h-10 min-w-0 flex-1 rounded-lg border border-ink/12 px-3 text-sm outline-none focus:border-blue-400" />
              <button onClick={addFolder} disabled={folderBusy || !newFolderName.trim()} className="rounded-lg bg-blue-600 px-3.5 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Add</button>
            </div>
            <ul className="mt-4 divide-y divide-ink/[0.06]">
              {folders.map(([name, count]) => (
                <li key={name} className="flex items-center gap-3 py-2.5">
                  <Folder className="h-4 w-4 text-blue-500" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="text-xs text-ink/40">{count}</span>
                  <button onClick={() => renameFolder(name)} disabled={folderBusy} className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50">Rename</button>
                  <button onClick={() => removeFolder(name)} disabled={folderBusy} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Delete</button>
                </li>
              ))}
              {folders.length === 0 && <li className="py-3 text-sm text-ink/45">No folders yet.</li>}
            </ul>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl">{toast}</div>
      )}
    </main>
  );
}

export default function ContextPage() {
  return (
    <Suspense fallback={<main className="flex h-full items-center justify-center text-sm text-ink/40">Loading...</main>}>
      <ContextInner />
    </Suspense>
  );
}
