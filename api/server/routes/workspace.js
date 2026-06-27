const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
const execFileAsync = promisify(execFile);

const MAX_LIST_ITEMS = 250;
const MAX_READ_BYTES = 200 * 1024;
const MAX_PATCH_BYTES = 512 * 1024;
const MAX_PATCH_FILES = 20;
const DEFAULT_CHECKPOINT_KEEP = 5;
const MAX_CHECKPOINT_KEEP = 50;
const CHECKPOINT_DIR = '.workspace-checkpoints';
const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_READONLY_ROOT || '/readonly-workspace');
const WORKSPACE_WRITE_ROOT = process.env.WORKSPACE_WRITE_ROOT
  ? path.resolve(process.env.WORKSPACE_WRITE_ROOT)
  : null;

const BLOCKED_SEGMENTS = new Set([
  '.cache',
  '.git',
  '.turbo',
  'coverage',
  'data-node',
  'dist',
  'logs',
  'node_modules',
  'uploads',
]);

const BLOCKED_FILE_NAMES = [/^\.env($|\.)/i, /secret/i, /credential/i, /password/i, /token/i];
const BLOCKED_EXTENSIONS = new Set([
  '.7z',
  '.avi',
  '.bin',
  '.db',
  '.dll',
  '.exe',
  '.gif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.sqlite',
  '.webp',
  '.zip',
]);

router.use(requireJwtAuth);

function normalizeRelativePath(value = '') {
  const normalized = String(value).replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('\0') || path.isAbsolute(normalized)) {
    throw new Error('Invalid workspace path');
  }
  return normalized;
}

function resolveWorkspacePath(relativePath = '') {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(WORKSPACE_ROOT, normalized);
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`)) {
    throw new Error('Path is outside the allowed workspace');
  }
  return { normalized, resolved };
}

function resolveWritableWorkspacePath(relativePath = '') {
  if (!WORKSPACE_WRITE_ROOT) {
    throw new Error('Workspace write root is not configured.');
  }

  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(WORKSPACE_WRITE_ROOT, normalized);
  if (resolved !== WORKSPACE_WRITE_ROOT && !resolved.startsWith(`${WORKSPACE_WRITE_ROOT}${path.sep}`)) {
    throw new Error('Path is outside the writable workspace');
  }
  return { normalized, resolved };
}

function resolveCheckpointPath(checkpointId = '') {
  if (!WORKSPACE_WRITE_ROOT) {
    throw new Error('Workspace write root is not configured.');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(String(checkpointId))) {
    throw new Error('Invalid checkpoint id');
  }

  const checkpointRoot = path.resolve(WORKSPACE_WRITE_ROOT, CHECKPOINT_DIR, checkpointId);
  const checkpointBase = path.resolve(WORKSPACE_WRITE_ROOT, CHECKPOINT_DIR);
  if (!checkpointRoot.startsWith(`${checkpointBase}${path.sep}`)) {
    throw new Error('Checkpoint path is outside the checkpoint directory');
  }
  return checkpointRoot;
}

function isBlocked(relativePath = '') {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part))) {
    return true;
  }

  const fileName = parts[parts.length - 1] || '';
  const ext = path.extname(fileName).toLowerCase();
  return BLOCKED_EXTENSIONS.has(ext) || BLOCKED_FILE_NAMES.some((pattern) => pattern.test(fileName));
}

function isLikelyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function getDiffPath(rawPath = '') {
  return String(rawPath)
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^[ab]\//, '');
}

function parsePatchFiles(patchText) {
  const files = new Map();
  const createdFiles = new Map();
  const lines = patchText.split(/\r?\n/);
  let sawDelete = false;
  let sawRename = false;
  let sawBinary = false;
  let nextPathIsCreate = false;

  const addPath = (rawPath) => {
    const normalized = getDiffPath(rawPath);
    if (!normalized || normalized === '/dev/null') {
      return;
    }
    const safePath = normalizeRelativePath(normalized);
    if (safePath.includes('../') || isBlocked(safePath)) {
      throw new Error(`Blocked patch path: ${safePath}`);
    }
    const { normalized: resolvedPath } = resolveWorkspacePath(safePath);
    files.set(resolvedPath, true);
    if (nextPathIsCreate) {
      createdFiles.set(resolvedPath, true);
      nextPathIsCreate = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.split(/\s+/);
      addPath(parts[2]);
      addPath(parts[3]);
      continue;
    }
    if (line.startsWith('--- /dev/null')) {
      nextPathIsCreate = true;
      continue;
    }
    if (line.startsWith('+++ /dev/null')) {
      sawDelete = true;
      nextPathIsCreate = false;
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      addPath(line.slice(4));
      continue;
    }
    if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
      sawRename = true;
    }
    if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
      sawBinary = true;
    }
  }

  return {
    files: [...files.keys()],
    createdFiles: [...createdFiles.keys()],
    sawDelete,
    sawRename,
    sawBinary,
  };
}

function normalizePatchText(patchText) {
  const normalized = patchText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

async function git(args, options = {}) {
  return await execFileAsync('git', args, {
    cwd: WORKSPACE_WRITE_ROOT,
    maxBuffer: 1024 * 1024,
    timeout: 30000,
    ...options,
  });
}

async function createFileCheckpoint(files, createdFiles = []) {
  const checkpointId = new Date().toISOString().replace(/[:.]/g, '-');
  const checkpointRoot = path.join(WORKSPACE_WRITE_ROOT, CHECKPOINT_DIR, checkpointId);
  const savedFiles = [];
  const normalizedCreatedFiles = [];

  await fs.mkdir(checkpointRoot, { recursive: true });
  for (const file of files) {
    const { normalized, resolved: sourcePath } = resolveWritableWorkspacePath(file);

    const stats = await fs.stat(sourcePath).catch(() => null);
    if (!stats?.isFile()) {
      continue;
    }

    const backupPath = path.join(checkpointRoot, normalized);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(sourcePath, backupPath);
    savedFiles.push(normalized);
  }

  for (const file of createdFiles) {
    const { normalized } = resolveWritableWorkspacePath(file);
    if (!isBlocked(normalized)) {
      normalizedCreatedFiles.push(normalized);
    }
  }

  await fs.writeFile(
    path.join(checkpointRoot, 'manifest.json'),
    JSON.stringify({ checkpointId, savedFiles, createdFiles: normalizedCreatedFiles }, null, 2),
    'utf8',
  );

  return checkpointId;
}

async function readCheckpointManifest(checkpointId) {
  const checkpointRoot = resolveCheckpointPath(checkpointId);
  const raw = await fs.readFile(path.join(checkpointRoot, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  return {
    checkpointId: manifest.checkpointId,
    savedFiles: Array.isArray(manifest.savedFiles) ? manifest.savedFiles : [],
    createdFiles: Array.isArray(manifest.createdFiles) ? manifest.createdFiles : [],
  };
}

async function listCheckpointManifests(limit = 20) {
  if (!WORKSPACE_WRITE_ROOT) {
    return [];
  }

  const checkpointBase = path.join(WORKSPACE_WRITE_ROOT, CHECKPOINT_DIR);
  const entries = await fs.readdir(checkpointBase, { withFileTypes: true }).catch(() => []);
  const checkpoints = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      checkpoints.push(await readCheckpointManifest(entry.name));
    } catch {
      // Ignore incomplete checkpoint folders; they are not restorable.
    }
  }

  const sorted = checkpoints.sort((a, b) => b.checkpointId.localeCompare(a.checkpointId));
  return Number.isInteger(limit) ? sorted.slice(0, limit) : sorted;
}

function validateRestorablePath(file) {
  const { normalized, resolved } = resolveWritableWorkspacePath(file);
  if (!normalized || normalized.includes('../') || isBlocked(normalized)) {
    throw new Error(`Blocked restore path: ${normalized}`);
  }
  return { normalized, resolved };
}

async function deleteCheckpoint(checkpointId) {
  const checkpointRoot = resolveCheckpointPath(checkpointId);
  await fs.rm(checkpointRoot, { recursive: true, force: true });
  return checkpointId;
}

router.get('/status', async (_req, res) => {
  try {
    const stats = await fs.stat(WORKSPACE_ROOT);
    const writeStats = WORKSPACE_WRITE_ROOT ? await fs.stat(WORKSPACE_WRITE_ROOT).catch(() => null) : null;
    return res.json({
      enabled: stats.isDirectory(),
      rootLabel: 'Project workspace',
      mode: 'read-only',
      maxReadBytes: MAX_READ_BYTES,
      canApplyPatches: Boolean(writeStats?.isDirectory()),
      canRestoreCheckpoints: Boolean(writeStats?.isDirectory()),
    });
  } catch {
    return res.json({
      enabled: false,
      rootLabel: 'Project workspace',
      mode: 'read-only',
      maxReadBytes: MAX_READ_BYTES,
      canApplyPatches: false,
      canRestoreCheckpoints: false,
    });
  }
});

router.get('/checkpoints', async (_req, res, next) => {
  try {
    const checkpoints = await listCheckpointManifests();
    return res.json({ checkpoints });
  } catch (error) {
    return next(error);
  }
});

router.post('/checkpoints/cleanup', async (req, res) => {
  try {
    if (!WORKSPACE_WRITE_ROOT) {
      return res.status(403).json({ message: 'Workspace write root is not configured.' });
    }

    const requestedKeep = Number(req.body?.keep ?? DEFAULT_CHECKPOINT_KEEP);
    const keep = Math.min(
      MAX_CHECKPOINT_KEEP,
      Math.max(1, Number.isFinite(requestedKeep) ? Math.floor(requestedKeep) : DEFAULT_CHECKPOINT_KEEP),
    );
    const checkpoints = await listCheckpointManifests(null);
    const deleted = [];

    for (const checkpoint of checkpoints.slice(keep)) {
      deleted.push(await deleteCheckpoint(checkpoint.checkpointId));
    }

    return res.json({ keep, deleted });
  } catch (error) {
    const message = error?.message || 'Checkpoint cleanup failed.';
    return res.status(400).json({ message: message.trim() });
  }
});

router.delete('/checkpoints/:checkpointId', async (req, res) => {
  try {
    if (!WORKSPACE_WRITE_ROOT) {
      return res.status(403).json({ message: 'Workspace write root is not configured.' });
    }

    const checkpointId = await deleteCheckpoint(req.params.checkpointId);
    return res.json({ deleted: true, checkpointId });
  } catch (error) {
    const message = error?.message || 'Delete checkpoint failed.';
    return res.status(400).json({ message: message.trim() });
  }
});

router.get('/tree', async (req, res, next) => {
  try {
    const { normalized, resolved } = resolveWorkspacePath(req.query.path);
    if (isBlocked(normalized)) {
      return res.status(403).json({ message: 'This path is blocked by workspace safety rules.' });
    }

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const visibleEntries = entries
      .filter((entry) => !isBlocked(path.posix.join(normalized, entry.name)))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, MAX_LIST_ITEMS);

    const items = await Promise.all(
      visibleEntries.map(async (entry) => {
        const relativePath = path.posix.join(normalized, entry.name);
        const fullPath = path.join(resolved, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: relativePath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          readable: entry.isFile() && stats.size <= MAX_READ_BYTES && !isBlocked(relativePath),
        };
      }),
    );

    return res.json({
      path: normalized,
      items,
      truncated: entries.length > MAX_LIST_ITEMS,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/file', async (req, res, next) => {
  try {
    const { normalized, resolved } = resolveWorkspacePath(req.query.path);
    if (!normalized || isBlocked(normalized)) {
      return res.status(403).json({ message: 'This file is blocked by workspace safety rules.' });
    }

    const stats = await fs.stat(resolved);
    if (!stats.isFile()) {
      return res.status(400).json({ message: 'Requested path is not a file.' });
    }
    if (stats.size > MAX_READ_BYTES) {
      return res.status(413).json({ message: 'File is too large for safe preview.' });
    }

    const buffer = await fs.readFile(resolved);
    if (isLikelyBinary(buffer)) {
      return res.status(415).json({ message: 'Binary files are not shown in Code mode.' });
    }

    return res.json({
      path: normalized,
      size: stats.size,
      content: buffer.toString('utf8'),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/apply-patch', async (req, res, next) => {
  let patchFile = null;
  try {
    if (!WORKSPACE_WRITE_ROOT) {
      return res.status(403).json({ message: 'Workspace write root is not configured.' });
    }

    const rawPatchText = typeof req.body?.patch === 'string' ? req.body.patch : '';
    const patchText = normalizePatchText(rawPatchText);
    const patchBytes = Buffer.byteLength(patchText, 'utf8');
    if (!patchText.trim()) {
      return res.status(400).json({ message: 'Patch is empty.' });
    }
    if (patchBytes > MAX_PATCH_BYTES) {
      return res.status(413).json({ message: 'Patch is too large for safe apply.' });
    }

    const parsed = parsePatchFiles(patchText);
    if (parsed.files.length === 0) {
      return res.status(400).json({ message: 'No patch files were found.' });
    }
    if (parsed.files.length > MAX_PATCH_FILES) {
      return res.status(413).json({ message: 'Patch touches too many files.' });
    }
    if (parsed.sawDelete || parsed.sawRename || parsed.sawBinary) {
      return res.status(403).json({
        message: 'Delete, rename, and binary patches are blocked in safe apply mode.',
      });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-patch-'));
    patchFile = path.join(tempDir, 'change.diff');
    await fs.writeFile(patchFile, patchText, 'utf8');

    await git(['apply', '--check', '--whitespace=nowarn', patchFile]);
    const checkpoint = await createFileCheckpoint(parsed.files, parsed.createdFiles);
    await git(['apply', '--whitespace=nowarn', patchFile]);

    return res.json({
      applied: true,
      files: parsed.files,
      checkpoint,
    });
  } catch (error) {
    const message = error?.stderr || error?.message || 'Patch apply failed.';
    return res.status(400).json({ message: message.trim() });
  } finally {
    if (patchFile) {
      await fs.rm(path.dirname(patchFile), { recursive: true, force: true }).catch(() => {});
    }
  }
});

router.post('/restore-checkpoint', async (req, res) => {
  try {
    if (!WORKSPACE_WRITE_ROOT) {
      return res.status(403).json({ message: 'Workspace write root is not configured.' });
    }

    const checkpointId = typeof req.body?.checkpointId === 'string' ? req.body.checkpointId : '';
    const checkpointRoot = resolveCheckpointPath(checkpointId);
    const manifest = await readCheckpointManifest(checkpointId);
    const restoredFiles = [];
    const removedFiles = [];

    for (const file of manifest.savedFiles) {
      const { normalized, resolved } = validateRestorablePath(file);
      const source = path.resolve(checkpointRoot, normalized);
      if (source !== checkpointRoot && !source.startsWith(`${checkpointRoot}${path.sep}`)) {
        throw new Error(`Checkpoint source is outside checkpoint directory: ${normalized}`);
      }

      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.copyFile(source, resolved);
      restoredFiles.push(normalized);
    }

    for (const file of manifest.createdFiles) {
      const { normalized, resolved } = validateRestorablePath(file);
      await fs.rm(resolved, { force: true });
      removedFiles.push(normalized);
    }

    return res.json({
      restored: true,
      checkpointId,
      restoredFiles,
      removedFiles,
    });
  } catch (error) {
    const message = error?.message || 'Restore checkpoint failed.';
    return res.status(400).json({ message: message.trim() });
  }
});

module.exports = router;
