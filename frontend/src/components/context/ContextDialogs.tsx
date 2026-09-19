"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

function Shell({
  title,
  subtitle,
  onClose,
  onSubmit,
  wide,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit: () => void;
  wide?: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className={`w-full rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
            {subtitle && <p className="mt-1 text-[13px] text-ink/55">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/45 hover:bg-ink/5">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>
      </form>
    </div>
  );
}

const INPUT = "w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-blue-400";
const LABEL = "mb-1 mt-3 block text-[13px] font-medium text-ink/70 first:mt-0";

function FolderField({ value, onChange, folders }: { value: string; onChange: (v: string) => void; folders: string[] }) {
  return (
    <>
      <label className={LABEL}>Folder (optional)</label>
      <input
        list="context-folders"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pick one or type a new folder name"
        className={INPUT}
      />
      <datalist id="context-folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </>
  );
}

function Buttons({ busy, canSubmit, label, onClose }: { busy: boolean; canSubmit: boolean; label: string; onClose: () => void }) {
  return (
    <>
      <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-ink/55 hover:text-ink">
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy || !canSubmit}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {label}
      </button>
    </>
  );
}

export function NoteDialog({
  folders,
  onClose,
  onSave,
}: {
  folders: string[];
  onClose: () => void;
  onSave: (v: { title: string; content: string; folder: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Shell
      title="Add a note"
      subtitle="Capture ideas or information. Every model sees it with your questions."
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await onSave({ title: title.trim(), content: content.trim(), folder: folder.trim() });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save");
          setBusy(false);
        }
      }}
      footer={<Buttons busy={busy} canSubmit={!!title.trim() && !!content.trim()} label="Add note" onClose={onClose} />}
    >
      <label className={LABEL}>Title</label>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} placeholder="Meeting notes, Sep 15" />
      <label className={LABEL}>Note</label>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7} className={INPUT} placeholder="What should every model know?" />
      <FolderField value={folder} onChange={setFolder} folders={folders} />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Shell>
  );
}

export function LinkDialog({
  folders,
  onClose,
  onSave,
}: {
  folders: string[];
  onClose: () => void;
  onSave: (v: { url: string; folder: string }) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Shell
      title="Add a link"
      subtitle="The page's text is saved as context, so models can use it without visiting the site."
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await onSave({ url: url.trim(), folder: folder.trim() });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not add the link");
          setBusy(false);
        }
      }}
      footer={<Buttons busy={busy} canSubmit={!!url.trim()} label={busy ? "Fetching page" : "Add link"} onClose={onClose} />}
    >
      <label className={LABEL}>Link</label>
      <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} className={INPUT} placeholder="https://example.com/page" />
      <FolderField value={folder} onChange={setFolder} folders={folders} />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Shell>
  );
}

export function EditItemDialog({
  title: initialTitle,
  content: initialContent,
  folder: initialFolder,
  folders,
  imported,
  onClose,
  onSave,
}: {
  title: string;
  content: string;
  folder: string;
  folders: string[];
  imported: boolean;
  onClose: () => void;
  onSave: (v: { title: string; content: string; folder: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [folder, setFolder] = useState(initialFolder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Shell
      title="Edit context"
      subtitle={
        imported
          ? "This came from a file on disk. Once you edit it here, the app keeps your version and stops overwriting it from the file."
          : "Earlier versions are kept in Version History."
      }
      wide
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await onSave({ title: title.trim(), content, folder: folder.trim() });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save");
          setBusy(false);
        }
      }}
      footer={<Buttons busy={busy} canSubmit={!!title.trim()} label="Save changes" onClose={onClose} />}
    >
      <label className={LABEL}>Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
      <label className={LABEL}>Content</label>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={14} className={`${INPUT} font-mono text-[13px] leading-relaxed`} />
      <FolderField value={folder} onChange={setFolder} folders={folders} />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Shell>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Shell
      title={title}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true);
        await onConfirm();
      }}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-ink/55 hover:text-ink">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink/70">{body}</p>
    </Shell>
  );
}
