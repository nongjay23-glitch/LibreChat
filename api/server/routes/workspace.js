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
  const lines = patchText.split(/\r?\n/);
  let sawDelete = false;
  let sawRename = false;
  let sawBinary = false;

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
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.split(/\s+/);
      addPath(parts[2]);
      addPath(parts[3]);
      continue;
    }
    if (line.startsWith('--- /dev/null') || line.startsWith('+++ /dev/null')) {
      sawDelete = sawDelete || line.startsWith('+++ /dev/null');
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

async function createFileCheckpoint(files) {
  const checkpointId = new Date().toISOString().replace(/[:.]/g, '-');
  const checkpointRoot = path.join(WORKSPACE_WRITE_ROOT, '.workspace-checkpoints', checkpointId);
  const savedFiles = [];

  await fs.mkdir(checkpointRoot, { recursive: true });
  for (const file of files) {
    const sourcePath = path.resolve(WORKSPACE_WRITE_ROOT, file);
    if (sourcePath !== WORKSPACE_WRITE_ROOT && !sourcePath.startsWith(`${WORKSPACE_WRITE_ROOT}${path.sep}`)) {
      throw new Error(`Checkpoint path is outside workspace: ${file}`);
    }

    const stats = await fs.stat(sourcePath).catch(() => null);
    if (!stats?.isFile()) {
      continue;
    }

    const backupPath = path.join(checkpointRoot, file);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(sourcePath, backupPath);
    savedFiles.push(file);
  }

  await fs.writeFile(
    path.join(checkpointRoot, 'manifest.json'),
    JSON.stringify({ checkpointId, savedFiles }, null, 2),
    'utf8',
  );

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
    });
  } catch {
    return res.json({
      enabled: false,
      rootLabel: 'Project workspace',
      mode: 'read-only',
      maxReadBytes: MAX_READ_BYTES,
      canApplyPatches: false,
    });
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
    const checkpoint = await createFileCheckpoint(parsed.files);
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

module.exports = router;
