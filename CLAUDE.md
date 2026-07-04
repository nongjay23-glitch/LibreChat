# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# LibreChat

## Project Overview

This is a customized fork of [LibreChat](https://librechat.ai) (`origin` = `nongjay23-glitch/LibreChat`, `upstream` = `danny-avila/LibreChat`). On top of stock LibreChat, this fork adds a custom multi-mode AI workspace built around three modes, switchable via `client/src/components/Workspace/WorkspaceModeTabs.tsx`:

- **Chat** — normal LibreChat conversation surface, plus a Notebook/Sources knowledge/reference mode (read-only; source Q&A and notes, no file or tool actions).
- **Cowork** — task-focused planning chat (rooms/projects, `/ask` and `/plan`, planner + decision cards, Codex prompt handoff). Read-only planning only: it must never write normal Chat conversations/messages, mutate files, run terminal commands, apply patches, or create checkpoints.
- **Code** — the only mode allowed to touch real files: diff review, patch apply, checkpoint, rollback, and verification.

**Before editing any workspace-mode file, read `SYSTEM_FILE_MAP.md`.** It is the source of truth for which files belong to Chat/Cowork/Code/Notebook and the safety boundaries between them — don't infer ownership just by reading the code. Other living project docs, kept up to date separately from this file:

- `COWORK_ROADMAP.md` — Cowork product direction and phases (not a file-ownership map).
- `CODE_MODE_HANDOFF.md` — running handoff/checkpoint note for the custom workspace effort, including local dev URLs and default models.
- `PROJECT_NOTES.md` — smaller in-flight features (e.g., Code-context attachments as temporary chat attachments).

### Critical safety boundaries

- Cowork must never write normal Chat conversations/DB messages, mutate files, run terminal/tool commands, apply patches, or create checkpoints — Code mode is the only real file-apply path.
- Notebook/Sources is read/reference only; never mix it with Cowork file actions.
- `api/server/routes/workspace.js` is shared by Cowork, Code, and Sources routes — scope edits narrowly to the mode you're changing; don't let a Cowork change alter Code-mode apply/checkpoint/rollback/verify behavior or vice versa.
- Never edit `.env`, `.git`, `node_modules`, logs, uploads, database files, or binaries from workspace-mode code paths; these are blocked/constrained by the apply-patch safety logic on purpose.
- `.workspace-activity.jsonl` and `.workspace-checkpoints/` are local runtime-only artifacts — do not commit them.
- If a file's ownership/responsibility is unclear, treat it as `needs verification` in `SYSTEM_FILE_MAP.md` rather than guessing.

## Monorepo Structure

LibreChat (and this fork) is a monorepo with the following key workspaces:

| Workspace | Language | Side | Dependency | Purpose |
|---|---|---|---|---|
| `/api` | JS (legacy) | Backend | `packages/api`, `packages/data-schemas`, `packages/data-provider`, `@librechat/agents` | Express server — minimize changes here |
| `/packages/api` | **TypeScript** | Backend | `packages/data-schemas`, `packages/data-provider` | New backend code lives here (TS only, consumed by `/api`) |
| `/packages/data-schemas` | TypeScript | Backend | `packages/data-provider` | Database models/schemas, shareable across backend projects |
| `/packages/data-provider` | TypeScript | Shared | — | Shared API types, endpoints, data-service — used by both frontend and backend |
| `/client` | TypeScript/React | Frontend | `packages/data-provider`, `packages/client` | Frontend SPA |
| `/packages/client` | TypeScript | Frontend | `packages/data-provider` | Shared frontend utilities |

The source code for `@librechat/agents` (major backend dependency, same team) is at `/home/danny/agentus`.

---

## Workspace Boundaries

- **All new backend code must be TypeScript** in `/packages/api`.
- Keep `/api` changes to the absolute minimum (thin JS wrappers calling into `/packages/api`).
- Database-specific shared logic goes in `/packages/data-schemas`.
- Frontend/backend shared API logic (endpoints, types, data-service) goes in `/packages/data-provider`.
- Build data-provider from project root: `npm run build:data-provider`.

---

## Backend Architecture (`/api`, `packages/api`)

- `api/server/index.js` boots the Express app; `api/server/routes/*.js` define REST endpoints (one file per resource, e.g. `agents/`, `assistants/`, `files/`, `workspace.js`), which delegate to `api/server/controllers` and `api/server/services/*` (e.g. `services/MCP.js`, `services/Endpoints`, `services/Files`, `services/Runs`, `services/Tools`).
- `api/server/middleware` holds auth/rate-limit/validation middleware; `api/models` holds Mongoose model accessors; `api/app` wires up model clients (`api/app/clients`) for the various AI providers.
- `packages/api/src` is where new TypeScript backend logic lives, organized by domain (`agents`, `mcp`, `auth`, `oauth`, `endpoints`, `files`, `tools`, `skills`, `memory`, `prompts`, `acl`, `crypto`, `cache`, `cluster`, etc.) — `/api` should only thinly wrap these.
- `packages/data-schemas/src` holds Mongoose schemas/models and DB migrations (`src/migrations`), shared by any backend workspace that touches the DB.
- `packages/data-provider/src` is the shared contract between frontend and backend: API endpoint paths (`api-endpoints.ts`), the fetch layer (`data-service.ts`), and shared types — check here before adding a new type or endpoint path.

## Frontend Architecture (`client/src`)

- `client/src/routes` defines the router tree, e.g. `Root.tsx` (post-auth app shell hosting `UnifiedSidebar`) and `ChatRoute.tsx` (chooses between normal `ChatView` and `CoworkChatView` based on the active workspace panel).
- `client/src/components` groups feature UI in directories, notably `components/Workspace/*` for the Cowork/Code/Sources panels (`CoworkChatView`, `CoworkRoomsList`, `CodePanel`, `SourcesPanel`) — see `SYSTEM_FILE_MAP.md` before editing these.
- `client/src/hooks`, `client/src/store` (Recoil) hold cross-cutting state; `store/families.ts` includes Notebook/Sources state and current conversation/model-selection selectors.
- `client/src/data-provider` wraps `packages/data-provider` react-query hooks per feature.
- Cowork's local room/project/message state is a separate domain layer (`components/Workspace/coworkRooms.ts`) persisted to `localStorage` (`librechat.cowork.*` keys) — it is intentionally decoupled from the normal Chat conversation/message pipeline (`hooks/Messages/useSubmitMessage.ts`, `hooks/Chat/useChatHelpers.ts`).

## Local Development Environment

- Local stack is run via `docker-compose.local.yml` (app container `LibreChat`, Mongo container `chat-mongodb`); app is served at `http://localhost:3080`.
- See `CODE_MODE_HANDOFF.md` for the current default/test model names and further local-environment notes.
- Provider/API keys and other sensitive config live in local `.env`/config files — never print or commit them.

---

## Code Style

### Naming and File Organization

- **Single-word file names** whenever possible (e.g., `permissions.ts`, `capabilities.ts`, `service.ts`).
- When multiple words are needed, prefer grouping related modules under a **single-word directory** rather than using multi-word file names (e.g., `admin/capabilities.ts` not `adminCapabilities.ts`).
- The directory already provides context — `app/service.ts` not `app/appConfigService.ts`.

### Structure and Clarity

- **Never-nesting**: early returns, flat code, minimal indentation. Break complex operations into well-named helpers.
- **Functional first**: pure functions, immutable data, `map`/`filter`/`reduce` over imperative loops. Only reach for OOP when it clearly improves domain modeling or state encapsulation.
- **No dynamic imports** unless absolutely necessary.

### DRY

- Extract repeated logic into utility functions.
- Reusable hooks / higher-order components for UI patterns.
- Parameterized helpers instead of near-duplicate functions.
- Constants for repeated values; configuration objects over duplicated init code.
- Shared validators, centralized error handling, single source of truth for business rules.
- Shared typing system with interfaces/types extending common base definitions.
- Abstraction layers for external API interactions.

### Iteration and Performance

- **Minimize looping** — especially over shared data structures like message arrays, which are iterated frequently throughout the codebase. Every additional pass adds up at scale.
- Consolidate sequential O(n) operations into a single pass whenever possible; never loop over the same collection twice if the work can be combined.
- Choose data structures that reduce the need to iterate (e.g., `Map`/`Set` for lookups instead of `Array.find`/`Array.includes`).
- Avoid unnecessary object creation; consider space-time tradeoffs.
- Prevent memory leaks: careful with closures, dispose resources/event listeners, no circular references.

### Type Safety

- **Never use `any`**. Explicit types for all parameters, return values, and variables.
- **Limit `unknown`** — avoid `unknown`, `Record<string, unknown>`, and `as unknown as T` assertions. A `Record<string, unknown>` almost always signals a missing explicit type definition.
- **Don't duplicate types** — before defining a new type, check whether it already exists in the project (especially `packages/data-provider`). Reuse and extend existing types rather than creating redundant definitions.
- Use union types, generics, and interfaces appropriately.
- All TypeScript and ESLint warnings/errors must be addressed — do not leave unresolved diagnostics.

### Comments and Documentation

- Write self-documenting code; no inline comments narrating what code does.
- JSDoc only for complex/non-obvious logic or intellisense on public APIs.
- Single-line JSDoc for brief docs, multi-line for complex cases.
- Avoid standalone `//` comments unless absolutely necessary.

### Import Order

Imports are organized into three sections:

1. **Package imports** — sorted shortest to longest line length (`react` always first).
2. **`import type` imports** — sorted longest to shortest (package types first, then local types; length resets between sub-groups).
3. **Local/project imports** — sorted longest to shortest.

Multi-line imports count total character length across all lines. Consolidate value imports from the same module. Always use standalone `import type { ... }` — never inline `type` inside value imports.

### JS/TS Loop Preferences

- **Limit looping as much as possible.** Prefer single-pass transformations and avoid re-iterating the same data.
- `for (let i = 0; ...)` for performance-critical or index-dependent operations.
- `for...of` for simple array iteration.
- `for...in` only for object property enumeration.

---

## Frontend Rules (`client/src/**/*`)

### Localization

- All user-facing text must use `useLocalize()`.
- Only update English keys in `client/src/locales/en/translation.json` (other languages are automated externally).
- Semantic key prefixes: `com_ui_`, `com_assistants_`, etc.

### Components

- TypeScript for all React components with proper type imports.
- Semantic HTML with ARIA labels (`role`, `aria-label`) for accessibility.
- Group related components in feature directories (e.g., `SidePanel/Memories/`).
- Use index files for clean exports.

### Data Management

- Feature hooks: `client/src/data-provider/[Feature]/queries.ts` → `[Feature]/index.ts` → `client/src/data-provider/index.ts`.
- React Query (`@tanstack/react-query`) for all API interactions; proper query invalidation on mutations.
- QueryKeys and MutationKeys in `packages/data-provider/src/keys.ts`.

### Data-Provider Integration

- Endpoints: `packages/data-provider/src/api-endpoints.ts`
- Data service: `packages/data-provider/src/data-service.ts`
- Types: `packages/data-provider/src/types/queries.ts`
- Use `encodeURIComponent` for dynamic URL parameters.

### Performance

- Prioritize memory and speed efficiency at scale.
- Cursor pagination for large datasets.
- Proper dependency arrays to avoid unnecessary re-renders.
- Leverage React Query caching and background refetching.

---

## Development Commands

| Command | Purpose |
|---|---|
| `npm run smart-reinstall` | Install deps (if lockfile changed) + build via Turborepo |
| `npm run reinstall` | Clean install — wipe `node_modules` and reinstall from scratch |
| `npm run backend` | Start the backend server |
| `npm run backend:dev` | Start backend with file watching (development) |
| `npm run build` | Build all compiled code via Turborepo (parallel, cached) |
| `npm run frontend` | Build all compiled code sequentially (legacy fallback) |
| `npm run frontend:dev` | Start frontend dev server with HMR (port 3090, requires backend running) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes |

- Node.js: v24.16.0
- Database: MongoDB
- Backend runs on `http://localhost:3080/`; frontend dev server on `http://localhost:3090/`

---

## Testing

- Framework: **Jest**, run per-workspace.
- Run tests from their workspace directory: `cd api && npx jest <pattern>`, `cd packages/api && npx jest <pattern>`, etc.
- Frontend tests: `__tests__` directories alongside components; use `test/layout-test-utils` for rendering.
- Cover loading, success, and error states for UI/data flows.

### Philosophy

- **Real logic over mocks.** Exercise actual code paths with real dependencies. Mocking is a last resort.
- **Spies over mocks.** Assert that real functions are called with expected arguments and frequency without replacing underlying logic.
- **MongoDB**: use `mongodb-memory-server` for a real in-memory MongoDB instance. Test actual queries and schema validation, not mocked DB calls.
- **MCP**: use real `@modelcontextprotocol/sdk` exports for servers, transports, and tool definitions. Mirror real scenarios, don't stub SDK internals.
- Only mock what you cannot control: external HTTP APIs, rate-limited services, non-deterministic system calls.
- Heavy mocking is a code smell, not a testing strategy.

---

## Formatting

Fix all formatting lint errors (trailing spaces, tabs, newlines, indentation) using auto-fix when available. All TypeScript/ESLint warnings and errors **must** be resolved.
 
--- 
# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
