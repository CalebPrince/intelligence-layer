"use client";

import {
  Asterisk,
  CheckCircle,
  ChevronDown,
  Cog,
  Compass,
  CreditCard,
  Feather,
  FolderCog,
  Grid3x3,
  Key,
  LayoutList,
  Loader2,
  MessageCircle,
  MoreVertical,
  Plus,
  Radar,
  ScrollText,
  Send,
  Sparkles,
  UserCog,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHero } from "@/components/dashboard/PageHero";
import { agentChat, draftProposal, getAgentHistory, listProjects, recordDecision, sageChat } from "@/lib/api";
import type { ProposalDraft } from "@/lib/api";

const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";
const SHARED_MEMORY_KEY = "prince-caleb";

const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";

type Status = "Active" | "Idle" | "Offline";

interface AgentCard {
  key: string;
  name: string;
  role: string;
  status: Status;
  description: string;
  tags: string[];
  tasks: number;
  activity: string;
  icon: typeof Asterisk;
  tile: string;
  /** Sage uses the public memory-backed route; chatKey entries use the
   * authenticated prince-web-app admin chat adapter. */
  live?: boolean;
  chatKey?: string;
}

// PLACEHOLDER roster until agents have a real backend (status, tasks and
// activity are illustrative — see Analytics and Chat for the real per-model
// numbers this will eventually be replaced with). Sage is the one exception:
// `live: true` really talks to princecaleb.dev's own Sage agent, with real
// shared memory — see the README's "Known gaps" for the plan to extend this.
const AGENTS: AgentCard[] = [
  { key: "wendy", name: "Wendy", role: "System Observer", status: "Active", icon: Asterisk, tile: "from-violet-400 to-fuchsia-500", tasks: 12, activity: "Online now", chatKey: "wendy", description: "Oversees all agents, monitors system health and watches over operations (including you).", tags: ["Monitoring", "Reporting", "Oversight"] },
  { key: "chief", name: "Chief", role: "Operations Manager", status: "Active", icon: Cog, tile: "from-amber-300 to-orange-500", tasks: 18, activity: "Online now", chatKey: "chief", description: "Coordinates agents, manages tasks and provides daily reports.", tags: ["Coordination", "Planning", "Reporting"] },
  { key: "chloe", name: "Chloe O'Brian", role: "Error Log Monitor", status: "Active", icon: Radar, tile: "from-teal-300 to-emerald-600", tasks: 9, activity: "Online now", chatKey: "chloe", description: "Monitors error logs, detects issues and alerts on anomalies.", tags: ["Monitoring", "Alerts", "Debugging"] },
  { key: "sage", name: "Sage", role: "Marketing Frameworks Specialist", status: "Active", icon: Compass, tile: "from-sky-300 to-blue-600", tasks: 14, activity: "Online now", live: true, description: "The real Sage from princecaleb.dev — works through a marketing problem via Hormozi, Brunson, Ogilvy, Cialdini and Godin. Genuinely remembers this conversation.", tags: ["Marketing Frameworks", "Live"] },
  { key: "leo", name: "Leo", role: "Research Analyst", status: "Idle", icon: ScrollText, tile: "from-indigo-300 to-blue-700", tasks: 6, activity: "Last active 1h ago", description: "Conducts research, analyzes information and provides insights.", tags: ["Research", "Analysis", "Summaries"] },
  { key: "maya", name: "Maya", role: "Project Assistant", status: "Active", icon: FolderCog, tile: "from-rose-300 to-pink-600", tasks: 11, activity: "Online now", description: "Helps manage project tasks, files and documentation.", tags: ["Tasks", "Files", "Organization"] },
  { key: "kai", name: "Kai", role: "Automation Builder", status: "Offline", icon: Wand2, tile: "from-slate-400 to-slate-700", tasks: 4, activity: "Last active 5h ago", description: "Designs and implements automation workflows and integrations.", tags: ["Automation", "Integrations", "Tools"] },
  { key: "lisa", name: "Lisa", role: "Executive Assistant", status: "Idle", icon: UserCog, tile: "from-cyan-300 to-blue-600", tasks: 0, activity: "Ready when connected", chatKey: "lisa", description: "Organizes conversations, follow-ups and executive support work.", tags: ["Assistant", "Planning", "Follow-up"] },
  { key: "content", name: "Content", role: "Content Strategist", status: "Idle", icon: Feather, tile: "from-fuchsia-300 to-violet-600", tasks: 0, activity: "Ready when connected", chatKey: "content", description: "Shapes content ideas, drafts and publishing direction.", tags: ["Content", "Writing", "Strategy"] },
  { key: "beacon", name: "Beacon", role: "Lead Researcher", status: "Idle", icon: Radar, tile: "from-lime-300 to-emerald-600", tasks: 0, activity: "Ready when connected", chatKey: "beacon", description: "Finds and qualifies opportunities for the studio pipeline.", tags: ["Leads", "Research", "Qualification"] },
  { key: "dossier", name: "Dossier", role: "Research Analyst", status: "Idle", icon: ScrollText, tile: "from-slate-300 to-indigo-600", tasks: 0, activity: "Ready when connected", chatKey: "dossier", description: "Builds structured research briefs from available information.", tags: ["Research", "Briefs", "Analysis"] },
  { key: "nurturer", name: "Nurturer", role: "Client Follow-up", status: "Idle", icon: MessageCircle, tile: "from-pink-300 to-rose-600", tasks: 0, activity: "Ready when connected", chatKey: "nurturer", description: "Helps prepare thoughtful follow-up for leads and clients.", tags: ["Outreach", "Clients", "Messaging"] },
  { key: "proposal", name: "Proposal", role: "Proposal Specialist", status: "Idle", icon: FolderCog, tile: "from-amber-300 to-yellow-600", tasks: 0, activity: "Ready when connected", chatKey: "proposal", description: "Drafts proposal work and helps move opportunities forward.", tags: ["Proposals", "Sales", "Drafting"] },
  { key: "arch", name: "Arch", role: "Architecture Advisor", status: "Idle", icon: Cog, tile: "from-stone-300 to-stone-700", tasks: 0, activity: "Ready when connected", chatKey: "arch", description: "Thinks through systems, structure and technical tradeoffs.", tags: ["Architecture", "Systems", "Technical"] },
  { key: "ada", name: "Ada", role: "Invoice Assistant", status: "Idle", icon: CreditCard, tile: "from-emerald-300 to-teal-600", tasks: 0, activity: "Ready when connected", chatKey: "ada", description: "Assists with invoice preparation and client billing workflows.", tags: ["Invoices", "Billing", "Clients"] },
  { key: "sketch", name: "Sketch", role: "Creative Planner", status: "Idle", icon: Wand2, tile: "from-orange-300 to-red-500", tasks: 0, activity: "Ready when connected", chatKey: "sketch", description: "Turns loose ideas into creative directions and concepts.", tags: ["Creative", "Ideas", "Planning"] },
  { key: "scout", name: "Scout", role: "Opportunity Scout", status: "Idle", icon: Compass, tile: "from-blue-300 to-cyan-600", tasks: 0, activity: "Ready when connected", chatKey: "scout", description: "Surfaces useful opportunities, signals and next steps.", tags: ["Research", "Opportunities", "Signals"] },
  { key: "radar", name: "Radar", role: "Social Monitor", status: "Idle", icon: Radar, tile: "from-red-300 to-orange-600", tasks: 0, activity: "Ready when connected", chatKey: "radar", description: "Watches for conversations and signals worth responding to.", tags: ["Monitoring", "Social", "Alerts"] },
  { key: "reel", name: "Reel", role: "Video Strategist", status: "Idle", icon: Sparkles, tile: "from-violet-300 to-purple-700", tasks: 0, activity: "Ready when connected", chatKey: "reel", description: "Develops video concepts, scripts and production direction.", tags: ["Video", "Scripts", "Creative"] },
  { key: "allie", name: "Allie", role: "Quality Reviewer", status: "Idle", icon: CheckCircle, tile: "from-teal-300 to-cyan-700", tasks: 0, activity: "Ready when connected", chatKey: "allie", description: "Reviews work for quality, clarity and readiness to ship.", tags: ["Review", "Quality", "Feedback"] },
];

const STATUS_DOT: Record<Status, string> = { Active: "bg-emerald-500", Idle: "bg-amber-400", Offline: "bg-ink/30" };
const STATUS_PILL: Record<Status, string> = { Active: "bg-emerald-50 text-emerald-600", Idle: "bg-amber-50 text-amber-600", Offline: "bg-ink/[0.06] text-ink/50" };

const ACTIVITY = [
  { agent: "Wendy", tile: "from-violet-400 to-fuchsia-500", icon: Asterisk, action: "Generated daily report", ts: "5 min ago" },
  { agent: "Chloe O'Brian", tile: "from-teal-300 to-emerald-600", icon: Radar, action: "Checked error logs", ts: "12 min ago" },
  { agent: "Sage", tile: "from-sky-300 to-blue-600", icon: Compass, action: "Published YouTube script", ts: "1 hour ago" },
  { agent: "Chief", tile: "from-amber-300 to-orange-500", icon: Cog, action: "Assigned new tasks", ts: "2 hours ago" },
  { agent: "Maya", tile: "from-rose-300 to-pink-600", icon: FolderCog, action: "Synced project files", ts: "3 hours ago" },
];

const QUICK = [
  { icon: Plus, title: "Create a new agent", body: "Set up a custom agent" },
  { icon: UserCog, title: "Assign to project", body: "Connect an agent to a project" },
  { icon: ScrollText, title: "View agent logs", body: "See activity and performance" },
  { icon: Key, title: "Configure permissions", body: "Set access and capabilities" },
];

function StatTile({ icon, tone, value, label, foot }: { icon: React.ReactNode; tone: string; value: React.ReactNode; label: string; foot: React.ReactNode }) {
  return (
    <div className={`${CARD} flex items-center gap-4 p-5`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="font-display text-[26px] font-bold leading-tight">{value}</p>
        <p className="text-[13px] text-ink/60">{label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/55">{foot}</p>
      </div>
    </div>
  );
}

function SelectBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <select className="h-10 appearance-none rounded-xl border border-ink/10 bg-white pl-3.5 pr-9 text-sm text-ink/80 outline-none focus:border-ink/30">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" strokeWidth={2} />
    </div>
  );
}

export default function AgentsPage() {
  const [tab, setTab] = useState<"All Agents" | Status | "Custom">("All Agents");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sageOpen, setSageOpen] = useState(false);
  const [chatAgent, setChatAgent] = useState<AgentCard | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    listProjects(DEMO_OWNER_ID)
      .then((projects) => setProjectId(projects[0]?.id ?? null))
      .catch(() => setProjectId(null));
  }, []);

  const visible = useMemo(() => (tab === "All Agents" || tab === "Custom" ? AGENTS : AGENTS.filter((a) => a.status === tab)), [tab]);
  const activeCount = AGENTS.filter((a) => a.status === "Active").length;

  return (
    <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5">
      <div className="mx-auto max-w-[1300px] space-y-4">
        <PageHero
          eyebrow="Agents"
          title={
            <>
              Your <span className="text-brand">AI Team</span>
            </>
          }
          description="Deploy and manage your AI agents. Give them roles, connect them to your projects, and let them work together."
          icon={<Users className="h-7 w-7" strokeWidth={1.75} />}
          bannerTitle={
            <>
              Agents that work for you.
              <br />
              Around the clock.
            </>
          }
          bannerBody="Specialized AI agents, working together to help you move faster."
        />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={<Users className="h-6 w-6" strokeWidth={1.75} />} tone="bg-blue-50 text-blue-600" value={activeCount} label="Active Agents" foot={<>2 this month</>} />
          <StatTile icon={<Sparkles className="h-6 w-6" strokeWidth={1.75} />} tone="bg-emerald-50 text-emerald-600" value={24} label="Tasks Completed" foot={<>56% vs last month</>} />
          <StatTile icon={<Cog className="h-6 w-6" strokeWidth={1.75} />} tone="bg-blue-50 text-blue-600" value={12} label="Running Now" foot={<><span className="h-2 w-2 rounded-full bg-emerald-500" /> All systems operational</>} />
          <StatTile icon={<Sparkles className="h-6 w-6" strokeWidth={1.75} />} tone="bg-violet-50 text-violet-600" value="98%" label="Success Rate" foot={<>4% vs last month</>} />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-xl border border-ink/10 bg-white p-1">
                {(["All Agents", "Active", "Idle", "Offline", "Custom"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${tab === k ? "bg-blue-600 text-white" : "text-ink/60 hover:text-ink"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <SelectBox>
                  <option>All Roles</option>
                </SelectBox>
                <SelectBox>
                  <option>All Projects</option>
                </SelectBox>
                <div className="flex items-center gap-1 rounded-xl border border-ink/10 bg-white p-1">
                  <button onClick={() => setView("grid")} aria-label="Grid view" className={`rounded-lg p-2 ${view === "grid" ? "bg-blue-50 text-blue-600" : "text-ink/45 hover:text-ink"}`}>
                    <Grid3x3 className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button onClick={() => setView("list")} aria-label="List view" className={`rounded-lg p-2 ${view === "list" ? "bg-blue-50 text-blue-600" : "text-ink/45 hover:text-ink"}`}>
                    <LayoutList className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>

            <div className={view === "grid" ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-3"}>
              {visible.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.key} className={`${CARD} p-5`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white ${a.tile}`}>
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{a.name}</p>
                        <p className="truncate text-[13px] text-ink/50">{a.role}</p>
                      </div>
                      <button aria-label="Agent options" className="shrink-0 rounded p-1 text-ink/35 hover:text-ink">
                        <MoreVertical className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                    <span className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_PILL[a.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[a.status]}`} />
                        {a.status}
                      </span>
                      {a.live && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Live agent
                        </span>
                      )}
                      {a.chatKey && !a.live && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-ink/[0.06] px-2 py-0.5 text-xs font-medium text-ink/60">
                          Admin agent
                        </span>
                      )}
                      {!a.live && !a.chatKey && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                          Planned integration
                        </span>
                      )}
                    </span>
                    <p className="mt-2.5 text-[13px] leading-relaxed text-ink/60">{a.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {a.tags.map((t) => (
                        <span key={t} className="rounded-md bg-ink/[0.05] px-2 py-0.5 text-xs text-ink/60">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-ink/50">
                      <span>{a.tasks} tasks</span>
                      <span>·</span>
                      <span>{a.activity}</span>
                    </div>
                    {a.live && (
                      <button
                        onClick={() => setSageOpen(true)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-[13px] font-semibold text-white hover:bg-blue-700"
                      >
                        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} /> Chat with Sage
                      </button>
                    )}
                    {a.chatKey && (
                      <button
                        onClick={() => setChatAgent(a)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink py-2 text-[13px] font-semibold text-white hover:bg-ink/90"
                      >
                        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} /> Chat with {a.name}
                      </button>
                    )}
                    {a.chatKey === "proposal" && (
                      <button
                        onClick={() => setProposalOpen(true)}
                        className="mt-2 flex w-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50 py-2 text-[13px] font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        Draft a proposal
                      </button>
                    )}
                  </div>
                );
              })}

              <div className={`${CARD} flex flex-col items-center justify-center gap-3 p-6 text-center`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white">
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div>
                  <p className="font-display text-[15px] font-bold">Create New Agent</p>
                  <p className="mt-1 text-[13px] leading-snug text-ink/55">Set up a new agent with a custom role, capabilities and access.</p>
                </div>
                <button className="mt-1 flex items-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 text-[13px] font-medium hover:border-ink/30">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Create Agent
                </button>
              </div>

              <div className={`${CARD} flex flex-col items-center justify-center gap-3 p-6 text-center`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/[0.06] text-ink/60">
                  <Feather className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                  <p className="font-display text-[15px] font-bold">Agent Templates</p>
                  <p className="mt-1 text-[13px] leading-snug text-ink/55">Start from a template to quickly deploy a new agent.</p>
                </div>
                <button className="mt-1 rounded-lg border border-ink/15 px-4 py-2 text-[13px] font-medium hover:border-ink/30">Browse Templates</button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className={`${CARD} p-5`}>
              <div className="flex items-center justify-between">
                <p className="font-display text-base font-bold">Agent Activity</p>
                <button className="text-[13px] font-medium text-blue-600 hover:text-blue-700">View all</button>
              </div>
              <ul className="mt-3 divide-y divide-ink/[0.06]">
                {ACTIVITY.map((e, i) => {
                  const Icon = e.icon;
                  return (
                    <li key={i} className="flex items-center gap-3 py-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white ${e.tile}`}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{e.agent}</p>
                        <p className="truncate text-xs text-ink/50">{e.action}</p>
                      </div>
                      <span className="shrink-0 text-xs text-ink/45">{e.ts}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={`${CARD} p-5`}>
              <p className="font-display text-base font-bold">Quick Actions</p>
              <div className="mt-3 flex flex-col gap-2.5">
                {QUICK.map(({ icon: Icon, title, body }) => (
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

            <div className="relative overflow-hidden rounded-2xl bg-[#EEF0FF] p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
                  <Sparkles className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                  <p className="font-display text-[15px] font-bold">More capable together.</p>
                  <p className="mt-1 text-[13px] leading-snug text-ink/60">
                    Your agents can collaborate, share context and use any model from Inteli-Space.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {sageOpen && projectId && <SageChatModal projectId={projectId} onClose={() => setSageOpen(false)} />}
      {chatAgent && projectId && chatAgent.chatKey && (
        <AgentChatModal agent={chatAgent} projectId={projectId} onClose={() => setChatAgent(null)} />
      )}
      {proposalOpen && <ProposalDraftModal onClose={() => setProposalOpen(false)} />}
    </main>
  );
}

function ProposalDraftModal({ onClose }: { onClose: () => void }) {
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!brief.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setDraft(await draftProposal(brief.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft proposal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5" role="dialog" aria-modal="true" aria-labelledby="proposal-draft-title">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-ink/[0.07] px-5 py-4">
          <div><p id="proposal-draft-title" className="font-display text-lg font-bold">Draft a proposal</p><p className="mt-1 text-[13px] text-ink/55">Proposal will be generated for review only. Nothing is saved or sent.</p></div>
          <button onClick={onClose} className="text-sm text-ink/45 hover:text-ink">Close</button>
        </div>
        {!draft ? (
          <form onSubmit={generate} className="p-5">
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={6} placeholder="Describe the client, project scope, budget, and timeline in plain language..." className="w-full resize-y rounded-xl border border-ink/12 p-3 text-sm outline-none focus:border-blue-400" />
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end"><button type="submit" disabled={loading || !brief.trim()} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "Drafting..." : "Generate draft"}</button></div>
          </form>
        ) : (
          <div className="overflow-y-auto p-5">
            <div className="rounded-xl border border-ink/[0.08] bg-[#FAFBFD] p-4"><p className="font-display text-lg font-bold">{draft.title}</p><p className="mt-1 text-sm text-ink/60">{draft.client_name} · {draft.client_email} · {draft.currency}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">{draft.scope}</p><p className="mt-4 text-sm"><strong>Timeline:</strong> {draft.timeline}</p><p className="mt-2 text-sm"><strong>Terms:</strong> {draft.terms}</p><div className="mt-4"><p className="text-sm font-semibold">Milestones</p><ul className="mt-2 space-y-1 text-sm text-ink/70">{draft.milestones.map((milestone) => <li key={milestone.title}>{milestone.title}: {milestone.amount} ({milestone.due_note})</li>)}</ul></div></div>
            <p className="mt-3 text-xs text-ink/45">This draft is not stored or sent. Open the Proposals page to create it manually after review.</p>
            <div className="mt-4 flex justify-end"><button onClick={onClose} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Done</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SageTurn {
  id: string;
  prompt: string;
  reply: string;
  responseId: string;
  accepted?: boolean;
}

interface AgentTurn extends SageTurn {}

function AgentChatModal({ agent, projectId, onClose }: { agent: AgentCard; projectId: string; onClose: () => void }) {
  const AgentIcon = agent.icon;
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, loading]);

  useEffect(() => {
    if (!agent.chatKey) return;
    getAgentHistory(projectId, agent.chatKey)
      .then((history) => {
        setConversationId(history.conversation_id ?? undefined);
        setTurns(history.turns.map((turn) => ({ id: turn.message_id, prompt: turn.prompt, reply: turn.reply, responseId: turn.response_id })));
      })
      .catch(() => {
        // A missing history should not prevent starting a new conversation.
      });
  }, [agent.chatKey, projectId]);

  async function send() {
    const message = input.trim();
    if (!message || loading || !agent.chatKey) return;
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const result = await agentChat(
        projectId,
        agent.chatKey,
        message,
        [],
        conversationId,
        SHARED_MEMORY_KEY,
        DEMO_OWNER_ID
      );
      setConversationId(result.conversation_id);
      setTurns((prev) => [...prev, { id: result.message_id, prompt: message, reply: result.reply, responseId: result.response_id }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${agent.name} could not be reached`);
    } finally {
      setLoading(false);
    }
  }

  async function accept(turn: AgentTurn) {
    if (!agent.chatKey) return;
    try {
      await recordDecision({ projectId, messageId: turn.id, chosenResponseId: turn.responseId, taskType: agent.chatKey, mode: "single", rationale: turn.prompt });
      setTurns((prev) => prev.map((item) => (item === turn ? { ...item, accepted: true } : item)));
    } catch {
      setError("Could not save this as a decision");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()} className="flex h-[600px] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-white ${agent.tile}`}>
              <AgentIcon className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <p className="font-display text-[15px] font-bold leading-tight">{agent.name}</p>
              <p className="text-[11px] text-ink/50">Live admin agent, shared project decisions</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/45 hover:bg-ink/5"><X className="h-5 w-5" strokeWidth={2} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {turns.length === 0 && !loading && <p className="text-[13px] leading-relaxed text-ink/50">Ask {agent.name} about this project. Replies use the authenticated prince-web-app admin agent.</p>}
          {turns.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-2.5">
              <div className="ml-8 rounded-2xl bg-blue-600 px-4 py-2.5 text-[13.5px] text-white">{turn.prompt}</div>
              <div className="mr-4 flex flex-col gap-1.5">
                <div className="rounded-2xl bg-ink/[0.05] px-4 py-2.5 text-[13.5px] leading-relaxed text-ink">{turn.reply}</div>
                <button onClick={() => accept(turn)} disabled={turn.accepted} className="self-start text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:text-emerald-600">
                  {turn.accepted ? "Saved as a decision" : "Accept as decision"}
                </button>
              </div>
            </div>
          ))}
          {loading && <div className="mr-4 flex items-center gap-2 text-[13px] text-ink/45"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {agent.name} is thinking...</div>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</p>}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 border-t border-ink/[0.07] p-3">
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask ${agent.name}...`} maxLength={1000} className="flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400" />
          <button type="submit" disabled={loading || !input.trim()} aria-label="Send" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4" strokeWidth={2} /></button>
        </form>
      </div>
    </div>
  );
}

function SageChatModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [turns, setTurns] = useState<SageTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, loading]);

  async function send() {
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const result = await sageChat(projectId, message, conversationId);
      setConversationId(result.conversation_id);
      setTurns((prev) => [...prev, { id: result.message_id, prompt: message, reply: result.reply, responseId: result.response_id }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sage could not be reached");
    } finally {
      setLoading(false);
    }
  }

  async function accept(turn: SageTurn) {
    try {
      await recordDecision({
        projectId,
        messageId: turn.id,
        chosenResponseId: turn.responseId,
        taskType: "marketing",
        mode: "single",
        rationale: turn.prompt,
      });
      setTurns((prev) => prev.map((t) => (t === turn ? { ...t, accepted: true } : t)));
    } catch {
      // non-critical: the chat itself already succeeded
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()} className="flex h-[600px] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-300 to-blue-600 text-white">
              <Compass className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <p className="font-display text-[15px] font-bold leading-tight">Sage</p>
              <p className="text-[11px] text-ink/50">Live — princecaleb.dev, real memory</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/45 hover:bg-ink/5">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {turns.length === 0 && !loading && (
            <p className="text-[13px] leading-relaxed text-ink/50">
              Bring a real marketing problem — Sage works through it via Hormozi, Brunson, Ogilvy, Cialdini and Godin.
              This is the same agent and conversation memory as princecaleb.dev/marketing-brain.html.
            </p>
          )}
          {turns.map((t) => (
            <div key={t.id} className="flex flex-col gap-2.5">
              <div className="ml-8 rounded-2xl bg-blue-600 px-4 py-2.5 text-[13.5px] text-white">{t.prompt}</div>
              <div className="mr-4 flex flex-col gap-1.5">
                <div className="rounded-2xl bg-ink/[0.05] px-4 py-2.5 text-[13.5px] leading-relaxed text-ink">{t.reply}</div>
                <button
                  onClick={() => accept(t)}
                  disabled={t.accepted}
                  className="self-start text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:text-emerald-600"
                >
                  {t.accepted ? "✓ Saved as a decision" : "Accept as decision"}
                </button>
              </div>
            </div>
          ))}
          {loading && (
            <div className="mr-4 flex items-center gap-2 text-[13px] text-ink/45">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sage is thinking…
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2 border-t border-ink/[0.07] p-3"
        >
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Sage about a marketing problem..."
            maxLength={1000}
            className="flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" strokeWidth={2} />
          </button>
        </form>
      </div>
    </div>
  );
}
