import type { ReactNode } from "react";

/** Eyebrow + big title + green banner header, shared by the workspace pages
 * (Agents, Analytics, Integrations, Settings, Decisions). */
export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  bannerTitle,
  bannerBody,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  icon: ReactNode;
  bannerTitle: ReactNode;
  bannerBody: string;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,470px)]">
      <div className="px-2 pt-1">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {eyebrow}
        </span>
        <h1 className="mt-2 font-display text-[44px] font-extrabold leading-[1.05] tracking-[-0.035em]">{title}</h1>
        <p className="mt-3 max-w-[640px] text-[17px] leading-snug text-ink/60">{description}</p>
      </div>
      <div className="relative min-h-[160px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#EEF6F1] to-[#DDEFE4]">
        <svg viewBox="0 0 470 220" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
          <path d="M230 220C280 100 350 30 420 70s50 70 50 70V220Z" fill="#12A150" fillOpacity="0.16" />
          <path d="M320 220C370 140 420 110 470 130V220Z" fill="#12A150" fillOpacity="0.2" />
        </svg>
        <div className="relative flex items-center gap-5 p-7">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70 text-emerald-600">{icon}</span>
          <div>
            <p className="font-display text-[20px] font-bold leading-tight">{bannerTitle}</p>
            <p className="mt-1.5 max-w-[230px] text-[13px] leading-snug text-ink/60">{bannerBody}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
