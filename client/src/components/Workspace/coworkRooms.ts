import { useEffect, useMemo, useState } from "react";

export type CoworkMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  decisionAnswer?: CoworkDecisionAnswer | null;
  plannerResult?: CoworkPlannerResult | null;
  model?: CoworkMessageModel | null;
  error?: string | null;
};

export type CoworkPlannerStep = {
  title: string;
  status: "todo";
};

export type CoworkDecisionOption = {
  id: string;
  label: string;
  description: string;
};

export type CoworkDecision = {
  question: string;
  reason: string;
  impact: string;
  recommendedOptionId: string;
  options: CoworkDecisionOption[];
  allowCustomAnswer: boolean;
};

export type CoworkDecisionAnswer = {
  question: string;
  answer: string;
  optionId: string;
  optionLabel: string;
  createdAt: string;
};

export type CoworkPlannerResult = {
  intent: "plan" | "ask";
  responseMode: "plan" | "decision";
  goal: string;
  currentUnderstanding: string;
  clarifyingQuestions: string[];
  scope: string[];
  exclusions: string[];
  steps: CoworkPlannerStep[];
  inspectFiles: string[];
  suggestedFiles: string[];
  avoidFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
  codexPrompt: string;
  warnings: string[];
  decision: CoworkDecision | null;
};

export type CoworkMessageModel = {
  endpoint?: string | null;
  endpointType?: string | null;
  model?: string | null;
  spec?: string | null;
  agent_id?: string | null;
  chatProjectId?: string | null;
};

export type CoworkAssistantMessageInput = {
  content: string;
  plannerResult?: CoworkPlannerResult | null;
  model?: CoworkMessageModel | null;
  error?: string | null;
};

export type CoworkDecisionAnswerInput = {
  question: string;
  answer: string;
  optionId?: string;
  optionLabel?: string;
};

export type CoworkProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CoworkRoom = {
  id: string;
  projectId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  isPinned?: boolean;
  messages: CoworkMessage[];
};

const ROOMS_STORAGE_KEY = "librechat.cowork.rooms.v1";
const ACTIVE_ROOM_STORAGE_KEY = "librechat.cowork.activeRoomId.v1";
const PROJECTS_STORAGE_KEY = "librechat.cowork.projects.v1";
const EXPANDED_PROJECTS_STORAGE_KEY = "librechat.cowork.expandedProjectIds.v1";
const PROJECTS_VIEW_STORAGE_KEY = "librechat.cowork.projectsView.v1";
const OPEN_PROJECT_STORAGE_KEY = "librechat.cowork.openProjectId.v1";
const LEGACY_DRAFT_STORAGE_KEY = "librechat.coworkDraft.v2";
const LEGACY_HISTORY_STORAGE_KEY = "librechat.coworkPlanHistory.v1";
const LEGACY_MIGRATION_STORAGE_KEY = "librechat.cowork.legacyPlannerMigrated.v1";
const COWORK_ROOMS_EVENT = "librechat:cowork-rooms-updated";

type LegacyCoworkDraft = Partial<{
  goal: string;
  scope: string[];
  exclusions: string[];
  steps: Array<Partial<{ title: string; status: string }>>;
  inspectFiles: string[];
  suggestedFiles: string[];
  avoidFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
}>;

type LegacyCoworkHistoryItem = {
  id: string;
  createdAt: string;
  title: string;
  draft: LegacyCoworkDraft;
  plannerPreview: null;
  plannerWarnings: string[];
  isPlannerAccepted: boolean;
};

type CoworkState = {
  rooms: CoworkRoom[];
  projects: CoworkProject[];
  expandedProjectIds: string[];
  activeRoomId: string;
  isProjectsViewOpen: boolean;
  openProjectId: string;
};

function canUseStorage() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function createCoworkId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isObjectRecord(value: unknown): value is { [key: string]: unknown } {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function getLegacyString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getLegacyStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => getString(item))
        .filter((item) => item.length > 0)
    : [];
}

function hasCoworkMojibake(value = "") {
  return /[\u0080-\u009F]|เน(?:\u20AC|\u0081|\u0084|\u0088|\u0089)|เธ[กขคงจฉชซดตถทธนบปผฝพฟภมยรลวศษสหอฮ]/.test(
    value,
  );
}

function getReadablePlannerText(value: string, fallback: string) {
  return hasCoworkMojibake(value) ? fallback : value;
}

function getReadablePlannerList(value: unknown, fallback: string[] = []) {
  const items = getStringArray(value).filter((item) => !hasCoworkMojibake(item));
  return items.length > 0 ? items : fallback;
}

function normalizeLegacyDraft(value: unknown): LegacyCoworkDraft | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const steps = Array.isArray(value.steps)
    ? value.steps
        .filter(isObjectRecord)
        .map((step) => ({
          title: getLegacyString(step.title),
          status: getLegacyString(step.status) || "todo",
        }))
        .filter((step) => step.title)
    : [];

  return {
    goal: getLegacyString(value.goal),
    scope: getLegacyStringArray(value.scope),
    exclusions: getLegacyStringArray(value.exclusions),
    steps,
    inspectFiles: getLegacyStringArray(value.inspectFiles),
    suggestedFiles: getLegacyStringArray(value.suggestedFiles),
    avoidFiles: getLegacyStringArray(value.avoidFiles),
    risks: getLegacyStringArray(value.risks),
    verification: getLegacyStringArray(value.verification),
    nextAction: getLegacyString(value.nextAction),
  };
}

function hasLegacyDraftContent(draft: LegacyCoworkDraft) {
  return Boolean(
    draft.goal ||
      draft.scope?.length ||
      draft.exclusions?.length ||
      draft.steps?.some((step) => step.title) ||
      draft.inspectFiles?.length ||
      draft.suggestedFiles?.length ||
      draft.risks?.length ||
      draft.verification?.length ||
      draft.nextAction,
  );
}

function createLegacyHistoryItem(draft: LegacyCoworkDraft): LegacyCoworkHistoryItem {
  const createdAt = new Date().toISOString();
  const title = (draft.goal || draft.nextAction || "Legacy Cowork plan").slice(0, 120);

  return {
    id: createCoworkId("cowork-legacy-plan"),
    createdAt,
    title,
    draft,
    plannerPreview: null,
    plannerWarnings: [],
    isPlannerAccepted: false,
  };
}

function normalizePlannerSteps(value: unknown): CoworkPlannerStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObjectRecord)
    .map((step) => ({
      title: getString(step.title),
      status: "todo" as const,
    }))
    .filter((step) => step.title.length > 0);
}

function normalizeDecision(value: unknown): CoworkDecision | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const options = Array.isArray(value.options)
    ? value.options
        .filter(isObjectRecord)
        .map((option, index) => ({
          id: getString(option.id) || `option-${index + 1}`,
          label: getString(option.label),
          description: getString(option.description),
        }))
        .filter((option) => option.label.length > 0 && option.description.length > 0)
        .slice(0, 4)
    : [];

  const recommendedOptionId = getString(value.recommendedOptionId);
  const validRecommendedOptionId = options.some((option) => option.id === recommendedOptionId)
    ? recommendedOptionId
    : "";

  const decision: CoworkDecision = {
    question: getString(value.question),
    reason: getString(value.reason),
    impact: getString(value.impact),
    recommendedOptionId: validRecommendedOptionId,
    options,
    allowCustomAnswer: value.allowCustomAnswer !== false,
  };

  if (!decision.question || options.length === 0) {
    return null;
  }

  return decision;
}

function normalizePlannerResult(value: unknown): CoworkPlannerResult | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const goal = getReadablePlannerText(getString(value.goal), "งาน Cowork");
  const currentUnderstanding = getString(value.currentUnderstanding);
  const nextAction = getString(value.nextAction);
  const normalizedSteps = normalizePlannerSteps(value.steps).filter(
    (step) => !hasCoworkMojibake(step.title),
  );
  const rawDecision = normalizeDecision(value.decision);
  const decision =
    rawDecision &&
    !hasCoworkMojibake(
      [
        rawDecision.question,
        rawDecision.reason,
        rawDecision.impact,
        ...rawDecision.options.flatMap((option) => [option.label, option.description]),
      ].join(" "),
    )
      ? rawDecision
      : null;
  const hasUnreadablePlannerText =
    hasCoworkMojibake(currentUnderstanding) ||
    hasCoworkMojibake(nextAction) ||
    getStringArray(value.clarifyingQuestions).some(hasCoworkMojibake) ||
    getStringArray(value.scope).some(hasCoworkMojibake);

  return {
    intent: value.intent === "ask" ? "ask" : "plan",
    responseMode: value.responseMode === "decision" && decision ? "decision" : "plan",
    goal,
    currentUnderstanding: getReadablePlannerText(
      currentUnderstanding,
      `ผลลัพธ์แผนเดิมอ่านไม่ได้เพราะ encoding เสีย ให้ส่ง /plan ใหม่สำหรับ ${goal} เพื่อสร้างแผนที่อ่านได้.`,
    ),
    clarifyingQuestions: getReadablePlannerList(
      value.clarifyingQuestions,
      hasUnreadablePlannerText ? ["ส่ง /plan ใหม่อีกครั้งเพื่อสร้างแผนที่อ่านได้"] : [],
    ),
    scope: getReadablePlannerList(value.scope),
    exclusions: getReadablePlannerList(value.exclusions),
    steps: normalizedSteps,
    inspectFiles: getReadablePlannerList(value.inspectFiles),
    suggestedFiles: getReadablePlannerList(value.suggestedFiles),
    avoidFiles: getReadablePlannerList(value.avoidFiles),
    risks: getReadablePlannerList(value.risks),
    verification: getReadablePlannerList(value.verification),
    nextAction: getReadablePlannerText(
      nextAction,
      "ส่ง /plan ใหม่อีกครั้งเพื่อสร้างแผนที่อ่านได้.",
    ),
    codexPrompt: getReadablePlannerText(getString(value.codexPrompt), ""),
    warnings: getReadablePlannerList(value.warnings),
    decision,
  };
}

function normalizeDecisionAnswer(value: unknown): CoworkDecisionAnswer | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const question = getString(value.question);
  const answer = getString(value.answer);
  const createdAt = getString(value.createdAt);

  if (!question || !answer || !createdAt) {
    return null;
  }

  return {
    question,
    answer,
    optionId: getString(value.optionId),
    optionLabel: getString(value.optionLabel),
    createdAt,
  };
}

function normalizeMessageModel(value: unknown): CoworkMessageModel | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  return {
    endpoint: getString(value.endpoint) || null,
    endpointType: getString(value.endpointType) || null,
    model: getString(value.model) || null,
    spec: getString(value.spec) || null,
    agent_id: getString(value.agent_id) || null,
    chatProjectId: getString(value.chatProjectId) || null,
  };
}

function normalizeMessage(message: unknown): CoworkMessage | null {
  if (message == null || typeof message !== "object") {
    return null;
  }

  const candidate = message as Partial<CoworkMessage>;
  if (
    typeof candidate.id !== "string" ||
    (candidate.role !== "user" && candidate.role !== "assistant") ||
    typeof candidate.content !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  const normalizedMessage: CoworkMessage = {
    id: candidate.id,
    role: candidate.role,
    content: candidate.content,
    createdAt: candidate.createdAt,
  };

  if (candidate.role === "assistant") {
    normalizedMessage.decisionAnswer = normalizeDecisionAnswer(candidate.decisionAnswer);
    normalizedMessage.plannerResult = normalizePlannerResult(candidate.plannerResult);
    normalizedMessage.model = normalizeMessageModel(candidate.model);
    normalizedMessage.error = getString(candidate.error) || null;
  }

  return normalizedMessage;
}

function normalizeProject(project: unknown): CoworkProject | null {
  if (project == null || typeof project !== "object") {
    return null;
  }

  const candidate = project as Partial<CoworkProject>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: candidate.title,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

function normalizeRoom(room: unknown): CoworkRoom | null {
  if (room == null || typeof room !== "object") {
    return null;
  }

  const candidate = room as Partial<CoworkRoom> & { messages?: unknown[] };
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    !Array.isArray(candidate.messages)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    projectId:
      typeof candidate.projectId === "string" ? candidate.projectId : null,
    title: candidate.title,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    archivedAt:
      typeof candidate.archivedAt === "string" ? candidate.archivedAt : null,
    isPinned: candidate.isPinned === true,
    messages: candidate.messages
      .map((message) => normalizeMessage(message))
      .filter((message): message is CoworkMessage => message != null),
  };
}

function readJsonArray(storageKey: string): unknown[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function migrateLegacyPlannerDraft() {
  if (!canUseStorage()) {
    return;
  }

  try {
    if (window.localStorage.getItem(LEGACY_MIGRATION_STORAGE_KEY) === "true") {
      return;
    }

    const storedDraft = window.localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY);
    if (storedDraft) {
      const draft = normalizeLegacyDraft(JSON.parse(storedDraft));
      if (draft && hasLegacyDraftContent(draft)) {
        const storedHistory = window.localStorage.getItem(LEGACY_HISTORY_STORAGE_KEY);
        const parsedHistory = storedHistory ? JSON.parse(storedHistory) : [];
        const historyItems = Array.isArray(parsedHistory) ? parsedHistory : [];
        const nextHistory = [createLegacyHistoryItem(draft), ...historyItems].slice(0, 20);
        window.localStorage.setItem(LEGACY_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
      }
    }

    window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    window.localStorage.setItem(LEGACY_MIGRATION_STORAGE_KEY, "true");
  } catch {
    window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    window.localStorage.setItem(LEGACY_MIGRATION_STORAGE_KEY, "true");
  }
}

function readRooms(): CoworkRoom[] {
  return readJsonArray(ROOMS_STORAGE_KEY)
    .map((room) => normalizeRoom(room))
    .filter((room): room is CoworkRoom => room != null);
}

function readProjects(): CoworkProject[] {
  return readJsonArray(PROJECTS_STORAGE_KEY)
    .map((project) => normalizeProject(project))
    .filter((project): project is CoworkProject => project != null);
}

function readExpandedProjectIds(): string[] {
  return readJsonArray(EXPANDED_PROJECTS_STORAGE_KEY).filter(
    (projectId): projectId is string => typeof projectId === "string",
  );
}

function readActiveRoomId() {
  if (!canUseStorage()) {
    return "";
  }

  return window.localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY) ?? "";
}

function readProjectsViewOpen() {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(PROJECTS_VIEW_STORAGE_KEY) === "true";
}

function readOpenProjectId() {
  if (!canUseStorage()) {
    return "";
  }

  return window.localStorage.getItem(OPEN_PROJECT_STORAGE_KEY) ?? "";
}

function notifyRoomsChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(COWORK_ROOMS_EVENT));
}

function createRoomTitle(roomCount: number) {
  return `Cowork room ${roomCount + 1}`;
}

function createProjectTitle(projectCount: number) {
  return projectCount === 0 ? "New project" : `New project ${projectCount + 1}`;
}

function updateProjectTimestamp(projects: CoworkProject[], projectId: string) {
  const now = new Date().toISOString();
  return projects.map((project) =>
    project.id === projectId ? { ...project, updatedAt: now } : project,
  );
}

function normalizeStringIds(ids: string[]) {
  return Array.from(new Set(ids.filter((id) => typeof id === "string" && id)));
}

function normalizeCoworkState(state: CoworkState): CoworkState {
  const projectIds = new Set(state.projects.map((project) => project.id));
  const rooms = state.rooms.map((room) => ({
    ...room,
    projectId: room.projectId && projectIds.has(room.projectId) ? room.projectId : null,
    archivedAt: room.archivedAt ?? null,
    isPinned: room.isPinned === true,
  }));
  const expandedProjectIds = normalizeStringIds(state.expandedProjectIds).filter((projectId) =>
    projectIds.has(projectId),
  );
  const activeRoom = rooms.find((room) => room.id === state.activeRoomId && !room.archivedAt);
  const openProjectId =
    state.openProjectId && projectIds.has(state.openProjectId) ? state.openProjectId : "";

  return {
    rooms,
    projects: state.projects,
    expandedProjectIds,
    activeRoomId: activeRoom?.id ?? "",
    isProjectsViewOpen: state.isProjectsViewOpen,
    openProjectId,
  };
}

function readCoworkState(): CoworkState {
  migrateLegacyPlannerDraft();

  return normalizeCoworkState({
    rooms: readRooms(),
    projects: readProjects(),
    expandedProjectIds: readExpandedProjectIds(),
    activeRoomId: readActiveRoomId(),
    isProjectsViewOpen: readProjectsViewOpen(),
    openProjectId: readOpenProjectId(),
  });
}

function setStorageValue(storageKey: string, value: string) {
  if (value) {
    window.localStorage.setItem(storageKey, value);
  } else {
    window.localStorage.removeItem(storageKey);
  }
}

function persistCoworkState(state: CoworkState) {
  const nextState = normalizeCoworkState(state);
  if (!canUseStorage()) {
    return nextState;
  }

  window.localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(nextState.rooms));
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(nextState.projects));
  window.localStorage.setItem(
    EXPANDED_PROJECTS_STORAGE_KEY,
    JSON.stringify(nextState.expandedProjectIds),
  );
  setStorageValue(ACTIVE_ROOM_STORAGE_KEY, nextState.activeRoomId);
  setStorageValue(PROJECTS_VIEW_STORAGE_KEY, nextState.isProjectsViewOpen ? "true" : "");
  setStorageValue(OPEN_PROJECT_STORAGE_KEY, nextState.openProjectId);
  notifyRoomsChanged();

  return nextState;
}

function updateCoworkState(updater: (state: CoworkState) => CoworkState) {
  return persistCoworkState(updater(readCoworkState()));
}

export function useCoworkRooms() {
  const [state, setState] = useState<CoworkState>(() => readCoworkState());

  useEffect(() => {
    const syncRooms = () => {
      setState(readCoworkState());
    };

    window.addEventListener(COWORK_ROOMS_EVENT, syncRooms);
    window.addEventListener("storage", syncRooms);
    syncRooms();

    return () => {
      window.removeEventListener(COWORK_ROOMS_EVENT, syncRooms);
      window.removeEventListener("storage", syncRooms);
    };
  }, []);

  const {
    activeRoomId,
    expandedProjectIds,
    isProjectsViewOpen,
    openProjectId,
    projects,
    rooms,
  } = state;

  const activeRoom = useMemo(() => {
    return (
      rooms.find((room) => room.id === activeRoomId && !room.archivedAt) ?? null
    );
  }, [activeRoomId, rooms]);

  const commitCoworkState = (updater: (state: CoworkState) => CoworkState) => {
    setState(updateCoworkState(updater));
  };

  const createProject = () => {
    commitCoworkState((currentState) => {
      const now = new Date().toISOString();
      const nextProject: CoworkProject = {
        id: createCoworkId("cowork-project"),
        title: createProjectTitle(currentState.projects.length),
        createdAt: now,
        updatedAt: now,
      };

      return {
        ...currentState,
        projects: [nextProject, ...currentState.projects],
        expandedProjectIds: [...currentState.expandedProjectIds, nextProject.id],
        isProjectsViewOpen: true,
        openProjectId: nextProject.id,
      };
    });
  };

  const createRoom = (projectId: string | null = null) => {
    commitCoworkState((currentState) => {
      const hasProject =
        projectId != null && currentState.projects.some((project) => project.id === projectId);
      const targetProjectId = hasProject ? projectId : null;
      const targetRoomCount = currentState.rooms.filter((room) =>
        targetProjectId ? room.projectId === targetProjectId : !room.projectId,
      ).length;
      const now = new Date().toISOString();
      const nextRoom: CoworkRoom = {
        id: createCoworkId("cowork-room"),
        projectId: targetProjectId,
        title: createRoomTitle(targetRoomCount),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        isPinned: false,
        messages: [],
      };

      return {
        ...currentState,
        rooms: [nextRoom, ...currentState.rooms],
        projects: targetProjectId
          ? updateProjectTimestamp(currentState.projects, targetProjectId)
          : currentState.projects,
        expandedProjectIds: targetProjectId
          ? [...currentState.expandedProjectIds, targetProjectId]
          : currentState.expandedProjectIds,
        activeRoomId: nextRoom.id,
        isProjectsViewOpen: false,
        openProjectId: "",
      };
    });
  };

  const selectRoom = (roomId: string) => {
    commitCoworkState((currentState) => {
      const targetRoom = currentState.rooms.find((room) => room.id === roomId && !room.archivedAt);
      return {
        ...currentState,
        activeRoomId: targetRoom?.id ?? currentState.activeRoomId,
        isProjectsViewOpen: false,
        openProjectId: "",
      };
    });
  };

  const openProjectsView = (projectId = "") => {
    commitCoworkState((currentState) => {
      const targetProjectId = currentState.projects.some((project) => project.id === projectId)
        ? projectId
        : "";
      return {
        ...currentState,
        activeRoomId: "",
        isProjectsViewOpen: true,
        openProjectId: targetProjectId,
      };
    });
  };

  const toggleProject = (projectId: string) => {
    commitCoworkState((currentState) => {
      const hasProject = currentState.projects.some((project) => project.id === projectId);
      if (!hasProject) {
        return currentState;
      }

      const isExpanded = currentState.expandedProjectIds.includes(projectId);
      return {
        ...currentState,
        expandedProjectIds: isExpanded
          ? currentState.expandedProjectIds.filter((expandedId) => expandedId !== projectId)
          : [...currentState.expandedProjectIds, projectId],
      };
    });
  };

  const addMessage = (roomId: string, content: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    const now = new Date().toISOString();
    const nextMessage: CoworkMessage = {
      id: createCoworkId("cowork-message"),
      role: "user",
      content: trimmedContent,
      createdAt: now,
    };

    commitCoworkState((currentState) => {
      let updatedProjectId = "";
      let didUpdate = false;
      const nextRooms = currentState.rooms.map((room) => {
        if (room.id !== roomId || room.archivedAt) {
          return room;
        }

        didUpdate = true;
        updatedProjectId = room.projectId ?? "";
        return {
          ...room,
          updatedAt: now,
          messages: [...room.messages, nextMessage],
        };
      });

      if (!didUpdate) {
        return currentState;
      }

      return {
        ...currentState,
        rooms: nextRooms,
        projects: updatedProjectId
          ? updateProjectTimestamp(currentState.projects, updatedProjectId)
          : currentState.projects,
        activeRoomId: roomId,
        isProjectsViewOpen: false,
        openProjectId: "",
      };
    });
  };

  const addAssistantMessage = (roomId: string, message: CoworkAssistantMessageInput) => {
    const trimmedContent = message.content.trim();
    const error = message.error?.trim() ?? "";
    if (!trimmedContent && !message.plannerResult && !error) {
      return;
    }

    const now = new Date().toISOString();
    const nextMessage: CoworkMessage = {
      id: createCoworkId("cowork-message"),
      role: "assistant",
      content: trimmedContent,
      createdAt: now,
      plannerResult: message.plannerResult ?? null,
      model: message.model ?? null,
      error: error || null,
    };

    commitCoworkState((currentState) => {
      let updatedProjectId = "";
      let didUpdate = false;
      const nextRooms = currentState.rooms.map((room) => {
        if (room.id !== roomId || room.archivedAt) {
          return room;
        }

        didUpdate = true;
        updatedProjectId = room.projectId ?? "";
        return {
          ...room,
          updatedAt: now,
          messages: [...room.messages, nextMessage],
        };
      });

      if (!didUpdate) {
        return currentState;
      }

      return {
        ...currentState,
        rooms: nextRooms,
        projects: updatedProjectId
          ? updateProjectTimestamp(currentState.projects, updatedProjectId)
          : currentState.projects,
      };
    });
  };

  const answerDecisionMessage = (
    roomId: string,
    messageId: string,
    answer: CoworkDecisionAnswerInput,
  ) => {
    const now = new Date().toISOString();
    const trimmedAnswer = answer.answer.trim();
    const trimmedQuestion = answer.question.trim();

    if (!trimmedAnswer || !trimmedQuestion) {
      return;
    }

    commitCoworkState((currentState) => {
      let didUpdate = false;
      const nextRooms = currentState.rooms.map((room) => {
        if (room.id !== roomId || room.archivedAt) {
          return room;
        }

        const nextMessages = room.messages.map((message) => {
          if (message.id !== messageId || message.role !== "assistant") {
            return message;
          }

          didUpdate = true;
          return {
            ...message,
            decisionAnswer: {
              question: trimmedQuestion,
              answer: trimmedAnswer,
              optionId: answer.optionId?.trim() ?? "",
              optionLabel: answer.optionLabel?.trim() ?? "",
              createdAt: now,
            },
          };
        });

        return didUpdate
          ? {
              ...room,
              updatedAt: now,
              messages: nextMessages,
            }
          : room;
      });

      if (!didUpdate) {
        return currentState;
      }

      return {
        ...currentState,
        rooms: nextRooms,
      };
    });
  };

  const renameRoom = (roomId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    commitCoworkState((currentState) => ({
      ...currentState,
      rooms: currentState.rooms.map((room) =>
        room.id === roomId ? { ...room, title: trimmedTitle } : room,
      ),
    }));
  };

  const deleteRoom = (roomId: string) => {
    commitCoworkState((currentState) => ({
      ...currentState,
      rooms: currentState.rooms.filter((room) => room.id !== roomId),
      activeRoomId: currentState.activeRoomId === roomId ? "" : currentState.activeRoomId,
    }));
  };

  const duplicateRoom = (roomId: string) => {
    commitCoworkState((currentState) => {
      const sourceRoom = currentState.rooms.find((room) => room.id === roomId);
      if (!sourceRoom) {
        return currentState;
      }

      const now = new Date().toISOString();
      const nextRoom: CoworkRoom = {
        ...sourceRoom,
        id: createCoworkId("cowork-room"),
        title: `${sourceRoom.title || "Untitled"} copy`,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        isPinned: false,
        messages: sourceRoom.messages.map((message) => ({
          ...message,
          id: createCoworkId("cowork-message"),
        })),
      };

      return {
        ...currentState,
        rooms: [nextRoom, ...currentState.rooms],
        projects: nextRoom.projectId
          ? updateProjectTimestamp(currentState.projects, nextRoom.projectId)
          : currentState.projects,
        expandedProjectIds: nextRoom.projectId
          ? [...currentState.expandedProjectIds, nextRoom.projectId]
          : currentState.expandedProjectIds,
        activeRoomId: nextRoom.id,
        isProjectsViewOpen: false,
        openProjectId: "",
      };
    });
  };

  const togglePinRoom = (roomId: string) => {
    commitCoworkState((currentState) => ({
      ...currentState,
      rooms: currentState.rooms.map((room) =>
        room.id === roomId ? { ...room, isPinned: !room.isPinned } : room,
      ),
    }));
  };

  const archiveRoom = (roomId: string) => {
    const now = new Date().toISOString();
    commitCoworkState((currentState) => ({
      ...currentState,
      rooms: currentState.rooms.map((room) =>
        room.id === roomId ? { ...room, archivedAt: now, updatedAt: now } : room,
      ),
      activeRoomId: currentState.activeRoomId === roomId ? "" : currentState.activeRoomId,
    }));
  };

  const restoreRoom = (roomId: string) => {
    const now = new Date().toISOString();
    commitCoworkState((currentState) => ({
      ...currentState,
      rooms: currentState.rooms.map((room) =>
        room.id === roomId ? { ...room, archivedAt: null, updatedAt: now } : room,
      ),
    }));
  };

  const moveRoomToProject = (roomId: string, projectId: string | null) => {
    const now = new Date().toISOString();
    commitCoworkState((currentState) => {
      const targetProjectId =
        projectId && currentState.projects.some((project) => project.id === projectId)
          ? projectId
          : null;
      const sourceRoom = currentState.rooms.find((room) => room.id === roomId);
      if (!sourceRoom) {
        return currentState;
      }

      const projectIdsToTouch = [sourceRoom.projectId, targetProjectId].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      );

      return {
        ...currentState,
        rooms: currentState.rooms.map((room) =>
          room.id === roomId ? { ...room, projectId: targetProjectId, updatedAt: now } : room,
        ),
        projects: projectIdsToTouch.reduce(
          (nextProjects, nextProjectId) => updateProjectTimestamp(nextProjects, nextProjectId),
          currentState.projects,
        ),
        expandedProjectIds: targetProjectId
          ? [...currentState.expandedProjectIds, targetProjectId]
          : currentState.expandedProjectIds,
      };
    });
  };

  const renameProject = (projectId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    commitCoworkState((currentState) => {
      const now = new Date().toISOString();
      return {
        ...currentState,
        projects: currentState.projects.map((project) =>
        project.id === projectId
          ? { ...project, title: trimmedTitle, updatedAt: now }
          : project,
        ),
      };
    });
  };

  const deleteProject = (projectId: string) => {
    const now = new Date().toISOString();
    commitCoworkState((currentState) => ({
      ...currentState,
      projects: currentState.projects.filter((project) => project.id !== projectId),
      rooms: currentState.rooms.map((room) =>
        room.projectId === projectId
          ? { ...room, projectId: null, updatedAt: now }
          : room,
      ),
      expandedProjectIds: currentState.expandedProjectIds.filter(
        (expandedId) => expandedId !== projectId,
      ),
      isProjectsViewOpen:
        currentState.openProjectId === projectId ? false : currentState.isProjectsViewOpen,
      openProjectId: currentState.openProjectId === projectId ? "" : currentState.openProjectId,
    }));
  };

  return {
    rooms,
    projects,
    activeRoom,
    activeRoomId,
    answerDecisionMessage,
    addAssistantMessage,
    expandedProjectIds,
    isProjectsViewOpen,
    openProjectId,
    addMessage,
    archiveRoom,
    createProject,
    createRoom,
    deleteProject,
    deleteRoom,
    duplicateRoom,
    moveRoomToProject,
    openProjectsView,
    renameProject,
    renameRoom,
    restoreRoom,
    selectRoom,
    togglePinRoom,
    toggleProject,
  };
}
