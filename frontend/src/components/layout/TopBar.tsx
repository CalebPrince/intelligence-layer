"use client";

import { BookOpen, Bell, ChevronDown, Copy, FolderKanban, MoreHorizontal, Plus, Search, Share2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getProject } from "@/lib/api";
import { CreditsPill } from "./CreditsPill";
import type { Project } from "@/types";

// Local-dev convenience — the backend has no public URL yet, so this only
// makes sense while both servers are running on localhost.
const BACKEND_DOCS_URL = "http://localhost:8000/docs";

// Minimal "jump to page" search — typing a nav term and pressing Enter
// navigates there. Not full-text search (nothing here indexes message or
// context content yet), but it's real, not decorative.
const JUMP_TARGETS: { match: string[]; href: string }[] = [
  { match: ["overview"], href: "/overview" },
  { match: ["chat", "conversation"], href: "/chat" },
  { match: ["decision"], href: "/decisions" },
  { match: ["context", "file", "document"], href: "/context" },
  { match: ["activity"], href: "/activity" },
  { match: ["project"], href: "/projects" },
];

function timeAgo(iso?: string): string {
  if (!iso) return "just now";
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const WORKSPACE_PATHS = ["/dashboard", "/projects", "/decisions", "/context", "/integrations", "/agents", "/analytics", "/settings", "/help"];

export function TopBar() {
  const pathname = usePathname();
  const chatMode = !!pathname && (pathname === "/chat" || pathname.startsWith("/chat/"));
  const workspaceMode = !!pathname && WORKSPACE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  const [project, setProject] = useState<Project | null>(null);
  // pages whose top-bar search filters their own list live (via ?q=)
  const liveBase = ["/decisions", "/context"].find((b) => pathname === b || pathname?.startsWith(`${b}/`)) ?? null;
  const decisionsMode = liveBase !== null;
  const [query, setQuery] = useState(decisionsMode ? (searchParams.get("q") ?? "") : "");
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  // On the Decisions page the search box filters the list live (via ?q=).
  useEffect(() => {
    if (!decisionsMode) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const current = params.get("q") ?? "";
      if (current === query.trim()) return;
      if (query.trim()) params.set("q", query.trim());
      else params.delete("q");
      const qs = params.toString();
      router.replace(`${liveBase}${qs ? `?${qs}` : ""}`);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, decisionsMode]);

  // ⌘K / Ctrl+K focuses the search field
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    getProject(projectId)
      .then((p) => !cancelled && setProject(p))
      .catch(() => !cancelled && setProject(null));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (decisionsMode) return; // filtering happens live
    const q = query.trim().toLowerCase();
    if (!q) return;
    const target = JUMP_TARGETS.find((t) => t.match.some((m) => q.includes(m)));
    if (target) {
      router.push(projectId ? `${target.href}?project=${projectId}` : target.href);
      setQuery("");
    } else if (workspaceMode) {
      // no page matched: treat it as a project search (filtered on /projects)
      router.push(`/projects?q=${encodeURIComponent(query.trim())}`);
    }
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — nothing to fall back to worth building for local dev
    }
  }

  async function handleCopyId() {
    if (!projectId) return;
    try {
      await navigator.clipboard.writeText(projectId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {
      // clipboard access denied
    }
  }

  const accountMenu = (
      <div ref={menuRef} className="relative shrink-0">
        {chatMode ? (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More"
            className="rounded-lg p-2 text-ink/60 transition hover:bg-ink/5 hover:text-ink"
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
          </button>
        ) : (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-400 text-xs font-bold text-ink"
          >
            CA
          </button>
        )}
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-lg">
            <button
              onClick={handleShare}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-ink/70 hover:bg-ink/5"
            >
              <Share2 className="h-3.5 w-3.5" strokeWidth={2} /> {copied ? "Link copied!" : "Share this page"}
            </button>
            <a
              href={BACKEND_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 text-left text-xs text-ink/70 hover:bg-ink/5"
            >
              <BookOpen className="h-3.5 w-3.5" strokeWidth={2} /> API docs
            </a>
            {projectId && (
              <button
                onClick={handleCopyId}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-ink/70 hover:bg-ink/5"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} /> {copiedId ? "Copied!" : "Copy project ID"}
              </button>
            )}
          </div>
        )}
      </div>
  );

  if (workspaceMode) {
    return (
      <header className="flex h-[72px] shrink-0 items-center gap-5 border-b border-ink/[0.07] bg-white px-6">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-ink/40" strokeWidth={2} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={
              liveBase === "/decisions"
                ? "Search decisions, projects, topics, or keywords..."
                : liveBase === "/context"
                  ? "Search your context, files, notes, or ask anything..."
                  : "Search projects, files, decisions, or ask anything..."
            }
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink/40"
          />
          <kbd className="flex shrink-0 gap-0.5 text-[11px] text-ink/40">
            <span className="rounded border border-ink/10 px-1">⌘</span>
            <span className="rounded border border-ink/10 px-1">K</span>
          </kbd>
        </div>
        {pathname === "/dashboard" && <CreditsPill />}
        <button
          type="button"
          onClick={() => router.push("/projects?new=1")}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} /> New Project
        </button>
        <button aria-label="Notifications" className="relative shrink-0 rounded-full p-2 text-ink/60 hover:bg-ink/5 hover:text-ink">
          <Bell className="h-5 w-5" strokeWidth={1.75} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
        {accountMenu}
      </header>
    );
  }

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-5 border-b border-ink/[0.07] bg-white px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
          <FolderKanban className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-display text-base font-bold leading-tight">
            {project?.name ?? "No project selected"}
            <ChevronDown className="h-4 w-4 text-ink/40" strokeWidth={2} />
          </p>
          <p className="truncate text-[13px] text-ink/50">
            {project?.description ?? "Your projects. All models. One mind."}
          </p>
        </div>
      </div>

      <div className="flex flex-1 justify-center">
        <div className="flex w-full max-w-[380px] items-center gap-2 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-ink/40" strokeWidth={2} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search this project..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink/40"
          />
          <kbd className="flex shrink-0 gap-0.5 text-[11px] text-ink/40">
            <span className="rounded border border-ink/10 px-1">⌘</span>
            <span className="rounded border border-ink/10 px-1">K</span>
          </kbd>
        </div>
      </div>

      {chatMode ? (
        <>
          <div className="hidden shrink-0 items-center gap-2.5 text-sm text-ink/80 md:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Context synced
          </div>
          <button
            onClick={handleShare}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Share2 className="h-4 w-4" strokeWidth={2} />
            {copied ? "Link copied!" : "Share"}
          </button>
        </>
      ) : (
        <>
          <div className="hidden shrink-0 items-center gap-2.5 md:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <div className="text-xs leading-tight">
              <p className="text-ink/80">Context synced</p>
              <p className="text-ink/45">{timeAgo(project?.updated_at)}</p>
            </div>
          </div>

          <button aria-label="Notifications" className="shrink-0 rounded-full p-2 text-ink/60 hover:bg-ink/5 hover:text-ink">
            <Bell className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </>
      )}

      {accountMenu}
    </header>
  );
}
