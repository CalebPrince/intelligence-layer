"use client";

import { AlertTriangle, Bot, RefreshCw, ServerCrash } from "lucide-react";
import { useEffect, useState } from "react";
import { listErrors } from "@/lib/api";
import type { ErrorLog } from "@/types";

const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";
type Filter = "all" | "server" | "model";

function formatTs(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ErrorsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  function loadErrors() {
    setLoading(true);
    setMessage(null);
    listErrors(DEMO_OWNER_ID, filter === "all" ? undefined : filter)
      .then(setErrors)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load error logs"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <main className="h-full overflow-y-auto bg-[#F7F8FC] px-8 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-500">Admin monitor</p>
            <h1 className="mt-2 font-display text-3xl text-ink">Error Logs</h1>
            <p className="mt-1 text-sm text-ink/60">Server failures and model provider errors captured by Inteli-Space.</p>
          </div>
          <button
            type="button"
            onClick={loadErrors}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-medium text-ink/70 transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-7 flex gap-2 border-b border-ink/10 pb-3">
          {(["all", "server", "model"] as Filter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                filter === item ? "bg-[#172554] text-white" : "text-ink/55 hover:bg-white hover:text-ink"
              }`}
            >
              {item === "all" ? "All errors" : item === "server" ? "Server" : "Models"}
            </button>
          ))}
        </div>

        {message && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}
        {loading ? (
          <p className="mt-8 text-sm text-ink/40">Loading error logs...</p>
        ) : errors.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-ink/15 bg-white px-6 py-12 text-center">
            <AlertTriangle className="mx-auto h-7 w-7 text-emerald-500" />
            <p className="mt-3 text-sm font-medium text-ink">No errors recorded</p>
            <p className="mt-1 text-sm text-ink/45">This view will show provider and server failures as they occur.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-ink/10 bg-white">
            <div className="grid grid-cols-[auto_1fr_auto] gap-4 border-b border-ink/10 bg-ink/[0.025] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/40">
              <span>Type</span>
              <span>Error</span>
              <span>When</span>
            </div>
            <ul>
              {errors.map((error) => {
                const isModel = error.source === "model";
                return (
                  <li key={error.id} className="grid grid-cols-[auto_1fr_auto] gap-4 border-b border-ink/8 px-5 py-4 last:border-0">
                    <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${isModel ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
                      {isModel ? <Bot className="h-4 w-4" /> : <ServerCrash className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{error.message}</p>
                      <p className="mt-1 text-xs text-ink/45">
                        {isModel ? `Model provider${error.path ? ` · ${error.path}` : ""}` : error.path || "Server request"}
                      </p>
                      {error.detail && <p className="mt-2 max-h-16 overflow-hidden whitespace-pre-wrap break-words text-xs text-red-700/75">{error.detail}</p>}
                    </div>
                    <time className="whitespace-nowrap text-xs text-ink/40">{formatTs(error.created_at)}</time>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
