import { LogoMark } from "@/components/landing/Marks";

const MOODS = [
  { bg: "bg-emerald-200", face: "#0F7A4A", mouth: "M8 14q4 4 8 0" },
  { bg: "bg-amber-200", face: "#B7791F", mouth: "M8 15h8" },
  { bg: "bg-rose-200", face: "#B4374B", mouth: "M8 16q4-3 8 0" },
  { bg: "bg-orange-200", face: "#B45309", mouth: "M8 16q4-3 8 0" },
  { bg: "bg-blue-200", face: "#1D4ED8", mouth: "M8 16q4-3 8 0" },
  { bg: "bg-teal-200", face: "#0F766E", mouth: "M8 14q4 4 8 0" },
];

function Face({ face, mouth }: { face: string; mouth: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={face} strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <circle cx="9" cy="10" r="0.6" fill={face} />
      <circle cx="15" cy="10" r="0.6" fill={face} />
      <path d={mouth} />
    </svg>
  );
}

/** Decorative two-phone illustration for the project overview banner. */
export function HeroArt({ name }: { name: string }) {
  return (
    <div className="relative hidden h-full w-[360px] shrink-0 md:block" aria-hidden>
      {/* soft mountain wash behind the phones */}
      <svg
        viewBox="0 0 360 280"
        className="absolute inset-0 h-full w-full [mask-image:linear-gradient(to_right,transparent,black_35%,black_65%,transparent)]"
        preserveAspectRatio="none"
        fill="none"
      >
        <path d="M0 210 90 140 150 180 230 90 360 200V280H0Z" fill="#C9D6F5" fillOpacity="0.55" />
        <path d="M0 240 110 170 190 215 280 150 360 230V280H0Z" fill="#B4C4F0" fillOpacity="0.5" />
      </svg>

      {/* back phone */}
      <div className="absolute bottom-[-40px] left-[150px] w-[150px] rotate-[5deg] rounded-[26px] border-[5px] border-ink bg-white p-3 pb-16 shadow-2xl shadow-ink/20">
        <p className="mt-3 text-center text-[11px] font-semibold leading-tight">
          How are you feeling
          <br />
          today?
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {MOODS.map((m, i) => (
            <span key={i} className={`flex h-9 items-center justify-center rounded-full ${m.bg}`}>
              <Face face={m.face} mouth={m.mouth} />
            </span>
          ))}
        </div>
      </div>

      {/* front phone */}
      <div className="absolute bottom-[-56px] left-[38px] w-[150px] -rotate-[3deg] overflow-hidden rounded-[26px] border-[5px] border-ink bg-white shadow-2xl shadow-ink/25">
        <div className="px-3 pt-4 text-center">
          <div className="flex justify-center">
            <LogoMark className="h-7 w-7" />
          </div>
          <p className="mt-1 text-[10px] font-semibold">{name}</p>
          <p className="mt-2 font-display text-[13px] font-bold leading-tight">
            A calmer you,
            <br />
            brighter tomorrow
          </p>
        </div>
        <svg viewBox="0 0 150 130" className="mt-1 h-[130px] w-full">
          <defs>
            <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#DCE8FF" />
              <stop offset="1" stopColor="#F7E7D9" />
            </linearGradient>
          </defs>
          <rect width="150" height="130" fill="url(#hero-sky)" />
          <path d="M0 105 40 55 70 85 105 40 150 95V130H0Z" fill="#6B8FB8" />
          <path d="M0 118 50 85 90 108 150 78V130H0Z" fill="#3E7A88" />
        </svg>
        <div className="bg-ink px-3 py-2 text-center text-[9px] font-semibold text-white">Get Started</div>
      </div>
    </div>
  );
}
