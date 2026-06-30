# Code Mode Handoff

Last updated: 2026-06-30

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
  - Chat/Cowork/Code/Sources mode tabs.
- `client/src/components/Workspace/SourcesPanel.tsx`
  - Sources mode UI: NotebookLM-style workspace with references list first, compact add source, enable/disable, remove, status, secondary selected-source preview, central Source AI Chat placeholder, and notes cards.
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
- Keep frontend-only/manual source creation from pasted text, `.txt`, and `.md`.
- Keep source list, source status, enable/disable, remove, and read-only preview.
- Scope in-memory Sources and manual Notes state by current chat/conversation id using existing conversation state.
- Do not start Cowork Auto, Code Auto, Studio outputs, crawler/OCR, Google Drive sync, or a heavy vector database/RAG pipeline.

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

Add a new top-level workspace tab after Code:

```text
Chat | Cowork | Code | Sources
```

`Sources` is clearer than `NotebookLM` because it describes what the mode does and avoids implying this is Google's product.

If the UI later needs multiple notebooks, `Sources` can contain a notebook selector at the top.

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
  type: 'text' | 'markdown' | 'pdf' | 'url';
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
- Sources show title, type, size, status, enabled state, added date, and read-only preview.
- Secret-like, risky, unsupported, too-large, and parse-error sources are surfaced with explicit statuses.
- Current size limit is 100 KB per source for the frontend-only MVP.
- Source AI chat, note-to-source, citations, chunking, RAG, Studio outputs, and Attach to Chat are still deferred.

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
- Add note-to-source conversion.
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
