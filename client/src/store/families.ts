import { useEffect } from "react";
import { createSearchParams } from "react-router-dom";
import {
  LocalStorageKeys,
  isEphemeralAgentId,
  Constants,
} from "librechat-data-provider";
import {
  atom,
  selector,
  atomFamily,
  DefaultValue,
  selectorFamily,
  useRecoilValue,
  useSetRecoilState,
  useRecoilCallback,
} from "recoil";
import type {
  EModelEndpoint,
  TCodeContext,
  TConversation,
  TSubmission,
  TPreset,
} from "librechat-data-provider";
import type { AtomEffect } from "recoil";
import type { TOptionSettings, ExtendedFile } from "~/common";
import {
  clearModelForNonEphemeralAgent,
  createChatSearchParams,
  storeEndpointSettings,
  logger,
} from "~/utils";
import { useSetConvoContext } from "~/Providers/SetConvoContext";

export type CoworkCodeHandoff = {
  id: string;
  createdAt: string;
  goal: string;
  scope: string[];
  exclusions: string[];
  steps: Array<{
    title: string;
    status: string;
  }>;
  inspectFiles: string[];
  suggestedFiles: string[];
  avoidFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
  summary: string;
};

export type WorkspaceSourceType = "text" | "markdown";
export type WorkspaceSourceStatus =
  "ready" | "too_large" | "blocked" | "unsupported" | "parse_error";

export type WorkspaceSourceChunkKind =
  "heading" | "paragraph" | "table" | "text";

export type WorkspaceSourceChunk = {
  id: string;
  sourceId: string;
  index: number;
  heading?: string;
  content: string;
  kind: WorkspaceSourceChunkKind;
  startOffset: number;
  endOffset: number;
  sizeBytes: number;
  tokenEstimate: number;
};

export type WorkspaceSourceEvidence = {
  sourceId: string;
  sourceTitle: string;
  chunkId: string;
  chunkIndex: number;
  chunkHeading?: string;
  chunkKind: WorkspaceSourceChunkKind;
  tokenEstimate?: number;
  score?: number;
  snippet: string;
  wasFallback?: boolean;
};

export type WorkspaceSourceContextStats = {
  chunkCount: number;
  sourceCount: number;
  truncated: boolean;
  fallback: boolean;
};

export type WorkspaceNotebookSource = {
  id: string;
  title: string;
  type: WorkspaceSourceType;
  content: string;
  sizeBytes: number;
  chunks?: WorkspaceSourceChunk[];
  enabled: boolean;
  baseStatus: WorkspaceSourceStatus;
  addedAt: string;
  origin?: "note";
};

export type WorkspaceNotebookNote = {
  id: string;
  content: string;
  addedAt: string;
};

export type WorkspaceSourceChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sourceTitles?: string[];
  contextSummary?: string;
  contextStats?: WorkspaceSourceContextStats;
  evidence?: WorkspaceSourceEvidence[];
  warning?: string;
  error?: boolean;
};

type WorkspaceNotebookStoragePayload = {
  version: 1;
  updatedAt: string;
  sources?: WorkspaceNotebookSource[];
  selectedSourceId?: string | null;
  notes?: WorkspaceNotebookNote[];
  noteDraft?: string;
};

const workspaceNotebookStoragePrefix = "workspaceNotebook:v1:";

const workspaceSourceTypes = new Set<WorkspaceSourceType>(["text", "markdown"]);
const workspaceSourceStatuses = new Set<WorkspaceSourceStatus>([
  "ready",
  "too_large",
  "blocked",
  "unsupported",
  "parse_error",
]);
const workspaceSourceChunkKinds = new Set<WorkspaceSourceChunkKind>([
  "heading",
  "paragraph",
  "table",
  "text",
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const getNotebookStorageKey = (conversationId: string) =>
  `${workspaceNotebookStoragePrefix}${conversationId}`;

const getStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
};

const getStringField = (record: Record<string, unknown>, field: string) =>
  typeof record[field] === "string" ? record[field] : null;

const sanitizeNotebookChunk = (
  value: unknown,
): WorkspaceSourceChunk | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  const id = getStringField(value, "id");
  const sourceId = getStringField(value, "sourceId");
  const content = getStringField(value, "content");
  const kind = value.kind;
  const index = value.index;
  const startOffset = value.startOffset;
  const endOffset = value.endOffset;
  const sizeBytes = value.sizeBytes;
  const tokenEstimate = value.tokenEstimate;

  if (
    !id ||
    !sourceId ||
    content == null ||
    typeof kind !== "string" ||
    !workspaceSourceChunkKinds.has(kind as WorkspaceSourceChunkKind) ||
    typeof index !== "number" ||
    typeof startOffset !== "number" ||
    typeof endOffset !== "number" ||
    typeof sizeBytes !== "number" ||
    typeof tokenEstimate !== "number"
  ) {
    return null;
  }

  const heading = getStringField(value, "heading") ?? undefined;
  return {
    id,
    sourceId,
    index,
    heading,
    content,
    kind: kind as WorkspaceSourceChunkKind,
    startOffset,
    endOffset,
    sizeBytes,
    tokenEstimate,
  };
};

const sanitizeNotebookSource = (
  value: unknown,
): WorkspaceNotebookSource | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  const id = getStringField(value, "id");
  const title = getStringField(value, "title");
  const addedAt = getStringField(value, "addedAt");
  const type = value.type;
  const baseStatus = value.baseStatus;
  const sizeBytes = value.sizeBytes;

  if (
    !id ||
    !title ||
    !addedAt ||
    typeof type !== "string" ||
    !workspaceSourceTypes.has(type as WorkspaceSourceType) ||
    typeof baseStatus !== "string" ||
    !workspaceSourceStatuses.has(baseStatus as WorkspaceSourceStatus) ||
    typeof sizeBytes !== "number"
  ) {
    return null;
  }

  const sourceStatus = baseStatus as WorkspaceSourceStatus;
  const content =
    sourceStatus === "ready" ? getStringField(value, "content") ?? "" : "";
  const chunks =
    sourceStatus === "ready" && Array.isArray(value.chunks)
      ? value.chunks
          .map((chunk) => sanitizeNotebookChunk(chunk))
          .filter((chunk): chunk is WorkspaceSourceChunk => chunk != null)
      : [];
  const origin = value.origin === "note" ? "note" : undefined;

  return {
    id,
    title,
    type: type as WorkspaceSourceType,
    content,
    sizeBytes,
    chunks,
    enabled: sourceStatus === "ready" && value.enabled === true,
    baseStatus: sourceStatus,
    addedAt,
    origin,
  };
};

const sanitizeNotebookNote = (value: unknown): WorkspaceNotebookNote | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  const id = getStringField(value, "id");
  const content = getStringField(value, "content");
  const addedAt = getStringField(value, "addedAt");

  if (!id || content == null || !addedAt) {
    return null;
  }

  return { id, content, addedAt };
};

const sanitizeNotebookPayload = (
  value: unknown,
): WorkspaceNotebookStoragePayload | null => {
  if (!isPlainRecord(value) || value.version !== 1) {
    return null;
  }

  const updatedAt = getStringField(value, "updatedAt");
  if (!updatedAt) {
    return null;
  }

  return {
    version: 1,
    updatedAt,
    sources: Array.isArray(value.sources)
      ? value.sources
          .map((source) => sanitizeNotebookSource(source))
          .filter(
            (source): source is WorkspaceNotebookSource => source != null,
          )
      : undefined,
    selectedSourceId:
      typeof value.selectedSourceId === "string" ||
      value.selectedSourceId === null
        ? value.selectedSourceId
        : undefined,
    notes: Array.isArray(value.notes)
      ? value.notes
          .map((note) => sanitizeNotebookNote(note))
          .filter((note): note is WorkspaceNotebookNote => note != null)
      : undefined,
    noteDraft: typeof value.noteDraft === "string" ? value.noteDraft : undefined,
  };
};

const readNotebookPayload = (
  conversationId: string,
): WorkspaceNotebookStoragePayload | null => {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getNotebookStorageKey(conversationId));
    return raw ? sanitizeNotebookPayload(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

const isNotebookPayloadEmpty = (payload: WorkspaceNotebookStoragePayload) =>
  (payload.sources?.length ?? 0) === 0 &&
  payload.selectedSourceId == null &&
  (payload.notes?.length ?? 0) === 0 &&
  !payload.noteDraft?.trim();

const writeNotebookPayload = (
  conversationId: string,
  payload: WorkspaceNotebookStoragePayload,
) => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    const key = getNotebookStorageKey(conversationId);
    if (isNotebookPayloadEmpty(payload)) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/availability errors; Notebook still works in memory.
  }
};

const updateNotebookPayload = (
  conversationId: string,
  update: (
    payload: WorkspaceNotebookStoragePayload,
  ) => WorkspaceNotebookStoragePayload,
) => {
  const current = readNotebookPayload(conversationId) ?? {
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  writeNotebookPayload(conversationId, {
    ...update(current),
    version: 1,
    updatedAt: new Date().toISOString(),
  });
};

const notebookSourcesPersistenceEffect = (
  conversationId: string,
): AtomEffect<WorkspaceNotebookSource[]> => {
  return ({ setSelf, onSet }) => {
    const storedSources = readNotebookPayload(conversationId)?.sources;
    if (storedSources && storedSources.length > 0) {
      setSelf(storedSources);
    }

    onSet((newValue) => {
      updateNotebookPayload(conversationId, (payload) => ({
        ...payload,
        sources:
          newValue instanceof DefaultValue
            ? []
            : newValue
                .map((source) => sanitizeNotebookSource(source))
                .filter(
                  (source): source is WorkspaceNotebookSource =>
                    source != null,
                ),
      }));
    });
  };
};

const notebookSelectedSourcePersistenceEffect = (
  conversationId: string,
): AtomEffect<string | null> => {
  return ({ setSelf, onSet }) => {
    const storedSelectedSourceId =
      readNotebookPayload(conversationId)?.selectedSourceId;
    if (storedSelectedSourceId !== undefined) {
      setSelf(storedSelectedSourceId);
    }

    onSet((newValue) => {
      updateNotebookPayload(conversationId, (payload) => ({
        ...payload,
        selectedSourceId: newValue instanceof DefaultValue ? null : newValue,
      }));
    });
  };
};

const notebookNotesPersistenceEffect = (
  conversationId: string,
): AtomEffect<WorkspaceNotebookNote[]> => {
  return ({ setSelf, onSet }) => {
    const storedNotes = readNotebookPayload(conversationId)?.notes;
    if (storedNotes && storedNotes.length > 0) {
      setSelf(storedNotes);
    }

    onSet((newValue) => {
      updateNotebookPayload(conversationId, (payload) => ({
        ...payload,
        notes:
          newValue instanceof DefaultValue
            ? []
            : newValue
                .map((note) => sanitizeNotebookNote(note))
                .filter((note): note is WorkspaceNotebookNote => note != null),
      }));
    });
  };
};

const notebookNoteDraftPersistenceEffect = (
  conversationId: string,
): AtomEffect<string> => {
  return ({ setSelf, onSet }) => {
    const storedNoteDraft = readNotebookPayload(conversationId)?.noteDraft;
    if (storedNoteDraft) {
      setSelf(storedNoteDraft);
    }

    onSet((newValue) => {
      updateNotebookPayload(conversationId, (payload) => ({
        ...payload,
        noteDraft: newValue instanceof DefaultValue ? "" : newValue,
      }));
    });
  };
};

const submissionKeysAtom = atom<(string | number)[]>({
  key: "submissionKeys",
  default: [],
});

const submissionByIndex = atomFamily<TSubmission | null, string | number>({
  key: "submissionByIndex",
  default: null,
});

const submissionKeysSelector = selector<(string | number)[]>({
  key: "submissionKeysSelector",
  get: ({ get }) => {
    const keys = get(conversationKeysAtom);
    return keys.filter((key) => get(submissionByIndex(key)) !== null);
  },
  set: ({ set }, newKeys) => {
    logger.log("setting submissionKeysAtom", newKeys);
    set(submissionKeysAtom, newKeys);
  },
});

const conversationByIndex = atomFamily<TConversation | null, string | number>({
  key: "conversationByIndex",
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue, oldValue) => {
        const index = Number(node.key.split("__")[1]);
        logger.log("conversation", "Setting conversation:", {
          index,
          newValue,
          oldValue,
        });
        if (newValue?.assistant_id != null && newValue.assistant_id) {
          localStorage.setItem(
            `${LocalStorageKeys.ASST_ID_PREFIX}${index}${newValue.endpoint}`,
            newValue.assistant_id,
          );
        }
        if (
          newValue?.agent_id != null &&
          !isEphemeralAgentId(newValue.agent_id)
        ) {
          localStorage.setItem(
            `${LocalStorageKeys.AGENT_ID_PREFIX}${index}`,
            newValue.agent_id,
          );
        }
        if (newValue?.spec != null && newValue.spec) {
          localStorage.setItem(LocalStorageKeys.LAST_SPEC, newValue.spec);
        }
        if (newValue?.tools && Array.isArray(newValue.tools)) {
          localStorage.setItem(
            LocalStorageKeys.LAST_TOOLS,
            JSON.stringify(newValue.tools.filter((el) => !!el)),
          );
        }

        if (!newValue) {
          return;
        }

        storeEndpointSettings(newValue);

        const convoToStore = { ...newValue };
        clearModelForNonEphemeralAgent(convoToStore);
        localStorage.setItem(
          `${LocalStorageKeys.LAST_CONVO_SETUP}_${index}`,
          JSON.stringify(convoToStore),
        );

        const disableParams = newValue.disableParams === true;
        const shouldUpdateParams =
          index === 0 &&
          !disableParams &&
          newValue.createdAt === "" &&
          JSON.stringify(newValue) !== JSON.stringify(oldValue) &&
          (oldValue as TConversation)?.conversationId === Constants.NEW_CONVO;

        if (shouldUpdateParams) {
          const newParams = createChatSearchParams(newValue);
          if (newValue.chatProjectId) {
            newParams.set("projectId", newValue.chatProjectId);
          }
          const searchParams = createSearchParams(newParams);
          const url = `${window.location.pathname}?${searchParams.toString()}`;
          window.history.pushState({}, "", url);
        }
      });
    },
  ] as const,
});

const filesByIndex = atomFamily<Map<string, ExtendedFile>, string | number>({
  key: "filesByIndex",
  default: new Map(),
});

const conversationKeysAtom = atom<(string | number)[]>({
  key: "conversationKeys",
  default: [],
});

const allConversationsSelector = selector({
  key: "allConversationsSelector",
  get: ({ get }) => {
    const keys = get(conversationKeysAtom);
    return keys
      .map((key) => get(conversationByIndex(key)))
      .map((convo) => convo?.conversationId);
  },
});

const conversationIdByIndex = selectorFamily<string | null, string | number>({
  key: "conversationIdByIndex",
  get:
    (index: string | number) =>
    ({ get }) =>
      get(conversationByIndex(index))?.conversationId ?? null,
});

const conversationEndpointByIndex = selectorFamily<
  EModelEndpoint | null,
  string | number
>({
  key: "conversationEndpointByIndex",
  get:
    (index: string | number) =>
    ({ get }) =>
      get(conversationByIndex(index))?.endpoint ?? null,
});

/** Returns `endpointType ?? endpoint`, matching the effective endpoint used for feature gating. */
const effectiveEndpointByIndex = selectorFamily<
  EModelEndpoint | null,
  string | number
>({
  key: "effectiveEndpointByIndex",
  get:
    (index: string | number) =>
    ({ get }) => {
      const convo = get(conversationByIndex(index));
      return convo?.endpointType ?? convo?.endpoint ?? null;
    },
});

const conversationModelByIndex = selectorFamily<string | null, string | number>(
  {
    key: "conversationModelByIndex",
    get:
      (index: string | number) =>
      ({ get }) =>
        get(conversationByIndex(index))?.model ?? null,
  },
);

const conversationSpecByIndex = selectorFamily<string | null, string | number>({
  key: "conversationSpecByIndex",
  get:
    (index: string | number) =>
    ({ get }) =>
      get(conversationByIndex(index))?.spec ?? null,
});

const conversationAgentIdByIndex = selectorFamily<
  string | null,
  string | number
>({
  key: "conversationAgentIdByIndex",
  get:
    (index: string | number) =>
    ({ get }) =>
      get(conversationByIndex(index))?.agent_id ?? null,
});

const conversationAssistantIdByIndex = selectorFamily<
  string | null,
  string | number
>({
  key: "conversationAssistantIdByIndex",
  get:
    (index: string | number) =>
    ({ get }) =>
      get(conversationByIndex(index))?.assistant_id ?? null,
});

const presetByIndex = atomFamily<TPreset | null, string | number>({
  key: "presetByIndex",
  default: null,
});

const textByIndex = atomFamily<string, string | number>({
  key: "textByIndex",
  default: "",
});

const showStopButtonByIndex = atomFamily<boolean, string | number>({
  key: "showStopButtonByIndex",
  default: false,
});

const abortScrollFamily = atomFamily<boolean, string | number>({
  key: "abortScrollByIndex",
  default: false,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        const key = Number(node.key.split(Constants.COMMON_DIVIDER)[1]);
        logger.log(
          "message_scrolling",
          "Recoil Effect: Setting abortScrollByIndex",
          {
            key,
            newValue,
          },
        );
      });
    },
  ] as const,
});

const isSubmittingFamily = atomFamily({
  key: "isSubmittingByIndex",
  default: false,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        const key = Number(node.key.split(Constants.COMMON_DIVIDER)[1]);
        logger.log(
          "message_stream",
          "Recoil Effect: Setting isSubmittingByIndex",
          {
            key,
            newValue,
          },
        );
      });
    },
  ],
});

const anySubmittingSelector = selector<boolean>({
  key: "anySubmittingSelector",
  get: ({ get }) => {
    const keys = get(conversationKeysAtom);
    return keys.some((key) => get(isSubmittingFamily(key)) === true);
  },
});

const optionSettingsFamily = atomFamily<TOptionSettings, string | number>({
  key: "optionSettingsByIndex",
  default: {},
});

const showPopoverFamily = atomFamily({
  key: "showPopoverByIndex",
  default: false,
});

const activePromptByIndex = atomFamily<
  string | undefined,
  string | number | null
>({
  key: "activePromptByIndex",
  default: undefined,
});

const showMentionPopoverFamily = atomFamily<boolean, string | number | null>({
  key: "showMentionPopoverByIndex",
  default: false,
});

const showPlusPopoverFamily = atomFamily<boolean, string | number | null>({
  key: "showPlusPopoverByIndex",
  default: false,
});

const showPromptsPopoverFamily = atomFamily<boolean, string | number | null>({
  key: "showPromptsPopoverByIndex",
  default: false,
});

const showSkillsPopoverFamily = atomFamily<boolean, string | number | null>({
  key: "showSkillsPopoverByIndex",
  default: false,
});

/**
 * Per-conversation queue of skill names the user invoked manually via the
 * `$` popover for the next submission. Structured channel that the submit
 * pipeline (`useChatFunctions.ask`) drains and pins onto the user message's
 * `manualSkills` field (also echoed at the top of the payload for the
 * runtime resolver), then resets to `[]`. Compose-time chips above the
 * textarea read this atom directly so users see (and can dismiss) their
 * current selection before hitting send.
 */
const pendingManualSkillsByConvoId = atomFamily<string[], string>({
  key: "pendingManualSkillsByConvoId",
  default: [],
});

/**
 * Per-conversation queue of verbatim excerpts the user quoted via the
 * "Add to chat" selection popup for the next submission. The submit pipeline
 * (`useChatFunctions.ask`) drains this onto the user message's `quotes` field
 * (which the backend merges into the model-facing text and persists for the
 * `MessageQuotes` UI), then resets to `[]`. Compose-time chips above the
 * textarea read this atom directly so users can see and dismiss each quote
 * before sending.
 */
const pendingQuotesByConvoId = atomFamily<string[], string>({
  key: "pendingQuotesByConvoId",
  default: [],
});

/**
 * Per-conversation code context attached from the local read-only workspace for
 * the next submission. The compose UI shows this as a compact chip; the submit
 * pipeline drains it into the payload so the backend can merge it into the
 * model-facing prompt without filling the visible textarea.
 */
const pendingCodeContextByConvoId = atomFamily<TCodeContext | null, string>({
  key: "pendingCodeContextByConvoId",
  default: null,
});

const pendingWorkspacePatchByIndex = atomFamily<
  string | null,
  string | number | null
>({
  key: "pendingWorkspacePatchByIndex",
  default: null,
});

const coworkCodeHandoffByIndex = atomFamily<
  CoworkCodeHandoff | null,
  string | number | null
>({
  key: "coworkCodeHandoffByIndex",
  default: null,
});

const workspaceSourcesByConversationId = atomFamily<
  WorkspaceNotebookSource[],
  string
>({
  key: "workspaceSourcesByConversationId",
  default: [],
  effects: (conversationId) => [
    notebookSourcesPersistenceEffect(conversationId),
  ],
});

const workspaceSelectedSourceIdByConversationId = atomFamily<
  string | null,
  string
>({
  key: "workspaceSelectedSourceIdByConversationId",
  default: null,
  effects: (conversationId) => [
    notebookSelectedSourcePersistenceEffect(conversationId),
  ],
});

const workspaceNotesByConversationId = atomFamily<
  WorkspaceNotebookNote[],
  string
>({
  key: "workspaceNotesByConversationId",
  default: [],
  effects: (conversationId) => [notebookNotesPersistenceEffect(conversationId)],
});

const workspaceNoteDraftByConversationId = atomFamily<string, string>({
  key: "workspaceNoteDraftByConversationId",
  default: "",
  effects: (conversationId) => [
    notebookNoteDraftPersistenceEffect(conversationId),
  ],
});

const workspaceSourceChatMessagesByConversationId = atomFamily<
  WorkspaceSourceChatMessage[],
  string
>({
  key: "workspaceSourceChatMessagesByConversationId",
  default: [],
});

const workspaceSourceChatDraftByConversationId = atomFamily<string, string>({
  key: "workspaceSourceChatDraftByConversationId",
  default: "",
});

const workspaceUseNotebookSourcesByConversationId = atomFamily<boolean, string>(
  {
    key: "workspaceUseNotebookSourcesByConversationId",
    default: false,
  },
);

const globalAudioURLFamily = atomFamily<string | null, string | number | null>({
  key: "globalAudioURLByIndex",
  default: null,
});

const globalAudioFetchingFamily = atomFamily<boolean, string | number | null>({
  key: "globalAudioisFetchingByIndex",
  default: false,
});

const globalAudioPlayingFamily = atomFamily<boolean, string | number | null>({
  key: "globalAudioisPlayingByIndex",
  default: false,
});

const activeRunFamily = atomFamily<string | null, string | number | null>({
  key: "activeRunByIndex",
  default: null,
});

const audioRunFamily = atomFamily<string | null, string | number | null>({
  key: "audioRunByIndex",
  default: null,
});

const messagesSiblingIdxFamily = atomFamily<number, string | null | undefined>({
  key: "messagesSiblingIdx",
  default: 0,
});

function useCreateConversationAtom(key: string | number) {
  const hasSetConversation = useSetConvoContext();
  const setKeys = useSetRecoilState(conversationKeysAtom);
  const conversation = useRecoilValue(conversationByIndex(key));
  const setConversation = useSetRecoilState(conversationByIndex(key));

  useEffect(() => {
    setKeys((prevKeys) => {
      if (prevKeys.includes(key)) {
        return prevKeys;
      }
      return [...prevKeys, key];
    });
  }, [key, setKeys]);

  return { hasSetConversation, conversation, setConversation };
}

function useSetConversationAtom(key: string | number) {
  const { setConversation } = useCreateConversationAtom(key);
  return { setConversation };
}

function useClearConvoState() {
  /** Clears all active conversations. Pass `true` to skip the first or root conversation */
  const clearAllConversations = useRecoilCallback(
    ({ reset, snapshot }) =>
      async (skipFirst?: boolean) => {
        const conversationKeys =
          await snapshot.getPromise(conversationKeysAtom);

        for (const conversationKey of conversationKeys) {
          if (skipFirst === true && conversationKey == 0) {
            continue;
          }

          reset(conversationByIndex(conversationKey));
        }

        reset(conversationKeysAtom);
      },
    [],
  );

  return clearAllConversations;
}

const conversationByKeySelector = conversationByIndex;

function useClearSubmissionState() {
  const clearAllSubmissions = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async (skipFirst?: boolean) => {
        const submissionKeys = await snapshot.getPromise(
          submissionKeysSelector,
        );
        logger.log("submissionKeys", submissionKeys);

        for (const key of submissionKeys) {
          if (skipFirst === true && key == 0) {
            continue;
          }

          logger.log("resetting submission", key);
          reset(submissionByIndex(key));
        }

        set(submissionKeysSelector, []);
      },
    [],
  );

  return clearAllSubmissions;
}

const updateConversationSelector = selectorFamily({
  key: "updateConversationSelector",
  get: () => () => null as Partial<TConversation> | null,
  set:
    (conversationId: string) =>
    ({ set, get }, newPartialConversation) => {
      if (newPartialConversation instanceof DefaultValue) {
        return;
      }

      const keys = get(conversationKeysAtom);
      keys.forEach((key) => {
        set(conversationByIndex(key), (prevConversation) => {
          if (
            prevConversation &&
            prevConversation.conversationId === conversationId
          ) {
            return {
              ...prevConversation,
              ...newPartialConversation,
            };
          }
          return prevConversation;
        });
      });
    },
});

export default {
  conversationKeysAtom,
  conversationByIndex,
  filesByIndex,
  presetByIndex,
  submissionByIndex,
  textByIndex,
  showStopButtonByIndex,
  abortScrollFamily,
  isSubmittingFamily,
  optionSettingsFamily,
  showPopoverFamily,
  messagesSiblingIdxFamily,
  anySubmittingSelector,
  allConversationsSelector,
  conversationIdByIndex,
  conversationEndpointByIndex,
  effectiveEndpointByIndex,
  conversationModelByIndex,
  conversationSpecByIndex,
  conversationAgentIdByIndex,
  conversationAssistantIdByIndex,
  conversationByKeySelector,
  useClearConvoState,
  useCreateConversationAtom,
  useSetConversationAtom,
  showMentionPopoverFamily,
  globalAudioURLFamily,
  activeRunFamily,
  audioRunFamily,
  globalAudioPlayingFamily,
  globalAudioFetchingFamily,
  showPlusPopoverFamily,
  activePromptByIndex,
  useClearSubmissionState,
  showPromptsPopoverFamily,
  showSkillsPopoverFamily,
  pendingManualSkillsByConvoId,
  pendingQuotesByConvoId,
  pendingCodeContextByConvoId,
  pendingWorkspacePatchByIndex,
  coworkCodeHandoffByIndex,
  workspaceSourcesByConversationId,
  workspaceSelectedSourceIdByConversationId,
  workspaceNotesByConversationId,
  workspaceNoteDraftByConversationId,
  workspaceSourceChatMessagesByConversationId,
  workspaceSourceChatDraftByConversationId,
  workspaceUseNotebookSourcesByConversationId,
  updateConversationSelector,
};
