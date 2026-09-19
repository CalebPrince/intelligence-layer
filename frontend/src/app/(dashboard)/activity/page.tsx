"use client";

import { FileText, ListChecks } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listActivity, listProjects } from "@/lib/api";
import type { ActivityItem, Project } from "@/types";

const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";

function formatTs(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ActivityPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects(DEMO_OWNER_ID)
      .then((data) => {
        setProjects(data);
        if (!projectId && data.length > 0) router.replace(`/activity?project=${data[0].id}`);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    listActivity(projectId)
      .then(setActivity)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (projects.length === 0) {
    return (
      <main className="flex h-full items-center justify-center text-sm text-ink/40">
        No projects yet — start one from{" "}
        <a href="/chat" className="ml-1 underline">
          Chat
        </a>
        .
      </main>
    );
  }
  if (!projectId) {
    return <main className="flex h-full items-center justify-center text-sm text-ink/40">Loading…</main>;
  }

  return (
    <main className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl">Activity</h1>
        <p className="mt-1 text-sm text-ink/60">Every context item added and decision recorded, in order.</p>

        {loading ? (
          <p className="mt-8 text-sm text-ink/40">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="mt-8 text-sm text-ink/40">Nothing yet — add context or record a decision to see it here.</p>
        ) : (
          <ul className="mt-8 flex flex-col gap-2">
            {activity.map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5">
                  {item.kind === "context" ? (
                    <FileText className="h-4 w-4 text-ink/50" strokeWidth={2} />
                  ) : (
                    <ListChecks className="h-4 w-4 text-ink/50" strokeWidth={2} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.kind === "context" ? "Context added" : "Decision recorded"}
                    <span className="ml-2 font-normal text-ink/50">{item.label}</span>
                  </p>
                  {item.detail && <p className="truncate text-xs text-ink/40">{item.detail}</p>}
                </div>
                <span className="shrink-0 text-xs text-ink/40">{formatTs(item.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<main className="flex h-full items-center justify-center text-sm text-ink/40">Loading…</main>}>
      <ActivityPageInner />
    </Suspense>
  );
}
