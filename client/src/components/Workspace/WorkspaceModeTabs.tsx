import { Code2, MessagesSquare, UsersRound } from "lucide-react";
import { useActivePanel, resolveActivePanel } from "~/Providers";
import type { NavLink } from "~/common";
import { cn } from "~/utils";

const modes = [
  { id: "conversations", label: "Chat", icon: MessagesSquare },
  { id: "cowork", label: "Cowork", icon: UsersRound },
  { id: "code-workspace", label: "Code", icon: Code2 },
];

export default function WorkspaceModeTabs({ links }: { links: NavLink[] }) {
  const { active, setActive } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);

  return (
    <div className="border-b border-border-light px-3 py-3">
      <div
        className="grid grid-cols-3 gap-1 rounded-lg bg-surface-secondary p-1"
        role="tablist"
        aria-label="โหมดพื้นที่ทำงาน"
      >
        {modes.map((mode) => {
          const isActive = effectiveActive === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(mode.id)}
              className={cn(
                "flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors",
                isActive
                  ? "bg-surface-active-alt text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <mode.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{mode.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
