const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

const MAX_LIST_ITEMS = 250;
const MAX_READ_BYTES = 200 * 1024;
const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_READONLY_ROOT || '/readonly-workspace');

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

router.get('/status', async (_req, res) => {
  try {
    const stats = await fs.stat(WORKSPACE_ROOT);
    return res.json({
      enabled: stats.isDirectory(),
      rootLabel: 'Project workspace',
      mode: 'read-only',
      maxReadBytes: MAX_READ_BYTES,
    });
  } catch {
    return res.json({
      enabled: false,
      rootLabel: 'Project workspace',
      mode: 'read-only',
      maxReadBytes: MAX_READ_BYTES,
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

module.exports = router;
