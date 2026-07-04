# Code Mode Handoff

Last updated: 2026-07-03

This file summarizes the custom Code mode work completed in this LibreChat-based workspace so a new chat can continue without re-reading the whole conversation.

## Project Goal

Build a Claude-like open source AI workspace on top of LibreChat with:

- Chat as the main AI conversation surface.
- Cowork as a task-focused AI cowork chat, backed by read-only planning, task brief, scope control, and Code/Codex prompt generation.
- Code for safe project-file context and AI-assisted patch review/apply.

Manual/form-first Cowork is complete for the current scope, but do not keep growing the form-heavy UI. The next Cowork direction is `Phase CW-1B - Chat-first Cowork`: Cowork should become a task-focused chat/result-first workspace. Existing planner, history, checklist, and prompt handoff structures should be retained as internal or advanced support, not the main surface. Cowork must not edit files, run commands, apply patches, or act autonomously. Auto Code and autonomous file-changing flows remain deferred.

## Current Local App

- Local URL: `http://localhost:3080`
- Main compose file: `docker-compose.local.yml`
- Main app container: `LibreChat`
- Mongo container: `chat-mongodb`
- Default model: `Qwen3.6 35B A3B Passport`
- Cheap/local test model remains available: `Qwen3 8B Local`

Sensitive provider/API config lives in local config and must not be printed or committed.

## Important Files

- `api/server/routes/workspace.js`
  - Workspace status/tree/file APIs.
  - Safe unified diff apply route.
  - Checkpoint, restore, activity, verification logic.
- `client/src/components/Workspace/CodePanel.tsx`
  - Code mode UI: Files, Changes, History.
  - File preview, selected context, patch review, apply confirmation, verification display.
- `client/src/components/Workspace/CoworkPanel.tsx`
  - Current Cowork planning workspace with Goal, Scope, Plan, Files, Risks, Verification, Next Action, prompt handoff, file-context guidance, local draft persistence, and local Cowork History. Target direction: Chat-first Cowork where these structures become internal/advanced support behind a task-focused AI cowork chat.
- `COWORK_ROADMAP.md`
  - Dedicated Cowork product roadmap. Source of truth for the Chat-first Cowork direction, sandbox boundary, hidden multi-step reasoning plan, and future Cowork-to-Code apply path.
- `client/src/components/Workspace/WorkspaceModeTabs.tsx`
  - Chat/Cowork/Code mode tabs. Sources/Notebook is no longer a main workspace tab.
- `client/src/components/Workspace/SourcesPanel.tsx`
  - Sources mode UI: NotebookLM-style workspace with references list first, compact add source, enable/disable, remove, status, secondary selected-source preview, central Source AI Chat MVP, notes cards, in-memory note delete, and in-memory note-to-source. Sources/Notes/Source AI Chat state is kept in frontend Recoil state so it survives workspace mode switching.
- `client/src/components/Chat/Header.tsx`
  - Chat header controls, including the per-chat Notebook entry button.
- `client/src/components/Chat/ChatView.tsx`
  - Chat surface and per-chat Notebook overlay host.
- `client/src/components/Messages/Content/CodeBar.tsx`
- `client/src/components/Messages/Content/FloatingCodeBar.tsx`
  - Diff block handoff into Code mode.
- `scripts/start-local-web.ps1`
- `scripts/start-local-web.cmd`
  - Local startup helpers.

## Code Mode Capabilities Completed

### Safe File Browsing

- Code mode browses project files in read-only mode.
- Secret-like and risky paths are blocked:
  - `.env`
  - token/password/credential paths
  - `.git`
  - `node_modules`
  - logs/uploads/database/binary-like files
- File preview is text-only and size-limited.
- Files can be attached to chat as file-like code context, avoiding huge pasted prompts.
- Multiple selected files can be attached together.

### Compact Code UI

- Code mode is split into:
  - `Files`
  - `Changes`
  - `History`
- The UI was compacted to reduce long always-visible panels.
- History was separated into activity and checkpoints.

### Diff Handoff From Chat

- AI diff code blocks can be sent from chat to `Code > Changes`.
- The intended path is:

```text
Chat diff block -> Review in Code -> Code > Changes -> Review apply -> Confirm apply -> Checkpoint -> History restore
```

### Patch Preview And Apply

- Users paste or route unified diffs into `Code > Changes`.
- UI previews:
  - touched files
  - additions/removals
  - hunk count
  - warnings
- Apply requires a confirmation step.
- Delete, rename, and binary patches are blocked.
- The backend creates a checkpoint before writing files.

### AI Diff Error Handling

- Diff hunk headers can be auto-fixed when AI omits or damages some metadata.
- Stale patches can be recovered/rebased against current file contents when safe.
- If a patch cannot be applied safely, the UI shows a retry prompt for asking AI to regenerate a fresh unified diff from latest file context.

### Checkpoints And Restore

- Every successful file write creates a checkpoint.
- `History` shows checkpoints.
- Users can restore checkpoints from UI.
- Checkpoint cleanup exists, with keep-latest behavior.

### Activity History

- Code mode logs activity such as:
  - apply patch
  - restore checkpoint
  - delete checkpoint
  - cleanup checkpoints
- Activity includes verification status when present.
- Runtime activity log is local and ignored by git: `.workspace-activity.jsonl`.

### Post-Apply Verification

Post-apply verification now supports profiles:

- `Fast`
  - file exists
  - text/binary check
  - conflict marker check
  - JSON parse check
  - JS/CJS/MJS syntax check
  - `git diff --check`
- `Normal`
  - Fast checks
  - TypeScript syntax check for `.ts/.tsx` when TypeScript is available in runtime
- `Strict`
  - Normal checks
  - `/readyz` runtime probe

The system reports `passed`, `failed`, or `skipped`. It should not fake a pass when a runtime dependency is unavailable.

Verification UI polish completed:

- Verification profile options are collapsed by default in `Code > Changes`.
- Post-apply verification results show a compact summary first.
- Failed verification opens details automatically.
- Passed verification stays compact, with a `Details` toggle for full checks.

Diff prompt polish completed:

- The retry prompt now starts with stricter English rules so models are more likely to produce valid unified diffs.
- The prompt tells the model to return only a unified diff, use the latest attached file as source of truth, include `diff --git`, `---`, `+++`, and valid `@@` hunks, keep hunks small with context, and avoid blocked paths.

## Model And Provider Work Completed

- Added OpenAI-compatible provider setup for AI Passport/Qwen3.6 35B A3B Passport.
- Set Qwen3.6 35B A3B Passport as the default model instead of Qwen3 8B Local.
- Kept local Qwen 3 8B as a low-cost smoke-test option.
- Added a Thai-writing guard for Qwen3.6 35B A3B Passport to reduce Thai vowel/letter ordering mistakes.

## Startup Work Completed

- Added/used local startup helpers so the web app can be started after boot.
- The site may take time to become available after Windows starts because Docker/container startup is not instant.
- Readiness endpoint: `http://localhost:3080/readyz`

## Git / Backup State

Important recent commits:

- `e9ffc5ac1 Add structured cowork code handoff`
- `2ec982f77 Add workspace verification profiles`
- `55886a421 Add workspace post-apply verification`
- `01080ad24 Fix code history panel scrolling`
- `292693999 Compact code workspace panel`
- `e7a942842 Recover stale workspace patches`
- `8f12bac0a Tolerate malformed AI patch hunks`
- `40af92d70 Auto-fix workspace patch hunk headers`
- `3f6a3700e Add workspace diff retry prompt`
- `0582ed8a6 Add workspace activity history`
- `22dbe07c2 Add workspace checkpoint restore`
- `608b6791c Add safe workspace patch apply`

GitHub/remote backup is still recommended later.

## Cleaned Up

- Removed scratch patch test files:
  - `CODE_APPLY_TEST_USER.md`
  - `CODE_APPLY_TEST_USER_2.md`
- Added `.workspace-activity.jsonl` to `.gitignore` because it is local runtime activity data.

## Current Code Mode Status

Code mode is functionally usable and close to done.

Remaining optional polish:

- Add clearer History detail view for each verification result.
- Add stronger automated UI smoke tests for Code mode.

## Next Planned Area

Current chat scope:

- Notebook/Sources core is now implemented as a per-chat Notebook overlay, not a future Phase 2.5 target.
- Source creation, source list/preview, enable/disable, single source delete, notes, note edit/delete, note-to-source conversion, Source AI Chat, Smart Context Selection Lite, Evidence Trace, `/source`, auto Notebook grounding, and browser `localStorage` persistence are present.
- Current safety cleanup: `Clear Notebook` is no longer prominent in the visible overlay/header. It lives in the collapsed `Advanced / Danger zone` inside Notebook and requires typing `CLEAR`.
- Notebook data remains scoped by current conversation id with `Constants.NEW_CONVO` migration into the real conversation id after first send.
- Persistence remains browser localStorage only. There is no backend DB/API persistence, vector DB/RAG, embeddings, semantic search, clickable citations in normal Chat, Studio, Auto, Workspace Room, Skill loader, full Skill system, or Slash Command Palette.
- `/source` remains the deterministic fallback for guaranteed source grounding; auto Notebook grounding remains lightweight heuristic keyword/chunk matching.
- Manual/form-first Cowork planner work is complete for the current scope. `Ask Cowork AI`, the planner endpoint, plan preview, `Accept Plan`, `Copy Codex Prompt`, local Cowork Plan History, `New Plan` / `Reset Draft` archive-before-clear behavior, and progressive-disclosure UI cleanup are present.
- CW-1B is no longer just "make `CoworkPanel` chat-like." The target is a separate Cowork Chat mode: Cowork rooms/projects/task history on the left, and a dedicated right-side `CoworkChatView` that is separate from normal `ChatView`.
- Current CW-1B.1 started an interim sidebar-only task prompt/result-first shell. It may be reused conceptually, but it is insufficient as the final architecture because it does not create a separate right-side Cowork chat surface and normal Chat still owns the conversation/messages on the right.
- CW-1B.4 started the separate Cowork mode shell. Active Cowork mode now renders a right-side `CoworkChatView` placeholder instead of normal `ChatView`, with a left-side Cowork rooms placeholder. This is shell only: no AI calls, no Cowork room persistence, no backend changes, no planner endpoint changes, and no file/tool actions.
- CW-1B.5 adds frontend-only Cowork rooms and local-only user messages in browser `localStorage` under `librechat.cowork.rooms.v1` and `librechat.cowork.activeRoomId.v1`. `CoworkChatView` now visually follows the normal Chat layout with a top header, scrollable message area, and bottom composer, but it does not import normal Chat submission, write normal conversations, call AI, call the planner endpoint, touch backend APIs, edit files, or run tools.
- CW-1B.5.7 adds frontend-only Cowork projects and a Chat-like Cowork sidebar organization. Cowork projects persist in `librechat.cowork.projects.v1`, expanded project ids persist in `librechat.cowork.expandedProjectIds.v1`, existing Cowork rooms migrate safely with `projectId: null`, project rooms appear under their project, standalone Cowork chats stay in the Chats section with Today / Yesterday / Previous 7 days / Older grouping, and selecting any Cowork room still drives the dedicated `CoworkChatView`.
- CW-1B.5.8 adds frontend-only Cowork row menus and a local Cowork projects overview. Cowork chat menus support local share-copy, pin/unpin, rename, duplicate, change project, archive, and delete. Cowork project menus support Open project, rename, and delete. Open project switches the dedicated `CoworkChatView` surface to a Cowork-only projects overview using `librechat.cowork.projectsView.v1` and `librechat.cowork.openProjectId.v1`; it does not navigate to or mutate normal Chat projects.
- CW-1B.5.9 starts Cowork logic parity cleanup. `coworkRooms.ts` now treats local Cowork rooms/projects/expanded ids/active room/projects overview state as one normalized frontend snapshot, persists that snapshot together, and emits one Cowork storage event per action. This fixes projects-overview state sync so it is tracked by React state instead of ad hoc `localStorage` reads during render.
- CW-1B.5.10 makes Cowork row action UX more closely match normal Chat without editing normal Chat. Cowork chat/project row menus no longer use browser prompt/confirm for runtime actions: rename is inline, delete uses an in-app confirmation dialog, and change-project uses an in-app project selector dialog. These remain frontend-only Cowork localStorage actions.
- CW-1B.5.11 localizes the new Cowork rooms sidebar, Cowork chat shell, and Cowork projects overview labels. This keeps the Cowork surfaces aligned with frontend localization rules while normal Chat components remain untouched.
- CW-1B.5.12 adds a one-time legacy planner current-draft migration. If old `librechat.coworkDraft.v2` contains meaningful content, it is archived into `librechat.coworkPlanHistory.v1` before clearing the stale current draft. Existing Cowork History is not deleted, and Cowork Chat still uses only its separate local room/project/message storage.
- CW-1B.7 Step 2 connects `CoworkChatView` to the existing `POST /api/workspace/cowork/planner` endpoint from the frontend. Cowork reads selected model routing metadata from normal Chat conversation state as read-only data, does not reuse the normal Chat submit pipeline, and saves planner results only as Cowork localStorage assistant messages. There is still no backend Cowork persistence, normal Chat write, file action, tool action, terminal action, or Send to Code behavior.
- CW-1B.7 Step 3 adds an explicit `/plan <task>` gate for the Cowork planner. Normal Cowork messages now save as local Cowork user messages only and do not call the planner or show plan preview cards. `/plan <task>` still invokes the existing planner endpoint with selected model metadata, and empty `/plan` shows a local Cowork help/error message. No backend, normal Chat, file/tool/terminal, or persistence behavior changed.
- CW-1B.8 restores normal Cowork AI chat as a deliberate Cowork-only flow. Normal Cowork messages call `POST /api/workspace/cowork/chat`, save assistant replies only in Cowork localStorage, and still do not create normal Chat conversations or reuse the normal Chat submit pipeline. `/plan <task>` remains the explicit path for structured planner output.
- CW-1B.9 tightens planner quality through the backend planner prompt contract. `/plan` output must produce sharper current understanding, scoped inclusions/exclusions, concrete small steps, task-specific risks, verification checks, one next action, and a ready-to-use Codex/Code handoff prompt while keeping strict JSON output and read-only safety.
- CW-1B.10 adds a backend quality gate after planner JSON parsing. Planner responses now get one model retry when they lack actionable target detail, concrete failure modes, concrete verification expectations, or a Code-ready handoff prompt. The gate favors semantic usefulness over length, so concise high-quality answers can pass.
- CW-1B.10.1 hardens `/plan` against non-JSON model output. If the first planner response is not parseable JSON, the backend runs one JSON-only repair pass against the same schema before applying the quality gate.
- CW-1B.11 adds Cowork decision-question mode. `/plan` may return either a scoped plan or one implementation-blocking decision question with concrete choices and a custom-answer path. Choice answers are saved as Cowork messages and continue the planner flow; they do not write normal Chat history, edit files, run tools, or touch Code mode.
- Cowork messages must be separate from normal Chat conversations and must not pollute normal Chat history. Avoid reusing the normal conversation model in the early phase unless filtering and routing are explicitly designed.
- Use frontend-only Cowork rooms/messages in `localStorage` first for the MVP. Later, move to a backend Cowork rooms/messages API when the UI contract is stable.
- Existing Goal, Plan, Details, Prompt Handoff, Ready checklist, planner preview, and History logic should be reused as internal or Advanced support inside Cowork Chat, not kept as the main user surface. Do not continue growing form-heavy Cowork UI.
- CW-1B must include cleanup/migration for stale old current-plan state: archive a meaningful current plan into History before clearing stale current state, clear/migrate old planner preview, accepted state, stale Codex prompt, Prompt Handoff state, and obsolete expanded/collapsed UI state. Do not delete Cowork History automatically.
- `COWORK_ROADMAP.md` is the dedicated source of truth for CW-1B Separate Cowork Chat Mode, CW-1C Hidden Multi-step Reasoning, CW-2 File-aware Cowork, CW-3 Cowork Sandbox, CW-4 Sandbox Diff Preview, CW-5 Apply through Code mode, future restricted terminal/tool adapters, and the Adaptive Cowork Output Modes backlog.
- Do not start autonomous Cowork, Code Auto, Studio outputs, crawler/OCR, Google Drive sync, or a heavy vector database/RAG pipeline.

Do not start this yet unless requested:

- Autonomous Cowork or Auto Code.
- Studio outputs such as Audio overview, Slides, Video, Mind map, Report, Flashcards, Quiz, Infographic, or Table.
- Broad autonomous agent behavior.

Manual Cowork is complete for the current scope. Cowork is pivoting from a form-first planner into a separate chat mode for work/action tasks. Code mode remains the only path for real project-file context, patch review, apply, checkpoints, restore, and verification.

## Cowork Mode Plan

Cowork is the task-focused work/action mode between Chat and Code. The reference behavior is Claude-style project work: the user starts in a dedicated Cowork room, Cowork AI helps understand the task, asks clarifying questions when needed, turns it into a scoped task brief, and prepares a Code/Codex handoff prompt. Code remains the only path that can inspect real project-file content, review patches, apply changes, create checkpoints, restore files, and run verification.

### Latest Role Split

- `Chat`: knowledge/information mode. It owns normal conversation, Notebook/Sources, reading and organizing information, source Q&A, notes, and references. It is not the place for direct machine, file, or tool action.
- `Cowork`: work/action mode. It owns task-focused AI cowork chat, separate Cowork rooms/projects, work planning, requirement expansion, handoff generation, future hidden multi-step reasoning, future verifier/review passes, future selected-file analysis, future sandboxed workflows, and future restricted terminal/tool adapters. It must operate through safety boundaries, previews, approvals, sandbox/tool adapters, and must not directly mutate the real repo or user machine.
- `Code`: safe file apply mode. It owns real repo file context, diff review, patch apply, checkpoint, rollback, and verification.

### Goal

Cowork target role:

- Task-focused AI cowork chat.
- Separate Cowork rooms/projects/task history.
- Read-only AI planner.
- Task brief builder.
- Scope controller.
- Codex/Code prompt builder.

Cowork AI should help with:

- Understanding the user task.
- Asking clarification questions when requirements are missing.
- Identifying missing requirements and scope boundaries.
- Splitting large tasks into small phases.
- Proposing likely files to inspect, without reading hidden file contents by itself.
- Identifying risks, side effects, and verification needs.
- Writing a structured plan.
- Generating a Code/Codex handoff prompt.
- Producing a manual test checklist.
- Warning when the scope is too broad.

Cowork must not become a second code editor, an unrestricted terminal, or a hidden autonomous agent.

Do not continue growing the current form-heavy Cowork UI. Future UI should be a separate Cowork Chat surface, with rooms/projects on the left and `CoworkChatView` on the right. Goal, Plan, Details, Prompt Handoff, Ready checklist, planner preview, and history should become internal/advanced support rather than the main surface.

### Non-Goals For Cowork AI

- Do not add direct terminal execution from Cowork.
- Do not let Cowork write, delete, rename, upload, or move files directly.
- Do not let Cowork apply patches, create checkpoints, restore files, or run verification.
- Do not let Cowork control external tools without explicit tool adapter boundaries, permissions, previews, and approvals.
- Do not send normal Chat history into Cowork context by default.
- Do not send Cowork History into AI context by default unless intentionally designed later.
- Do not let Cowork auto-fix code or promise that it changed files.
- Do not build real-time multiplayer collaboration yet.
- Do not start NotebookLM-style source/RAG workflows yet.
- Do not add broad agent autonomy. Human confirmation remains required before moving to Code.

### Cowork File Safety Boundary

Cowork must never directly edit the real project files or the user's machine. If Cowork gains file editing capability later, it must happen only inside a controlled sandbox.

Future Cowork file workflow:

1. User works in Cowork Chat.
2. Cowork asks for or suggests specific files.
3. User explicitly attaches/adds files into Cowork Sandbox.
4. Cowork can read and propose edits only for files inside the sandbox.
5. Cowork cannot access files outside the sandbox.
6. Cowork cannot write to the real repo directly.
7. Cowork cannot delete, rename, or move real files.
8. Cowork cannot run arbitrary terminal commands.
9. New files must be proposed in sandbox first and require user approval.
10. All sandbox changes produce a diff preview.
11. Applying to the real repo must go through Code mode only.
12. Code mode must use checkpoint, manual approval, rollback, and verify.

Future Cowork action/tool workflow:

```text
Cowork Chat -> selected context/files -> sandbox or tool adapter -> preview -> user approval -> Code/apply/export/save path as appropriate
```

### Primary User Flow

The target Cowork AI workflow should be:

```text
Chat knowledge/reference work -> Cowork task room when action is needed -> Cowork AI task brief -> user confirms scope -> Code chooses/attaches files when repo changes are needed -> AI diff request if needed -> Review in Code -> Apply with checkpoint -> Verify -> History
```

If a user starts directly in Cowork, the flow is:

```text
Cowork room request -> Cowork-only task conversation/result -> read-only AI plan draft -> likely file suggestions -> user confirms -> Code mode handles real repo file context and patch work
```

### Cowork UI Sections

Keep headings in English and supporting explanations in Thai where useful.

Required Cowork AI output structure:

- `Goal`
- `Current understanding`
- `Clarifying questions`
  - Include only when needed. Prefer one or a small focused set.
- `In scope`
- `Out of scope`
- `Likely files to inspect`
  - Suggested paths only. Actual file preview/attachment stays in Code.
- `Risks / side effects`
  - Known risks such as model diff quality, stale context, sensitive files, or build impact.
- `Small phased plan`
- `Codex/Code handoff prompt`
- `Manual test checklist`

Avoid long always-visible documentation panels. Use compact cards, disclosure sections, or tabbed subviews.

### Required Safety Rules

- Cowork can suggest actions, but Code mode owns file browsing, patch review, apply, checkpoint, restore, and verification.
- Cowork must not bypass the Code mode safety model.
- Cowork AI must not edit files, apply patches, run terminal commands, delete/rename/move files, or act as a hidden autonomous agent.
- Cowork AI must not promise that it changed files.
- Cowork should never request or display secrets, API keys, `.env`, tokens, passwords, credentials, `.git`, `node_modules`, logs, uploads, or database files.
- Before any file-changing step, Cowork must produce a human-readable plan and wait for user confirmation.
- If the task is unclear, Cowork should ask one focused question instead of guessing.
- If the user asks for broad or risky edits, Cowork should narrow the scope before sending anything to Code.

### AI Prompt Strategy

Cowork should help produce better planning and Code handoff prompts. The planning prompt should ask for:

- State the goal.
- Current understanding.
- Clarifying questions, if needed.
- In scope and out of scope.
- Likely files to inspect.
- Risks / side effects.
- Small phased plan.
- Codex/Code handoff prompt.
- Manual test checklist.
- A warning if the task is too broad.

The Code handoff prompt should:

- State the confirmed goal.
- List files the user should inspect/attach in Code mode.
- Say which file changes are in scope and out of scope.
- Ask for a unified diff only after the user has moved to Code and selected file context.
- Include the strict diff rules already used in Code mode:
  - return only unified diff
  - use latest attached file content as source of truth
  - include `diff --git`, `---`, `+++`, and valid `@@` hunks
  - keep hunks small with context
  - avoid blocked paths

For Qwen3.6 35B A3B Passport, apply the Thai-writing guard only to user-facing Thai explanations. Patch syntax and code must stay exact.

Model expectation: Qwen3.6 35B can be used as the Cowork brain for task conversation, planning, file analysis when context is explicit, proposed edits, patch suggestions, and handoff prompt generation. It should not be trusted to directly mutate the real repo without sandbox and Code-mode safety gates.

### Data Model For Cowork Rooms

Avoid reusing the normal conversation model for Cowork in the early phase because it risks polluting normal Chat history. Start with frontend-only Cowork rooms/messages in `localStorage`, then move to a backend Cowork rooms/messages API when the UI contract is stable.

Cowork rooms should store:

- room title/project
- Cowork-only messages/results
- planner result
- handoff prompt
- advanced draft/details
- history snapshots if useful

A simple frontend-only Cowork draft can still back the read-only planner output inside each room. Suggested shape:

```ts
type CoworkDraft = {
  goal: string;
  scope: string[];
  exclusions: string[];
  steps: Array<{
    id: string;
    title: string;
    status: "todo" | "doing" | "done" | "blocked";
  }>;
  suggestedFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
};
```

Room persistence should stay local-only for the first MVP. Do not send normal Chat history or Cowork History into AI context by default.

### Integration With Existing Code Mode

Reuse what already works:

- File context should still be created in `Code > Files`.
- AI-produced diffs should still enter through `Review in Code`.
- Patch apply should still go through `Code > Changes`.
- Checkpoints, restore, and verification should stay in `Code > History`.

Cowork should point to these workflows instead of duplicating them.

### Next Implementation Slice

`CW-1B - Separate Cowork Chat Mode`

Scope:

- Replace the sidebar-only Cowork planner direction with a separate Cowork Chat mode.
- Desired architecture: Cowork rooms/projects/task history on the left, dedicated `CoworkChatView` on the right.
- Cowork messages must be separate from normal Chat conversations and must not pollute normal Chat history.
- Current CW-1B.1 sidebar task prompt/result-first shell is interim and insufficient as the final target.
- Keep Goal, Plan, Details, Prompt Handoff, Ready checklist, and History as internal or Advanced support inside Cowork Chat.
- Add a safe current-state cleanup/migration path so stale planner state from the old UI does not reappear after the pivot.
- Archive meaningful non-empty current plans into Cowork History before clearing stale current state.
- Keep Cowork read-only for real project files. Cowork must not directly edit repo files, run arbitrary terminal commands, apply patches, create checkpoints, restore files, or bypass Code mode.
- Future file editing requires Cowork Sandbox, sandbox diff preview, explicit user approval, and Code mode apply/checkpoint/verify/rollback.

See `COWORK_ROADMAP.md` for the detailed Cowork roadmap. Do not duplicate that full roadmap here.

### Cowork Roadmap

Phase CW-1: Read-only Cowork AI Planner

- Add read-only Cowork AI planning behavior.
- Structured output: Goal, Current understanding, Clarifying questions, In scope, Out of scope, Likely files to inspect, Risks / side effects, Small phased plan, Codex/Code handoff prompt, Manual test checklist.
- No file writes, patch apply, terminal commands, backend write routes, agents, or autonomous behavior.
- Phase CW-1A.1 added the dedicated backend endpoint `POST /api/workspace/cowork/planner` for a read-only Cowork planner. The endpoint sanitizes Cowork draft input, creates a strict planner prompt, calls the configured model through a request-only completion path, parses strict JSON, and returns planner output without normal chat history, Notebook/source context, code context, source chunks, or DB message persistence. The Cowork UI button is not implemented yet. Next phase: `Phase CW-1A.2 - Ask Cowork AI Button` with preview / accept / discard.
- Phase CW-1A.2 added the frontend `Ask Cowork AI` button in Cowork. It calls the dedicated planner endpoint with the current Cowork draft plus only current conversation model-routing metadata, then shows a preview with accept / discard controls and a copyable Codex/Code prompt. Accept fills the existing draft fields; discard leaves the draft unchanged. Cowork still does not edit files, apply patches, run terminal commands, save planner output as chat messages, or send chat history, Notebook/source context, source chunks, code context, or file contents. Next phase: `Phase CW-1A.3 - manual UX test + polish / model routing bugfix if needed`.
- Phase CW-1A.2.2 keeps the accepted planner preview visible after `Accept Plan` so `Copy Codex Prompt` remains available. Accept is disabled after the current preview is accepted, `Ask Cowork AI` resets acceptance for a new preview, and the user can still clear the preview manually. No chat history, DB persistence, file editing, patch apply, terminal execution, Notebook/source, or normal Chat behavior was added.
- Phase CW-1A.2.3 tightens Cowork planner unsafe-response detection so it rejects actual secret values only (`key=value`, long bearer/API-key-like strings, private-key headers), not safe metadata such as `.env`, `token`, `password`, `credential`, `secret`, `provider config files containing secrets`, `node_modules`, `.git`, `logs`, `uploads`, database files, or Codex prompt text that names static-check commands. `New plan` clears to an empty draft, `Reset draft` restores the safe starter draft, and both actions clear planner preview, warnings, error, accepted state, and planner copy state.
- Phase CW-1A.2.3 also adds local-only Cowork Plan History. `New plan` and `Reset draft` archive the current non-empty plan before clearing/resetting, keep only the latest 20 non-empty snapshots in browser `localStorage`, avoid duplicate adjacent snapshots, and never send history to Cowork AI. History supports Restore, Copy Codex Prompt, Delete item, and Clear All History with typed `CLEAR HISTORY` confirmation. Cowork remains read-only and Code mode remains the only patch/apply/checkpoint/verify path.
- Phase CW-1A.2.4 cleans up the Cowork UI with Claude-like progressive disclosure. The main screen prioritizes primary Cowork actions and the current plan, History opens only when needed from a compact count button, secondary actions/templates are hidden behind More/collapsible UI, and the Ready checklist is compact with optional details. This is an interim cleanup, not the final Cowork direction. No Chat, Notebook, `/source`, Source AI Chat, Code mode, backend planner logic, planner payload, or Cowork History storage behavior changed.
- Backlog: Future Phase CW-1A.4 - Adaptive Cowork Output Modes. Cowork should eventually adapt output detail by task type: small/general tasks should not require full coding sections, while larger code/design/report tasks can use full structured sections. Adaptive Mode is not implemented in this phase.
- Suggested commit after verification: `Add read-only cowork AI planner`.

Phase CW-1B: Chat-first Cowork

- Convert Cowork from a form-first planner UI into a task-focused chat/result-first surface.
- Keep existing structured planner fields, planner preview, history, prompt handoff, and ready checklist as internal or advanced details.
- The main user experience should be conversation/result-first: the user should see the task discussion, decisions, results, and next action, not a large process form.
- No direct file edits yet.
- Required cleanup/migration step: before or during CW-1B, handle stale Cowork state from the old form-first planner UI so it does not pollute the new Chat-first Cowork surface. Clear or migrate stale current-plan `localStorage` safely, including stale `plannerPreview`, accepted state, stale `codexPrompt`, old Prompt Handoff state, and obsolete expanded/collapsed UI state. If there is a meaningful non-empty current plan, archive it into Cowork History before clearing current state. Do not automatically delete Cowork History. Do not delete Chat, Notebook, Sources, or Code checkpoints. Provide a safe path for the user to start with a clean Cowork Chat screen. History remains user-controlled: restore, delete, and clear all only when the user explicitly chooses it.

Phase CW-1C: Hidden Multi-step Cowork Reasoning

- Let users write short prompts while Cowork internally expands requirements, plans, verifies, and finalizes a result-first response.
- Suggested internal pipeline: Analyzer -> Planner / Builder -> Verifier -> Finalizer, with an optional Code Handoff Optimizer for large code tasks.
- Do not expose raw hidden reasoning as the main UI. Store only useful summaries, not raw process logs.
- Use Plan Lock / Scope Lock to prevent drift, and ask the user instead of inventing major requirements when uncertainty matters.

Phase CW-2: File-aware Cowork

- Cowork can read/analyze only explicitly selected or attached files.
- No broad repo scan.
- No real file mutation.

Phase CW-3: Cowork Sandbox

- Add a controlled sandbox workspace for selected files.
- AI can propose sandbox edits only within sandbox boundaries.
- No real repo writes.

Phase CW-4: Sandbox Diff Preview

- Show diffs between sandbox edits and original selected files.
- User reviews changes before apply.

Phase CW-5: Apply through Code mode

- Approved sandbox diffs are handed to Code mode.
- Code mode handles checkpoint, apply, verify, and rollback.

Phase 2: Chat handoff polish

- Refine prompt wording for the Claude-like Chat -> Cowork -> Code workflow.
- Add clear copied/prepared states for prompt actions.
- Add reusable planning, diff request, and verification prompt templates.
- Keep handoff read-only unless an existing safe chat integration is already available.
- Suggested commit after verification: `Polish cowork prompt handoff`.

Phase 3: File context guidance

- Expand `Files` into suggested `Inspect`, `Attach`, and `Avoid` groups.
- Warn against sensitive or blocked paths such as `.env`, token/password/credential files, `.git`, `node_modules`, logs, uploads, and database files.
- Point users to `Code > Files` for actual file context attachment.
- Do not let Cowork browse or attach files directly in this phase.
- Suggested commit after verification: `Add cowork file context guidance`.

Phase 4: Plan persistence

- Decide whether first persistence should use local storage or conversation/project metadata.
- Add save, load, and reset behavior for Cowork drafts.
- Keep secrets and blocked path content out of saved plans.
- Current implementation uses browser `localStorage` for a frontend-only draft. Cowork still has no backend write route and still cannot browse, attach, or edit files directly.
- Suggested commit after verification: `Persist cowork drafts`.

Phase 5: Code workflow integration

- Add an explicit `Open Code` or equivalent handoff action.
- Prepare a handoff summary that tells the user which files to attach and what diff to request.
- Keep the file-changing path as `Review in Code -> Apply -> Checkpoint -> Verification`.
- Do not let Cowork apply patches, create checkpoints, restore files, or bypass confirmation.
- Current implementation adds a read-only `Open Code` action, a `Copy handoff summary` prompt, and a frontend-only structured handoff payload that Code can display as read-only context. It can switch tabs, copy text, store the handoff in client state, or clear the handoff; it does not attach files, apply patches, create checkpoints, verify, or call backend write routes.
- Suggested commit after verification: `Connect cowork handoff to code workflow`.

Phase 6: Advanced Cowork

- Add task history and handoff summary generation for new chats.
- Add reusable plan templates.
- Consider optional project memory or NotebookLM-style source workflows only after Cowork and Code are stable.
- Keep broad agent autonomy out of scope unless a separate safety design is approved.
- Current implementation starts the usability pass with a compact ready checklist, workflow status strip, and collapsed prompt handoff tools. Cowork remains frontend-only and read-only.
- Current implementation also simplifies the primary Cowork surface around Goal, Next Action, Plan, and readiness. Scope, Files, Risks, Verification, and prompt tools are available in collapsed details instead of filling the first view.
- Current implementation adds Manual Cowork polish: `New plan` starts a blank safe draft, `Reset draft` restores a starter plan, reusable templates cover UI polish, bug fix, refactor, test update, and docs update, the empty state explains the manual workflow, and the readiness checklist names the next missing field.

### Future Guarded Automation Roadmap

This roadmap is deferred future work, not the CW-1 target. CW-1 is read-only AI planning only. Do not start autonomous automation phases while implementing the read-only Cowork AI Planner.

Future Cowork automation, if ever approved, should mean assisted planning, context preparation, diff preparation, and guarded handoff. It must not mean silent file writes. Code mode remains the only owner of file browsing, patch review, apply, checkpoint, restore, and verification.

#### Automation Levels

Level 0: Current Manual Cowork

- Current state.
- User edits Goal, Next Action, Plan, Details, and Prompt Handoff manually.
- Cowork can copy prompts and open Code.
- No backend route, file read, file attach, patch apply, checkpoint, restore, or verification action is initiated by Cowork.

Level 1: Read-only AI Planning

- Cowork can ask the current model to draft or refine a plan from the user's request.
- Output must be structured into Goal, Current understanding, Clarifying questions, In scope, Out of scope, Likely files to inspect, Risks / side effects, Small phased plan, Code/Codex handoff prompt, and Manual test checklist.
- User must accept or edit the plan before file-changing work can continue.
- If the request is unclear, Cowork asks one focused clarification question instead of guessing.

Level 2: Read-only Context Suggestions

- Cowork can consume safe workspace metadata from Code, such as selected file paths, safe tree paths, file sizes, and current Code tab state.
- Cowork may suggest files to inspect or attach, but must not read hidden file contents or attach files by itself.
- Blocked paths remain filtered: `.env`, token/password/credential paths, `.git`, `node_modules`, logs, uploads, database files, and large/binary files.

Level 3: Structured Handoff To Code

- `Prepare for Code` creates a handoff payload with Goal, Scope, suggested files, avoided paths, verification target, and strict diff rules.
- Code can receive the payload and prefill the Changes prompt or Files guidance.
- The user still chooses file context and confirms every apply action.
- No patch is applied from Cowork.

Level 4: Diff Dry Run

- Cowork can request an AI-generated unified diff after the user confirms scope and file context.
- The result lands in `Code > Changes` as a review-only patch.
- Code validates diff format, blocked paths, changed file count, diff size, hunk safety, and stale context before any apply.
- Failed validation produces a retry prompt rather than a write.

Level 5: Confirmed Auto Apply

- Code may offer an `Apply with checkpoint` action after policy checks pass.
- User confirmation is required at action time.
- Checkpoint creation is mandatory before write.
- Verification must run after apply and record result in History.
- Cowork may report status, but Code owns the write and verification path.

Level 6: Limited Supervised Auto Mode

- Only allowed for small, low-risk tasks.
- Scope examples: one-file UI copy change, small TypeScript fix, formatting-only patch, narrow test update.
- Hard limits must apply: allowlisted paths, maximum changed files, maximum diff size, no delete/rename/binary patch, no secret-like paths, mandatory checkpoint, mandatory verification.
- If any guardrail fails, the system downgrades to manual review.

#### Auto-Safe Architecture

The recommended architecture is layered:

- `CoworkPanel`
  - Planning UI and status only.
  - Shows Goal, Next Action, Plan, readiness, and handoff state.
  - Does not call file write routes.
- `Cowork draft store`
  - Stores safe planning fields only.
  - Must sanitize secret-like text before persistence.
  - Starts as local storage; project/conversation persistence can come later.
- `Context bridge`
  - Read-only bridge from Code to Cowork.
  - Shares selected paths, safe file metadata, and Code readiness state.
  - Never exposes blocked file contents.
- `Policy engine`
  - Central guardrail checks shared by handoff, dry-run diff, and apply review.
  - Enforces blocked paths, file limits, diff limits, and workflow order.
- `Code handoff queue`
  - Holds pending handoff payloads from Cowork to Code.
  - Lets Code show exactly what Cowork requested before any file context or diff action.
- `Verification gate`
  - Requires selected verification profile before apply.
  - Stores verification result in Code History.
- `Activity history`
  - Records plan creation, handoff, diff review, apply, checkpoint, restore, and verification.
  - Useful for explaining what automation did and what it refused to do.

#### Phase A: Finish Manual Cowork UX

Goal:

- Make Cowork understandable before adding automation.

Implementation:

- Add clearer empty state for a new task.
- Add `New plan` or `Reset plan` wording that is less destructive than a generic reset.
- Add reusable plan templates such as UI polish, bug fix, refactor, test update, documentation, and provider/model config.
- Keep `Details` and `Prompt Handoff` collapsed by default.
- Keep primary view focused on Goal, Next Action, Plan, and readiness.
- Current implementation keeps this phase manual-only: templates fill safe planning fields, real file paths still come from the user, `Prepare for Code` stores a client-side read-only handoff and copies the handoff prompt, and `Open Code` only switches to Code mode.
- Manual workflow smoke test completed: Cowork can plan a docs update, hand it to Code, and Code can review/apply the resulting diff with checkpoint and verification.

Acceptance:

- A user can understand what Cowork does without reading the handoff document.
- No new backend write routes.
- No file content reads from Cowork.
- Build passes and `/readyz` returns `OK`.

Suggested commit:

- `Polish cowork manual workflow`

#### Phase B: Read-only Code Context Bridge

Goal:

- Let Cowork know enough about Code state to suggest next steps without owning file access.

Implementation:

- Expose safe Code state to Cowork:
  - selected safe file paths
  - current Code tab
  - whether there is a pending diff
  - latest verification status summary
  - safe workspace metadata such as path, size, and text/binary flag
- Keep path filtering centralized with Code safety rules.
- Show Cowork hints like `Attach these files in Code > Files` or `Review pending diff in Code > Changes`.

Acceptance:

- Cowork can display file suggestions from safe metadata.
- Cowork cannot open arbitrary files or read blocked content.
- Secret-like and blocked paths do not appear in Cowork suggestions.
- Code still owns actual file preview and attachment.

Suggested commit:

- `Add cowork read-only code context bridge`

#### Phase C: Assisted Plan Generation

Goal:

- Let AI help draft a plan, while the user remains in control.

Implementation:

- Add `Draft plan` or `Refine plan` action that sends a structured planning prompt to Chat/model.
- Require structured output:
  - Goal
  - Scope
  - Plan
  - Files
  - Risks
  - Verification
  - Next Action
- Validate generated draft before filling Cowork fields:
  - no secrets
  - no blocked paths
  - no broad write instructions
  - one focused clarification question if needed
- Add user review step before accepting generated plan into the draft.

Acceptance:

- AI can populate a plan draft without file writes.
- User can accept, edit, or discard the generated plan.
- Blocked paths and secret-like text are removed or rejected.
- Unclear tasks produce a question instead of fake certainty.

Suggested commit:

- `Add cowork assisted planning`

#### Phase D: Structured Plan-To-Code Handoff

Goal:

- Turn the Cowork plan into a typed handoff that Code can understand.

Implementation:

- Define a handoff payload:
  - handoff id
  - source conversation id when available
  - goal
  - scope
  - exclusions
  - suggested files
  - inspect files
  - avoid paths
  - verification target
  - next action
  - timestamp
- Add `Prepare for Code` behavior:
  - stores the handoff payload
  - lets the user open Code
  - shows the handoff in Code as read-only context
- Current implementation starts this phase with a frontend-only Recoil handoff. Code shows Goal, Scope, Files, Verification, and Next Action, with manual buttons to open Files, open Changes, copy the handoff, or clear it. It does not attach suggested files automatically or prefill a patch.
- Code may offer actions such as:
  - attach suggested files
  - open Files tab
  - prepare diff prompt
  - review pending diff

Acceptance:

- Handoff moves structured data, not only copied text.
- User sees the handoff before taking Code actions.
- Cowork still cannot attach files or apply patches.
- Handoff can be cleared or replaced.

Suggested commit:

- `Add structured cowork code handoff`

#### Phase E: Diff Dry Run

Goal:

- Let AI generate a diff, but keep it review-only until Code approves it.

Implementation:

- Add dry-run flow:
  - Cowork plan confirmed
  - Code files attached by user
  - AI generates unified diff
  - diff lands in `Code > Changes`
  - Code validates and previews it
- Add policy checks before review:
  - valid unified diff
  - no delete/rename/binary patch
  - no blocked paths
  - changed file count within limit
  - diff size within limit
  - hunks have enough context
  - stale context warning if applicable
- Failed policy produces a retry prompt.

Acceptance:

- AI-generated patch never applies directly.
- Invalid or risky patches stay in review/error state.
- User can inspect touched files, additions/removals, warnings, and validation status.

Suggested commit:

- `Add cowork diff dry run`

#### Phase F: Guardrail Policy Engine

Goal:

- Centralize safety rules so Cowork, Code, and future automation use the same policy.

Implementation:

- Extract or formalize policy checks:
  - blocked path patterns
  - allowlisted write roots
  - max changed files
  - max diff size
  - max hunk count
  - no binary/delete/rename patches
  - no secret-like content in drafts or prompts
  - mandatory checkpoint before writes
  - mandatory verification after writes
- Return structured policy results:
  - `passed`
  - `warning`
  - `blocked`
  - machine-readable reasons
  - user-facing explanation
- Show policy results in Code review and Cowork status.

Acceptance:

- Every automated step can explain why it is allowed or blocked.
- Policy results are visible before apply.
- No duplicated safety logic between Cowork and Code where shared policy is practical.

Suggested commit:

- `Add workspace automation policy checks`

#### Phase G: Confirmed Auto Apply

Goal:

- Allow one-click supervised apply only after review and policy pass.

Implementation:

- Add an explicit confirmation modal in Code:
  - files changed
  - additions/removals
  - policy result
  - checkpoint plan
  - verification profile
- Require user confirmation.
- Create checkpoint before write.
- Apply patch through existing safe route.
- Run selected verification.
- Record result in History.
- Report result back to Cowork as status.

Acceptance:

- No apply happens without user confirmation.
- Failed checkpoint blocks apply.
- Failed verification is shown as failure, not success.
- User can restore from checkpoint.

Suggested commit:

- `Add confirmed workspace auto apply`

#### Phase H: Limited Supervised Auto Mode

Goal:

- Make simple tasks feel automatic while preserving review, checkpoint, and verification.

Implementation:

- Add opt-in mode such as `Auto assist`.
- Limit supported task classes:
  - single-file UI text polish
  - small style-only component changes
  - narrow bug fix with attached context
  - test-only update
  - documentation-only update
- Enforce hard caps:
  - allowlisted files only
  - max 1-3 changed files
  - max diff size
  - no backend route changes unless explicitly confirmed
  - no config/secret/provider credential files
  - no deletes/renames
- If the task exceeds limits, downgrade to normal Code review.

Acceptance:

- Auto assist can complete a small task end-to-end with explicit user confirmation before apply.
- Larger or risky tasks are refused or downgraded.
- History explains each automated step and guardrail decision.

Suggested commit:

- `Add limited cowork auto assist`

#### Phase I: Recovery, Audit, And Trust

Goal:

- Make automation understandable and reversible.

Implementation:

- Add an automation timeline:
  - plan created
  - context selected
  - diff requested
  - policy checked
  - checkpoint created
  - patch applied
  - verification result
  - restore action if needed
- Add `Why blocked?` details for refused automation.
- Add `Retry with narrower scope` prompt generation.
- Add restore-first recovery guidance after failed verification.

Acceptance:

- User can tell what automation did and what it did not do.
- User can restore after a bad apply.
- Automation failures produce actionable next steps.

Suggested commit:

- `Add cowork automation audit trail`

#### Minimum Bar Before Auto Write

Do not implement confirmed auto apply until all of these are true:

- Code patch apply route is stable.
- Checkpoint restore is stable.
- Verification profiles are stable.
- Cowork-to-Code handoff is structured, visible, and clearable.
- Policy engine blocks risky paths and risky patch types.
- Browser smoke tests cover Cowork handoff and Code apply review.
- User confirmation is required at apply time.
- Failed verification is recorded and visible.
- Restore path is tested after an applied patch.

#### First Auto Candidate

The first real auto candidate should be deliberately small:

```text
User request -> Cowork drafts plan -> user accepts -> Code attaches one safe file -> AI returns a one-file diff -> Code validates -> user confirms apply -> checkpoint -> Fast verification -> History result
```

Good first task class:

- one `.tsx` UI copy/layout change
- no backend changes
- no config files
- one or two hunks
- Fast verification only

Bad first task class:

- provider config
- auth
- secret handling
- database migration
- multi-file refactor
- dependency upgrades
- Docker/startup changes
- anything that needs direct terminal execution from Cowork

### Acceptance Criteria

Phase CW-1 is acceptable when:

- The tab is useful without reading long instructions.
- The user can turn a rough request into a structured task brief.
- Cowork AI can think, plan, ask focused clarification questions, identify scope, suggest likely files to inspect, identify risks, create a phased plan, and prepare a Code/Codex handoff prompt.
- Cowork can produce a manual test checklist.
- Cowork does not write files directly.
- Cowork does not run terminal commands, apply patches, create checkpoints, restore files, or promise that it changed files.
- Code mode still owns diff review/apply/checkpoint/verification.
- The app builds and `/readyz` returns `OK`.

### Later Cowork Enhancements

After CW-1:

- Save Cowork plans per conversation/project.
- Add task status history.
- Add a handoff summary generator for new chats.
- Add a better file suggestion flow using the workspace tree.
- Integrate with Sources only after the Sources core is stable.

## NotebookLM / Sources Plan

This is the next product area after the current Chat/Cowork/Code foundation. The goal is a NotebookLM-style source system for this project, not Studio generation yet.

### Goal

Build a `Sources` or `Notebook` mode that lets the user collect trusted materials, ask questions grounded in those materials, save useful notes, and reuse source context in Chat/Cowork without pasting huge text blocks.

The first version should be useful for reading and reasoning over user-provided documents. It should not try to become a full autonomous research agent.

### What The User Wants

- A NotebookLM-like core experience inside this Claude-like workspace.
- Multiple notebooks or source collections.
- Source upload/paste/import.
- Source list and source preview.
- Chat answers grounded in selected sources.
- Simple citations or source labels.
- Notes saved from useful answers.
- Notebook guide/overview with summary, key topics, and suggested questions.
- Ability to reuse source context in Chat and later Cowork.
- No noisy long context pasted into the chat body.

### Explicitly Not In Scope Yet

Do not build Studio outputs yet. The user specifically said the Studio area from the screenshot is not needed now.

Defer these:

- Audio overview
- Slides
- Video overview
- Mind map
- Report generation
- Flashcards
- Quiz/test generation
- Infographic
- Data table generation
- Full web crawler
- Google Drive sync
- OCR/scanned PDF handling
- Heavy vector database/RAG pipeline if a simpler MVP works first
- Autonomous agent behavior

### Recommended App Placement

Sources/Notebook now opens from the current Chat instead of a top-level workspace tab:

```text
Chat header -> Notebook
```

The main workspace tabs stay focused on:

```text
Chat | Cowork | Code
```

`Notebook` is the chat-scoped entry label. The implementation still avoids implying this is Google's product.

### Core UI Layout

Use a three-region layout on desktop:

```text
| Sources List | Source Chat / Guide / Notes | Source Preview |
```

Responsive behavior:

- Desktop: source list left, main work area center, preview drawer right.
- Narrow screens: source list and preview become collapsible drawers.
- Keep the UI dense and work-focused, similar to the existing Code/Cowork workspace style.

### UI Sections

Recommended first-pass sections:

- `Notebooks`
  - Select or create a notebook/source collection.
  - First implementation can start with one default notebook if persistence is not ready.
- `Sources`
  - List sources in the current notebook.
  - Show title, type, size, added date, and enabled/disabled state.
  - Add source from paste text, `.txt`, `.md`, and later text-based PDF.
- `Preview`
  - Read-only source preview.
  - Search within source.
  - Show metadata and simple section/chunk boundaries.
- `Ask`
  - Ask questions about selected/enabled sources.
  - Answers should say when the answer is not found in sources.
- `Citations`
  - MVP can show simple labels such as `[Source: filename.md]`.
  - Later version can link to exact chunks/highlights.
- `Notes`
  - Save useful answer snippets or user notes.
  - Notes can become source context later.
- `Guide`
  - Notebook overview.
  - Summary of selected sources.
  - Key topics.
  - Suggested questions.
  - Known gaps or unanswered areas.

### Source Types For MVP

Start simple:

- Paste text.
- `.txt`
- `.md`
- Small text-like files with safe size limits.

Next source types:

- Text-based PDF extraction.
- URL import for manually supplied pages.
- `.docx` if a reliable parser is available.

Avoid OCR and broad web crawling until the source model is stable.

### Safety Rules

- Sources mode reads only sources the user explicitly adds.
- It must not scan the whole computer.
- It must not read Code workspace files unless the user explicitly sends/attaches them.
- Block or warn on secret-like files: `.env`, token, password, credential, `.git`, database files, logs, uploads.
- No write/delete/rename actions outside the Sources database/storage.
- No direct terminal execution.
- If sources are used in Code/Cowork, they are context only; actual file edits still go through Code mode.

### Grounding Rules

The answer behavior should be stricter than normal Chat:

- Prefer answering from selected sources.
- If the answer is not in selected sources, say so clearly.
- Do not invent citations.
- Mention which source(s) support the answer.
- If sources disagree, call out the disagreement.
- If the user asks outside the sources, answer only if allowed by the current mode and label it as outside-source knowledge.

### Data Model Sketch

First pass can be simple and local-app friendly:

```ts
type Notebook = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type Source = {
  id: string;
  notebookId: string;
  title: string;
  type: "text" | "markdown" | "pdf" | "url";
  content: string;
  sizeBytes: number;
  enabled: boolean;
  createdAt: string;
};

type SourceNote = {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  sourceIds: string[];
  createdAt: string;
};
```

Chunking/citations can start as simple paragraph or heading chunks. A vector index can be added later if source sizes outgrow direct context windows.

### Integration With Existing Workspace

- `Sources -> Chat`: attach selected source snippets as file-like context, similar to Code mode code context.
- `Sources -> Cowork`: provide project/reference context for planning.
- `Sources -> Code`: context only; no file writes.
- `Chat`: can ask source-grounded questions when source context is attached.
- `Cowork`: can ask for source-backed planning and cite source labels.

Do not duplicate Code mode patch/apply logic in Sources.

### First Implementation Slice

Recommended first coding slice:

1. Add a `Sources` tab to the workspace mode tabs.
2. Create a `SourcesPanel` with source list, add-source form, preview, and simple note area.
3. Store sources in frontend state first or a small backend route if persistence is needed immediately.
4. Support paste text and markdown/text files.
5. Add enable/disable source toggles.
6. Add `Attach selected sources to Chat`.
7. Add a source-grounded prompt template:
   - answer using selected sources
   - cite source labels
   - say when not found
8. Add `Guide` generation prompt:
   - summarize selected sources
   - key topics
   - suggested questions
   - gaps
9. Keep Studio outputs hidden/deferred.

Current implementation:

- Phase 1 added the `Sources` tab and skeleton layout.
- Phase 2 adds frontend-only sources from pasted text, `.txt`, and `.md`.
- Phase 2.5 changes Sources into a full NotebookLM-style workspace on desktop: left source list/add source, center librarian/chat placeholder plus preview, right manual notes placeholder.
- Phase 2.5 keys in-memory Sources and Notes state by the current chat/conversation id. There is still no backend route or persistence yet.
- Phase 2.5C corrects the information hierarchy: the center column is Source AI Chat with a disabled bottom input, the left column is References with compact add-source disclosure, the right column is Notes cards/list with Add note, and selected-source preview is secondary in the left column.
- Phase 2.5D adds manual note deletion and `Add to sources` for notes. Converted note sources are frontend-only, labeled `From note`, use the same safety/size/status rules as pasted sources, and appear in the left References list for the current chat.
- Phase 2.5D.1 stores Sources, selected source id, Notes, and note draft in Recoil atom families keyed by conversation id. This is still in-memory only and does not persist through page refresh or server restart.
- Phase 2.6 removes Sources from the main Chat/Cowork/Code workspace tabs. Chat now has a `Notebook` button in the header that opens the full NotebookLM-style `SourcesPanel` as a per-chat overlay with `Back to Chat`.
- Phase 3A adds source chunk metadata for pasted text, `.txt`, `.md`, and note-created sources. Markdown chunks split by headings when available, otherwise by paragraph; tables are kept whole when visible as table blocks; long text paragraphs split by byte size. Selected source detail shows chunk count, rough token estimate, warning for large sources, and a compact chunk preview. Source AI Chat still uses the direct context path and existing context cap.
- Phase 3B changes Source AI Chat context assembly from full-source-first direct context to Smart Context Selection Lite. The frontend scores chunks with simple normalized keyword, substring, heading, and source-title matches, then includes the best chunks within the existing 24 KB cap. If no chunk matches, it falls back to first chunks and surfaces that fallback in the chat message metadata. This remains non-persistent and has no embeddings, vector DB/RAG, semantic search, clickable citations, or normal Chat integration.
- Phase 3C adds frontend-only Evidence Trace. Source AI Chat messages store evidence entries for the selected chunks actually sent to the model, including source id/title, chunk id/index/heading/kind, token estimate, score, snippet, and fallback status. The chat UI shows a compact Evidence block below source-backed answers and marks fallback context when used. Citations are still simple source/section labels, not clickable citations.
- Phase 4B lets normal Chat use Notebook sources in a lite, opt-in way. `Use Notebook` is stored in per-conversation frontend state, normal Chat reads only enabled ready sources for the current conversation, and the selected chunks are sent as request-only hidden `notebookContext` merged into the model-facing prompt. This does not add database/localStorage persistence, clickable citations in normal Chat, vector DB/RAG, embeddings, semantic search, Studio, Auto, or provider/model routing changes.
- Phase 4B.1 audits and hardens Notebook context safety after the normal Chat integration. Checked toggle-off payload behavior, per-conversation Recoil isolation, `Constants.NEW_CONVO` fallback migration/reset, enabled+ready source filtering, the existing 24 KB selected source-context cap, backend request-only prompt merge in `BaseClient`, and Source AI Chat Evidence Trace path. The only code change was to redact `codeContext` file contents and `notebookContext.content` from the client `message_stream` debug log while keeping small metadata for debugging. `notebookContext` remains request-only and is not stored on saved messages/history. Checks run: `git status --short`, Prettier on `client/src/hooks/Chat/useChatFunctions.ts` and `CODE_MODE_HANDOFF.md`, `git diff --check -- client/src/hooks/Chat/useChatFunctions.ts CODE_MODE_HANDOFF.md`. Browser/auth/session tests were intentionally not run; the user owns manual web testing.
- Phase 4B.2 adds a request-only no-enabled-sources guard for normal Chat Notebook mode. When `Use Notebook` is on but there are no enabled ready sources, the client sends a safe `notebookContext` with `status: "no_enabled_sources"` and a short guard instruction only; it sends no source content and no disabled/blocked/too-large/unsupported/parse-error source text. `BaseClient` still merges this only into the model-facing prompt, not stored messages/history. This reduces false answers from old notebook-derived chat history while preserving normal Chat when the toggle is off. There is still no persistence, vector DB/RAG, embeddings, semantic search, clickable citations in normal Chat, Studio, Auto, or Skill system.
- Phase 4B.3 adds Hybrid Notebook memory for normal Chat and Notebook-only slash commands. The composer `Use Notebook` control is hidden; Ready/Disabled inside Notebook References is now the main source control. Normal Chat now auto-considers enabled ready Notebook sources for the current conversation and attaches selected context only when keyword scoring finds relevant chunks, without fallback first chunks for unrelated general chat. `/source`, `/ซอส`, `/เธ‹เธญเธช`, and `/notebook` force Notebook mode, strip the command from the visible user question, and use only enabled ready Notebook sources with force-mode prompt rules. If a force command is used with no enabled ready sources, the client returns a deterministic no-source assistant message and skips the model call. This remains request-only and still has no persistence, vector DB/RAG, embeddings, semantic search, clickable citations in normal Chat, Studio, Auto, Workspace Room, or full Skill system.
- Phase 4B.4 diagnoses and fixes performance/hang after Phase 4B.3.
  - Root cause 1: Duplicated Notebook instructions. The frontend `buildNotebookContext` embedded ~8 instruction lines in the `notebookContext.content` field, and the backend `formatNotebookContextAsMarkdown` wrapped the same content with ~7 more instruction lines. For a tiny 120-byte source, this produced ~15 lines of redundant instruction overhead in the model-facing user message. Fix: removed instruction lines from the frontend `buildNotebookContext` content; it now sends only metadata (source count, chunk count, selection mode) and the raw source blocks. The backend already handles all instruction formatting and mode-specific rules (auto vs force).
  - Root cause 2: Orphaned `NotebookSourcesToggle` component. After Phase 4B.3 hid the `Use Notebook` toggle, the component was no longer imported or rendered anywhere, but it contained the only `useEffect` that migrated Notebook state (sources, notes, drafts, source chat messages, selected source id) from the `Constants.NEW_CONVO` fallback key to the real conversation id when the first message created a real conversation. Without this migration, sources added in Notebook before the first message became invisible to `buildNotebookContext` on all subsequent messages (the second and later messages read from the real conversation id, which was empty). Fix: added fallback source migration directly in `buildNotebookContext` using `useRecoilCallback({ snapshot, set })`; when the real convo has no sources, it checks `NEW_CONVO` and migrates atomically. Also re-rendered the component (converted to passive status indicator) in `ChatForm` to handle full state migration for notes, drafts, and source chat messages.
  - Root cause 3: Old toggle UI implied a second control. The `NotebookSourcesToggle` rendered as a clickable button with text like `Notebook sources on: 1` or `Use Notebook`. Phase 4B.3 intended Notebook to be auto-considered, so a manual toggle was confusing. Fix: converted to a passive read-only status indicator `NotebookSourcesStatus` that shows `Notebook memory: N source(s)` when enabled ready sources exist, and renders nothing otherwise. No toggle, no manual opt-in required.
  - Status of old Use Notebook UI: the `workspaceUseNotebookSourcesByConversationId` Recoil atom still exists in families.ts but is no longer read by `buildNotebookContext` or the composer UI. It can be cleaned up in a future phase. The component file is still named `NotebookSourcesToggle.tsx` for import compatibility but exports `NotebookSourcesStatus`.
  - Checks run: manual code review of all touched files, visual diff verification. Git, node, and Prettier were not available in the current shell PATH (tools run inside Docker); the user should run build/typecheck inside Docker after applying. No browser/auth/session tests were run.
  - Remaining limitations: the hang for a tiny source is primarily model latency plus the (now-reduced) prompt overhead; there is no code bug that blocks the request or prevents stream finalization. The 24 KB context cap is preserved. Source AI Chat and Evidence Trace paths are not affected. Notebook state is still in-memory only and does not persist through page refresh. There is still no persistence, vector DB/RAG, embeddings, semantic search, clickable citations in normal Chat, Studio, Auto, Workspace Room, or full Skill system.
- Phase 5A adds Notebook Persistence Lite using browser `localStorage` only. Notebook data is stored per conversation in a versioned key, `workspaceNotebook:v1:<conversationId>`, and hydrates the Recoil atom families for sources, selected source id, notes, and note draft on load. The existing `Constants.NEW_CONVO` fallback migration continues to move fallback Notebook state into the real conversation id; because the persisted state is attached to the same atom families, the real conversation key is written and the fallback key is cleared after migration. Persisted source payloads are sanitized before hydration/write; non-ready source content is kept empty and only current Notebook fields needed for the lite MVP are stored. Source AI Chat messages and drafts remain in-memory for now to keep the Phase 5A payload smaller. There is still no backend DB persistence, vector DB/RAG, embeddings, semantic search, clickable citations in normal Chat, Studio, Auto, Workspace Room, or full Skill system.
- Phase 5A.4 adds Notebook Persistence Controls. `SourcesPanel` now shows a small local-only persistence hint and a `Clear Notebook` control for the current chat. The clear action requires confirmation, resets only the current conversation's sources, selected source id, notes, and note draft, and relies on the existing `workspaceNotebook:v1:<conversationId>` empty-payload logic to remove the persisted localStorage key. It does not clear chat messages/history and does not affect Notebook data for other conversations. Notebook persistence remains browser localStorage only; no backend DB/API, vector DB/RAG, embeddings, semantic search, clickable citations, Studio, Auto, Workspace Room, Skill loader, or Slash Command Palette was added.
- Phase 5A.4.1 fixes Clear Notebook control visibility. The `Clear Notebook` action is now rendered in the top-level Notebook/Sources header next to the source/note counts, and the local-only status text is shown directly under the `Sources` title. The clear behavior is unchanged: confirmation is required, only the current conversation's Notebook sources/notes/selected source/note draft are reset, chat history is not cleared, and other conversations are not affected. Persistence remains browser localStorage only; no backend persistence or new source/RAG/Skill systems were added.
- Phase 5A.4.2 force-renders Notebook persistence controls in the actual visible Notebook overlay header. The previous visibility fix was still not visible in the user's runtime screenshot, so `ChatView` now renders `Notebook saved locally on this device.` and an always-present `Clear Notebook` button in the `Back to Chat` / `Chat notebook` header area. The button is disabled only when there is nothing to clear, includes lightweight `data-testid` markers, and clears only the active conversation's sources, selected source id, notes, and note draft after confirmation. Chat history and other conversations are not affected. No backend persistence, vector DB/RAG, embeddings, semantic search, clickable citations, Studio, Auto, Workspace Room, Skill loader, or Slash Command Palette was added.
- Phase 5A.4.3 removes the Notes panel textarea resize artifact in Notebook only. The Notebook note draft textarea and edit-note textarea now use `resize-none`, eliminating the browser resize handle/stacked visual artifact in the right Notes column while preserving add/edit/delete note behavior, Notes list scrolling, Source AI Chat, Clear Notebook, and the main Chat composer behavior. No Notebook logic, storage, backend persistence, vector DB/RAG, embeddings, semantic search, clickable citations, Studio, Auto, Workspace Room, Skill loader, or Slash Command Palette was added.
- Phase 5A.4.4 is a Notebook UX safety cleanup. The prominent `Clear Notebook` action was removed from the visible Notebook overlay/header and moved into a secondary collapsed `Advanced / Danger zone` section inside `SourcesPanel`. Clearing now requires typing exactly `CLEAR` in a prompt; it clears only the current chat's Notebook sources, selected source id, notes, note draft, note edit state, and selected chunk, does not delete chat history, and does not affect other conversations. The small `Notebook saved locally on this device.` status remains in the overlay/header. The right Notes column keeps `resize-none` note textareas and uses the existing `no-scrollbar` utility plus `overflow-x-hidden`, so the stacked scrollbar/resize artifact is hidden in Notebook only while Notes content remains scrollable. The main Chat composer and its scrollbar behavior are untouched. Persistence remains browser localStorage only; no backend DB/API, vector DB/RAG, embeddings, semantic search, clickable citations, Studio, Auto, Workspace Room, Skill loader, full Skill system, or Slash Command Palette was added. `/source` remains the deterministic path for guaranteed source grounding.
- Phase 5A.4.5 cleans up Notebook header clutter. The duplicated `Notebook saved locally on this device.` text was removed from the top Notebook overlay header, and the `Default notebook` label above `Sources` was removed from the main Sources header. The single local persistence status remains near the `Sources` title. No Notebook logic, persistence behavior, Clear Notebook behavior, `/source`, Source AI Chat, Notes behavior, backend DB/API, vector DB/RAG, embeddings, semantic search, clickable citations, full Skill system, or Slash Command Palette was changed.
- Phase S0 cleans up Notebook force commands so `/source` is now the only Notebook force command. `/เธเธญเธช`, `/notebook`, and the mojibake alias are removed from force command handling and now pass through as normal chat text. `/source` still strips the command, uses only current conversation enabled ready Notebook sources, returns the deterministic no-source message when no enabled ready sources exist, and skips the model call for that no-source case. Added `docs/skills/source/skill.md` as documentation for the future Source Skill rules only; it is not loaded or executed, and no Skill loader/full Skill system was added. The existing Prompts UI is not connected to skills. Prompt picker behavior was checked and narrowly guarded so the old prompts popover closes once composer text is `/source` or starts with `/source `; broader Slash Command Palette work remains deferred.
- Phase S0.1 suppresses the legacy Prompt picker for `/source`. Root cause: the old `/` prompt picker focuses its own search input through `useInitPopoverInput`, moves text after `/` into prompt search, and clears the textarea, so typing `/source` could leave `source` inside the prompt picker instead of the composer. Fix: `PromptsCommand` now detects prompt-search values `source` and `source ...`, restores `/source...` back into the textarea, closes the prompt popover, and returns focus to the composer. Prompts UI is still not connected to `/source`, `docs/skills/source/skill.md` remains documentation-only, and the full Slash Command Palette/Skill system remains deferred.
- Phase S0.2 disables the legacy `/` Prompt picker in the Chat composer. The old picker was still showing a second input above the real Chat textarea as soon as `/` was typed, before `/source` could be completed. `ChatForm` no longer renders `PromptsCommand`, and the `/` key handler now keeps `showPromptsPopover` closed instead of opening the legacy prompt search. `/source` continues to be handled by the normal chat submit path in `useChatFunctions`; Prompts UI is still not connected to `/source`, and the full Slash Command Palette/Skill system remains deferred.
- Phase 5A.3 tunes auto Notebook grounding for short Thai fact lookup questions. Smart Context Selection Lite now gives a small auto-mode relevance boost when both the question and enabled ready source chunks match clear fact lookup groups such as `ชื่อผู้ใช้`/`ผู้ใช้งานชื่อ`, `รหัส`, or `สีลับ`. The generic word `ชื่อ` alone is intentionally not enough, so creative/general questions like asking for shop names should stay normal Chat unless source chunks clearly match. `/source` force mode is unchanged and remains the strict path for guaranteed source grounding. This is still heuristic keyword grounding only; there is no vector DB/RAG, embeddings, semantic search, clickable citations in normal Chat, full Skill system, or Slash Command Palette.
- Phase 4A-Lite makes Source AI Chat usable as a direct-context MVP. It filters to enabled + ready sources, caps combined source context at 24 KB, asks the current chat model to answer only from those sources, and stores the Notebook chat transcript in memory by conversation id.
- Phase 4A.2 changes the Source AI prompt into Notebook librarian behavior. It can answer general questions about itself and how to use Notebook/Sources without source evidence, answers source-content questions from enabled ready sources, and can summarize/analyze/compare sources while separating "Source says" from analysis or inference.
- Phase 4A.3 adds editable note cards with Save/Cancel. Edits update only the current conversation-scoped in-memory note state. Creating a source after editing uses the latest note content, but existing note-created sources are not auto-synced.
- Sources show title, type, size, status, enabled state, added date, and read-only preview.
- Secret-like, risky, unsupported, too-large, and parse-error sources are surfaced with explicit statuses.
- Current size limit is 100 KB per source for the frontend-only MVP.
- Full chunking/source grounding, clickable citations, vector DB/RAG, Studio outputs, persistence, and Attach to Chat are still deferred.
- Cowork AI Planner stabilized. `New Plan`, `Reset Draft`, and template apply clear stale planner state (preview, warnings, error, accepted state, copy states, codex prompt). `New Plan` clears to an empty draft, `Reset Draft` restores the safe starter draft, and both archive the current non-empty plan into local Cowork History first. History keeps the latest 20 non-empty snapshots in browser `localStorage`, supports restore/copy/delete/clear all, and is never sent to Cowork AI. False unsafe-context rejection from bare safety labels (`.env`, `token`, `password`, `credential`, `secret`, `node_modules`, `provider config files containing secrets`) is fixed on both frontend and backend; the secret detection pattern now only matches actual secret-like values (`key=value`, `Bearer <long>`, `-----BEGIN`, long random API-key strings), not bare label words that appear in avoidFiles/exclusions. Cowork remains read-only: no file edits, patch apply, terminal commands, chat history usage, Notebook source usage, or code context. Code mode remains the only path for patch/apply/checkpoint/verify.

### Acceptance Criteria

Sources MVP is acceptable when:

- The user can add a text/markdown source.
- The user can see sources in a list.
- The user can preview a source.
- The user can enable/disable sources.
- Sources uses a full workspace layout with source list/add source, librarian placeholder, and notes placeholder.
- In-memory source and note state is scoped by current chat/conversation id.
- The UI does not include Studio tiles yet.
- The app builds and `/readyz` returns `OK`.

### Later Enhancements

After MVP:

- Persist notebooks/sources per user.
- Add PDF text extraction.
- Add URL import.
- Add better chunking and clickable citations.
- Add source search.
- Add source compare/contradiction finder.
- Add Notebook Guide caching.
- Add Studio outputs later only when the core source workflow is stable.

## How To Continue In A New Chat

Start by reading:

1. `CLAUDE.md`
2. `CODE_MODE_HANDOFF.md`
3. `api/server/routes/workspace.js`
4. `client/src/components/Workspace/CodePanel.tsx`
5. `client/src/components/Workspace/CoworkPanel.tsx`

Then verify:

```powershell
Invoke-WebRequest -Uri 'http://localhost:3080/readyz' -UseBasicParsing
```

For frontend/backend changes, use:

```powershell
docker compose -f docker-compose.local.yml build api
docker compose -f docker-compose.local.yml up -d
```
