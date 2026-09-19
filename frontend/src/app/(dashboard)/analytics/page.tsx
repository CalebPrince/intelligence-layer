"use client";

import { BarChart3, ChevronDown, Clock, DollarSign, FileText, Folder, GitFork, Link2, MessageSquare, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHero } from "@/components/dashboard/PageHero";
import { getAnalytics, getDashboard } from "@/lib/api";
import type { AnalyticsSummary, DashboardSummary } from "@/types";

const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";
const DAYS_WINDOW = 30;

// PLACEHOLDER shown until real usage accrues (see the merge logic in
// AnalyticsPage below — each block below is only used while its real
// counterpart from /v1/dashboard or /v1/analytics is still empty).
const MOCK_DAYS = ["Aug 20", "Aug 25", "Aug 30", "Sep 4", "Sep 9", "Sep 14", "Sep 18"];
const MOCK_SERIES = [
  { key: "openai", label: "ChatGPT", color: "#12A150", values: [280, 340, 300, 420, 460, 520, 610] },
  { key: "anthropic", label: "Claude", color: "#F08A5D", values: [180, 220, 260, 210, 300, 340, 380] },
  { key: "gemini", label: "Gemini", color: "#8B5CF6", values: [120, 150, 130, 190, 170, 230, 260] },
  { key: "other", label: "Others", color: "#94A3B8", values: [40, 60, 50, 70, 60, 90, 100] },
];
const MOCK_MODEL_SHARE = [
  { label: "ChatGPT", pct: 42, color: "#12A150" },
  { label: "Claude", pct: 28, color: "#F08A5D" },
  { label: "Gemini", pct: 20, color: "#8B5CF6" },
  { label: "Others", pct: 10, color: "#CBD2DC" },
];
const MOCK_TOP_PROJECTS = [
  { name: "PrinceCaleb.dev", tile: "bg-ink", requests: 3421, deltaLabel: "↑ 32%" },
  { name: "Haven Mobile App", tile: "bg-blue-500", requests: 2814, deltaLabel: "↑ 18%" },
  { name: "Abyshub E-commerce", tile: "bg-orange-500", requests: 1902, deltaLabel: "↑ 46%" },
  { name: "TOF Autos", tile: "bg-sky-500", requests: 1210, deltaLabel: "↑ 12%" },
  { name: "Triple P Medical", tile: "bg-rose-500", requests: 980, deltaLabel: "↓ 6%" },
];
const AGENT_PERFORMANCE = [
  { name: "Wendy", tasks: 24, successPct: 96, avgResponse: "12s" },
  { name: "Chief", tasks: 18, successPct: 91, avgResponse: "18s" },
  { name: "Chloe O'Brian", tasks: 16, successPct: 88, avgResponse: "22s" },
  { name: "Sage", tasks: 12, successPct: 84, avgResponse: "28s" },
  { name: "Maya", tasks: 10, successPct: 87, avgResponse: "25s" },
];
const MOCK_RECENT_ACTIVITY = [
  { icon: GitFork, tone: "bg-violet-50 text-violet-600", title: "New decision created", detail: "Haven Mobile App", ts: "5 min ago" },
  { icon: Folder, tone: "bg-emerald-50 text-emerald-600", title: "Context synced", detail: "PrinceCaleb.dev", ts: "18 min ago" },
  { icon: Sparkles, tone: "bg-blue-50 text-blue-600", title: "Agent completed task", detail: "Chloe O'Brian", ts: "1 hour ago" },
  { icon: FileText, tone: "bg-orange-50 text-orange-500", title: "File uploaded", detail: "api-schema.md", ts: "3 hours ago" },
  { icon: Link2, tone: "bg-blue-50 text-blue-600", title: "Integration connected", detail: "Notion", ts: "4 hours ago" },
];
const MOCK_COST_BARS = [8, 14, 10, 18, 22, 16, 24, 20, 28, 24];
const TOP_PROJECT_TILES = ["bg-ink", "bg-blue-500", "bg-orange-500", "bg-sky-500", "bg-rose-500"];
const EVENT_STYLE = {
  context_synced: { icon: Folder, tone: "bg-emerald-50 text-emerald-600", title: "Context synced" },
  file: { icon: FileText, tone: "bg-orange-50 text-orange-500", title: "File uploaded" },
  decision: { icon: GitFork, tone: "bg-violet-50 text-violet-600", title: "Decision created" },
  project: { icon: Sparkles, tone: "bg-blue-50 text-blue-600", title: "New project created" },
} as const;

// deterministic pseudo-activity so the heatmap has something to show before real usage exists
function mockHeatValue(row: number, col: number): number {
  const v = Math.sin(row * 1.7 + col * 0.6) * 0.5 + Math.sin(col * 0.3) * 0.5 + 1;
  return Math.max(0, Math.min(4, Math.round((v / 2) * 4)));
}
const MOCK_HEATMAP = Array.from({ length: 7 }, (_, r) => Array.from({ length: 24 }, (_, c) => mockHeatValue(r, c)));
const HEAT_COLORS = ["bg-emerald-50", "bg-emerald-100", "bg-emerald-300", "bg-emerald-500", "bg-emerald-700"];
const HEAT_ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = ["12am", "4am", "8am", "12pm", "4pm", "8pm"];

function pctDelta(cur: number, prev: number): number | null {
  if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
  return cur > 0 ? null : null; // no prior period to compare against — omit rather than fabricate
}

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function timeAgo(iso?: string | number | null): string {
  if (!iso) return "";
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(String(iso))) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function RangePill() {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-2.5 py-1 text-xs text-ink/60">
      Last 30 days <ChevronDown className="h-3 w-3" strokeWidth={2} />
    </span>
  );
}

function StatTile({
  icon,
  tone,
  value,
  label,
  deltaPct,
}: {
  icon: React.ReactNode;
  tone: string;
  value: React.ReactNode;
  label: string;
  deltaPct?: number | null;
}) {
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
        <p className="text-[13px] text-ink/60">{label}</p>
      </div>
      <p className="mt-3 font-display text-[26px] font-bold leading-none">{value}</p>
      {deltaPct != null && (
        <p className={`mt-1.5 text-xs font-medium ${deltaPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {deltaPct >= 0 ? "↑" : "↓"} {Math.abs(deltaPct)}% vs previous period
        </p>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([getDashboard(DEMO_OWNER_ID, DAYS_WINDOW), getAnalytics(DEMO_OWNER_ID, DAYS_WINDOW)])
        .then(([d, a]) => {
          if (cancelled) return;
          setDashboard(d);
          setAnalytics(a);
        })
        .catch(() => {});
    }
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const totalRequests = analytics?.total_requests ?? 0;
  const usingRealRequests = totalRequests > 0;
  const requestsDelta = analytics ? pctDelta(analytics.total_requests, analytics.requests_prev_period) : null;

  const decisionsPeriod = analytics?.decisions_period ?? 0;
  const decisionsDelta = analytics ? pctDelta(analytics.decisions_period, analytics.decisions_prev_period) : null;

  const usageByProvider = dashboard?.usage.by_provider;
  const usingRealModelShare = !!usageByProvider && Object.values(usageByProvider).some((n) => n > 0);
  const modelShare = useMemo(() => {
    if (!usingRealModelShare || !usageByProvider) return MOCK_MODEL_SHARE;
    const total = Object.values(usageByProvider).reduce((a, b) => a + b, 0) || 1;
    const meta: Record<string, { label: string; color: string }> = {
      openai: { label: "ChatGPT", color: "#12A150" },
      anthropic: { label: "Claude", color: "#F08A5D" },
      gemini: { label: "Gemini", color: "#8B5CF6" },
      other: { label: "Others", color: "#CBD2DC" },
    };
    return Object.entries(meta).map(([key, m]) => ({
      label: m.label,
      color: m.color,
      pct: Math.round(((usageByProvider[key] ?? 0) / total) * 100),
    }));
  }, [usingRealModelShare, usageByProvider]);
  const donutTotal = usingRealModelShare ? dashboard!.usage.total_requests : 12482;

  const usingRealUsageSeries = !!analytics && analytics.usage_by_day.some((d) => d.openai + d.anthropic + d.gemini + d.other > 0);
  const chartDays = usingRealUsageSeries ? analytics!.usage_by_day.map((d) => formatDay(d.date)) : MOCK_DAYS;
  const chartSeries = usingRealUsageSeries
    ? [
        { key: "openai", label: "ChatGPT", color: "#12A150", values: analytics!.usage_by_day.map((d) => d.openai) },
        { key: "anthropic", label: "Claude", color: "#F08A5D", values: analytics!.usage_by_day.map((d) => d.anthropic) },
        { key: "gemini", label: "Gemini", color: "#8B5CF6", values: analytics!.usage_by_day.map((d) => d.gemini) },
        { key: "other", label: "Others", color: "#94A3B8", values: analytics!.usage_by_day.map((d) => d.other) },
      ]
    : MOCK_SERIES;
  const chartMax = Math.max(1000, ...chartSeries.flatMap((s) => s.values)) || 1000;
  const tickStep = Math.ceil(chartMax / 4 / 100) * 100 || 250;
  const chartTicks = [4, 3, 2, 1, 0].map((i) => tickStep * i);
  // thin x-axis labels so a 30-day real series doesn't overlap
  const labelEvery = Math.max(1, Math.ceil(chartDays.length / 7));

  const usingRealTopProjects = !!analytics && analytics.top_projects.length > 0;
  const topProjects = usingRealTopProjects
    ? analytics!.top_projects.map((p, i) => ({ name: p.name, tile: TOP_PROJECT_TILES[i % TOP_PROJECT_TILES.length], requests: p.requests, deltaLabel: null as string | null }))
    : MOCK_TOP_PROJECTS;

  const usingRealCost = !!analytics && analytics.total_cost_usd > 0;
  const costBars = useMemo(() => {
    if (!usingRealCost || !analytics) return MOCK_COST_BARS;
    const values = analytics.cost_by_day.map((d) => d.cost_usd);
    if (values.length <= 12) return values;
    // downsample into ~10 buckets so 30 real days still reads as a sparkline
    const bucketSize = Math.ceil(values.length / 10);
    const bucketed: number[] = [];
    for (let i = 0; i < values.length; i += bucketSize) {
      bucketed.push(values.slice(i, i + bucketSize).reduce((a, b) => a + b, 0));
    }
    return bucketed;
  }, [usingRealCost, analytics]);
  const costBarMax = Math.max(1, ...costBars);

  const usingRealHeatmap = !!analytics && analytics.heatmap.some((row) => row.some((n) => n > 0));
  const heatmap = useMemo(() => {
    if (!usingRealHeatmap || !analytics) return MOCK_HEATMAP;
    const max = Math.max(1, ...analytics.heatmap.flat());
    return analytics.heatmap.map((row) => row.map((n) => Math.min(4, Math.round((n / max) * 4))));
  }, [usingRealHeatmap, analytics]);

  const usingRealRecent = !!dashboard && dashboard.recent.length > 0;
  const recentActivity = usingRealRecent ? dashboard!.recent.slice(0, 5) : [];

  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5">
      <div className="mx-auto max-w-[1300px] space-y-4">
        <PageHero
          eyebrow="Analytics"
          title={
            <>
              Insights that <span className="text-brand">move you forward.</span>
            </>
          }
          description="Track usage, performance and outcomes across all your projects, models and agents."
          icon={<BarChart3 className="h-7 w-7" strokeWidth={1.75} />}
          bannerTitle="Turn activity into impact."
          bannerBody="See what's working, where to improve, and how your AI tools are creating value."
        />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={<MessageSquare className="h-5 w-5" strokeWidth={1.75} />}
            tone="bg-emerald-50 text-emerald-600"
            value={(usingRealRequests ? totalRequests : 12482).toLocaleString()}
            label="Total Requests"
            deltaPct={usingRealRequests ? requestsDelta : 28}
          />
          <StatTile
            icon={<Clock className="h-5 w-5" strokeWidth={1.75} />}
            tone="bg-blue-50 text-blue-600"
            value={analytics && analytics.active_projects > 0 ? analytics.active_projects : 18}
            label="Active Projects"
            deltaPct={analytics && analytics.active_projects > 0 ? null : 20}
          />
          <StatTile icon={<Users className="h-5 w-5" strokeWidth={1.75} />} tone="bg-violet-50 text-violet-600" value={6} label="Active Agents" deltaPct={50} />
          <StatTile
            icon={<FileText className="h-5 w-5" strokeWidth={1.75} />}
            tone="bg-orange-50 text-orange-500"
            value={decisionsPeriod > 0 ? decisionsPeriod : 68}
            label="Decisions Created"
            deltaPct={decisionsPeriod > 0 ? decisionsDelta : 35}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
          {/* usage over time */}
          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Usage Over Time</p>
              <RangePill />
            </div>
            <div className="mt-4 flex gap-3">
              <div className="flex h-[150px] flex-col justify-between pb-5 text-right text-[11px] text-ink/45">
                {chartTicks.map((v) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {(() => {
                  const chartW = 640;
                  const chartH = 150;
                  const x = (i: number) => (chartDays.length <= 1 ? 0 : (i / (chartDays.length - 1)) * chartW);
                  const y = (v: number) => chartH - (v / chartMax) * chartH;
                  return (
                    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="h-[150px] w-full overflow-visible" preserveAspectRatio="none">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <line key={i} x1={0} x2={chartW} y1={(chartH / 4) * i} y2={(chartH / 4) * i} stroke="#E9EDF3" strokeWidth={1} />
                      ))}
                      {(() => {
                        const top = chartSeries[0];
                        const pts = top.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
                        return <polygon points={`0,${chartH} ${pts} ${chartW},${chartH}`} fill={top.color} fillOpacity={0.1} />;
                      })()}
                      {chartSeries.map((s) => (
                        <polyline
                          key={s.key}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={2.25}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                        />
                      ))}
                    </svg>
                  );
                })()}
                <div className="mt-1.5 flex justify-between text-[11px] text-ink/50">
                  {chartDays.map((d, i) => (
                    <span key={`${d}-${i}`}>{i % labelEvery === 0 ? d : ""}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-5 text-xs text-ink/60">
              {chartSeries.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* model usage */}
          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Model Usage</p>
              <RangePill />
            </div>
            <div className="mt-4 flex items-center gap-5">
              <div className="relative h-[150px] w-[150px] shrink-0">
                <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90">
                  <circle cx="75" cy="75" r={R} fill="none" stroke="#E9EDF3" strokeWidth="16" />
                  {modelShare.map((s) => {
                    const len = (s.pct / 100) * C;
                    const el = (
                      <circle key={s.label} cx="75" cy="75" r={R} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-offset} />
                    );
                    offset += len;
                    return el;
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-2xl font-bold">{donutTotal.toLocaleString()}</span>
                  <span className="text-[11px] text-ink/50">Total requests</span>
                </div>
              </div>
              <ul className="flex flex-1 flex-col gap-3">
                {modelShare.map((s) => (
                  <li key={s.label} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1">{s.label}</span>
                    <span className="text-ink/60">{s.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* agent performance — illustrative: no per-agent task log exists yet */}
          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Agent Performance</p>
              <button className="text-[13px] font-medium text-blue-600 hover:text-blue-700">View all</button>
            </div>
            <table className="mt-3 w-full text-left text-[13px]">
              <thead>
                <tr className="text-xs text-ink/50">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Tasks</th>
                  <th className="pb-2 font-medium">Success Rate</th>
                  <th className="pb-2 text-right font-medium">Avg. Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06]">
                {AGENT_PERFORMANCE.map((a) => (
                  <tr key={a.name}>
                    <td className="py-2.5 font-medium">{a.name}</td>
                    <td className="py-2.5 text-ink/60">{a.tasks}</td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/[0.08]">
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${a.successPct}%` }} />
                        </span>
                        <span className="text-xs text-ink/55">{a.successPct}%</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-ink/60">{a.avgResponse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* activity heatmap */}
          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Activity Heatmap</p>
              <RangePill />
            </div>
            <div className="mt-4 flex gap-2">
              <div className="flex flex-col justify-between gap-[3px] pb-4 text-[10px] text-ink/45">
                {HEAT_ROWS.map((d) => (
                  <span key={d} className="h-[13px] leading-[13px]">{d}</span>
                ))}
              </div>
              <div className="flex-1">
                <div className="flex flex-col gap-[3px]">
                  {heatmap.map((row, r) => (
                    <div key={r} className="flex gap-[3px]">
                      {row.map((v, c) => (
                        <span key={c} className={`h-[13px] flex-1 rounded-[2px] ${HEAT_COLORS[v]}`} />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-ink/45">
                  {HOUR_LABELS.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-ink/45">
              Less activity
              {HEAT_COLORS.map((c) => (
                <span key={c} className={`h-2.5 w-2.5 rounded-[2px] ${c}`} />
              ))}
              More activity
            </div>
          </div>

          {/* recent activity */}
          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Recent Activity</p>
              <button className="text-[13px] font-medium text-blue-600 hover:text-blue-700">View all</button>
            </div>
            {usingRealRecent ? (
              <ul className="mt-3 divide-y divide-ink/[0.06]">
                {recentActivity.map((e) => {
                  const st = EVENT_STYLE[e.kind];
                  const Icon = st.icon;
                  return (
                    <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 py-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${st.tone}`}>
                        <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{st.title}</p>
                        <p className="truncate text-[13px] text-ink/50">{e.count > 1 ? `${e.count} items, incl. ${e.project_name}` : e.project_name}</p>
                      </div>
                      <span className="shrink-0 text-xs text-ink/45">{timeAgo(e.ts)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="mt-3 divide-y divide-ink/[0.06]">
                {MOCK_RECENT_ACTIVITY.map((e, i) => {
                  const Icon = e.icon;
                  return (
                    <li key={i} className="flex items-center gap-3 py-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${e.tone}`}>
                        <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.title}</p>
                        <p className="truncate text-[13px] text-ink/50">{e.detail}</p>
                      </div>
                      <span className="shrink-0 text-xs text-ink/45">{e.ts}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
          {/* top projects */}
          <div className={`${CARD} p-5 lg:col-span-1`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Top Projects</p>
              <button className="text-[13px] font-medium text-blue-600 hover:text-blue-700">View all</button>
            </div>
            <ul className="mt-3 divide-y divide-ink/[0.06]">
              {topProjects.map((p) => (
                <li key={p.name} className="flex items-center gap-3 py-2.5">
                  <span className={`h-8 w-8 shrink-0 rounded-lg ${p.tile}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-ink/50">{p.requests.toLocaleString()} requests</p>
                  </div>
                  {p.deltaLabel && (
                    <span className={`shrink-0 text-xs font-medium ${p.deltaLabel.startsWith("↑") ? "text-emerald-600" : "text-red-500"}`}>{p.deltaLabel}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* cost tracking */}
          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Cost Tracking</p>
              <RangePill />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <DollarSign className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <p className="font-display text-2xl font-bold leading-none">${(usingRealCost ? analytics!.total_cost_usd : 24.8).toFixed(2)}</p>
                <p className="mt-1 text-xs text-ink/55">Total API cost</p>
              </div>
              {!usingRealCost && <span className="ml-auto text-xs font-medium text-emerald-600">↓ 18% vs last month</span>}
            </div>
            <div className="mt-4 flex h-16 items-end gap-1.5">
              {costBars.map((v, i) => (
                <span key={i} className="flex-1 rounded-t-sm bg-emerald-400" style={{ height: `${Math.max(4, (v / costBarMax) * 100)}%` }} />
              ))}
            </div>
          </div>

          {/* time saved — illustrative: not a tracked metric */}
          <div className={`${CARD} p-5`}>
            <p className="font-display text-base font-bold">Time Saved</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Clock className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <p className="font-display text-2xl font-bold leading-none">42 hours</p>
                <p className="mt-1 text-xs text-ink/55">Estimated time saved</p>
              </div>
            </div>
            <p className="mt-3 text-xs font-medium text-emerald-600">↑ 65% vs last month</p>
            <div className="mt-4 rounded-xl bg-violet-50 p-4 text-[13px] leading-relaxed text-violet-800">
              More insights. Greater impact. Keep building, the data shows you&rsquo;re making progress.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
