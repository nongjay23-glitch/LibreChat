import React from 'react';
import { useSetRecoilState } from 'recoil';
import { Code2, InfoIcon } from 'lucide-react';
import type { CodeBarProps } from '~/common';
import useCopyCode from '~/components/Messages/Content/useCopyCode';
import CopyButton from '~/components/Messages/Content/CopyButton';
import RunCode from '~/components/Messages/Content/RunCode';
import { setActivePanelFromOutside } from '~/Providers';
import store from '~/store';
import cn from '~/utils/cn';

interface FloatingCodeBarProps extends CodeBarProps {
  isVisible: boolean;
}

const isPatchLanguage = (lang: string) => ['diff', 'patch'].includes(lang.toLowerCase());

const FloatingCodeBar: React.FC<FloatingCodeBarProps> = React.memo(
  ({ lang, error, codeRef, blockIndex, plugin = null, allowExecution = true, isVisible }) => {
    const { isCopied, buttonRef, handleCopy } = useCopyCode(codeRef);
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
      <div
        className={cn(
          'absolute bottom-2 right-2 flex items-center gap-2 font-sans text-xs text-text-secondary transition-opacity duration-150',
          isVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {plugin === true ? (
          <InfoIcon className="flex h-4 w-4 gap-2 text-text-secondary" />
        ) : (
          <>
            {allowExecution === true && (
              <RunCode lang={lang} codeRef={codeRef} blockIndex={blockIndex} iconOnly />
            )}
            {error !== true && isPatchLanguage(lang) && (
              <button
                type="button"
                tabIndex={isVisible ? 0 : -1}
                onClick={sendPatchToCode}
                aria-label="Review diff in Code"
                className="inline-flex select-none items-center justify-center rounded-lg p-1.5 text-text-secondary transition-all duration-200 ease-out hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
              >
                <Code2 size={18} aria-hidden="true" />
              </button>
            )}
            <CopyButton
              ref={buttonRef}
              isCopied={isCopied}
              iconOnly
              tabIndex={isVisible ? 0 : -1}
              onClick={handleCopy}
            />
          </>
        )}
      </div>
    );
  },
);

export default FloatingCodeBar;
