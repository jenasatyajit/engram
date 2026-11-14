# Project Spec: Personal Thinking Tool

Name: Engram
Status: Pre-build. Decisions below are agreed unless marked open.
Last updated: 2026-11-14

This document is the source of truth for AI agents building this project. Follow it. If something is ambiguous or missing, ask the owner before inventing behavior. Do not add features that are not listed here.

---

## 1. What we are building

A personal web app for thinking things through, shown as a graph of thoughts. The owner writes a thought, branches from it, goes back and revises earlier thoughts, and the app keeps the full history of how the thinking changed. An optional AI helps expand ideas, connects related branches, and challenges the owner's claims.

The interface is a chat box (similar in feel to Perplexity) beside a graph (similar in feel to Obsidian's graph).

## 2. Why we are building it

The owner usually explains only the conclusion of a piece of thinking. The process, the rejected options, the assumptions and the changes of mind are lost. This tool records the process as it happens, so the reasoning can be reviewed, replayed and shared later.

Success means: the owner can open a finished board and see not just what they concluded, but how and why they got there.

## 3. Principles

1. **Capture first.** Recording a thought must be as fast as typing in a plain note. Structure is optional and added later, never required up front.
2. **History is never overwritten.** Every edit keeps the old version. Deleting hides, it does not destroy.
3. **The AI suggests; the owner decides.** The AI never changes the owner's content on its own. Every AI change is a visible proposal that is accepted, edited or dismissed.
4. **AI-written content is always marked** as AI-written, so the record shows whose thinking is whose.
5. **The AI challenges, it does not conclude.** It never gives a final verdict on the owner's decisions.
6. **Be honest about where a claim comes from.** In Critic mode, an AI argument backed by a web source shows its source link; an AI argument from the model's own knowledge is labelled "AI knowledge, no source". The owner's own arguments need no source and are never labelled (D24).
7. **Private by default.** This is a single-user tool for the owner's own thoughts.

## 4. Scope

### In scope (version 1)
- Boards containing a graph of thoughts (nodes and connections)
- Two modes: Brainstorm and Critic
- A global AI toggle that works in both modes
- Branching, revising, backtracking
- Version history for every node
- Timeline replay of a board
- Suggestions from the AI, with accept / edit / dismiss
- Web search for Critic mode
- Export and import of a board
- Login with a username and password (single seeded user; D23)

### Out of scope (for now)
- Multiple users, accounts, collaboration
- A public or shareable read-only view (planned after version 1)
- Mobile app
- Embeddings and semantic search
- Voice input
- Rich text editing (plain text, simple markdown at most)
- Any AI feature not described below

## 5. Core concepts (plain-language definitions)

- **Board:** one topic or problem being thought through. Contains nodes and connections.
- **Node:** a single thought. Starts as plain text. May optionally be labelled with a type: thought, question, assumption, evidence, objection, defense, or verdict.
- **Node title:** a short 2–4 word name for a node, shown in the breadcrumb, branch chips, sidebar and graph. A new branch starts with a placeholder title `B#: <parent title>` (# = its branch number under that parent). When the owner saves text (revise, branch instead, new thought, or auto-save on leaving), the AI writes a new title from the node body, if the AI toggle is on. Titles are labels, not versioned (no history), and AI-written titles are marked as AI. A node with no title falls back to its first line.
- **Version:** a saved state of a node's text. Every edit creates a new version with a timestamp and an optional note on why it changed. Old versions stay viewable.
- **Connection:** a link between two nodes. Kinds: child (branch), related, supports, contradicts, depends-on. Each connection records whether the owner or the AI created it and whether it is confirmed or only suggested.
- **Revise vs Branch (key distinction):**
  - *Revise* changes an existing node because the owner was wrong or refined the idea. The node stays the same node and gains a new version.
  - *Branch* creates a new node to explore an alternative. The original is untouched.
- **Suggestion:** a pending AI proposal (a link, a conflict, a stale warning, a gap, a duplicate, or new ideas). It stays pending until the owner acts on it. Dismissed suggestions are remembered so they are not repeated.
- **Message:** an entry in the chat history, linked to the nodes it concerned.

## 6. Modes

### 6.1 Brainstorm mode
Purpose: grow and edit the graph.

- The chat box creates and expands nodes.
- **AI off:** the chat box is plain capture. Whatever the owner types becomes a node, with no AI involvement.
- **AI on:**
  - Proposes directions from a selected node (alternatives, questions, hidden assumptions) as ghost nodes. The owner clicks the ones they want to keep.
  - Watches for relationships across branches and proposes connections.
  - When the owner revises a node, flags other nodes that depended on it as stale and proposes a rewrite for each, shown as a before/after comparison.
  - Points out missing assumptions and possible duplicates.

### 6.2 Critic mode
Purpose: build and test the case for and against a thought (revised 2026-11-14, D24).

- **The claim:** the board title is the main thought; the board's first node is its description or supporting text.
- **Arguments:** on any node the owner adds **For** and **Against** branches. For becomes an `evidence` node; Against becomes an `objection` node, or a `defense` node when it argues against an objection (a rebuttal). Any node can have many arguments, and arguments can be argued with in turn. The owner's arguments are plain text; no source is needed.
- **AI review (AI toggle on):** after each leave event (switching node, adding a branch, opening the graph or another board, or renaming the board), the AI reads the **whole board** (every branch from every root, every argument, who wrote it) and the mascot panel shows up to 3 findings:
  - **Duplicate:** two arguments make the same point.
  - **Contradiction:** two of the owner's points clash.
  - **New argument:** a ready-made For or Against argument on a named node, from the model's own knowledge and/or Exa web search (7.5).
  - **Weak support:** an argument does not really support or attack its parent.
  - **Hint:** a gap, a hidden assumption, or a question worth answering.
- **Owner actions:** a new argument can be **added** (it becomes an AI-written evidence/objection/defense node) or dismissed; a duplicate can be linked as `related`, a contradiction linked as `contradicts`, a weak support or hint acknowledged; every finding can be dismissed. Dismissed findings are remembered and not raised again.
- The AI gives no verdict. The owner writes their own verdict, which becomes a `verdict` node under the claim.
- **AI off:** the owner can still add For, Against and Verdict nodes by hand; no reviews run.

### 6.3 The AI toggle
A single toggle, always visible, that applies to both modes. Off means no AI calls of any kind are made.

## 7. How the AI works

### 7.1 Model and service
- Model: Sarvam `sarvam-105b` (128K token context window), via the v1 chat completions endpoint.
- Not Sarvam-M (deprecated). Not the v2 endpoint (requires beta access).
- **Small generation jobs (node titles):** OpenRouter chat completions with `inclusionai/ling-3.1-flash`. This model has no JSON-schema mode on OpenRouter, so the title is returned through a forced tool call whose arguments are validated (7.2). Reasoning is turned off and the output length is capped. Key in `OPENROUTER_API_KEY` (server-side only).
- **Decision models (planned, not used yet):** OpenRouter's Decisions API (`/api/alpha/decisions`, e.g. TypeSafe Jev, Perplexity Decider) returns typed probabilities (`noul` yes/no, `choice`, `score`) instead of text. Planned uses: gate whether an edit is worth a new title (skips needless LLM calls), suggest a node's type label, yes/no checks for duplicates, conflicts and stale nodes (7.4), and labelling Critic arguments for/against. Not suitable for writing titles: they cannot generate text, and the Extractions API only copies phrases verbatim.
- All AI calls happen on the server. The API key is never exposed to the browser.
- All AI calls go through one dedicated module so the model or provider can be swapped without touching the rest of the app.

### 7.2 Structured output
- Every AI feature returns structured data (using the model's JSON schema mode with strict adherence), referencing nodes by id. Free-text-only AI responses are used only for the chat reply itself.
- Every AI response is parsed and validated against a schema before the app uses it. Invalid responses are discarded and surfaced as an error, never partially applied.
- Tool-call arguments are also parsed and validated before any tool runs.
- Set the maximum output length explicitly; the default is too low for long answers.

### 7.3 Context
- Version 1 sends the **whole board** to the model as compact text: one line per node with its id, type, text and parent, plus its connections. This fits comfortably within the context window for boards of a few hundred nodes.
- The selected node is stated explicitly so the model knows the focus.
- Recent chat messages are included; a running summary may be added later if needed.
- No embeddings and no vector search in version 1 (see decision log).
- If a board approaches the context limit, the app must warn the owner. Handling large boards is a later milestone.

### 7.4 Suggestions: when and how
When the AI toggle is on:
1. The owner finishes editing a node (pauses typing or leaves the node).
2. The app sends the board to the model and asks for link, conflict, stale, gap and duplicate findings related to the edited node.
3. Results are stored as pending suggestions and shown subtly: a dot on the node, dashed ghost connections, and an entry in a suggestions tray.
4. The owner accepts, edits or dismisses each one.

Suggestion types: **link**, **conflict**, **stale** (with a proposed rewrite), **gap**, **duplicate**, and **expand** (new ideas).

**First use: Critic reviews (D24).** The Critic review in 6.2 is the first suggestion feature built. It runs only in Critic mode with the AI toggle on, after a leave event, debounced, and is skipped when the board content (hashed) has not changed since the last review. Findings are stored as pending suggestions, each new review replaces the previous pending ones, and dismissed findings are kept and sent to the model so they are not repeated. Brainstorm-mode background suggestions stay in milestone 5.

### 7.5 Web search in Critic mode
- Search provider: Exa.
- Exposed to the model as a tool it can call. The server runs the search and returns results to the model.
- In a Critic review the model decides whether a search helps; at most 2 searches per review, 5 results each, using Exa highlights. Each search counts against the daily cap (7.6).
- The model cites search results by id; the server attaches the real URLs, so a link can never be invented. An AI argument with no valid source is labelled "AI knowledge, no source" (principle 6).
- Search results are untrusted data: they are passed to the model as content, never as instructions.
- If Exa is not configured or fails, the review continues with the model's own knowledge.

### 7.6 Cost and safety controls
Free credits are small, so these are required:
- Debounce background suggestions (run after the owner pauses).
- Skip nodes that have not changed since the last check; cache results by a hash of the content.
- A configurable daily cap on AI calls, with a visible indicator when approaching it.
- AI failures must never block capture; the app works fully with AI off or failing.

## 8. Interface

- **Home:** one centered input ("What are you thinking about?"), the mode toggle, the AI toggle, and a list of recent boards.
- **Board screen:** the graph in the center; a right panel with chat, the selected node's text, its version history and the suggestions tray; a top bar with mode toggle, AI toggle, timeline control and export.
- **Graph:** an Obsidian-style force-directed graph of one board, opened from the top bar and replacing the editor. Two layouts with a toggle: **Free** (force cloud) and **Tree** (same physics, with branches arranged in levels so the structure is easy to read). Nodes can be dragged; hovering highlights a node's neighbours; clicking a node opens it in the editor. Positions are not saved: the layout re-settles each time.
- **Nodes show:** type label (if any), version indicator, AI-authored marker, and a suggestion dot.
- **Critic stance colours:** a branch line in the graph, and the dot on a branch chip, is green for For (`evidence`) and red for Against (`objection`, `defense`). There is no separate supports/contradicts link for an argument and its parent; the branch line carries the stance.
- **Mascot panel in Critic mode:** shows the AI review findings as cards with their actions, a thinking state while reviewing, and errors with a retry. When the sidebar hides the panel, a dot on the sidebar toggle shows that findings are waiting.
- **Ghost items:** AI proposals appear visually distinct (faded or dashed) until accepted.
- **Timeline:** a control that shows the board as it was at any earlier moment.
- Use the existing shadcn and Tailwind setup for all interface components.

## 9. Technical decisions

| Area | Choice |
|---|---|
| Framework | Next.js (project already created) |
| UI | shadcn/ui + Tailwind CSS (already set up) |
| Database | SQLite via Drizzle ORM, with Drizzle Kit migrations |
| Hosting of data | Turso (hosted SQLite, libSQL) from the start, in development and when deployed. Connection details in `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (server-side env only) |
| Graph rendering | `react-force-graph-2d` (canvas, d3-force physics) with Free and Tree layouts |
| Client state | Zustand |
| Validation and shared types | Zod |
| LLM | Sarvam `sarvam-105b` (server-side only); OpenRouter `inclusionai/ling-3.1-flash` for node titles (D21) |
| Web search | Exa API (server-side only) |
| Tests | Vitest, focused on versioning and graph logic |

Architecture rules:
- The server owns the database and all AI/search calls. The browser talks only to the app's own server routes.
- API keys live in environment variables on the server only.
- Version history is append-only. Edits add versions; nothing is overwritten.
- Deleting a node or connection marks it deleted; it can be restored and still appears in timeline replay.
- Every piece of AI-created content records that it came from the AI.
- Access is protected by login (D23): a username and password checked against the `users` table, server-side sessions in a 30-day sliding `sessions` table, an HttpOnly cookie, and a login attempt limit. Every page and server action verifies the session. Boards are not owned by users yet (single user); ownership comes with multi-user support.

## 10. Build order

Each milestone must be usable and reviewed by the owner before starting the next.

1. **Foundation, no AI:** boards, nodes, branching, revising with version history, soft delete, graph view, plain capture chat box, export/import.
2. **Replay:** timeline control showing a board at an earlier moment.
3. **AI core:** the AI module, structured output with validation, AI toggle, and on-demand "expand this node" in Brainstorm mode.
4. **Critic mode:** For/Against arguments, AI review on leave (duplicates, contradictions, new arguments from model knowledge and Exa, weak support, hints) with add / link / dismiss actions, and the owner's verdict (6.2, D24). Built before milestone 3 by the owner's choice; it includes the Sarvam client that milestone 3 reuses.
5. **Background suggestions:** links, conflicts, stale propagation, gaps, duplicates, with cost controls.
6. **Later:** read-only share view (conclusion on top, full process beneath), large-board handling, embeddings if needed.

## 11. Rules for agents working on this project

- Build only what this spec describes. Propose additions rather than adding them.
- Do not change a decision in the log without the owner's approval.
- Never write AI-generated changes into the owner's content without an explicit accept action.
- Never expose API keys to the browser.
- Validate all AI output before use; fail safe and visibly.
- Keep history immutable.
- Keep the app fully usable with the AI toggle off.
- When a requirement is unclear, ask a short question instead of guessing.

## 12. Decision log

| # | Decision | Reason |
|---|---|---|
| D1 | Brainstorm and Critic are two lenses on one shared graph, not separate apps | The same thoughts need to be both grown and challenged |
| D2 | Revise and Branch are distinct actions | Backtracking and fixing is the core of the problem being solved |
| D3 | With AI off, the chat box is plain capture | Owner's choice; keeps capture friction-free |
| D4 | AI only suggests; it never silently edits | Keeps the record as the owner's real thinking |
| D5 | The tool is for the owner only | Owner's choice; removes accounts and collaboration from scope |
| D6 | Next.js, shadcn, Tailwind | Already set up by the owner |
| D7 | SQLite with Drizzle, hosted on Turso from the start (local development also uses the Turso cloud database). Revised 2026-11-14 by the owner; previously "local file first, Turso only if deployed" | Data is small and relational; one database means the same data everywhere; the same client also accepts a local `file:` URL if ever needed |
| D8 | No graph database, no vector database | Unnecessary at this scale; connections are just records |
| D9 | AI via Sarvam `sarvam-105b`, v1 endpoint, server-side only | Owner's choice; 128K context; supports structured JSON output and tool calling; v2 needs beta access; Sarvam-M is deprecated |
| D10 | Strict structured output plus validation on every AI response | Suggestions must reference real nodes reliably |
| D11 | Web search through Exa as a model tool; unsourced facts shown as unverified | The model alone can state plausible but wrong facts |
| D12 | No embedding model in version 1; send the whole board to the model | The context window is large enough; Sarvam embeddings require requesting access; simpler and finds meaning-level links |
| D13 | Embeddings may be added later (local model) if boards grow large or cross-board search is wanted | Deferred, not rejected |
| D14 | Force-directed graph (`react-force-graph-2d`) with a Free layout and a Tree layout. Revised 2026-11-14 by the owner; previously "tree layout with cross-links, via React Flow" | Owner wants an Obsidian-style interactive graph; Tree layout keeps the branch structure readable; canvas easily handles boards of a few hundred nodes |
| D15 | Append-only versions and soft deletes | Enables replay and protects history |
| D16 | Cost controls (debounce, caching, daily cap) are required | Free credits are small |
| D17 | Superseded by D23 (was: local-only needs no login; deployed needs a shared password) | Protects private data and AI credits |
| D18 | Share view is deferred until after version 1 | Capture and AI value come first |
| D19 | Build in the order of section 10, starting with no AI | If the owner does not enjoy thinking in the plain tool, AI will not fix that |
| D20 | Node titles are written by AI only (no manual title for now), from the node body, via OpenRouter `inclusionai/ling-3.1-flash`. New branches get the placeholder `B#: <parent title>` until text is saved. Titles are applied automatically (no accept step), marked as AI, and have no history. Added 2026-11-14 by the owner | Fast way to recognise nodes; a title is a label, not the owner's content, so the accept step (principle 3) is waived for titles only. Built ahead of milestone 3 by the owner's choice; the AI toggle still turns it off |
| D21 | OpenRouter is added as a second AI provider for small generation jobs; Sarvam `sarvam-105b` stays the model for the main AI features (D9) | Cheap, fast model for short outputs; all calls still go through the one AI module |
| D22 | Decision models (OpenRouter Decisions API) are planned for gating, type labels, background yes/no checks and Critic stance labels, but not used yet; only the normal LLM is used for titles | They return probabilities, not text, so they cannot write titles; they are fast and cheap for typed decisions later |

| D23 | Login with username and password replaces the shared password (D17). One user, created by a seed script (`pnpm db:seed-user`, credentials from `SEED_USERNAME` and `SEED_PASSWORD` in env, never committed). Passwords hashed with scrypt; sessions stored server-side (SHA-256 of the cookie token), 30 days sliding; 5 failed logins per 15 minutes per IP are blocked. No ownership column on boards yet; multi-user is planned later. Added by the owner | Protects private data and AI credits once deployed; the user table is the base for multi-user later without building it now |
| D24 | Critic mode is For/Against arguments on any node plus an AI review after each leave event (Critic mode, AI on): whole-board context, up to 3 findings (duplicate, contradiction, new argument, weak support, hint), model knowledge plus Exa search (max 2 per review, counted in the daily cap). AI arguments from model knowledge are labelled "AI knowledge, no source"; the owner's arguments need no source. Stance is shown by node type and branch-line colour, not an extra link. Replaces the earlier "challenge a chosen claim" flow and relaxes principle 6. Added 2026-11-14 by the owner | The owner wants to build the case themselves with the AI as a running sparring partner; sources are shown when they exist, and honesty about knowledge-only claims replaces a hard source requirement |

## 13. Open items

- App name (choose from candidates).
- Deployment: planned for Vercel, not yet scheduled. Login (D23) is already in place; set `SEED_*` locally and run the seed script once.
- Exact daily AI call cap.
- Final list of node type labels (current list is a starting point).

## 14. Verified facts about external services (checked Nov 2026; re-verify before relying)

- Sarvam `sarvam-105b`: 128K context; supports tool calling and JSON-schema structured output; default max output is 2048 tokens unless raised; output is not exactly reproducible.
- Sarvam-M is deprecated. The v2 chat endpoint requires beta access.
- Sarvam embeddings exist but require requesting access.
- New Sarvam accounts receive a small amount of free credit; pricing has changed several times recently, so confirm on the dashboard.
- Sarvam docs show no built-in web search, hence Exa.
- OpenRouter `inclusionai/ling-3.1-flash`: 1M context; about $0.045 / $0.135 per 1M input/output tokens; supports `tools`, `tool_choice`, `max_tokens` and `reasoning`, but not `response_format` / structured outputs (checked via the OpenRouter models API, Nov 2026).
- OpenRouter Decisions API is alpha; decision models (Jev 1.14 about 0.1 s, about $0.04 per 1M input tokens) return `noul` / `choice` / `score` / `box` answers, never generated text.
