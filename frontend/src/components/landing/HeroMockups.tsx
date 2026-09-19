import {
  Folder,
  Home,
  MessageSquare,
  MoreHorizontal,
  Search,
  Send,
  Settings,
} from "lucide-react";
import { LogoMark, Note, ProviderLogo } from "./Marks";

const NAV = ["Overview", "Chat", "Decisions", "Context", "Activity"];
const MODELS = [
  { provider: "openai", name: "ChatGPT" },
  { provider: "anthropic", name: "Claude" },
  { provider: "gemini", name: "Gemini" },
];
const AGENTS = [
  { name: "Wendy", tone: "bg-violet-400" },
  { name: "Chief", tone: "bg-orange-300" },
  { name: "Chloe", tone: "bg-teal-500" },
];

const PERSPECTIVES = [
  { provider: "anthropic", name: "Claude", body: "Overall the implementation is solid. A few security improvements recommended." },
  { provider: "openai", name: "ChatGPT", body: "Good structure. I'd recommend rotating refresh tokens and adding additional logging." },
  { provider: "gemini", name: "Gemini", body: "Looks good for production with minor changes. Consider rate limiting and monitoring." },
];

function Laptop() {
  return (
    <div className="relative w-full">
      {/* screen */}
      <div className="rounded-t-[18px] border border-ink/80 bg-ink p-[7px] shadow-2xl shadow-ink/20">
        <div className="flex h-[340px] overflow-hidden rounded-[10px] bg-white text-[8px] leading-tight text-ink sm:h-[390px]">
          {/* sidebar */}
          <div className="hidden w-[118px] shrink-0 flex-col bg-[#0F1424] p-3 text-white/70 sm:flex">
            <div className="flex items-center gap-1.5 text-[8px] font-semibold text-white">
              <LogoMark className="h-3.5 w-3.5 shrink-0" /> Inteli-Space
            </div>
            <ul className="mt-3 space-y-0.5">
              {NAV.map((n, i) => (
                <li key={n} className={`rounded px-1.5 py-1 ${i === 1 ? "bg-white/10 text-white" : ""}`}>
                  {n}
                </li>
              ))}
            </ul>
            <p className="mb-1 mt-3 text-[6px] uppercase tracking-widest text-white/35">Models</p>
            {MODELS.map((m) => (
              <div key={m.name} className="flex items-center gap-1.5 py-[3px]">
                <ProviderLogo provider={m.provider} tile className="h-3.5 w-3.5" />
                {m.name}
                <span className="ml-auto h-1 w-1 rounded-full bg-emerald-400" />
              </div>
            ))}
            <p className="mb-1 mt-3 text-[6px] uppercase tracking-widest text-white/35">Agents</p>
            {AGENTS.map((a) => (
              <div key={a.name} className="flex items-center gap-1.5 py-[3px]">
                <span className={`h-3.5 w-3.5 rounded ${a.tone}`} />
                {a.name}
              </div>
            ))}
            <div className="mt-auto flex items-center gap-1.5 border-t border-white/10 pt-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-200 text-[6px] font-bold text-ink">CA</span>
              <span className="min-w-0 flex-1 leading-none">
                <span className="block text-[7px] text-white">Caleb Akakpo</span>
                <span className="text-[5px] text-white/40">Workspace</span>
              </span>
              <Settings className="h-2 w-2" />
            </div>
          </div>

          {/* main */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#F7F8FB] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold">Haven Mobile App</span>
              <span className="flex items-center gap-1 rounded-md border border-ink/10 bg-white px-2 py-1 text-ink/40">
                <Search className="h-2 w-2" /> Search...
              </span>
            </div>

            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2">
              <p className="text-[7px] text-ink/50">
                <span className="font-semibold text-ink">You</span> 10:24 AM
              </p>
              <p className="text-[8px]">
                Review the authentication implementation and tell me if we&apos;re ready for production.
              </p>
            </div>

            <div className="mt-2 rounded-lg border border-ink/10 bg-white p-2.5">
              <div className="flex items-center gap-1.5">
                <LogoMark className="h-3.5 w-3.5" />
                <div>
                  <p className="text-[8px] font-semibold">Project Intelligence</p>
                  <p className="text-[6px] text-ink/40">Consulting multiple models based on your project context...</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {PERSPECTIVES.map((p) => (
                  <div key={p.name} className="rounded-md border border-ink/10 p-1.5">
                    <div className="mb-1 flex items-center gap-1 font-semibold">
                      <ProviderLogo provider={p.provider} tile className="h-3 w-3" />
                      {p.name}
                    </div>
                    <p className="text-[6.5px] text-ink/55">{p.body}</p>
                    <p className="mt-1 text-[6px] font-medium text-blue-600">View full response →</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 rounded-lg border border-ink/10 bg-white p-2.5">
              <p className="flex items-center gap-1 text-[8px] font-semibold">
                <LogoMark className="h-2.5 w-2.5" />
                Synthesis
                <span className="rounded bg-violet-100 px-1 text-[5.5px] font-bold uppercase text-violet-600">Recommended</span>
              </p>
              <p className="mt-0.5 text-[6.5px] text-ink/60">
                You&apos;re close to production. Implement the suggested security improvements and add token rotation.
                See full analysis for details.
              </p>
            </div>

            <div className="mt-auto flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white px-2 py-1.5">
              <span className="flex-1 text-[7px] text-ink/40">Ask anything about your project...</span>
                {["Auto", "ChatGPT", "Claude", "Gemini", "Parallel"].map((c, i) => (
                  <span key={c} className={`rounded-full px-1.5 py-0.5 text-[6px] ${i === 0 ? "bg-blue-50 text-blue-600" : "text-ink/50"}`}>
                  {c}
                </span>
              ))}
              <span className="flex h-4 w-4 items-center justify-center rounded bg-accent-gemini text-white">
                <Send className="h-2 w-2" />
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* base */}
      <div className="mx-[-3%] h-[14px] rounded-b-[14px] bg-gradient-to-b from-zinc-300 to-zinc-400 shadow-xl shadow-ink/15" />
      <div className="mx-auto -mt-[14px] h-[5px] w-[16%] rounded-b-md bg-zinc-400/80" />
    </div>
  );
}

function Phone() {
  return (
    <div className="w-[150px] rounded-[26px] border-[5px] border-ink bg-white p-3 shadow-2xl shadow-ink/25">
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/80" />
      <div className="flex justify-center"><LogoMark className="h-6 w-6" /></div>
      <p className="mt-2 text-[12px] font-bold leading-tight">
        Good morning,
        <br />
        Caleb
      </p>
      <p className="mt-1 text-[7px] text-ink/50">What would you like to work on today?</p>
      <div className="mt-2 space-y-1.5">
        {[
          ["Ask anything", "bg-blue-100"],
          ["Review files", "bg-sky-100"],
          ["Make a decision", "bg-violet-100"],
          ["Generate ideas", "bg-indigo-100"],
        ].map(([t, tone]) => (
          <div key={t} className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-2 py-1.5 text-[7px] font-medium">
            <span className={`h-2 w-2 rounded ${tone}`} />
            {t}
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between border-t border-ink/10 pt-1.5 text-[6px] text-ink/40">
        <span className="flex flex-col items-center text-ink"><Home className="h-2.5 w-2.5" />Home</span>
        <span className="flex flex-col items-center"><Folder className="h-2.5 w-2.5" />Projects</span>
        <span className="flex flex-col items-center"><MessageSquare className="h-2.5 w-2.5" />Chat</span>
        <span className="flex flex-col items-center"><MoreHorizontal className="h-2.5 w-2.5" />More</span>
      </div>
    </div>
  );
}

export default function HeroMockups() {
  return (
    <div className="relative mx-auto w-full max-w-[620px] pb-6 lg:mx-0">
      <Note arrow="down-left" className="absolute -top-8 right-2 hidden rotate-[-8deg] text-right md:block">
        Multiple AI models.
        <br />
        One workspace.
      </Note>
      <div className="pr-0 pt-2 md:pr-6 md:pt-14">
        <Laptop />
      </div>
      <div className="absolute -bottom-2 -right-6 hidden origin-bottom-right scale-[0.88] md:block">
        <Phone />
      </div>
    </div>
  );
}
