import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { FileCode2, FileText, X } from 'lucide-react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { formatBytes } from '~/common';
import store from '~/store';

function PendingCodeContextChips({ conversationId }: { conversationId: string }) {
  const codeContext = useRecoilValue(store.pendingCodeContextByConvoId(conversationId));
  const setCodeContext = useSetRecoilState(store.pendingCodeContextByConvoId(conversationId));
  const [activePath, setActivePath] = useState<string | null>(null);
  const popover = Ariakit.usePopoverStore({ placement: 'top-start' });

  useEffect(() => {
    setActivePath(codeContext?.files[0]?.path ?? null);
  }, [codeContext?.id, codeContext?.files]);

  const activeFile = useMemo(() => {
    if (!codeContext) {
      return null;
    }
    return codeContext.files.find((file) => file.path === activePath) ?? codeContext.files[0];
  }, [activePath, codeContext]);

  const clear = useCallback(() => {
    setCodeContext(null);
    popover.hide();
  }, [popover, setCodeContext]);

  if (!codeContext || codeContext.files.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 px-2 pt-2"
      role="list"
      aria-label="Attached code context"
      data-testid="pending-code-context-chip"
    >
      <span
        role="listitem"
        className="inline-flex max-w-full items-center gap-1 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-2.5 py-1.5 text-sm text-text-secondary"
      >
        <Ariakit.PopoverDisclosure
          store={popover}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
          aria-label="Open attached code context"
        >
          <FileCode2 className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
          <span className="truncate">
            Code context · {codeContext.files.length} files · {formatBytes(codeContext.totalBytes)}
          </span>
        </Ariakit.PopoverDisclosure>
        <button
          type="button"
          aria-label="Remove attached code context"
          onClick={clear}
          className="-mr-0.5 shrink-0 rounded-full p-0.5 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>

      <Ariakit.Popover
        store={popover}
        portal
        gutter={8}
        className="z-50 flex max-h-[72vh] w-[44rem] max-w-[94vw] flex-col rounded-xl border border-border-light bg-surface-secondary p-3 text-text-primary shadow-lg outline-none"
      >
        <div className="mb-3">
          <div className="text-sm font-semibold">Code context</div>
          <div className="mt-1 text-xs leading-5 text-text-secondary">
            แนบไฟล์จาก Code แล้ว โมเดลจะได้รับเนื้อหาเมื่อส่งข้อความ กดชื่อไฟล์เพื่อดูข้อความในไฟล์นั้น
          </div>
        </div>

        <div className="grid min-h-0 gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="max-h-72 min-h-0 space-y-1 overflow-y-auto rounded-lg border border-border-light p-2">
            {codeContext.files.map((file) => (
              <button
                key={file.path}
                type="button"
                className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs ${
                  activeFile?.path === file.path
                    ? 'bg-surface-active-alt text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
                onClick={() => setActivePath(file.path)}
              >
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{file.path}</span>
                  <span className="block text-[11px]">{formatBytes(file.size)}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="min-w-0">
            <div className="mb-2 truncate text-xs font-medium text-text-secondary">
              {activeFile?.path}
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg bg-black/25 p-3 text-xs leading-5 text-text-primary">
              {activeFile?.content ?? ''}
            </pre>
          </div>
        </div>
      </Ariakit.Popover>
    </div>
  );
}

export default memo(PendingCodeContextChips);
