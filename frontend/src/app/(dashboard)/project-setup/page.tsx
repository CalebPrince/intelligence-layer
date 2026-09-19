"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plug, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import {
  createMcpConnection, createProjectSkill, deleteMcpConnection, deleteProjectSkill,
  getProjectInstructions, listMcpConnections, listProjectSkills, saveProjectInstructions,
} from "@/lib/api";
import type { McpConnection, ProjectSkill } from "@/types";

const CARD = "rounded-2xl border border-ink/[0.07] bg-white p-6 shadow-[0_1px_2px_rgba(11,14,20,0.03)]";

function Setup() {
  const projectId = useSearchParams().get("project");
  const [instructions, setInstructions] = useState("");
  const [active, setActive] = useState(true);
  const [version, setVersion] = useState(0);
  const [skills, setSkills] = useState<ProjectSkill[]>([]);
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [skill, setSkill] = useState({ name: "", description: "", instructions: "", tools: "" });
  const [mcp, setMcp] = useState({ name: "", url: "", headers: "", tools: "" });
  const [status, setStatus] = useState("");

  async function load() {
    if (!projectId) return;
    const [i, s, m] = await Promise.all([getProjectInstructions(projectId), listProjectSkills(projectId), listMcpConnections(projectId)]);
    setInstructions(i.content); setActive(i.is_active); setVersion(i.version); setSkills(s); setConnections(m);
  }
  useEffect(() => { load().catch((e) => setStatus(e.message)); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!projectId) return <main className="p-8 text-sm text-ink/50">Choose a project first.</main>;
  return <main className="h-full overflow-y-auto bg-[#F7F8FA] p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Project intelligence</p><h1 className="mt-1 font-display text-3xl font-bold">Instructions, skills & tools</h1><p className="mt-2 text-sm text-ink/55">One operating layer shared by every model and connected agent in this project.</p></div>
      {status && <p className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">{status}</p>}
      <section className={CARD}>
        <div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-bold">Shared instructions</h2><p className="text-xs text-ink/45">Automatically included in every project conversation. Version {version}.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label></div>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={12} placeholder="# Objective\n\n# Technical rules\n\n# Approval rules" className="mt-4 w-full rounded-xl border border-ink/10 p-4 font-mono text-sm outline-none focus:border-blue-400" />
        <button onClick={async () => { const saved = await saveProjectInstructions(projectId, instructions, active); setVersion(saved.version); setStatus("Instructions saved"); }} className="mt-3 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Save className="h-4 w-4" /> Save instructions</button>
      </section>
      <section className={CARD}>
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-600" /><h2 className="font-display text-lg font-bold">Project skills</h2></div>
        <p className="mt-1 text-xs text-ink/45">Relevant skills are selected by description; their full instructions and allowed tools are then loaded.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><input placeholder="Skill name" value={skill.name} onChange={(e) => setSkill({...skill, name:e.target.value})} className="rounded-lg border p-2 text-sm"/><input placeholder="When should this skill be used?" value={skill.description} onChange={(e) => setSkill({...skill, description:e.target.value})} className="rounded-lg border p-2 text-sm"/><textarea placeholder="Skill instructions" value={skill.instructions} onChange={(e) => setSkill({...skill, instructions:e.target.value})} className="rounded-lg border p-2 text-sm md:col-span-2"/><input placeholder="Extra tools, comma-separated (e.g. delegate_to_agent)" value={skill.tools} onChange={(e) => setSkill({...skill, tools:e.target.value})} className="rounded-lg border p-2 text-sm md:col-span-2"/></div>
        <button onClick={async () => { await createProjectSkill(projectId, { name:skill.name, description:skill.description, instructions:skill.instructions, tool_names:skill.tools.split(",").map(x=>x.trim()).filter(Boolean), is_enabled:true }); setSkill({name:"",description:"",instructions:"",tools:""}); await load(); }} disabled={!skill.name || !skill.description || !skill.instructions} className="mt-3 flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4"/> Add skill</button>
        <div className="mt-4 space-y-2">{skills.map(s => <div key={s.id} className="flex items-start justify-between rounded-xl border border-ink/10 p-3"><div><p className="font-semibold">{s.name}</p><p className="text-sm text-ink/55">{s.description}</p><p className="mt-1 text-xs text-blue-600">{s.tool_names.join(", ") || "Default read-only tools"}</p></div><button aria-label="Delete skill" onClick={async()=>{await deleteProjectSkill(projectId,s.id); await load();}}><Trash2 className="h-4 w-4 text-rose-500"/></button></div>)}</div>
      </section>
      <section className={CARD}>
        <div className="flex items-center gap-2"><Plug className="h-5 w-5 text-emerald-600"/><h2 className="font-display text-lg font-bold">MCP connections</h2></div>
        <p className="mt-1 text-xs text-ink/45">Connect Streamable HTTP MCP servers. Header values are stored server-side and never returned to the browser.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><input placeholder="Connection name" value={mcp.name} onChange={e=>setMcp({...mcp,name:e.target.value})} className="rounded-lg border p-2 text-sm"/><input placeholder="https://server.example.com/mcp" value={mcp.url} onChange={e=>setMcp({...mcp,url:e.target.value})} className="rounded-lg border p-2 text-sm"/><input placeholder='Headers JSON, e.g. {"Authorization":"Bearer ..."}' value={mcp.headers} onChange={e=>setMcp({...mcp,headers:e.target.value})} className="rounded-lg border p-2 text-sm"/><input placeholder="Allowed remote tools, comma-separated; blank allows all" value={mcp.tools} onChange={e=>setMcp({...mcp,tools:e.target.value})} className="rounded-lg border p-2 text-sm"/></div>
        <button onClick={async()=>{try { await createMcpConnection(projectId,{name:mcp.name,url:mcp.url,headers:mcp.headers?JSON.parse(mcp.headers):{},allowed_tools:mcp.tools.split(",").map(x=>x.trim()).filter(Boolean),is_enabled:true}); setMcp({name:"",url:"",headers:"",tools:""}); await load(); } catch(e) { setStatus(e instanceof Error?e.message:"Could not add MCP server"); }}} disabled={!mcp.name||!mcp.url} className="mt-3 flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4"/> Add MCP server</button>
        <div className="mt-4 space-y-2">{connections.map(c=><div key={c.id} className="flex items-start justify-between rounded-xl border border-ink/10 p-3"><div><p className="font-semibold">{c.name}</p><p className="text-sm text-ink/55">{c.url}</p><p className="mt-1 text-xs text-emerald-700">Headers: {c.header_names.join(", ")||"none"} · Tools: {c.allowed_tools.join(", ")||"all"}</p></div><button aria-label="Delete connection" onClick={async()=>{await deleteMcpConnection(projectId,c.id); await load();}}><Trash2 className="h-4 w-4 text-rose-500"/></button></div>)}</div>
      </section>
    </div>
  </main>;
}

export default function ProjectSetupPage() { return <Suspense fallback={<main className="p-8 text-sm text-ink/50">Loading...</main>}><Setup /></Suspense>; }
