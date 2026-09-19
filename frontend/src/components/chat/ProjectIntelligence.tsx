"use client";

import {
  ArrowRight,
  CheckCircle2,
  Check,
  Columns2,
  Gauge,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Route,
  Smartphone,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LogoMark, ProviderLogo } from "@/components/landing/Marks";
import type { ModelResponse } from "@/types";
import { formatTime, providerLabel, splitContent, type Turn } from "./turn";

const COLLAPSE_AT = 380; // chars shown before "View full response"

const DOT: Record<string, string> = {
  openai: "bg-accent-openai",
  anthropic: "bg-accent-claude",
  gemini: "bg-accent-gemini",
};

const CONSIDERATION_ICONS = [Layers, Smartphone, Gauge, Route, Wrench];

function ModelCard({
  r,
  chosen,
  onChoose,
}: {
  r: ModelResponse;
  chosen: boolean;
  onChoose?: (r: ModelResponse) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = r.content ?? "";
  const isLong = content.length > COLLAPSE_AT;
  const shown = expanded || !isLong ? content : `${content.slice(0, COLLAPSE_AT).trimEnd()}…`;

  return (
    <div className={`flex flex-col rounded-xl border bg-white p-4 ${chosen ? "border-blue-500 ring-1 ring-blue-500" : "border-ink/[0.09]"}`}>
      <div className="flex items-center gap-2.5" title={r.display_name}>
        <ProviderLogo provider={r.provider} tile className="h-9 w-9" />
        <p className="font-display text-[17px] font-bold tracking-tight">{providerLabel(r.provider, r.display_name)}</p>
      </div>

      {r.success ? (
        <p className="mt-3 whitespace-pre-wrap text-[14px] leading-[1.5] text-ink/85">{shown}</p>
      ) : (
        <p className="mt-3 text-sm text-red-600">{r.error ?? "Request failed"}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {r.success && isLong ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            {expanded ? "Show less" : "View full response"}
            {!expanded && <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />}
          </button>
        ) : (
          <span />
        )}
        {onChoose && r.success && r.id && (
          <button
            onClick={() => onChoose(r)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              chosen ? "border-blue-200 bg-blue-50 text-blue-700" : "border-ink/15 text-ink/60 hover:border-ink/30"
            }`}
          >
            {chosen ? "Chosen" : "Use this"}
          </button>
        )}
      </div>
    </div>
  );
}

function CompareModal({ responses, onClose }: { responses: ModelResponse[]; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const PHASE: Record<ModelResponse["phase"], string> = {
    initial: "Initial answer",
    critique: "After seeing peers",
    synthesis: "Synthesis",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/[0.07] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Columns2 className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
            <h2 className="font-display text-lg font-bold">Compare side by side</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/45 hover:bg-ink/5 hover:text-ink">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="grid flex-1 gap-4 overflow-auto p-6" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(responses.length, 1), 3)}, minmax(0, 1fr))` }}>
          {responses.map((r, i) => (
            <div key={r.id ?? `${r.model_id}-${r.phase}-${i}`} className="rounded-xl border border-ink/[0.09] p-4">
              <div className="flex items-center gap-2.5">
                <ProviderLogo provider={r.provider} tile className="h-9 w-9" />
                <div>
                  <p className="font-display text-[15px] font-bold leading-tight">{r.display_name}</p>
                  <p className="text-xs text-ink/45">
                    {PHASE[r.phase]} · {r.latency_ms}ms · ${r.cost_usd.toFixed(4)}
                  </p>
                </div>
              </div>
              <p className={`mt-3 whitespace-pre-wrap text-[14px] leading-relaxed ${r.success ? "text-ink/80" : "text-red-600"}`}>
                {r.success ? r.content : r.error ?? "Request failed"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SynthesisCard({
  synthesis,
  accepted,
  onAccept,
  onDiscuss,
  onCompare,
  cardsOpen,
  onToggleCards,
}: {
  synthesis: ModelResponse;
  accepted: boolean;
  onAccept: () => void;
  onDiscuss: () => void;
  onCompare: () => void;
  cardsOpen: boolean;
  onToggleCards: () => void;
}) {
  const { prose, bullets } = splitContent(synthesis.content);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(synthesis.content ?? "");
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setMenuOpen(false);
      }, 1200);
    } catch {
      setMenuOpen(false);
    }
  }

  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-[#F6F4FF] to-[#EFF3FF] p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <LogoMark className="h-6 w-6" />
        <p className="font-display text-[17px] font-bold tracking-tight">Synthesis</p>
        <span className="rounded-md bg-violet-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-600">
          Recommended approach
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-5 lg:flex-row">
        <div className="min-w-0 flex-1">
          {prose.map((para, i) => (
            <p key={i} className={`text-[14px] leading-relaxed ${i === 0 ? "font-medium text-ink" : "mt-2 text-ink/75"}`}>
              {para}
            </p>
          ))}
          {bullets.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug text-ink/75">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink/70" strokeWidth={2.5} />
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>

        {bullets.length > 0 && (
          <div className="shrink-0 rounded-xl border border-ink/[0.07] bg-white/70 p-4 lg:w-[210px]">
            <p className="text-[13px] font-semibold">Key considerations</p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {bullets.slice(0, 5).map((b, i) => {
                const Icon = CONSIDERATION_ICONS[i % CONSIDERATION_ICONS.length];
                return (
                  <li key={i} className="flex items-start gap-2.5 text-[12px] leading-snug text-ink/70">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink/50" strokeWidth={1.75} />
                    <span className="line-clamp-2">{b}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {synthesis.id && (
          <button
            onClick={onAccept}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              accepted ? "bg-emerald-50 text-emerald-700" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
            {accepted ? "Accepted" : "Accept as decision"}
          </button>
        )}
        <button
          type="button"
          onClick={onDiscuss}
          className="flex items-center gap-2 rounded-lg border border-ink/12 bg-white px-4 py-2.5 text-sm font-medium text-ink/80 transition hover:border-ink/30"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={1.75} /> Discuss further
        </button>
        <button
          type="button"
          onClick={onCompare}
          className="flex items-center gap-2 rounded-lg border border-ink/12 bg-white px-4 py-2.5 text-sm font-medium text-ink/80 transition hover:border-ink/30"
        >
          <Columns2 className="h-4 w-4" strokeWidth={1.75} /> Compare side by side
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            className="rounded-lg border border-ink/12 bg-white p-2.5 text-ink/70 transition hover:border-ink/30"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
          </button>
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-20 mb-1.5 w-52 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
              <button onClick={copy} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink/70 hover:bg-ink/5">
                {copied ? "Copied!" : "Copy synthesis text"}
              </button>
              <button
                onClick={() => {
                  onToggleCards();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink/70 hover:bg-ink/5"
              >
                {cardsOpen ? "Hide model responses" : "Show model responses"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The assistant side of one turn: the "Project Intelligence" card. */
export function ProjectIntelligence({
  turn,
  taskLine,
  onChoose,
  onDiscuss,
  onToggleCards,
}: {
  turn: Turn;
  taskLine: string;
  onChoose: (responseId: string) => void;
  onDiscuss: () => void;
  onToggleCards: () => void;
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  const r = turn.response;
  const initial = r?.responses.filter((x) => x.phase === "initial") ?? [];
  const cards = initial.length > 0 ? initial : (r?.responses ?? []);
  const cols = Math.min(Math.max(cards.length, 1), 3);
  const time = turn.repliedAt ?? turn.sentAt;

  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D]">
        <LogoMark className="h-6 w-6" />
      </span>

      <div className="min-w-0 flex-1 rounded-2xl border border-ink/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(11,14,20,0.03)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight">
              Project Intelligence
              <span className="font-body text-[13px] font-normal text-ink/45">{formatTime(time)}</span>
            </p>
            <p className="mt-0.5 text-[13px] text-ink/50">{taskLine}</p>
          </div>

          {r && cards.length > 0 && (
            <button
              type="button"
              onClick={onToggleCards}
              title={turn.compareOpen ? "Hide model responses" : "Show model responses"}
              className="flex items-center gap-2 rounded-full border border-ink/12 bg-white px-3 py-1.5 text-[13px] text-ink/80 transition hover:border-ink/30"
            >
              <span className="flex gap-0.5">
                {cards.map((c) => (
                  <span key={c.model_id} className={`h-2 w-2 rounded-full ${DOT[c.provider] ?? "bg-ink/30"}`} />
                ))}
              </span>
              {cards.map((c) => providerLabel(c.provider, c.display_name)).join(" + ")}
              <SlidersHorizontal className="h-3.5 w-3.5 text-ink/40" strokeWidth={2} />
            </button>
          )}
        </div>

        {turn.loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-ink/45">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Consulting models…
          </div>
        ) : turn.error ? (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{turn.error}</p>
        ) : (
          r && (
            <div className="mt-4 flex flex-col gap-4">
              {turn.compareOpen && (
                <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {cards.map((c, i) => (
                    <ModelCard
                      key={c.id ?? `${c.model_id}-${i}`}
                      r={c}
                      chosen={!!turn.chosenResponseId && turn.chosenResponseId === c.id}
                      onChoose={(x) => x.id && onChoose(x.id)}
                    />
                  ))}
                </div>
              )}

              {r.synthesis && (
                <SynthesisCard
                  synthesis={r.synthesis}
                  accepted={turn.chosenResponseId === r.synthesis.id}
                  onAccept={() => r.synthesis?.id && onChoose(r.synthesis.id)}
                  onDiscuss={onDiscuss}
                  onCompare={() => setCompareOpen(true)}
                  cardsOpen={turn.compareOpen}
                  onToggleCards={onToggleCards}
                />
              )}

              {!r.synthesis && cards.length > 1 && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    className="flex items-center gap-2 rounded-lg border border-ink/12 bg-white px-4 py-2.5 text-sm font-medium text-ink/80 transition hover:border-ink/30"
                  >
                    <Columns2 className="h-4 w-4" strokeWidth={1.75} /> Compare side by side
                  </button>
                  <button
                    type="button"
                    onClick={onDiscuss}
                    className="flex items-center gap-2 rounded-lg border border-ink/12 bg-white px-4 py-2.5 text-sm font-medium text-ink/80 transition hover:border-ink/30"
                  >
                    <MessageSquare className="h-4 w-4" strokeWidth={1.75} /> Discuss further
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {compareOpen && r && <CompareModal responses={r.responses} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}
