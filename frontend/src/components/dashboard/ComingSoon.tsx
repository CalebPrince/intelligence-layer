import type { LucideIcon } from "lucide-react";
import Link from "next/link";

/** Stand-in for workspace pages that are in the navigation but not built yet. */
export function ComingSoon({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <main className="flex h-full items-center justify-center bg-[#F7F8FB] p-8">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/55">{body}</p>
        <span className="mt-4 inline-block rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-medium text-ink/55">
          Coming soon
        </span>
        <div className="mt-6">
          <Link href="/projects" className="text-sm font-medium text-blue-600 hover:underline">
            Back to All Projects
          </Link>
        </div>
      </div>
    </main>
  );
}
