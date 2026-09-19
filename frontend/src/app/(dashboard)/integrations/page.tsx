"use client";

import {
  Braces,
  CreditCard,
  Database,
  Figma,
  HardDrive,
  Mail,
  MessageCircle,
  Package,
  Plug,
  Search,
  Send,
  Table2,
  Trello,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  siAirtable,
  siDropbox,
  siFigma,
  siGoogledrive,
  siJira,
  siStripe,
  siSupabase,
  siTelegram,
  siTrello,
  siWhatsapp,
  siZapier,
} from "simple-icons/icons";
import type { SimpleIcon } from "simple-icons";
import { deleteIntegration, getCredits, getGitHubAuthorizationUrl, getIntegrationCatalog, importGitHubRepository, listGitHubRepositories, listIntegrations, saveIntegration } from "@/lib/api";
import type { CreditSummary, GitHubRepository, IntegrationCatalogEntry, IntegrationCredential } from "@/types";

const CARD = "rounded-xl border border-ink/[0.08] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";

interface Connected {
  key: string;
  name: string;
  description: string;
  logo: string;
  /** matches CreditSummary.providers[].provider — omitted for integrations with no real check (Notion, GitHub). */
  providerKey?: string;
}

const CONNECTED: Connected[] = [
  { key: "openai", name: "OpenAI", description: "Access ChatGPT models for chat, analysis and more.", logo: "/logos/openai.svg", providerKey: "openai" },
  { key: "claude", name: "Claude", description: "Access Claude models for deeper reasoning.", logo: "/logos/claude-color.svg", providerKey: "anthropic" },
  { key: "gemini", name: "Gemini", description: "Access Gemini models for multimodal tasks.", logo: "/logos/gemini-color.svg", providerKey: "gemini" },
  { key: "notion", name: "Notion", description: "Sync notes, docs and project knowledge.", logo: "/logos/notion.svg" },
  { key: "github", name: "GitHub", description: "Access repositories, issues and code.", logo: "/logos/github.svg" },
];

// PLACEHOLDER catalog until there's a real integrations backend (see
// app/api/context.py for the only connector that's actually wired up today —
// file/folder sync — everything below is illustrative).
type Category = "Productivity" | "Development" | "Communication" | "Data" | "Automation" | "Other";
interface Available {
  key: string;
  name: string;
  description: string;
  category: Category;
  icon: typeof Plug;
  tone: string;
  logo?: string;
  brand?: SimpleIcon;
}

function BrandLogo({ icon, className = "h-9 w-9" }: { icon?: SimpleIcon; className?: string }) {
  if (!icon) return null;
  return (
    <span className={`flex items-center justify-center rounded-lg bg-white ${className}`} title={icon.title}>
      <svg viewBox="0 0 24 24" className="h-[72%] w-[72%]" role="img" aria-label={icon.title} fill={`#${icon.hex}`}>
        <path d={icon.path} />
      </svg>
    </span>
  );
}

const AVAILABLE: Available[] = [
  { key: "slack", name: "Slack", description: "Get notifications, share updates and collaborate.", category: "Communication", icon: Mail, tone: "bg-[#4A154B]/10 text-[#4A154B]", logo: "/logos/slack.svg" },
  { key: "google-drive", name: "Google Drive", description: "Access and sync your files and documents.", category: "Productivity", icon: HardDrive, tone: "bg-blue-50 text-blue-600", brand: siGoogledrive },
  { key: "figma", name: "Figma", description: "Access designs and visual assets.", category: "Development", icon: Figma, tone: "bg-orange-50 text-orange-500", brand: siFigma },
  { key: "linear", name: "Linear", description: "Sync issues and project tasks.", category: "Development", icon: Workflow, tone: "bg-violet-50 text-violet-600", logo: "/logos/linear.svg" },
  { key: "jira", name: "Jira", description: "Manage tasks and track progress.", category: "Development", icon: Workflow, tone: "bg-blue-50 text-blue-600", brand: siJira },
  { key: "trello", name: "Trello", description: "Sync boards and tasks.", category: "Productivity", icon: Trello, tone: "bg-blue-50 text-blue-600", brand: siTrello },
  { key: "dropbox", name: "Dropbox", description: "Access your files and folders.", category: "Productivity", icon: Package, tone: "bg-blue-50 text-blue-600", brand: siDropbox },
  { key: "stripe", name: "Stripe", description: "Manage payments and subscriptions.", category: "Data", icon: CreditCard, tone: "bg-violet-50 text-violet-600", brand: siStripe },
  { key: "whatsapp", name: "WhatsApp", description: "Send and receive messages.", category: "Communication", icon: MessageCircle, tone: "bg-emerald-50 text-emerald-600", brand: siWhatsapp },
  { key: "telegram", name: "Telegram", description: "Get notifications and alerts.", category: "Communication", icon: Send, tone: "bg-sky-50 text-sky-600", brand: siTelegram },
  { key: "zapier", name: "Zapier", description: "Automate workflows across your tools.", category: "Automation", icon: Zap, tone: "bg-orange-50 text-orange-500", brand: siZapier },
  { key: "airtable", name: "Airtable", description: "Sync your data and records.", category: "Data", icon: Table2, tone: "bg-teal-50 text-teal-600", brand: siAirtable },
  { key: "supabase", name: "Supabase", description: "Connect your database and backend.", category: "Data", icon: Database, tone: "bg-emerald-50 text-emerald-600", brand: siSupabase },
  { key: "webhooks", name: "Webhooks", description: "Send and receive webhooks.", category: "Automation", icon: Webhook, tone: "bg-rose-50 text-rose-600" },
  { key: "custom-api", name: "Custom API", description: "Connect any tool with an API.", category: "Other", icon: Braces, tone: "bg-ink/[0.06] text-ink/70" },
];

const CATEGORIES: (Category | "All")[] = ["All", "Productivity", "Development", "Communication", "Data", "Automation", "Other"];

type Tab = "All Integrations" | "Connected" | "Available" | "Requests";

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("All Integrations");
  const [category, setCategory] = useState<Category | "All">("All");
  const [query, setQuery] = useState("");
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(CONNECTED.map((c) => [c.key, true])));
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [catalog, setCatalog] = useState<IntegrationCatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<IntegrationCredential[]>([]);
  const [selectedService, setSelectedService] = useState<IntegrationCatalogEntry | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [savingService, setSavingService] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([]);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubImporting, setGithubImporting] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getCredits().catch(() => null), getIntegrationCatalog(), listIntegrations(DEMO_OWNER_ID)])
      .then(([creditData, catalogData, connectedData]) => {
        setCredits(creditData);
        setCatalog(catalogData);
        setCredentials(connectedData);
      })
      .catch(() => {
        setCredits(null);
        setCatalog([]);
      });
  }, []);

  // The catalog powers credentials and GitHub actions; the page keeps the
  // reference's stable card composition so live data cannot collapse the grid.
  const usingLiveCatalog = false;
  const connectedServices = new Set(credentials.map((credential) => credential.service));
  const liveConnected = catalog.filter((entry) => connectedServices.has(entry.key));
  const liveAvailable = catalog.filter((entry) => !connectedServices.has(entry.key));

  function openIntegration(entry: IntegrationCatalogEntry) {
    setSelectedService(entry);
    setCredentialValues({});
    setIntegrationMessage(null);
  }

  function authorizeGitHub() {
    window.location.href = getGitHubAuthorizationUrl(DEMO_OWNER_ID);
  }

  async function submitIntegration() {
    if (!selectedService) return;
    setSavingService(true);
    setIntegrationMessage(null);
    try {
      const credential = await saveIntegration(DEMO_OWNER_ID, selectedService.key, credentialValues);
      setCredentials((current) => [...current.filter((item) => item.service !== credential.service), credential]);
      setSelectedService(null);
    } catch (error) {
      setIntegrationMessage(error instanceof Error ? error.message : "Could not save integration");
    } finally {
      setSavingService(false);
    }
  }

  async function disconnectIntegration(entry: IntegrationCatalogEntry) {
    try {
      await deleteIntegration(DEMO_OWNER_ID, entry.key);
      setCredentials((current) => current.filter((item) => item.service !== entry.key));
    } catch (error) {
      setIntegrationMessage(error instanceof Error ? error.message : "Could not disconnect integration");
    }
  }

  async function openGitHubRepositories() {
    setGithubOpen(true);
    setGithubLoading(true);
    setIntegrationMessage(null);
    try {
      setGithubRepos(await listGitHubRepositories(DEMO_OWNER_ID));
    } catch (error) {
      setIntegrationMessage(error instanceof Error ? error.message : "Could not load GitHub repositories");
    } finally {
      setGithubLoading(false);
    }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("github") === "repos") void openGitHubRepositories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importRepository(repo: GitHubRepository) {
    setGithubImporting(repo.full_name);
    setIntegrationMessage(null);
    try {
      const result = await importGitHubRepository(DEMO_OWNER_ID, repo.owner, repo.name);
      setIntegrationMessage(result.already_imported ? `${repo.full_name} is already in Projects` : `Imported ${repo.full_name} with ${result.context_items} context items`);
    } catch (error) {
      setIntegrationMessage(error instanceof Error ? error.message : "Could not import repository");
    } finally {
      setGithubImporting(null);
    }
  }

  // real key status for OpenAI/Claude/Gemini once credits load; Notion/GitHub
  // have no backend connector, so they stay illustrative ("Connected").
  useEffect(() => {
    if (!credits) return;
    setOn((prev) => {
      const next = { ...prev };
      for (const c of CONNECTED) {
        if (!c.providerKey) continue;
        const status = credits.providers.find((p) => p.provider === c.providerKey)?.key_status;
        if (status) next[c.key] = status === "valid";
      }
      return next;
    });
  }, [credits]);

  function statusFor(c: Connected): { label: string; live: boolean } {
    if (!c.providerKey) return { label: "Connected", live: false };
    const status = credits?.providers.find((p) => p.provider === c.providerKey)?.key_status;
    if (!status) return { label: "Checking…", live: false };
    return status === "valid" ? { label: "Connected", live: true } : { label: "Not connected", live: true };
  }

  const filteredAvailable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AVAILABLE.filter((a) => (category === "All" || a.category === category) && (!q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)));
  }, [category, query]);

  const showConnected = tab === "All Integrations" || tab === "Connected";
  const showAvailable = tab === "All Integrations" || tab === "Available";

  return (
    <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5">
      <div className="mx-auto max-w-[1300px] space-y-4">
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,470px)]">
          <div className="px-2 pt-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Integrations
            </span>
            <h1 className="mt-2 font-display text-[44px] font-extrabold leading-none tracking-[-0.035em]">Integrations</h1>
            <p className="mt-3 max-w-[640px] text-[17px] leading-snug text-ink/60">
              Connect your tools, services and data sources. Bring everything together, so your projects have the right context and can
              take action.
            </p>
          </div>
          <div className="relative min-h-[160px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#EEF6F1] to-[#DDEFE4]">
            <svg viewBox="0 0 470 220" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
              <path d="M230 220C280 100 350 30 420 70s50 70 50 70V220Z" fill="#12A150" fillOpacity="0.16" />
              <path d="M320 220C370 140 420 110 470 130V220Z" fill="#12A150" fillOpacity="0.2" />
            </svg>
            <div className="relative flex items-center gap-5 p-7">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70 text-emerald-600">
                <Plug className="h-7 w-7" strokeWidth={1.75} />
              </span>
              <div>
                <p className="font-display text-[20px] font-bold leading-tight">
                  More connected tools.
                  <br />
                  Greater possibilities.
                </p>
                <p className="mt-1.5 max-w-[230px] text-[13px] leading-snug text-ink/60">
                  Integrate your favourite apps and services to get better results across all models.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-ink/10 bg-white p-1">
            {([
              ["All Integrations", 27],
              ["Connected", 7],
              ["Available", 20],
              ["Requests", 0],
            ] as [Tab, number][]).map(([k, n]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${tab === k ? "bg-blue-600 text-white" : "text-ink/60 hover:text-ink"}`}
              >
                {k}
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${tab === k ? "bg-white/20" : "bg-ink/[0.06]"}`}>{n}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={2} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search integrations..."
                className="h-10 w-56 rounded-xl border border-ink/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category | "All")}
              className="h-10 rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink/80 outline-none focus:border-ink/30"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c === "All" ? "All Categories" : c}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div className="flex flex-col gap-6">
            {usingLiveCatalog && showConnected && (
              <div>
                <p className="font-display text-lg font-bold">Connected Integrations</p>
                <p className="text-[13px] text-ink/55">Credentials stored for this workspace.</p>
                <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
                  {liveConnected.map((entry) => {
                    const credential = credentials.find((item) => item.service === entry.key)!;
                    return (
                      <div key={entry.key} className={`${CARD} p-4`}>
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Plug className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${credential.status === "connected" ? "bg-emerald-50 text-emerald-600" : credential.status === "invalid" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                            {credential.status}
                          </span>
                        </div>
                        <p className="mt-2.5 text-sm font-semibold">{entry.name}</p>
                        <p className="mt-1 text-[13px] leading-snug text-ink/55">{credential.status_detail || `${credential.fields_set.length} credential field${credential.fields_set.length === 1 ? "" : "s"} saved.`}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <button onClick={() => openIntegration(entry)} className="rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs font-medium hover:border-ink/25">Update</button>
                          <div className="flex items-center gap-2">
                            {entry.key === "github" && <a href="/integrations?github=repos" className="text-xs font-medium text-blue-600 hover:text-blue-700">Browse repos</a>}
                            <button onClick={() => disconnectIntegration(entry)} className="text-xs font-medium text-red-600 hover:text-red-700">Disconnect</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {liveConnected.length === 0 && <p className="mt-3 text-sm text-ink/40">No integrations connected yet.</p>}
              </div>
            )}

            {usingLiveCatalog && showAvailable && (
              <div>
                <p className="font-display text-lg font-bold">Available Integrations</p>
                <p className="text-[13px] text-ink/55">Connect a service by saving its credential fields.</p>
                <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {liveAvailable.map((entry) => (
                    <div key={entry.key} className={`${CARD} p-4`}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Plug className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
                      <p className="mt-2.5 text-sm font-semibold">{entry.name}</p>
                      <p className="mt-1 text-[13px] leading-snug text-ink/55">{entry.category} integration with {entry.fields.length} credential field{entry.fields.length === 1 ? "" : "s"}.</p>
                      <button onClick={entry.key === "github" ? authorizeGitHub : () => openIntegration(entry)} className="mt-3 w-full rounded-lg border border-ink/12 py-1.5 text-[13px] font-medium transition hover:border-ink/30">{entry.key === "github" ? "Authorize GitHub" : "Connect"}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!usingLiveCatalog && showConnected && (
              <div>
                <p className="font-display text-lg font-bold">Connected Integrations</p>
                <p className="text-[13px] text-ink/55">These tools are connected to your workspace.</p>
                <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {CONNECTED.map((c) => {
                    const status = statusFor(c);
                    return (
                    <div key={c.key} className={`${CARD} p-4`}>
                      <div className="flex items-start justify-between">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.logo} alt="" className="h-9 w-9 rounded-lg" />
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            status.label === "Not connected" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                          }`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-2.5 text-sm font-semibold">{c.name}</p>
                      <p className="mt-1 text-[13px] leading-snug text-ink/55">{c.description}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <button
                          onClick={() => {
                            if (c.key === "github") return void openGitHubRepositories();
                            const entry = catalog.find((item) => item.key === c.key || item.name.toLowerCase() === c.name.toLowerCase());
                            if (entry) openIntegration(entry);
                          }}
                          className="rounded-lg border border-ink/10 p-1.5 text-ink/50 hover:border-ink/25"
                          aria-label={`${c.name} settings`}
                        >
                          <Workflow className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                        <button
                          role="switch"
                          aria-checked={on[c.key]}
                          onClick={() => setOn((p) => ({ ...p, [c.key]: !p[c.key] }))}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on[c.key] ? "bg-emerald-500" : "bg-ink/15"}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on[c.key] ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!usingLiveCatalog && showAvailable && (
              <div>
                <p className="font-display text-lg font-bold">Available Integrations</p>
                <p className="text-[13px] text-ink/55">Connect more tools to enhance your workflow.</p>
                <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
                  {filteredAvailable.map((a) => {
                    const Icon = a.icon;
                    return (
                      <div key={a.key} className={`${CARD} p-4`}>
                        {a.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.logo} alt="" className="h-9 w-9 rounded-lg" />
                        ) : a.brand ? (
                          <BrandLogo icon={a.brand} />
                        ) : (
                          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.tone}`}>
                            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                          </span>
                        )}
                        <p className="mt-2.5 text-sm font-semibold">{a.name}</p>
                        <p className="mt-1 text-[13px] leading-snug text-ink/55">{a.description}</p>
                        <button
                          onClick={() => {
                            const entry = catalog.find((item) => item.key === a.key || item.name.toLowerCase() === a.name.toLowerCase());
                            if (entry) openIntegration(entry);
                            else setIntegrationMessage(`${a.name} is not configured in the live catalog yet.`);
                          }}
                          className="mt-3 w-full rounded-lg border border-ink/12 py-1.5 text-[13px] font-medium transition hover:border-ink/30"
                        >
                          Connect
                        </button>
                      </div>
                    );
                  })}
                  {filteredAvailable.length === 0 && <p className="col-span-full py-6 text-center text-sm text-ink/40">No integrations match this filter.</p>}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className={`${CARD} p-5`}>
              <p className="font-display text-[15px] font-bold">Need a custom integration?</p>
              <p className="mt-1.5 text-[13px] leading-snug text-ink/55">We can help you connect almost any tool or service via API.</p>
              <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-ink/12 py-2 text-[13px] font-medium hover:border-ink/30">
                <Mail className="h-3.5 w-3.5" strokeWidth={2} /> Request Integration
              </button>
            </div>

            <div className="rounded-2xl bg-[#EAF7EF] p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Plug className="h-5 w-5" strokeWidth={2} />
              </span>
              <p className="mt-3 font-display text-[15px] font-bold">Build better workflows</p>
              <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px] text-emerald-800">
                {["Connect the tools you already use", "Keep your project context in sync", "Automate repetitive tasks", "Give your agents more capabilities"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" /> {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className={`${CARD} p-5`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Braces className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <p className="mt-3 font-display text-[15px] font-bold">API Access</p>
              <p className="mt-1.5 text-[13px] leading-snug text-ink/55">Use our API to build custom integrations and workflows.</p>
              <button className="mt-3 text-[13px] font-medium text-blue-600 hover:text-blue-700">View API Documentation →</button>
            </div>
          </div>
        </section>

        {selectedService && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-5" role="dialog" aria-modal="true" aria-labelledby="integration-dialog-title">
            <div className={`${CARD} w-full max-w-lg p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id="integration-dialog-title" className="font-display text-lg font-bold">Connect {selectedService.name}</p>
                  <p className="mt-1 text-[13px] text-ink/55">Credentials are stored for this workspace and never shown again.</p>
                </div>
                <button onClick={() => setSelectedService(null)} className="text-sm text-ink/45 hover:text-ink" aria-label="Close dialog">Close</button>
              </div>
              <div className="mt-5 space-y-3">
                {selectedService.fields.map((field) => (
                  <label key={field.key} className="block">
                    <span className="text-[13px] font-medium text-ink/75">{field.label}</span>
                    <input
                      type={field.secret ? "password" : "text"}
                      value={credentialValues[field.key] ?? ""}
                      onChange={(event) => setCredentialValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="mt-1.5 h-10 w-full rounded-lg border border-ink/12 bg-white px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                ))}
              </div>
              {integrationMessage && <p className="mt-3 text-xs text-rose-600">{integrationMessage}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setSelectedService(null)} className="rounded-lg border border-ink/12 px-3.5 py-2 text-[13px] font-medium hover:border-ink/30">Cancel</button>
                <button onClick={submitIntegration} disabled={savingService || selectedService.fields.some((field) => !credentialValues[field.key]?.trim())} className="rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {savingService ? "Connecting..." : selectedService.has_live_check ? "Save and test" : "Save connection"}
                </button>
              </div>
            </div>
          </div>
        )}

        {githubOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-5" role="dialog" aria-modal="true" aria-labelledby="github-repos-title">
            <div className={`${CARD} flex max-h-[80vh] w-full max-w-2xl flex-col p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id="github-repos-title" className="font-display text-lg font-bold">GitHub repositories</p>
                  <p className="mt-1 text-[13px] text-ink/55">Import a repository into Projects and add its README to the knowledge base.</p>
                </div>
                <button onClick={() => setGithubOpen(false)} className="text-sm text-ink/45 hover:text-ink">Close</button>
              </div>
              <div className="mt-4 min-h-0 overflow-y-auto">
                {githubLoading ? <p className="py-8 text-center text-sm text-ink/45">Loading repositories...</p> : githubRepos.length === 0 ? <p className="py-8 text-center text-sm text-ink/45">No repositories available for this token.</p> : (
                  <ul className="divide-y divide-ink/[0.06]">
                    {githubRepos.map((repo) => (
                      <li key={repo.id} className="flex items-center gap-3 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-semibold"><span className="truncate">{repo.full_name}</span>{repo.private && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">Private</span>}</span>
                          <span className="mt-1 block truncate text-xs text-ink/50">{repo.description || "No description"}</span>
                        </span>
                        <button onClick={() => importRepository(repo)} disabled={githubImporting === repo.full_name} className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{githubImporting === repo.full_name ? "Importing..." : "Import"}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
