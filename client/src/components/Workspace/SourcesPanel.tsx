import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  FilePlus2,
  FileText,
  MessageSquareText,
  NotebookPen,
  PanelRightOpen,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import type { ChangeEvent } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

type SourceType = 'text' | 'markdown';
type SourceStatus = 'ready' | 'disabled' | 'too_large' | 'blocked' | 'unsupported' | 'parse_error';

type NotebookSource = {
  id: string;
  title: string;
  type: SourceType;
  content: string;
  sizeBytes: number;
  enabled: boolean;
  baseStatus: Exclude<SourceStatus, 'disabled'>;
  addedAt: string;
};

type NotebookNote = {
  id: string;
  content: string;
  addedAt: string;
};

type SourceInput = {
  title: string;
  type: SourceType;
  content: string;
  sizeBytes: number;
  baseStatus: NotebookSource['baseStatus'];
};

const maxSourceBytes = 100 * 1024;

const statusLabelKeys: Record<SourceStatus, TranslationKeys> = {
  ready: 'com_ui_sources_status_ready',
  disabled: 'com_ui_sources_status_disabled',
  too_large: 'com_ui_sources_status_too_large',
  blocked: 'com_ui_sources_status_blocked',
  unsupported: 'com_ui_sources_status_unsupported',
  parse_error: 'com_ui_sources_status_parse_error',
};

const statusClassNames: Record<SourceStatus, string> = {
  ready: 'border-green-500/30 bg-green-500/10 text-green-600',
  disabled: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600',
  too_large: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600',
  blocked: 'border-red-500/30 bg-red-500/10 text-red-600',
  unsupported: 'border-red-500/30 bg-red-500/10 text-red-600',
  parse_error: 'border-red-500/30 bg-red-500/10 text-red-600',
};

const sourceTypeLabelKeys: Record<SourceType, TranslationKeys> = {
  text: 'com_ui_sources_type_text',
  markdown: 'com_ui_sources_type_markdown',
};

const riskySourcePattern =
  /(^|[/\\])(\.env|\.git|node_modules|logs?|uploads?|database)([/\\.]|$)|\b(api[-_ ]?key|token|password|credential|secret|database|uploads?)\b/i;

const getSourceStatus = (source: NotebookSource): SourceStatus => {
  if (source.baseStatus !== 'ready') {
    return source.baseStatus;
  }

  return source.enabled ? 'ready' : 'disabled';
};

const createSourceId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const getTextBytes = (value: string) => new Blob([value]).size;

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const getFileType = (fileName: string): SourceType | null => {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.md')) {
    return 'markdown';
  }
  if (lowerName.endsWith('.txt')) {
    return 'text';
  }
  return null;
};

const getSafeSourceInput = ({
  title,
  type,
  content,
  sizeBytes,
}: Omit<SourceInput, 'baseStatus'>): SourceInput => {
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();
  const secretLike = riskySourcePattern.test(trimmedTitle) || riskySourcePattern.test(trimmedContent);

  if (secretLike) {
    return {
      title: trimmedTitle,
      type,
      content: '',
      sizeBytes,
      baseStatus: 'blocked',
    };
  }

  if (sizeBytes > maxSourceBytes) {
    return {
      title: trimmedTitle,
      type,
      content: '',
      sizeBytes,
      baseStatus: 'too_large',
    };
  }

  if (!trimmedContent) {
    return {
      title: trimmedTitle,
      type,
      content: '',
      sizeBytes,
      baseStatus: 'parse_error',
    };
  }

  return {
    title: trimmedTitle,
    type,
    content: trimmedContent,
    sizeBytes,
    baseStatus: 'ready',
  };
};

export default function SourcesPanel() {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteTitleRef = useRef<HTMLInputElement>(null);
  const pasteContentRef = useRef<HTMLTextAreaElement>(null);
  const conversationId = useRecoilValue(store.conversationIdByIndex(0)) ?? Constants.NEW_CONVO;
  const [sourcesByConversationId, setSourcesByConversationId] = useState<
    Record<string, NotebookSource[]>
  >({});
  const [selectedSourceIdByConversationId, setSelectedSourceIdByConversationId] = useState<
    Record<string, string | null>
  >({});
  const [notesByConversationId, setNotesByConversationId] = useState<Record<string, NotebookNote[]>>(
    {},
  );
  const [noteDraftByConversationId, setNoteDraftByConversationId] = useState<Record<string, string>>(
    {},
  );
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const sources = sourcesByConversationId[conversationId] ?? [];
  const selectedSourceId = selectedSourceIdByConversationId[conversationId] ?? null;
  const notes = notesByConversationId[conversationId] ?? [];
  const noteDraft = noteDraftByConversationId[conversationId] ?? '';

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );

  const enabledCount = useMemo(
    () => sources.filter((source) => getSourceStatus(source) === 'ready').length,
    [sources],
  );

  const setCurrentSources = (updater: (currentSources: NotebookSource[]) => NotebookSource[]) => {
    setSourcesByConversationId((currentByConversationId) => ({
      ...currentByConversationId,
      [conversationId]: updater(currentByConversationId[conversationId] ?? []),
    }));
  };

  const setCurrentSelectedSourceId = (sourceId: string | null) => {
    setSelectedSourceIdByConversationId((currentByConversationId) => ({
      ...currentByConversationId,
      [conversationId]: sourceId,
    }));
  };

  const setCurrentNoteDraft = (value: string) => {
    setNoteDraftByConversationId((currentByConversationId) => ({
      ...currentByConversationId,
      [conversationId]: value,
    }));
  };

  const addNote = () => {
    const content = noteDraft.trim();
    if (!content) {
      return;
    }

    const note: NotebookNote = {
      id: createSourceId(),
      content,
      addedAt: new Date().toISOString(),
    };

    setNotesByConversationId((currentByConversationId) => ({
      ...currentByConversationId,
      [conversationId]: [note, ...(currentByConversationId[conversationId] ?? [])],
    }));
    setCurrentNoteDraft('');
  };

  const addSource = (input: SourceInput) => {
    const source: NotebookSource = {
      id: createSourceId(),
      enabled: input.baseStatus === 'ready',
      addedAt: new Date().toISOString(),
      ...input,
    };

    setCurrentSources((currentSources) => [source, ...currentSources]);
    setCurrentSelectedSourceId(source.id);
  };

  const handleAddPastedSource = () => {
    const title = pasteTitleRef.current?.value ?? '';
    const content = pasteContentRef.current?.value.trim() ?? '';

    if (!content) {
      setFormError(localize('com_ui_sources_error_empty_content'));
      return;
    }

    addSource(
      getSafeSourceInput({
        title: title.trim() || localize('com_ui_sources_untitled'),
        type: 'text',
        content,
        sizeBytes: getTextBytes(content),
      }),
    );
    if (pasteTitleRef.current) {
      pasteTitleRef.current.value = '';
    }
    if (pasteContentRef.current) {
      pasteContentRef.current.value = '';
    }
    setFormError('');
    setIsAddSourceOpen(false);
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    files.forEach((file) => {
      const fileType = getFileType(file.name);

      if (riskySourcePattern.test(file.name)) {
        addSource({
          title: file.name,
          type: fileType ?? 'text',
          content: '',
          sizeBytes: file.size,
          baseStatus: 'blocked',
        });
        return;
      }

      if (!fileType) {
        addSource({
          title: file.name,
          type: 'text',
          content: '',
          sizeBytes: file.size,
          baseStatus: 'unsupported',
        });
        return;
      }

      if (file.size > maxSourceBytes) {
        addSource({
          title: file.name,
          type: fileType,
          content: '',
          sizeBytes: file.size,
          baseStatus: 'too_large',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : '';
        addSource(
          getSafeSourceInput({
            title: file.name,
            type: fileType,
            content,
            sizeBytes: file.size,
          }),
        );
      };
      reader.onerror = () => {
        addSource({
          title: file.name,
          type: fileType,
          content: '',
          sizeBytes: file.size,
          baseStatus: 'parse_error',
        });
      };
      reader.readAsText(file);
    });
  };

  const toggleSource = (sourceId: string) => {
    setCurrentSources((currentSources) =>
      currentSources.map((source) => {
        if (source.id !== sourceId || source.baseStatus !== 'ready') {
          return source;
        }
        return { ...source, enabled: !source.enabled };
      }),
    );
  };

  const removeSource = (sourceId: string) => {
    setCurrentSources((currentSources) => {
      const nextSources = currentSources.filter((source) => source.id !== sourceId);
      if (selectedSourceId === sourceId) {
        setCurrentSelectedSourceId(nextSources[0]?.id ?? null);
      }
      return nextSources;
    });
  };

  const renderStatusBadge = (status: SourceStatus) => (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
        statusClassNames[status],
      )}
    >
      {localize(statusLabelKeys[status])}
    </span>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-primary text-text-primary">
      <div className="border-b border-border-light px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpenText className="h-5 w-5 text-text-secondary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-xs text-text-secondary">
                  {localize('com_ui_sources_default_notebook')}
                </p>
                <h2 className="truncate text-lg font-semibold">{localize('com_ui_sources')}</h2>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="rounded-md border border-border-light px-2 py-1">
              {localize('com_ui_sources_chat_source_count', { count: enabledCount })}
            </span>
            <span className="rounded-md border border-border-light px-2 py-1">
              {notes.length} {localize('com_ui_sources_notes')}
            </span>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)_320px] lg:overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <aside className="flex min-h-[420px] flex-col border-b border-border-light lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="border-b border-border-light p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                <h3 className="truncate text-xs font-semibold uppercase text-text-secondary">
                  {localize('com_ui_sources_references')}
                </h3>
                <span className="rounded-md bg-surface-secondary px-1.5 py-0.5 text-[11px] text-text-secondary">
                  {enabledCount}/{sources.length}
                </span>
              </div>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                onClick={() => setIsAddSourceOpen((open) => !open)}
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                {localize('com_ui_sources_add_source')}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              data-testid="sources-file-input"
              onChange={handleFilesSelected}
            />

            {isAddSourceOpen ? (
              <section className="mt-3 rounded-lg border border-border-light bg-surface-primary-alt p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">{localize('com_ui_sources_add_text')}</h4>
                  <button
                    type="button"
                    className="text-xs font-medium text-text-secondary hover:text-text-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {localize('com_ui_sources_add_file')}
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  <input
                    ref={pasteTitleRef}
                    className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder={localize('com_ui_sources_title_placeholder')}
                    aria-label={localize('com_ui_sources_title')}
                  />
                  <textarea
                    ref={pasteContentRef}
                    className="min-h-[92px] w-full resize-y rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder={localize('com_ui_sources_content_placeholder')}
                    aria-label={localize('com_ui_sources_content')}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-text-secondary">
                    {localize('com_ui_sources_size_limit')} {formatBytes(maxSourceBytes)}
                  </p>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-light px-3 text-xs font-semibold hover:bg-surface-hover"
                    onClick={handleAddPastedSource}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {localize('com_ui_sources_add_source')}
                  </button>
                </div>
                {formError ? (
                  <p className="mt-2 text-xs font-medium text-red-600">{formError}</p>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {sources.length === 0 ? (
              <div className="flex flex-1 flex-col justify-center px-4 py-6 text-center">
                <FileText className="mx-auto h-8 w-8 text-text-secondary" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">{localize('com_ui_sources_empty_title')}</p>
                <p className="mt-2 text-xs text-text-secondary">
                  {localize('com_ui_sources_empty_help')}
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                {sources.map((source) => {
                  const status = getSourceStatus(source);
                  const selected = selectedSourceId === source.id;
                  return (
                    <div
                      key={source.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        selected
                          ? 'border-blue-500/50 bg-blue-500/10'
                          : 'border-border-light bg-surface-primary-alt hover:bg-surface-hover',
                      )}
                      data-testid="sources-list-item"
                      onClick={() => setCurrentSelectedSourceId(source.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setCurrentSelectedSourceId(source.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{source.title}</p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {localize(sourceTypeLabelKeys[source.type])} -{' '}
                            {formatBytes(source.sizeBytes)}
                          </p>
                        </div>
                        {renderStatusBadge(status)}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-text-secondary">
                          {formatDate(source.addedAt)}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary"
                            title={
                              source.baseStatus === 'ready'
                                ? localize('com_ui_sources_toggle')
                                : localize('com_ui_sources_toggle_unavailable')
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSource(source.id);
                            }}
                          >
                            {source.enabled ? (
                              <ToggleRight className="h-4 w-4 text-green-600" aria-hidden="true" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:text-red-500"
                            title={localize('com_ui_sources_remove')}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeSource(source.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <section className="border-t border-border-light p-3">
              <div className="mb-2 flex items-center gap-2">
                <PanelRightOpen className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                <h3 className="truncate text-xs font-semibold uppercase text-text-secondary">
                  {localize('com_ui_sources_selected_detail')}
                </h3>
              </div>
              {selectedSource ? (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border-light bg-surface-primary-alt p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{selectedSource.title}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {localize(sourceTypeLabelKeys[selectedSource.type])} -{' '}
                        {formatBytes(selectedSource.sizeBytes)}
                      </p>
                    </div>
                    {renderStatusBadge(getSourceStatus(selectedSource))}
                  </div>
                  {selectedSource.content ? (
                    <pre className="mt-3 max-h-28 whitespace-pre-wrap break-words text-xs leading-5 text-text-primary">
                      {selectedSource.content}
                    </pre>
                  ) : (
                    <div className="mt-3 flex items-start gap-2 text-xs text-text-secondary">
                      <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden="true" />
                      <p>{localize('com_ui_sources_preview_unavailable')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-border-light bg-surface-primary-alt p-3 text-xs text-text-secondary">
                  {localize('com_ui_sources_preview_empty_help')}
                </p>
              )}
            </section>
          </div>
        </aside>

        <main className="flex min-h-[520px] flex-col border-b border-border-light lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                <h3 className="truncate text-sm font-semibold">
                  {localize('com_ui_sources_librarian')}
                </h3>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {localize('com_ui_sources_chat_source_count', { count: enabledCount })}
              </p>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-light bg-surface-primary-alt">
                <MessageSquareText className="h-6 w-6 text-text-secondary" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                {localize('com_ui_sources_chat_empty_title')}
              </h3>
              <p className="mt-2 max-w-md text-sm text-text-secondary">
                {localize('com_ui_sources_librarian_help')}
              </p>
            </div>

            <div className="border-t border-border-light p-4">
              <div className="flex items-end gap-2 rounded-xl border border-border-light bg-surface-primary-alt p-2">
                <textarea
                  className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
                  disabled
                  placeholder={localize('com_ui_sources_chat_input_placeholder')}
                  aria-label={localize('com_ui_sources_chat_input_placeholder')}
                />
                <button
                  type="button"
                  disabled
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-light text-text-secondary opacity-70"
                  title={localize('com_ui_sources_send_disabled')}
                >
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside className="flex min-h-[420px] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border-light px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <NotebookPen className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              <h3 className="truncate text-xs font-semibold uppercase text-text-secondary">
                {localize('com_ui_sources_notes')}
              </h3>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-light px-3 text-xs font-semibold hover:bg-surface-hover"
              onClick={addNote}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {localize('com_ui_sources_add_note')}
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <textarea
              className="min-h-[84px] resize-y rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={noteDraft}
              placeholder={localize('com_ui_sources_notes_placeholder')}
              aria-label={localize('com_ui_sources_notes')}
              onChange={(event) => setCurrentNoteDraft(event.target.value)}
            />
            {notes.length === 0 ? (
              <div className="rounded-lg border border-border-light bg-surface-primary-alt p-4 text-sm text-text-secondary">
                {localize('com_ui_sources_notes_empty')}
              </div>
            ) : (
              notes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-lg border border-border-light bg-surface-primary-alt p-3"
                >
                  <p className="whitespace-pre-wrap break-words text-sm">{note.content}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-text-secondary">
                      {formatDate(note.addedAt)}
                    </span>
                    <button
                      type="button"
                      disabled
                      className="rounded-md border border-border-light px-2 py-1 text-xs font-medium text-text-secondary opacity-70"
                    >
                      {localize('com_ui_sources_note_source_disabled')}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
