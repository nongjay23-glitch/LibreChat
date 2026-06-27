import React from 'react';
import { useSetRecoilState } from 'recoil';
import { Code2, InfoIcon } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { CodeBarProps } from '~/common';
import useCopyCode from '~/components/Messages/Content/useCopyCode';
import CopyButton from '~/components/Messages/Content/CopyButton';
import LangIcon from '~/components/Messages/Content/LangIcon';
import RunCode from '~/components/Messages/Content/RunCode';
import { useLocalize } from '~/hooks';
import { setActivePanelFromOutside } from '~/Providers';
import store from '~/store';

const isPatchLanguage = (lang: string) => ['diff', 'patch'].includes(lang.toLowerCase());

const CodeBar: React.FC<CodeBarProps> = React.memo(
  ({ lang, error, codeRef, blockIndex, plugin = null, allowExecution = true }) => {
    const localize = useLocalize();
    const { isCopied, handleCopy } = useCopyCode(codeRef);
    const setPendingWorkspacePatch = useSetRecoilState(store.pendingWorkspacePatchByIndex(0));
    const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);

    const sendPatchToCode = () => {
      const patchText = codeRef.current?.textContent ?? '';
      if (!patchText.trim()) {
        return;
      }
      setPendingWorkspacePatch(patchText);
      setActivePanelFromOutside('code-workspace');
      setSidebarExpanded(true);
    };

    return (
      <div className="flex items-center justify-between bg-surface-primary-alt px-1.5 py-1.5 font-sans text-xs text-text-secondary dark:bg-transparent">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <LangIcon lang={lang} className="size-3.5" />
          {lang}
        </span>
        {plugin === true ? (
          <InfoIcon className="ml-auto flex h-4 w-4 gap-2 text-text-secondary" />
        ) : (
          <div className="flex items-center justify-center gap-2">
            {allowExecution === true && (
              <RunCode lang={lang} codeRef={codeRef} blockIndex={blockIndex} />
            )}
            {error !== true && isPatchLanguage(lang) && (
              <TooltipAnchor
                description="Review in Code"
                render={
                  <button
                    type="button"
                    onClick={sendPatchToCode}
                    aria-label="Review diff in Code"
                    className="inline-flex select-none items-center justify-center rounded-lg p-1.5 text-text-secondary transition-all duration-200 ease-out hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
                  >
                    <Code2 size={18} aria-hidden="true" />
                  </button>
                }
              />
            )}
            {error !== true && (
              <CopyButton
                isCopied={isCopied}
                onClick={handleCopy}
                label={localize('com_ui_copy_code')}
              />
            )}
          </div>
        )}
      </div>
    );
  },
);

export default CodeBar;
