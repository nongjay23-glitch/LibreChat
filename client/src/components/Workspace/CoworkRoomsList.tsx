import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as Ariakit from "@ariakit/react";
import {
  Button,
  TooltipAnchor,
  NewChatIcon,
  OGDialog,
  OGDialogClose,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  DropdownPopup,
} from "@librechat/client";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CopyPlus,
  Ellipsis,
  Folder,
  FolderInput,
  Folders,
  FolderPlus,
  MessageSquareText,
  Pen,
  Pin,
  Share2,
  Trash,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type { MenuItemProps } from "~/common";
import type { CoworkProject, CoworkRoom } from "./coworkRooms";
import RenameForm from "~/components/Conversations/RenameForm";
import { useLocalize } from "~/hooks";
import { cn } from "~/utils";
import { useCoworkRooms } from "./coworkRooms";

type CoworkRoomGroupName = "Today" | "Yesterday" | "Previous 7 days" | "Older";

type CoworkRoomGroup = {
  groupName: CoworkRoomGroupName;
  rooms: CoworkRoom[];
};

const GROUP_ORDER: CoworkRoomGroupName[] = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Older",
];

const GROUP_LABEL_KEYS: Record<CoworkRoomGroupName, string> = {
  Today: "com_ui_cowork_today",
  Yesterday: "com_ui_cowork_yesterday",
  "Previous 7 days": "com_ui_cowork_previous_7_days",
  Older: "com_ui_cowork_older",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const iconButtonClassName =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white";

function getStartOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getRoomGroupName(value: string): CoworkRoomGroupName {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Older";
  }

  const today = getStartOfDay(new Date());
  const roomDay = getStartOfDay(date);
  const dayDiff = Math.floor((today.getTime() - roomDay.getTime()) / DAY_MS);

  if (dayDiff <= 0) {
    return "Today";
  }

  if (dayDiff === 1) {
    return "Yesterday";
  }

  if (dayDiff <= 7) {
    return "Previous 7 days";
  }

  return "Older";
}

function sortRoomsByUpdatedAt(rooms: CoworkRoom[]) {
  return rooms.slice().sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function sortProjectsByUpdatedAt(projects: CoworkProject[]) {
  return projects.slice().sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function groupCoworkRoomsByDate(rooms: CoworkRoom[]): CoworkRoomGroup[] {
  const groups = sortRoomsByUpdatedAt(rooms).reduce<
    Map<CoworkRoomGroupName, CoworkRoom[]>
  >((acc, room) => {
    const groupName = getRoomGroupName(room.updatedAt);
    const groupRooms = acc.get(groupName) ?? [];
    groupRooms.push(room);
    acc.set(groupName, groupRooms);
    return acc;
  }, new Map<CoworkRoomGroupName, CoworkRoom[]>());

  return GROUP_ORDER.flatMap((groupName) => {
    const groupRooms = groups.get(groupName);
    return groupRooms && groupRooms.length > 0
      ? [{ groupName, rooms: groupRooms }]
      : [];
  });
}

function CoworkSectionHeader({
  isExpanded,
  label,
  newButtonLabel,
  newButtonIcon,
  onCreate,
  onSecondaryAction,
  secondaryButtonIcon,
  secondaryButtonLabel,
  onToggle,
}: {
  isExpanded: boolean;
  label: string;
  newButtonLabel: string;
  newButtonIcon: ReactNode;
  onCreate: () => void;
  onSecondaryAction?: () => void;
  secondaryButtonIcon?: ReactNode;
  secondaryButtonLabel?: string;
  onToggle: () => void;
}) {
  const hasSecondaryAction =
    Boolean(onSecondaryAction) &&
    Boolean(secondaryButtonIcon) &&
    Boolean(secondaryButtonLabel);

  return (
    <div className="flex h-8 w-full items-center gap-0.5 pr-2">
      <button
        onClick={onToggle}
        className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        type="button"
        aria-expanded={isExpanded}
      >
        <span className="select-none truncate">{label}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-200",
            isExpanded ? "" : "-rotate-90",
          )}
          aria-hidden="true"
        />
      </button>
      {hasSecondaryAction && (
        <TooltipAnchor
          description={secondaryButtonLabel}
          render={
            <button
              type="button"
              aria-label={secondaryButtonLabel}
              className={iconButtonClassName}
              onClick={onSecondaryAction}
            >
              {secondaryButtonIcon}
            </button>
          }
        />
      )}
      <TooltipAnchor
        description={newButtonLabel}
        render={
          <button
            type="button"
            aria-label={newButtonLabel}
            className={iconButtonClassName}
            onClick={onCreate}
          >
            {newButtonIcon}
          </button>
        }
      />
    </div>
  );
}

function CoworkDateLabel({
  groupName,
  isFirst,
}: {
  groupName: CoworkRoomGroupName;
  isFirst: boolean;
}) {
  const localize = useLocalize();
  const label = localize(GROUP_LABEL_KEYS[groupName]);

  return (
    <h2
      aria-label={localize("com_ui_cowork_chats_from").replace("{{0}}", label)}
      className={cn("pl-1 pt-1 text-text-secondary", isFirst ? "mt-0" : "mt-2")}
      style={{ fontSize: "0.7rem" }}
    >
      {label}
    </h2>
  );
}

function CoworkEmptyRow({
  icon,
  label,
  subtext,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  subtext: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
    >
      {icon}
      <span className="min-w-0">
        <span className="block truncate text-text-primary">{label}</span>
        <span className="block truncate text-xs">{subtext}</span>
      </span>
    </button>
  );
}

function getRoomDisplayText(room: CoworkRoom, fallbackTitle: string) {
  const latestMessage = room.messages[room.messages.length - 1]?.content.trim();
  return latestMessage || room.title.trim() || fallbackTitle;
}

function createRoomShareText(room: CoworkRoom) {
  const messages = room.messages
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  return [room.title.trim() || "Untitled", messages].filter(Boolean).join("\n\n");
}

function copyRoomShareText(room: CoworkRoom) {
  const text = createRoomShareText(room);
  if (!text || typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  navigator.clipboard.writeText(text);
}

function CoworkDeleteDialog({
  itemTitle,
  itemType,
  onDelete,
  onOpenChange,
  open,
  triggerRef,
}: {
  itemTitle: string;
  itemType: "chat" | "project";
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement>;
}) {
  const localize = useLocalize();
  const title =
    itemType === "project"
      ? localize("com_ui_delete_project")
      : localize("com_ui_delete_conversation");
  const description =
    itemType === "project"
      ? localize("com_ui_delete_project_confirm", { name: itemTitle })
      : `${localize("com_ui_delete_confirm")} "${itemTitle}"`;

  const confirmDelete = () => {
    onDelete();
    onOpenChange(false);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
        <OGDialogHeader>
          <OGDialogTitle>{title}</OGDialogTitle>
        </OGDialogHeader>
        <div className="text-sm text-text-primary">{description}</div>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label={localize("com_ui_cancel")} variant="outline">
              {localize("com_ui_cancel")}
            </Button>
          </OGDialogClose>
          <Button variant="destructive" onClick={confirmDelete}>
            {localize("com_ui_delete")}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

function CoworkProjectDialog({
  currentProjectId,
  onOpenChange,
  onSave,
  open,
  projects,
  triggerRef,
}: {
  currentProjectId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (projectId: string | null) => void;
  open: boolean;
  projects: CoworkProject[];
  triggerRef: RefObject<HTMLButtonElement>;
}) {
  const localize = useLocalize();
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId ?? "");

  useEffect(() => {
    setSelectedProjectId(currentProjectId ?? "");
  }, [currentProjectId, open]);

  const saveProject = () => {
    onSave(selectedProjectId || null);
    onOpenChange(false);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogContent
        id="cowork-project-dialog"
        className="w-11/12 max-w-md"
        showCloseButton={false}
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize("com_ui_change_project")}</OGDialogTitle>
        </OGDialogHeader>
        <label className="flex flex-col gap-2 text-sm text-text-primary">
          {localize("com_ui_select_project")}
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="h-10 rounded-lg border border-border-light bg-surface-primary px-3 text-sm outline-none focus:ring-2 focus:ring-ring-primary"
          >
            <option value="">{localize("com_ui_unassigned")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label={localize("com_ui_cancel")} variant="outline">
              {localize("com_ui_cancel")}
            </Button>
          </OGDialogClose>
          <Button onClick={saveProject}>{localize("com_ui_save")}</Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

function CoworkRoomRow({
  archiveRoom,
  deleteRoom,
  duplicateRoom,
  isActive,
  moveRoomToProject,
  onSelect,
  projects,
  renameRoom,
  room,
  togglePinRoom,
}: {
  archiveRoom: (roomId: string) => void;
  deleteRoom: (roomId: string) => void;
  duplicateRoom: (roomId: string) => void;
  isActive: boolean;
  moveRoomToProject: (roomId: string, projectId: string | null) => void;
  onSelect: () => void;
  projects: CoworkProject[];
  renameRoom: (roomId: string, title: string) => void;
  room: CoworkRoom;
  togglePinRoom: (roomId: string) => void;
}) {
  const localize = useLocalize();
  const menuId = useId();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const projectButtonRef = useRef<HTMLButtonElement>(null);
  const untitled = localize("com_ui_untitled");
  const displayTitle = room.title.trim() || untitled;
  const displayText = getRoomDisplayText(room, untitled);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState(displayTitle);
  const canMoveProject = projects.length > 0 || room.projectId;

  useEffect(() => {
    if (!isRenaming) {
      setTitleInput(displayTitle);
    }
  }, [displayTitle, isRenaming]);

  const startRename = () => {
    setTitleInput(displayTitle);
    setIsMenuOpen(false);
    setIsRenaming(true);
  };

  const submitRename = (title: string) => {
    renameRoom(room.id, title);
    setIsRenaming(false);
  };
  const coworkMenuItems = useMemo<MenuItemProps[]>(
    () => [
      {
        id: `${menuId}-share`,
        label: localize("com_ui_share"),
        icon: <Share2 className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: () => copyRoomShareText(room),
      },
      {
        id: `${menuId}-pin`,
        label: localize(room.isPinned ? "com_ui_unpin" : "com_ui_pin"),
        icon: <Pin className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: () => togglePinRoom(room.id),
      },
      {
        id: `${menuId}-rename`,
        label: localize("com_ui_rename"),
        icon: <Pen className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: startRename,
      },
      {
        id: `${menuId}-duplicate`,
        label: localize("com_ui_duplicate"),
        icon: <CopyPlus className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: () => duplicateRoom(room.id),
      },
      {
        id: `${menuId}-change-project`,
        label: localize("com_ui_change_project"),
        icon: <FolderInput className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        show: canMoveProject,
        onClick: () => setIsProjectDialogOpen(true),
        ariaHasPopup: "dialog" as const,
        ariaControls: "cowork-project-dialog",
        hideOnClick: false,
        ref: projectButtonRef,
        render: (props) => <button {...props} />,
      },
      {
        id: `${menuId}-archive`,
        label: localize("com_ui_archive"),
        icon: <Archive className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: () => archiveRoom(room.id),
      },
      {
        id: `${menuId}-delete`,
        label: localize("com_ui_delete"),
        icon: <Trash className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: () => setIsDeleteDialogOpen(true),
        ariaHasPopup: "dialog" as const,
        hideOnClick: false,
        ref: deleteButtonRef,
        render: (props) => <button {...props} />,
      },
    ],
    [
      archiveRoom,
      canMoveProject,
      displayTitle,
      duplicateRoom,
      localize,
      menuId,
      room,
      startRename,
      togglePinRoom,
    ],
  );

  return (
    <div
      className={cn(
        "group relative flex h-12 w-full items-center rounded-lg outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white md:h-9",
        isActive || isMenuOpen
          ? "bg-surface-active-alt before:absolute before:bottom-1 before:left-0 before:top-1 before:w-0.5 before:rounded-full before:bg-black dark:before:bg-white"
          : "hover:bg-surface-active-alt",
      )}
      role="button"
      tabIndex={isRenaming ? -1 : 0}
      aria-label={`${localize("com_ui_cowork")} ${localize("com_ui_chat")} ${displayTitle}`}
      onClick={() => {
        if (!isRenaming) {
          onSelect();
        }
      }}
      onKeyDown={(event) => {
        if (isRenaming) {
          return;
        }
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{ cursor: isRenaming ? "default" : "pointer" }}
    >
      {isRenaming ? (
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={submitRename}
          onCancel={() => setIsRenaming(false)}
          localize={localize}
        />
      ) : (
        <div
          className={cn(
            "flex min-w-0 grow items-center gap-2 overflow-hidden rounded-lg px-2",
            isActive ? "bg-surface-active-alt" : "",
          )}
          title={displayTitle}
          aria-current={isActive ? "page" : undefined}
          style={{ width: "100%" }}
        >
          <MessageSquareText
            className={cn(
              "h-5 w-5 shrink-0 text-text-secondary",
              room.isPinned && "text-blue-500",
            )}
            aria-hidden="true"
          />
          <div
            className="relative flex-1 grow overflow-hidden whitespace-nowrap"
            style={{ textOverflow: "clip" }}
            aria-label={displayTitle}
          >
            {displayText}
            <div
              className={cn(
                "pointer-events-none absolute bottom-0 right-0 top-0 w-20 bg-gradient-to-l",
                isActive
                  ? "from-surface-active-alt"
                  : "from-surface-primary-alt from-0% to-transparent group-hover:from-surface-active-alt group-hover:from-0%",
              )}
              aria-hidden="true"
            />
          </div>
        </div>
      )}
      <div
        className={cn(
          "mr-2 flex max-w-[28px] origin-left scale-x-100 items-center justify-center transition-all duration-150",
          isActive || isMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none max-w-0 scale-x-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:max-w-[28px] group-focus-within:scale-x-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:max-w-[28px] group-hover:scale-x-100 group-hover:opacity-100",
        )}
      >
        <DropdownPopup
          portal={true}
          focusLoop={true}
          unmountOnHide={true}
          menuId={menuId}
          isOpen={isMenuOpen}
          setIsOpen={setIsMenuOpen}
          className="z-[125] min-w-44"
          iconClassName="mr-2 text-text-secondary"
          trigger={
            <Ariakit.MenuButton
              aria-label={localize("com_ui_cowork_chat_options")}
              className={cn(iconButtonClassName, isMenuOpen && "bg-surface-active-alt")}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                }
              }}
            >
              <Ellipsis className="h-4 w-4" aria-hidden="true" />
            </Ariakit.MenuButton>
          }
          items={coworkMenuItems}
        />
      </div>
      <CoworkProjectDialog
        currentProjectId={room.projectId}
        open={isProjectDialogOpen}
        onOpenChange={setIsProjectDialogOpen}
        projects={projects}
        triggerRef={projectButtonRef}
        onSave={(projectId) => moveRoomToProject(room.id, projectId)}
      />
      <CoworkDeleteDialog
        itemTitle={displayTitle}
        itemType="chat"
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        triggerRef={deleteButtonRef}
        onDelete={() => deleteRoom(room.id)}
      />
    </div>
  );
}

function CoworkProjectRow({
  activeRoomId,
  expanded,
  onCreateRoom,
  onDeleteProject,
  onOpenProject,
  onRenameProject,
  onSelectRoom,
  onToggle,
  project,
  projects,
  roomActions,
  rooms,
}: {
  activeRoomId: string;
  expanded: boolean;
  onCreateRoom: () => void;
  onDeleteProject: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
  onRenameProject: (projectId: string, title: string) => void;
  onSelectRoom: (roomId: string) => void;
  onToggle: () => void;
  project: CoworkProject;
  projects: CoworkProject[];
  roomActions: CoworkRoomActions;
  rooms: CoworkRoom[];
}) {
  const localize = useLocalize();
  const menuId = useId();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState(project.title);

  useEffect(() => {
    if (!isRenaming) {
      setTitleInput(project.title);
    }
  }, [isRenaming, project.title]);

  const startRename = () => {
    setTitleInput(project.title);
    setIsMenuOpen(false);
    setIsRenaming(true);
  };

  const submitRename = (title: string) => {
    onRenameProject(project.id, title);
    setIsRenaming(false);
  };

  const coworkProjectMenuItems = useMemo<MenuItemProps[]>(
    () => [
      {
        id: `${menuId}-open`,
        label: localize("com_ui_open_project"),
        icon: <Folder className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: () => onOpenProject(project.id),
      },
      {
        id: `${menuId}-rename`,
        label: localize("com_ui_rename"),
        icon: <Pen className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: startRename,
      },
      {
        id: `${menuId}-delete`,
        label: localize("com_ui_delete"),
        icon: <Trash className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        onClick: () => setIsDeleteDialogOpen(true),
        ariaHasPopup: "dialog" as const,
        hideOnClick: false,
        ref: deleteButtonRef,
        render: (props) => <button {...props} />,
      },
    ],
    [localize, menuId, onOpenProject, project.id, startRename],
  );

  return (
    <li className="list-none">
      <div
        className={cn(
          "group/project-row relative flex h-9 items-center rounded-lg text-sm text-text-primary transition-colors hover:bg-surface-active-alt",
          isMenuOpen && "bg-surface-active-alt",
        )}
      >
        {isRenaming ? (
          <RenameForm
            titleInput={titleInput}
            setTitleInput={setTitleInput}
            onSubmit={submitRename}
            onCancel={() => setIsRenaming(false)}
            localize={localize}
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={project.title}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1.5 pl-1.5 pr-14 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform duration-200",
                expanded && "rotate-90",
              )}
              aria-hidden="true"
            />
            <Folder
              className="h-4 w-4 shrink-0 text-text-secondary"
              aria-hidden="true"
            />
            <span className="truncate">{project.title}</span>
          </button>
        )}
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-surface-active-alt opacity-0 transition-opacity group-focus-within/project-row:opacity-100 group-hover/project-row:opacity-100 has-[[data-state=open]]:opacity-100">
          <TooltipAnchor
            description={localize("com_ui_cowork_new_room_in_project")}
            render={
              <button
                type="button"
                aria-label={localize("com_ui_cowork_new_room_in_project")}
                className={iconButtonClassName}
                onClick={onCreateRoom}
              >
                <NewChatIcon className="h-4 w-4" />
              </button>
            }
          />
          <DropdownPopup
            portal={true}
            focusLoop={true}
            unmountOnHide={true}
            menuId={menuId}
            isOpen={isMenuOpen}
            setIsOpen={setIsMenuOpen}
            className="z-[125] min-w-44"
            iconClassName="mr-2 text-text-secondary"
            trigger={
              <Ariakit.MenuButton
                aria-label={localize("com_ui_cowork_project_options")}
                className={cn(iconButtonClassName, isMenuOpen && "bg-surface-active-alt")}
                onClick={(event) => event.stopPropagation()}
              >
                <Ellipsis className="h-4 w-4" aria-hidden="true" />
              </Ariakit.MenuButton>
            }
            items={coworkProjectMenuItems}
          />
        </div>
      </div>
      <CoworkDeleteDialog
        itemTitle={project.title}
        itemType="project"
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        triggerRef={deleteButtonRef}
        onDelete={() => onDeleteProject(project.id)}
      />
      {expanded && rooms.length > 0 && (
        <div>
          {sortRoomsByUpdatedAt(rooms).map((room) => (
            <CoworkRoomRow
              key={room.id}
              room={room}
              isActive={room.id === activeRoomId}
              projects={projects}
              {...roomActions}
              onSelect={() => onSelectRoom(room.id)}
            />
          ))}
        </div>
      )}
    </li>
  );
}

function CoworkProjectsSection({
  activeRoomId,
  expandedProjectIds,
  onDeleteProject,
  onOpenProject,
  onCreateProject,
  onCreateRoom,
  onOpenProjectsView,
  onRenameProject,
  onSelectRoom,
  onToggleProject,
  projects,
  roomActions,
  roomsByProjectId,
}: {
  activeRoomId: string;
  expandedProjectIds: string[];
  onDeleteProject: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
  onCreateRoom: (projectId: string) => void;
  onOpenProjectsView: () => void;
  onRenameProject: (projectId: string, title: string) => void;
  onSelectRoom: (roomId: string) => void;
  onToggleProject: (projectId: string) => void;
  projects: CoworkProject[];
  roomActions: CoworkRoomActions;
  roomsByProjectId: Map<string, CoworkRoom[]>;
}) {
  const localize = useLocalize();
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(true);

  return (
    <div className="flex flex-col px-3 text-sm">
      <CoworkSectionHeader
        isExpanded={isProjectsExpanded}
        label={localize("com_ui_projects")}
        newButtonLabel={localize("com_ui_cowork_new_project")}
        newButtonIcon={<FolderPlus className="h-4 w-4" aria-hidden="true" />}
        onCreate={onCreateProject}
        secondaryButtonLabel={localize("com_ui_projects")}
        secondaryButtonIcon={<Folders className="h-4 w-4" aria-hidden="true" />}
        onSecondaryAction={onOpenProjectsView}
        onToggle={() => setIsProjectsExpanded((expanded) => !expanded)}
      />

      {isProjectsExpanded && (
        <div className="scrollbar-gutter-stable max-h-[42vh] overflow-y-auto">
          {projects.length === 0 ? (
            <CoworkEmptyRow
              icon={
                <FolderPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
              }
              label={localize("com_ui_new_project")}
              subtext={localize("com_ui_cowork_new_project_empty_subtext")}
              onClick={onCreateProject}
            />
          ) : (
            <ul className="m-0 list-none p-0">
              {sortProjectsByUpdatedAt(projects).map((project) => (
                <CoworkProjectRow
                  key={project.id}
                  project={project}
                  rooms={roomsByProjectId.get(project.id) ?? []}
                  activeRoomId={activeRoomId}
                  expanded={expandedProjectIds.includes(project.id)}
                  onToggle={() => onToggleProject(project.id)}
                  onCreateRoom={() => onCreateRoom(project.id)}
                  onDeleteProject={onDeleteProject}
                  onOpenProject={onOpenProject}
                  onRenameProject={onRenameProject}
                  onSelectRoom={onSelectRoom}
                  projects={projects}
                  roomActions={roomActions}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CoworkChatsSection({
  activeRoomId,
  groupedRooms,
  onCreateRoom,
  onSelectRoom,
  projects,
  roomActions,
}: {
  activeRoomId: string;
  groupedRooms: CoworkRoomGroup[];
  onCreateRoom: () => void;
  onSelectRoom: (roomId: string) => void;
  projects: CoworkProject[];
  roomActions: CoworkRoomActions;
}) {
  const localize = useLocalize();
  const [isChatsExpanded, setIsChatsExpanded] = useState(true);
  const hasRooms = groupedRooms.length > 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col pb-2 text-sm text-text-primary">
      <div className="px-3">
        <CoworkSectionHeader
          isExpanded={isChatsExpanded}
          label={localize("com_ui_chats")}
          newButtonLabel={localize("com_ui_cowork_new_room")}
          newButtonIcon={<NewChatIcon className="h-4 w-4" />}
          onCreate={onCreateRoom}
          onToggle={() => setIsChatsExpanded((expanded) => !expanded)}
        />
      </div>

      {isChatsExpanded && (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none">
          <div className="px-3">
            {!hasRooms ? (
              <CoworkEmptyRow
                icon={
                  <MessageSquareText
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                }
                label={localize("com_ui_cowork_no_rooms")}
                subtext={localize("com_ui_cowork_new_room_empty_subtext")}
                onClick={onCreateRoom}
              />
            ) : (
              groupedRooms.map((group, groupIndex) => (
                <div key={group.groupName}>
                  <CoworkDateLabel
                    groupName={group.groupName}
                    isFirst={groupIndex === 0}
                  />
                  {group.rooms.map((room) => (
                    <CoworkRoomRow
                      key={room.id}
                      room={room}
                      isActive={room.id === activeRoomId}
                      projects={projects}
                      {...roomActions}
                      onSelect={() => onSelectRoom(room.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type CoworkRoomActions = {
  archiveRoom: (roomId: string) => void;
  deleteRoom: (roomId: string) => void;
  duplicateRoom: (roomId: string) => void;
  moveRoomToProject: (roomId: string, projectId: string | null) => void;
  renameRoom: (roomId: string, title: string) => void;
  togglePinRoom: (roomId: string) => void;
};

export default function CoworkRoomsList() {
  const localize = useLocalize();
  const {
    activeRoomId,
    archiveRoom,
    createProject,
    createRoom,
    deleteProject,
    deleteRoom,
    duplicateRoom,
    expandedProjectIds,
    moveRoomToProject,
    openProjectsView,
    projects,
    renameProject,
    renameRoom,
    rooms,
    selectRoom,
    togglePinRoom,
    toggleProject,
  } = useCoworkRooms();

  const roomActions = useMemo<CoworkRoomActions>(
    () => ({
      archiveRoom,
      deleteRoom,
      duplicateRoom,
      moveRoomToProject,
      renameRoom,
      togglePinRoom,
    }),
    [
      archiveRoom,
      deleteRoom,
      duplicateRoom,
      moveRoomToProject,
      renameRoom,
      togglePinRoom,
    ],
  );

  const visibleRooms = useMemo(() => {
    return rooms.filter((room) => !room.archivedAt);
  }, [rooms]);

  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects],
  );

  const roomsByProjectId = useMemo(() => {
    return visibleRooms.reduce<Map<string, CoworkRoom[]>>((acc, room) => {
      if (!room.projectId) {
        return acc;
      }

      const projectRooms = acc.get(room.projectId) ?? [];
      projectRooms.push(room);
      acc.set(room.projectId, projectRooms);
      return acc;
    }, new Map<string, CoworkRoom[]>());
  }, [visibleRooms]);

  const standaloneRooms = useMemo(() => {
    return visibleRooms.filter(
      (room) => !room.projectId || !projectIds.has(room.projectId),
    );
  }, [projectIds, visibleRooms]);

  const groupedStandaloneRooms = useMemo(
    () => groupCoworkRoomsByDate(standaloneRooms),
    [standaloneRooms],
  );

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden pb-3 pt-2"
      role="region"
      aria-label={localize("com_ui_cowork")}
    >
      <CoworkProjectsSection
        projects={projects}
        roomsByProjectId={roomsByProjectId}
        expandedProjectIds={expandedProjectIds}
        activeRoomId={activeRoomId}
        onCreateProject={createProject}
        onDeleteProject={deleteProject}
        onOpenProject={(projectId) => openProjectsView(projectId)}
        onOpenProjectsView={() => openProjectsView()}
        onRenameProject={renameProject}
        onToggleProject={toggleProject}
        onSelectRoom={selectRoom}
        onCreateRoom={(projectId) => createRoom(projectId)}
        roomActions={roomActions}
      />
      <div className="flex min-h-0 flex-grow flex-col overflow-hidden">
        <CoworkChatsSection
          activeRoomId={activeRoomId}
          groupedRooms={groupedStandaloneRooms}
          onCreateRoom={() => createRoom(null)}
          onSelectRoom={selectRoom}
          projects={projects}
          roomActions={roomActions}
        />
      </div>
    </section>
  );
}
