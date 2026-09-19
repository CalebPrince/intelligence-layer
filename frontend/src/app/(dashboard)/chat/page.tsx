"use client";

import {
  Layers,
  Mic,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Split,
  Users,
  X,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatContextPanel } from "@/components/chat/ChatContextPanel";
import { ProjectIntelligence } from "@/components/chat/ProjectIntelligence";
import { formatTime, providerLabel, resolvedContent, type Turn } from "@/components/chat/turn";
import { LogoMark, ProviderLogo } from "@/components/landing/Marks";
import { approveGitHubProposal, clearChat, createChatConversation, createGitHubProposal, createProject, getChatHistory, getProject, listModels, recordDecision, rejectGitHubProposal, sendChat } from "@/lib/api";
import { AGENTS } from "@/lib/agents";
import type { Capability, ChatMessage, ChatResponse, GitHubActionMode, GitHubFileChange, GitHubActionProposal, ModelSpec, Project, RoutingMode } from "@/types";

// One mutually-exclusive selector: pick a routing mode, or point at one specific
// model. Mirrors the Auto / ChatGPT / Claude / Gemini / Parallel / Deliberate pill
// row as a single choice, not two independent ones.
type Selection = { kind: "auto" } | { kind: "model"; modelId: string } | { kind: "parallel" } | { kind: "deliberation" };

function selectionToCriteria(sel: Selection): { mode: RoutingMode; explicitModels?: string[] } {
  switch (sel.kind) {
    case "auto":
      return { mode: "single" };
    case "model":
      return { mode: "single", explicitModels: [sel.modelId] };
    case "parallel":
      return { mode: "parallel" };
    case "deliberation":
      return { mode: "deliberation" };
  }
}

function isFileCreationRequest(text: string): boolean {
  return /\b(create|build|implement|add|generate|scaffold|make)\b[\s\S]*\b(file|page|component|feature|app|project|api|route|endpoint|form|screen)\b/i.test(text);
}

function addressedProvider(text: string): string | undefined {
  const matches = new Set<string>();
  const names: Array<[string, RegExp]> = [
    ["anthropic", /\b(?:claude|anthropic)\b/i],
    ["openai", /\b(?:chatgpt|gpt|openai)\b/i],
    ["gemini", /\b(?:gemini|google)\b/i],
  ];
  for (const [provider, pattern] of names) {
    if (pattern.test(text)) matches.add(provider);
  }
  return matches.size === 1 ? [...matches][0] : undefined;
}

const FILE_PROPOSAL_INSTRUCTION = `When this request asks you to create or modify project files, return a proposed file set for review. For each proposed file, use a fenced block whose first line is exactly FILE: relative/path.ext, followed by the complete file content. Do not claim files were written; they will be reviewed before a GitHub branch is created.`;

function extractFileChanges(content: string): GitHubFileChange[] {
  const changes: GitHubFileChange[] = [];
  const pattern = /```[^\n]*\n(?:FILE|PATH):\s*([^\n]+)\n([\s\S]*?)```/gi;
  for (const match of content.matchAll(pattern)) {
    const path = match[1].trim();
    if (path && !path.includes("..") && path.length < 240) changes.push({ path, content: match[2].replace(/^\n+|\n+$/g, "") });
  }
  return changes;
}

function GitHubProposalPanel({ projectId, content }: { projectId: string; content: string }) {
  const files = useMemo(() => extractFileChanges(content), [content]);
  const [busy, setBusy] = useState<GitHubActionMode | "approve" | "reject" | null>(null);
  const [proposal, setProposal] = useState<GitHubActionProposal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (files.length === 0) return null;

  async function propose(mode: GitHubActionMode) {
    setBusy(mode);
    setMessage(null);
    try {
      setProposal(await createGitHubProposal(projectId, "Proposed files from Chat", files, mode));
      setMessage(mode === "auto" ? "Committed to a new GitHub branch." : mode === "manual" ? "Saved for approval." : "Proposal rejected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create proposal");
    } finally {
      setBusy(null);
    }
  }

  async function resolve(action: "approve" | "reject") {
    if (!proposal) return;
    setBusy(action);
    try {
      const result = action === "approve" ? await approveGitHubProposal(proposal.id) : await rejectGitHubProposal(proposal.id);
      setProposal(result);
      setMessage(action === "approve" ? "Committed to a new GitHub branch." : "Proposal rejected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update proposal");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-950">File changes detected</p>
          <p className="mt-1 text-xs text-amber-900/70">Review {files.length} proposed file{files.length === 1 ? "" : "s"} before GitHub writes.</p>
        </div>
        {!proposal && <div className="flex flex-wrap gap-1.5">
          {(["auto", "manual", "reject"] as GitHubActionMode[]).map((mode) => (
            <button key={mode} onClick={() => propose(mode)} disabled={busy !== null} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${mode === "auto" ? "border-emerald-200 bg-emerald-600 text-white" : mode === "reject" ? "border-red-200 bg-white text-red-600" : "border-amber-300 bg-white text-amber-800"}`}>
              {busy === mode ? "Saving..." : mode === "auto" ? "Auto commit" : mode === "manual" ? "Request approval" : "Reject"}
            </button>
          ))}
        </div>}
      </div>
      <ul className="mt-3 space-y-1 text-xs text-amber-950/75">{files.map((file) => <li key={file.path} className="font-mono">{file.path}</li>)}</ul>
      {proposal?.status === "pending" && <div className="mt-3 flex gap-2"><button onClick={() => resolve("approve")} disabled={busy !== null} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">{busy === "approve" ? "Committing..." : "Approve and commit"}</button><button onClick={() => resolve("reject")} disabled={busy !== null} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600">Reject</button></div>}
      {(message || proposal?.branch) && <p className="mt-2 text-xs text-amber-900/75">{message}{proposal?.branch && ` Branch: ${proposal.branch}`}</p>}
    </div>
  );
}

// TODO: replace with the signed-in user's id once auth is wired up.
const DEMO_OWNER_ID = "00000000-0000-0000-0000-000000000000";

const CAPABILITIES: Capability[] = ["reasoning", "coding", "research", "fast", "cheap", "long_context"];

const PROVIDER_PILLS = [
  { provider: "openai", label: "ChatGPT" },
  { provider: "anthropic", label: "Claude" },
  { provider: "gemini", label: "Gemini" },
];

// Browser speech recognition (Chrome / Edge / Safari). Absent elsewhere.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function pillClass(selected: boolean): string {
  return `flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13.5px] font-medium transition ${
    selected ? "border-blue-300 bg-blue-50 text-blue-700" : "border-ink/12 bg-white text-ink/75 hover:border-ink/30"
  }`;
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get("project");
  const conversationParam = searchParams.get("conversation");
  const agentParam = searchParams.get("agent");
  const useParam = searchParams.get("use");
  const activeAgent = AGENTS.find((a) => a.key === agentParam);

  const [projectId, setProjectId] = useState<string | null>(projectIdParam);
  const [project, setProject] = useState<Project | null>(null);
  const [provisioning, setProvisioning] = useState(!projectIdParam);
  const [conversationId, setConversationId] = useState<string | undefined>();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [taskType, setTaskType] = useState("general");
  const [selection, setSelection] = useState<Selection>({ kind: "parallel" });
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [models, setModels] = useState<ModelSpec[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const assistantStartRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listModels()
      .then(setModels)
      .catch(() => setModels([]));
    setSpeechSupported(!!getSpeechRecognition());
  }, []);

  useEffect(() => {
    if (projectIdParam) {
      setProjectId(projectIdParam);
      return;
    }
    let cancelled = false;
    createProject({ ownerId: DEMO_OWNER_ID, name: "Untitled project" })
      .then((created) => {
        if (cancelled) return;
        setProjectId(created.id);
        const params = new URLSearchParams();
        params.set("project", created.id);
        if (agentParam) params.set("agent", agentParam);
        router.replace(`/chat?${params.toString()}`);
      })
      .catch(() => {})
      .finally(() => !cancelled && setProvisioning(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdParam, router]);

  // project details for the composer placeholder and the sync button
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getProject(projectId)
      .then((p) => !cancelled && setProject(p))
      .catch(() => !cancelled && setProject(null));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // restore the project's latest conversation so a reload does not lose the thread
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setHistoryLoaded(false);
    getChatHistory(projectId, conversationParam ?? undefined)
      .then((h) => {
        if (cancelled) return;
        setConversationId(h.conversation_id ?? undefined);
        setTurns(
          h.turns.map((t): Turn => {
            const response: ChatResponse = {
              conversation_id: h.conversation_id ?? "",
              message_id: t.message_id,
              mode: t.mode,
              responses: t.responses,
              synthesis: t.synthesis ?? undefined,
              context_used: t.context_used ?? [],
            };
            return {
              id: t.message_id,
              prompt: t.prompt,
              sentAt: t.sent_at,
              repliedAt: t.sent_at,
              response,
              chosenResponseId: t.chosen_response_id ?? undefined,
              compareOpen: true,
              loading: false,
            };
          })
        );
      })
      .catch(() => {})
      .finally(() => !cancelled && setHistoryLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [projectId, conversationParam]);

  // picking a persona (from the sidebar, or a link) presets the task type;
  // it feeds real router scoring/affinity, unlike a decorative status label
  useEffect(() => {
    if (activeAgent) setTaskType(activeAgent.taskType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentParam]);

  // "Use in chat" from the Context Library: start the question about that item
  useEffect(() => {
    if (useParam) {
      setPrompt((p) => p || `Regarding "${useParam}": `);
      textareaRef.current?.focus();
    }
  }, [useParam]);

  useEffect(() => {
    assistantStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [turns]);

  const providerModel = useMemo(() => {
    const map: Record<string, ModelSpec | undefined> = {};
    for (const { provider } of PROVIDER_PILLS) {
      const all = models.filter((m) => m.provider === provider);
      map[provider] = all.find((m) => m.is_active) ?? all[0];
    }
    return map;
  }, [models]);

  function toggleCapability(cap: Capability) {
    setCapabilities((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = getSpeechRecognition();
    if (!SR) return;
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) setPrompt((p) => (p ? `${p} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || !projectId) return;

    const history: ChatMessage[] = turns.flatMap((t): ChatMessage[] => {
      const content = resolvedContent(t);
      return content
        ? [{ role: "user", content: t.prompt }, { role: "assistant", content }]
        : [{ role: "user", content: t.prompt }];
    });

    const turnId = crypto.randomUUID();
    setTurns((prev) => [...prev, { id: turnId, prompt: text, sentAt: new Date().toISOString(), loading: true, compareOpen: true }]);
    setPrompt("");

    let { mode, explicitModels } = selectionToCriteria(selection);
    const addressed = addressedProvider(text);
    if (addressed) {
      const addressedModel = providerModel[addressed]?.id;
      if (addressedModel) {
        mode = "single";
        explicitModels = [addressedModel];
      }
    }
    const fileRequest = isFileCreationRequest(text);

    try {
      const response = await sendChat({
        projectId,
        conversationId,
        messages: [
          ...history,
          ...(fileRequest ? [{ role: "system" as const, content: FILE_PROPOSAL_INSTRUCTION }] : []),
          { role: "user", content: text },
        ],
        mode,
        explicitModels,
        capabilities,
        taskType,
      });
      setConversationId(response.conversation_id);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                loading: false,
                repliedAt: new Date().toISOString(),
                response,
                chosenResponseId: response.chosen_model_id
                  ? response.responses.find((r) => r.model_id === response.chosen_model_id)?.id
                  : undefined,
              }
            : t
        )
      );
      setRefreshKey((k) => k + 1); // stats, activity and "used" sources moved
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, loading: false, repliedAt: new Date().toISOString(), error: err instanceof Error ? err.message : "Something went wrong" }
            : t
        )
      );
    }
  }

  async function handleChoose(turnId: string, responseId: string) {
    if (!projectId) return;
    setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, chosenResponseId: responseId } : t)));
    const turn = turns.find((t) => t.id === turnId);
    if (!turn?.response) return;
    try {
      await recordDecision({
        projectId,
        messageId: turn.response.message_id,
        chosenResponseId: responseId,
        taskType,
        mode: turn.response.mode,
      });
      setRefreshKey((k) => k + 1);
    } catch {
      // background signal for future routing: a failure here should not block the UI
    }
  }

  function toggleCards(turnId: string) {
    setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, compareOpen: !t.compareOpen } : t)));
  }

  async function clearCurrentChat() {
    if (!projectId) return;
    try {
      await clearChat(projectId, conversationId);
      await startNewChat();
    } catch {
      // Keep the visible conversation if the server could not clear it.
    }
  }

  async function startNewChat() {
    if (!projectId) return;
    const id = await createChatConversation(projectId);
    setTurns([]);
    setConversationId(id);
    const params = new URLSearchParams({ project: projectId, conversation: id });
    if (agentParam) params.set("agent", agentParam);
    router.replace(`/chat?${params.toString()}`);
    textareaRef.current?.focus();
  }

  if (provisioning || !projectId) {
    return <main className="flex h-full items-center justify-center text-sm text-ink/40">Setting up project...</main>;
  }

  const lastTurn = turns[turns.length - 1];
  const lastPrompt = lastTurn?.prompt ?? "";
  const lastResponseWithContext = [...turns].reverse().find((t) => t.response?.context_used?.length)?.response;
  const usedFromResponse = lastResponseWithContext?.context_used;
  const statsFromResponse = lastResponseWithContext?.context_stats;

  function taskLine(turn: Turn): string {
    const n = turn.response ? turn.response.responses.filter((r) => r.phase === "initial").length || turn.response.responses.length : 0;
    const topics = [taskType !== "general" ? taskType : null, ...capabilities.map((c) => c.replace("_", " "))].filter(Boolean);
    const models = n > 1 ? "multiple models" : "the selected model";
    return topics.length > 0
      ? `Consulting ${models} based on task type: ${topics.join(", ")}`
      : `Consulting ${models} with your project context`;
  }

  function AssistantBubbles({ turn }: { turn: Turn }) {
    const responses = turn.response?.responses.filter((response) => response.phase === "initial") ?? turn.response?.responses ?? [];
    const visibleResponses = responses.filter((response) => response.success || response.error);

    if (turn.loading) {
      return (
        <div className="flex items-start gap-3 pl-2">
          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D]">
            <LogoMark className="h-5 w-5" />
          </span>
          <div className="rounded-2xl rounded-tl-md border border-ink/[0.08] bg-white px-4 py-3 text-sm text-ink/50">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Consulting models...
          </div>
        </div>
      );
    }

    if (turn.error) {
      return (
        <div className="flex items-start gap-3 pl-2">
          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D]">
            <LogoMark className="h-5 w-5" />
          </span>
          <p className="max-w-[78%] rounded-2xl rounded-tl-md bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">{turn.error}</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 pl-2">
        {visibleResponses.map((response, index) => (
          <div key={response.id ?? `${response.model_id}-${index}`} className="flex items-start gap-3">
            <ProviderLogo provider={response.provider} tile className="mt-1 h-9 w-9 shrink-0" />
            <div className={`max-w-[78%] rounded-2xl rounded-tl-md border px-4 py-3 ${response.success ? "border-ink/[0.08] bg-white" : "border-red-100 bg-red-50"}`}>
              <p className="mb-1 text-xs font-semibold text-ink/55">
                {providerLabel(response.provider, response.display_name)}
                <span className="ml-2 font-normal text-ink/35">{formatTime(turn.repliedAt ?? turn.sentAt)}</span>
              </p>
              <p className={`whitespace-pre-wrap text-[15px] leading-relaxed ${response.success ? "text-ink/85" : "text-red-700"}`}>
                {response.success ? response.content : response.error ?? "Request failed"}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const placeholder = `Ask anything about ${project?.name ?? "this project"}...`;

  return (
    <main className="grid h-full grid-cols-1 bg-[#F5F7FB] lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-6 pb-2 pt-5">
          <div className="flex flex-col gap-5">
            {turns.length > 0 && (
              <div className="-mb-2 flex items-center justify-end gap-2">
                <button
                  onClick={startNewChat}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink/50 transition hover:bg-white hover:text-ink"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New chat
                </button>
                <button
                  onClick={clearCurrentChat}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink/50 transition hover:bg-white hover:text-ink"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> Clear chat
                </button>
              </div>
            )}

            {turns.length === 0 ? (
              historyLoaded && (
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D]">
                    <LogoMark className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1 rounded-2xl border border-ink/[0.08] bg-white p-5">
                    <p className="font-display text-[17px] font-bold tracking-tight">Project Intelligence</p>
                    <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-ink/60">
                      Ask anything about {project?.name ?? "this project"}. Your question goes to the models you pick below, with this
                      project&apos;s context attached, and you can compare their answers and save the one you act on as a decision.
                    </p>
                  </div>
                </div>
              )
            ) : (
              turns.map((turn, turnIndex) => (
                <div key={turn.id} className="flex flex-col gap-5">
                  {/* user message */}
                  <div className="flex items-start justify-end gap-3">
                    <div className="min-w-0 max-w-[78%] rounded-2xl rounded-tr-md bg-[#E3ECFB] px-5 py-4">
                      <p className="text-right text-[13px] text-ink/50">
                        <span className="font-semibold text-ink/75">You</span>
                        <span className="ml-2.5">{formatTime(turn.sentAt)}</span>
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-[17px] leading-snug text-ink">{turn.prompt}</p>
                    </div>
                    <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-400 text-sm font-bold text-ink">
                      CA
                    </span>
                  </div>

                  <div ref={turn.id === turns[turns.length - 1]?.id ? assistantStartRef : undefined}>
                    {(turnIndex === 0 && (turn.response?.responses.filter((response) => response.phase === "initial").length ?? 0) > 1) ? (
                      <ProjectIntelligence
                        turn={turn}
                        taskLine={taskLine(turn)}
                        onChoose={(id) => handleChoose(turn.id, id)}
                        onDiscuss={() => textareaRef.current?.focus()}
                        onToggleCards={() => toggleCards(turn.id)}
                      />
                    ) : (
                      <AssistantBubbles turn={turn} />
                    )}
                  </div>
                  {turn.response && <GitHubProposalPanel projectId={projectId} content={resolvedContent(turn) ?? ""} />}
                </div>
              ))
            )}
          </div>
        </div>

        {/* composer, pinned to the bottom */}
        <form onSubmit={handleSubmit} className="shrink-0 px-6 pb-5 pt-2">
          <div className="rounded-2xl border border-ink/[0.08] bg-white p-4 shadow-[0_2px_8px_rgba(11,14,20,0.05)]">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={placeholder}
              rows={1}
              className="w-full resize-none bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-ink/40"
            />

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                aria-label="Add context"
                title="Add context"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink/12 bg-white text-ink/60 transition hover:border-ink/30 hover:text-ink"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
              </button>

              <button type="button" onClick={() => setSelection({ kind: "auto" })} className={pillClass(selection.kind === "auto")}>
                <Sparkles className="h-4 w-4" strokeWidth={1.75} /> Auto
              </button>
              {PROVIDER_PILLS.map(({ provider, label }) => {
                const model = providerModel[provider];
                if (!model) return null;
                const selected = selection.kind === "model" && models.some((m) => m.provider === provider && m.id === selection.modelId);
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setSelection({ kind: "model", modelId: model.id })}
                    className={pillClass(selected)}
                    title={model.display_name}
                  >
                    <ProviderLogo provider={provider} className="h-4 w-4" /> {label}
                  </button>
                );
              })}
              <button type="button" onClick={() => setSelection({ kind: "parallel" })} className={pillClass(selection.kind === "parallel")}>
                <Split className="h-4 w-4" strokeWidth={1.75} /> Parallel
              </button>
              <button type="button" onClick={() => setSelection({ kind: "deliberation" })} className={pillClass(selection.kind === "deliberation")}>
                <Users className="h-4 w-4" strokeWidth={1.75} /> Deliberate
              </button>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  aria-label="Attach context"
                  title="Attach a note, document or link as project context"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink/12 bg-white text-ink/60 transition hover:border-ink/30 hover:text-ink"
                >
                  <Paperclip className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={!speechSupported}
                  aria-label={listening ? "Stop voice input" : "Voice input"}
                  title={speechSupported ? (listening ? "Listening… click to stop" : "Dictate your question") : "Voice input isn't supported in this browser"}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    listening ? "border-red-300 bg-red-50 text-red-600" : "border-ink/12 bg-white text-ink/60 hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  <Mic className={`h-4 w-4 ${listening ? "animate-pulse" : ""}`} strokeWidth={1.75} />
                </button>
                <button
                  type="submit"
                  aria-label="Send"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700"
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>

            {optionsOpen && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/[0.07] pt-3">
                {CAPABILITIES.map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCapability(cap)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      capabilities.includes(cap) ? "border-blue-300 bg-blue-50 text-blue-700" : "border-ink/12 bg-white text-ink/60 hover:border-ink/30"
                    }`}
                  >
                    {cap.replace("_", " ")}
                  </button>
                ))}
                {activeAgent ? (
                  <span className={`ml-auto flex items-center gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-medium text-ink ${activeAgent.avatarClass}`}>
                    {activeAgent.name}
                    <button
                      type="button"
                      onClick={() => router.replace(projectId ? `/chat?project=${projectId}` : "/chat")}
                      aria-label="Clear persona"
                      className="rounded-full p-0.5 hover:bg-black/10"
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ) : (
                  <input
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    placeholder="task type"
                    className="ml-auto w-32 rounded-full border border-ink/12 bg-white px-3 py-1 text-xs outline-none focus:border-blue-400"
                  />
                )}
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-ink/40">
            <button
              type="button"
              onClick={() => setOptionsOpen((v) => !v)}
              className="flex items-center gap-1 transition hover:text-ink/70"
            >
              <SlidersHorizontal className="h-3 w-3" strokeWidth={2} />
              {optionsOpen ? "Hide options" : "Options: capabilities and task type"}
            </button>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" strokeWidth={2} /> Project context is attached to every message
            </span>
          </div>
        </form>
      </section>

      <div className="hidden min-h-0 border-l border-ink/[0.07] lg:block">
        <ChatContextPanel
          projectId={projectId}
          project={project}
          lastPrompt={lastPrompt}
          usedFromResponse={usedFromResponse}
          statsFromResponse={statsFromResponse}
          addOpen={addOpen}
          onCloseAdd={() => {
            setAddOpen(false);
            setRefreshKey((k) => k + 1);
          }}
          refreshKey={refreshKey}
        />
      </div>

      {/* below lg the side panel is hidden, but adding context still needs its dialog */}
      <div className="lg:hidden">
        {addOpen && (
          <ChatContextPanel
            projectId={projectId}
            project={project}
            lastPrompt={lastPrompt}
            addOpen={addOpen}
            onCloseAdd={() => setAddOpen(false)}
            refreshKey={refreshKey}
            dialogOnly
          />
        )}
      </div>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<main className="flex h-full items-center justify-center text-sm text-ink/40">Loading...</main>}>
      <ChatPageInner />
    </Suspense>
  );
}
