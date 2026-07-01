import { memo, useEffect, useMemo } from "react";
import { BookOpenText } from "lucide-react";
import { Constants } from "librechat-data-provider";
import { useRecoilState, useSetRecoilState } from "recoil";
import store from "~/store";
import { getReadyNotebookSources } from "~/components/Workspace/sourceContext";

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

/**
 * Passive Notebook status indicator for the Chat composer.
 *
 * Phase 4B.3 made Notebook context auto-consider, so this is no longer a
 * manual toggle — it only shows a read-only status when enabled ready sources
 * exist, and renders nothing otherwise.
 *
 * Also handles NEW_CONVO → real conversation id state migration for
 * notes, drafts, source chat messages, and selected source id.
 */
function NotebookSourcesStatus({
  conversationId,
}: {
  conversationId: string;
}) {
  const [sources, setSources] = useRecoilState(
    store.workspaceSourcesByConversationId(conversationId),
  );
  const setSelectedSourceId = useSetRecoilState(
    store.workspaceSelectedSourceIdByConversationId(conversationId),
  );
  const setNotes = useSetRecoilState(
    store.workspaceNotesByConversationId(conversationId),
  );
  const setNoteDraft = useSetRecoilState(
    store.workspaceNoteDraftByConversationId(conversationId),
  );
  const setSourceChatMessages = useSetRecoilState(
    store.workspaceSourceChatMessagesByConversationId(conversationId),
  );
  const setSourceChatDraft = useSetRecoilState(
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
  const enabledSourceCount = useMemo(
    () => getReadyNotebookSources(sources).length,
    [sources],
  );
  const fallbackEnabledSourceCount = useMemo(
    () => getReadyNotebookSources(fallbackSources).length,
    [fallbackSources],
  );

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

    if (fallbackSources.length > 0) {
      setSources((currentSources) =>
        mergeById(currentSources, fallbackSources),
      );
    }
    setSelectedSourceId(
      (currentSourceId) =>
        currentSourceId ??
        fallbackSelectedSourceId ??
        fallbackSources[0]?.id ??
        null,
    );
    if (fallbackNotes.length > 0) {
      setNotes((currentNotes) => mergeById(currentNotes, fallbackNotes));
    }
    if (fallbackNoteDraft.trim().length > 0) {
      setNoteDraft((currentDraft) => currentDraft || fallbackNoteDraft);
    }
    if (fallbackSourceChatMessages.length > 0) {
      setSourceChatMessages((currentMessages) =>
        mergeById(currentMessages, fallbackSourceChatMessages),
      );
    }
    if (fallbackSourceChatDraft.trim().length > 0) {
      setSourceChatDraft(
        (currentDraft) => currentDraft || fallbackSourceChatDraft,
      );
    }

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

  const visibleEnabledCount =
    conversationId === Constants.NEW_CONVO
      ? fallbackEnabledSourceCount
      : enabledSourceCount;

  if (visibleEnabledCount === 0) {
    return null;
  }

  const statusText = `Notebook memory: ${visibleEnabledCount} source${visibleEnabledCount !== 1 ? "s" : ""}`;

  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-2" role="status">
      <span
        className="inline-flex max-w-full items-center gap-1.5 rounded-2xl border border-border-light bg-surface-primary-alt px-2.5 py-1.5 text-xs text-text-secondary"
        title={statusText}
      >
        <BookOpenText
          className="h-3.5 w-3.5 shrink-0 text-text-tertiary"
          aria-hidden="true"
        />
        <span className="truncate">{statusText}</span>
      </span>
    </div>
  );
}

export default memo(NotebookSourcesStatus);
