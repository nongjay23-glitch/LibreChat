import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Code2,
  Copy,
  FileText,
  Folder,
  History,
  ListPlus,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
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
  canApplyPatches?: boolean;
  canRestoreCheckpoints?: boolean;
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

type WorkspaceCheckpoint = {
  checkpointId: string;
  savedFiles: string[];
  createdFiles?: string[];
};

type WorkspaceCheckpointsResponse = {
  checkpoints: WorkspaceCheckpoint[];
};

type CheckpointCleanupResponse = {
  keep: number;
  deleted: string[];
};

type CodeSection = 'files' | 'changes' | 'history';

type WorkspaceActivity = {
  id: string;
  timestamp: string;
  type: string;
  status: string;
  summary: string;
  files?: string[];
};

type WorkspaceActivityResponse = {
  activities: WorkspaceActivity[];
};

type DiffFileSummary = {
  path: string;
  added: number;
  removed: number;
  hunks: number;
  warnings: string[];
};

type RequestError = Error & {
  response?: {
    data?: {
      message?: string;
    };
  };
};

const getRequestErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error) {
    return (err as RequestError).response?.data?.message || err.message;
  }
  return fallback;
};

const getPatchApplyMessage = (err: unknown) => {
  const message = getRequestErrorMessage(err, 'Apply patch failed');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('patch does not apply')) {
    return 'Patch ใช้ไม่ได้กับไฟล์ปัจจุบันแล้ว ไฟล์น่าจะเปลี่ยนไปหลังจาก AI สร้าง diff ให้เปิดไฟล์ล่าสุดแล้วขอ AI สร้าง unified diff ใหม่';
  }

  if (lowerMessage.includes('already exists in working directory')) {
    return 'Patch ต้องการสร้างไฟล์ใหม่ แต่มีไฟล์ชื่อนี้อยู่แล้ว ให้ขอ AI สร้าง diff แบบแก้ไฟล์เดิม หรือเปลี่ยนชื่อไฟล์ใหม่';
  }

  if (lowerMessage.includes('outside workspace') || lowerMessage.includes('blocked')) {
    return 'Patch ถูกบล็อกเพื่อความปลอดภัย เพราะพยายามแก้ไฟล์นอก workspace หรือไฟล์ที่ระบบไม่อนุญาต';
  }

  return message;
};

const formatCheckpointId = (checkpointId: string) =>
  checkpointId.replace('T', ' ').replace(/-\d{3}Z$/, 'Z');

const CODE_SECTIONS: Array<{ id: CodeSection; label: string }> = [
  { id: 'files', label: 'Files' },
  { id: 'changes', label: 'Changes' },
  { id: 'history', label: 'History' },
];

const getDiffPath = (rawPath: string) =>
  rawPath
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^[ab]\//, '');

const getDiffPathWarnings = (path: string) => {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const warnings: string[] = [];

  if (path.startsWith('/') || /^[a-z]:/i.test(path) || normalized.includes('../')) {
    warnings.push('path ออกนอก workspace');
  }

  if (
    normalized === '.env' ||
    normalized.includes('/.env') ||
    normalized.includes('token') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('credential')
  ) {
    warnings.push('ไฟล์ลับหรือชื่อไฟล์เสี่ยง');
  }

  if (
    normalized.startsWith('.git/') ||
    normalized.includes('/.git/') ||
    normalized.startsWith('node_modules/') ||
    normalized.includes('/node_modules/') ||
    normalized.startsWith('logs/') ||
    normalized.startsWith('uploads/')
  ) {
    warnings.push('โฟลเดอร์นี้ถูกบล็อก');
  }

  return warnings;
};

const parseUnifiedDiff = (patchText: string) => {
  const files: DiffFileSummary[] = [];
  const warnings: string[] = [];
  const lines = patchText.split(/\r?\n/);
  let current: DiffFileSummary | null = null;

  const ensureFile = (path: string) => {
    const normalizedPath = getDiffPath(path);
    if (!normalizedPath || normalizedPath === '/dev/null') {
      return null;
    }
    let file = files.find((item) => item.path === normalizedPath);
    if (!file) {
      file = {
        path: normalizedPath,
        added: 0,
        removed: 0,
        hunks: 0,
        warnings: getDiffPathWarnings(normalizedPath),
      };
      files.push(file);
    }
    return file;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.split(/\s+/);
      current = ensureFile(parts[3] ?? parts[2] ?? '');
      continue;
    }

    if (line.startsWith('+++ ')) {
      const path = line.slice(4);
      if (!path.includes('/dev/null')) {
        current = ensureFile(path);
      }
      continue;
    }

    if (line.startsWith('@@')) {
      if (current) {
        current.hunks += 1;
      }
      continue;
    }

    if (!current || line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      current.added += 1;
    } else if (line.startsWith('-')) {
      current.removed += 1;
    }
  }

  if (patchText.trim().length > 0 && files.length === 0) {
    warnings.push('ยังอ่านไฟล์จาก diff ไม่ได้ ตรวจว่าเป็น unified diff หรือไม่');
  }

  return {
    files,
    warnings,
    hasWarnings: warnings.length > 0 || files.some((file) => file.warnings.length > 0),
  };
};

export default function CodePanel() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [activeCodeSection, setActiveCodeSection] = useState<CodeSection>('files');
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [fileSearch, setFileSearch] = useState('');
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
  const [patchText, setPatchText] = useState('');
  const [applyState, setApplyState] = useState<'idle' | 'applying' | 'applied' | 'failed'>(
    'idle',
  );
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [patchPromptCopyState, setPatchPromptCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [isApplyConfirmVisible, setIsApplyConfirmVisible] = useState(false);
  const [checkpoints, setCheckpoints] = useState<WorkspaceCheckpoint[]>([]);
  const [isLoadingCheckpoints, setIsLoadingCheckpoints] = useState(false);
  const [restoreState, setRestoreState] = useState<'idle' | 'restoring' | 'restored' | 'failed'>(
    'idle',
  );
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [pendingRestoreCheckpointId, setPendingRestoreCheckpointId] = useState<string | null>(
    null,
  );
  const [checkpointActionState, setCheckpointActionState] = useState<
    'idle' | 'cleaning' | 'deleting' | 'done' | 'failed'
  >('idle');
  const [checkpointActionMessage, setCheckpointActionMessage] = useState<string | null>(null);
  const [activities, setActivities] = useState<WorkspaceActivity[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isSelectedContextOpen, setIsSelectedContextOpen] = useState(false);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(0));
  const conversationId = useRecoilValue(store.conversationIdByIndex(0)) ?? Constants.NEW_CONVO;
  const setPendingCodeContext = useSetRecoilState(
    store.pendingCodeContextByConvoId(conversationId),
  );
  const [pendingWorkspacePatch, setPendingWorkspacePatch] = useRecoilState(
    store.pendingWorkspacePatchByIndex(0),
  );

  const pathParts = useMemo(() => currentPath.split('/').filter(Boolean), [currentPath]);
  const normalizedFileSearch = fileSearch.trim().toLowerCase();
  const filteredItems = useMemo(
    () =>
      normalizedFileSearch
        ? items.filter((item) =>
            `${item.name} ${item.path}`.toLowerCase().includes(normalizedFileSearch),
          )
        : items,
    [items, normalizedFileSearch],
  );
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
  const patchPreview = useMemo(() => parseUnifiedDiff(patchText), [patchText]);
  const patchTotals = useMemo(
    () =>
      patchPreview.files.reduce(
        (totals, file) => ({
          added: totals.added + file.added,
          removed: totals.removed + file.removed,
          hunks: totals.hunks + file.hunks,
        }),
        { added: 0, removed: 0, hunks: 0 },
      ),
    [patchPreview.files],
  );
  const canApplyPatch =
    Boolean(status?.canApplyPatches) &&
    patchText.trim().length > 0 &&
    patchPreview.files.length > 0 &&
    !patchPreview.hasWarnings &&
    applyState !== 'applied' &&
    applyState !== 'applying';
  const patchReviewHint = useMemo(() => {
    if (patchText.trim().length === 0 || applyState === 'applied') {
      return null;
    }

    if (patchPreview.files.length === 0) {
      return 'ยังไม่พบไฟล์ใน unified diff ต้องมีบรรทัด --- a/file, +++ b/file และ @@ hunk จาก AI';
    }

    if (patchPreview.hasWarnings) {
      return 'ยัง apply ไม่ได้ เพราะ diff มี path ที่เสี่ยงหรือถูกบล็อก ตรวจชื่อไฟล์ในรายการด้านล่างก่อน';
    }

    if (!status?.canApplyPatches) {
      return 'Backend ยังไม่เปิด Safe writes จึง preview ได้อย่างเดียว ยังเขียนไฟล์จริงไม่ได้';
    }

    return null;
  }, [applyState, patchPreview.files.length, patchPreview.hasWarnings, patchText, status?.canApplyPatches]);
  const patchRetryPrompt = useMemo(() => {
    const fileList = patchPreview.files.map((file) => `- ${file.path}`).join('\n');
    const warningList = [
      ...patchPreview.warnings,
      ...patchPreview.files.flatMap((file) =>
        file.warnings.map((warning) => `${file.path}: ${warning}`),
      ),
    ].join('\n');
    const filesText = fileList ? `\n\nไฟล์ที่เกี่ยวข้อง:\n${fileList}` : '';
    const warningsText = warningList ? `\n\nข้อควรแก้ใน diff เดิม:\n${warningList}` : '';
    const errorText =
      applyState === 'failed' && applyMessage ? `\n\nerror ล่าสุด:\n${applyMessage}` : '';

    return [
      'สร้าง unified diff ใหม่เท่านั้น ห้ามอธิบาย ห้ามเขียนเนื้อหาไฟล์เต็ม',
      'ให้อ้างอิงจากไฟล์ล่าสุดที่แนบมาในแชท และแก้เฉพาะจุดที่ขอ',
      'diff ต้องมี header แบบ --- a/path และ +++ b/path พร้อม @@ hunk ที่ถูกต้อง',
      'ห้ามแก้ไฟล์ลับ เช่น .env, token, password, credential, node_modules, logs, uploads',
      filesText,
      warningsText,
      errorText,
    ]
      .filter(Boolean)
      .join('\n');
  }, [applyMessage, applyState, patchPreview.files, patchPreview.warnings]);
  const shouldShowPatchRetryPrompt =
    patchText.trim().length > 0 &&
    applyState !== 'applied' &&
    (applyState === 'failed' || patchPreview.files.length === 0 || patchPreview.hasWarnings);

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
      setFileSearch('');
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

  useEffect(() => {
    if (!pendingWorkspacePatch) {
      return;
    }
    setPatchText(pendingWorkspacePatch);
    setActiveCodeSection('changes');
    setApplyState('idle');
    setApplyMessage(null);
    setPatchPromptCopyState('idle');
    setIsApplyConfirmVisible(false);
    setPendingWorkspacePatch(null);
  }, [pendingWorkspacePatch, setPendingWorkspacePatch]);

  const loadCheckpoints = useCallback(async () => {
    setIsLoadingCheckpoints(true);
    try {
      const data = (await request.get('/api/workspace/checkpoints')) as WorkspaceCheckpointsResponse;
      setCheckpoints(data.checkpoints);
    } catch {
      setCheckpoints([]);
    } finally {
      setIsLoadingCheckpoints(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setIsLoadingActivity(true);
    try {
      const data = (await request.get('/api/workspace/activity')) as WorkspaceActivityResponse;
      setActivities(data.activities);
    } catch {
      setActivities([]);
    } finally {
      setIsLoadingActivity(false);
    }
  }, []);

  useEffect(() => {
    void loadCheckpoints();
    void loadActivity();
  }, [loadActivity, loadCheckpoints]);

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
    setIsSelectedContextOpen(false);
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

  const copyPatchRetryPrompt = async () => {
    try {
      await navigator.clipboard.writeText(patchRetryPrompt);
      setPatchPromptCopyState('copied');
    } catch {
      setPatchPromptCopyState('failed');
    }
  };

  const applyPatch = async () => {
    if (!canApplyPatch) {
      return;
    }

    if (!isApplyConfirmVisible) {
      setIsApplyConfirmVisible(true);
      setApplyMessage(null);
      setPatchPromptCopyState('idle');
      return;
    }

    setApplyState('applying');
    setApplyMessage(null);
    setPatchPromptCopyState('idle');
    setIsApplyConfirmVisible(false);
    try {
      const data = (await request.post('/api/workspace/apply-patch', {
        patch: patchText,
      })) as {
        applied: boolean;
        files: string[];
        checkpoint?: string | null;
        normalizedPatch?: string;
      };
      if (data.normalizedPatch) {
        setPatchText(data.normalizedPatch);
      }
      setApplyState(data.applied ? 'applied' : 'failed');
      setApplyMessage(
        data.checkpoint
          ? `เขียนไฟล์สำเร็จ ${data.files.length} ไฟล์ มี checkpoint: ${data.checkpoint}${
              data.normalizedPatch ? ' · auto-fixed diff header' : ''
            }`
          : `เขียนไฟล์สำเร็จ ${data.files.length} ไฟล์${
              data.normalizedPatch ? ' · auto-fixed diff header' : ''
            }`,
      );
      await loadTree(currentPath);
      if (selectedFile) {
        await loadFile(selectedFile.path);
      }
      await loadCheckpoints();
      await loadActivity();
    } catch (err) {
      setApplyState('failed');
      setApplyMessage(getPatchApplyMessage(err));
    }
  };

  const cleanupCheckpoints = async () => {
    if (checkpointActionState === 'cleaning') {
      return;
    }

    setCheckpointActionState('cleaning');
    setCheckpointActionMessage(null);
    try {
      const data = (await request.post('/api/workspace/checkpoints/cleanup', {
        keep: 5,
      })) as CheckpointCleanupResponse;
      setCheckpointActionState('done');
      setCheckpointActionMessage(`Kept latest ${data.keep}, deleted ${data.deleted.length} checkpoints.`);
      await loadCheckpoints();
      await loadActivity();
    } catch (err) {
      setCheckpointActionState('failed');
      setCheckpointActionMessage(getRequestErrorMessage(err, 'Checkpoint cleanup failed'));
    }
  };

  const deleteCheckpoint = async (checkpointId: string) => {
    if (checkpointActionState === 'deleting') {
      return;
    }

    setCheckpointActionState('deleting');
    setCheckpointActionMessage(null);
    try {
      await request.delete(`/api/workspace/checkpoints/${encodeURIComponent(checkpointId)}`);
      setCheckpointActionState('done');
      setCheckpointActionMessage('Deleted checkpoint.');
      await loadCheckpoints();
      await loadActivity();
    } catch (err) {
      setCheckpointActionState('failed');
      setCheckpointActionMessage(getRequestErrorMessage(err, 'Delete checkpoint failed'));
    }
  };

  const restoreCheckpoint = async (checkpointId: string) => {
    if (restoreState === 'restoring') {
      return;
    }

    setRestoreState('restoring');
    setRestoreMessage(null);
    setPendingRestoreCheckpointId(null);
    try {
      const data = (await request.post('/api/workspace/restore-checkpoint', {
        checkpointId,
      })) as { restored: boolean; restoredFiles: string[]; removedFiles: string[] };
      setRestoreState(data.restored ? 'restored' : 'failed');
      setRestoreMessage(
        `Restored ${data.restoredFiles.length} files, removed ${data.removedFiles.length} created files.`,
      );
      await loadTree(currentPath);
      if (selectedFile) {
        await loadFile(selectedFile.path);
      }
      await loadCheckpoints();
      await loadActivity();
    } catch (err) {
      setRestoreState('failed');
      setRestoreMessage(getRequestErrorMessage(err, 'Restore checkpoint failed'));
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 py-4 text-sm">
      <div>
        <div className="flex items-center justify-between gap-3 text-text-primary">
          <div className="flex min-w-0 items-center gap-2">
            <Code2 className="h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold">Code</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-green-500/20 bg-green-500/5 px-2 py-1 text-[11px] text-text-secondary">
            <ShieldCheck className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
            Safe writes
          </div>
        </div>
        <p className="hidden">
          โหมดนี้เปิดให้ดูไฟล์โปรเจกต์แบบ read-only เพื่อเลือก context ไปคุยกับ AI
          ก่อน ยังไม่มีสิทธิ์เขียนไฟล์ ลบไฟล์ ย้ายไฟล์ หรือรัน terminal จากหน้าเว็บ
        </p>
      </div>

      <div className="rounded-lg border border-border-light bg-surface-primary p-1">
        <div className="grid grid-cols-3 gap-1">
          {CODE_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                activeCodeSection === section.id
                  ? 'bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
              onClick={() => setActiveCodeSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {false && (
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
      )}

      {error != null && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-500">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {activeCodeSection === 'files' && (
        <>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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

        <div className="mb-3 flex items-center gap-2 rounded-md border border-border-light px-2 py-2">
          <Search className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <input
            type="search"
            value={fileSearch}
            onChange={(event) => setFileSearch(event.target.value)}
            placeholder="Search files in this folder"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
            aria-label="Search workspace files"
          />
          <span className="shrink-0 text-xs text-text-secondary">
            {filteredItems.length}/{items.length}
          </span>
          {fileSearch.trim().length > 0 && (
            <button
              type="button"
              className="shrink-0 text-xs text-text-secondary hover:text-text-primary"
              onClick={() => setFileSearch('')}
            >
              Clear
            </button>
          )}
        </div>

        <div className="max-h-[24rem] space-y-1 overflow-y-auto">
          {isLoadingTree && <div className="py-6 text-center text-xs text-text-secondary">กำลังโหลดไฟล์...</div>}
          {!isLoadingTree &&
            filteredItems.map((item) => (
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
          {!isLoadingTree && items.length > 0 && filteredItems.length === 0 && (
            <div className="py-6 text-center text-xs text-text-secondary">
              No files match this search
            </div>
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
          {selectedContextFiles.length > 0 && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-green-500/40 px-3 py-2 text-xs font-medium text-green-500 hover:bg-green-500/10"
              onClick={sendSelectedContextToChat}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Attach selected files ({selectedContextFiles.length})
            </button>
          )}
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

        <pre className="max-h-[24rem] min-h-40 overflow-auto rounded-md bg-black/20 p-3 text-xs leading-5 text-text-primary">
          {isLoadingFile ? 'กำลังอ่านไฟล์...' : selectedFile?.content || 'ยังไม่ได้เลือกไฟล์'}
        </pre>
      </div>
      </div>

      {(selectedContextFiles.length > 0 || contextState === 'limit') && (
      <div className="rounded-lg border border-border-light p-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setIsSelectedContextOpen((isOpen) => !isOpen)}
          aria-expanded={isSelectedContextOpen}
        >
          <div className="font-medium text-text-primary">Selected context</div>
          <div className="text-xs leading-5 text-text-secondary">
            {selectedContextFiles.length} files · {formatBytes(selectedContextBytes)} /{' '}
            {formatBytes(MAX_CODE_CONTEXT_BYTES)}
          </div>
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${
              isSelectedContextOpen ? 'rotate-90' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {contextState === 'limit' && (
          <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs leading-5 text-red-500">
            Context รวมใหญ่เกินลิมิต เลือกไฟล์ให้น้อยลงก่อนส่งเข้า Chat
          </div>
        )}

        {isSelectedContextOpen && (
          <>
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
          </>
        )}
      </div>
      )}

        </>
      )}

      {activeCodeSection === 'changes' && (
      <div className="rounded-lg border border-border-light p-3">
        <div className="mb-3">
          <div className="flex items-center gap-2 font-medium text-text-primary">
            <Code2 className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Proposed changes
          </div>
          <div className="mt-1 text-xs leading-5 text-text-secondary">
            วาง unified diff/patch จาก AI เพื่อ preview ก่อน รอบนี้ยังไม่เขียนไฟล์จริง
          </div>
        </div>

        <textarea
          className="min-h-40 w-full resize-y rounded-md border border-border-light bg-black/20 p-3 font-mono text-xs leading-5 text-text-primary outline-none focus:border-orange-500"
          value={patchText}
          onChange={(event) => {
            setPatchText(event.target.value);
            setApplyState('idle');
            setApplyMessage(null);
            setPatchPromptCopyState('idle');
            setIsApplyConfirmVisible(false);
          }}
          placeholder="Paste unified diff/patch here"
          spellCheck={false}
        />

        <div className="mt-3 space-y-2">
          {patchPreview.files.length > 0 && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border border-border-light p-2">
                <div className="text-text-secondary">Files</div>
                <div className="mt-1 font-semibold text-text-primary">
                  {patchPreview.files.length}
                </div>
              </div>
              <div className="rounded-md border border-border-light p-2">
                <div className="text-text-secondary">Add</div>
                <div className="mt-1 font-semibold text-green-500">+{patchTotals.added}</div>
              </div>
              <div className="rounded-md border border-border-light p-2">
                <div className="text-text-secondary">Remove</div>
                <div className="mt-1 font-semibold text-red-500">-{patchTotals.removed}</div>
              </div>
            </div>
          )}

          {applyMessage != null && (
            <div
              className={`rounded-md border p-2 text-xs leading-5 ${
                applyState === 'failed'
                  ? 'border-red-500/30 bg-red-500/10 text-red-500'
                  : 'border-green-500/30 bg-green-500/10 text-green-500'
              }`}
            >
              {applyMessage}
            </div>
          )}

          {patchReviewHint != null && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs leading-5 text-yellow-500">
              {patchReviewHint}
            </div>
          )}

          {shouldShowPatchRetryPrompt && (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-2 text-xs leading-5 text-text-primary">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-orange-500">Diff retry prompt</div>
                  <div className="mt-1 text-text-secondary">
                    ใช้เมื่อต้องขอ AI สร้าง unified diff ใหม่จากไฟล์ล่าสุด แทนการเดา line เอง
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-orange-500/40 px-2 py-1 font-medium text-orange-500 hover:bg-orange-500/10"
                  onClick={copyPatchRetryPrompt}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {patchPromptCopyState === 'copied'
                    ? 'Copied'
                    : patchPromptCopyState === 'failed'
                      ? 'Copy failed'
                      : 'Copy prompt'}
                </button>
              </div>
            </div>
          )}

          {patchPreview.warnings.map((warning) => (
            <div
              key={warning}
              className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs leading-5 text-yellow-500"
            >
              {warning}
            </div>
          ))}

          {patchText.trim().length === 0 ? (
            <div className="rounded-md bg-black/20 p-3 text-xs text-text-secondary">
              ยังไม่มี diff ให้ preview
            </div>
          ) : patchPreview.files.length > 0 ? (
            <div className="space-y-1">
              {patchPreview.files.map((file) => (
                <div
                  key={file.path}
                  className="rounded-md border border-border-light px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-text-primary">
                      {file.path}
                    </span>
                    <span className="shrink-0 text-text-secondary">
                      +{file.added} / -{file.removed} · {file.hunks} hunks
                    </span>
                  </div>
                  {file.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {file.warnings.map((warning) => (
                        <div key={warning} className="text-yellow-500">
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-md border border-border-light px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={patchText.length === 0}
                  onClick={() => {
                    setPatchText('');
                    setApplyState('idle');
                    setApplyMessage(null);
                    setPatchPromptCopyState('idle');
                    setIsApplyConfirmVisible(false);
                  }}
                >
              Clear diff
            </button>
            <button
              type="button"
              className="rounded-md border border-orange-500/50 px-3 py-2 text-xs font-medium text-orange-500 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:border-border-light disabled:text-text-secondary disabled:opacity-60"
              disabled={!canApplyPatch}
              onClick={applyPatch}
              title={
                status?.canApplyPatches
                  ? 'Apply patch after preview passes with no warnings'
                  : 'Backend write workspace is not enabled'
              }
            >
              {applyState === 'applying'
                ? 'Applying...'
                : applyState === 'applied'
                  ? 'Applied'
                  : isApplyConfirmVisible
                    ? 'Review ready'
                    : 'Review apply'}
            </button>
          </div>

          {isApplyConfirmVisible && (
            <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs leading-5 text-text-primary">
              <div className="mb-2 font-medium">Apply confirmation</div>
              <div className="text-text-secondary">
                ตรวจอีกครั้งก่อนเขียนไฟล์จริง ระบบจะสร้าง checkpoint ก่อน apply เสมอ
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border-light p-2">
                  <div className="text-text-secondary">Files</div>
                  <div className="mt-1 font-semibold">{patchPreview.files.length}</div>
                </div>
                <div className="rounded-md border border-border-light p-2">
                  <div className="text-text-secondary">Add</div>
                  <div className="mt-1 font-semibold text-green-500">+{patchTotals.added}</div>
                </div>
                <div className="rounded-md border border-border-light p-2">
                  <div className="text-text-secondary">Remove</div>
                  <div className="mt-1 font-semibold text-red-500">-{patchTotals.removed}</div>
                </div>
              </div>
              <div className="mt-3 max-h-24 space-y-1 overflow-y-auto">
                {patchPreview.files.map((file) => (
                  <div key={file.path} className="truncate text-text-secondary">
                    {file.path} · {file.hunks} hunks
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border-light px-3 py-2 font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  onClick={() => setIsApplyConfirmVisible(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-orange-500 px-3 py-2 font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={applyState === 'applying'}
                  onClick={applyPatch}
                >
                  Confirm apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {activeCodeSection === 'history' && (
      <>
      <div className="rounded-lg border border-border-light p-3">
        <div className="mb-3">
          <div className="flex items-center gap-2 font-medium text-text-primary">
            <History className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Activity
          </div>
          <div className="mt-1 text-xs leading-5 text-text-secondary">
            บันทึกงานล่าสุดของ Code เช่น apply, restore, delete และ cleanup
          </div>
        </div>

        {isLoadingActivity ? (
          <div className="rounded-md bg-black/20 p-3 text-xs text-text-secondary">
            Loading activity...
          </div>
        ) : activities.length > 0 ? (
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {activities.slice(0, 8).map((activity) => (
              <div
                key={activity.id}
                className="rounded-md border border-border-light px-3 py-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text-primary">
                      {activity.summary}
                    </div>
                    <div className="mt-1 text-text-secondary">
                      {new Date(activity.timestamp).toLocaleString()} · {activity.type}
                    </div>
                  </div>
                  <span className="shrink-0 rounded border border-green-500/30 px-2 py-0.5 text-[11px] text-green-500">
                    {activity.status}
                  </span>
                </div>
                {activity.files != null && activity.files.length > 0 && (
                  <div className="mt-2 truncate text-text-secondary">
                    {activity.files.slice(0, 2).join(', ')}
                    {activity.files.length > 2 ? ` +${activity.files.length - 2}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md bg-black/20 p-3 text-xs text-text-secondary">
            No activity yet
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border-light p-3">
        <div className="mb-3">
          <div className="flex items-center gap-2 font-medium text-text-primary">
            <History className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Checkpoints
          </div>
          <div className="mt-1 text-xs leading-5 text-text-secondary">
            จุดย้อนกลับที่ระบบสร้างก่อน Apply changes ใช้เมื่อต้องการคืนไฟล์จาก patch ก่อนหน้า
          </div>
        </div>

        {restoreMessage != null && (
          <div
            className={`mb-3 rounded-md border p-2 text-xs leading-5 ${
              restoreState === 'failed'
                ? 'border-red-500/30 bg-red-500/10 text-red-500'
                : 'border-green-500/30 bg-green-500/10 text-green-500'
            }`}
          >
            {restoreMessage}
          </div>
        )}

        {checkpointActionMessage != null && (
          <div
            className={`mb-3 rounded-md border p-2 text-xs leading-5 ${
              checkpointActionState === 'failed'
                ? 'border-red-500/30 bg-red-500/10 text-red-500'
                : 'border-green-500/30 bg-green-500/10 text-green-500'
            }`}
          >
            {checkpointActionMessage}
          </div>
        )}

        <button
          type="button"
          className="mb-3 w-full rounded-md border border-border-light px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={checkpoints.length <= 5 || checkpointActionState === 'cleaning'}
          onClick={cleanupCheckpoints}
        >
          {checkpointActionState === 'cleaning' ? 'Cleaning...' : 'Keep latest 5 checkpoints'}
        </button>

        {isLoadingCheckpoints ? (
          <div className="rounded-md bg-black/20 p-3 text-xs text-text-secondary">
            Loading checkpoints...
          </div>
        ) : checkpoints.length > 0 ? (
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {checkpoints.slice(0, 6).map((checkpoint) => (
              <div
                key={checkpoint.checkpointId}
                className="rounded-md border border-border-light p-2 text-xs"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text-primary">
                      {formatCheckpointId(checkpoint.checkpointId)}
                    </div>
                    <div className="mt-1 text-text-secondary">
                      saved {checkpoint.savedFiles.length} · created{' '}
                      {checkpoint.createdFiles?.length ?? 0}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md border border-orange-500/50 px-2 py-1 font-medium text-orange-500 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:border-border-light disabled:text-text-secondary disabled:opacity-60"
                      disabled={!status?.canRestoreCheckpoints || restoreState === 'restoring'}
                      onClick={() => {
                        setRestoreMessage(null);
                        setPendingRestoreCheckpointId(checkpoint.checkpointId);
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {restoreState === 'restoring'
                        ? 'Restoring...'
                        : pendingRestoreCheckpointId === checkpoint.checkpointId
                          ? 'Reviewing'
                          : 'Restore'}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border-light p-1.5 text-text-secondary hover:bg-surface-hover hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={checkpointActionState === 'deleting'}
                      onClick={() => deleteCheckpoint(checkpoint.checkpointId)}
                      aria-label={`Delete checkpoint ${checkpoint.checkpointId}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-text-secondary">
                  {[...checkpoint.savedFiles, ...(checkpoint.createdFiles ?? [])]
                    .slice(0, 3)
                    .map((file) => (
                      <div key={file} className="truncate">
                        {file}
                      </div>
                    ))}
                </div>
                {pendingRestoreCheckpointId === checkpoint.checkpointId && (
                  <div className="mt-3 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs leading-5 text-text-primary">
                    <div className="font-medium">Restore confirmation</div>
                    <div className="mt-1 text-text-secondary">
                      ตรวจอีกครั้งก่อนคืนไฟล์จริง ระบบจะย้อนไฟล์ที่บันทึกไว้ใน checkpoint นี้
                      และอาจลบไฟล์ที่ patch เดิมสร้างขึ้น
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-border-light px-3 py-2 font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        onClick={() => setPendingRestoreCheckpointId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-orange-500 px-3 py-2 font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={restoreState === 'restoring'}
                        onClick={() => restoreCheckpoint(checkpoint.checkpointId)}
                      >
                        Confirm restore
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md bg-black/20 p-3 text-xs text-text-secondary">
            No checkpoints yet
          </div>
        )}
      </div>

      </>
      )}

      {false && (
      <div className="rounded-lg border border-border-light p-3 text-xs leading-5 text-text-secondary">
        <div className="mb-1 flex items-center gap-2 font-medium text-text-primary">
          <Lock className="h-4 w-4" aria-hidden="true" />
          Safety rule
        </div>
        รอบนี้เป็น read-only เท่านั้น ขั้นต่อไปถ้าจะให้ AI แก้ไฟล์จริง จะต้องมีหน้า diff
        และปุ่มยืนยันก่อนเขียนไฟล์
      </div>
      )}
    </section>
  );
}
