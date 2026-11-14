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
6. **Facts need sources.** Any factual claim in Critic mode must carry a source link, or be labelled unverified.
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
Purpose: challenge a chosen claim.

- The owner selects a node and asks the AI to challenge it.
- The AI returns a set of arguments. Each argument has a stance (for or against), reasoning, and evidence with source links.
- The AI also lists the hidden assumptions in the claim and what evidence would change the owner's mind.
- For each argument the owner chooses: add it to the graph as an objection, write a rebuttal (stored as a defense node), or dismiss it.
- The AI gives no verdict. The owner writes their own verdict, which becomes a node.
- Critic mode with AI off is not applicable; the AI toggle must be on to request a challenge.

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

### 7.5 Web search in Critic mode
- Search provider: Exa.
- Exposed to the model as a tool it can call. The server runs the search and returns results to the model.
- Every factual claim shown to the owner must include its source link. Claims without a source are labelled "unverified".

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
- If deployed: protect the app with a single shared password so strangers cannot read the data or spend AI credits. Not needed for local-only use.

## 10. Build order

Each milestone must be usable and reviewed by the owner before starting the next.

1. **Foundation, no AI:** boards, nodes, branching, revising with version history, soft delete, graph view, plain capture chat box, export/import.
2. **Replay:** timeline control showing a board at an earlier moment.
3. **AI core:** the AI module, structured output with validation, AI toggle, and on-demand "expand this node" in Brainstorm mode.
4. **Critic mode:** challenge flow with Exa-backed sourced evidence and the accept / rebut / dismiss actions.
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
| D17 | Local-only needs no login; deployed needs a shared password | Protects private data and AI credits |
| D18 | Share view is deferred until after version 1 | Capture and AI value come first |
| D19 | Build in the order of section 10, starting with no AI | If the owner does not enjoy thinking in the plain tool, AI will not fix that |
| D20 | Node titles are written by AI only (no manual title for now), from the node body, via OpenRouter `inclusionai/ling-3.1-flash`. New branches get the placeholder `B#: <parent title>` until text is saved. Titles are applied automatically (no accept step), marked as AI, and have no history. Added 2026-11-14 by the owner | Fast way to recognise nodes; a title is a label, not the owner's content, so the accept step (principle 3) is waived for titles only. Built ahead of milestone 3 by the owner's choice; the AI toggle still turns it off |
| D21 | OpenRouter is added as a second AI provider for small generation jobs; Sarvam `sarvam-105b` stays the model for the main AI features (D9) | Cheap, fast model for short outputs; all calls still go through the one AI module |
| D22 | Decision models (OpenRouter Decisions API) are planned for gating, type labels, background yes/no checks and Critic stance labels, but not used yet; only the normal LLM is used for titles | They return probabilities, not text, so they cannot write titles; they are fast and cheap for typed decisions later |

## 13. Open items

- App name (choose from candidates).
- Deployment: planned for Vercel, not yet scheduled. When deployed, add the shared password (D17).
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
