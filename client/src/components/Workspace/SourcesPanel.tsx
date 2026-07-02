import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  FilePlus2,
  FileText,
  MessageSquareText,
  NotebookPen,
  PanelRightOpen,
  PencilLine,
  SendHorizontal,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Constants, request } from "librechat-data-provider";
import type { ChangeEvent } from "react";
import type { TranslationKeys } from "~/hooks";
import type {
  WorkspaceNotebookNote,
  WorkspaceNotebookSource,
  WorkspaceSourceChunk,
  WorkspaceSourceChatMessage,
  WorkspaceSourceStatus,
  WorkspaceSourceType,
} from "~/store/families";
import { useLocalize } from "~/hooks";
import store from "~/store";
import { cn } from "~/utils";
import {
  createSourceChunks,
  getChunkLabel,
  getReadyNotebookSources,
  getSourceChatSourceTitles,
  getSourceChunks,
  getTextBytes,
  isGeneralNotebookQuestion,
  selectNotebookSourceContext,
} from "./sourceContext";

type SourceType = WorkspaceSourceType;
type SourceStatus = WorkspaceSourceStatus | "disabled";
type NotebookSource = WorkspaceNotebookSource;
type NotebookNote = WorkspaceNotebookNote;
type SourceChunk = WorkspaceSourceChunk;
type SourceChatMessage = WorkspaceSourceChatMessage;

type SourceInput = {
  title: string;
  type: SourceType;
  content: string;
  sizeBytes: number;
  baseStatus: WorkspaceSourceStatus;
  origin?: NotebookSource["origin"];
};

type SourceChatResponse = {
  text?: string;
  answer?: string;
  message?: string;
};

type RequestError = Error & {
  response?: {
    data?: {
      message?: string;
    };
  };
};

const maxSourceBytes = 100 * 1024;
const maxVisibleEvidenceItems = 5;
const highSourceTokenEstimate = 6000;

const statusLabelKeys: Record<SourceStatus, TranslationKeys> = {
  ready: "com_ui_sources_status_ready",
  disabled: "com_ui_sources_status_disabled",
  too_large: "com_ui_sources_status_too_large",
  blocked: "com_ui_sources_status_blocked",
  unsupported: "com_ui_sources_status_unsupported",
  parse_error: "com_ui_sources_status_parse_error",
};

const statusClassNames: Record<SourceStatus, string> = {
  ready: "border-green-500/30 bg-green-500/10 text-green-600",
  disabled: "border-yellow-500/30 bg-yellow-500/10 text-yellow-600",
  too_large: "border-yellow-500/30 bg-yellow-500/10 text-yellow-600",
  blocked: "border-red-500/30 bg-red-500/10 text-red-600",
  unsupported: "border-red-500/30 bg-red-500/10 text-red-600",
  parse_error: "border-red-500/30 bg-red-500/10 text-red-600",
};

const sourceTypeLabelKeys: Record<SourceType, TranslationKeys> = {
  text: "com_ui_sources_type_text",
  markdown: "com_ui_sources_type_markdown",
};

const riskySourcePattern =
  /(^|[/\\])(\.env|\.git|node_modules|logs?|uploads?|database)([/\\.]|$)|\b(api[-_ ]?key|token|password|credential|secret|database|uploads?)\b/i;

const getSourceStatus = (source: NotebookSource): SourceStatus => {
  if (source.baseStatus !== "ready") {
    return source.baseStatus;
  }

  return source.enabled ? "ready" : "disabled";
};

const createSourceId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const getMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const mergeById = <T extends { id: string }>(
  currentItems: T[],
  fallbackItems: T[],
) => {
  const currentIds = new Set(currentItems.map((item) => item.id));
  return [
    ...currentItems,
    ...fallbackItems.filter((item) => !currentIds.has(item.id)),
  ];
};

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  const requestError = error as RequestError;
  return (
    requestError?.response?.data?.message || requestError?.message || fallback
  );
};

const getFileType = (fileName: string): SourceType | null => {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".md")) {
    return "markdown";
  }
  if (lowerName.endsWith(".txt")) {
    return "text";
  }
  return null;
};

const getSafeSourceInput = ({
  title,
  type,
  content,
  sizeBytes,
}: Omit<SourceInput, "baseStatus">): SourceInput => {
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();
  const secretLike =
    riskySourcePattern.test(trimmedTitle) ||
    riskySourcePattern.test(trimmedContent);

  if (secretLike) {
    return {
      title: trimmedTitle,
      type,
      content: "",
      sizeBytes,
      baseStatus: "blocked",
    };
  }

  if (sizeBytes > maxSourceBytes) {
    return {
      title: trimmedTitle,
      type,
      content: "",
      sizeBytes,
      baseStatus: "too_large",
    };
  }

  if (!trimmedContent) {
    return {
      title: trimmedTitle,
      type,
      content: "",
      sizeBytes,
      baseStatus: "parse_error",
    };
  }

  return {
    title: trimmedTitle,
    type,
    content: trimmedContent,
    sizeBytes,
    baseStatus: "ready",
  };
};

export default function SourcesPanel() {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteTitleRef = useRef<HTMLInputElement>(null);
  const pasteContentRef = useRef<HTMLTextAreaElement>(null);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const conversationId =
    useRecoilValue(store.conversationIdByIndex(0)) ?? Constants.NEW_CONVO;
  const [sources, setSources] = useRecoilState(
    store.workspaceSourcesByConversationId(conversationId),
  );
  const [selectedSourceId, setSelectedSourceId] = useRecoilState(
    store.workspaceSelectedSourceIdByConversationId(conversationId),
  );
  const [notes, setNotes] = useRecoilState(
    store.workspaceNotesByConversationId(conversationId),
  );
  const [noteDraft, setNoteDraft] = useRecoilState(
    store.workspaceNoteDraftByConversationId(conversationId),
  );
  const [sourceChatMessages, setSourceChatMessages] = useRecoilState(
    store.workspaceSourceChatMessagesByConversationId(conversationId),
  );
  const [sourceChatDraft, setSourceChatDraft] = useRecoilState(
    store.workspaceSourceChatDraftByConversationId(conversationId),
  );
  const [fallbackSources, setFallbackSources] = useRecoilState(
    store.workspaceSourcesByConversationId(Constants.NEW_CONVO),
  );
  const [fallbackSelectedSourceId, setFallbackSelectedSourceId] =
    useRecoilState(
      store.workspaceSelectedSourceIdByConversationId(Constants.NEW_CONVO),
    );
  const [fallbackNotes, setFallbackNotes] = useRecoilState(
    store.workspaceNotesByConversationId(Constants.NEW_CONVO),
  );
  const [fallbackNoteDraft, setFallbackNoteDraft] = useRecoilState(
    store.workspaceNoteDraftByConversationId(Constants.NEW_CONVO),
  );
  const [fallbackSourceChatMessages, setFallbackSourceChatMessages] =
    useRecoilState(
      store.workspaceSourceChatMessagesByConversationId(Constants.NEW_CONVO),
    );
  const [fallbackSourceChatDraft, setFallbackSourceChatDraft] = useRecoilState(
    store.workspaceSourceChatDraftByConversationId(Constants.NEW_CONVO),
  );
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSourceChatLoading, setIsSourceChatLoading] = useState(false);
  const [sourceChatError, setSourceChatError] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState("");
  const [editingNoteError, setEditingNoteError] = useState("");
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  useEffect(() => {
    if (conversationId === Constants.NEW_CONVO) {
      return;
    }

    const hasFallbackNotebookState =
      fallbackSources.length > 0 ||
      fallbackSelectedSourceId != null ||
      fallbackNotes.length > 0 ||
      fallbackNoteDraft.trim().length > 0 ||
      fallbackSourceChatMessages.length > 0 ||
      fallbackSourceChatDraft.trim().length > 0;

    if (!hasFallbackNotebookState) {
      return;
    }

    setSources((currentSources) => mergeById(currentSources, fallbackSources));
    setSelectedSourceId(
      (currentSourceId) =>
        currentSourceId ??
        fallbackSelectedSourceId ??
        fallbackSources[0]?.id ??
        null,
    );
    setNotes((currentNotes) => mergeById(currentNotes, fallbackNotes));
    setNoteDraft((currentDraft) => currentDraft || fallbackNoteDraft);
    setSourceChatMessages((currentMessages) =>
      mergeById(currentMessages, fallbackSourceChatMessages),
    );
    setSourceChatDraft(
      (currentDraft) => currentDraft || fallbackSourceChatDraft,
    );

    setFallbackSources([]);
    setFallbackSelectedSourceId(null);
    setFallbackNotes([]);
    setFallbackNoteDraft("");
    setFallbackSourceChatMessages([]);
    setFallbackSourceChatDraft("");
  }, [
    conversationId,
    fallbackNoteDraft,
    fallbackNotes,
    fallbackSelectedSourceId,
    fallbackSourceChatDraft,
    fallbackSourceChatMessages,
    fallbackSources,
    setFallbackNoteDraft,
    setFallbackNotes,
    setFallbackSelectedSourceId,
    setFallbackSourceChatDraft,
    setFallbackSourceChatMessages,
    setFallbackSources,
    setNoteDraft,
    setNotes,
    setSelectedSourceId,
    setSourceChatDraft,
    setSourceChatMessages,
    setSources,
  ]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );

  const selectedSourceChunks = useMemo(
    () => getSourceChunks(selectedSource),
    [selectedSource],
  );

  const selectedSourceTokenEstimate = useMemo(
    () =>
      selectedSourceChunks.reduce(
        (total, chunk) => total + chunk.tokenEstimate,
        0,
      ),
    [selectedSourceChunks],
  );

  const selectedChunk = useMemo(
    () =>
      selectedSourceChunks.find((chunk) => chunk.id === selectedChunkId) ??
      null,
    [selectedChunkId, selectedSourceChunks],
  );

  useEffect(() => {
    setSelectedChunkId(null);
  }, [selectedSourceId]);

  const enabledCount = useMemo(
    () =>
      sources.filter((source) => getSourceStatus(source) === "ready").length,
    [sources],
  );

  const enabledReadySources = useMemo(
    () => getReadyNotebookSources(sources),
    [sources],
  );

  const hasNotebookData = useMemo(
    () =>
      sources.length > 0 ||
      selectedSourceId != null ||
      notes.length > 0 ||
      noteDraft.trim().length > 0,
    [noteDraft, notes.length, selectedSourceId, sources.length],
  );

  const setCurrentSources = (
    updater: (currentSources: NotebookSource[]) => NotebookSource[],
  ) => {
    setSources((currentSources) => updater(currentSources));
  };

  const setCurrentSelectedSourceId = (sourceId: string | null) => {
    setSelectedSourceId(sourceId);
  };

  const setCurrentNoteDraft = (value: string) => {
    setNoteDraft(value);
  };

  const setCurrentSourceChatDraft = (value: string) => {
    setSourceChatDraft(value);
  };

  const addSourceChatMessage = (
    message: Omit<SourceChatMessage, "id" | "createdAt">,
  ) => {
    setSourceChatMessages((currentMessages) => [
      ...currentMessages,
      {
        id: getMessageId(),
        createdAt: new Date().toISOString(),
        ...message,
      },
    ]);
  };

  const buildSourceChatPrompt = (question: string) => {
    const isGeneralQuestion = isGeneralNotebookQuestion(question);
    const { sourceBlocks, sourceTitles, evidence, contextStats } =
      selectNotebookSourceContext({
        question,
        sources: enabledReadySources,
        untitledSourceTitle: localize("com_ui_sources_untitled"),
      });
    const contextSummary = localize(
      contextStats.fallback
        ? "com_ui_sources_chat_context_summary_fallback"
        : "com_ui_sources_chat_context_summary_selected",
      {
        chunks: contextStats.chunkCount,
        sources: contextStats.sourceCount,
      },
    );
    const warning = [
      contextStats.truncated
        ? localize("com_ui_sources_chat_context_truncated")
        : "",
      contextStats.fallback
        ? localize("com_ui_sources_chat_context_fallback_warning")
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      prompt: [
        "You are Source AI Chat, the librarian assistant inside a per-chat Notebook/Sources workspace.",
        "Your job is to help the user use this notebook, understand sources, summarize sources, compare sources, analyze sources, and answer questions grounded in the enabled ready sources.",
        "",
        "Behavior modes:",
        "1. General notebook/help questions: If the user asks who you are, what you do, how Notebook/Sources works, what sources are, what notes are, or how to use this workspace, answer normally without requiring source evidence. Explain that you are the AI assistant for this chat notebook and can help summarize, analyze, compare, and ask questions over enabled sources.",
        "2. Source-grounded questions: If the user asks about facts or content from the sources, use only the provided enabled ready sources. Cite supporting source labels exactly like [Source: title]. If the sources do not specify the requested fact, say that the sources do not specify it. Do not invent facts or citations.",
        '3. Source analysis and interpretation: If the user asks to analyze, interpret, compare, find contradictions, suggest follow-up questions, or explain what the source means, first state what the sources actually say, then separate your analysis or inference from the source facts. Use labels such as "Source says" and "Analysis/Inference" when helpful. Mention missing context or limits.',
        "",
        "Grounding rules:",
        "- Use only the Sources section below for source-backed claims.",
        "- Disabled, blocked, too-large, unsupported, or parse-error sources are not included and must not be assumed.",
        "- If no sources are provided, you may still answer general notebook/help questions, but for source-content questions tell the user to add or enable a ready source first.",
        "- If a question goes beyond the sources, say what the sources do not specify before offering general guidance.",
        "- Do not claim a source says something unless that information is present in the source text.",
        "- The Sources section may contain only selected chunks, not the full sources.",
        "- Each source chunk is labeled as [Evidence N], [Source: title], and [Section: heading or Chunk N].",
        "- When answering from source evidence, cite the relevant source and section labels like [Source: title / Section: heading].",
        "- Do not cite sources or sections that are not present in the Sources section.",
        "- If the answer is analysis or inference, separate what the source says from your analysis or inference.",
        "",
        `Enabled ready source count: ${contextStats.sourceCount}`,
        `Selected chunk count: ${contextStats.chunkCount}`,
        `Context selection: ${contextStats.fallback ? "fallback first chunks" : "keyword-scored chunks"}`,
        "Sources:",
        sourceBlocks || "(No enabled ready sources provided.)",
        "",
        `Question: ${question}`,
      ].join("\n"),
      sourceTitles,
      contextSummary,
      contextStats,
      evidence: isGeneralQuestion ? [] : evidence,
      warning: warning || undefined,
    };
  };

  const submitSourceChatQuestion = async () => {
    const question = sourceChatDraft.trim();
    if (!question || isSourceChatLoading) {
      return;
    }

    setSourceChatError("");
    addSourceChatMessage({ role: "user", content: question });
    setCurrentSourceChatDraft("");

    if (!conversation?.endpoint) {
      addSourceChatMessage({
        role: "assistant",
        content: localize("com_ui_sources_chat_no_model"),
        error: true,
      });
      return;
    }

    const {
      prompt,
      sourceTitles,
      contextSummary,
      contextStats,
      evidence,
      warning,
    } = buildSourceChatPrompt(question);
    setIsSourceChatLoading(true);
    try {
      const data = (await request.post("/api/workspace/source-chat", {
        ...conversation,
        text: prompt,
        conversationId,
      })) as SourceChatResponse;
      const answer = data?.text || data?.answer;

      if (!answer) {
        throw new Error(data?.message || localize("com_ui_sources_chat_error"));
      }

      const citedSourceTitles = getSourceChatSourceTitles({
        answer,
        sourceTitles,
      });

      addSourceChatMessage({
        role: "assistant",
        content: answer,
        sourceTitles: citedSourceTitles,
        contextSummary,
        contextStats,
        evidence,
        warning,
      });
    } catch (error) {
      const message = getRequestErrorMessage(
        error,
        localize("com_ui_sources_chat_error"),
      );
      setSourceChatError(message);
      addSourceChatMessage({
        role: "assistant",
        content: message,
        error: true,
      });
    } finally {
      setIsSourceChatLoading(false);
    }
  };

  const addNote = () => {
    const content = noteDraft.trim();
    if (!content) {
      return;
    }

    const note: NotebookNote = {
      id: createSourceId(),
      content,
      addedAt: new Date().toISOString(),
    };

    setNotes((currentNotes) => [note, ...currentNotes]);
    setCurrentNoteDraft("");
  };

  const removeNote = (noteId: string) => {
    setNotes((currentNotes) =>
      currentNotes.filter((note) => note.id !== noteId),
    );
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
      setEditingNoteDraft("");
      setEditingNoteError("");
    }
  };

  const startEditingNote = (note: NotebookNote) => {
    setEditingNoteId(note.id);
    setEditingNoteDraft(note.content);
    setEditingNoteError("");
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditingNoteDraft("");
    setEditingNoteError("");
  };

  const saveEditingNote = () => {
    if (!editingNoteId) {
      return;
    }

    const content = editingNoteDraft.trim();
    if (!content) {
      setEditingNoteError(localize("com_ui_sources_note_error_empty_content"));
      return;
    }

    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.id === editingNoteId ? { ...note, content } : note,
      ),
    );
    cancelEditingNote();
  };

  const addSource = (input: SourceInput) => {
    const sourceId = createSourceId();
    const source: NotebookSource = {
      id: sourceId,
      enabled: input.baseStatus === "ready",
      addedAt: new Date().toISOString(),
      chunks:
        input.baseStatus === "ready"
          ? createSourceChunks({
              sourceId,
              type: input.type,
              content: input.content,
            })
          : [],
      ...input,
    };

    setCurrentSources((currentSources) => [source, ...currentSources]);
    setCurrentSelectedSourceId(source.id);
  };

  const getNoteSourceTitle = (content: string) => {
    const firstLine = content
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim();

    if (!firstLine) {
      return localize("com_ui_sources_untitled");
    }

    return firstLine.length > 64 ? `${firstLine.slice(0, 61)}...` : firstLine;
  };

  const addNoteToSources = (note: NotebookNote) => {
    addSource({
      ...getSafeSourceInput({
        title: getNoteSourceTitle(note.content),
        type: "text",
        content: note.content,
        sizeBytes: getTextBytes(note.content),
      }),
      origin: "note",
    });
  };

  const handleAddPastedSource = () => {
    const title = pasteTitleRef.current?.value ?? "";
    const content = pasteContentRef.current?.value.trim() ?? "";

    if (!content) {
      setFormError(localize("com_ui_sources_error_empty_content"));
      return;
    }

    addSource(
      getSafeSourceInput({
        title: title.trim() || localize("com_ui_sources_untitled"),
        type: "text",
        content,
        sizeBytes: getTextBytes(content),
      }),
    );
    if (pasteTitleRef.current) {
      pasteTitleRef.current.value = "";
    }
    if (pasteContentRef.current) {
      pasteContentRef.current.value = "";
    }
    setFormError("");
    setIsAddSourceOpen(false);
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    files.forEach((file) => {
      const fileType = getFileType(file.name);

      if (riskySourcePattern.test(file.name)) {
        addSource({
          title: file.name,
          type: fileType ?? "text",
          content: "",
          sizeBytes: file.size,
          baseStatus: "blocked",
        });
        return;
      }

      if (!fileType) {
        addSource({
          title: file.name,
          type: "text",
          content: "",
          sizeBytes: file.size,
          baseStatus: "unsupported",
        });
        return;
      }

      if (file.size > maxSourceBytes) {
        addSource({
          title: file.name,
          type: fileType,
          content: "",
          sizeBytes: file.size,
          baseStatus: "too_large",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === "string" ? reader.result : "";
        addSource(
          getSafeSourceInput({
            title: file.name,
            type: fileType,
            content,
            sizeBytes: file.size,
          }),
        );
      };
      reader.onerror = () => {
        addSource({
          title: file.name,
          type: fileType,
          content: "",
          sizeBytes: file.size,
          baseStatus: "parse_error",
        });
      };
      reader.readAsText(file);
    });
  };

  const toggleSource = (sourceId: string) => {
    setCurrentSources((currentSources) =>
      currentSources.map((source) => {
        if (source.id !== sourceId || source.baseStatus !== "ready") {
          return source;
        }
        return { ...source, enabled: !source.enabled };
      }),
    );
  };

  const removeSource = (sourceId: string) => {
    const nextSources = sources.filter((source) => source.id !== sourceId);
    setSources(nextSources);
    if (selectedSourceId === sourceId) {
      setCurrentSelectedSourceId(nextSources[0]?.id ?? null);
    }
  };

  const clearNotebook = () => {
    if (!hasNotebookData) {
      return;
    }

    const confirmation = window.prompt(
      localize("com_ui_sources_clear_confirm_prompt"),
    );
    if (confirmation !== "CLEAR") {
      return;
    }

    setSources([]);
    setSelectedSourceId(null);
    setNotes([]);
    setNoteDraft("");
    setEditingNoteId(null);
    setEditingNoteDraft("");
    setEditingNoteError("");
    setSelectedChunkId(null);
  };

  const renderStatusBadge = (status: SourceStatus) => (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
        statusClassNames[status],
      )}
    >
      {localize(statusLabelKeys[status])}
    </span>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-primary text-text-primary">
      <div className="border-b border-border-light px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpenText
                className="h-5 w-5 text-text-secondary"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  {localize("com_ui_sources")}
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  {localize("com_ui_sources_saved_locally")}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-text-secondary">
            <span className="rounded-md border border-border-light px-2 py-1">
              {localize("com_ui_sources_chat_source_count", {
                count: enabledCount,
              })}
            </span>
            <span className="rounded-md border border-border-light px-2 py-1">
              {notes.length} {localize("com_ui_sources_notes")}
            </span>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)_320px] lg:overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <aside className="flex min-h-[420px] flex-col border-b border-border-light lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="border-b border-border-light p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText
                  className="h-4 w-4 text-text-secondary"
                  aria-hidden="true"
                />
                <h3 className="truncate text-xs font-semibold uppercase text-text-secondary">
                  {localize("com_ui_sources_references")}
                </h3>
                <span className="rounded-md bg-surface-secondary px-1.5 py-0.5 text-[11px] text-text-secondary">
                  {enabledCount}/{sources.length}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                  onClick={() => setIsAddSourceOpen((open) => !open)}
                >
                  <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {localize("com_ui_sources_add_source")}
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              data-testid="sources-file-input"
              onChange={handleFilesSelected}
            />

            {isAddSourceOpen ? (
              <section className="mt-3 rounded-lg border border-border-light bg-surface-primary-alt p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">
                    {localize("com_ui_sources_add_text")}
                  </h4>
                  <button
                    type="button"
                    className="text-xs font-medium text-text-secondary hover:text-text-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {localize("com_ui_sources_add_file")}
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  <input
                    ref={pasteTitleRef}
                    className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder={localize("com_ui_sources_title_placeholder")}
                    aria-label={localize("com_ui_sources_title")}
                  />
                  <textarea
                    ref={pasteContentRef}
                    className="min-h-[92px] w-full resize-y rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder={localize("com_ui_sources_content_placeholder")}
                    aria-label={localize("com_ui_sources_content")}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-text-secondary">
                    {localize("com_ui_sources_size_limit")}{" "}
                    {formatBytes(maxSourceBytes)}
                  </p>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-light px-3 text-xs font-semibold hover:bg-surface-hover"
                    onClick={handleAddPastedSource}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {localize("com_ui_sources_add_source")}
                  </button>
                </div>
                {formError ? (
                  <p className="mt-2 text-xs font-medium text-red-600">
                    {formError}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {sources.length === 0 ? (
              <div className="flex flex-1 flex-col justify-center px-4 py-6 text-center">
                <FileText
                  className="mx-auto h-8 w-8 text-text-secondary"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium">
                  {localize("com_ui_sources_empty_title")}
                </p>
                <p className="mt-2 text-xs text-text-secondary">
                  {localize("com_ui_sources_empty_help")}
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                {sources.map((source) => {
                  const status = getSourceStatus(source);
                  const selected = selectedSourceId === source.id;
                  return (
                    <div
                      key={source.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-blue-500/50 bg-blue-500/10"
                          : "border-border-light bg-surface-primary-alt hover:bg-surface-hover",
                      )}
                      data-testid="sources-list-item"
                      onClick={() => setCurrentSelectedSourceId(source.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setCurrentSelectedSourceId(source.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {source.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                            <span>
                              {localize(sourceTypeLabelKeys[source.type])} -{" "}
                              {formatBytes(source.sizeBytes)}
                            </span>
                            {source.origin === "note" ? (
                              <span className="rounded-md border border-border-light px-1.5 py-0.5 text-[11px]">
                                {localize("com_ui_sources_from_note")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {renderStatusBadge(status)}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-text-secondary">
                          {formatDate(source.addedAt)}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary"
                            title={
                              source.baseStatus === "ready"
                                ? localize("com_ui_sources_toggle")
                                : localize("com_ui_sources_toggle_unavailable")
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSource(source.id);
                            }}
                          >
                            {source.enabled ? (
                              <ToggleRight
                                className="h-4 w-4 text-green-600"
                                aria-hidden="true"
                              />
                            ) : (
                              <ToggleLeft
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:text-red-500"
                            title={localize("com_ui_sources_remove")}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeSource(source.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <section className="border-t border-border-light p-3">
              <div className="mb-2 flex items-center gap-2">
                <PanelRightOpen
                  className="h-4 w-4 text-text-secondary"
                  aria-hidden="true"
                />
                <h3 className="truncate text-xs font-semibold uppercase text-text-secondary">
                  {localize("com_ui_sources_selected_detail")}
                </h3>
              </div>
              {selectedSource ? (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-border-light bg-surface-primary-alt p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {selectedSource.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                        <span>
                          {localize(sourceTypeLabelKeys[selectedSource.type])} -{" "}
                          {formatBytes(selectedSource.sizeBytes)}
                        </span>
                        {selectedSource.origin === "note" ? (
                          <span className="rounded-md border border-border-light px-1.5 py-0.5 text-[11px]">
                            {localize("com_ui_sources_from_note")}
                          </span>
                        ) : null}
                        <span className="rounded-md border border-border-light px-1.5 py-0.5 text-[11px]">
                          {localize("com_ui_sources_chunk_count", {
                            count: selectedSourceChunks.length,
                          })}
                        </span>
                        <span className="rounded-md border border-border-light px-1.5 py-0.5 text-[11px]">
                          {localize("com_ui_sources_token_estimate", {
                            count: selectedSourceTokenEstimate,
                          })}
                        </span>
                      </div>
                    </div>
                    {renderStatusBadge(getSourceStatus(selectedSource))}
                  </div>
                  {selectedSourceTokenEstimate > highSourceTokenEstimate ? (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700">
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <p>
                        {localize("com_ui_sources_context_estimate_warning")}
                      </p>
                    </div>
                  ) : null}
                  {selectedSourceChunks.length ? (
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-semibold uppercase text-text-secondary">
                        {localize("com_ui_sources_sections")}
                      </p>
                      <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                        {selectedSourceChunks.map((chunk) => (
                          <button
                            key={chunk.id}
                            type="button"
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-surface-hover",
                              selectedChunkId === chunk.id
                                ? "border-blue-500/50 bg-blue-500/10"
                                : "border-border-light",
                            )}
                            onClick={() => setSelectedChunkId(chunk.id)}
                          >
                            <span className="min-w-0 truncate">
                              {chunk.heading ||
                                localize("com_ui_sources_chunk_label", {
                                  index: chunk.index + 1,
                                })}
                            </span>
                            <span className="shrink-0 text-text-secondary">
                              {localize("com_ui_sources_chunk_meta", {
                                tokens: chunk.tokenEstimate,
                                type: chunk.kind,
                              })}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedSource.content ? (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold uppercase text-text-secondary">
                        {selectedChunk
                          ? localize("com_ui_sources_selected_chunk")
                          : localize("com_ui_sources_full_source_preview")}
                      </p>
                      <pre className="max-h-32 whitespace-pre-wrap break-words rounded-md border border-border-light bg-surface-primary p-2 text-xs leading-5 text-text-primary">
                        {selectedChunk?.content ?? selectedSource.content}
                      </pre>
                      {selectedChunk ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-text-secondary hover:text-text-primary"
                          onClick={() => setSelectedChunkId(null)}
                        >
                          {localize("com_ui_sources_show_full_source")}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 flex items-start gap-2 text-xs text-text-secondary">
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4"
                        aria-hidden="true"
                      />
                      <p>{localize("com_ui_sources_preview_unavailable")}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-border-light bg-surface-primary-alt p-3 text-xs text-text-secondary">
                  {localize("com_ui_sources_preview_empty_help")}
                </p>
              )}
            </section>
            <details className="border-t border-border-light p-3 text-xs text-text-secondary">
              <summary className="cursor-pointer select-none font-semibold uppercase hover:text-text-primary">
                {localize("com_ui_sources_advanced_danger_zone")}
              </summary>
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <p>{localize("com_ui_sources_clear_warning")}</p>
                <button
                  type="button"
                  disabled={!hasNotebookData}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-red-500/40 px-3 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-60"
                  onClick={clearNotebook}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {localize("com_ui_sources_clear_notebook")}
                </button>
              </div>
            </details>
          </div>
        </aside>

        <main className="flex min-h-[520px] flex-col border-b border-border-light lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <MessageSquareText
                  className="h-4 w-4 text-text-secondary"
                  aria-hidden="true"
                />
                <h3 className="truncate text-sm font-semibold">
                  {localize("com_ui_sources_librarian")}
                </h3>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {localize("com_ui_sources_chat_source_count", {
                  count: enabledCount,
                })}
              </p>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
              {sourceChatMessages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-light bg-surface-primary-alt">
                    <MessageSquareText
                      className="h-6 w-6 text-text-secondary"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    {localize("com_ui_sources_chat_empty_title")}
                  </h3>
                  <p className="mt-2 max-w-md text-sm text-text-secondary">
                    {localize("com_ui_sources_librarian_help")}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {sourceChatMessages.map((message) => (
                    <article
                      key={message.id}
                      className={cn(
                        "max-w-[88%] rounded-lg border px-3 py-2 text-sm",
                        message.role === "user"
                          ? "ml-auto border-blue-500/30 bg-blue-500/10"
                          : "mr-auto border-border-light bg-surface-primary-alt",
                        message.error && "border-red-500/30 bg-red-500/10",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                      {message.contextSummary ? (
                        <p className="mt-2 text-xs font-medium text-text-secondary">
                          {message.contextSummary}
                        </p>
                      ) : null}
                      {message.warning ? (
                        <p className="mt-2 text-xs font-medium text-yellow-600">
                          {message.warning}
                        </p>
                      ) : null}
                      {message.evidence?.length ? (
                        <div className="mt-3 rounded-md border border-border-light bg-surface-primary p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-text-primary">
                              {localize("com_ui_sources_evidence")}
                            </span>
                            {message.contextStats?.fallback ? (
                              <span className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[11px] text-yellow-700">
                                {localize("com_ui_sources_evidence_fallback")}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-col gap-2">
                            {message.evidence
                              .slice(0, maxVisibleEvidenceItems)
                              .map((item) => (
                                <div
                                  key={`${item.sourceId}-${item.chunkId}`}
                                  className="min-w-0 rounded-md border border-border-light bg-surface-primary-alt p-2"
                                >
                                  <p className="break-words font-medium text-text-primary">
                                    {localize("com_ui_sources_evidence_item", {
                                      source: item.sourceTitle,
                                      section:
                                        item.chunkHeading ||
                                        localize("com_ui_sources_chunk_label", {
                                          index: item.chunkIndex + 1,
                                        }),
                                    })}
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap break-words text-text-secondary">
                                    {item.snippet}
                                  </p>
                                </div>
                              ))}
                          </div>
                          {message.evidence.length > maxVisibleEvidenceItems ? (
                            <p className="mt-2 text-text-secondary">
                              {localize("com_ui_sources_evidence_more", {
                                count:
                                  message.evidence.length -
                                  maxVisibleEvidenceItems,
                              })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {message.sourceTitles?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {message.sourceTitles.map((title) => (
                            <span
                              key={title}
                              className="rounded-md border border-border-light px-1.5 py-0.5 text-[11px] text-text-secondary"
                            >
                              {localize("com_ui_sources_chat_source_label", {
                                title,
                              })}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {isSourceChatLoading ? (
                    <div className="mr-auto rounded-lg border border-border-light bg-surface-primary-alt px-3 py-2 text-sm text-text-secondary">
                      {localize("com_ui_sources_chat_loading")}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="border-t border-border-light p-4">
              <div className="flex items-end gap-2 rounded-xl border border-border-light bg-surface-primary-alt p-2">
                <textarea
                  className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
                  value={sourceChatDraft}
                  placeholder={localize(
                    "com_ui_sources_chat_input_placeholder",
                  )}
                  aria-label={localize("com_ui_sources_chat_input_placeholder")}
                  onChange={(event) =>
                    setCurrentSourceChatDraft(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submitSourceChatQuestion();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!sourceChatDraft.trim() || isSourceChatLoading}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white disabled:cursor-not-allowed disabled:bg-surface-tertiary disabled:text-text-secondary"
                  title={localize("com_ui_sources_send")}
                  onClick={submitSourceChatQuestion}
                >
                  <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {sourceChatError ? (
                <p className="mt-2 text-xs font-medium text-red-600">
                  {sourceChatError}
                </p>
              ) : null}
            </div>
          </div>
        </main>

        <aside className="flex min-h-[420px] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border-light px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <NotebookPen
                className="h-4 w-4 text-text-secondary"
                aria-hidden="true"
              />
              <h3 className="truncate text-xs font-semibold uppercase text-text-secondary">
                {localize("com_ui_sources_notes")}
              </h3>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-light px-3 text-xs font-semibold hover:bg-surface-hover"
              onClick={addNote}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {localize("com_ui_sources_add_note")}
            </button>
          </div>
          <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-3">
            <textarea
              className="min-h-[84px] resize-none rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={noteDraft}
              placeholder={localize("com_ui_sources_notes_placeholder")}
              aria-label={localize("com_ui_sources_notes")}
              onChange={(event) => setCurrentNoteDraft(event.target.value)}
            />
            {notes.length === 0 ? (
              <div className="rounded-lg border border-border-light bg-surface-primary-alt p-4 text-sm text-text-secondary">
                {localize("com_ui_sources_notes_empty")}
              </div>
            ) : (
              notes.map((note) => {
                const isEditing = editingNoteId === note.id;

                return (
                  <article
                    key={note.id}
                    className="rounded-lg border border-border-light bg-surface-primary-alt p-3"
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          className="min-h-[96px] w-full resize-none rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm outline-none focus:border-blue-500"
                          value={editingNoteDraft}
                          aria-label={localize("com_ui_sources_edit_note")}
                          onChange={(event) => {
                            setEditingNoteDraft(event.target.value);
                            if (editingNoteError) {
                              setEditingNoteError("");
                            }
                          }}
                        />
                        {editingNoteError ? (
                          <p className="text-xs font-medium text-red-600">
                            {editingNoteError}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {note.content}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-text-secondary">
                        {formatDate(note.addedAt)}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-border-light px-2 text-xs font-medium text-text-secondary hover:bg-surface-hover"
                              onClick={saveEditingNote}
                            >
                              <CheckCircle2
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              {localize("com_ui_save")}
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-border-light px-2 text-xs font-medium text-text-secondary hover:bg-surface-hover"
                              onClick={cancelEditingNote}
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              {localize("com_ui_cancel")}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="rounded-md border border-border-light px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover"
                              onClick={() => addNoteToSources(note)}
                            >
                              {localize("com_ui_sources_add_note_to_sources")}
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:text-text-primary"
                              aria-label={localize("com_ui_sources_edit_note")}
                              title={localize("com_ui_sources_edit_note")}
                              onClick={() => startEditingNote(note)}
                            >
                              <PencilLine
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:text-red-500"
                          aria-label={localize("com_ui_sources_delete_note")}
                          title={localize("com_ui_sources_delete_note")}
                          onClick={() => removeNote(note.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
