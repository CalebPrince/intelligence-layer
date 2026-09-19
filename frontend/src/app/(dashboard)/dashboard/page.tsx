"use client";

import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  FileText,
  Folder,
  GitFork,
  Link2,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Paperclip,
  Plus,
  Sun,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProjectImage } from "@/components/projects/ProjectImage";
import { getAllProjectStats, getDashboard, listProjects } from "@/lib/api";
import { WORKSPACE_INTEGRATIONS, WORKSPACE_TEAM } from "@/lib/sampleWorkspace";
import type { DashboardSummary, Project, ProjectStats } from "@/types";

// TODO: replace with the signed-in user's id once auth is wired up.
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";
const FAVORITES_KEY = "magl:favorite-projects";
const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";

// literal classes so Tailwind's static scan finds them
const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600",
  planning: "bg-blue-50 text-blue-600",
  research: "bg-violet-50 text-violet-600",
  archived: "bg-ink/[0.06] text-ink/60",
};

const PROVIDERS = [
  { key: "openai", label: "ChatGPT", color: "#12A150" },
  { key: "anthropic", label: "Claude", color: "#F08A5D" },
  { key: "gemini", label: "Gemini", color: "#8B5CF6" },
  { key: "other", label: "Others", color: "#CBD2DC" },
];

function timeAgo(iso?: string | number | null): string {
  if (!iso) return "No activity yet";
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function loadFavorites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function RangePill({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-2.5 py-1 text-xs text-ink/60">
      {label}
      <ChevronDown className="h-3 w-3" strokeWidth={2} />
    </span>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700">
      View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
    </Link>
  );
}

/** Round a max up to a friendly axis top (10, 20, 40, 50, 100 ...). */
function niceMax(max: number): number {
  if (max <= 10) return 10;
  const pow = 10 ** Math.floor(Math.log10(max));
  const steps = [1, 2, 4, 5, 10];
  return pow * (steps.find((s) => s * pow >= max) ?? 10);
}

function StatTile({
  icon,
  tone,
  label,
  value,
  foot,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: number | string;
  foot: React.ReactNode;
}) {
  return (
    <div className={`${CARD} flex items-center gap-4 p-5`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] text-ink/60">{label}</p>
        <p className="font-display text-[28px] font-bold leading-tight">{value}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/55">{foot}</p>
      </div>
    </div>
  );
}

export default function MainDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});
  const [tab, setTab] = useState<"recent" | "starred" | "active" | "archived">("recent");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    setHour(new Date().getHours()); // client-only: the server has no idea of the user's local time
    setFavorites(loadFavorites());
  }, []);

  // load, then re-check every 15s so file syncs and in-app activity show up live
  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([getDashboard(DEMO_OWNER_ID, 7), listProjects(DEMO_OWNER_ID), getAllProjectStats(DEMO_OWNER_ID)])
        .then(([s, p, st]) => {
          if (cancelled) return;
          setSummary(s);
          setProjects(p);
          setStats(st);
        })
        .catch(() => {});
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const modifiedAt = (p: Project) =>
    Math.max(Date.parse(p.updated_at) || 0, stats[p.id]?.last_activity_at ? Date.parse(stats[p.id].last_activity_at as string) || 0 : 0);

  const rows = useMemo(() => {
    let list = projects;
    if (tab === "starred") list = list.filter((p) => favorites.has(p.id));
    if (tab === "active") list = list.filter((p) => !p.archived);
    if (tab === "archived") list = list.filter((p) => p.archived);
    return [...list].sort((a, b) => modifiedAt(b) - modifiedAt(a)).slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, stats, tab, favorites]);

  const firstProject = projects[0]?.id;
  const withProject = (path: string) => (firstProject ? `${path}?project=${firstProject}` : "/projects");

  const greeting = hour === null ? "Welcome back" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const GreetingIcon = hour !== null && hour >= 18 ? Moon : Sun;

  const t = summary?.totals;
  const activity = summary?.activity ?? [];
  const barMax = niceMax(Math.max(0, ...activity.map((d) => d.chats + d.files + d.decisions)));
  const ticks = [4, 3, 2, 1, 0].map((i) => Math.round((barMax / 4) * i));

  const usage = summary?.usage;
  const totalRequests = usage?.total_requests ?? 0;
  const shares = PROVIDERS.map((p) => ({
    ...p,
    pct: totalRequests ? Math.round(((usage?.by_provider[p.key] ?? 0) / totalRequests) * 100) : 0,
    n: usage?.by_provider[p.key] ?? 0,
  }));
  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const QUICK = [
    { icon: Plus, tone: "bg-blue-50 text-blue-600", title: "Start a new project", body: "Set up a workspace for your idea", href: "/projects?new=1" },
    { icon: MessageSquare, tone: "bg-emerald-50 text-emerald-600", title: "Ask a question", body: "Get insights from all models", href: withProject("/chat") },
    { icon: Paperclip, tone: "bg-violet-50 text-violet-600", title: "Upload files", body: "Add documents, code or notes", href: withProject("/context") },
    { icon: Link2, tone: "bg-blue-50 text-blue-600", title: "Connect a tool", body: "Link GitHub, Notion, Slack and more", href: "/integrations" },
  ];

  const EVENT_STYLE = {
    context_synced: { icon: Folder, tone: "bg-emerald-50 text-emerald-600", title: "Context synced" },
    file: { icon: FileText, tone: "bg-orange-50 text-orange-500", title: "File uploaded" },
    decision: { icon: GitFork, tone: "bg-violet-50 text-violet-600", title: "Decision created" },
    project: { icon: Plus, tone: "bg-blue-50 text-blue-600", title: "New project created" },
  } as const;

  return (
    <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5">
      <div className="mx-auto max-w-[1300px] space-y-4">
        {/* hero */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,470px)]">
          <div className="px-2 pb-2 pt-1">
            <p className="flex items-center gap-2 text-sm font-medium text-ink/80">
              <GreetingIcon className="h-5 w-5 text-amber-400" strokeWidth={2} />
              {greeting}, Caleb
            </p>
            <h1 className="mt-3 font-display text-[48px] font-extrabold leading-[1.02] tracking-[-0.035em] xl:text-[56px]">
              Let&rsquo;s build <span className="text-brand">what&rsquo;s next.</span>
            </h1>
            <p className="mt-3 max-w-[560px] text-[17px] leading-snug text-ink/60">
              Your projects. All models. One workspace. Turn ideas into progress with Claude, ChatGPT, Gemini and more,
              powered by your context.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/projects?new=1"
                className="flex items-center gap-2.5 rounded-xl bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink"
              >
                Start a new project <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
              </Link>
              {[
                { icon: MessageSquare, label: "Ask anything", href: withProject("/chat") },
                { icon: Paperclip, label: "Upload files", href: withProject("/context") },
                { icon: Link2, label: "Connect integrations", href: "/integrations" },
              ].map(({ icon: Icon, label, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-medium transition hover:border-ink/25"
                >
                  <Icon className="h-4 w-4 text-ink/70" strokeWidth={1.75} />
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="relative min-h-[200px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#EEF6F1] to-[#DDEFE4]">
            <svg viewBox="0 0 470 220" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
              <path d="M230 220C280 100 350 30 420 70s50 70 50 70V220Z" fill="#12A150" fillOpacity="0.16" />
              <path d="M320 220C370 140 420 110 470 130V220Z" fill="#12A150" fillOpacity="0.2" />
            </svg>
            <div className="relative p-7">
              <p className="font-display text-[26px] font-medium italic leading-tight text-ink/80">
                <span className="mr-1 align-top text-3xl text-ink/40">&ldquo;</span>Different perspectives.
                <br />
                Better decisions.<span className="text-ink/40">&rdquo;</span>
              </p>
              <span className="mt-3 block h-px w-8 bg-ink/30" />
              <div className="mt-8 flex gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#12A150] shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/openai.svg" alt="ChatGPT" className="h-7 w-7 brightness-0 invert" />
                </span>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCE6DC] shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/claude-color.svg" alt="Claude" className="h-7 w-7" />
                </span>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E9E6FF] shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/gemini-color.svg" alt="Gemini" className="h-7 w-7" />
                </span>
                <Link
                  href="/agents"
                  aria-label="More models"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70 text-ink/50 shadow-sm hover:bg-white"
                >
                  <Plus className="h-5 w-5" strokeWidth={2} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* stat tiles */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            icon={<Folder className="h-6 w-6" strokeWidth={1.75} />}
            tone="bg-blue-50 text-blue-600"
            label="Total Projects"
            value={t?.projects ?? "–"}
            foot={
              <>
                <ArrowUp className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.25} />
                {t?.projects_this_month ?? 0} this month
              </>
            }
          />
          <StatTile
            icon={<FileText className="h-6 w-6" strokeWidth={1.75} />}
            tone="bg-blue-50 text-blue-600"
            label="Total Files"
            value={t?.files ?? "–"}
            foot={
              <>
                <ArrowUp className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.25} />
                {t?.files_this_week ?? 0} this week
              </>
            }
          />
          <StatTile
            icon={<GitFork className="h-6 w-6" strokeWidth={1.75} />}
            tone="bg-violet-50 text-violet-600"
            label="Decisions"
            value={t?.decisions ?? "–"}
            foot={
              <>
                <ArrowUp className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.25} />
                {t?.decisions_this_month ?? 0} this month
              </>
            }
          />
          <StatTile
            icon={<Users className="h-6 w-6" strokeWidth={1.75} />}
            tone="bg-blue-50 text-blue-600"
            label="Team Members"
            value={WORKSPACE_TEAM.total}
            foot={
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {WORKSPACE_TEAM.online} online
              </>
            }
          />
          <StatTile
            icon={<Zap className="h-6 w-6" strokeWidth={1.75} />}
            tone="bg-blue-50 text-blue-600"
            label="Integrations"
            value={WORKSPACE_INTEGRATIONS}
            foot={
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Connected
              </>
            }
          />
        </section>

        {/* analytics + feed */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
              {/* project activity */}
              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-bold">Project Activity</p>
                  <RangePill label="Last 7 days" />
                </div>
                <div className="mt-4 flex gap-3">
                  <div className="flex h-[150px] flex-col justify-between pb-6 text-right text-[11px] text-ink/45">
                    {ticks.map((tk) => (
                      <span key={tk}>{tk}</span>
                    ))}
                  </div>
                  <div className="flex-1">
                    <div className="relative flex h-[150px] items-end justify-between gap-2 border-b border-ink/10 pb-0">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="absolute left-0 right-0 border-t border-ink/[0.06]" style={{ bottom: `${(i / 4) * 100}%` }} />
                      ))}
                      {activity.map((d) => {
                        const total = d.chats + d.files + d.decisions;
                        return (
                          <div key={d.date} className="relative z-10 flex h-full flex-1 flex-col justify-end">
                            <div className="flex flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(total / barMax) * 100}%` }} title={`${d.chats} chats, ${d.files} files, ${d.decisions} decisions`}>
                              {total > 0 && (
                                <>
                                  <span className="bg-[#3DD68C]" style={{ flex: d.chats }} />
                                  <span className="bg-[#3B82F6]" style={{ flex: d.files }} />
                                  <span className="bg-[#9B87F5]" style={{ flex: d.decisions }} />
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-ink/50">
                      {activity.map((d) => (
                        <span key={d.date} className="flex-1 text-center">
                          {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-center gap-5 text-xs text-ink/60">
                  {[
                    ["Chats", "bg-[#3DD68C]"],
                    ["Files", "bg-[#3B82F6]"],
                    ["Decisions", "bg-[#9B87F5]"],
                  ].map(([label, cls]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-sm ${cls}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* model usage */}
              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-bold">Model Usage</p>
                  <RangePill label="Last 7 days" />
                </div>
                <div className="mt-4 flex items-center gap-5">
                  <div className="relative h-[150px] w-[150px] shrink-0">
                    <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90">
                      <circle cx="75" cy="75" r={R} fill="none" stroke="#E9EDF3" strokeWidth="16" />
                      {totalRequests > 0 &&
                        shares
                          .filter((s) => s.n > 0)
                          .map((s) => {
                            const len = (s.n / totalRequests) * C;
                            const el = (
                              <circle
                                key={s.key}
                                cx="75"
                                cy="75"
                                r={R}
                                fill="none"
                                stroke={s.color}
                                strokeWidth="16"
                                strokeDasharray={`${Math.max(len - 2, 0)} ${C}`}
                                strokeDashoffset={-offset}
                              />
                            );
                            offset += len;
                            return el;
                          })}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display text-2xl font-bold">{totalRequests}</span>
                      <span className="text-[11px] text-ink/50">Total requests</span>
                    </div>
                  </div>
                  <ul className="flex flex-1 flex-col gap-3">
                    {shares.map((s) => (
                      <li key={s.key} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                        <span className="flex-1">{s.label}</span>
                        <span className="text-ink/60">{s.pct}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
              {/* your projects */}
              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-bold">Your Projects</p>
                  <ViewAll href="/projects" />
                </div>
                <div className="mt-3 flex gap-1">
                  {(["recent", "starred", "active", "archived"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium capitalize transition ${
                        tab === k ? "bg-blue-50 text-blue-600" : "text-ink/55 hover:text-ink"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_88px_34px_62px_64px_16px] gap-2 border-b border-ink/[0.07] px-2 pb-2 text-xs text-ink/50">
                  <span>Name</span>
                  <span className="whitespace-nowrap">Last activity</span>
                  <span>Files</span>
                  <span>Decisions</span>
                  <span>Status</span>
                  <span />
                </div>
                {rows.length === 0 ? (
                  <p className="px-2 py-6 text-sm text-ink/40">No projects in this view yet.</p>
                ) : (
                  <ul>
                    {rows.map((p) => {
                      const s = stats[p.id];
                      const key = p.archived ? "archived" : p.status;
                      return (
                        <li key={p.id}>
                          <Link
                            href={`/overview?project=${p.id}`}
                            className="grid grid-cols-[minmax(0,1fr)_88px_34px_62px_64px_16px] items-center gap-2 rounded-lg px-2 py-2.5 text-[13px] transition hover:bg-ink/[0.03]"
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <ProjectImage className="h-7 w-7 rounded-lg" mark="h-4 w-4" />
                              <span className="truncate font-medium">{p.name}</span>
                            </span>
                            <span className="whitespace-nowrap text-ink/60">{timeAgo(modifiedAt(p))}</span>
                            <span className="text-ink/70">{s?.context_count ?? "–"}</span>
                            <span className="text-ink/70">{s?.decisions_count ?? "–"}</span>
                            <span>
                              <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${STATUS_PILL[key]}`}>{key}</span>
                            </span>
                            <MoreHorizontal className="h-4 w-4 text-ink/40" strokeWidth={2} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* quick actions */}
              <div className={`${CARD} p-5`}>
                <p className="font-display text-base font-bold">Quick Actions</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  {QUICK.map(({ icon: Icon, tone, title, body, href }) => (
                    <Link
                      key={title}
                      href={href}
                      className="flex items-center gap-3.5 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] px-4 py-3 transition hover:border-ink/20"
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{title}</span>
                        <span className="block text-xs leading-snug text-ink/50">{body}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* right column */}
          <div className="flex flex-col gap-4">
            <div className={`${CARD} p-5`}>
              <div className="flex items-center justify-between">
                <p className="font-display text-base font-bold">Recent Activity</p>
                <ViewAll href={withProject("/activity")} />
              </div>
              {!summary || summary.recent.length === 0 ? (
                <p className="mt-4 text-sm text-ink/40">Nothing yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-ink/[0.06]">
                  {summary.recent.slice(0, 5).map((e) => {
                    const st = EVENT_STYLE[e.kind];
                    const Icon = st.icon;
                    return (
                      <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3.5 py-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${st.tone}`}>
                          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{st.title}</p>
                          <p className="truncate text-[13px] text-ink/50">
                            {e.count > 1 ? `${e.count} items, incl. ${e.project_name}` : e.kind === "file" ? e.label : e.project_name}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-ink/45">{timeAgo(e.ts)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="relative flex-1 overflow-hidden rounded-2xl bg-brand-deep p-6 text-white">
              <svg viewBox="0 0 300 260" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden>
                <path d="M120 260C170 150 230 90 300 130V260Z" fill="#0B4A33" fillOpacity="0.6" />
                <path d="M170 260C210 190 250 160 300 180V260Z" fill="#0E6B47" fillOpacity="0.5" />
                <path d="M120 260C170 150 230 90 300 130" stroke="#3DDC84" strokeOpacity="0.35" />
              </svg>
              <div className="relative">
                <p className="font-display text-[22px] font-bold leading-tight">
                  Get more from
                  <br />
                  your AI workspace.
                </p>
                <p className="mt-3 max-w-[220px] text-[13px] leading-snug text-white/70">
                  Connect your tools, add context and let all models work together on your projects.
                </p>
                <Link
                  href="/integrations"
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-white/90"
                >
                  Explore integrations <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
                </Link>
                <p className="mt-8 font-mono text-[11px] uppercase leading-relaxed tracking-[0.18em] text-white/70">
                  Same questions.
                  <br />
                  More perspective.
                  <br />
                  Better results.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
