"use client";

import { Archive, Check, Clock, Copy, MessageSquare, MoreHorizontal, Pencil, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DecisionStatus } from "@/types";

const ITEMS: { status: DecisionStatus; label: string; Icon: typeof Check }[] = [
  { status: "implemented", label: "Mark as Implemented", Icon: Check },
  { status: "in_progress", label: "Mark as In Progress", Icon: Clock },
  { status: "under_review", label: "Mark as Under Review", Icon: RefreshCw },
  { status: "archived", label: "Archive", Icon: Archive },
];

export function DecisionMenu({
  status,
  chatHref,
  onStatus,
  onEdit,
  onCopy,
}: {
  status: DecisionStatus;
  chatHref: string;
  onStatus: (s: DecisionStatus) => void;
  onEdit: () => void;
  onCopy: () => void;
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

  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink/75 hover:bg-ink/5";

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Decision actions"
        className="rounded-lg p-1.5 text-ink/45 transition hover:bg-ink/5 hover:text-ink"
      >
        <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
          {ITEMS.filter((i) => i.status !== status).map(({ status: s, label, Icon }) => (
            <button
              key={s}
              className={item}
              onClick={() => {
                setOpen(false);
                onStatus(s);
              }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} /> {label}
            </button>
          ))}
          <div className="my-1 border-t border-ink/[0.07]" />
          <button
            className={item}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Edit title and tags
          </button>
          <button
            className={item}
            onClick={() => {
              setOpen(false);
              onCopy();
            }}
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2} /> Copy decision text
          </button>
          <Link href={chatHref} className={item}>
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} /> Open in Chat
          </Link>
        </div>
      )}
    </div>
  );
}
