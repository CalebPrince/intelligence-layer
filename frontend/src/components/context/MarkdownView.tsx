import { Target } from "lucide-react";
import type { ReactNode } from "react";

/** Inline formatting: **bold**, *italic*, `code` and [links](http...). React escapes
 * everything else, and only http(s) links are made clickable. */
function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) {
      nodes.push(<strong key={key} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-ink/[0.06] px-1 py-0.5 font-mono text-[0.9em]">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("[")) {
      const [, label, href] = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(tok) ?? [];
      nodes.push(
        <a key={key} href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline-offset-2 hover:underline">
          {label}
        </a>
      );
    } else {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING_SIZE = ["", "text-[22px]", "text-[19px]", "text-[16px]", "text-[15px]"];

/** A small markdown renderer for reading context files. Headings keep their `#`
 * markers (as in the design); blockquotes become a callout, `- [x]` becomes a
 * checkbox, fenced code stays monospaced. */
export function MarkdownView({ text, keepLineBreaks = false }: { text: string; keepLineBreaks?: boolean }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  const key = () => `b${k++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(
        <pre key={key()} className="my-3 overflow-x-auto rounded-lg bg-[#F3F5F9] p-3 font-mono text-[12.5px] leading-relaxed text-ink/80">
          {code.join("\n")}
        </pre>
      );
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(
        <p key={key()} className={`mb-2 mt-5 font-display font-bold leading-tight tracking-tight first:mt-0 ${HEADING_SIZE[level]}`}>
          {h[1]} {inline(h[2], key())}
        </p>
      );
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(
        <div key={key()} className="my-3 flex gap-3 rounded-lg border border-blue-100 bg-[#EEF4FF] p-4">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" strokeWidth={1.75} />
          <p className="text-[14px] leading-relaxed text-ink/75">{inline(quote.join(" ").trim(), key())}</p>
        </div>
      );
      continue;
    }

    if (/^\s*[-*]\s+\[( |x|X)\]\s+/.test(line)) {
      const items: { done: boolean; text: string }[] = [];
      while (i < lines.length && /^\s*[-*]\s+\[( |x|X)\]\s+/.test(lines[i])) {
        const m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(lines[i++])!;
        items.push({ done: m[1] !== " ", text: m[2] });
      }
      out.push(
        <ul key={key()} className="my-2 flex flex-col gap-2">
          {items.map((it, n) => (
            <li key={n} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink/80">
              <input type="checkbox" checked={it.done} readOnly className="mt-0.5 h-4 w-4 shrink-0 rounded accent-blue-600" />
              <span>{inline(it.text, key())}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]) && !/^\s*[-*]\s+\[( |x|X)\]/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      }
      out.push(
        <ul key={key()} className="my-2 list-disc space-y-1.5 pl-6 text-[14px] leading-snug text-ink/80 marker:text-ink/40">
          {items.map((t, n) => (
            <li key={n}>{inline(t, key())}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push(
        <ol key={key()} className="my-2 list-decimal space-y-1.5 pl-6 text-[14px] leading-snug text-ink/80 marker:text-ink/40">
          {items.map((t, n) => (
            <li key={n}>{inline(t, key())}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i++].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      out.push(
        <div key={key()} className="my-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-[13px]">
            <tbody>
              {rows.map((r, n) => (
                <tr key={n} className={n === 0 ? "bg-ink/[0.04] font-semibold" : "border-t border-ink/[0.07]"}>
                  {r.map((c, m) => (
                    <td key={m} className="px-3 py-1.5 align-top">
                      {inline(c, key())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push(<hr key={key()} className="my-4 border-ink/10" />);
      i++;
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(\s*```|#{1,4}\s|\s*>|\s*[-*]\s|\s*\d+[.)]\s|\s*\||\s*(-{3,}|\*{3,})\s*$)/.test(lines[i])) {
      para.push(lines[i++].trim());
    }
    if (para.length === 0) {
      i++;
      continue;
    }
    out.push(
      <p key={key()} className={`my-2 text-[14px] leading-relaxed text-ink/80 ${keepLineBreaks ? "whitespace-pre-line" : ""}`}>
        {inline(para.join(keepLineBreaks ? "\n" : " "), key())}
      </p>
    );
  }

  return <div>{out}</div>;
}
