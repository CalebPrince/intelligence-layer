import { FileCode2, FileText, Image as ImageIcon, Link2, MessageSquare, StickyNote } from "lucide-react";
import type { LibraryKind } from "@/types";

export const KIND_META: Record<LibraryKind, { label: string; Icon: typeof FileText; tone: string }> = {
  file: { label: "File", Icon: FileText, tone: "bg-blue-50 text-blue-600" },
  note: { label: "Note", Icon: StickyNote, tone: "bg-orange-50 text-orange-500" },
  link: { label: "Link", Icon: Link2, tone: "bg-blue-50 text-blue-600" },
  code: { label: "Code", Icon: FileCode2, tone: "bg-emerald-50 text-emerald-600" },
  image: { label: "Image", Icon: ImageIcon, tone: "bg-emerald-50 text-emerald-600" },
  conversation: { label: "Conversation", Icon: MessageSquare, tone: "bg-violet-50 text-violet-600" },
};

const DOC_TONE: Record<string, string> = {
  pdf: "bg-red-50 text-red-500",
  docx: "bg-blue-50 text-blue-600",
  pptx: "bg-orange-50 text-orange-500",
  xlsx: "bg-emerald-50 text-emerald-600",
};

export function KindTile({ kind, size = "h-10 w-10", title }: { kind: LibraryKind; size?: string; title?: string }) {
  const meta = KIND_META[kind];
  const ext = title && title.includes(".") ? title.split(".").pop()!.toLowerCase() : "";
  const Icon = meta.Icon;
  const tone = kind === "file" && DOC_TONE[ext] ? DOC_TONE[ext] : meta.tone;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl ${tone} ${size}`}>
      <Icon className="h-[46%] w-[46%]" strokeWidth={1.75} />
    </span>
  );
}

export function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) return `${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatSize(chars: number): string {
  if (chars < 1000) return `${chars} chars`;
  return `${(chars / 1000).toFixed(chars < 10000 ? 1 : 0)}k chars`;
}

/** What one "page" is for each document type (shown next to the page count). */
export function pageUnit(name?: string | null, n?: number | null): string {
  const ext = name && name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const unit = ext === "xlsx" ? "sheet" : ext === "pptx" ? "slide" : "page";
  return `${n ?? 0} ${unit}${n === 1 ? "" : "s"}`;
}
