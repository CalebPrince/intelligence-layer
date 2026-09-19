"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Bot, ChevronDown, ExternalLink, FileText, HelpCircle, MessageSquare, Plug, Search, Settings, Sparkles, Wrench } from "lucide-react";
import { PageHero } from "@/components/dashboard/PageHero";

const CARD = "rounded-2xl border border-ink/[0.07] bg-white shadow-[0_1px_2px_rgba(11,14,20,0.03)]";
const GUIDES = [
  { title: "Start a project", body: "Create a project, import a local folder or GitHub repository, then add the documents every model should share.", href: "/projects", icon: BookOpen },
  { title: "Chat across models", body: "Use Auto for routing, select one provider, compare models in Parallel, or use Deliberate for critique and synthesis.", href: "/chat", icon: MessageSquare },
  { title: "Set project instructions", body: "Define project-specific goals, technical rules, approval boundaries, and reusable skills.", href: "/project-setup", icon: FileText },
  { title: "Connect MCP tools", body: "Add a Streamable HTTP MCP server, protect credentials, and allow only the tools models should see.", href: "/settings", icon: Plug },
  { title: "Work with agents", body: "Delegate specialist tasks to the live agent roster and save useful answers as project decisions.", href: "/agents", icon: Bot },
  { title: "Configure the workspace", body: "Manage global instructions, model visibility, notifications, security policy, team defaults, and credits.", href: "/settings", icon: Settings },
];
const FAQ = [
  ["What is the difference between global and project instructions?", "Global instructions apply to every project. Project instructions are added afterward and contain rules specific to one project. Both are sent to routed models and connected agents."],
  ["How are project skills selected?", "Inteli-Space compares the current request with each enabled skill name and description. It loads full instructions only for relevant skills, keeping prompts smaller."],
  ["Can a model call tools?", "Yes. Models can search, list, and read project context, delegate bounded work to agents, and call tools from enabled project MCP connections."],
  ["Are MCP credentials shown to models?", "No. Authentication headers remain on the backend. Models receive tool schemas and results, not stored credential values."],
  ["What does Accept as decision do?", "It records the selected response as a project decision. That history contributes to future model-affinity routing for the same task type."],
  ["Why is a model offline?", "A provider becomes active when its API key is configured on the backend. Check Settings → Models for current status."],
  ["Why did an MCP server expose no tools?", "Confirm that it supports Streamable HTTP MCP, authentication headers are correct, and the allowlist matches remote tool names."],
  ["How is provider credit calculated?", "It is an estimate: the balance entered in Inteli-Space minus usage recorded by this app."],
];
const SHORTCUTS = [["Enter", "Send a chat message"], ["Shift + Enter", "Add a new line"], ["/", "Focus search where supported"], ["Esc", "Close an open dialog"]];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const normalized = query.trim().toLowerCase();
  const guides = useMemo(() => GUIDES.filter((guide) => !normalized || `${guide.title} ${guide.body}`.toLowerCase().includes(normalized)), [normalized]);
  const faq = useMemo(() => FAQ.map((item, index) => ({ item, index })).filter(({ item }) => !normalized || item.join(" ").toLowerCase().includes(normalized)), [normalized]);

  return <main className="h-full overflow-y-auto bg-[#F5F7FB] p-5"><div className="mx-auto max-w-[1200px] space-y-4">
    <PageHero eyebrow="Help center" title="Help & Support" description="Learn the workflows, troubleshoot connections, and get the most from your shared project intelligence." icon={<HelpCircle className="h-7 w-7" strokeWidth={1.75}/>} bannerTitle={<>Build with clarity.<br/>Every model, one context.</>} bannerBody="Practical guidance for projects, agents, skills and tools."/>
    <div className={`${CARD} p-5`}><div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-ink/10 bg-[#FAFBFD] px-4"><Search className="h-4 w-4 text-ink/40"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search guides and common questions..." className="h-12 flex-1 bg-transparent text-sm outline-none"/></div></div>
    <section className={`${CARD} p-5`}><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-blue-600"/><h2 className="font-display text-lg font-bold">Getting started</h2></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{guides.map(({title,body,href,icon:Icon})=><Link key={title} href={href} className="group rounded-xl border border-ink/[0.07] p-4 transition hover:border-blue-200 hover:bg-blue-50/30"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5"/></span><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-[13px] leading-relaxed text-ink/55">{body}</p><span className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-600">Open <ExternalLink className="h-3 w-3"/></span></Link>)}</div>{guides.length===0&&<p className="py-8 text-center text-sm text-ink/45">No guide matches that search.</p>}</section>
    <div className="grid gap-4 lg:grid-cols-[1.5fr_0.7fr]"><section className={`${CARD} p-5`}><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-violet-600"/><h2 className="font-display text-lg font-bold">Common questions</h2></div><div className="mt-4 divide-y divide-ink/[0.07]">{faq.map(({item:[question,answer],index})=><div key={question}><button onClick={()=>setOpenFaq(openFaq===index?null:index)} className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-semibold"><span>{question}</span><ChevronDown className={`h-4 w-4 shrink-0 transition ${openFaq===index?"rotate-180":""}`}/></button>{openFaq===index&&<p className="pb-4 pr-8 text-[13px] leading-relaxed text-ink/60">{answer}</p>}</div>)}</div>{faq.length===0&&<p className="py-8 text-center text-sm text-ink/45">No question matches that search.</p>}</section><div className="space-y-4"><section className={`${CARD} p-5`}><h2 className="font-display text-[15px] font-bold">Keyboard shortcuts</h2><div className="mt-3 space-y-2">{SHORTCUTS.map(([keys,label])=><div key={keys} className="flex items-center justify-between gap-3 text-[13px]"><span className="text-ink/55">{label}</span><kbd className="rounded-md border border-ink/10 bg-[#FAFBFD] px-2 py-1 font-mono text-[11px]">{keys}</kbd></div>)}</div></section><section className="rounded-2xl bg-[#0D1220] p-5 text-white"><h2 className="font-display text-[15px] font-bold">Need deeper diagnostics?</h2><p className="mt-2 text-[13px] leading-relaxed text-white/60">Check server and model failures, including request paths and recorded error details.</p><Link href="/errors" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-ink">Open error logs <ExternalLink className="h-3 w-3"/></Link></section></div></div>
  </div></main>;
}
