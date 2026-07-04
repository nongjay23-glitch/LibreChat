# Cowork Roadmap

## Product Direction

Cowork should become a separate chat mode for work/action tasks, not just a chat-like panel inside the normal Chat layout.

Main idea:

- User enters a Cowork room/project.
- User writes a short task prompt in a dedicated Cowork Chat surface.
- Cowork thinks through the task and returns result-first output.
- Advanced planner/details are available only when needed.
- Code mode remains the only real apply path.

Cowork is no longer intended to grow as a large form-heavy planner UI or a sidebar-only chat-like shell. Existing Goal, Plan, Details, Prompt Handoff, Ready checklist, and History structures should become the internal planning engine, advanced inspector, history backup, and Code handoff support inside Cowork Chat. They should not dominate the main Cowork surface.

## Role Split

Chat:

- Knowledge / information mode.
- Normal conversation.
- Notebook/Sources.
- Reading and organizing information.
- Source Q&A.
- Notes and references.
- Not the place for direct machine, file, or tool action.

Cowork:

- Work / action mode.
- Separate Cowork rooms/projects/task history.
- Task-focused AI cowork chat with Cowork-only messages.
- Planning, requirement expansion, analysis, clarification, handoff generation.
- Hidden multi-step reasoning later.
- Verifier/review pass later.
- Later: read/analyze explicitly attached files.
- Later: propose sandbox edits.
- Later: restricted terminal/tool adapters.
- Later: external tool adapters such as Excel, Figma, and other local programs.
- Must operate through safety boundaries, approvals, sandbox/tool adapters, and previews.
- Must not directly mutate the real repo or user machine.

Code:

- Safe file apply mode.
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

## CW-1B - Separate Cowork Chat Mode

Goal:

Convert Cowork from form-first/sidebar-only planner UI into a separate Cowork Chat mode.

Target layout:

Chat mode:

- Left side: normal Chat history / projects / conversations.
- Right side: normal Chat AI conversation.
- Purpose: knowledge/reference work, Notebook/Sources, source Q&A, notes, and normal conversation.

Cowork mode:

- Left side: Cowork rooms / Cowork projects / Cowork task history.
- Right side: dedicated `CoworkChatView`.
- Purpose: work/action mode, project work, task execution planning, tool orchestration, local work, sandboxed file workflows, and future terminal/tool adapters.
- Cowork messages must be separate from normal Chat messages.
- Cowork must not pollute normal Chat history.

Code mode:

- Safe file operation workspace.
- Real project file context.
- Diff review.
- Patch apply.
- Checkpoint.
- Rollback.
- Verification.

Important:

- Do not delete existing planner/history/checklist structures.
- Convert them into internal/advanced support inside Cowork Chat.
- Do not keep growing form-heavy Cowork UI.
- Do not allow direct file edits in CW-1B.
- Code mode remains the only real apply/checkpoint/rollback/verify path.

CW-1B.1 status:

- Sidebar task prompt/result-first shell started with a task prompt mapped to the existing Goal field.
- Planner preview now prioritizes result, next action, clarifying questions, and Codex/Code prompt copy.
- Structured planner fields, Ready checklist, Prompt Handoff, templates, and History remain available as Advanced/internal support.
- No backend planner endpoint, localStorage schema, Chat, Notebook, Source, `/source`, Source AI Chat, or Code mode behavior changed.
- This is interim and insufficient as the final architecture because it does not create a separate right-side Cowork chat surface.

CW-1B.2 status:

- Architecture audit completed.
- Finding: current Cowork tab only changes the left sidebar panel. The right side remains normal `ChatView` and normal conversation/messages.
- Decision direction: build separate Cowork rooms on the left and `CoworkChatView` on the right.

CW-1B.3 - Documentation update for separate Cowork chat architecture:

- Record the new Chat / Cowork / Code role split.
- Record data separation and safety boundaries.
- Record phased implementation path before more runtime changes.

CW-1B.4 - Cowork mode shell:

- Active Cowork mode should render a right-side `CoworkChatView` placeholder.
- Started: Cowork active mode can render a separate right-side `CoworkChatView` placeholder and a left-side Cowork rooms placeholder.
- No AI changes yet.
- No backend changes yet.
- No Cowork room/message persistence yet.
- Preserve normal Chat behavior when Chat mode is active.

CW-1B.5 - Local Cowork rooms:

- Add frontend-only Cowork rooms/messages in `localStorage`.
- Keep Cowork rooms separate from normal Chat history.
- Left side becomes Cowork rooms/projects/task history.
- Started: Cowork rooms and user messages persist only in browser `localStorage` with keys `librechat.cowork.rooms.v1` and `librechat.cowork.activeRoomId.v1`.
- `CoworkChatView` now follows the normal Chat visual layout: header, scrollable local message area, bottom composer, and local user message bubbles.
- CW-1B.5.7 adds local-only Cowork projects and Chat-like sidebar organization. Cowork projects persist under `librechat.cowork.projects.v1`, expanded project state persists under `librechat.cowork.expandedProjectIds.v1`, existing standalone rooms continue with `projectId: null`, project rooms stay under their project, and standalone Cowork chats are grouped by Today / Yesterday / Previous 7 days / Older.
- CW-1B.5.8 adds local-only Cowork row menus and a Cowork projects overview. Cowork chat rows support local share-copy, pin/unpin, rename, duplicate, change project, archive, and delete actions. Cowork project rows support Open project, rename, and delete. Open project switches the dedicated `CoworkChatView` surface into a local Cowork projects overview stored under `librechat.cowork.projectsView.v1` / `librechat.cowork.openProjectId.v1`; it does not navigate to normal Chat projects.
- CW-1B.5.9 starts Cowork logic parity cleanup by consolidating local Cowork state into a single frontend snapshot. Room/project/active/view state now normalizes together, persists together, and emits one Cowork storage event per action. `CoworkChatView` projects overview state is tracked in React state instead of being read ad hoc from `localStorage` during render.
- CW-1B.5.10 makes Cowork row actions more Chat-like without touching normal Chat. Cowork chat/project three-dot menus now use inline rename and in-app dialogs for delete and change-project flows instead of browser `prompt` / `confirm`; all actions still write only Cowork localStorage.
- CW-1B.5.11 localizes the Cowork rooms sidebar, Cowork chat shell, and Cowork projects overview labels so the new Cowork surfaces follow the frontend localization rule without editing normal Chat.
- CW-1B.5.12 adds a one-time legacy planner current-draft migration. A meaningful old `librechat.coworkDraft.v2` draft is archived into `librechat.coworkPlanHistory.v1` before the stale current draft is cleared; existing Cowork History is preserved and Cowork Chat continues to use only its local room/project storage.
- CW-1B.7 Step 2 connects the chat-first `CoworkChatView` composer to the existing read-only Cowork planner endpoint. Cowork uses selected normal Chat model routing metadata as read-only request metadata, appends planner results as Cowork-only assistant messages in `localStorage`, and still avoids normal Chat submit, normal Chat conversations/messages, backend Cowork persistence, file actions, tools, terminal actions, and Send to Code.
- CW-1B.7 Step 3 makes planner use explicit. Normal Cowork messages stay as local-only user messages and do not call the planner endpoint or show plan preview cards; only `/plan <task>` invokes the planner. Empty `/plan` returns a local Cowork help/error message without calling backend.
- CW-1B.8 restores normal Cowork AI chat intentionally. Normal Cowork messages call the Cowork-only `POST /api/workspace/cowork/chat` endpoint, append assistant replies to Cowork localStorage, and remain separate from normal Chat conversations/history. `/plan <task>` still uses the planner endpoint.
- CW-1B.9 adds the planner quality contract. The planner prompt now requires sharper current understanding, implementation scope, exclusions, concrete steps, real risks, verification checks, one next action, and a scoped Codex/Code handoff prompt while keeping the same strict JSON schema and read-only safety model.
- CW-1B.10 adds a backend planner quality gate after model response parsing. `/plan` responses now get one model retry when they lack actionable target detail, concrete failure modes, concrete verification expectations, or a Code-ready handoff prompt. The gate favors semantic usefulness over length, so concise high-quality answers can pass.
- CW-1B.10.1 adds a JSON-only repair pass before the quality gate. If a selected model answers `/plan` with prose, markdown, or malformed JSON, the planner endpoint asks for one schema-only repair response instead of immediately showing an invalid JSON error.
- CW-1B.11 adds decision-question mode for `/plan`. The planner can return one high-impact decision instead of a plan when guessing would materially change scope or implementation direction. Cowork renders concrete choices plus a custom-answer path, saves the answer locally as Cowork history, and continues the planner flow without writing normal Chat history or invoking Code mode.
- CW-1B.12 adds `/ask <topic>` as an explicit requirement-question command. `/ask` reuses the planner endpoint and Cowork decision UI, but it is forced to ask one high-impact question at a time instead of returning a plan card or Codex prompt. The planner parser now extracts fenced/balanced JSON more defensively and falls back to safe Cowork output when a selected model still ignores strict JSON, returns empty retry/repair output, or fails the quality gate after retry. Normal Cowork chat and `/plan` remain separate flows.
- CW-1B.12.1 tightens decision-question quality. Decision questions must be short and ask one thing only, fallback questions no longer expose internal continuation prompts, and answering a decision tells Cowork not to repeat the same question.
- CW-1B.12.2 makes fallback non-blocking. If fallback output still misses the quality gate, the server returns it with warnings instead of showing a blocking error card.
- CW-1B.12.3 adds a language/repeat guard for Cowork decision questions. `/ask` and `/plan` planner requests now send a language hint plus recently asked decision questions, the backend rejects wrong-language or repeated decision questions, fallback chooses a different safe question when possible, and Cowork decision UI labels are localized for the current Thai workflow.
- CW-1B.12.4 changes Cowork decision cards to current-question behavior. When the user answers a decision, Cowork stores the question/answer on the original assistant message, hides that answered question card from the visible chat, and shows the next question/result without stacking old decision cards in the room.
- CW-1B.12.5 fixes Thai mojibake in Cowork fallback planner output. Backend fallback strings now use valid UTF-8 Thai, and Cowork local message normalization scrubs legacy saved planner text that was already stored with broken encoding.
- CW-1B.12.6 makes Cowork planner output more chat-first. Planner results render as readable assistant text with advanced details and Codex prompt behind a disclosure, decision cards show one compact current question with concise choices, planner summaries animate like normal assistant replies, and continuation payloads avoid leaking internal prompt labels back into follow-up questions.
- Cowork projects, rooms, active room, and messages remain separate from normal Chat projects, conversations, history, and APIs.
- No backend Cowork persistence, file actions, tool actions, terminal actions, sandbox actions, Code mode apply actions, or normal Chat conversation writes yet.

CW-1B.6 - CoworkChatView MVP:

- User prompt goes to the existing planner endpoint.
- Append planner result as a Cowork-only message/result.
- Do not save Cowork messages into normal Chat conversations.

CW-1B.7 - Move planner/result/details into CoworkChatView Advanced:

- Reuse current planner/history/checklist/handoff logic.
- Move Goal, Scope, Plan, Details, Prompt Handoff, Ready checklist, templates, risks, and verification behind Advanced inside Cowork Chat.

CW-1B.8 - Cleanup old CoworkPanel usage:

- `CoworkPanel` should become room/sidebar support or be replaced by `CoworkRoomsList`.
- Do not discard useful planner/result/handoff logic; move it to the appropriate Cowork Chat layer.

Data model recommendation:

- Avoid reusing the normal conversation model for Cowork in the early phase because it risks polluting normal Chat history.
- Use frontend-only Cowork rooms/messages in `localStorage` first for MVP.
- Later move to a backend Cowork rooms/messages API when the UI contract is stable.
- Cowork rooms should store:
  - room title/project
  - Cowork-only messages/results
  - planner result
  - handoff prompt
  - advanced draft/details
  - history snapshots if useful

Cleanup/migration:

- Archive meaningful old current plan before clearing.
- Clear stale form-first current state.
- Clear or migrate stale `plannerPreview`, accepted state, stale `codexPrompt`, Prompt Handoff state, Ready checklist UI state, and obsolete expanded/collapsed UI state.
- Do not delete History automatically.
- Do not delete Chat, Notebook, Sources, or Code checkpoints.
- Provide a clean path for the user to start with an empty Cowork Chat screen.

Action/tool safety path:

```text
Cowork Chat -> selected context/files -> sandbox or tool adapter -> preview -> user approval -> Code/apply/export/save path as appropriate
```

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

## CW-6 - Restricted Terminal Tool

Goal:

Allow limited terminal-assisted work only through explicit safety controls.

Rules:

- Command preview before execution.
- Allowlist and/or policy checks.
- User approval required.
- No arbitrary unsupervised terminal.
- No hidden background execution.
- Terminal output should be summarized back into Cowork without granting Cowork real repo mutation powers.

## CW-7 - External Tool Adapters

Goal:

Allow Cowork to help with external tools through explicit adapters instead of broad machine control.

Initial adapter candidates:

- Excel
- Figma
- Other local programs

Rules:

- Adapter-specific permissions.
- Adapter-specific previews.
- User approval before save/export/apply actions.
- No unrestricted control of user programs.

## CW-8 - Workflow Automation

Goal:

Support multi-step work only after the safety boundaries are proven.

Rules:

- Human approval gates between meaningful steps.
- Clear activity history.
- No broad autonomous agent behavior by default.
- Code/apply/export/save actions must route through their appropriate safety path.

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
- Do not let Cowork apply patches.
- Do not let Cowork control external tools without explicit adapter boundaries.
- Do not send normal Chat history into Cowork context by default.
- Do not send Cowork History into AI context by default.
- Do not delete user history without explicit action.
- Do not expose raw hidden reasoning as main UI.
