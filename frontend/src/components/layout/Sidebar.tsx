"use client";

import {
  Asterisk,
  Cog,
  Compass,
  FolderKanban,
  BarChart3,
  ChevronRight,
  Home,
  LayoutGrid,
  LifeBuoy,
  MessageSquare,
  MoreHorizontal,
  Plug,
  PlusCircle,
  Radar,
  Settings,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark, ProviderLogo } from "@/components/landing/Marks";
import { getProjectStats, listModels, listProjects } from "@/lib/api";
import { AGENTS } from "@/lib/agents";
import { ProjectSwitcher } from "./ProjectSwitcher";
import type { ModelSpec, Project } from "@/types";

// TODO: replace with the signed-in user's id once auth is wired up.
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/overview", label: "Overview", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/decisions", label: "Decisions", icon: PlusCircle },
  { href: "/context", label: "Context", icon: LayoutGrid },
  { href: "/activity", label: "Activity", icon: PlusCircle },
];

// Workspace-level pages (no single project in scope) get the workspace sidebar.
const WORKSPACE_PATHS = ["/dashboard", "/projects", "/decisions", "/context", "/integrations", "/agents", "/analytics", "/settings", "/help"];

// Nav for the workspace sidebar. `projectScoped` links need a project id; we
// point them at the most recently updated project.
const WORKSPACE_NAV: { href: string; label: string; icon: LucideIcon; projectScoped?: boolean }[] = [
  { href: "/dashboard", label: "Main Dashboard", icon: Home },
  { href: "/projects", label: "All Projects", icon: FolderKanban },
  { href: "/chat", label: "Chat", icon: MessageSquare, projectScoped: true },
  { href: "/decisions", label: "Decisions", icon: PlusCircle },
  { href: "/context", label: "Context Library", icon: LayoutGrid, projectScoped: true },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Model rows are grouped per provider (the registry can hold several models
// per provider); "Online" if any model of that provider is active.
const PROVIDERS = [
  { provider: "openai", label: "GPT" },
  { provider: "anthropic", label: "Claude" },
  { provider: "gemini", label: "Gemini" },
];

// literal class names so Tailwind's static scan picks them up
const AGENT_TILE: Record<string, { icon: LucideIcon; cls: string }> = {
  wendy: { icon: Asterisk, cls: "from-violet-400 to-fuchsia-500" },
  chief: { icon: Cog, cls: "from-amber-300 to-orange-500" },
  chloe: { icon: Radar, cls: "from-teal-300 to-emerald-600" },
  lisa: { icon: LifeBuoy, cls: "from-lime-400 to-green-600" },
  sage: { icon: Compass, cls: "from-sky-300 to-blue-600" },
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  const [models, setModels] = useState<ModelSpec[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatCount, setChatCount] = useState(0);

  useEffect(() => {
    listModels()
      .then(setModels)
      .catch(() => setModels([]));
    listProjects(DEMO_OWNER_ID)
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  // conversation count for the Chat badge (refreshed as you move around)
  useEffect(() => {
    if (!projectId) {
      setChatCount(0);
      return;
    }
    let cancelled = false;
    getProjectStats(projectId)
      .then((st) => !cancelled && setChatCount(st.conversation_count))
      .catch(() => !cancelled && setChatCount(0));
    return () => {
      cancelled = true;
    };
  }, [projectId, pathname]);

  function switchToProject(id: string) {
    // switching projects keeps you on the same section (Chat stays Chat, etc.)
    const target = pathname && pathname !== "/projects" ? pathname : "/overview";
    router.push(`${target}?project=${id}`);
  }

  const workspaceMode = !!pathname && WORKSPACE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const firstProjectId = projects[0]?.id;

  function withProject(href: string) {
    return projectId ? `${href}?project=${projectId}` : href;
  }

  function agentHref(agentKey: string) {
    const params = new URLSearchParams();
    if (projectId) params.set("project", projectId);
    params.set("agent", agentKey);
    return `/chat?${params.toString()}`;
  }

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col bg-[#0D1220] text-white">
      <Link href="/" className="flex items-center gap-3 px-5 pb-5 pt-5">
        <LogoMark className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-bold leading-tight">Inteli-Space</p>
          <p className="truncate text-[11px] leading-tight text-white/50">Your projects. All models. One mind.</p>
        </div>
      </Link>

      {workspaceMode ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <nav className="mt-3 flex flex-col gap-1 px-3">
            {WORKSPACE_NAV.map(({ href, label, icon: Icon, projectScoped }) => {
              const active = pathname === href || pathname?.startsWith(`${href}/`);
              const target = projectScoped ? (firstProjectId ? `${href}?project=${firstProjectId}` : "/projects") : href;
              return (
                <Link
                  key={href}
                  href={target}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-[#1E3A8A] text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  <span className="flex-1">{label}</span>
                </Link>
              );
            })}
          </nav>

          <p className="mt-7 px-5 text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Models</p>
          <div className="mt-2 flex flex-col gap-0.5 px-3">
            {PROVIDERS.map(({ provider, label }) => {
              const online = models.some((m) => m.provider === provider && m.is_active);
              return (
                <div key={provider} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                  <span className="flex items-center gap-3 text-white/90">
                    <ProviderLogo provider={provider} tile className="h-8 w-8" />
                    {label}
                  </span>
                  <span
                    className={`mr-2 h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-white/25"}`}
                    title={online ? "Online" : "Offline"}
                  />
                </div>
              );
            })}
          </div>

          <Link
            href="/agents"
            className="mx-3 mt-1 flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <MoreHorizontal className="ml-1.5 h-4 w-4" strokeWidth={2} />
            <span className="flex-1">More Models</span>
            <ChevronRight className="h-4 w-4 text-white/40" strokeWidth={2} />
          </Link>
        </div>
      ) : (
        <>
      <ProjectSwitcher
        projects={projects}
        projectId={projectId}
        onSelect={switchToProject}
        onSelectAll={() => router.push("/projects")}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <nav className="mt-3 flex flex-col gap-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={withProject(href)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-[#1E3A8A] text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                <span className="flex-1">{label}</span>
                {href === "/chat" && chatCount > 0 && (
                  <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-semibold text-white">
                    {chatCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <p className="mt-7 px-5 text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Models</p>
        <div className="mt-2 flex flex-col gap-0.5 px-3">
          {PROVIDERS.map(({ provider, label }) => {
            const online = models.some((m) => m.provider === provider && m.is_active);
            return (
              <div key={provider} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className="flex items-center gap-3 text-white/90">
                  <ProviderLogo provider={provider} tile className="h-8 w-8" />
                  {label}
                </span>
                <span className="flex items-center gap-1.5 text-xs">
                  <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-white/25"}`} />
                  <span className={online ? "text-white/70" : "text-white/35"}>{online ? "Online" : "Offline"}</span>
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-7 px-5 text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Agents</p>
        <div className="mt-2 flex flex-col gap-0.5 px-3 pb-4">
          {AGENTS.map((agent) => {
            const tile = AGENT_TILE[agent.key];
            const Icon = tile?.icon ?? Asterisk;
            return (
              <Link
                key={agent.key}
                href={agentHref(agent.key)}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/5"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white ${tile?.cls ?? "from-slate-400 to-slate-600"}`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white/90">{agent.name}</span>
                  <span className="block truncate text-[11px] text-white/45">{agent.role}</span>
                </span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              </Link>
            );
          })}
        </div>
      </div>

        </>
      )}

      <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-400 text-xs font-bold text-ink">
          CA
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">Caleb Akakpo</p>
          <p className="truncate text-[11px] text-white/45">
            {workspaceMode ? "Pro Plan" : "Building what’s next."}
          </p>
        </div>
        {workspaceMode ? (
          <MoreHorizontal className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
        ) : (
          <Settings className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
        )}
      </div>
    </aside>
  );
}
