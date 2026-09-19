import type { ChatResponse } from "@/types";

export interface Turn {
  id: string;
  prompt: string;
  sentAt: string; // real client-side send time, not fabricated
  repliedAt?: string; // set when the response actually lands, not sentAt + guess
  response?: ChatResponse;
  chosenResponseId?: string;
  compareOpen: boolean; // model cards visible
  loading: boolean;
  error?: string;
}

export const PROVIDER_LABEL: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
};

export function providerLabel(provider: string, fallback: string): string {
  return PROVIDER_LABEL[provider] ?? fallback;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Splits text into real bullet lines (starting with -, *, or a bullet dot)
 * and the remaining prose. Nothing is invented: only what is in the text. */
export function splitContent(content?: string | null): { prose: string[]; bullets: string[] } {
  const prose: string[] = [];
  const bullets: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) prose.push(paragraph.join(" "));
    paragraph = [];
  };
  for (const raw of (content ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (/^[-*•]\s+/.test(line)) {
      flush();
      bullets.push(line.replace(/^[-*•]\s+/, ""));
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return { prose, bullets };
}

/** What this turn's reply counts as in the *next* request's history: the
 * synthesis if there is one, else the response the user chose, else the first
 * successful response. Undefined (everything failed) drops the assistant side. */
export function resolvedContent(turn: Turn): string | undefined {
  const r = turn.response;
  if (!r) return undefined;
  if (r.synthesis?.content) return r.synthesis.content;
  const chosen = r.responses.find((x) => x.id === turn.chosenResponseId);
  if (chosen?.content) return chosen.content;
  return r.responses.find((x) => x.success)?.content;
}
