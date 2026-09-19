# Inteli-Space

> One project, routed across multiple model perspectives: Claude, GPT, and Gemini answer from the same project context, independently or together, and you record which answer you actually acted on.

This file tracks where the build actually stands. Updated as work lands, not written once and forgotten.

## Live deployment

- **Frontend:** https://intelispace.vercel.app
- **Backend:** https://intelligence-layer-production-2d12.up.railway.app
- **Backend health:** https://intelligence-layer-production-2d12.up.railway.app/health

The frontend is deployed on Vercel from `frontend/`. The FastAPI backend runs on Railway from `backend/`, using the repository Dockerfile. Vercel rewrites `/api/backend/*` requests to the Railway backend in production.

**Last updated:** 2026-09-19 (Sage — a real prince-web-app agent, not a lookalike — is now live on the `/agents` page with genuine shared memory and feeds the same decisions/affinity loop as the LLM models; section-based context selection so chat sends only the matching parts of long documents, with a live "tokens sent vs saved" estimate; Agents, Analytics, Integrations and Settings pages built out to match their references; `/v1/analytics` adds real usage-by-day, cost, top-projects and storage numbers; a batch of backend gaps got their API built — milestones, workspace settings, integration credentials with a live test-connection check, decisions extras, per-project sync control, watch-folder exclude, empty/renameable context folders, project images, a conversations list — **API only, no frontend UI wired yet**, see "Backend built, UI not wired yet" below; 8 folders got a `project.json`)

## Mission and the open question behind it

The goal stated for this project: **a project intelligence system that owns the
context, routes work across models *and agents*, records decisions, and learns
from their outcome.** Everything in this repo is in service of one of those four
verbs — own the context (Context Library, retrieval.py), route (router.py,
now also app/sage_client.py for a real external agent), record (the `decisions`
table), learn (`get_model_affinity`, the per-project nudge toward historically
accepted models — extended to real agents the moment they save a
`model_responses` row, which is why Sage's chat replies were built that way).

The open question that "learns from their outcome" has to actually answer,
kept in view rather than assumed answered by what exists today:

> **Can Inteli-Space become measurably better at helping an organization
> make its 100th project decision because it has observed what happened after
> the first 99?**

Honest read on where that stands: **not yet, and what exists today is a
weaker claim than it sounds.** `get_model_affinity` learns from which answer a
person *chose*, not from whether choosing it *worked out* — a model chosen
often but whose decisions quietly failed would still look "learned as good."
The building blocks that would close that gap are partly here (`outcome_note`
now exists on a decision — see "Backend built, UI not wired yet" — so an
outcome can be recorded by hand) and partly not (nothing reads `outcome_note`
back into routing or affinity; there's no notion of a decision succeeding or
failing, only implemented/in-progress/under-review/archived as workflow
states, not verdicts). Answering the question for real needs: a real
outcome signal (not just "implemented"), a large enough sample per
task-type/project to say "measurably," and a mechanism that actually feeds
outcomes back into routing weight, not just display. Worth revisiting
explicitly once decision volume exists to test it against, rather than
declaring it solved by the affinity mechanism that's here now.

---

## Run it

From the repo root:

```
npm run install:all   # once: frontend deps + backend venv + requirements
npm run dev           # backend http://localhost:8000 + frontend http://localhost:3000, Ctrl+C stops both
```

`npm run dev:backend` / `npm run dev:frontend` start either one alone. `scripts/dev.mjs` is the launcher, `scripts/install.mjs` the setup.

Backend settings (env vars or `backend/.env`): `WATCH_INTERVAL_SECONDS` (live scanner period, default 30), `SQLITE_PATH`, `CORS_ORIGINS`, provider API keys, and `PRINCE_WEB_APP_ADMIN_TOKEN` for authenticated prince-web-app agent chat. Generic agent memory is stored in this app's SQLite conversations and replayed to the upstream agent on each turn.

Dev quirk: after adding a brand-new frontend file, Tailwind sometimes does not pick up its classes until the config is touched (`touch frontend/tailwind.config.ts`) or the dev server restarts.

Windows note: uvicorn's `--reload` can hang on shutdown while a browser keeps a connection open, leaving the old worker holding port 8000. If the API keeps returning old responses after a code change, stop all `python`/`node` dev processes and run `npm run dev` again.

## Architecture

```
model-agnostic-layer/
├── package.json          root scripts (dev, install:all, ...)
├── scripts/              dev.mjs, install.mjs
├── backend/              FastAPI + SQLite (local file DB, no cloud project needed)
│   └── app/
│       ├── main.py            app + lifespan (creates tables, starts the folder scanner)
│       ├── config.py          settings + the model registry (capabilities, cost, is_active)
│       ├── router.py          capability-based model selection + single/parallel/deliberation
│       ├── database.py        SQLite persistence (+ additive column migrations in init_db)
│       ├── importer.py        read-only folder inspection: description, tech tags, category, docs, change fingerprint
│       ├── import_service.py  import a folder as a project + the live-scan loop (new folders + keep-in-sync)
│       ├── retrieval.py       section-based context selection (BM25 keyword ranking, no embeddings) within a token budget
│       ├── integrations.py    third-party integration catalog + live test-connection checks (app/api/integrations.py is the router)
│       ├── sage_client.py     client for prince-web-app's real, public Sage agent (app/api/agents.py is the router)
│       ├── schema.sql         table definitions
│       └── api/               chat, context, projects, insights, imports, watch, dashboard, analytics, decisions, credits,
│                               library, milestones, settings_api, integrations, agents
└── frontend/             Next.js App Router + TypeScript + Tailwind
    ├── public/logos/          real ChatGPT / Claude / Gemini / GitHub / Linear / Notion / Slack marks
    └── src/
        ├── app/               landing page (/) and (dashboard)/ overview, chat, decisions, context,
        │                      activity, projects, plus integrations/agents/settings/help placeholders
        ├── components/        landing/, layout/ (Sidebar, TopBar, ProjectSwitcher), dashboard/, projects/, chat/
        └── lib/               api.ts (backend client), agents.ts, sampleWorkspace.ts, providerColors.ts
```

---

## What's working (real, backed by the backend)

- **Routing**: capability-driven (`reasoning`, `coding`, `research`, `fast`, `cheap`, `long_context`, ...), never provider-name-driven. Three modes: `single` (ranked fallback chain), `parallel` (fans out to every active model), `deliberation` (parallel, then each model critiques the others, then one synthesizes).
- **Per-project affinity**: the `decisions` table records which response got accepted and under what `task_type`; `router.py` nudges future scoring toward models that project has historically accepted.
- **Sage — a real agent, not a lookalike** (2026-09-19): the `/agents` page's Sage card is genuinely wired to prince-web-app's own public Sage agent (the marketing-brain chatbot at `princecaleb.dev/marketing-brain.html`), via `POST /v1/agents/sage/chat` (`app/api/agents.py` + `app/sage_client.py`). No auth needed — it's prince-web-app's public, rate-limited route (20 messages/hour, shared across everyone using this backend, since prince-web-app rate-limits by this server's IP). **Memory is real and shared**: each turn replays the conversation transcript and carries prince-web-app's own session token, so the conversation persists in prince-web-app's `sage_chats` table exactly as if you'd used its own site — verified live: Sage correctly recalled the first word of a 2-turns-ago message in the same conversation. A Sage exchange is stored as an ordinary `messages` row (the question) plus a `model_responses` row (`model_id: "sage"`, `provider: "prince-web-app"`) — the same shape a GPT/Claude/Gemini answer takes — so **Accept as decision** on a Sage reply is a real, unmodified `POST /v1/decisions` call, and it shows up in the real Decisions list and feeds `get_model_affinity` exactly like any other model (verified live end-to-end through the actual UI). `conversations` gained `agent_key` and `external_token` columns to support this. This is the first of prince-web-app's 16 agents connected, chosen because it's the only one besides Lisa with real server-side memory already, so it needed the least new work to prove the pattern; extending to the other 15 (most need a new persistent-memory table in prince-web-app first, and several take real business actions — see "Known gaps") is a separate, bigger effort per agent.
- **Authenticated agent chat adapter** (2026-09-19): Wendy, Chief and Chloe can use prince-web-app's admin chat routes through `POST /v1/agents/admin/chat` once `PRINCE_WEB_APP_ADMIN_TOKEN` is configured. Their upstream endpoints are stateless, so this app persists each turn locally and rebuilds the transcript before every request; reopening the agent chat restores the latest conversation. Replies are saved as ordinary model responses and can be accepted as decisions. The adapter allowlists the remaining admin chat keys so additional roster cards can be wired without creating a separate client for each agent.
- **Persistence**: SQLite (`backend/data/app.db`), zero cloud cost. Projects, context items, conversations/messages, model responses, decisions, usage logs, stats and the activity feed are all real endpoints.
- **Chat (`/chat`)**, rebuilt to match its reference: user message card, a "Project Intelligence" card holding one card per model (real ChatGPT / Claude / Gemini logos, "View full response", "Use this") and a Synthesis card (recommended-approach badge, checklist and Key considerations taken from the model's own bullets, **Accept as decision**, **Discuss further**, **Compare side by side** dialog with the full text of every answer, `...` menu to copy the synthesis). Composer with the Auto / GPT / Claude / Gemini / Parallel / Deliberate pills, add-context (+ and paperclip) and real voice dictation via the browser's speech recognition (disabled where the browser has none); capabilities and task type live under a small "Options" link. Right panel "Project Context": stats, Active Context / Relevant Files (ranked by overlap with your last question) / Recent Activity tabs, **Sync now** (re-reads the project's folder), "Used for this response" (the context items actually sent, marked "shortened" if trimmed) and Recent Decisions. The header has Share and `...`; the sidebar Chat item shows the conversation count. The conversation is restored after a reload (`GET /v1/projects/{id}/chat/history`, latest conversation), and **New chat** starts a fresh one.
- **Decisions (`/decisions`)**, a workspace-wide page matching its reference (all projects at once, so it uses the workspace sidebar). Stat tiles (total, implemented, in progress, under review, each with a this-month count), status tabs, project / category / sort filters, list or grid, and a detail panel with Decision (the accepted answer), Context (the question asked), **AI Perspectives** (each model's answer, expandable), Outcome and Related links. Row and detail `...` menus change status (Implemented, In Progress, Under Review, Archive), edit the title and tags, copy the decision text or open the discussion in Chat; tick rows for bulk status changes. The top-bar search filters the list live (`?q=`); `?project=` presets the project filter (Chat's "Recent Decisions" links use it). Behind it: decisions now carry `title`, `status`, `tags` and `implemented_at` (additive migration), and `POST /v1/decisions` keeps **one decision per chat turn** (choosing a different answer to the same question updates it instead of adding a duplicate, which also stops it double-counting in model affinity). New decisions default to In Progress and take their title from the question and their tag from the task type. API: `GET /v1/decisions`, `GET|PATCH /v1/decisions/{id}`. "Decided by" is always Caleb Akakpo until auth exists.
- **Context Library (`/context?project=...`)**, matching its reference: header and project strip, kind tabs (All, Files, Notes, Links, Conversations, Code, Images, More: imported / added in app / edited in app), folders list, recent items, and an item viewer with **Content** (a markdown renderer that keeps `#` markers, callouts and checkboxes), **Summary** (built from the text itself, no model call), **Related** (items sharing wording), **Used In** (chat messages that carried the item) and **Version History** (preview and restore). Right side: Context Stats (7 / 30 days / all), tips, Quick Actions. **Add**: upload documents, add a note, or add a link. **Documents** (PDF, Word `.docx`, PowerPoint `.pptx`, Excel `.xlsx`, up to 25 MB) are read on the server: headings, paragraphs, tables, slide text and speaker notes, and spreadsheet cells become text (`POST /v1/projects/{id}/library/upload`, raw body); the original is kept in `backend/data/uploads/` with a **Download original** link and removed when the item is removed. Text and code files (Markdown, text, JSON, CSV, code; under 500 KB) are read in the browser. **Not supported:** scanned PDFs (no text layer, so they are rejected with a message), password-protected or damaged files, the old `.doc` / `.ppt` / `.xls` formats, and **images**, which are deliberately left out because they would add cost to every message. Very long documents are stored in full but only the first 8,000 characters of each item are sent with a chat message. Add a link (the page's text is fetched and saved, so models can use it without visiting the site). **Edit** keeps the old text as a version; an imported file you edit in the app is flagged and no longer overwritten by the folder scanner, and a folder sync now updates items in place (keeping id, history and used-in). Folders are per item (auto-assigned for imports, editable); conversations from Chat appear as read-only items. **Use in chat** opens Chat with the question started about that item. Behind it: `project_context` gained `folder` and `updated_at`, `context_versions` stores replaced text, and chat messages record which context items they carried (`messages.context_used`), so Chat's "Used for this response" also works for past turns. API under `/v1/projects/{id}/library`.
- **API credits (Main Dashboard, top right)**: providers do not let an API key read a remaining balance (OpenAI and Anthropic only report spend via separate admin keys, Gemini has no balance endpoint), so the pill is an **estimate**: the credit you enter per provider minus the cost this app has logged since (usage from other tools is not counted), shown per provider and combined, with low-balance colouring. **Key status is live**: each key is checked against its provider (cached 60s; keys only travel in headers). `GET /v1/credits`, `PUT|DELETE /v1/credits/{provider}`.
- **Models go live with their keys**: a model is active as soon as its provider's key is set in `backend/.env` (the `is_active` flags in `config.py` are only the fallback), so Claude and GPT join routing once their keys are added.
- **Context selection (token saver)**: instead of sending every context item in full, `retrieval.py` splits each item into sections (by heading, page marker or paragraph), ranks every section against the question with BM25 keyword scoring (no embeddings, no extra API calls), and sends only the best-matching sections plus a short "Project Brief" baseline, within a 20,000-character budget. A follow-up question reuses the previous question too, so "and pricing?" still finds the right document. Chat's right panel shows **~N tokens sent · ~M saved versus sending everything**, and which sections of each item were used ("shortened" badge + section count). `GET /v1/projects/{id}/context/used?q=...` previews the same selection for any question, and `context_stats` on each chat reply carries the numbers.
- **Gemini is live** on `gemini-flash-latest` (free tier). Claude and GPT are seeded but `is_active: false` until their keys are funded (flip in `backend/app/config.py`).

### Backend built, UI not wired yet (2026-09-19)

Every item below is a real, tested endpoint — verified with `TestClient` and, for the
live checks, against the real third-party API — but no frontend page calls it yet.
This is the concrete next-up list: wiring UI for these is smaller and safer than
building the endpoints was, since the hard part (schema + logic) is done.

- **Milestones**: a real `milestones` table per project. `GET/POST /v1/projects/{id}/milestones`, `PATCH/DELETE .../milestones/{milestone_id}`, and `GET .../milestones/next` (the soonest incomplete one, undated ones sort last). Overview's "Next Milestone" card still reads `SAMPLE_MILESTONE` from `sampleWorkspace.ts` — swap it for `next_milestone` and add a small create/complete UI.
- **Workspace settings**: a real `settings` table, one row per `owner_id` (same convention as everything else pending auth). `GET/PUT /v1/settings?owner_id=` covers workspace name, default view, default model, response style, and the four Project Defaults toggles. The Settings page's General tab still only holds this in local component state — point its fields at this endpoint instead (load on mount, save on change or a Save button).
- **Integration credentials + live checks** (`app/integrations.py`): `GET /v1/integrations/catalog` (what fields each service needs), `GET/PUT/DELETE /v1/integrations/{service}?owner_id=` (save/read/remove a pasted token), `POST /v1/integrations/{service}/test` (calls the real API and records `connected`/`invalid`). Real live checks exist for **GitHub, Notion, Slack, Figma, Linear, Airtable, Trello, Stripe, Telegram, Jira, Supabase, Dropbox** — each does an actual authenticated read (e.g. GitHub's `GET /user`) and reports why it failed if it does. **Google Drive, Zapier, Webhooks and Custom API** are stored but never tested — they need an OAuth app this project hasn't registered, or (Webhooks) have nothing to test. The `/integrations` page's "Connect" buttons are still no-ops; wiring means a small paste-your-token dialog per service (fields come from the catalog call) plus using real status instead of the hardcoded "Connected" pill.
- **Decisions extras**: `PATCH /v1/decisions/{id}` now also takes `outcome_note` (free text) and `implemented_at` (settable by hand — omit the field to keep the automatic "turns on when status becomes implemented" behavior, or send it explicitly including `null` to clear it) and `context_item_ids` (link the decision to specific context items). The detail response's new `linked_context` field resolves those ids to `{id, title, type}`. None of this is in the Decision Detail panel UI yet — it still only shows the project's total file count for "Related".
- **Chat conversation list**: `GET /v1/projects/{id}/conversations` (title, turn count, last message preview and time, newest first); `GET .../chat/history` now takes an optional `?conversation_id=` instead of always resolving to the latest. Not wired in — the Chat page still only ever restores the latest conversation, with no picker.
- **Per-project sync control + watch-folder exclude**: `PATCH /v1/projects/{id}` accepts `auto_sync` (`false` removes it from the background 30s loop; a manual "Sync now" still works regardless) and `image_url`. `POST/DELETE /v1/watch/{id}/exclude` (body `{"path": "..."}`) permanently ignores one sub-folder within a watch — it stops appearing as pending and is never auto-imported — without stopping the whole watch. Neither has a UI control yet (no toggle on a project, no per-folder "ignore" action on the Import dialog's pending list).
- **Context folders**: `GET/POST /v1/projects/{id}/library/folders`, `PATCH/DELETE .../folders/{name}` — a folder can now exist with zero items (created empty) and be renamed (cascades to every item in it). The Context Library page still only shows folders that already have at least one item, with no create/rename UI.
- **Project images**: `projects.image_url`, settable via the `PATCH /v1/projects/{id}` above. `ProjectImage` and the project cards still always render the default mark; wiring means falling back to it only when `image_url` is empty.

### Projects

- Projects carry `status` (active / planning / research), `category`, `tags`, `archived`, and an optional `source_path` (the folder they were imported from). Existing databases upgrade automatically on startup.
- **All Projects (`/projects`)**: tabs (All / Active / Archived / My Projects), category and sort filters, grid/list toggle, star (kept in the browser), `...` menu (change status, archive), inline **Create New Project** form (name, description, category, status, tags), and top-bar search that filters projects via `?q=`. "My Projects" equals All until auth exists.
- **Import from a folder**: the **Import** button opens a folder browser (the local backend reads the disk, because a browser file picker cannot give a page real folder paths). Point it at a directory such as `D:\Websites`; every sub-folder becomes a selectable project, all preselected. For each folder it detects a description (package.json, then README), tech tags (Next.js, React, Tailwind, Python, FastAPI, WordPress, ...) and a category, and it can load README / CLAUDE.md / AGENTS.md / DESIGN.md **and the JSON metadata files** (`project.json`, `package.json`, `composer.json`, `app.json`, `manifest.json`) as project context (this is what fills a card's "files" count). Already-imported folders are flagged and skipped, so re-running is safe. Options: import selected, import just the open folder, or "Watch only".
- **Live scanner**: when you import from a directory (or choose "Watch only") that directory is watched. The backend re-lists it every 30 seconds (`WATCH_INTERVAL_SECONDS`) and adds any **new** sub-folder to All Projects automatically, with the same detection and docs import. Details: the sub-folders present at watch time are a baseline and are never auto-imported later, so folders you deliberately skipped stay out; a new folder must be seen on two consecutive scans before import, so a folder still being copied is not imported half-empty; it keeps running whenever the backend is up, with or without the page open. The page shows a "Live scan" bar (last check time, **Add new folders automatically** toggle, **Scan now**, stop) and a toast when a project is added. With auto-add off, new folders are listed as waiting instead.
- **Keep projects in sync (same 30s loop)**: every imported project's folder is fingerprinted (top-level listing, size and mtime of README/JSON/config files, plus file count and newest mtime of a bounded walk that skips `node_modules`, `.next`, hidden folders, logs and databases). When it changes, the project is refreshed: description, tags and category are re-detected, and the loaded docs are added, replaced (re-created, so they show as fresh activity) or removed if the file was deleted. Fields you edited by hand (for example a category set through the API) are never overwritten, because the app remembers what auto-detection last produced. The first check of a project imported before syncing existed is a silent backfill (it added the JSON docs and fixed modified times without raising notices). "Sync from folder" in a card's `...` menu forces a refresh; **Scan now** on the Live scan bar checks for new folders and refreshes everything. Changes made in the app (chat, decisions, context) and refreshes from disk both show up live: the All Projects page re-checks every 10s and Overview every 15s, and a toast reports "Refreshed X from disk".
- **Recently modified**: a project's modified time is the newest file time in its folder (set at import and on every sync), not the import time. All Projects cards default to most recently modified first (newest of that and any in-app activity); imported docs do not count as in-app activity. The project switcher dropdown is alphabetical.
- **Descriptions come from files.** Order: `project.json`, then `package.json`, `composer.json`, `app.json`, `manifest.json`, then the README's first paragraph. **`project.json` is the explicit convention** (`{"description": "...", "tags": [...], "category": "..."}`) and overrides everything guessed; every new project in `D:\Websites` should include a description in one of those files (this is written into `D:\Websites\CLAUDE.md` so it is applied to new projects). Folders with none of these show "No description yet".
- Import and scan are read-only on disk. The scanner needs no permissions beyond reading the folder.

### Pages that follow the references

- **Main Dashboard (`/dashboard`)**: the first page after the landing page (every "Get started" / "Sign in" link goes here until auth exists). Reference hero (time-of-day greeting, "Let's build what's next."), stat tiles, Project Activity bars (chats / files / decisions per day, last 7 days), Model Usage donut, Recent Activity, Your Projects table (Recent / Starred / Active / Archived, newest modification first), Quick Actions and the promo card. Numbers come from `GET /v1/dashboard` (totals with this-month / this-week deltas, per-day activity, usage by provider over 7 days, a de-duplicated activity feed where a burst such as a bulk import collapses into one row); the page re-checks every 15s. Placeholders: Team Members (4, 2 online) and Integrations (6), in `sampleWorkspace.ts`. The "Files" bar is large because imported docs count as files.
- **Landing (`/`)**: reference nav, hero with laptop + phone mockups, feature cards, "From questions to progress", green CTA. Left out on purpose: the "Trusted by" logo strip and the demo video (no real customers or video exist). Nav items Use cases and Pricing scroll to on-page sections; Resources does nothing yet.
- **Overview**: reference sidebar and top bar, hero banner, status row, Recent Activity, Model Usage, Top Topics, Quick Actions, Project Team, Connected Integrations.
- **Shells**: project pages use the project sidebar (switcher, models, agents). Workspace pages (`/dashboard`, `/projects`, `/integrations`, `/agents`, `/analytics`, `/settings`, `/help`) use the workspace sidebar (Main Dashboard, All Projects, Chat, Decisions, Context Library, Integrations, Agents, Analytics, Settings, models with a "More Models" row, "Pro Plan" footer as in the reference) and a top bar with **+ New Project**. Help is still a "Coming soon" placeholder.
- **Agents (`/agents`)**: "Your AI Team" hero, stat tiles, status tabs (All / Active / Idle / Offline / Custom), a 7-agent roster grid (Wendy, Chief, Chloe O'Brian, Sage, Leo, Maya, Kai) with tags and task counts, Create New Agent / Agent Templates tiles, an Agent Activity feed and Quick Actions. **Sage is real** — a "Live agent" badge and a **Chat with Sage** button open a genuine chat with prince-web-app's own Sage, with real shared memory and a working **Accept as decision** action (see "What's working" above). Everyone else here is still illustrative — there is no backend concept of an agent "task" or "status" for them yet (see Known gaps).
- **Analytics (`/analytics`)**: same hero pattern, then Usage Over Time (by model, per day), Model Usage donut, Agent Performance table, an Activity Heatmap (hour x weekday), Top Projects, Cost Tracking and Time Saved. Each number is real when it exists and falls back to an illustrative value only while it's still zero/empty, so the mock disappears on its own as real usage accrues: Total Requests, Usage Over Time, the heatmap, Top Projects and the Cost Tracking total come from the new `GET /v1/analytics` (`usage_logs` broken down by day/provider/hour, plus `project_context` size for storage); Active Projects, Decisions Created and Recent Activity also come from `/v1/analytics` / `/v1/dashboard`. Agent Performance, Active Agents and Time Saved stay illustrative always — no per-agent task log exists, and "time saved" isn't a tracked metric (see Known gaps).
- **Integrations (`/integrations`)**: Connected (OpenAI, Claude, Gemini, Notion, GitHub) and Available (Slack, Google Drive, Figma, Linear, Jira, Trello, Dropbox, Stripe, WhatsApp, Telegram, Zapier, Airtable, Supabase, Webhooks, Custom API) with search, category filter and tabs. OpenAI/Claude/Gemini's "Connected" pill and toggle are real — a live `GET /v1/credits` key-status check, same as the credits pill — so a missing or invalid key shows "Not connected" instead of a fake green pill. Everything else (Notion, GitHub, and the whole Available catalog) stays illustrative; there's no integrations backend beyond the 3 model providers.
- **Settings (`/settings`)**: workspace settings, project defaults toggles, storage, profile and quick actions, with a tab bar (General is the only built tab; the rest show "coming soon"). Storage Used is real (`project_context` content size via `/v1/analytics`, formatted KB/MB/GB); the 10 GB ceiling is an assumed ceiling, not a real quota. Everything else on the page is illustrative — there is no settings/preferences table or real auth yet, so nothing else here persists.

### What is real vs placeholder on the dashboard

| Real (from the backend) | Placeholder (no backend yet) |
| --- | --- |
| Files and Decisions counts, status, last activity | Team members (8, 3 active) and the avatar row |
| Project Health ring = decision rate (conversations that ended in a decision) and its checklist | Connected Integrations (GitHub, Linear, Notion, Slack shown as Connected) and the hero "Integrations" count |
| Model Usage % per provider (all time, not 7 days), Top Topics from decision task types | Next Milestone (Beta Release, Oct 15, 2026) |
| Project cards: status, tags, category, files, decisions, updated | Card avatars and "8 members" (same placeholder team as Overview) and the default project image; bell, "Add integration", Resources nav and the range pills do nothing |

Placeholder values live in `frontend/src/lib/sampleWorkspace.ts`; replace each block as its feature is built. "Invite Team Member" copies the page link.

## Design notes

- Moved off Supabase to SQLite to avoid the monthly compute cost of a second cloud project.
- The direction on the marketing and dashboard pages changed on 2026-09-18: earlier versions deliberately left out anything with no backend (fake team, integrations, milestone). They now follow the reference screenshots closely and use clearly-labelled placeholders (table above). The earlier "real substitute" ideas survive where they are genuinely real (decision-rate health ring, real model usage).
- Type stack on the marketing/dashboard pages: Plus Jakarta Sans (display), DM Sans (body), Caveat (handwritten notes). Brand green `#12A150`, deep green `#062B1E`, dashboard navy `#0D1220`.

## Known gaps / next up

Decided 2026-09-19, when a batch of gaps below got their backend built: **skip real
auth for now** (keep `DEMO_OWNER_ID`, revisit once there's an actual reason for
multiple users) and **skip real OpenAI/Anthropic admin-key spend tracking for now**
(needs billing-sensitive admin keys, different from the regular keys already in
`.env`) — both stay as illustrative/estimated as they are today until asked for again.

- [ ] **Wire the UI for the backend built 2026-09-19** (see "Backend built, UI not wired yet" above for the exact endpoints): Next Milestone card, Settings' General tab persistence, Integrations page real connect/test flow, Decision Detail's outcome note / implemented date / linked context, a conversation picker on Chat, a per-project auto-sync toggle + per-folder "ignore" action on Import, folder create/rename on Context Library, and a project image field. This is the single biggest concrete next step — the hard part (schema + endpoints, all tested) is already done.
- [ ] **Context Library extras**: scanned-PDF text recognition (OCR), images (held back for cost), and pulling from integrations. (Sending only the relevant sections of long documents is done — see `retrieval.py` above; it has no stemming, so a query needs the same word form as the document, e.g. "refunds" not "refund".)
- [ ] **Project Team / auth**: real users instead of `DEMO_OWNER_ID` — explicitly deferred, see above.
- [ ] **Credits real spend**: OpenAI/Anthropic admin-key spend tracking — explicitly deferred, see above; a low-balance alert is still worth adding independent of that.
- [ ] **Integrations catalog depth**: even where a live check exists (GitHub, Notion, Slack, ...) this only verifies the credential — no actual sync/action (e.g. reading a GitHub repo into context) is built. Google Drive, Zapier, Webhooks and Custom API also need an OAuth app or have no live check by nature — see the backend section above.
- [ ] **Agents — extend to prince-web-app's other 15 agents** (Sage is done — see "What's working" above; this is what's left to go further). Decisions already made when Sage was scoped, and still the plan for the rest: **full parity** (any action an agent can take in prince-web-app's admin panel — Ledger drafting/sending a real proposal, Ada drafting/sending a real invoice, Jason sending real outreach, etc. — must be triggerable from here with the same effect); **add persistent memory** to prince-web-app for the agents that don't have it yet (today only Lisa's `chat_sessions` and Sage's `sage_chats` persist server-side — every other agent's admin chat replays a client-side `localStorage` transcript, so there's nothing yet for a second app to connect to); **reuse full admin auth** (this backend would authenticate as the prince-web-app admin user via its JWT, `Authorization: Bearer`, rather than a narrower service key, since these agents' real actions live behind admin auth, unlike Sage's public route). Concretely needed beyond what Sage required: a way for this backend to obtain/refresh that JWT (`POST /api/v1/auth/login` issues a 15-minute access token + 30-day refresh token; the refresh endpoint only reads a cookie today, so bearer-only refresh needs adding or the token stored long enough to matter), new persistent-memory tables in prince-web-app per agent, and wiring each agent's real action endpoints (not just chat) — see `ProposalController::send`, `InvoiceController::send`, `NurturerController::adminSendReply` etc. prince-web-app is a live production app (real client leads/invoices/proposals) and these endpoints have real side effects, unlike Sage's read-only chat — verify one agent's real action end-to-end (in a way that's easy to undo) before wiring the rest.
- [ ] **Help** page (currently "Coming soon").
- [ ] **Analytics extras**: Agent Performance and "Time Saved" are illustrative (depend on the Agents gap above); everything else on `/analytics` is real once usage exists.
- [ ] **Descriptions for folders with no metadata**: 8 fixed 2026-09-19 (virtual-counselling, triplepmed, habitationzcic, prince-web-app-backup, buinee-app, outlook-agent, jay-foods, benashub) — check `GET /v1/projects?owner_id=...` for `category: null` if more turn up as new folders are added.
