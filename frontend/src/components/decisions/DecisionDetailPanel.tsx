"use client";

import { ArrowRight, Check, Folder, GitFork } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProviderLogo } from "@/components/landing/Marks";
import { ProjectImage } from "@/components/projects/ProjectImage";
import { providerLabel } from "@/components/chat/turn";
import type { DecisionDetail, DecisionStatus, Perspective } from "@/types";
import { DecisionMenu } from "./DecisionMenu";
import { formatDate, StatusPill, StatusTile } from "./status";

function ClampText({ text, limit = 420 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return (
    <>
      <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-ink/75">
        {open || !long ? text : `${text.slice(0, limit).trimEnd()}...`}
      </p>
      {long && (
        <button onClick={() => setOpen((v) => !v)} className="mt-1 text-[13px] font-medium text-blue-600 hover:text-blue-700">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

function PerspectiveCard({ p }: { p: Perspective }) {
  const [open, setOpen] = useState(false);
  const text = (p.content ?? "").trim();
  const long = text.length > 130;
  return (
    <div className="flex flex-col rounded-xl border border-ink/[0.09] bg-white p-3.5">
      <div className="flex items-center gap-2" title={p.display_name}>
        <ProviderLogo provider={p.provider} tile className="h-8 w-8" />
        <p className="font-display text-[15px] font-bold tracking-tight">{providerLabel(p.provider, p.display_name)}</p>
      </div>
      <p className={`mt-2.5 whitespace-pre-wrap text-[13px] leading-snug text-ink/70 ${open ? "max-h-64 overflow-y-auto" : ""}`}>
        {p.success ? (open || !long ? text : `${text.slice(0, 130).trimEnd()}...`) : "This model did not answer."}
      </p>
      {p.success && long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-2.5 flex items-center gap-1 self-start text-[13px] font-medium text-blue-600 hover:text-blue-700"
        >
          {open ? "Hide response" : "View response"}
          {!open && <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />}
        </button>
      )}
    </div>
  );
}

function outcomeText(d: DecisionDetail): string {
  switch (d.status) {
    case "implemented":
      return `Implemented on ${formatDate(d.implemented_at ?? d.decided_at)}`;
    case "in_progress":
      return `In progress since ${formatDate(d.decided_at)}`;
    case "under_review":
      return "Waiting for review before it is implemented";
    case "archived":
      return "Archived";
  }
}

export function DecisionDetailPanel({
  decision,
  loading,
  onStatus,
  onEdit,
  onCopy,
}: {
  decision: DecisionDetail | null;
  loading: boolean;
  onStatus: (s: DecisionStatus) => void;
  onEdit: () => void;
  onCopy: () => void;
}) {
  if (!decision) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-ink/[0.07] bg-white p-8 text-center text-sm text-ink/45">
        {loading ? "Loading decision..." : "Select a decision to see its details."}
      </div>
    );
  }

  const chatHref = `/chat?project=${decision.project_id}`;

  return (
    <div className="rounded-2xl border border-ink/[0.07] bg-white p-6 shadow-[0_1px_2px_rgba(11,14,20,0.03)]">
      <div className="flex items-start gap-4">
        <StatusTile status={decision.status} size="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-tight">{decision.title}</h2>
          <Link
            href={`/overview?project=${decision.project_id}`}
            className="mt-2 flex items-center gap-2 text-[14px] font-medium text-ink/80 hover:text-ink"
          >
            <ProjectImage className="h-6 w-6 rounded-md" mark="h-3.5 w-3.5" />
            {decision.project_name}
          </Link>
          <p className="mt-1.5 flex items-center gap-2 text-xs text-ink/50">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-400 text-[8px] font-bold text-ink">
              CA
            </span>
            Decided on {formatDate(decision.decided_at)} by {decision.decided_by}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusPill status={decision.status} />
          <DecisionMenu status={decision.status} chatHref={chatHref} onStatus={onStatus} onEdit={onEdit} onCopy={onCopy} />
        </div>
      </div>

      {decision.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {decision.tags.map((t) => (
            <span key={t} className="rounded-md bg-ink/[0.05] px-2 py-1 text-xs text-ink/60">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-ink/[0.07] pt-5">
        <p className="font-display text-[15px] font-bold">Decision</p>
        <div className="mt-1.5">
          <ClampText text={decision.decision_text || "No text was saved for this decision."} />
        </div>
      </div>

      <div className="mt-5">
        <p className="font-display text-[15px] font-bold">Context</p>
        <div className="mt-1.5">
          <ClampText text={decision.context || "The original question is not available."} limit={320} />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className="font-display text-[16px] font-bold">AI Perspectives</p>
          <Link href={chatHref} className="flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700">
            View full discussion <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
        {decision.perspectives.length === 0 ? (
          <p className="mt-2 text-sm text-ink/45">No model answers were stored for this decision.</p>
        ) : (
          <div
            className="mt-3 grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(decision.perspectives.length, 3)}, minmax(0, 1fr))` }}
          >
            {decision.perspectives.slice(0, 3).map((p) => (
              <PerspectiveCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_1.25fr]">
        <div>
          <p className="font-display text-[15px] font-bold">Outcome</p>
          <p className="mt-2 flex items-center gap-2 text-[13px] text-ink/70">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                decision.status === "implemented" ? "bg-emerald-500 text-white" : "bg-ink/[0.08] text-ink/40"
              }`}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            {outcomeText(decision)}
          </p>
          {decision.outcome_note && <p className="mt-2 text-[13px] leading-relaxed text-ink/65">{decision.outcome_note}</p>}
        </div>
        <div>
          <p className="font-display text-[15px] font-bold">Related</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink/70">
            <Link href={`/context?project=${decision.project_id}`} className="flex items-center gap-1.5 hover:text-ink">
              <Folder className="h-4 w-4 text-ink/45" strokeWidth={1.75} /> {decision.related_files} {decision.related_files === 1 ? "file" : "files"}
            </Link>
            <Link href={`/decisions?project=${decision.project_id}`} className="flex items-center gap-1.5 hover:text-ink">
              <GitFork className="h-4 w-4 text-ink/45" strokeWidth={1.75} /> {decision.related_decisions} other{" "}
              {decision.related_decisions === 1 ? "decision" : "decisions"}
            </Link>
            <Link href={`/overview?project=${decision.project_id}`} className="flex items-center gap-1.5 hover:text-ink">
              <Folder className="h-4 w-4 text-ink/45" strokeWidth={1.75} /> 1 project
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
