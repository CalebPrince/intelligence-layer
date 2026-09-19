"use client";

import { ArrowUp, Check, ChevronRight, FolderInput, FolderOpen, HardDrive, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browseFolders, importProjects, scanFolder, startWatching } from "@/lib/api";
import type { BrowseEntry, ImportCandidate, ImportResult } from "@/types";

const LAST_PATH_KEY = "magl:last-import-path";
// Where the user keeps their projects; used the first time the dialog opens.
const SUGGESTED_START = "D:\\Websites";

function readLastPath(): string {
  try {
    return localStorage.getItem(LAST_PATH_KEY) || SUGGESTED_START;
  } catch {
    return SUGGESTED_START;
  }
}

export function ImportProjectsModal({
  ownerId,
  onClose,
  onImported,
}: {
  ownerId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [path, setPath] = useState<string>(""); // folder currently shown; "" = drives
  const [pathInput, setPathInput] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [drives, setDrives] = useState<BrowseEntry[]>([]);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importDocs, setImportDocs] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [watchFolder, setWatchFolder] = useState(true);
  const [watchedPath, setWatchedPath] = useState<string | null>(null);

  const open = useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      try {
        const listing = await browseFolders(target);
        setPath(listing.path);
        setPathInput(listing.path);
        setParent(listing.parent ?? null);
        if (listing.path === "") {
          setDrives(listing.entries);
          setCandidates([]);
          setSelected(new Set());
        } else {
          const found = await scanFolder({ path: listing.path, ownerId });
          setDrives([]);
          setCandidates(found);
          // everything not yet imported starts selected: "import all" is one click
          setSelected(new Set(found.filter((c) => !c.already_imported).map((c) => c.path)));
          try {
            localStorage.setItem(LAST_PATH_KEY, listing.path);
          } catch {
            // storage unavailable: the start folder just won't be remembered
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [ownerId]
  );

  useEffect(() => {
    open(readLastPath());
  }, [open]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const importable = useMemo(() => candidates.filter((c) => !c.already_imported), [candidates]);
  const allSelected = importable.length > 0 && importable.every((c) => selected.has(c.path));

  function toggle(p: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  // watchPath: the directory to keep scanning afterwards (undefined = none)
  async function runImport(paths: string[], watchPath?: string) {
    if (paths.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await importProjects({ ownerId, paths, importDocs });
      if (watchPath && watchFolder) {
        await startWatching({ ownerId, path: watchPath });
        setWatchedPath(watchPath);
      }
      setResult(res);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function watchOnly() {
    setImporting(true);
    setError(null);
    try {
      await startWatching({ ownerId, path });
      setWatchedPath(path);
      setResult({ created: [], skipped: [], context_items: 0 });
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start watching");
    } finally {
      setImporting(false);
    }
  }

  const folderName = path.split(/[\\/]/).filter(Boolean).pop() ?? path;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Import projects"
    >
      <div
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-ink/[0.07] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FolderInput className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold leading-tight">Import projects from a folder</h2>
              <p className="text-[13px] text-ink/55">
                Pick the directory that holds your projects. Each sub-folder becomes a project.
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/45 hover:bg-ink/5 hover:text-ink">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {result ? (
          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <div>
                <p className="font-display text-lg font-bold">
                  {result.created.length === 0 && watchedPath
                    ? "Watching for new projects"
                    : `Imported ${result.created.length} project${result.created.length === 1 ? "" : "s"}`}
                </p>
                <p className="text-[13px] text-ink/55">
                  {result.context_items > 0
                    ? `${result.context_items} document${result.context_items === 1 ? "" : "s"} added as project context.`
                    : result.created.length > 0
                      ? "No documents were added as context."
                      : "Nothing imported yet."}
                </p>
              </div>
            </div>
            {watchedPath && (
              <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
                Live scan is on for <span className="font-medium">{watchedPath}</span>. New folders you add there are
                added to All Projects automatically, about every 30 seconds.
              </p>
            )}
            {result.created.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2">
                {result.created.map((p) => (
                  <li key={p.id} className="rounded-lg bg-ink/[0.05] px-2.5 py-1 text-xs text-ink/70">
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
            {result.skipped.length > 0 && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
                <p className="font-medium">{result.skipped.length} skipped</p>
                <ul className="mt-1 space-y-0.5">
                  {result.skipped.map((s) => (
                    <li key={s.path} className="truncate">
                      {s.path}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-auto flex justify-end pt-6">
              <button onClick={onClose} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* location bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                open(pathInput.trim());
              }}
              className="flex items-center gap-2 border-b border-ink/[0.07] px-6 py-3"
            >
              <button
                type="button"
                onClick={() => open(parent ?? "")}
                disabled={loading || path === ""}
                aria-label="Up one folder"
                className="rounded-lg border border-ink/10 p-2 text-ink/60 hover:bg-ink/5 disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => open("")}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-sm text-ink/70 hover:bg-ink/5 disabled:opacity-40"
              >
                <HardDrive className="h-4 w-4" strokeWidth={1.75} /> Drives
              </button>
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="Type a folder path, e.g. D:\Websites"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg border border-ink/10 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
              <button
                type="submit"
                disabled={loading || !pathInput.trim()}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/85 disabled:opacity-40"
              >
                Open
              </button>
            </form>

            {error && <p className="border-b border-red-100 bg-red-50 px-6 py-2.5 text-[13px] text-red-700">{error}</p>}

            {/* list */}
            <div className="min-h-[260px] flex-1 overflow-y-auto">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink/45">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading folders…
                </p>
              ) : path === "" ? (
                <ul className="p-3">
                  {drives.map((d) => (
                    <li key={d.path}>
                      <button
                        onClick={() => open(d.path)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-ink/[0.04]"
                      >
                        <HardDrive className="h-5 w-5 text-ink/50" strokeWidth={1.75} />
                        <span className="text-sm font-medium">{d.name}</span>
                        <ChevronRight className="ml-auto h-4 w-4 text-ink/30" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : candidates.length === 0 ? (
                <div className="px-6 py-14 text-center text-sm text-ink/50">
                  <FolderOpen className="mx-auto mb-3 h-8 w-8 text-ink/25" strokeWidth={1.5} />
                  No sub-folders in <span className="font-medium text-ink/70">{folderName}</span>.
                  <br />
                  Go up a level, or import this folder itself as one project.
                </div>
              ) : (
                <ul className="divide-y divide-ink/[0.06]">
                  {candidates.map((c) => {
                    const checked = selected.has(c.path);
                    return (
                      <li key={c.path} className="flex items-center gap-3 px-6 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={c.already_imported}
                          onChange={() => toggle(c.path)}
                          aria-label={`Select ${c.name}`}
                          className="h-4 w-4 shrink-0 rounded border-ink/30 accent-blue-600 disabled:opacity-40"
                        />
                        <label
                          onClick={() => !c.already_imported && toggle(c.path)}
                          className={`min-w-0 flex-1 ${c.already_imported ? "opacity-50" : "cursor-pointer"}`}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{c.name}</span>
                            {c.already_imported && (
                              <span className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-ink/55">
                                Already imported
                              </span>
                            )}
                            {c.category && (
                              <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">
                                {c.category}
                              </span>
                            )}
                            {c.tags.slice(0, 4).map((t) => (
                              <span key={t} className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[11px] text-ink/55">
                                {t}
                              </span>
                            ))}
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] text-ink/50">
                            {c.description ?? "No description found"} · {c.file_count >= 5000 ? "5000+" : c.file_count} {c.file_count === 1 ? "file" : "files"}
                          </span>
                        </label>
                        <button
                          onClick={() => open(c.path)}
                          aria-label={`Open ${c.name}`}
                          title="Browse inside"
                          className="rounded-lg p-1.5 text-ink/35 hover:bg-ink/5 hover:text-ink"
                        >
                          <ChevronRight className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* footer */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-ink/[0.07] bg-[#FAFBFD] px-6 py-4">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink/70">
                <input
                  type="checkbox"
                  checked={importDocs}
                  onChange={(e) => setImportDocs(e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Also import README and docs as project context
              </label>
              {path !== "" && (
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink/70">
                  <input
                    type="checkbox"
                    checked={watchFolder}
                    onChange={(e) => setWatchFolder(e.target.checked)}
                    className="h-4 w-4 rounded accent-blue-600"
                  />
                  Keep watching this folder for new projects
                </label>
              )}
              {importable.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(importable.map((c) => c.path)))}
                  className="text-[13px] font-medium text-blue-600 hover:underline"
                >
                  {allSelected ? "Select none" : "Select all"}
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {path !== "" && (
                  <button
                    type="button"
                    onClick={watchOnly}
                    disabled={importing || loading}
                    title="Don't import anything now, just pick up folders added from here on"
                    className="rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-ink/70 hover:bg-ink/5 disabled:opacity-40"
                  >
                    Watch only
                  </button>
                )}
                {path !== "" && (
                  <button
                    type="button"
                    onClick={() => runImport([path])}
                    disabled={importing || loading}
                    title="Import the open folder itself as a single project"
                    className="rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-ink/70 hover:bg-ink/5 disabled:opacity-40"
                  >
                    Import this folder only
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => runImport([...selected], path)}
                  disabled={importing || loading || selected.size === 0}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {selected.size === 0 ? "Import" : `Import ${selected.size} project${selected.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
