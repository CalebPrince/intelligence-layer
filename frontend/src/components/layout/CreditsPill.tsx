"use client";

import { Coins, Loader2, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProviderLogo } from "@/components/landing/Marks";
import { clearCredit, getCredits, setCredit } from "@/lib/api";
import type { CreditSummary } from "@/types";

const STATUS: Record<string, { dot: string; text: string }> = {
  valid: { dot: "bg-emerald-500", text: "Key active" },
  invalid: { dot: "bg-red-500", text: "Key rejected" },
  unreachable: { dot: "bg-amber-400", text: "Could not reach provider" },
  missing: { dot: "bg-ink/25", text: "No key set" },
};

const money = (n: number) => `$${n.toFixed(2)}`;

/** Live key status per provider, and the credit tracker (an estimate: credit you
 * entered minus the cost this app has logged since). Shown on the Main Dashboard. */
export function CreditsPill() {
  const [data, setData] = useState<CreditSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    getCredits()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch(() => setError("Could not load credits"));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(null);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, load]);

  async function save(provider: string) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter the credit you have left, for example 20 or 12.50");
      return;
    }
    setSaving(true);
    try {
      setData(await setCredit(provider, value));
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function clear(provider: string) {
    setSaving(true);
    try {
      setData(await clearCredit(provider));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  const total = data?.total_remaining_usd ?? null;
  const low = total !== null && data && data.total_balance_usd ? total <= data.total_balance_usd * 0.15 : false;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="API credits"
        className="flex items-center gap-2.5 rounded-xl border border-ink/10 bg-white px-3.5 py-2 text-left transition hover:border-ink/25"
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${low ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
          <Coins className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="leading-tight">
          <span className={`block text-sm font-semibold ${total !== null && total <= 0 ? "text-red-600" : ""}`}>
            {total !== null ? money(total) : "Set credits"}
          </span>
          <span className="block text-[11px] text-ink/50">{total !== null ? "credits left (est.)" : "track API credits"}</span>
        </span>
        <span className="ml-1 flex gap-1" aria-hidden>
          {(data?.providers ?? []).map((p) => (
            <span key={p.provider} className={`h-2 w-2 rounded-full ${STATUS[p.key_status]?.dot ?? "bg-ink/25"}`} />
          ))}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[380px] rounded-2xl border border-ink/10 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="font-display text-[15px] font-bold">API credits</p>
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Estimate</span>
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {(data?.providers ?? []).map((p) => {
              const st = STATUS[p.key_status] ?? STATUS.missing;
              const pct = p.balance_usd && p.remaining_usd !== null ? Math.max(0, Math.min(100, ((p.remaining_usd ?? 0) / p.balance_usd) * 100)) : 0;
              const isLow = p.balance_usd ? (p.remaining_usd ?? 0) <= p.balance_usd * 0.15 : false;
              return (
                <div key={p.provider} className="rounded-xl border border-ink/[0.08] p-3">
                  <div className="flex items-center gap-2.5">
                    <ProviderLogo provider={p.provider} tile className="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">{p.label}</p>
                      <p className="flex items-center gap-1.5 text-xs text-ink/55">
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.text}
                      </p>
                    </div>
                    {editing !== p.provider && (
                      <button
                        onClick={() => {
                          setEditing(p.provider);
                          setAmount(p.remaining_usd !== null && p.remaining_usd !== undefined ? Math.max(0, p.remaining_usd).toFixed(2) : "");
                          setError(null);
                        }}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil className="h-3 w-3" strokeWidth={2} /> {p.balance_usd === null ? "Set balance" : "Edit"}
                      </button>
                    )}
                  </div>

                  {editing === p.provider ? (
                    <div className="mt-2.5">
                      <label className="text-xs text-ink/60">Credit you have left with {p.label} (USD)</label>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex flex-1 items-center rounded-lg border border-ink/15 px-2.5 focus-within:border-blue-400">
                          <span className="text-sm text-ink/50">$</span>
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && save(p.provider)}
                            className="w-full bg-transparent px-1.5 py-1.5 text-sm outline-none"
                            placeholder="20.00"
                          />
                        </div>
                        <button
                          onClick={() => save(p.provider)}
                          disabled={saving}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
                        </button>
                        <button onClick={() => setEditing(null)} aria-label="Cancel" className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5">
                          <X className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                      {p.balance_usd !== null && (
                        <button onClick={() => clear(p.provider)} className="mt-1.5 text-xs text-ink/45 hover:text-red-600">
                          Stop tracking {p.label}
                        </button>
                      )}
                    </div>
                  ) : p.balance_usd !== null && p.remaining_usd !== null ? (
                    <div className="mt-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className={`font-display text-lg font-bold ${p.remaining_usd <= 0 ? "text-red-600" : ""}`}>{money(p.remaining_usd)}</span>
                        <span className="text-xs text-ink/50">
                          of {money(p.balance_usd)} · {money(p.spent_usd ?? 0)} used
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                        <div className={`h-full rounded-full ${isLow ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink/45">Not tracked yet. Enter what you loaded to see what is left.</p>
                  )}
                </div>
              );
            })}
          </div>

          {data && data.total_remaining_usd !== null && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-[#F5F7FB] px-3.5 py-2.5 text-sm">
              <span className="text-ink/60">Combined ({data.tracked_providers} tracked)</span>
              <span className="font-display font-bold">{money(data.total_remaining_usd)}</span>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <p className="mt-3 text-[11.5px] leading-snug text-ink/50">
            Providers don&apos;t let an API key read its remaining balance, so this is your entered credit minus the cost of requests made
            through this app since then. Usage from other tools isn&apos;t counted. Key status is checked live.
            {data ? ` Spent through this app so far: ${money(data.lifetime_spend_usd)}.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
