# Engram

> A personal thinking tool that records how your thinking changes, not just where it ends up.

![Status](https://img.shields.io/badge/status-pre--release-orange)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Tests](https://img.shields.io/badge/tests-vitest-6e9f18)
![License](https://img.shields.io/badge/license-Apache%202.0-blue)

Engram is a single-user web app for thinking things through. You write a thought, branch from it, go back and revise earlier thoughts, and the app keeps the full history of every change. An optional AI helps expand ideas and challenges your claims. It never edits your content on its own.

Most people explain only the conclusion of their thinking. The rejected options, assumptions and changes of mind get lost. Engram keeps that process, so you can open a finished board and see how and why you got there.

> **Status:** pre-release. The foundation and Critic mode are built. Timeline replay, export/import and Brainstorm-mode AI are not finished. See [Roadmap](#roadmap).

## Features

- **Boards of thoughts.** Each board holds a graph of nodes (thoughts) and connections. Capture is as fast as typing in a plain note.
- **Branch or revise.** *Revise* fixes or refines a node and adds a new version. *Branch* explores an alternative and leaves the original untouched.
- **Append-only history.** Every edit keeps the old version, shown as a diff. Deleting hides a node and can be undone.
- **Obsidian-style graph.** A force-directed graph with a Free layout and a Tree layout. Drag nodes, hover to highlight neighbours, click to open a node.
- **Inline references.** Tag other thoughts in the text with `[[ ]]`.
- **Critic mode.** Add **For** and **Against** arguments to any node. With AI on, a review reads the whole board and shows up to three findings: duplicates, contradictions, new arguments, weak support and hints. You can add, link or dismiss each one. The AI never gives a verdict. You write your own.
- **Honest sourcing.** AI arguments backed by a web search show their source link. Arguments from the model's own knowledge are labelled "AI knowledge, no source".
- **AI is always optional.** One toggle turns all AI calls off. The app works fully without it, and AI failures never block capture.
- **Cost controls.** Debounced reviews, content-hash caching and a daily cap on AI calls.
- **Private by default.** Login with a username and password, server-side sessions, and API keys that never reach the browser.

## Principles

1. Capture first. Structure is optional.
2. History is never overwritten.
3. The AI suggests, you decide.
4. AI-written content is always marked.
5. The AI challenges. It does not conclude.

The full list is in [SPEC.md](./SPEC.md).

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| UI | shadcn/ui, Tailwind CSS 4, Base UI |
| Editor | CodeMirror 6 |
| Graph | `react-force-graph-2d` (d3-force) |
| State and validation | Zustand, Zod |
| Database | SQLite on [Turso](https://turso.tech) (libSQL) via Drizzle ORM and Drizzle Kit |
| AI | OpenRouter: `deepseek/deepseek-v4.1-flash-1017` for Critic reviews, `inclusionai/ling-3.1-flash` for node titles |
| Web search | [Exa](https://exa.ai) |
| Tests | Vitest |

## Getting started

### Prerequisites

- Node.js 20 or later
- [pnpm](https://pnpm.io)
- A [Turso](https://turso.tech) database (URL and auth token)
- Optional: an [OpenRouter](https://openrouter.ai) API key for AI features, and an [Exa](https://exa.ai) API key for web search in Critic mode

### Install and run

```bash
git clone https://github.com/jenasatyajit/engram.git
cd engram
pnpm install
```

Create `.env.local` in the project root:

```bash
# Database (required)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

# Login user, used once by the seed script (required)
SEED_USERNAME=your-username
SEED_PASSWORD=at-least-8-characters

# AI (optional; without these the app runs with AI off)
OPENROUTER_API_KEY=
EXA_API_KEY=
```

Apply migrations, create your user and start the dev server:

```bash
pnpm db:migrate
pnpm db:seed-user
pnpm dev
```

Open <http://localhost:3000> and sign in with the credentials you set. Running `pnpm db:seed-user` again resets that user's password and signs it out everywhere.

## Configuration

All variables are read on the server. Never commit `.env.local`.

| Variable | Required | Description |
|---|---|---|
| `TURSO_DATABASE_URL` | Yes | Turso database URL. A local `file:` URL also works. |
| `TURSO_AUTH_TOKEN` | For Turso | Turso auth token. |
| `SEED_USERNAME`, `SEED_PASSWORD` | For seeding | Credentials for the single login user. Password must be at least 8 characters. |
| `OPENROUTER_API_KEY` | For AI | Enables node titles and Critic reviews. |
| `OPENROUTER_CRITIC_MODEL` | No | Override the Critic review model. |
| `OPENROUTER_TITLE_MODEL` | No | Override the node title model. |
| `EXA_API_KEY` | No | Enables web search in Critic reviews. Without it, reviews use the model's own knowledge. |
| `AI_DAILY_CALL_CAP` | No | Daily cap on AI calls. Default `300`. |
| `NEXT_PUBLIC_SITE_URL` | No | Public site URL used for metadata. Default `http://localhost:3000`. |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Build and serve for production |
| `pnpm test` / `pnpm test:watch` | Run the Vitest suite |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Lint, type-check, format |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:verify` | Verify the migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm db:seed-user` | Create the login user or reset its password |

## Project structure

```
app/          Routes and server actions (boards, AI, Critic, auth)
components/   Editor, graph, sidebar, Critic panel, mascot, shadcn/ui
lib/
  board/      Board, node and version logic, diffs, mentions
  critic/     Critic review: context, prompt, stance, storage
  ai/         The single AI module: OpenRouter, Exa, usage cap, errors
  auth/       Password hashing, sessions
  db/         Drizzle schema and Turso client
  editor/     Client store and local drafts
  graph/      Graph data
drizzle/      SQL migrations
scripts/      Seed, migration check, end-to-end helpers
tests/        Vitest tests for versioning, graph, Critic and auth
```

## Architecture notes

- The server owns the database and every AI and search call. The browser talks only to the app's own server routes.
- All AI calls go through one module, so the model or provider can be swapped without touching the rest of the app.
- Every AI response is parsed and validated against a Zod schema. Invalid output is discarded and shown as an error, never partly applied.
- Web search results are treated as untrusted data. The model cites results by id and the server attaches the real URLs, so a link cannot be invented.
- Version history is append-only, and deletes are soft.

## Roadmap

The build order is in [SPEC.md, section 10](./SPEC.md). Each milestone ships and is reviewed before the next starts.

- [x] **Foundation:** boards, branching, revising with version history, soft delete, graph view, capture
- [x] **Critic mode:** For/Against arguments and AI review on leave
- [ ] **Replay:** show a board as it was at an earlier moment
- [ ] **Export and import** of a board
- [ ] **AI core:** on-demand "expand this node" in Brainstorm mode
- [ ] **Background suggestions:** links, conflicts, stale propagation, gaps, duplicates
- [ ] **Later:** read-only share view, large-board handling

## Contributing

Engram is a personal project with a strict spec. Please open an issue to discuss a change before sending a pull request, and do not add features that [SPEC.md](./SPEC.md) does not describe. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before submitting.

Next.js 16 has breaking changes from earlier versions. Check the docs in `node_modules/next/dist/docs/` before writing framework code.

## License

Licensed under the [Apache License 2.0](./LICENSE).
