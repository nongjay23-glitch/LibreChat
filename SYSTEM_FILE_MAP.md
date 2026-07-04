# System File Map

## Purpose

This file maps the major workspace systems to their main files, responsibilities, and safety boundaries so future AI work does not need to guess the repo structure.

It is not a roadmap. Use `COWORK_ROADMAP.md` for phase direction and `CODE_MODE_HANDOFF.md` for current handoff/checkpoint context.

## Workspace Shell

### Main Files

- `client/src/routes/Root.tsx`
  - App shell after authentication.
  - Hosts `UnifiedSidebar`, app providers, and the routed main outlet.
- `client/src/routes/ChatRoute.tsx`
  - Main Chat route.
  - Chooses `CoworkChatView` when the active workspace panel is `cowork`; otherwise renders normal `ChatView`.
  - Initializes normal Chat conversations and default model/spec state.
- `client/src/components/UnifiedSidebar/UnifiedSidebar.tsx`
  - Shared left sidebar shell, sizing, mobile behavior, and provider wrapping for sidebar panels.
- `client/src/hooks/Nav/useUnifiedSidebarLinks.ts`
  - Defines the sidebar panel links for Chat, Cowork, Code, and additional side panels.
  - Maps Cowork to `CoworkRoomsList` and Code to `CodePanel`.
- `client/src/components/Workspace/WorkspaceModeTabs.tsx`
  - Chat / Cowork / Code mode tabs.

### Do Not Touch Unless Scoped

- Avoid changing `Root.tsx`, `ChatRoute.tsx`, or unified sidebar routing for a Cowork-only task unless the task explicitly changes mode switching or panel ownership.

## Cowork System

### Frontend Core

- `client/src/components/Workspace/CoworkChatView.tsx`
  - Right-side Cowork chat surface.
  - Cowork composer and local message rendering.
  - Normal Cowork chat calls the Cowork-only chat endpoint.
  - `/ask` and `/plan` command handling.
  - Planner result rendering, decision question cards, and Codex prompt copy UI.
  - Reads selected normal Chat model metadata as read-only request metadata.
- `client/src/components/Workspace/CoworkRoomsList.tsx`
  - Left-side Cowork rooms/projects sidebar.
  - Room/project list grouping, selected state, menus, rename, delete, archive, duplicate, pin, and change-project flows.
- `client/src/components/Workspace/coworkRooms.ts`
  - Cowork local domain/state layer.
  - Cowork rooms, projects, messages, decision answers, planner results, and localStorage persistence.
  - Legacy form-first Cowork draft migration into history.
- `client/src/components/Workspace/CoworkPanel.tsx`
  - Legacy/manual form-first Cowork planner surface.
  - Treat as legacy/internal planner support while Cowork pivots to chat-first mode.

### Backend

- `api/server/routes/workspace.js`
  - `POST /api/workspace/cowork/chat`
    - Cowork-only normal chat response path.
    - Must not create normal Chat conversations or DB messages.
  - `POST /api/workspace/cowork/planner`
    - Read-only Cowork planner path for `/ask` and `/plan`.
    - Handles planner prompt construction, selected model routing, JSON parsing/repair/retry/fallback, decision-question validation, and quality warnings.
  - This same file also contains Code mode and Sources backend routes; keep edits narrowly scoped.

### Storage

Browser localStorage keys:

- `librechat.cowork.rooms.v1`
- `librechat.cowork.activeRoomId.v1`
- `librechat.cowork.projects.v1`
- `librechat.cowork.expandedProjectIds.v1`
- `librechat.cowork.projectsView.v1`
- `librechat.cowork.openProjectId.v1`

Legacy/migration keys:

- `librechat.coworkDraft.v2`
- `librechat.coworkPlanHistory.v1`
- `librechat.cowork.legacyPlannerMigrated.v1`

### Boundaries

- Cowork must not write normal Chat conversations or normal Chat history.
- Cowork must not use the normal Chat submit pipeline unless explicitly scoped and safety-reviewed.
- Cowork must not directly edit project files.
- Cowork must not run terminal commands or unrestricted tools.
- Cowork must not apply patches, create checkpoints, restore files, or run verification.
- Code mode remains the real file apply/checkpoint/rollback/verify path.

## Code Mode System

### Frontend

- `client/src/components/Workspace/CodePanel.tsx`
  - Code mode UI.
  - Files / Changes / History tabs.
  - File tree, file preview, selected file context, patch review, apply confirmation, checkpoints, restore, and verification status.
- `client/src/components/Messages/Content/CodeBar.tsx`
  - Message-level diff handoff into Code mode.
- `client/src/components/Messages/Content/FloatingCodeBar.tsx`
  - Floating diff handoff into Code mode.

### Backend

- `api/server/routes/workspace.js`
  - `GET /api/workspace/status`
  - `GET /api/workspace/tree`
  - `GET /api/workspace/file`
  - `POST /api/workspace/apply-patch`
  - `GET /api/workspace/checkpoints`
  - `POST /api/workspace/checkpoints/cleanup`
  - `DELETE /api/workspace/checkpoints/:checkpointId`
  - `POST /api/workspace/restore-checkpoint`
  - `GET /api/workspace/activity`
  - Verification helpers are also in this route file.

### Runtime Files

- `.workspace-activity.jsonl`
  - Local workspace activity log.
  - Runtime-only; should not be committed.
- `.workspace-checkpoints/`
  - Local checkpoint directory.
  - Runtime-only; should not be committed.

### Boundaries

- Code mode is the only current real file apply path.
- Checkpoint before write.
- Secret-like paths, `.env`, `.git`, `node_modules`, logs, uploads, database files, binary files, delete patches, and rename patches are blocked or constrained by safety logic.
- Do not bypass Code mode confirmation for file writes.

## Notebook / Sources System

### Frontend

- `client/src/components/Workspace/SourcesPanel.tsx`
  - Notebook/Sources UI.
  - Source list, source preview, source enable/disable, notes, source-to-note flow, and Source AI Chat.
- `client/src/components/Workspace/sourceContext.ts`
  - Source chunking, source context selection, evidence formatting, source title extraction, and source-grounding helpers.
- `client/src/store/families.ts`
  - Notebook/Sources Recoil state families and local persistence for sources, selected source, notes, note draft, and source chat messages.

### Chat Integration

- `client/src/components/Chat/Header.tsx`
  - Normal Chat header.
  - Notebook entry button.
- `client/src/components/Chat/ChatView.tsx`
  - Normal Chat surface and Notebook overlay host.

### Backend

- `api/server/routes/workspace.js`
  - `POST /api/workspace/source-chat`
    - Source-grounded chat request path.
    - Uses provided source context; does not grant Cowork or Code file mutation capability.

### Boundaries

- Notebook/Sources are knowledge/reference mode.
- Sources should use user-added/selected source content, not arbitrary filesystem scanning.
- Do not mix Notebook/Sources with Cowork file actions unless explicitly scoped.
- Notebook/Sources must not edit project files or apply patches.

## Normal Chat System

### Frontend

- `client/src/components/Chat/ChatView.tsx`
  - Normal Chat conversation surface.
- `client/src/components/Chat/Header.tsx`
  - Chat header, model selector placement, Notebook entry, and chat-level controls.
- `client/src/components/Chat/Input/`
  - Normal Chat input/composer area.
- `client/src/components/Chat/Messages/`
  - Normal Chat message rendering.

### Message Pipeline

- `client/src/hooks/Messages/useSubmitMessage.ts`
  - Normal Chat submit helper.
  - Calls the normal Chat `ask` function from `ChatContext`.
  - Cowork must not reuse this for Cowork messages unless explicitly scoped.
- `client/src/hooks/Chat/useChatHelpers.ts`
  - Normal Chat helper hook and conversation/message behavior.
- `client/src/hooks/Chat/useChatFunctions.ts`
  - Normal Chat action helpers; exact ownership should be verified before edits.
- `client/src/hooks/useNewConvo.ts`
  - Normal Chat conversation initialization, default endpoint/model/spec setup, project scoping, and new-conversation switching.

### Boundaries

- Cowork tasks must not edit normal Chat message pipeline files unless explicitly scoped.
- Cowork messages must stay out of normal Chat conversations, DB messages, and Chat history.

## Model Selection / Routing

### Main Files

- `client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx`
  - Model selector trigger and menu entrypoint in the normal Chat header.
- `client/src/components/Chat/Menus/Endpoints/ModelSelectorContext.tsx`
  - Model selector state, endpoint/model/spec selection, search, and selection handlers.
- `client/src/components/Chat/Menus/Endpoints/ModelSelectorChatContext.tsx`
  - Bridge between model selector and current normal Chat conversation state.
- `client/src/hooks/Endpoint/useEndpoints.ts`
  - Endpoint mapping for selector display and access behavior.
- `client/src/hooks/Endpoint/useSelectorEffects.ts`
  - Keeps selected model values aligned with conversation state.
- `client/src/store/families.ts`
  - Conversation selectors such as current endpoint/model/spec metadata.
- `client/src/store/endpoints.ts`
  - Endpoint config atom.

### Cowork Usage

- Cowork currently reads selected normal Chat conversation metadata as request metadata:
  - `endpoint`
  - `endpointType`
  - `model`
  - `spec`
  - `agent_id`
  - `chatProjectId`
- Cowork must treat these values as read-only model routing metadata.
- Cowork must not submit through the normal Chat message pipeline to use a model.

## Backend Workspace Routes

### Shared Backend File

- `api/server/routes/workspace.js`
  - Shared route file for:
    - Cowork chat/planner.
    - Source chat.
    - Workspace status/tree/file preview.
    - Patch apply.
    - Checkpoints and restore.
    - Activity and verification.

### Edit Guidance

- Future edits to this file must be narrowly scoped.
- Cowork changes should touch only Cowork helpers/routes unless the task explicitly spans Code mode or Sources.
- Code mode changes should not alter Cowork planner/chat behavior unless explicitly scoped.
- Sources changes should not alter Cowork or Code mode behavior unless explicitly scoped.

## Docs / Planning Files

- `CODE_MODE_HANDOFF.md`
  - Current checkpoint and handoff state for the custom workspace work.
- `COWORK_ROADMAP.md`
  - Cowork product direction, completed phases, future phases, and safety model.
- `SYSTEM_FILE_MAP.md`
  - Source of truth for system/file ownership map.

## Safety Boundaries

- Do not touch normal Chat files for Cowork tasks unless explicitly scoped.
- Do not touch Notebook/Sources for Cowork tasks unless explicitly scoped.
- Do not touch Code mode apply/checkpoint/rollback/verify behavior unless explicitly scoped.
- Do not print or commit secrets.
- Do not edit `.env`, provider config, API key config, token/password/credential files, `.git`, `node_modules`, logs, uploads, database files, or binary files.
- Do not add terminal, unrestricted tool, sandbox, autonomous apply, or external app control behavior unless explicitly scoped and safety-designed.
- If a file's responsibility is uncertain, mark it as `needs verification` before editing rather than guessing.
