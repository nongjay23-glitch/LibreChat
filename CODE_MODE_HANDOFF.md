# Code Mode Handoff

Last updated: 2026-07-01

This file summarizes the custom Code mode work completed in this LibreChat-based workspace so a new chat can continue without re-reading the whole conversation.

## Project Goal

Build a Claude-like open source AI workspace on top of LibreChat with:

- Chat as the main AI conversation surface.
- Manual Cowork for planning/workflow.
- Code for safe project-file context and AI-assisted patch review/apply.

Manual Cowork is now complete for the current scope. Auto Cowork/Code remains deferred. The next major product area is NotebookLM-style Sources core, without Studio outputs.

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
  - Cowork planning workspace with Goal, Scope, Plan, Files, Risks, Verification, Next Action, prompt handoff, file-context guidance, and local draft persistence.
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

- Update this handoff so it reflects the current state.
- Continue the NotebookLM-style Sources core with Phase 2.5.
- Make Sources a full workspace view instead of a small side panel beside Chat.
- Phase 2.5C corrects the layout toward NotebookLM: center is Source AI Chat first, left is Sources/References first, right is Notes list/cards, and preview is secondary.
- Phase 2.5D adds in-memory note delete and note-to-source conversion inside the current chat/conversation scope.
- Phase 2.5D.1 moves Sources/Notes in-memory state to shared frontend Recoil state so it survives Chat/Cowork/Code/Sources mode switching while remaining scoped by conversation.
- Phase 2.6 moves Sources/Notebook access out of the main workspace tabs and into a per-chat `Notebook` button in the Chat header. The old top-level Sources tab is hidden/removed from main tabs.
- Phase 3A adds frontend-only source chunks/sections and context estimates. Chunks are created in-memory for pasted text, `.txt`, `.md`, and note-created sources; selected source detail shows chunk count, rough token estimate, compact section list, and selected chunk preview. Smart context selection, clickable citations, vector DB/RAG, and persistence are still deferred.
- Phase 3B adds Smart Context Selection Lite for Source AI Chat. It uses frontend-only keyword/chunk scoring over enabled ready source chunks, preserves source/section labels in the prompt, and shows compact context feedback after answers. There is still no vector DB/RAG, embedding, semantic search, clickable citation system, persistence, Attach to Chat, or normal Chat source reading.
- Phase 3C adds Better Citations / Evidence Trace for Source AI Chat. Assistant messages now keep optional evidence metadata for the exact selected chunks sent into the model and render a compact Evidence section with source title, section/chunk label, and snippet. This is still not a full clickable citation system and still has no vector DB/RAG, embedding, semantic search, persistence, Attach to Chat, or normal Chat source reading.
- Phase 4B adds Normal Chat `Use Notebook` lite integration. The composer has a per-conversation in-memory toggle that attaches selected enabled ready Notebook chunks to the normal Chat request as request-only hidden `notebookContext`; the stored user message text stays clean. It reuses the Phase 3B chunk selection helper and the 24 KB context cap. Normal Chat still has no clickable citations, vector DB/RAG, embedding, semantic search, or Notebook persistence; Source AI Chat remains the main path for Evidence Trace.
- Phase 4B also migrates `Constants.NEW_CONVO` Notebook state from the Chat composer toggle when the first normal Chat message creates a real conversation id, so the enabled sources count and opt-in state do not disappear after the first send.
- Phase 4A-Lite enables Source AI Chat inside Notebook. It reads only enabled `ready` sources from the current chat/conversation, sends a direct source-context prompt through a non-persistent workspace source-chat route, and keeps Source AI messages in frontend conversation-scoped Recoil state.
- Phase 4A.2 upgrades Source AI Chat behavior from strict source-only lookup to Notebook librarian behavior: general notebook/help questions are allowed, source-grounded answers still cite enabled ready sources, and source analysis/inference must separate source facts from interpretation.
- Phase 4A.3 adds frontend-only editable notes in Notebook. Notes can be edited, saved, or cancelled in-memory per conversation. Note-to-source auto-sync remains deferred; sources already created from notes do not update automatically.
- New Chat fallback migration is fixed: Notebook state created before the first user message under `Constants.NEW_CONVO` is moved into the real conversation id when it appears. This covers sources, selected source, notes, note draft, Source AI Chat messages, and Source AI Chat draft, and remains frontend-only in-memory state with no persistence.
- Keep frontend-only/manual source creation from pasted text, `.txt`, and `.md`.
- Keep source list, source status, enable/disable, remove, and read-only preview.
- Scope in-memory Sources and manual Notes state by current chat/conversation id using existing conversation state.
- Do not start Cowork Auto, Code Auto, Studio outputs, crawler/OCR, Google Drive sync, or a heavy vector database/RAG pipeline.
- Source grounding is still lightweight and frontend-only: no vector DB/RAG, embeddings, semantic search, clickable citations, source persistence, Attach to Chat, or normal Chat source reading. Citations are simple source/section labels such as `[Source: filename]` or `[Source: filename / Section: heading]`.

Do not start this yet unless requested:

- Auto Cowork or Auto Code.
- Studio outputs such as Audio overview, Slides, Video, Mind map, Report, Flashcards, Quiz, Infographic, or Table.
- Broad autonomous agent behavior.

Manual Cowork is complete for the current scope. Code mode remains the only path for project-file context, patch review, apply, checkpoints, restore, and verification.

## Cowork Mode Plan

Cowork is the next major workflow after Code mode. The reference behavior is Claude-style planning and collaboration: the user talks in Chat, Cowork turns the request into a concrete plan, and Code remains the only path that can prepare or apply file changes.

### Goal

Cowork should become the planning layer between Chat and Code:

- Clarify what the user wants before touching files.
- Split large work into small, reviewable steps.
- Identify likely files and risks.
- Prepare a safe prompt for AI diff generation.
- Hand the user to Code mode for file context, patch review, apply, checkpoint, and verification.

Cowork must not become a second code editor or a hidden automation layer.

### Non-Goals For First Cowork Pass

- Do not add direct terminal execution from Cowork.
- Do not let Cowork write, delete, rename, upload, or move files directly.
- Do not build real-time multiplayer collaboration yet.
- Do not start NotebookLM-style source/RAG workflows yet.
- Do not add broad agent autonomy. Human confirmation remains required.

### Primary User Flow

The first usable Cowork workflow should be:

```text
Chat request -> Cowork plan -> user confirms scope -> choose files/context -> ask AI for diff -> Review in Code -> Apply with checkpoint -> Verify -> History
```

If a user starts directly in Cowork, the flow is:

```text
Cowork request -> plan draft -> file/context suggestions -> user confirms -> Code mode handles patch work
```

### Cowork UI Sections

Keep headings in English and supporting explanations in Thai where useful.

Recommended sections for the first implementation:

- `Goal`
  - One short statement of what the current task is trying to achieve.
- `Scope`
  - What is included.
  - What is explicitly excluded.
- `Plan`
  - Ordered steps.
  - Each step should have a checkable status such as `todo`, `doing`, `done`, or `blocked`.
- `Files`
  - Suggested files to inspect or attach.
  - This should link users toward Code mode file context, not read hidden files by itself.
- `Risks`
  - Known risks such as model diff quality, stale context, sensitive files, or build impact.
- `Verification`
  - Suggested checks after apply: Fast, Normal, Strict, build, readyz, or UI smoke.
- `Next Action`
  - The one action the user should take next, such as open Code, attach files, ask AI for diff, or review patch.

Avoid long always-visible documentation panels. Use compact cards, disclosure sections, or tabbed subviews.

### Required Safety Rules

- Cowork can suggest actions, but Code mode owns file browsing, patch review, apply, checkpoint, restore, and verification.
- Cowork must not bypass the Code mode safety model.
- Cowork should never request or display secrets, API keys, `.env`, tokens, passwords, credentials, `.git`, `node_modules`, logs, uploads, or database files.
- Before any file-changing step, Cowork must produce a human-readable plan and wait for user confirmation.
- If the task is unclear, Cowork should ask one focused question instead of guessing.
- If the user asks for broad or risky edits, Cowork should narrow the scope before sending anything to Code.

### AI Prompt Strategy

Cowork should help produce better model prompts. The prompt should:

- State the goal.
- List the relevant files attached from Code mode.
- Say which file changes are in scope.
- Ask for a unified diff only when the user is ready for Code mode.
- Include the strict diff rules already used in Code mode:
  - return only unified diff
  - use latest attached file content as source of truth
  - include `diff --git`, `---`, `+++`, and valid `@@` hunks
  - keep hunks small with context
  - avoid blocked paths

For Qwen3.6 35B A3B Passport, apply the Thai-writing guard only to user-facing Thai explanations. Patch syntax and code must stay exact.

### Data Model For First Pass

A simple frontend-only Cowork draft is enough for the first pass. Suggested shape:

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

Persisting Cowork drafts can come later. First pass can use React state unless the user asks for saved project plans.

### Integration With Existing Code Mode

Reuse what already works:

- File context should still be created in `Code > Files`.
- AI-produced diffs should still enter through `Review in Code`.
- Patch apply should still go through `Code > Changes`.
- Checkpoints, restore, and verification should stay in `Code > History`.

Cowork should point to these workflows instead of duplicating them.

### First Implementation Slice

Recommended first coding slice:

1. Replace the current static `CoworkPanel` content with a compact plan workspace.
2. Add editable/clearable Cowork draft fields for Goal, Scope, Plan, Files, Risks, Verification, and Next Action.
3. Add a `Copy plan prompt` action that copies a structured planning prompt for the current chat model.
4. Add a `Send diff prompt to Chat` or `Prepare diff request` action only after the plan has at least one suggested file.
5. Keep all actions read-only. No backend write route should be added for Cowork in this slice.

### Cowork Roadmap

Phase 1: Cowork first slice

- Build a compact frontend-only planning workspace in `CoworkPanel`.
- Support editable `Goal`, `Scope`, `Plan`, `Files`, `Risks`, `Verification`, and `Next Action`.
- Add `Copy plan prompt`.
- Add `Prepare diff request` as a read-only prompt action that requires at least one suggested file.
- Do not persist drafts, add backend routes, or write files from Cowork.
- Suggested commit after verification: `Add cowork planning workspace`.

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

### Cowork Auto Roadmap

This roadmap is for a new chat after Manual Cowork is stable. Do not start these automation phases while finishing the current Manual Cowork scope.

Cowork auto should mean assisted planning, context preparation, diff preparation, and guarded handoff. It must not mean silent file writes. Code mode remains the only owner of file browsing, patch review, apply, checkpoint, restore, and verification.

#### Automation Levels

Level 0: Manual Cowork

- Current state.
- User edits Goal, Next Action, Plan, Details, and Prompt Handoff manually.
- Cowork can copy prompts and open Code.
- No backend route, file read, file attach, patch apply, checkpoint, restore, or verification action is initiated by Cowork.

Level 1: Assisted Planning

- Cowork can ask Chat/model to draft or refine a plan from the user's request.
- Output must be structured into Goal, Scope, Plan, Files, Risks, Verification, and Next Action.
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

Cowork first pass is acceptable when:

- The tab is useful without reading long instructions.
- The user can see the current goal and next action at a glance.
- The user can turn a rough request into a scoped plan.
- Cowork can produce a prompt that asks AI for a plan or for a diff safely.
- Cowork does not write files directly.
- Code mode still owns diff review/apply/checkpoint/verification.
- The app builds and `/readyz` returns `OK`.

### Later Cowork Enhancements

After the first pass:

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
- Phase 5A.4.4 hides the remaining Notes panel scrollbar artifact in Notebook only. The right Notes column scroll container now uses the existing `no-scrollbar` utility plus `overflow-x-hidden`, so the stacked scrollbar marks seen beside the note textarea/list are hidden while Notes content remains scrollable. The main Chat composer and its scrollbar behavior are untouched. No Notebook logic, storage, backend persistence, vector DB/RAG, embeddings, semantic search, clickable citations, Studio, Auto, Workspace Room, Skill loader, or Slash Command Palette was added.
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
