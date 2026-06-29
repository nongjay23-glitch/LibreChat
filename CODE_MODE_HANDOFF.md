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
  - Cowork surface exists but is not the active focus yet.
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
