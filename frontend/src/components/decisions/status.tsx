import { Archive, Check, Clock, RefreshCw } from "lucide-react";
import type { DecisionStatus } from "@/types";

export const STATUS_META: Record<
  DecisionStatus,
  { label: string; pill: string; tile: string; solid?: boolean; Icon: typeof Check }
> = {
  implemented: {
    label: "Implemented",
    pill: "bg-emerald-50 text-emerald-600",
    tile: "bg-emerald-500 text-white",
    solid: true,
    Icon: Check,
  },
  in_progress: { label: "In Progress", pill: "bg-blue-50 text-blue-600", tile: "bg-blue-50 text-blue-600", Icon: Clock },
  under_review: { label: "Under Review", pill: "bg-orange-50 text-orange-600", tile: "bg-orange-50 text-orange-500", Icon: RefreshCw },
  archived: { label: "Archived", pill: "bg-ink/[0.06] text-ink/55", tile: "bg-ink/[0.06] text-ink/45", Icon: Archive },
};

export function StatusTile({ status, size = "h-11 w-11" }: { status: DecisionStatus; size?: string }) {
  const m = STATUS_META[status];
  const Icon = m.Icon;
  return (
    <span className={`flex shrink-0 items-center justify-center ${m.solid ? "rounded-full" : "rounded-xl"} ${m.tile} ${size}`}>
      <Icon className="h-[52%] w-[52%]" strokeWidth={m.solid ? 3 : 2} />
    </span>
  );
}

export function StatusPill({ status }: { status: DecisionStatus }) {
  const m = STATUS_META[status];
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${m.pill}`}>{m.label}</span>;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
