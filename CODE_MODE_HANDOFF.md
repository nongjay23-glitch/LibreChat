# Code Mode Handoff

Last updated: 2026-06-29

This file summarizes the custom Code mode work completed in this LibreChat-based workspace so a new chat can continue without re-reading the whole conversation.

## Project Goal

Build a Claude-like open source AI workspace on top of LibreChat with:

- Chat as the main AI conversation surface.
- Cowork for planning/workflow later.
- Code for safe project-file context and AI-assisted patch review/apply.

NotebookLM-style source workflows are intentionally deferred. The next major area after Code mode is Cowork.

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
  - Chat/Cowork/Code mode tabs.
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

Do not start this yet unless requested:

- Continue with `Cowork` mode.
- Cowork should build on the Code safety model instead of bypassing it.
- Cowork should guide planning, task breakdown, project context, and human confirmation before any file writes.

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
    status: 'todo' | 'doing' | 'done' | 'blocked';
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
- Current implementation adds a read-only `Open Code` action and a `Copy handoff summary` prompt. It only switches the active workspace tab or copies text; it does not attach files, apply patches, or call backend write routes.
- Suggested commit after verification: `Connect cowork handoff to code workflow`.

Phase 6: Advanced Cowork

- Add task history and handoff summary generation for new chats.
- Add reusable plan templates.
- Consider optional project memory or NotebookLM-style source workflows only after Cowork and Code are stable.
- Keep broad agent autonomy out of scope unless a separate safety design is approved.

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
- Add optional project memory or NotebookLM-style source mode after Cowork and Code are stable.

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
