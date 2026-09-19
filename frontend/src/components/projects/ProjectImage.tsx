import { LogoMark } from "@/components/landing/Marks";

/** Default project image (every project uses it until projects can have their own). */
export function ProjectImage({ className = "h-11 w-11", mark = "h-6 w-6" }: { className?: string; mark?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-emerald-50 ring-1 ring-ink/[0.06] ${className}`}
    >
      <LogoMark className={mark} />
    </span>
  );
}
