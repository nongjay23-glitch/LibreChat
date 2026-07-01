import { memo, useCallback, useMemo, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { useForm } from "react-hook-form";
import { Spinner } from "@librechat/client";
import { useParams } from "react-router-dom";
import { Constants, buildTree } from "librechat-data-provider";
import { ArrowLeft, Trash2 } from "lucide-react";
import type { TChatProject, TMessage } from "librechat-data-provider";
import type { ChatFormValues } from "~/common";
import {
  useAddedResponse,
  useResumeOnLoad,
  useAdaptiveSSE,
  useChatHelpers,
  useLocalize,
} from "~/hooks";
import {
  ChatContext,
  AddedChatContext,
  ChatFormProvider,
  useFileMapContext,
} from "~/Providers";
import ConversationStarters from "./Input/ConversationStarters";
import { useGetMessagesByConvoId } from "~/data-provider";
import ProjectLandingChip from "./ProjectLandingChip";
import MessagesView from "./Messages/MessagesView";
import Presentation from "./Presentation";
import ChatForm from "./Input/ChatForm";
import Landing from "./Landing";
import Header from "./Header";
import Footer from "./Footer";
import SourcesPanel from "~/components/Workspace/SourcesPanel";
import { cn } from "~/utils";
import store from "~/store";

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function ChatView({
  index = 0,
  project,
}: {
  index?: number;
  project?: TChatProject;
}) {
  const { conversationId } = useParams();
  const localize = useLocalize();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const activeConversationId =
    useRecoilValue(store.conversationIdByIndex(index)) ??
    conversationId ??
    Constants.NEW_CONVO;
  const notebookSources = useRecoilValue(
    store.workspaceSourcesByConversationId(activeConversationId),
  );
  const selectedSourceId = useRecoilValue(
    store.workspaceSelectedSourceIdByConversationId(activeConversationId),
  );
  const notebookNotes = useRecoilValue(
    store.workspaceNotesByConversationId(activeConversationId),
  );
  const notebookNoteDraft = useRecoilValue(
    store.workspaceNoteDraftByConversationId(activeConversationId),
  );
  const setNotebookSources = useSetRecoilState(
    store.workspaceSourcesByConversationId(activeConversationId),
  );
  const setSelectedSourceId = useSetRecoilState(
    store.workspaceSelectedSourceIdByConversationId(activeConversationId),
  );
  const setNotebookNotes = useSetRecoilState(
    store.workspaceNotesByConversationId(activeConversationId),
  );
  const setNotebookNoteDraft = useSetRecoilState(
    store.workspaceNoteDraftByConversationId(activeConversationId),
  );
  const [isNotebookOpen, setIsNotebookOpen] = useState(false);

  const hasNotebookData = useMemo(
    () =>
      notebookSources.length > 0 ||
      selectedSourceId != null ||
      notebookNotes.length > 0 ||
      notebookNoteDraft.trim().length > 0,
    [
      notebookNoteDraft,
      notebookNotes.length,
      notebookSources.length,
      selectedSourceId,
    ],
  );

  const clearNotebook = useCallback(() => {
    if (!hasNotebookData) {
      return;
    }

    const confirmed = window.confirm(
      localize("com_ui_sources_clear_confirm"),
    );
    if (!confirmed) {
      return;
    }

    setNotebookSources([]);
    setSelectedSourceId(null);
    setNotebookNotes([]);
    setNotebookNoteDraft("");
  }, [
    hasNotebookData,
    localize,
    setNotebookNoteDraft,
    setNotebookNotes,
    setNotebookSources,
    setSelectedSourceId,
  ]);

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: "" },
  });

  const fileMap = useFileMapContext();

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(
    conversationId ?? "",
    {
      select: useCallback(
        (data: TMessage[]) => {
          const dataTree = buildTree({ messages: data, fileMap });
          return dataTree?.length === 0 ? null : (dataTree ?? null);
        },
        [fileMap],
      ),
      enabled: !!fileMap,
    },
    { isStreaming: isSubmitting },
  );

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job
  // Wait for messages to load before resuming to avoid race condition
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading);

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating =
    (!messagesTree || messagesTree.length === 0) && conversationId != null;
  const isProjectLandingPage = isLandingPage && project != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  const chatFormPlaceholder =
    isProjectLandingPage && project
      ? localize("com_ui_new_chat_in_project", { name: project.name })
      : undefined;

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div className="relative flex h-full w-full flex-col">
              <Header onOpenNotebook={() => setIsNotebookOpen(true)} />
              <>
                <div
                  className={cn(
                    "flex flex-col",
                    isLandingPage
                      ? "flex-1 items-center justify-end sm:justify-center"
                      : "h-full overflow-y-auto",
                  )}
                >
                  {content}
                  <div
                    className={cn(
                      "w-full",
                      isLandingPage &&
                        "max-w-3xl transition-all duration-200 xl:max-w-4xl",
                    )}
                  >
                    {isProjectLandingPage && project && (
                      <ProjectLandingChip project={project} />
                    )}
                    {isLandingPage && <ConversationStarters />}
                    <ChatForm index={index} placeholder={chatFormPlaceholder} />
                    {!isLandingPage && <Footer />}
                  </div>
                </div>
                {isLandingPage && <Footer />}
              </>
              {isNotebookOpen ? (
                <div className="absolute inset-0 z-30 flex min-h-0 flex-col bg-surface-primary text-text-primary">
                  <div className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-border-light bg-surface-primary px-4">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-border-light px-3 text-sm font-semibold transition-colors hover:bg-surface-hover"
                      onClick={() => setIsNotebookOpen(false)}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      {localize("com_ui_sources_back_to_chat")}
                    </button>
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                      <span
                        className="truncate text-xs text-text-secondary"
                        data-testid="notebook-local-status"
                      >
                        {localize("com_ui_sources_saved_locally")}
                      </span>
                      <button
                        type="button"
                        disabled={!hasNotebookData}
                        data-testid="clear-notebook-button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-light px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-60"
                        onClick={clearNotebook}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {localize("com_ui_sources_clear_notebook")}
                      </button>
                      <span className="truncate text-sm font-semibold text-text-secondary">
                        {localize("com_ui_sources_chat_notebook")}
                      </span>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">
                    <SourcesPanel />
                  </div>
                </div>
              ) : null}
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
