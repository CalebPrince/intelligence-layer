"use client";

import { ExternalLink, MessageSquare, MoreHorizontal, Pencil, Trash2, Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getVersion, originalFileUrl, restoreVersion } from "@/lib/api";
import type { LibraryItemDetail } from "@/types";
import { ConfirmDialog } from "./ContextDialogs";
import { formatDate, formatSize, KindTile, pageUnit, timeAgo } from "./kinds";
import { MarkdownView } from "./MarkdownView";

type Tab = "content" | "summary" | "related" | "used" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "content", label: "Content" },
  { key: "summary", label: "Summary" },
  { key: "related", label: "Related" },
  { key: "used", label: "Used In" },
  { key: "history", label: "Version History" },
];

const SOURCE_LABEL: Record<string, string> = {
  edited: "Replaced by an edit in the app",
  synced: "Replaced when the file changed on disk",
  restored: "Replaced by a restore",
};

function ItemMenu({
  detail,
  onEdit,
  onCopy,
  onDelete,
}: {
  detail: LibraryItemDetail;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  const row = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink/75 hover:bg-ink/5";
  const readOnly = detail.kind === "conversation";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className="rounded-lg border border-ink/12 bg-white p-2 text-ink/60 transition hover:border-ink/30 hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
          {!readOnly && (
            <button
              className={row}
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Edit or move to a folder
            </button>
          )}
          <button
            className={row}
            onClick={() => {
              setOpen(false);
              onCopy();
            }}
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2} /> Copy content
          </button>
          {detail.url && (
            <a href={detail.url} target="_blank" rel="noreferrer" className={row}>
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} /> Open original link
            </a>
          )}
          {!readOnly && (
            <>
              <div className="my-1 border-t border-ink/[0.07]" />
              <button
                className={`${row} !text-red-600`}
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} /> Remove from context
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ItemViewer({
  projectId,
  detail,
  loading,
  onEdit,
  onCopy,
  onDelete,
  onSelectRelated,
  onChanged,
}: {
  projectId: string;
  detail: LibraryItemDetail | null;
  loading: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onSelectRelated: (id: string) => void;
  onChanged: (d: LibraryItemDetail) => void;
}) {
  const [tab, setTab] = useState<Tab>("content");
  const [preview, setPreview] = useState<{ title: string; content: string; source: string; created_at: string } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // a different item always opens on Content
  useEffect(() => {
    setTab("content");
    setError(null);
  }, [detail?.id]);

  if (!detail) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-ink/[0.07] bg-white p-8 text-center text-sm text-ink/45">
        {loading ? "Opening..." : "Select an item to read it here."}
      </div>
    );
  }

  const isMarkdown = detail.kind === "file" || detail.kind === "note" || detail.kind === "conversation";
  const chatHref = `/chat?project=${projectId}&use=${encodeURIComponent(detail.title)}`;

  async function showVersion(id: string) {
    try {
      setPreview(await getVersion(projectId, detail!.id, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that version");
    }
  }

  return (
    <div className="rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]">
      <div className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-5">
        <KindTile kind={detail.kind} size="h-12 w-12" title={detail.title} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[17px] font-bold leading-tight tracking-tight">{detail.title}</h2>
          <p className="mt-0.5 text-[13px] text-ink/55">
            {detail.folder} <span className="mx-1">•</span> Last updated {formatDate(detail.updated_at)}
            {detail.edited && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Edited in app</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {detail.kind !== "conversation" && (
            <button
              onClick={onEdit}
              className="flex items-center gap-2 rounded-lg border border-ink/12 bg-white px-3.5 py-2 text-sm font-medium text-ink/80 transition hover:border-ink/30"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} /> Edit
            </button>
          )}
          <ItemMenu detail={detail} onEdit={onEdit} onCopy={onCopy} onDelete={onDelete} />
          <Link
            href={chatHref}
            className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink"
          >
            <MessageSquare className="h-4 w-4" strokeWidth={1.75} /> Use in chat
          </Link>
        </div>
      </div>

      <div className="flex gap-1 border-b border-ink/[0.07] px-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition ${
              tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-ink/55 hover:text-ink"
            }`}
          >
            {label}
            {key === "used" && detail.used_in.count > 0 && <span className="ml-1.5 text-ink/40">{detail.used_in.count}</span>}
            {key === "history" && detail.versions.length > 0 && <span className="ml-1.5 text-ink/40">{detail.versions.length + 1}</span>}
          </button>
        ))}
      </div>

      {error && <p className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {detail.has_file && detail.original_name && (
        <div className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F5F7FB] px-3.5 py-2.5 text-[13px] text-ink/65">
          <span>
            Text extracted from <span className="font-medium text-ink/80">{detail.original_name}</span>
            {detail.pages ? ` (${pageUnit(detail.original_name, detail.pages)})` : ""}. Tables become text tables; images inside the file are not read.
          </span>
          <a
            href={originalFileUrl(projectId, detail.id)}
            className="shrink-0 font-medium text-blue-600 hover:text-blue-700"
          >
            Download original
          </a>
        </div>
      )}
      {detail.size > 8000 && detail.kind !== "conversation" && (
        <p className="mx-6 mt-3 text-[12px] text-ink/45">
          This item is long: only its first 8,000 characters are sent with each chat message.
        </p>
      )}

      <div className="px-6 py-5">
        {tab === "content" &&
          (detail.content.trim() === "" ? (
            <p className="text-sm text-ink/45">This item is empty.</p>
          ) : isMarkdown ? (
            <MarkdownView text={detail.content} keepLineBreaks={!!detail.original_name?.toLowerCase().endsWith(".pdf")} />
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#F3F5F9] p-4 font-mono text-[12.5px] leading-relaxed text-ink/80">
              {detail.content}
            </pre>
          ))}

        {tab === "summary" && (
          <div className="space-y-4">
            <p className="text-[12px] text-ink/45">Built from the item&apos;s own text (no model call), so it is always up to date.</p>
            {detail.summary.overview && (
              <div>
                <p className="font-display text-[15px] font-bold">Overview</p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink/75">{detail.summary.overview}</p>
              </div>
            )}
            {detail.summary.outline.length > 0 && (
              <div>
                <p className="font-display text-[15px] font-bold">Outline</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[14px] text-ink/75 marker:text-ink/35">
                  {detail.summary.outline.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-[13px]">
              {[
                `${detail.summary.words.toLocaleString()} words`,
                detail.summary.minutes ? `${detail.summary.minutes} min read` : null,
                detail.summary.tasks_total ? `${detail.summary.tasks_done} of ${detail.summary.tasks_total} tasks done` : null,
                formatSize(detail.size),
              ]
                .filter(Boolean)
                .map((t) => (
                  <span key={t as string} className="rounded-md bg-ink/[0.05] px-2.5 py-1 text-ink/65">
                    {t}
                  </span>
                ))}
            </div>
          </div>
        )}

        {tab === "related" &&
          (detail.related.length === 0 ? (
            <p className="text-sm text-ink/45">No other item in this project shares enough of its wording to be related.</p>
          ) : (
            <ul className="divide-y divide-ink/[0.06]">
              {detail.related.map((r) => (
                <li key={r.id}>
                  <button onClick={() => onSelectRelated(r.id)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-blue-700">
                    <span className="truncate text-sm font-medium">{r.title}</span>
                    <span className="shrink-0 text-xs text-ink/45">{r.folder}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {tab === "used" &&
          (detail.used_in.count === 0 ? (
            <p className="text-sm text-ink/45">
              No chat message has carried this item yet. Every question you ask in{" "}
              <Link href={`/chat?project=${projectId}`} className="text-blue-600 hover:underline">
                Chat
              </Link>{" "}
              sends the project&apos;s context along, and the ones that included this item are listed here.
            </p>
          ) : (
            <div>
              <p className="text-[14px] text-ink/70">
                Sent with <span className="font-semibold text-ink">{detail.used_in.count}</span> chat message{detail.used_in.count === 1 ? "" : "s"}.
              </p>
              <ul className="mt-2 divide-y divide-ink/[0.06]">
                {detail.used_in.recent.map((u, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <span className="truncate text-ink/80">{u.prompt}</span>
                    <span className="shrink-0 text-xs text-ink/45">{timeAgo(u.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        {tab === "history" && (
          <div>
            <div className="flex items-center justify-between rounded-lg bg-blue-50/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Current version</p>
                <p className="text-xs text-ink/55">
                  Updated {formatDate(detail.updated_at)} · {formatSize(detail.size)}
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">Now</span>
            </div>
            {detail.versions.length === 0 ? (
              <p className="mt-4 text-sm text-ink/45">No earlier versions. When this item is edited, or its file changes on disk, the previous text is kept here.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink/[0.06]">
                {detail.versions.map((v, i) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Version {detail.versions.length - i}</p>
                      <p className="text-xs text-ink/50">
                        {SOURCE_LABEL[v.source] ?? "Replaced"} on {formatDate(v.created_at)} · {formatSize(v.chars)}
                      </p>
                    </div>
                    <button onClick={() => showVersion(v.id)} className="rounded-lg border border-ink/12 px-3 py-1.5 text-[13px] font-medium text-ink/70 hover:border-ink/30">
                      Preview
                    </button>
                    <button
                      onClick={() => setRestoring(v.id)}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[13px] font-medium text-blue-700 hover:bg-blue-100"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold leading-tight">{preview.title}</h2>
                <p className="text-[13px] text-ink/55">
                  {SOURCE_LABEL[preview.source] ?? "Replaced"} on {formatDate(preview.created_at)}
                </p>
              </div>
              <button onClick={() => setPreview(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink/55 hover:bg-ink/5">
                Close
              </button>
            </div>
            <pre className="mt-4 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-[#F3F5F9] p-4 font-mono text-[12.5px] leading-relaxed text-ink/80">
              {preview.content}
            </pre>
          </div>
        </div>
      )}

      {restoring && (
        <ConfirmDialog
          title="Restore this version?"
          body="The text becomes the current version. What you have now is kept in Version History, so nothing is lost."
          confirmLabel="Restore"
          onClose={() => setRestoring(null)}
          onConfirm={async () => {
            try {
              onChanged(await restoreVersion(projectId, detail.id, restoring));
              setTab("content");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not restore");
            }
            setRestoring(null);
          }}
        />
      )}
    </div>
  );
}
