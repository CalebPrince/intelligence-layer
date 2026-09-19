"use client";

import { Check, ChevronDown, FolderKanban, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Project } from "@/types";

export function ProjectSwitcher({
  projects,
  projectId,
  onSelect,
  onSelectAll,
}: {
  projects: Project[];
  projectId: string | null;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = projects.find((p) => p.id === projectId);
  // the dropdown is alphabetical (the All Projects page is the one ordered by recency)
  const alphabetical = [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative px-3 pb-2">
      <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Project</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/10"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
          <FolderKanban className="h-4 w-4 text-white" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{current?.name ?? "Select a project"}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-paper/40 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#14141a] shadow-2xl">
          <div className="max-h-64 overflow-y-auto py-1">
            {projects.length === 0 ? (
              <p className="px-3 py-2 text-xs text-paper/35">No projects yet</p>
            ) : (
              alphabetical.map((p) => {
                const selected = p.id === projectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelect(p.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                      selected ? "bg-white/10 text-paper" : "text-paper/70 hover:bg-white/5 hover:text-paper"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-white/10 p-1">
            <button
              type="button"
              onClick={() => {
                onSelectAll();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-paper/70 transition hover:bg-white/5 hover:text-paper"
            >
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              All projects
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
