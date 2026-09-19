"use client";

import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Flag,
  GitFork,
  Plus,
  PlusCircle,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HeroArt } from "@/components/dashboard/HeroArt";
import { ProviderLogo } from "@/components/landing/Marks";
import {
  createMilestone,
  getNextMilestone,
  getProjectStats,
  getUsageSummary,
  listActivity,
  listDecisions,
  listProjects,
  updateMilestone,
} from "@/lib/api";
import { SAMPLE_INTEGRATIONS, SAMPLE_TEAM } from "@/lib/sampleWorkspace";
import type { ActivityItem, DecisionItem, Milestone, Project, ProjectStats, UsageSummary } from "@/types";

const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";

const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";

// bar colours per provider — literal classes so Tailwind's static scan finds them
const MODEL_ROWS = [
  { provider: "openai", label: "ChatGPT", bar: "bg-[#12A150]" },
  { provider: "anthropic", label: "Claude", bar: "bg-[#F08A5D]" },
  { provider: "gemini", label: "Gemini", bar: "bg-[#8B5CF6]" },
];

function timeAgo(iso?: string): string {
  if (!iso) return "No activity yet";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
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
    <a href={href} className="flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700">
      View all <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
    </a>
  );
}

function OverviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [milestoneFormOpen, setMilestoneFormOpen] = useState(false);
  const [milestoneBusy, setMilestoneBusy] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  const project = projects.find((p) => p.id === projectId) ?? null;

  useEffect(() => {
    listProjects(DEMO_OWNER_ID)
      .then((data) => {
        setProjects(data);
        if (!projectId && data.length > 0) router.replace(`/overview?project=${data[0].id}`);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load this project's numbers, then re-check every 15s so changes made in the
  // app (chat, decisions, context) or refreshed from disk by the scanner show up
  // without a reload.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    function load(first: boolean) {
      if (first) setLoading(true);
      Promise.all([
        getProjectStats(projectId!),
        getUsageSummary(projectId!),
        listActivity(projectId!),
        listDecisions(projectId!),
        listProjects(DEMO_OWNER_ID),
        getNextMilestone(projectId!),
      ])
        .then(([s, u, a, d, p, nextMilestone]) => {
          if (cancelled) return;
          setStats(s);
          setUsage(u);
          setActivity(a);
          setDecisions(d);
          setProjects(p);
          setMilestone(nextMilestone);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled && first) setLoading(false);
        });
    }
    load(true);
    const timer = setInterval(() => load(false), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId]);

  async function saveMilestone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !milestoneTitle.trim()) return;
    setMilestoneBusy(true);
    setMilestoneError(null);
    try {
      const created = await createMilestone(projectId, milestoneTitle.trim(), milestoneDate || undefined);
      setMilestone(created);
      setMilestoneTitle("");
      setMilestoneDate("");
      setMilestoneFormOpen(false);
    } catch (error) {
      setMilestoneError(error instanceof Error ? error.message : "Could not create the milestone");
    } finally {
      setMilestoneBusy(false);
    }
  }

  async function completeMilestone() {
    if (!projectId || !milestone) return;
    setMilestoneBusy(true);
    setMilestoneError(null);
    try {
      await updateMilestone(projectId, milestone.id, { is_done: true });
      setMilestone(await getNextMilestone(projectId)); // advance immediately instead of waiting for the next 15s poll
    } catch (error) {
      setMilestoneError(error instanceof Error ? error.message : "Could not complete the milestone");
    } finally {
      setMilestoneBusy(false);
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // clipboard access denied
    }
  }

  if (projects.length === 0) {
    return (
      <main className="flex h-full items-center justify-center text-sm text-ink/40">
        No projects yet. Start one from{" "}
        <a href="/chat" className="ml-1 underline">
          Chat
        </a>
        .
      </main>
    );
  }
  if (!projectId || loading || !stats) {
    return <main className="flex h-full items-center justify-center text-sm text-ink/40">Loading…</main>;
  }

  // model usage grouped per provider from the real usage log
  const totalRequests = usage?.request_count ?? 0;
  const requestsByProvider = (usage?.by_model ?? []).reduce<Record<string, number>>((acc, m) => {
    const provider = m.model_id?.split("/")[0] ?? "unknown";
    acc[provider] = (acc[provider] ?? 0) + m.request_count;
    return acc;
  }, {});
  const modelShare = MODEL_ROWS.map((r) => ({
    ...r,
    pct: totalRequests ? Math.round(((requestsByProvider[r.provider] ?? 0) / totalRequests) * 100) : 0,
  }));

  // Real substitute for a "Project Health" score: % of conversations that
  // ended in a recorded decision, the thing this app is actually for.
  const decisionRate =
    stats.conversation_count > 0 ? Math.min(100, Math.round((stats.decisions_count / stats.conversation_count) * 100)) : 0;
  const recentlyActive = !!stats.last_activity_at && Date.now() - new Date(stats.last_activity_at).getTime() < 24 * 3600 * 1000;
  const healthChecks = [
    { done: stats.context_count > 0, label: `${stats.context_count} context item${stats.context_count === 1 ? "" : "s"} added` },
    { done: stats.conversation_count > 0, label: `${stats.conversation_count} conversation${stats.conversation_count === 1 ? "" : "s"} started` },
    { done: stats.decisions_count > 0, label: `${stats.decisions_count} decision${stats.decisions_count === 1 ? "" : "s"} recorded` },
    { done: recentlyActive, label: "Active in the last 24 hours" },
  ];

  const topTopics = Object.entries(
    decisions.reduce<Record<string, number>>((acc, d) => {
      acc[d.task_type] = (acc[d.task_type] ?? 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // newest of in-app activity and the project's modified time (file changes found by the scanner)
  const lastModified = [stats.last_activity_at, project?.updated_at]
    .filter((v): v is string => !!v)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const active = stats.conversation_count > 0;
  const latest = activity[0];
  const q = `?project=${projectId}`;

  const QUICK_ACTIONS = [
    { icon: Zap, tone: "bg-blue-50 text-blue-600", title: "New Chat", body: "Ask about this project", href: `/chat${q}` },
    { icon: FileText, tone: "bg-blue-50 text-blue-600", title: "Add Context", body: "Upload files or sync", href: `/context${q}` },
    { icon: PlusCircle, tone: "bg-violet-50 text-violet-600", title: "Create Decision", body: "Save a decision from a discussion", href: `/decisions${q}` },
  ];

  return (
    <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5">
      <div className="mx-auto max-w-[1300px] space-y-4">
        {/* hero */}
        <section className="relative flex min-h-[280px] items-stretch justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#EEF2FC] via-[#E9EEFB] to-[#DDE6F8] px-10 py-9">
          <div className="flex min-w-0 max-w-[560px] flex-col">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/50">Project overview</p>
            <h1 className="mt-3 font-display text-[44px] font-extrabold leading-none tracking-[-0.03em]">
              {project?.name}
            </h1>
            <p className="mt-4 max-w-md text-lg leading-snug text-ink/60">
              {project?.description ?? "Your projects. All models. One mind."}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-x-7 gap-y-3 pt-8">
              {[
                { icon: FileText, value: stats.context_count, label: "Files" },
                { icon: GitFork, value: stats.decisions_count, label: "Decisions" },
                { icon: Users, value: SAMPLE_TEAM.total, label: "Team members" },
                { icon: Zap, value: SAMPLE_INTEGRATIONS.length - 1, label: "Integrations" },
              ].map(({ icon: Icon, value, label }, i) => (
                <div key={label} className={`flex items-center gap-2.5 ${i > 0 ? "border-l border-ink/10 pl-7" : ""}`}>
                  <Icon className="h-5 w-5 text-ink/60" strokeWidth={1.75} />
                  <div className="leading-tight">
                    <p className="text-base font-semibold">{value}</p>
                    <p className="text-xs text-ink/55">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-end gap-6 lg:flex">
            <HeroArt name={project?.name ?? ""} />
            <p className="hidden w-[190px] shrink-0 self-start pt-4 font-display text-xl font-medium italic leading-snug text-ink/60 xl:block">
              <span className="text-3xl leading-none text-ink/40">&ldquo;</span>
              {project?.description ?? "Your projects. All models. One mind."}
              <span className="text-ink/40">&rdquo;</span>
              <span className="mt-3 block h-px w-8 bg-ink/30" />
            </p>
          </div>
        </section>

        {/* status row */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[0.85fr_0.85fr_0.85fr_1.5fr]">
          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold">Project Status</p>
            <p className="mt-3 flex items-center gap-2.5 font-display text-2xl font-bold text-emerald-600">
              <span className={`h-3 w-3 rounded-full ${active ? "bg-emerald-500" : "bg-ink/20"}`} />
              <span className={active ? "" : "text-ink/50"}>{active ? "On track" : "Getting started"}</span>
            </p>
            <p className="mt-2 text-[13px] leading-snug text-ink/50">
              {active
                ? "Active development with strong progress across core features."
                : "Add context and start a chat to get going."}
            </p>
          </div>

          <div className={`${CARD} p-5`}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-blue-500" strokeWidth={2} /> Last Activity
            </p>
            <p className="mt-3 font-display text-2xl font-bold">{timeAgo(lastModified)}</p>
            <p className="mt-2 text-[13px] leading-snug text-ink/50">
              {latest
                ? `${latest.kind === "context" ? "Context added" : "Decision recorded"}: ${latest.label}`
                : "Nothing yet."}
            </p>
          </div>

          <div className={`${CARD} p-5`}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Flag className="h-4 w-4 text-blue-500" strokeWidth={2} /> Next Milestone
            </p>
            {milestone ? (
              <>
                <p className="mt-3 font-display text-2xl font-bold">{milestone.title}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[13px] text-ink/50">
                    {milestone.target_date
                      ? new Date(`${milestone.target_date}T00:00:00`).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "No target date"}
                  </p>
                  <button
                    type="button"
                    onClick={completeMilestone}
                    disabled={milestoneBusy}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                  >
                    {milestoneBusy ? "Saving..." : "Mark done"}
                  </button>
                </div>
              </>
            ) : milestoneFormOpen ? (
              <form onSubmit={saveMilestone} className="mt-3 space-y-2.5">
                <input
                  autoFocus
                  value={milestoneTitle}
                  onChange={(event) => setMilestoneTitle(event.target.value)}
                  placeholder="Milestone name"
                  className="h-9 w-full rounded-lg border border-ink/10 px-2.5 text-sm outline-none focus:border-blue-400"
                  required
                />
                <input
                  type="date"
                  value={milestoneDate}
                  onChange={(event) => setMilestoneDate(event.target.value)}
                  className="h-9 w-full rounded-lg border border-ink/10 px-2.5 text-sm text-ink/70 outline-none focus:border-blue-400"
                />
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setMilestoneFormOpen(false)}
                    className="text-xs text-ink/50 hover:text-ink/80"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={milestoneBusy || !milestoneTitle.trim()}
                    className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {milestoneBusy ? "Adding..." : "Add milestone"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-ink/45">No milestone set yet.</p>
                <button
                  type="button"
                  onClick={() => setMilestoneFormOpen(true)}
                  className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Add milestone
                </button>
              </div>
            )}
            {milestoneError && <p className="mt-2 text-xs text-rose-600">{milestoneError}</p>}
          </div>

          <div className={`${CARD} flex items-center gap-5 p-5`}>
            <div className="min-w-0">
              <p className="whitespace-nowrap text-sm font-semibold">Project Health</p>
              <div
                className="relative mt-3 h-[76px] w-[76px] rounded-full"
                style={{ background: `conic-gradient(#12A150 ${decisionRate * 3.6}deg, #E6EAF0 0deg)` }}
                title="Conversations that ended in a recorded decision"
              >
                <div className="absolute inset-[7px] flex items-center justify-center rounded-full bg-white font-display text-xl font-bold">
                  {decisionRate}%
                </div>
              </div>
            </div>
            <ul className="flex min-w-0 flex-col gap-2">
              {healthChecks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-[13px]">
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${c.done ? "fill-emerald-500 text-white" : "text-ink/20"}`}
                    strokeWidth={2}
                  />
                  <span className={`whitespace-nowrap ${c.done ? "text-ink/70" : "text-ink/35"}`}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* main grid */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr_330px]">
          {/* recent activity */}
          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Recent Activity</p>
              <ViewAll href={`/activity${q}`} />
            </div>
            {activity.length === 0 ? (
              <p className="mt-4 text-sm text-ink/40">Nothing yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink/[0.06]">
                {activity.slice(0, 5).map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3.5 py-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        item.kind === "context" ? "bg-orange-50 text-orange-500" : "bg-violet-50 text-violet-600"
                      }`}
                    >
                      {item.kind === "context" ? (
                        <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      ) : (
                        <GitFork className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.kind === "context" ? "File updated" : "Decision created"}
                      </p>
                      <p className="truncate text-[13px] text-ink/50">{item.label}</p>
                    </div>
                    <span className="shrink-0 text-xs text-ink/45">{timeAgo(item.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* model usage + top topics */}
          <div className="flex flex-col gap-4">
            <div className={`${CARD} p-5`}>
              <div className="flex items-center justify-between">
                <p className="font-display text-base font-bold">Model Usage</p>
                <RangePill label="All time" />
              </div>
              <ul className="mt-4 flex flex-col gap-3.5">
                {modelShare.map((m) => (
                  <li key={m.provider} className="flex items-center gap-3">
                    <ProviderLogo provider={m.provider} tile className="h-7 w-7" />
                    <span className="w-14 text-sm">{m.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                      <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${m.pct}%` }} />
                    </div>
                    <span className="w-9 text-right text-sm text-ink/60">{m.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`${CARD} flex-1 p-5`}>
              <div className="flex items-center justify-between">
                <p className="font-display text-base font-bold">Top Topics</p>
                <RangePill label="All time" />
              </div>
              {topTopics.length === 0 ? (
                <p className="mt-4 text-sm text-ink/40">No decisions recorded yet.</p>
              ) : (
                <ol className="mt-3 flex flex-col">
                  {topTopics.map(([type, count], i) => (
                    <li key={type} className="flex items-center gap-3 py-2 text-sm">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-ink/[0.05] text-[11px] text-ink/50">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate capitalize">{type}</span>
                      <span className="text-ink/50">{count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* quick actions + team */}
          <div className="flex flex-col gap-4 xl:row-span-2">
            <div className={`${CARD} p-5`}>
              <p className="font-display text-base font-bold">Quick Actions</p>
              <div className="mt-3 flex flex-col gap-2.5">
                {QUICK_ACTIONS.map(({ icon: Icon, tone, title, body, href }) => (
                  <a
                    key={title}
                    href={href}
                    className="flex items-center gap-3.5 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] px-4 py-3 transition hover:border-ink/20"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="block truncate text-xs text-ink/50">{body}</span>
                    </span>
                  </a>
                ))}
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="flex items-center gap-3.5 rounded-xl border border-ink/[0.07] bg-[#FAFBFD] px-4 py-3 text-left transition hover:border-ink/20"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <UserPlus className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{linkCopied ? "Link copied!" : "Invite Team Member"}</span>
                    <span className="block truncate text-xs text-ink/50">Collaborate on this project</span>
                  </span>
                </button>
              </div>
            </div>

            <div className={`${CARD} p-5`}>
              <div className="flex items-center justify-between">
                <p className="font-display text-base font-bold">Project Team</p>
                <ViewAll href="/projects" />
              </div>
              <div className="mt-4 flex items-center gap-1.5">
                {SAMPLE_TEAM.shown.map((m) => (
                  <span
                    key={m.initials}
                    className={`-ml-0 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-ink ring-2 ring-white ${m.cls}`}
                  >
                    {m.initials}
                  </span>
                ))}
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.06] text-xs font-medium text-ink/60">
                  +{SAMPLE_TEAM.total - SAMPLE_TEAM.shown.length}
                </span>
              </div>
              <p className="mt-3 flex items-center gap-2 text-xs text-ink/55">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {SAMPLE_TEAM.total} team members
                <span className="text-ink/30">•</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {SAMPLE_TEAM.activeNow} active now
              </p>
            </div>
          </div>

          {/* integrations */}
          <div className={`${CARD} p-5 xl:col-span-2`}>
            <p className="font-display text-base font-bold">Connected Integrations</p>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
              {SAMPLE_INTEGRATIONS.map((i) => (
                <div key={i.key} className="flex items-center gap-3 rounded-xl border border-ink/[0.07] px-3.5 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.logo} alt="" className="h-9 w-9 shrink-0 object-contain" />
                  <div className="min-w-0 text-xs leading-tight">
                    <p className="text-sm font-semibold">{i.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </p>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="flex items-center gap-3 rounded-xl border border-dashed border-ink/15 px-3.5 py-3 text-left transition hover:border-ink/30"
              >
                <Plus className="h-5 w-5 shrink-0 text-ink/50" strokeWidth={1.75} />
                <span className="min-w-0 whitespace-nowrap text-xs leading-tight">
                  <span className="block text-sm font-semibold">Add integration</span>
                  <span className="mt-0.5 block text-ink/50">Connect more tools</span>
                </span>
              </button>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<main className="flex h-full items-center justify-center text-sm text-ink/40">Loading…</main>}>
      <OverviewInner />
    </Suspense>
  );
}
