import { memo } from 'react';
import { resolveActivePanel, useActivePanel } from '~/Providers';
import type { NavLink } from '~/common';
import SidePanelNav from '~/components/SidePanel/Nav';
import WorkspaceModeTabs from '~/components/Workspace/WorkspaceModeTabs';
import ExpandedPanel from './ExpandedPanel';
import { cn } from '~/utils';

function Sidebar({
  links,
  expanded,
  onCollapse,
  onExpand,
  onResizeStart,
  onResizeKeyboard,
}: {
  links: NavLink[];
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onResizeKeyboard: (direction: 'shrink' | 'grow') => void;
}) {
  const { active } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  const isSourcesActive = effectiveActive === 'sources';

  return (
    <>
      <div className="flex h-full w-full overflow-hidden">
        <ExpandedPanel
          links={links}
          expanded={expanded}
          onCollapse={onCollapse}
          onExpand={onExpand}
        />
        <nav
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-primary-alt',
            isSourcesActive
              ? 'fixed bottom-0 right-0 top-0 z-40 border-r border-border-light'
              : '',
            expanded || isSourcesActive ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          style={{
            left: isSourcesActive ? '52px' : undefined,
            transition: expanded ? 'opacity 200ms ease 80ms' : 'opacity 150ms ease',
          }}
          aria-hidden={!expanded && !isSourcesActive}
        >
          <WorkspaceModeTabs links={links} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <SidePanelNav links={links} />
          </div>
        </nav>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={expanded ? 0 : -1}
        className={cn(
          'absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-border-medium active:bg-border-heavy',
          expanded && !isSourcesActive ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ transition: expanded ? 'opacity 200ms ease 80ms' : 'opacity 150ms ease' }}
        onMouseDown={onResizeStart}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            onResizeKeyboard('shrink');
          } else if (e.key === 'ArrowRight') {
            onResizeKeyboard('grow');
          }
        }}
      />
    </>
  );
}

export default memo(Sidebar);
