"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { addContext, deleteContext, listContext } from "@/lib/api";
import type { ContextItem, ContextType } from "@/types";

const TYPES: ContextType[] = ["note", "document", "url", "file"];

export function ContextPanel({ projectId, bordered = true }: { projectId: string; bordered?: boolean }) {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<ContextType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listContext(projectId)
      .then((data) => !cancelled && setItems(data))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load context"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const item = await addContext({ projectId, type, title, content });
      setItems((prev) => [item, ...prev]);
      setTitle("");
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add context");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== id)); // optimistic
    try {
      await deleteContext(projectId, id);
    } catch (err) {
      setItems(prev); // roll back
      setError(err instanceof Error ? err.message : "Failed to delete context");
    }
  }

  return (
    <aside
      className={`flex h-full flex-col gap-3 overflow-y-auto bg-white/40 p-4 ${bordered ? "border-l border-ink/10" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/5">
          <FileText className="h-3.5 w-3.5 text-ink/60" strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-sm font-medium">Project context</h2>
          <p className="text-xs text-ink/40">
            {loading ? "…" : `${items.length} item${items.length === 1 ? "" : "s"}`} · sent to every model
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-lg border border-ink/10 bg-white p-3">
        <div className="flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ContextType)}
            className="rounded border border-ink/15 bg-white px-2 py-1 text-xs"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            id="context-add-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="flex-1 rounded border border-ink/15 bg-white px-2 py-1 text-xs outline-none focus:border-ink/40"
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What should every model know?"
          rows={3}
          className="rounded border border-ink/15 bg-white px-2 py-1 text-xs outline-none focus:border-ink/40"
        />
        <button
          type="submit"
          disabled={adding}
          className="self-end rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper disabled:opacity-50"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink/40">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink/40">
          Nothing added yet. Context you attach here is sent identically to every model.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="group rounded-lg border border-ink/10 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-ink/40">{item.type}</p>
                  <p className="mt-1 truncate text-sm font-medium">{item.title}</p>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  aria-label={`Remove ${item.title}`}
                  className="shrink-0 text-xs text-ink/30 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                >
                  Remove
                </button>
              </div>
              <p className="mt-1 line-clamp-3 text-xs text-ink/60">{item.content}</p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
