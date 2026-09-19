import { ArrowRight, Brain, Check, ChevronDown, CircleDot, FileText, FolderOpen, GitBranch, MessageSquare, Network, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import HeroMockups from "@/components/landing/HeroMockups";
import { LogoMark, Note, ProviderLogo } from "@/components/landing/Marks";

const NAV_LINKS = [
  { label: "The layer", href: "#layer" },
  { label: "Workflows", href: "#workflows" },
  { label: "Roadmap", href: "#roadmap" },
];

const FEATURES = [
  {
    icon: <MessageSquare className="h-5 w-5" strokeWidth={2} />,
    tone: "bg-emerald-100 text-emerald-600",
    title: "Route the question",
    body: "Ask Claude, ChatGPT and Gemini together, or direct a question to exactly one model by name.",
  },
  {
    icon: <FolderOpen className="h-5 w-5" strokeWidth={2} />,
    tone: "bg-blue-100 text-blue-600",
    title: "Own the context",
    body: "Your files, GitHub repositories, notes and decisions become a working knowledge layer.",
  },
  {
    icon: <CheckRing className="h-5 w-5" />,
    tone: "bg-orange-100 text-orange-500",
    title: "Keep the decision",
    body: "Accept the answer you acted on and keep its reasoning connected to the project.",
  },
  {
    icon: <Users className="h-5 w-5" strokeWidth={2} />,
    tone: "bg-blue-100 text-blue-600",
    title: "Bring in the agents",
    body: "Real princecaleb.dev agents continue their roles with shared memory and project history.",
  },
];

const STEPS = [
  {
    icon: <FileText className="h-5 w-5" strokeWidth={2} />,
    tone: "bg-blue-100 text-blue-600",
    title: "Connect the source",
    body: "Import GitHub, docs, notes and links into one project library",
  },
  {
    icon: <ProviderLogo provider="openai" className="h-6 w-6" />,
    tone: "bg-emerald-100",
    title: "Route the work",
    body: "Use model perspectives or address Claude, ChatGPT or Gemini directly",
  },
  {
    icon: <ProviderLogo provider="gemini" className="h-6 w-6" />,
    tone: "bg-violet-100",
    title: "Make the call",
    body: "Compare answers, save a decision and keep the thread findable",
  },
  {
    icon: <CheckRing className="h-5 w-5" />,
    tone: "bg-orange-100 text-orange-500",
    title: "Carry it forward",
    body: "Agents and future chats inherit the context that matters",
  },
];

function CheckRing({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 9.5" />
    </svg>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-tint px-3.5 py-1.5 text-xs font-medium text-ink/70">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip bg-paper">
      {/* nav + hero share a soft green wash, like the concept art */}
      <div className="relative bg-[radial-gradient(60%_50%_at_85%_10%,#E3F4EA_0%,transparent_70%),radial-gradient(40%_40%_at_0%_0%,#F1F8F3_0%,transparent_70%)]">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-lg font-bold tracking-tight">Inteli-Space</span>
          </Link>
          <div className="hidden items-center gap-8 text-[13px] text-ink/70 lg:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.label} href={l.href} className="hover:text-ink">
                {l.label}
              </a>
            ))}
            <button type="button" className="flex items-center gap-1 hover:text-ink">
              Resources <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="hidden text-[13px] font-medium text-ink/80 hover:text-ink sm:block">
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-brand-hover"
            >
              Get started free <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
            </Link>
          </div>
        </nav>

        {/* hero */}
        <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-24 pt-10 lg:grid-cols-[1fr_1.15fr] lg:pt-14">
          <div>
            <Pill>Your project, with memory</Pill>
            <h1 className="mt-6 font-display text-[44px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
              Stop starting
              <br />
              <span className="text-brand">from zero.</span>
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink/60">
              Inteli-Space gives every model and agent the same living picture of your project, so the next answer starts where the last decision ended.
            </p>
            <div className="mt-8">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2.5 rounded-xl bg-ink px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-ink/85"
              >
                Enter your workspace <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink/60">
              {["All major AI models", "Project-aware", "Built for real work"].map((t) => (
                <span key={t} className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand">
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                  </span>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <HeroMockups />
        </section>
      </div>

      {/* features */}
      <section id="features" className="mx-auto max-w-7xl px-6 pb-8 pt-20">
        <div className="text-center">
            <Pill>Why Inteli-Space</Pill>
          <h2 className="mt-5 font-display text-4xl font-extrabold tracking-[-0.025em] sm:text-[44px]">
            A better way to <span className="text-brand">work with AI</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink/60">
            Go beyond single-model chat. Get a project-aware intelligence layer that brings together
            the best AI models, your context, and your team.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon, tone, title, body }) => (
            <div key={title} className="min-h-[210px] rounded-2xl border border-ink/[0.07] bg-white p-6 shadow-[0_1px_2px_rgba(11,14,20,0.04)]">
              <span className={`flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>{icon}</span>
              <p className="mt-5 font-display text-[17px] font-bold tracking-tight">{title}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/55">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* see it in action */}
      <section
        id="how-it-works"
        className="bg-[radial-gradient(50%_60%_at_80%_50%,#EAF6EF_0%,transparent_75%)]"
      >
        <div id="use-cases" className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-24 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Pill>A working loop</Pill>
            <h2 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[52px]">
              From questions
              <br />
              <span className="text-brand">to decisions.</span>
            </h2>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink/60">
              Bring in the source, ask the room, choose what matters, and let the next conversation inherit the work.
            </p>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-ink/[0.06] bg-white/60 p-4 shadow-[0_20px_60px_-30px_rgba(11,14,20,0.25)] backdrop-blur">
              <div className="space-y-2.5">
                {STEPS.map(({ icon, tone, title, body }) => (
                  <div
                    key={title}
                    className="flex items-center gap-4 rounded-2xl border border-ink/[0.06] bg-white px-5 py-4"
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                      {icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[15px] font-bold tracking-tight">{title}</p>
                      <p className="text-sm text-ink/55">{body}</p>
                    </div>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand">
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <Note arrow="down-right" className="absolute -bottom-20 right-2 hidden rotate-[-6deg] text-right lg:block">
              Same question.
              <br />
              More perspective.
              <br />
              Better decisions.
            </Note>
          </div>
        </div>
      </section>

      <section id="roadmap" className="mx-auto max-w-7xl px-6 py-24">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-xl">
            <Pill>What&apos;s next</Pill>
            <h2 className="mt-5 font-display text-4xl font-extrabold tracking-[-0.035em] sm:text-5xl">The workspace keeps getting more useful.</h2>
          </div>
          <p className="max-w-sm text-[15px] leading-relaxed text-ink/55">The foundation is live today. The next layer makes the intelligence easier to inspect, delegate and trust.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: <Network className="h-5 w-5" />, title: "Agent workspace", body: "More of the real princecaleb.dev team, with persistent memory and roles that stay true across apps.", tone: "bg-blue-100 text-blue-600" },
            { icon: <ShieldCheck className="h-5 w-5" />, title: "Outcome-aware routing", body: "Move beyond accepted answers and learn which decisions actually worked for the project.", tone: "bg-emerald-100 text-emerald-600" },
            { icon: <GitBranch className="h-5 w-5" />, title: "Safer project changes", body: "Review proposed file changes, keep context synced, and make the path from answer to branch explicit.", tone: "bg-orange-100 text-orange-600" },
          ].map(({ icon, title, body, tone }) => (
            <div key={title} className="rounded-2xl border border-ink/[0.08] bg-white p-6 shadow-[0_8px_25px_-20px_rgba(11,14,20,0.4)]">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
              <h3 className="mt-5 font-display text-lg font-bold">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/55">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* bottom cta */}
      <section id="get-started" className="relative overflow-hidden bg-brand-deep px-6 pb-40 pt-24 text-white">
        <svg
          viewBox="0 0 1440 260"
          preserveAspectRatio="none"
          className="pointer-events-none absolute bottom-0 left-0 h-[260px] w-full"
          fill="none"
          aria-hidden
        >
          <path d="M0 150C160 40 340 30 520 110s360 100 520 20 300-70 400-30V260H0Z" fill="#0B4A33" fillOpacity="0.5" />
          <path d="M0 210C180 120 360 130 540 180s340 50 500-10 280-40 400 0V260H0Z" fill="#0E6B47" fillOpacity="0.35" />
          <path d="M0 150C160 40 340 30 520 110s360 100 520 20 300-70 400-30" stroke="#3DDC84" strokeOpacity="0.3" />
        </svg>
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">Your next answer should remember the last one.</p>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-[-0.025em] sm:text-5xl">
            Your projects. <span className="text-[#3DDC84]">All models.</span> One living context.
          </h2>
          <p className="mt-4 text-base text-white/70">Open the workspace and bring one project into focus.</p>
          <div className="mt-9">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2.5 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-ink transition hover:bg-white/90"
            >
              Open your workspace <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </Link>
          </div>
        </div>
        <Note className="absolute bottom-10 right-[8%] hidden rotate-[-8deg] !text-white/80 lg:block">
          Think.
          <br />
          Build.
          <br />
          Move faster.
        </Note>
      </section>
    </main>
  );
}
