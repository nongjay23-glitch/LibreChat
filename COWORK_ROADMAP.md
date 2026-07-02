# Cowork Roadmap

## Product Direction

Cowork should become a chat-first AI cowork workspace.

Main idea:

- User writes a short task prompt.
- Cowork thinks through the task.
- Cowork returns result-first output.
- Advanced details are available only when needed.
- Code mode remains the only real apply path.

Cowork is no longer intended to grow as a large form-heavy planner UI. Existing Goal, Plan, Details, Prompt Handoff, Ready checklist, and History structures should become the internal planning engine, advanced inspector, history backup, and Code handoff support. They should not dominate the main Cowork surface.

## Role Split

Chat:

- General conversation.

Cowork:

- Task-focused AI cowork chat.
- Planning, requirement expansion, analysis, clarification, handoff generation.
- Later: read/analyze explicitly attached files.
- Later: propose sandbox edits.

Code:

- Real file context.
- Diff review.
- Patch apply.
- Checkpoint.
- Rollback.
- Verification.

## What We Learned From The Restaurant Website Test

- Qwen3.6 35B can produce a decent restaurant MVP from a short prompt.
- It inferred major roles/pages such as customer, kitchen, cashier, and backoffice.
- However, without guidance it may choose a simple single-page/view-switching approach instead of a scalable routed/component architecture.
- Therefore Cowork should help expand requirements before sending work to Code:
  - demo vs expandable project
  - route/page separation
  - component separation
  - customer/kitchen/cashier/admin roles
  - payment flow
  - data storage choice
  - reporting requirements
  - test checklist

## Qwen3.6 35B Expectation

Qwen3.6 35B can be useful as Cowork brain for:

- task conversation
- requirement expansion
- planning
- file analysis when context is explicit
- proposed edits
- patch suggestions
- Code/Codex handoff prompt generation

But:

- It should not be trusted to directly mutate the real repo.
- It needs system support:
  - multi-step reasoning
  - verifier/review pass
  - scope lock
  - sandbox boundary
  - Code mode apply gate

## CW-1B - Chat-first Cowork

Goal:

Convert Cowork from form-first planner UI into a task-focused chat/result-first surface.

Main screen should show:

- Cowork chat input
- conversation/result area
- main answer/result card
- next action
- Copy Prompt
- Send/Prepare for Code
- Show Details
- History entry

Move behind Advanced/Details:

- Goal
- Scope
- Plan
- Details
- Prompt Handoff
- Ready checklist
- Templates
- Risks
- Verification

Important:

- Do not delete existing planner/history/checklist structures.
- Convert them into internal/advanced support.
- Do not allow direct file edits in CW-1B.

Cleanup/migration:

- Archive meaningful old current plan before clearing.
- Clear stale form-first current state.
- Clear or migrate stale `plannerPreview`, accepted state, stale `codexPrompt`, Prompt Handoff state, Ready checklist UI state, and obsolete expanded/collapsed UI state.
- Do not delete History automatically.
- Do not delete Chat, Notebook, Sources, or Code checkpoints.
- Provide a clean path for the user to start with an empty Cowork Chat screen.

## CW-1C - Hidden Multi-step Cowork Reasoning

Goal:

Let users write short prompts while Cowork produces more complete results.

Internal pipeline:

1. Analyzer
   - classify task type
   - understand goal
   - infer likely missing requirements
   - identify important questions

2. Planner / Builder
   - create plan or answer
   - create handoff if needed

3. Verifier
   - check completeness
   - check scope
   - check missing roles/flow/files/tests
   - detect overreach or unsafe assumptions

4. Finalizer
   - produce clean user-facing final result
   - keep UI result-first

Optional for large code tasks:

5. Code Handoff Optimizer
   - produce a narrow, safe, ready-to-paste Code/Codex prompt

Rules:

- User should see final result by default.
- Raw reasoning/process logs should not be shown on the main UI.
- Store only useful summaries, not raw hidden reasoning.
- If unsure, ask the user instead of inventing major requirements.
- Use Plan Lock / Scope Lock to prevent drift.

## CW-2 - File-aware Cowork

Goal:

Cowork can read/analyze explicitly selected files.

Rules:

- User must explicitly attach/select files.
- Cowork reads only selected files.
- No broad repo scan.
- No `.env`/secrets/credentials.
- No real file mutation.

## CW-3 - Cowork Sandbox

Goal:

Create a controlled sandbox workspace for selected files.

Rules:

- Cowork can propose or edit only files inside the sandbox.
- Cowork cannot access files outside sandbox.
- Cowork cannot write to real repo.
- Cowork cannot delete/rename/move real files.
- Cowork cannot run arbitrary terminal commands.
- New files must be proposed in sandbox first and require user approval.

## CW-4 - Sandbox Diff Preview

Goal:

Show diffs between sandbox edits and original selected files.

Flow:

- Cowork proposes sandbox changes.
- System creates diff preview.
- User reviews diff.
- No real apply yet.

## CW-5 - Apply through Code mode

Goal:

Approved sandbox diffs are handed to Code mode.

Rules:

- Code mode creates checkpoint.
- Code mode applies patch.
- Code mode verifies.
- Code mode supports rollback.
- Cowork never applies directly.

## Future Backlog - Adaptive Cowork Output Modes

Goal:

Cowork eventually adjusts output detail by task type.

Rules:

- Small/general tasks should not require full coding sections.
- Large code/design/report tasks can use full structured sections.
- Do not implement this yet.

## Hard No

- Do not grow form-heavy Cowork UI further.
- Do not let Cowork directly edit real repo files.
- Do not let Cowork run arbitrary terminal commands.
- Do not send Cowork History into AI context by default.
- Do not delete user history without explicit action.
- Do not expose raw hidden reasoning as main UI.
