"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, Clock, GitFork, LayoutGrid, List, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DecisionDetailPanel } from "@/components/decisions/DecisionDetailPanel";
import { DecisionMenu } from "@/components/decisions/DecisionMenu";
import { formatDate, StatusPill, StatusTile } from "@/components/decisions/status";
import { getDecision, listWorkspaceDecisions, updateDecision } from "@/lib/api";
import type { DecisionCard, DecisionDetail, DecisionStats, DecisionStatus } from "@/types";

// TODO: replace with the signed-in user's id once auth is wired up.
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";
const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";

type Tab = "all" | DecisionStatus;
type SortKey = "updated" | "oldest" | "title";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "implemented", label: "Implemented" },
  { key: "in_progress", label: "In Progress" },
  { key: "under_review", label: "Under Review" },
  { key: "archived", label: "Archived" },
];

function categoryOf(d: DecisionCard): string {
  return d.task_type && d.task_type !== "general" ? d.task_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "General";
}

function SelectBox({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
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

function StatTile({
  icon,
  tone,
  value,
  label,
  delta,
  down,
}: {
  icon: React.ReactNode;
  tone: string;
  value: number;
  label: string;
  delta: number;
  down?: boolean;
}) {
  return (
    <div className={`${CARD} flex items-center gap-4 p-5`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <div>
        <p className="font-display text-[28px] font-bold leading-none">{value}</p>
        <p className="mt-1 text-[14px] text-ink/70">{label}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink/55">
          {down ? (
            <ArrowDown className="h-3.5 w-3.5 text-red-500" strokeWidth={2.25} />
          ) : (
            <ArrowUp className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.25} />
          )}
          {delta} this month
        </p>
      </div>
    </div>
  );
}

function EditDialog({
  decision,
  onClose,
  onSave,
}: {
  decision: DecisionDetail;
  onClose: () => void;
  onSave: (fields: { title: string; tags: string[]; outcomeNote: string | null; implementedAt: string | null }) => void;
}) {
  const [title, setTitle] = useState(decision.title);
  const [tags, setTags] = useState(decision.tags.join(", "));
  const [outcomeNote, setOutcomeNote] = useState(decision.outcome_note ?? "");
  const [implementedAt, setImplementedAt] = useState(decision.implemented_at?.slice(0, 10) ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            title,
            tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
            outcomeNote: outcomeNote.trim() || null,
            implementedAt: implementedAt ? `${implementedAt}T00:00:00Z` : null,
          });
        }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Edit decision</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/45 hover:bg-ink/5">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <label className="mt-4 block text-[13px] font-medium text-ink/70">Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
        <label className="mt-3 block text-[13px] font-medium text-ink/70">Outcome note</label>
        <textarea
          value={outcomeNote}
          onChange={(e) => setOutcomeNote(e.target.value)}
          placeholder="What happened after this decision?"
          rows={3}
          className="mt-1 w-full resize-y rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
        <label className="mt-3 block text-[13px] font-medium text-ink/70">Implemented on</label>
        <input
          type="date"
          value={implementedAt}
          onChange={(e) => setImplementedAt(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
        <label className="mt-3 block text-[13px] font-medium text-ink/70">Tags (comma separated)</label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Development, Tech Stack"
          className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-ink/55 hover:text-ink">
            Cancel
          </button>
          <button type="submit" disabled={!title.trim()} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function DecisionsInner() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const projectParam = searchParams.get("project");

  const [items, setItems] = useState<DecisionCard[]>([]);
  const [stats, setStats] = useState<DecisionStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [projectFilter, setProjectFilter] = useState(projectParam ?? "all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<"list" | "grid">("list");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setProjectFilter(projectParam ?? "all");
  }, [projectParam]);

  const load = useCallback(() => {
    listWorkspaceDecisions(DEMO_OWNER_ID)
      .then(({ items: list, stats: st }) => {
        setItems(list);
        setStats(st);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load decisions"))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  }

  const projectsInList = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((d) => map.set(d.project_id, d.project_name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }));
  }, [items]);

  const categories = useMemo(() => [...new Set(items.map(categoryOf))].sort(), [items]);

  const visible = useMemo(() => {
    let list = items;
    if (tab !== "all") list = list.filter((d) => d.status === tab);
    if (projectFilter !== "all") list = list.filter((d) => d.project_id === projectFilter);
    if (category !== "all") list = list.filter((d) => categoryOf(d) === category);
    if (q) {
      list = list.filter((d) =>
        [d.title, d.project_name, d.snippet, d.task_type, ...d.tags].some((f) => f.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      if (sort === "oldest") return Date.parse(a.decided_at) - Date.parse(b.decided_at);
      return Date.parse(b.decided_at) - Date.parse(a.decided_at);
    });
  }, [items, tab, projectFilter, category, q, sort]);

  // keep a valid selection: the first visible decision by default
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((d) => d.id === selectedId)) setSelectedId(visible[0].id);
  }, [visible, selectedId]);

  const loadDetail = useCallback((id: string, quiet = false) => {
    if (!quiet) setDetailLoading(true);
    getDecision(id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function changeStatus(ids: string[], status: DecisionStatus) {
    try {
      await Promise.all(ids.map((id) => updateDecision(id, { status })));
      flash(ids.length === 1 ? "Decision updated" : `${ids.length} decisions updated`);
      setChecked(new Set());
      load();
      if (selectedId && ids.includes(selectedId)) loadDetail(selectedId, true);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not update");
    }
  }

  async function saveEdit(fields: { title: string; tags: string[]; outcomeNote: string | null; implementedAt: string | null }) {
    if (!detail) return;
    try {
      const updated = await updateDecision(detail.id, {
        title: fields.title,
        tags: fields.tags,
        outcome_note: fields.outcomeNote,
        implemented_at: fields.implementedAt,
      });
      setDetail(updated);
      setEditing(false);
      load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash("Copied");
    } catch {
      flash("Could not copy");
    }
  }

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const s = stats;

  return (
    <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5">
      <div className="mx-auto max-w-[1300px] space-y-4">
        {/* header */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,560px)]">
          <div className="px-2 pt-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Decisions
            </span>
            <h1 className="mt-2 font-display text-[48px] font-extrabold leading-none tracking-[-0.035em]">Decisions</h1>
            <p className="mt-3 max-w-[640px] text-[17px] leading-snug text-ink/60">
              Capture, organize and revisit key decisions across all your projects. Turn AI insights into action and keep your project
              knowledge in one place.
            </p>
          </div>
          <div className="relative min-h-[140px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#EEF6F1] to-[#DDEFE4]">
            <svg viewBox="0 0 560 150" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
              <path d="M300 150C350 60 420 20 490 60s70 60 70 60V150Z" fill="#12A150" fillOpacity="0.16" />
              <path d="M400 150C440 100 500 80 560 100V150Z" fill="#12A150" fillOpacity="0.2" />
            </svg>
            <div className="relative flex items-center gap-5 p-7">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-emerald-500 text-emerald-500">
                  <Check className="h-5 w-5" strokeWidth={3.5} />
                </span>
              </span>
              <div>
                <p className="font-display text-[20px] font-bold leading-tight">
                  Better decisions.
                  <br />
                  Bigger progress.
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-ink/60">
                  All perspectives. One place.
                  <br />
                  Your project history, always accessible.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* stats */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={<GitFork className="h-6 w-6" strokeWidth={1.75} />}
            tone="bg-violet-50 text-violet-600"
            value={s?.total ?? 0}
            label="Total Decisions"
            delta={s?.total_this_month ?? 0}
          />
          <StatTile
            icon={<Check className="h-6 w-6" strokeWidth={2.5} />}
            tone="bg-emerald-50 text-emerald-600"
            value={s?.implemented ?? 0}
            label="Implemented"
            delta={s?.implemented_this_month ?? 0}
          />
          <StatTile
            icon={<Clock className="h-6 w-6" strokeWidth={1.75} />}
            tone="bg-blue-50 text-blue-600"
            value={s?.in_progress ?? 0}
            label="In Progress"
            delta={s?.in_progress_this_month ?? 0}
          />
          <StatTile
            icon={<RefreshCw className="h-6 w-6" strokeWidth={1.75} />}
            tone="bg-orange-50 text-orange-500"
            value={s?.under_review ?? 0}
            label="Under Review"
            delta={s?.under_review_this_month ?? 0}
            down
          />
        </section>

        {/* tabs + filters */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-ink/10 bg-white p-1">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === key ? "bg-blue-600 text-white" : "text-ink/60 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <SelectBox value={projectFilter} onChange={setProjectFilter}>
              <option value="all">All Projects</option>
              {projectsInList.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </SelectBox>
            <SelectBox value={category} onChange={setCategory}>
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectBox>
            <SelectBox value={sort} onChange={(v) => setSort(v as SortKey)}>
              <option value="updated">Last updated</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A to Z</option>
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
        </section>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {/* list + detail */}
        {loaded && items.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center px-6 py-16 text-center`}>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <GitFork className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <p className="mt-4 font-display text-xl font-bold">No decisions yet</p>
            <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-ink/55">
              Ask a question in Chat, compare what the models say, then press <span className="font-medium text-ink/75">Accept as decision</span>{" "}
              on the answer you will act on. It will appear here with its context, every model&apos;s view and its status.
            </p>
            <Link href="/projects" className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              Go to your projects
            </Link>
          </div>
        ) : (
          <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className={`${CARD} overflow-hidden`}>
              {checked.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-ink/[0.07] bg-blue-50/60 px-4 py-2.5 text-[13px]">
                  <span className="font-medium text-blue-700">{checked.size} selected</span>
                  {(["implemented", "in_progress", "under_review", "archived"] as DecisionStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => changeStatus([...checked], st)}
                      className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 font-medium text-blue-700 hover:bg-blue-50"
                    >
                      {st === "archived" ? "Archive" : `Mark ${st.replace("_", " ")}`}
                    </button>
                  ))}
                  <button onClick={() => setChecked(new Set())} className="ml-auto text-ink/50 hover:text-ink">
                    Clear
                  </button>
                </div>
              )}

              {visible.length === 0 ? (
                <p className="px-6 py-14 text-center text-sm text-ink/45">
                  {loaded ? "No decisions match these filters." : "Loading decisions..."}
                </p>
              ) : (
                <ul className={view === "grid" ? "grid grid-cols-1 gap-3 p-3 md:grid-cols-2" : "divide-y divide-ink/[0.06]"}>
                  {visible.map((d) => {
                    const selected = d.id === selectedId;
                    return (
                      <li
                        key={d.id}
                        onClick={() => setSelectedId(d.id)}
                        className={`cursor-pointer transition ${
                          view === "grid" ? "rounded-xl border p-4 " + (selected ? "border-blue-300 bg-blue-50/60" : "border-ink/[0.08] hover:border-ink/20") : "px-4 py-4 " + (selected ? "bg-blue-50/70" : "hover:bg-ink/[0.02]")
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked.has(d.id)}
                            onChange={() => toggleChecked(d.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${d.title}`}
                            className="mt-3.5 h-4 w-4 shrink-0 rounded border-ink/30 accent-blue-600"
                          />
                          <StatusTile status={d.status} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{d.title}</p>
                            <p className="mt-0.5 text-[13px] text-ink/60">{d.project_name}</p>
                            <p className="mt-1 truncate text-[13px] text-ink/50">{d.snippet}</p>
                            {d.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {d.tags.slice(0, 4).map((t) => (
                                  <span key={t} className="rounded-md bg-ink/[0.05] px-2 py-0.5 text-xs text-ink/60">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <div className="flex items-center gap-0.5">
                              <StatusPill status={d.status} />
                              <DecisionMenu
                                status={d.status}
                                chatHref={`/chat?project=${d.project_id}`}
                                onStatus={(st) => changeStatus([d.id], st)}
                                onEdit={() => {
                                  setSelectedId(d.id);
                                  setEditing(true);
                                }}
                                onCopy={() => copyText(d.snippet)}
                              />
                            </div>
                            <span className="text-xs text-ink/50">{formatDate(d.decided_at)}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="xl:sticky xl:top-0">
              <DecisionDetailPanel
                decision={detail && detail.id === selectedId ? detail : null}
                loading={detailLoading}
                onStatus={(st) => selectedId && changeStatus([selectedId], st)}
                onEdit={() => setEditing(true)}
                onCopy={() => detail && copyText(detail.decision_text)}
              />
            </div>
          </section>
        )}
      </div>

      {editing && detail && <EditDialog decision={detail} onClose={() => setEditing(false)} onSave={saveEdit} />}

      {toast && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl">{toast}</div>
      )}
    </main>
  );
}

export default function DecisionsPage() {
  return (
    <Suspense fallback={<main className="flex h-full items-center justify-center text-sm text-ink/40">Loading...</main>}>
      <DecisionsInner />
    </Suspense>
  );
}
