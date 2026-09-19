export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lm-g" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F7CFF" />
          <stop offset="1" stopColor="#12A150" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 29.5 16 16 29.5 2.5 16Z" fill="url(#lm-g)" />
      <path d="M16 9 23 16 16 23 9 16Z" fill="#fff" />
    </svg>
  );
}

const LOGO_SRC: Record<string, string> = {
  openai: "/logos/openai.svg",
  anthropic: "/logos/claude-color.svg",
  gemini: "/logos/gemini-color.svg",
};

/** The provider's real logo. `tile` puts it on a small white rounded square. */
export function ProviderLogo({
  provider,
  className = "h-5 w-5",
  tile = false,
}: {
  provider: string;
  className?: string;
  tile?: boolean;
}) {
  const src = LOGO_SRC[provider];
  if (!src) return <span className={`shrink-0 rounded-md bg-ink/20 ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={src} alt="" className={tile ? "h-[62%] w-[62%]" : "h-full w-full"} />;
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${tile ? "rounded-lg border border-ink/10 bg-white shadow-sm" : ""} ${className}`}
    >
      {img}
    </span>
  );
}

/** Marginal handwritten note with an optional hand-drawn arrow. */
export function Note({
  children,
  className = "",
  arrow,
}: {
  children: React.ReactNode;
  className?: string;
  arrow?: "down-left" | "down-right";
}) {
  return (
    <div className={`pointer-events-none select-none font-hand text-[22px] leading-[1.05] text-ink/80 ${className}`} aria-hidden>
      {children}
      {arrow && (
        <svg
          viewBox="0 0 60 40"
          className={`mt-1 h-9 w-14 text-ink/70 ${arrow === "down-right" ? "-scale-x-100" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M52 4C40 6 20 10 12 30" />
          <path d="M6 22 12 31 20 25" />
        </svg>
      )}
    </div>
  );
}
