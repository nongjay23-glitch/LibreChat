import { useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { SendIcon, TextareaAutosize } from "@librechat/client";
import {
  ArrowUpDown,
  Bookmark,
  Folder,
  MessageSquareText,
  Mic,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type {
  Dispatch,
  FormEvent,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { CoworkMessage, CoworkProject, CoworkRoom } from "./coworkRooms";
import MessageTimestamp from "~/components/Chat/Messages/ui/MessageTimestamp";
import { useLocalize } from "~/hooks";
import { fontSizeAtom } from "~/store/fontSize";
import { cn, removeFocusRings } from "~/utils";
import { useCoworkRooms } from "./coworkRooms";

function CoworkMessageRow({ message }: { message: CoworkMessage }) {
  const fontSize = useAtomValue(fontSizeAtom);
  const localize = useLocalize();
  const userLabel = localize("com_ui_you");

  return (
    <div className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent">
      <div className="m-auto justify-center p-4 py-2 md:gap-6">
        <div
          id={message.id}
          aria-label={`${localize("com_ui_cowork")} ${localize("com_ui_user")}`}
          className="message-render group mx-auto flex flex-1 flex-row-reverse gap-3 transition-all duration-300 transform-gpu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy md:max-w-[47rem] xl:max-w-[55rem]"
        >
          <div className="relative flex flex-shrink-0 flex-col items-center">
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full pt-0.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-text-primary text-[10px] font-semibold text-surface-primary">
                {userLabel}
              </div>
            </div>
          </div>
          <div className="user-turn relative flex w-11/12 flex-col items-end">
            <h2
              className={cn(
                "select-none text-right font-semibold text-text-primary",
                fontSize,
              )}
            >
              {userLabel}
              <MessageTimestamp value={message.createdAt} />
            </h2>
            <div className="flex flex-col items-end gap-1">
              <div className="flex min-h-[20px] w-fit max-w-[85%] flex-col gap-0 rounded-2xl rounded-tr-md border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-left shadow-sm">
                <div
                  className={cn("whitespace-pre-wrap break-words", fontSize)}
                >
                  {message.content}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoworkEmptyState({
  active,
  roomTitle,
}: {
  active: boolean;
  roomTitle?: string;
}) {
  const localize = useLocalize();

  return (
    <div className="flex h-full max-h-full transform-gpu flex-col items-center justify-center pb-16 transition-all duration-200">
      <div className="flex flex-col items-center gap-0 p-2">
        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <div className="relative size-10 justify-center">
            <div className="shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white text-black dark:bg-presentation dark:text-white dark:after:shadow-none">
              <MessageSquareText
                className="h-2/3 w-2/3 text-black dark:text-white"
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="flex flex-col items-center gap-0 p-2">
            <h2 className="text-center text-2xl font-medium text-text-primary sm:text-4xl">
              {active ? (roomTitle ?? localize("com_ui_cowork")) : localize("com_ui_cowork")}
            </h2>
          </div>
        </div>
        <p className="animate-fadeIn mt-4 max-w-md text-center text-sm font-normal text-text-primary">
          {active
            ? localize("com_ui_cowork_task_prompt")
            : localize("com_ui_cowork_create_or_select_room")}
        </p>
      </div>
    </div>
  );
}

function CoworkHeader({
  activeRoomTitle,
  onCreateRoom,
}: {
  activeRoomTitle?: string;
  onCreateRoom: () => void;
}) {
  const localize = useLocalize();

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-10 flex h-[52px] w-full items-center justify-between bg-gradient-to-b from-presentation to-transparent p-2 font-semibold text-text-primary 2xl:via-transparent">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center">
          <div className="flex items-center gap-2 pl-2 transition-all duration-200 ease-in-out">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-light bg-surface-primary px-3 text-sm font-semibold text-text-primary shadow-sm">
              <MessageSquareText
                className="h-4 w-4 text-blue-500"
                aria-hidden="true"
              />
              <span className="max-w-[13rem] truncate">
                {activeRoomTitle ?? localize("com_ui_cowork")}
              </span>
            </span>
            <button
              type="button"
              disabled
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-light bg-surface-primary text-text-primary opacity-60 shadow-sm"
              aria-label={localize("com_ui_cowork_bookmarks_disabled")}
            >
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onCreateRoom}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-light bg-surface-primary text-text-primary shadow-sm transition-colors hover:bg-surface-hover"
              aria-label={localize("com_ui_cowork_create_room")}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-light bg-surface-primary px-3 text-sm font-semibold text-text-primary opacity-75 shadow-sm"
            aria-label={localize("com_ui_cowork_local_only_status")}
          >
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            <span>{localize("com_ui_cowork_local_only")}</span>
          </button>
        </div>
      </div>
      <div />
    </div>
  );
}

function CoworkMessagesView({ messages }: { messages: CoworkMessage[] }) {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative h-full">
        <div
          className="scrollbar-gutter-stable"
          style={{
            height: "100%",
            overflowY: "auto",
            width: "100%",
          }}
        >
          <div className="flex flex-col pb-9 pt-14 dark:bg-transparent">
            {messages.map((message) => (
              <CoworkMessageRow key={message.id} message={message} />
            ))}
            <div
              id="cowork-messages-end"
              className="group h-0 w-full flex-shrink-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CoworkFooter() {
  const localize = useLocalize();

  return (
    <div className="relative w-full">
      <div
        className="absolute bottom-0 left-0 right-0 hidden items-center justify-center gap-2 px-2 py-2 text-center text-xs text-text-primary sm:flex md:px-[60px]"
        role="contentinfo"
      >
        {localize("com_ui_cowork_local_only_note")}
      </div>
    </div>
  );
}

type CoworkProjectSort = "updatedAt" | "createdAt" | "title";

function formatProjectDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getProjectChatCount(projectId: string, rooms: CoworkRoom[]) {
  return rooms.filter((room) => room.projectId === projectId && !room.archivedAt)
    .length;
}

function sortProjects(
  projects: CoworkProject[],
  sortBy: CoworkProjectSort,
  rooms: CoworkRoom[],
) {
  return projects.slice().sort((a, b) => {
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }

    if (sortBy === "createdAt") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }

    const aRoomTime = rooms
      .filter((room) => room.projectId === a.id && !room.archivedAt)
      .reduce((latestTime, room) => {
        return Math.max(latestTime, new Date(room.updatedAt).getTime());
      }, 0);
    const bRoomTime = rooms
      .filter((room) => room.projectId === b.id && !room.archivedAt)
      .reduce((latestTime, room) => {
        return Math.max(latestTime, new Date(room.updatedAt).getTime());
      }, 0);

    return (
      Math.max(bRoomTime, new Date(b.updatedAt).getTime()) -
      Math.max(aRoomTime, new Date(a.updatedAt).getTime())
    );
  });
}

function CoworkProjectsOverview({
  createProject,
  openProjectId,
  projects,
  rooms,
}: {
  createProject: () => void;
  openProjectId: string;
  projects: CoworkProject[];
  rooms: CoworkRoom[];
}) {
  const localize = useLocalize();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<CoworkProjectSort>("updatedAt");

  const sortLabel = useMemo(() => {
    if (sortBy === "title") {
      return localize("com_ui_name");
    }
    if (sortBy === "createdAt") {
      return localize("com_ui_sort_created");
    }
    return localize("com_ui_latest_activity");
  }, [localize, sortBy]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchingProjects = normalizedSearch
      ? projects.filter((project) =>
          project.title.toLowerCase().includes(normalizedSearch),
        )
      : projects;

    return sortProjects(matchingProjects, sortBy, rooms);
  }, [projects, rooms, search, sortBy]);

  const cycleSort = () => {
    setSortBy((currentSort) => {
      if (currentSort === "updatedAt") {
        return "createdAt";
      }
      if (currentSort === "createdAt") {
        return "title";
      }
      return "updatedAt";
    });
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <div className="container mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 md:px-6 lg:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
            {localize("com_ui_projects")}
          </h1>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-text-secondary sm:inline">
              {localize("com_ui_sort_by")}
            </span>
            <button
              type="button"
              onClick={cycleSort}
              aria-label={localize("com_ui_sort_projects_by")}
              className="inline-flex h-10 items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-border-medium bg-surface-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary sm:w-44"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ArrowUpDown
                  className="h-4 w-4 shrink-0 text-text-secondary"
                  aria-hidden="true"
                />
                <span className="truncate">{sortLabel}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={createProject}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {localize("com_ui_new_project")}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{localize("com_ui_search_projects")}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={localize("com_ui_search_projects")}
              className="flex h-10 w-full rounded-lg border border-border-medium bg-surface-secondary py-2 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          </label>
          <div className="flex items-center">
            <span className="rounded-full bg-surface-active-alt px-4 py-2 text-sm font-medium text-text-primary">
              {localize("com_ui_your_projects")}
            </span>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="rounded-lg border border-border-medium bg-transparent py-16 text-center text-sm text-text-secondary">
            {localize("com_ui_cowork_no_projects")}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {filteredProjects.map((project) => {
              const chatCount = getProjectChatCount(project.id, rooms);
              return (
                <div
                  key={project.id}
                  className={cn(
                    "group/project flex min-h-[8.5rem] flex-col rounded-xl border border-border-medium bg-surface-secondary p-4 text-left transition-colors",
                    project.id === openProjectId
                      ? "border-border-heavy bg-surface-tertiary"
                      : "hover:border-border-heavy hover:bg-surface-tertiary",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Folder
                      className="h-4 w-4 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                    <span className="truncate text-base font-semibold text-text-primary">
                      {project.title}
                    </span>
                  </span>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-text-secondary">
                    <span>
                      {chatCount === 1
                        ? localize("com_ui_project_chat_count_single")
                        : localize("com_ui_project_chat_count", { count: chatCount })}
                    </span>
                    <span className="shrink-0 truncate">
                      {formatProjectDate(project.updatedAt)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function CoworkChatView() {
  const {
    activeRoom,
    addMessage,
    createProject,
    createRoom,
    isProjectsViewOpen,
    openProjectId,
    projects,
    rooms,
  } = useCoworkRooms();
  const [draft, setDraft] = useState("");
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = useMemo(() => {
    return activeRoom != null && draft.trim().length > 0;
  }, [activeRoom, draft]);

  const isLandingPage = !activeRoom || activeRoom.messages.length === 0;

  const handleContainerClick = () => {
    if (window.matchMedia?.("(pointer: coarse)").matches) {
      return;
    }
    textAreaRef.current?.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeRoom || !draft.trim()) {
      return;
    }

    addMessage(activeRoom.id, draft);
    setDraft("");
    requestAnimationFrame(() => {
      if (textAreaRef.current) {
        textAreaRef.current.style.height = "44px";
      }
    });
  };

  if (isProjectsViewOpen) {
    return (
      <CoworkProjectsOverview
        createProject={createProject}
        openProjectId={openProjectId}
        projects={projects}
        rooms={rooms}
      />
    );
  }

  return (
    <main
      className="flex h-full flex-col overflow-y-auto bg-presentation text-text-primary"
      role="main"
    >
      <div className="relative flex h-full w-full flex-col">
        <CoworkHeader
          activeRoomTitle={activeRoom?.title}
          onCreateRoom={createRoom}
        />
        <div
          className={cn(
            "flex flex-col",
            isLandingPage
              ? "flex-1 items-center justify-end sm:justify-center"
              : "h-full overflow-y-auto",
          )}
        >
          {isLandingPage ? (
            <CoworkEmptyState
              active={!!activeRoom}
              roomTitle={activeRoom?.title}
            />
          ) : (
            <CoworkMessagesView messages={activeRoom.messages} />
          )}

          <div
            className={cn(
              "w-full",
              isLandingPage &&
                "max-w-3xl transition-all duration-200 xl:max-w-4xl",
            )}
          >
            <CoworkComposer
              canSend={canSend}
              draft={draft}
              disabled={!activeRoom}
              isTextAreaFocused={isTextAreaFocused}
              setDraft={setDraft}
              setIsTextAreaFocused={setIsTextAreaFocused}
              textAreaRef={textAreaRef}
              onContainerClick={handleContainerClick}
              onSubmit={handleSubmit}
            />
            {!isLandingPage && <CoworkFooter />}
          </div>
        </div>
        {isLandingPage && <CoworkFooter />}
      </div>
    </main>
  );
}

function CoworkComposer({
  canSend,
  disabled,
  draft,
  isTextAreaFocused,
  onContainerClick,
  onSubmit,
  setDraft,
  setIsTextAreaFocused,
  textAreaRef,
}: {
  canSend: boolean;
  disabled: boolean;
  draft: string;
  isTextAreaFocused: boolean;
  onContainerClick: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setDraft: Dispatch<SetStateAction<string>>;
  setIsTextAreaFocused: Dispatch<SetStateAction<boolean>>;
  textAreaRef: MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const localize = useLocalize();
  const baseClasses = useMemo(
    () =>
      "md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/60 bg-transparent dark:placeholder-white/60 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)] max-h-[45vh] md:max-h-[55vh] px-5",
    [],
  );

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full flex-row gap-3 transition-[max-width] duration-300 sm:mb-10 sm:px-2 md:max-w-3xl xl:max-w-4xl"
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className="flex w-full items-center">
          <div
            onClick={onContainerClick}
            className={cn(
              "relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border border-border-light bg-surface-chat pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0",
              isTextAreaFocused ? "shadow-lg" : "shadow-md",
            )}
          >
            <div className="flex">
              <div className="relative flex-1">
                <TextareaAutosize
                  ref={textAreaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  disabled={disabled}
                  id="cowork-text-input"
                  tabIndex={0}
                  data-testid="cowork-text-input"
                  rows={1}
                  onFocus={() => setIsTextAreaFocused(true)}
                  onBlur={() => setIsTextAreaFocused(false)}
                  aria-label={`${localize("com_endpoint_message")} ${localize("com_ui_cowork")}`}
                  placeholder={`${localize("com_endpoint_message")} ${localize("com_ui_cowork")}`}
                  style={{ height: 44, overflowY: "auto" }}
                  className={cn(
                    baseClasses,
                    removeFocusRings,
                    "scrollbar-hover transition-[max-height] duration-200 disabled:cursor-not-allowed",
                  )}
                />
              </div>
            </div>
            <div className="@container items-between flex gap-2 pb-2">
              <div className="ml-2">
                <button
                  type="button"
                  disabled
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary opacity-70"
                  aria-label={localize("com_ui_cowork_local_only_status")}
                >
                  <Paperclip className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                disabled
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary opacity-70"
                aria-label={localize("com_ui_cowork_local_only_status")}
              >
                <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="mx-auto flex" />
              <button
                type="button"
                disabled
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary opacity-70"
                aria-label={localize("com_ui_cowork_local_only_status")}
              >
                <Mic className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="mr-2">
                <button
                  type="submit"
                  disabled={!canSend}
                  id="cowork-send-button"
                  data-testid="cowork-send-button"
                  className="rounded-full bg-text-primary p-1.5 text-text-primary outline-offset-4 transition-all duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10"
                  aria-label={localize("com_nav_send_message")}
                >
                  <span data-state="closed">
                    <SendIcon size={24} />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
