import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileCode2, FileText } from 'lucide-react';
import type { TCodeContext } from 'librechat-data-provider';
import { formatBytes } from '~/common';

function MessageCodeContext({ codeContext }: { codeContext?: TCodeContext }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    setActivePath(codeContext?.files[0]?.path ?? null);
    setIsOpen(false);
  }, [codeContext?.id, codeContext?.files]);

  const activeFile = useMemo(() => {
    if (!codeContext) {
      return null;
    }
    return codeContext.files.find((file) => file.path === activePath) ?? codeContext.files[0];
  }, [activePath, codeContext]);

  if (!codeContext || codeContext.files.length === 0) {
    return null;
  }

  return (
    <div
      className="w-full max-w-3xl rounded-2xl border border-orange-500/25 bg-orange-500/10 text-sm text-text-secondary"
      data-testid="message-code-context"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-label="Open attached code files"
      >
        <FileCode2 className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          Code files · {codeContext.files.length} files · {formatBytes(codeContext.totalBytes)}
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="grid gap-3 border-t border-orange-500/20 p-3 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="max-h-56 min-h-0 space-y-1 overflow-y-auto rounded-lg border border-border-light bg-surface-secondary p-2">
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
            <pre className="max-h-56 overflow-auto rounded-lg bg-black/25 p-3 text-xs leading-5 text-text-primary">
              {activeFile?.content ?? ''}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(MessageCodeContext);
