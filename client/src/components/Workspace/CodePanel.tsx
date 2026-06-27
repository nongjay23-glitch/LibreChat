import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Code2,
  Copy,
  FileText,
  Folder,
  ListPlus,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Constants, request } from 'librechat-data-provider';
import {
  MAX_CODE_CONTEXT_BYTES,
  createCodeContextPacket,
  createCodeContextSnippet,
  createCombinedCodeContextSnippet,
  formatBytes,
  getTextBytes,
} from '~/common';
import store from '~/store';

type WorkspaceStatus = {
  enabled: boolean;
  rootLabel: string;
  mode: string;
  maxReadBytes: number;
};

type WorkspaceItem = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size: number;
  readable: boolean;
};

type WorkspaceTreeResponse = {
  path: string;
  items: WorkspaceItem[];
  truncated: boolean;
};

type WorkspaceFileResponse = {
  path: string;
  size: number;
  content: string;
};

export default function CodePanel() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileResponse | null>(null);
  const [selectedContextFiles, setSelectedContextFiles] = useState<WorkspaceFileResponse[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [sendState, setSendState] = useState<'idle' | 'attached'>('idle');
  const [contextState, setContextState] = useState<
    'idle' | 'added' | 'limit' | 'attached' | 'copied'
  >('idle');
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(0));
  const conversationId = useRecoilValue(store.conversationIdByIndex(0)) ?? Constants.NEW_CONVO;
  const setPendingCodeContext = useSetRecoilState(
    store.pendingCodeContextByConvoId(conversationId),
  );

  const pathParts = useMemo(() => currentPath.split('/').filter(Boolean), [currentPath]);
  const selectedContextText = useMemo(
    () => createCombinedCodeContextSnippet(selectedContextFiles),
    [selectedContextFiles],
  );
  const selectedContextBytes = useMemo(
    () => getTextBytes(selectedContextText),
    [selectedContextText],
  );
  const selectedPaths = useMemo(
    () => new Set(selectedContextFiles.map((file) => file.path)),
    [selectedContextFiles],
  );

  const loadStatus = useCallback(async () => {
    const data = (await request.get('/api/workspace/status')) as WorkspaceStatus;
    setStatus(data);
  }, []);

  const loadTree = useCallback(async (path = '') => {
    setIsLoadingTree(true);
    setError(null);
    try {
      const data = (await request.get(
        `/api/workspace/tree?path=${encodeURIComponent(path)}`,
      )) as WorkspaceTreeResponse;
      setCurrentPath(data.path);
      setItems(data.items);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดรายการไฟล์ไม่สำเร็จ');
    } finally {
      setIsLoadingTree(false);
    }
  }, []);

  const loadFile = useCallback(async (path: string) => {
    setIsLoadingFile(true);
    setError(null);
    setCopyState('idle');
    setSendState('idle');
    setContextState('idle');
    try {
      const data = (await request.get(
        `/api/workspace/file?path=${encodeURIComponent(path)}`,
      )) as WorkspaceFileResponse;
      setSelectedFile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ');
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  useEffect(() => {
    loadStatus()
      .then(() => loadTree(''))
      .catch((err) => setError(err instanceof Error ? err.message : 'โหลด workspace ไม่สำเร็จ'));
  }, [loadStatus, loadTree]);

  const goToCrumb = (index: number) => {
    const nextPath = pathParts.slice(0, index + 1).join('/');
    void loadTree(nextPath);
  };

  const copyContext = async () => {
    if (!selectedFile) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createCodeContextSnippet(selectedFile));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const attachFilesToChat = (files: WorkspaceFileResponse[]) => {
    if (files.length === 0) {
      return;
    }

    const packet = createCodeContextPacket(files);
    if (packet.totalBytes > MAX_CODE_CONTEXT_BYTES) {
      setContextState('limit');
      return;
    }

    setPendingCodeContext(packet);
    setActivePrompt('');
    setSendState('attached');
    setContextState('attached');
  };

  const sendToChat = () => {
    if (!selectedFile) {
      return;
    }
    attachFilesToChat([selectedFile]);
  };

  const addSelectedFileToContext = () => {
    if (!selectedFile || selectedPaths.has(selectedFile.path)) {
      return;
    }

    const nextFiles = [...selectedContextFiles, selectedFile];
    const nextBytes = getTextBytes(createCombinedCodeContextSnippet(nextFiles));
    if (nextBytes > MAX_CODE_CONTEXT_BYTES) {
      setContextState('limit');
      return;
    }

    setSelectedContextFiles(nextFiles);
    setContextState('added');
  };

  const removeContextFile = (path: string) => {
    setSelectedContextFiles((files) => files.filter((file) => file.path !== path));
    setContextState('idle');
  };

  const clearSelectedContext = () => {
    setSelectedContextFiles([]);
    setContextState('idle');
  };

  const sendSelectedContextToChat = () => {
    if (selectedContextFiles.length === 0) {
      return;
    }
    attachFilesToChat(selectedContextFiles);
  };

  const copySelectedContext = async () => {
    if (selectedContextFiles.length === 0) {
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedContextText);
      setContextState('copied');
    } catch {
      setContextState('idle');
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 text-sm">
      <div>
        <div className="mb-2 flex items-center gap-2 text-text-primary">
          <Code2 className="h-5 w-5 text-orange-500" aria-hidden="true" />
          <h2 className="text-base font-semibold">Code</h2>
        </div>
        <p className="text-sm leading-5 text-text-secondary">
          โหมดนี้เปิดให้ดูไฟล์โปรเจกต์แบบ read-only เพื่อเลือก context ไปคุยกับ AI
          ก่อน ยังไม่มีสิทธิ์เขียนไฟล์ ลบไฟล์ ย้ายไฟล์ หรือรัน terminal จากหน้าเว็บ
        </p>
      </div>

      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
          <div>
            <div className="font-medium text-text-primary">Workspace safety</div>
            <div className="mt-1 text-xs leading-5 text-text-secondary">
              Backend อ่านได้เฉพาะ mount แบบ read-only และบล็อกไฟล์ลับ เช่น `.env`,
              token, password, database, logs, uploads และ `node_modules`
            </div>
          </div>
        </div>
      </div>

      {error != null && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-500">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border-light p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="font-medium text-text-primary">
              {status?.rootLabel || 'Project workspace'}
            </div>
            <div className="text-xs text-text-secondary">
              {status?.enabled
                ? `mode: ${status.mode} · max preview ${formatBytes(status.maxReadBytes)}`
                : 'workspace ยังไม่พร้อม'}
            </div>
          </div>
          <button
            type="button"
            className="rounded-md border border-border-light p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            onClick={() => loadTree(currentPath)}
            aria-label="Refresh workspace"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingTree ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-text-secondary">
          <button type="button" className="hover:text-text-primary" onClick={() => loadTree('')}>
            root
          </button>
          {pathParts.map((part, index) => (
            <span key={`${part}-${index}`} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <button type="button" className="hover:text-text-primary" onClick={() => goToCrumb(index)}>
                {part}
              </button>
            </span>
          ))}
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {isLoadingTree && <div className="py-6 text-center text-xs text-text-secondary">กำลังโหลดไฟล์...</div>}
          {!isLoadingTree &&
            items.map((item) => (
              <button
                key={item.path}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={item.type === 'file' && !item.readable}
                onClick={() => (item.type === 'directory' ? loadTree(item.path) : loadFile(item.path))}
              >
                {item.type === 'directory' ? (
                  <Folder className="h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-text-primary">{item.name}</span>
                {item.type === 'file' && <span className="shrink-0 text-xs text-text-secondary">{formatBytes(item.size)}</span>}
              </button>
            ))}
          {!isLoadingTree && items.length === 0 && (
            <div className="py-6 text-center text-xs text-text-secondary">ไม่พบไฟล์ที่เปิดให้ดูใน path นี้</div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border-light p-3">
        <div className="mb-3 space-y-3">
          <div className="min-w-0">
            <div className="font-medium text-text-primary">File preview</div>
            <div className="break-words text-xs leading-5 text-text-secondary">
              {selectedFile ? `${selectedFile.path} · ${formatBytes(selectedFile.size)}` : 'เลือกไฟล์เพื่อดูตัวอย่าง'}
            </div>
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedFile}
            onClick={sendToChat}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {sendState === 'attached' ? 'Attached to Chat' : 'Attach to Chat'}
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-orange-500/40 px-3 py-2 text-xs font-medium text-orange-500 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedFile || (selectedFile != null && selectedPaths.has(selectedFile.path))}
            onClick={addSelectedFileToContext}
          >
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            {selectedFile != null && selectedPaths.has(selectedFile.path) ? 'Added to context' : 'Add to Context'}
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border-light px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedFile}
            onClick={copyContext}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copyState === 'copied' ? 'คัดลอกแล้ว' : copyState === 'failed' ? 'คัดลอกไม่สำเร็จ' : 'Copy context'}
          </button>
        </div>

        <pre className="max-h-72 overflow-auto rounded-md bg-black/20 p-3 text-xs leading-5 text-text-primary">
          {isLoadingFile ? 'กำลังอ่านไฟล์...' : selectedFile?.content || 'ยังไม่ได้เลือกไฟล์'}
        </pre>
      </div>

      <div className="rounded-lg border border-border-light p-3">
        <div className="mb-3">
          <div className="font-medium text-text-primary">Selected context</div>
          <div className="text-xs leading-5 text-text-secondary">
            {selectedContextFiles.length} files · {formatBytes(selectedContextBytes)} /{' '}
            {formatBytes(MAX_CODE_CONTEXT_BYTES)}
          </div>
        </div>

        {contextState === 'limit' && (
          <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs leading-5 text-red-500">
            Context รวมใหญ่เกินลิมิต เลือกไฟล์ให้น้อยลงก่อนส่งเข้า Chat
          </div>
        )}

        {selectedContextFiles.length > 0 ? (
          <div className="mb-3 max-h-40 space-y-1 overflow-y-auto">
            {selectedContextFiles.map((file) => (
              <div key={file.path} className="flex items-center gap-2 rounded-md border border-border-light px-2 py-2">
                <FileText className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-text-primary">{file.path}</div>
                  <div className="text-[11px] text-text-secondary">{formatBytes(file.size)}</div>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-red-500"
                  onClick={() => removeContextFile(file.path)}
                  aria-label={`Remove ${file.path}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-3 rounded-md bg-black/20 p-3 text-xs text-text-secondary">
            ยังไม่ได้เลือกไฟล์หลายไฟล์
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={selectedContextFiles.length === 0}
            onClick={sendSelectedContextToChat}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {contextState === 'attached' ? 'Attached to Chat' : 'Attach selected to Chat'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-md border border-border-light px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedContextFiles.length === 0}
              onClick={copySelectedContext}
            >
              Copy selected
            </button>
            <button
              type="button"
              className="rounded-md border border-border-light px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedContextFiles.length === 0}
              onClick={clearSelectedContext}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border-light p-3 text-xs leading-5 text-text-secondary">
        <div className="mb-1 flex items-center gap-2 font-medium text-text-primary">
          <Lock className="h-4 w-4" aria-hidden="true" />
          Safety rule
        </div>
        รอบนี้เป็น read-only เท่านั้น ขั้นต่อไปถ้าจะให้ AI แก้ไฟล์จริง จะต้องมีหน้า diff
        และปุ่มยืนยันก่อนเขียนไฟล์
      </div>
    </section>
  );
}
