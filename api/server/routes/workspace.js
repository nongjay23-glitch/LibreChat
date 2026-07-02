const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const { randomUUID } = require('crypto');
const { logger } = require('@librechat/data-schemas');
const {
  ContentTypes,
  Constants,
  EndpointURLs,
  EModelEndpoint,
} = require('librechat-data-provider');
const {
  configMiddleware,
  buildEndpointOption,
  moderateText,
} = require('~/server/middleware');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
const execFileAsync = promisify(execFile);

const MAX_LIST_ITEMS = 250;
const MAX_READ_BYTES = 200 * 1024;
const MAX_PATCH_BYTES = 512 * 1024;
const MAX_PATCH_FILES = 20;
const MAX_VERIFY_BYTES = 1024 * 1024;
const DEFAULT_CHECKPOINT_KEEP = 5;
const MAX_CHECKPOINT_KEEP = 50;
const CHECKPOINT_DIR = '.workspace-checkpoints';
const ACTIVITY_FILE = '.workspace-activity.jsonl';
const MAX_ACTIVITY_ITEMS = 50;
const MAX_COWORK_PLANNER_PROMPT_BYTES = 32 * 1024;
const MAX_COWORK_STRING_LENGTH = 1200;
const MAX_COWORK_CODEX_PROMPT_LENGTH = 6000;
const MAX_COWORK_LIST_ITEMS = 24;
const MAX_COWORK_STEPS = 12;
const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_READONLY_ROOT || '/readonly-workspace');
const WORKSPACE_WRITE_ROOT = process.env.WORKSPACE_WRITE_ROOT
  ? path.resolve(process.env.WORKSPACE_WRITE_ROOT)
  : null;
const PATCH_REBASE_MESSAGE =
  'Patch could not be applied automatically against the latest file state.';
const NODE_SYNTAX_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);
const TS_SYNTAX_EXTENSIONS = new Set(['.ts', '.tsx']);
const VERIFICATION_PROFILES = new Set(['fast', 'normal', 'strict']);
const MAX_SOURCE_CHAT_PROMPT_BYTES = 32 * 1024;
const COWORK_STEP_STATUSES = new Set(['todo', 'doing', 'done', 'blocked']);
const COWORK_OUTPUT_STEP_STATUSES = new Set(['todo']);
const COWORK_DEFAULT_AVOID_FILES = [
  '.env',
  'token',
  'password',
  'credential',
  '.git',
  'node_modules',
  'logs',
  'uploads',
  'database files',
  'binary files',
  'provider config files containing secrets',
];
const COWORK_SECRET_PATTERN =
  /\b(api[-_ ]?key|bearer\s+token|bearer|password|secret|credential)\b|-----BEGIN/i;
const COWORK_COMMAND_PATTERN =
  /(^|\n|\s)(npm|yarn|pnpm|node|python|pip|docker|git|curl|wget|rm|del|erase|powershell|pwsh|cmd|bash|sh|Invoke-WebRequest|Remove-Item|Move-Item|Copy-Item)\s+/i;
const COWORK_EDIT_CLAIM_PATTERN =
  /\b(I|I've|I have|we|we've|we have)\s+(edited|changed|modified|created|deleted|renamed|moved|applied|patched|ran|executed|updated)\b/i;

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

const silentModelResponse = {
  writableEnded: false,
  headersSent: false,
  setHeader: () => {},
  flushHeaders: () => {},
  flush: () => {},
  write: () => true,
  end: () => {},
  status() {
    return this;
  },
  json() {
    return this;
  },
  send() {
    return this;
  },
};

function getContentPartText(part) {
  if (!part || typeof part !== 'object') {
    return '';
  }

  if (part.type === ContentTypes.ERROR) {
    const errorValue = part[ContentTypes.ERROR];
    return typeof errorValue === 'string' ? errorValue : JSON.stringify(errorValue ?? '');
  }

  if (part.type !== ContentTypes.TEXT) {
    return '';
  }

  const textValue = part[ContentTypes.TEXT];
  if (typeof textValue === 'string') {
    return textValue;
  }
  if (typeof textValue?.value === 'string') {
    return textValue.value;
  }
  if (typeof textValue?.text === 'string') {
    return textValue.text;
  }
  return '';
}

function extractCompletionText(completion = []) {
  if (!Array.isArray(completion)) {
    return '';
  }

  return completion
    .map(getContentPartText)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function prepareSourceChatRequest(req, _res, next) {
  req.body = req.body || {};
  req.body.tools = [];
  req.body.files = [];
  req.body.manualSkills = [];
  req.body.ephemeralAgent = {
    ...(req.body.ephemeralAgent ?? {}),
    skills: false,
  };
  next();
}

function useAgentEndpointOptionBuilder(req, _res, next) {
  Object.defineProperty(req, 'baseUrl', {
    configurable: true,
    value: EndpointURLs[EModelEndpoint.agents],
  });
  next();
}

function getSafeSourceChatErrorMessage(error) {
  const rawMessage = error?.message || 'Source chat request failed.';
  return String(rawMessage)
    .replace(/\b(sk|pk|rk|xox[baprs]?)-[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
    .replace(/\b(api[-_ ]?key|token|password|credential|secret)=\S+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function getSafeCoworkPlannerErrorMessage(error) {
  const rawMessage = error?.message || 'Cowork planner request failed.';
  return String(rawMessage)
    .replace(/\b(sk|pk|rk|xox[baprs]?)-[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
    .replace(/\b(api[-_ ]?key|token|password|credential|secret)=\S+/gi, '$1=[redacted]')
    .slice(0, 240);
}

function isSuspiciousCoworkText(value = '') {
  return (
    COWORK_SECRET_PATTERN.test(value) ||
    COWORK_COMMAND_PATTERN.test(value) ||
    COWORK_EDIT_CLAIM_PATTERN.test(value)
  );
}

function sanitizeCoworkText(value, maxLength = MAX_COWORK_STRING_LENGTH) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed || COWORK_SECRET_PATTERN.test(trimmed)) {
    return '';
  }
  return trimmed.slice(0, maxLength);
}

function sanitizeCoworkList(value, maxLength = MAX_COWORK_STRING_LENGTH) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => sanitizeCoworkText(item, maxLength))
    .filter(Boolean)
    .slice(0, MAX_COWORK_LIST_ITEMS);
}

function uniqueCoworkList(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(item);
  }
  return result;
}

function sanitizeCoworkSteps(value, outputOnly = false) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((step) => {
      const title = sanitizeCoworkText(step?.title);
      if (!title) {
        return null;
      }
      const status = typeof step?.status === 'string' ? step.status : 'todo';
      return {
        title,
        status:
          (outputOnly ? COWORK_OUTPUT_STEP_STATUSES : COWORK_STEP_STATUSES).has(status)
            ? status
            : 'todo',
      };
    })
    .filter(Boolean)
    .slice(0, MAX_COWORK_STEPS);
}

function sanitizeCoworkDraft(value = {}) {
  return {
    goal: sanitizeCoworkText(value.goal),
    scope: sanitizeCoworkList(value.scope),
    exclusions: sanitizeCoworkList(value.exclusions),
    steps: sanitizeCoworkSteps(value.steps),
    inspectFiles: sanitizeCoworkList(value.inspectFiles),
    suggestedFiles: sanitizeCoworkList(value.suggestedFiles),
    avoidFiles: uniqueCoworkList([
      ...sanitizeCoworkList(value.avoidFiles),
      ...COWORK_DEFAULT_AVOID_FILES,
    ]),
    risks: sanitizeCoworkList(value.risks),
    verification: sanitizeCoworkList(value.verification),
    nextAction: sanitizeCoworkText(value.nextAction),
  };
}

function formatCoworkList(items = []) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none provided';
}

function formatCoworkSteps(steps = []) {
  return steps.length > 0
    ? steps.map((step, index) => `${index + 1}. [${step.status}] ${step.title}`).join('\n')
    : '1. [todo] none provided';
}

function createCoworkPlannerPrompt(draft) {
  return [
    'You are Cowork AI Planner.',
    'You are read-only.',
    'You do not edit files.',
    'You do not run terminal commands.',
    'You do not apply patches.',
    'You do not create, delete, rename, or move files.',
    'You do not claim changes were made.',
    'You do not use chat history.',
    'You do not use Notebook sources.',
    'You do not use source chunks.',
    'You only use the Cowork draft provided in this request.',
    'You produce a structured plan.',
    'You keep scope small.',
    'You ask clarifying questions when needed.',
    'You prepare a Codex/Code handoff prompt.',
    'Code mode remains the only place for project-file context, patch review, apply, checkpoint, restore, and verification.',
    'Return strict JSON only matching the requested schema.',
    'Do not include secrets, provider config, API keys, or full source content.',
    'Do not include terminal commands as direct actions to run.',
    'Treat these paths as unsafe and never recommend editing them: .env, token, password, credential, .git, node_modules, logs, uploads, database files, binary files, provider config files containing secrets.',
    '',
    'Required JSON schema:',
    '{"goal":"string","currentUnderstanding":"string","clarifyingQuestions":["string"],"scope":["string"],"exclusions":["string"],"steps":[{"title":"string","status":"todo"}],"inspectFiles":["string"],"suggestedFiles":["string"],"avoidFiles":["string"],"risks":["string"],"verification":["string"],"nextAction":"string","codexPrompt":"string"}',
    '',
    'Cowork draft:',
    `Goal:\n${draft.goal || 'none provided'}`,
    '',
    `Scope:\n${formatCoworkList(draft.scope)}`,
    '',
    `Exclusions:\n${formatCoworkList(draft.exclusions)}`,
    '',
    `Steps:\n${formatCoworkSteps(draft.steps)}`,
    '',
    `Files to inspect:\n${formatCoworkList(draft.inspectFiles)}`,
    '',
    `Suggested files:\n${formatCoworkList(draft.suggestedFiles)}`,
    '',
    `Files or paths to avoid:\n${formatCoworkList(draft.avoidFiles)}`,
    '',
    `Risks:\n${formatCoworkList(draft.risks)}`,
    '',
    `Verification:\n${formatCoworkList(draft.verification)}`,
    '',
    `Next action:\n${draft.nextAction || 'none provided'}`,
  ].join('\n');
}

function unwrapCoworkJson(rawText = '') {
  const text = String(rawText).trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    return fenced[1].trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

function hasSuspiciousCoworkPlannerContent(planner) {
  const textParts = [
    planner.goal,
    planner.currentUnderstanding,
    planner.nextAction,
    planner.codexPrompt,
    ...planner.clarifyingQuestions,
    ...planner.scope,
    ...planner.exclusions,
    ...planner.inspectFiles,
    ...planner.suggestedFiles,
    ...planner.risks,
    ...planner.verification,
    ...planner.steps.map((step) => step.title),
  ];
  return textParts.some(isSuspiciousCoworkText);
}

function parseCoworkPlannerResponse(rawText = '') {
  let parsed;
  try {
    parsed = JSON.parse(unwrapCoworkJson(rawText));
  } catch {
    const error = new Error('Cowork planner returned invalid JSON.');
    error.status = 502;
    throw error;
  }

  const planner = {
    goal: sanitizeCoworkText(parsed.goal),
    currentUnderstanding: sanitizeCoworkText(parsed.currentUnderstanding),
    clarifyingQuestions: sanitizeCoworkList(parsed.clarifyingQuestions),
    scope: sanitizeCoworkList(parsed.scope),
    exclusions: sanitizeCoworkList(parsed.exclusions),
    steps: sanitizeCoworkSteps(parsed.steps, true).map((step) => ({ ...step, status: 'todo' })),
    inspectFiles: sanitizeCoworkList(parsed.inspectFiles),
    suggestedFiles: sanitizeCoworkList(parsed.suggestedFiles),
    avoidFiles: uniqueCoworkList([
      ...sanitizeCoworkList(parsed.avoidFiles),
      ...COWORK_DEFAULT_AVOID_FILES,
    ]),
    risks: sanitizeCoworkList(parsed.risks),
    verification: sanitizeCoworkList(parsed.verification),
    nextAction: sanitizeCoworkText(parsed.nextAction),
    codexPrompt: sanitizeCoworkText(parsed.codexPrompt, MAX_COWORK_CODEX_PROMPT_LENGTH),
  };

  if (hasSuspiciousCoworkPlannerContent(planner)) {
    const error = new Error('Cowork planner returned unsafe content.');
    error.status = 422;
    throw error;
  }

  return planner;
}

function prepareCoworkPlannerRequest(req, _res, next) {
  const originalBody = req.body || {};
  const draft = sanitizeCoworkDraft(originalBody);
  const prompt = createCoworkPlannerPrompt(draft);
  req.coworkPlannerDraft = draft;
  req.body = {
    endpoint: originalBody.endpoint,
    endpointType: originalBody.endpointType,
    model: originalBody.model,
    spec: originalBody.spec,
    agent_id: originalBody.agent_id,
    chatProjectId: originalBody.chatProjectId,
    text: prompt,
    tools: [],
    files: [],
    manualSkills: [],
    ephemeralAgent: {
      ...(originalBody.ephemeralAgent ?? {}),
      skills: false,
    },
  };
  next();
}

function requireCoworkPlannerModelRouting(req, res, next) {
  if (typeof req.body?.endpoint !== 'string' || !req.body.endpoint.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'Cowork planner model routing is required.',
      warnings: [],
    });
  }
  next();
}

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

function formatPatchRange(start, count) {
  return count === 1 ? String(start) : `${start},${count}`;
}

function findUniqueLineSequence(fileLines, sequence) {
  if (sequence.length === 0 || sequence.length > fileLines.length) {
    return null;
  }

  let matchedIndex = -1;
  for (let index = 0; index <= fileLines.length - sequence.length; index++) {
    const matches = sequence.every((line, offset) => fileLines[index + offset] === line);
    if (!matches) {
      continue;
    }
    if (matchedIndex !== -1) {
      return null;
    }
    matchedIndex = index;
  }

  return matchedIndex === -1 ? null : matchedIndex;
}

function getHunkDetails(lines) {
  return lines.reduce(
    (details, line) => {
      if (line.startsWith('\\')) {
        return details;
      }
      if (line.startsWith(' ')) {
        details.oldCount += 1;
        details.newCount += 1;
        details.oldLines.push(line.slice(1));
        return details;
      }
      if (line.startsWith('-')) {
        details.oldCount += 1;
        details.oldLines.push(line.slice(1));
        return details;
      }
      if (line.startsWith('+')) {
        details.newCount += 1;
      }
      return details;
    },
    { oldCount: 0, newCount: 0, oldLines: [] },
  );
}

function normalizeHunkBodyLines(lines, isLastPatchBlock) {
  return lines.reduce((normalizedLines, line, index) => {
    const isFinalEmptyLine = isLastPatchBlock && index === lines.length - 1 && line === '';
    if (isFinalEmptyLine) {
      normalizedLines.push(line);
      return normalizedLines;
    }

    if (line === '') {
      return normalizedLines;
    }

    if (
      line.startsWith(' ') ||
      line.startsWith('+') ||
      line.startsWith('-') ||
      line.startsWith('\\')
    ) {
      normalizedLines.push(line);
      return normalizedLines;
    }

    normalizedLines.push(` ${line}`);
    return normalizedLines;
  }, []);
}

async function readWorkspaceTextLines(relativePath) {
  if (!relativePath || relativePath === '/dev/null') {
    return null;
  }

  const { normalized, resolved } = resolveWritableWorkspacePath(relativePath);
  if (isBlocked(normalized)) {
    return null;
  }

  const buffer = await fs.readFile(resolved).catch(() => null);
  if (!buffer || isLikelyBinary(buffer)) {
    return null;
  }

  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  return text.endsWith('\n') || text.endsWith('\r\n') ? lines.slice(0, -1) : lines;
}

async function readWritableTextFile(relativePath) {
  const { normalized, resolved } = resolveWritableWorkspacePath(relativePath);
  if (isBlocked(normalized)) {
    return null;
  }

  const buffer = await fs.readFile(resolved).catch(() => null);
  if (!buffer || isLikelyBinary(buffer)) {
    return null;
  }

  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  return {
    normalized,
    resolved,
    lines: text.endsWith('\n') || text.endsWith('\r\n') ? lines.slice(0, -1) : lines,
    hasFinalNewline: text.endsWith('\n') || text.endsWith('\r\n'),
  };
}

function joinWritableTextLines(lines, hasFinalNewline) {
  return `${lines.join('\n')}${hasFinalNewline ? '\n' : ''}`;
}

function hasLineSequenceAt(fileLines, startIndex, sequence) {
  if (startIndex < 0 || startIndex + sequence.length > fileLines.length) {
    return false;
  }
  return sequence.every((line, offset) => fileLines[startIndex + offset] === line);
}

function getRecoverableHunkDetails(lines) {
  return lines.reduce(
    (details, line) => {
      if (line.startsWith('\\')) {
        return details;
      }
      if (line.startsWith(' ')) {
        const content = line.slice(1);
        details.oldLines.push(content);
        details.newLines.push(content);
        details.parts.push({ type: 'context', content });
        return details;
      }
      if (line.startsWith('-')) {
        const content = line.slice(1);
        details.oldLines.push(content);
        details.removedLines.push(content);
        details.parts.push({ type: 'remove', content });
        return details;
      }
      if (line.startsWith('+')) {
        const content = line.slice(1);
        details.newLines.push(content);
        details.addedLines.push(content);
        details.parts.push({ type: 'add', content });
      }
      return details;
    },
    {
      oldLines: [],
      newLines: [],
      addedLines: [],
      removedLines: [],
      parts: [],
    },
  );
}

function findPureAddInsertionIndex(fileLines, parts) {
  const firstAddIndex = parts.findIndex((part) => part.type === 'add');
  if (firstAddIndex === -1) {
    return null;
  }

  const lastAddIndex = parts.findLastIndex((part) => part.type === 'add');
  const leadingContext = parts
    .slice(0, firstAddIndex)
    .filter((part) => part.type === 'context')
    .map((part) => part.content);
  const trailingContext = parts
    .slice(lastAddIndex + 1)
    .filter((part) => part.type === 'context')
    .map((part) => part.content);

  for (let size = leadingContext.length; size > 0; size--) {
    const sequence = leadingContext.slice(leadingContext.length - size);
    const matchedIndex = findUniqueLineSequence(fileLines, sequence);
    if (matchedIndex !== null) {
      return matchedIndex + sequence.length;
    }
  }

  for (let size = trailingContext.length; size > 0; size--) {
    const sequence = trailingContext.slice(0, size);
    const matchedIndex = findUniqueLineSequence(fileLines, sequence);
    if (matchedIndex !== null) {
      return matchedIndex;
    }
  }

  return null;
}

function applyRecoverableHunk(fileLines, hunkLines) {
  const details = getRecoverableHunkDetails(hunkLines);
  if (details.addedLines.length === 0 && details.removedLines.length === 0) {
    return { lines: fileLines, changed: false };
  }

  if (details.newLines.length > 0) {
    const alreadyAppliedIndex = findUniqueLineSequence(fileLines, details.newLines);
    if (alreadyAppliedIndex !== null) {
      return { lines: fileLines, changed: false };
    }
  }

  if (details.oldLines.length > 0) {
    const matchedIndex = findUniqueLineSequence(fileLines, details.oldLines);
    if (matchedIndex !== null) {
      const nextLines = [...fileLines];
      nextLines.splice(matchedIndex, details.oldLines.length, ...details.newLines);
      return { lines: nextLines, changed: true };
    }
  }

  if (details.removedLines.length === 0 && details.addedLines.length > 0) {
    const insertionIndex = findPureAddInsertionIndex(fileLines, details.parts);
    if (insertionIndex !== null) {
      if (hasLineSequenceAt(fileLines, insertionIndex, details.addedLines)) {
        return { lines: fileLines, changed: false };
      }

      const nextLines = [...fileLines];
      nextLines.splice(insertionIndex, 0, ...details.addedLines);
      return { lines: nextLines, changed: true };
    }
  }

  return null;
}

function parseRecoverablePatchFiles(patchText) {
  const files = [];
  const lines = patchText.split('\n');
  const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  let current = null;

  const ensureCurrent = (rawPath = '') => {
    if (current) {
      return current;
    }

    current = {
      path: getDiffPath(rawPath),
      isCreate: false,
      hunks: [],
    };
    files.push(current);
    return current;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (line.startsWith('diff --git ')) {
      const parts = line.split(/\s+/);
      current = {
        path: getDiffPath(parts[3] ?? parts[2] ?? ''),
        isCreate: false,
        hunks: [],
      };
      files.push(current);
      continue;
    }

    if (line.startsWith('--- /dev/null')) {
      ensureCurrent('/dev/null').isCreate = true;
      continue;
    }

    if (line.startsWith('--- ')) {
      ensureCurrent(line.slice(4));
      continue;
    }

    if (line.startsWith('+++ ')) {
      const nextPath = getDiffPath(line.slice(4));
      const active = ensureCurrent(nextPath);
      if (nextPath !== '/dev/null') {
        active.path = nextPath;
      }
      continue;
    }

    if (!hunkPattern.test(line)) {
      continue;
    }

    const active = ensureCurrent();
    let bodyEnd = index + 1;
    while (
      bodyEnd < lines.length &&
      !lines[bodyEnd].startsWith('diff --git ') &&
      !lines[bodyEnd].startsWith('@@ ')
    ) {
      bodyEnd += 1;
    }

    active.hunks.push(
      normalizeHunkBodyLines(lines.slice(index + 1, bodyEnd), bodyEnd === lines.length),
    );
    index = bodyEnd - 1;
  }

  return files.filter((file) => file.path && file.path !== '/dev/null' && file.hunks.length > 0);
}

async function recoverPatchAgainstCurrentFiles(patchText, parsed) {
  if (parsed.createdFiles.length > 0) {
    return null;
  }

  const patchFiles = parseRecoverablePatchFiles(patchText);
  const parsedFiles = new Set(parsed.files);
  if (
    patchFiles.length === 0 ||
    patchFiles.some((file) => file.isCreate || !parsedFiles.has(normalizeRelativePath(file.path)))
  ) {
    return null;
  }

  const changes = [];
  for (const file of patchFiles) {
    const current = await readWritableTextFile(file.path);
    if (!current) {
      return null;
    }

    let nextLines = current.lines;
    let changed = false;
    for (const hunkLines of file.hunks) {
      const applied = applyRecoverableHunk(nextLines, hunkLines);
      if (!applied) {
        return null;
      }

      nextLines = applied.lines;
      changed ||= applied.changed;
    }

    if (changed) {
      changes.push({
        normalized: current.normalized,
        resolved: current.resolved,
        content: joinWritableTextLines(nextLines, current.hasFinalNewline),
      });
    }
  }

  return { changes };
}

async function normalizePatchHunks(patchText) {
  const lines = patchText.split('\n');
  const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
  let currentPath = null;
  let currentFileLines = null;
  let fileDelta = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (line.startsWith('diff --git ')) {
      const parts = line.split(/\s+/);
      currentPath = getDiffPath(parts[3] ?? parts[2] ?? '');
      currentFileLines = null;
      fileDelta = 0;
      continue;
    }

    if (line.startsWith('+++ ')) {
      const nextPath = getDiffPath(line.slice(4));
      currentPath = nextPath === '/dev/null' ? currentPath : nextPath;
      currentFileLines = null;
      fileDelta = 0;
      continue;
    }

    const hunkMatch = hunkPattern.exec(line);
    if (!hunkMatch) {
      continue;
    }

    let bodyEnd = index + 1;
    while (
      bodyEnd < lines.length &&
      !lines[bodyEnd].startsWith('diff --git ') &&
      !lines[bodyEnd].startsWith('@@ ')
    ) {
      bodyEnd += 1;
    }

    const hunkLines = normalizeHunkBodyLines(
      lines.slice(index + 1, bodyEnd),
      bodyEnd === lines.length,
    );
    lines.splice(index + 1, bodyEnd - index - 1, ...hunkLines);
    bodyEnd = index + 1 + hunkLines.length;
    const details = getHunkDetails(hunkLines);
    const originalOldStart = Number(hunkMatch[1]);
    let oldStart = originalOldStart;
    let newStart = Number(hunkMatch[3]);

    if (currentPath && details.oldLines.length > 0) {
      currentFileLines ??= await readWorkspaceTextLines(currentPath);
      const matchedIndex = currentFileLines
        ? findUniqueLineSequence(currentFileLines, details.oldLines)
        : null;
      if (matchedIndex !== null) {
        oldStart = matchedIndex + 1;
        newStart = oldStart + fileDelta;
      }
    }

    lines[index] = `@@ -${formatPatchRange(oldStart, details.oldCount)} +${formatPatchRange(
      newStart,
      details.newCount,
    )} @@${hunkMatch[5]}`;
    fileDelta += details.newCount - details.oldCount;
    index = bodyEnd - 1;
  }

  return lines.join('\n');
}

async function git(args, options = {}) {
  return await execFileAsync('git', args, {
    cwd: WORKSPACE_WRITE_ROOT,
    maxBuffer: 1024 * 1024,
    timeout: 30000,
    ...options,
  });
}

function createVerificationCheck(name, status, message = '') {
  return {
    name,
    status,
    ...(message ? { message: message.slice(0, 240) } : {}),
  };
}

function getVerificationProfile(value) {
  const profile = String(value || 'fast').toLowerCase();
  return VERIFICATION_PROFILES.has(profile) ? profile : 'fast';
}

function getCommandErrorMessage(error) {
  return String(error?.stderr || error?.stdout || error?.message || 'check failed')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' | ');
}

function loadTypeScript() {
  try {
    const typescriptPath = require.resolve('typescript', { paths: [WORKSPACE_WRITE_ROOT] });
    return require(typescriptPath);
  } catch {
    return null;
  }
}

function verifyTypeScriptSyntax(ts, normalized, content) {
  if (!ts) {
    return createVerificationCheck(
      `${normalized}: TypeScript syntax`,
      'skipped',
      'TypeScript dependency is unavailable in the runtime container',
    );
  }

  const result = ts.transpileModule(content, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: normalized,
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostics.length === 0) {
    return createVerificationCheck(`${normalized}: TypeScript syntax`, 'passed');
  }

  const message = diagnostics
    .slice(0, 2)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
    .join(' | ');
  return createVerificationCheck(`${normalized}: TypeScript syntax`, 'failed', message);
}

async function verifyReadyz() {
  const port = Number(process.env.PORT || 3080);
  return await new Promise((resolve) => {
    const request = http.get(
      {
        hostname: '127.0.0.1',
        path: '/readyz',
        port,
        timeout: 3000,
      },
      (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve(createVerificationCheck('runtime readyz', 'passed', `HTTP ${response.statusCode}`));
          return;
        }
        resolve(createVerificationCheck('runtime readyz', 'failed', `HTTP ${response.statusCode || 0}`));
      },
    );

    request.on('timeout', () => {
      request.destroy();
      resolve(createVerificationCheck('runtime readyz', 'failed', 'readyz probe timed out'));
    });
    request.on('error', (error) => {
      resolve(createVerificationCheck('runtime readyz', 'failed', error.message));
    });
  });
}

async function verifyTextFile(normalized, resolved, options = {}) {
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats?.isFile()) {
    return [createVerificationCheck(`${normalized}: file`, 'failed', 'File is missing after apply')];
  }

  if (stats.size > MAX_VERIFY_BYTES) {
    return [
      createVerificationCheck(
        `${normalized}: file`,
        'skipped',
        `File is larger than ${MAX_VERIFY_BYTES} bytes`,
      ),
    ];
  }

  const buffer = await fs.readFile(resolved);
  if (isLikelyBinary(buffer)) {
    return [createVerificationCheck(`${normalized}: text`, 'failed', 'Binary content detected')];
  }

  const content = buffer.toString('utf8');
  const checks = [createVerificationCheck(`${normalized}: text`, 'passed')];
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(content)) {
    checks.push(createVerificationCheck(`${normalized}: conflict markers`, 'failed'));
  }

  const ext = path.extname(normalized).toLowerCase();
  if (ext === '.json') {
    try {
      JSON.parse(content);
      checks.push(createVerificationCheck(`${normalized}: JSON`, 'passed'));
    } catch (error) {
      checks.push(createVerificationCheck(`${normalized}: JSON`, 'failed', error.message));
    }
  }

  if (NODE_SYNTAX_EXTENSIONS.has(ext)) {
    try {
      await execFileAsync(process.execPath, ['--check', resolved], {
        cwd: WORKSPACE_WRITE_ROOT,
        maxBuffer: 1024 * 1024,
        timeout: 15000,
      });
      checks.push(createVerificationCheck(`${normalized}: syntax`, 'passed'));
    } catch (error) {
      checks.push(createVerificationCheck(`${normalized}: syntax`, 'failed', getCommandErrorMessage(error)));
    }
  }

  if (options.checkTypeScriptSyntax && TS_SYNTAX_EXTENSIONS.has(ext)) {
    checks.push(verifyTypeScriptSyntax(options.ts, normalized, content));
  }

  return checks;
}

async function verifyAppliedFiles(files, profile = 'fast') {
  const normalizedProfile = getVerificationProfile(profile);
  const shouldCheckTypeScriptSyntax = normalizedProfile === 'normal' || normalizedProfile === 'strict';
  const ts = shouldCheckTypeScriptSyntax ? loadTypeScript() : null;
  const checks = [];
  for (const file of files) {
    const { normalized, resolved } = resolveWritableWorkspacePath(file);
    checks.push(
      ...(await verifyTextFile(normalized, resolved, {
        checkTypeScriptSyntax: shouldCheckTypeScriptSyntax,
        ts,
      })),
    );
  }

  try {
    await git(['diff', '--check', '--', ...files], { timeout: 15000 });
    checks.push(createVerificationCheck('git diff --check', 'passed'));
  } catch (error) {
    checks.push(createVerificationCheck('git diff --check', 'failed', getCommandErrorMessage(error)));
  }

  if (normalizedProfile === 'strict') {
    checks.push(await verifyReadyz());
  }

  const failed = checks.filter((check) => check.status === 'failed').length;
  const passed = checks.filter((check) => check.status === 'passed').length;
  return {
    profile: normalizedProfile,
    status: failed > 0 ? 'failed' : passed > 0 ? 'passed' : 'skipped',
    checks,
  };
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

function getActivityPath() {
  if (!WORKSPACE_WRITE_ROOT) {
    throw new Error('Workspace write root is not configured.');
  }
  return path.join(WORKSPACE_WRITE_ROOT, ACTIVITY_FILE);
}

async function writeActivity(entry) {
  if (!WORKSPACE_WRITE_ROOT) {
    return;
  }

  const activity = {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    timestamp: new Date().toISOString(),
    status: 'success',
    ...entry,
  };
  await fs.appendFile(getActivityPath(), `${JSON.stringify(activity)}\n`, 'utf8').catch(() => {});
}

async function readActivities(limit = MAX_ACTIVITY_ITEMS) {
  if (!WORKSPACE_WRITE_ROOT) {
    return [];
  }

  const raw = await fs.readFile(getActivityPath(), 'utf8').catch(() => '');
  if (!raw.trim()) {
    return [];
  }

  return raw
    .trim()
    .split(/\r?\n/)
    .slice(-limit)
    .reverse()
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

router.post(
  '/cowork/planner',
  configMiddleware,
  prepareCoworkPlannerRequest,
  requireCoworkPlannerModelRouting,
  moderateText,
  useAgentEndpointOptionBuilder,
  buildEndpointOption,
  async (req, res) => {
    const warnings = [];
    try {
      const prompt = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!prompt) {
        return res.status(400).json({
          ok: false,
          error: 'Cowork planner draft is required.',
          warnings,
        });
      }

      if (Buffer.byteLength(prompt, 'utf8') > MAX_COWORK_PLANNER_PROMPT_BYTES) {
        return res.status(400).json({
          ok: false,
          error: 'Cowork planner request is too large.',
          warnings,
        });
      }

      const conversationId = `cowork-planner-${randomUUID()}`;
      const userMessageId = randomUUID();
      const responseMessageId = randomUUID();
      const now = new Date().toISOString();
      const endpointOption = req.body?.endpointOption;
      const abortController = new AbortController();

      const { client, userMCPAuthMap } = await initializeClient({
        req,
        res: silentModelResponse,
        signal: abortController.signal,
        endpointOption,
      });

      client.conversationId = conversationId;
      client.parentMessageId = userMessageId;
      client.responseMessageId = responseMessageId;
      client.user = req.user.id;

      const payload = [
        {
          messageId: userMessageId,
          parentMessageId: Constants.NO_PARENT,
          conversationId,
          text: prompt,
          sender: 'User',
          isCreatedByUser: true,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const { completion } = await client.sendCompletion(payload, {
        abortController,
        userMCPAuthMap,
      });
      const text = extractCompletionText(completion);

      if (!text) {
        return res.status(502).json({
          ok: false,
          error: 'Cowork planner returned an empty response.',
          warnings,
        });
      }

      const planner = parseCoworkPlannerResponse(text);
      return res.json({
        ok: true,
        planner,
        warnings,
      });
    } catch (error) {
      const status = error?.status || error?.response?.status || 500;
      const message = getSafeCoworkPlannerErrorMessage(error);
      logger.error('[cowork-planner] request failed', {
        status,
        message,
      });
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        ok: false,
        error: message,
        warnings,
      });
    }
  },
);

router.post(
  '/source-chat',
  configMiddleware,
  moderateText,
  prepareSourceChatRequest,
  useAgentEndpointOptionBuilder,
  buildEndpointOption,
  async (req, res) => {
    try {
      const prompt = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!prompt) {
        return res.status(400).json({ message: 'Question is required.' });
      }

      if (Buffer.byteLength(prompt, 'utf8') > MAX_SOURCE_CHAT_PROMPT_BYTES) {
        return res.status(400).json({ message: 'Source chat prompt is too large.' });
      }

      const conversationId =
        typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
          ? `source-chat-${req.body.conversationId.trim()}`
          : `source-chat-${randomUUID()}`;
      const userMessageId = randomUUID();
      const responseMessageId = randomUUID();
      const now = new Date().toISOString();
      const endpointOption = req.body?.endpointOption;
      const abortController = new AbortController();

      const { client, userMCPAuthMap } = await initializeClient({
        req,
        res: silentModelResponse,
        signal: abortController.signal,
        endpointOption,
      });

      client.conversationId = conversationId;
      client.parentMessageId = userMessageId;
      client.responseMessageId = responseMessageId;
      client.user = req.user.id;

      const payload = [
        {
          messageId: userMessageId,
          parentMessageId: Constants.NO_PARENT,
          conversationId,
          text: prompt,
          sender: 'User',
          isCreatedByUser: true,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const { completion } = await client.sendCompletion(payload, {
        abortController,
        userMCPAuthMap,
      });
      const text = extractCompletionText(completion);

      if (!text) {
        return res.status(502).json({ message: 'The model returned an empty response.' });
      }

      return res.json({ text, answer: text });
    } catch (error) {
      const status = error?.status || error?.response?.status || 500;
      const message = getSafeSourceChatErrorMessage(error);
      logger.error('[source-chat] request failed', {
        status,
        message,
      });
      return res.status(status >= 400 && status < 600 ? status : 500).json({ message });
    }
  },
);

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

router.get('/activity', async (_req, res, next) => {
  try {
    const activities = await readActivities();
    return res.json({ activities });
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

    await writeActivity({
      type: 'checkpoint_cleanup',
      summary: `Kept latest ${keep} checkpoints`,
      details: { keep, deleted },
    });

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
    await writeActivity({
      type: 'checkpoint_delete',
      summary: `Deleted checkpoint ${checkpointId}`,
      details: { checkpointId },
    });
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
    const verificationProfile = getVerificationProfile(req.body?.verificationProfile);

    const normalizedPatchText = await normalizePatchHunks(patchText);
    const parsed = parsePatchFiles(normalizedPatchText);
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
    await fs.writeFile(patchFile, normalizedPatchText, 'utf8');

    let checkpoint = null;
    let recoveredPatch = false;
    let alreadyApplied = false;
    let verification = null;

    try {
      await git(['apply', '--check', '--whitespace=nowarn', patchFile]);
      checkpoint = await createFileCheckpoint(parsed.files, parsed.createdFiles);
      await git(['apply', '--whitespace=nowarn', patchFile]);
    } catch (applyError) {
      const recovery = await recoverPatchAgainstCurrentFiles(normalizedPatchText, parsed);
      if (!recovery) {
        throw applyError;
      }

      recoveredPatch = true;
      alreadyApplied = recovery.changes.length === 0;
      if (!alreadyApplied) {
        checkpoint = await createFileCheckpoint(parsed.files, parsed.createdFiles);
        for (const change of recovery.changes) {
          await fs.writeFile(change.resolved, change.content, 'utf8');
        }
      }
    }

    verification = alreadyApplied
      ? {
          profile: verificationProfile,
          status: 'skipped',
          checks: [createVerificationCheck('post-apply verification', 'skipped', 'No file writes needed')],
        }
      : await verifyAppliedFiles(parsed.files, verificationProfile);

    await writeActivity({
      type: 'apply_patch',
      summary: recoveredPatch
        ? `Applied ${parsed.files.length} files with patch rebase`
        : `Applied ${parsed.files.length} files`,
      files: parsed.files,
      details: {
        checkpoint,
        createdFiles: parsed.createdFiles,
        recoveredPatch,
        alreadyApplied,
        verification,
      },
    });

    return res.json({
      applied: true,
      files: parsed.files,
      checkpoint,
      recoveredPatch,
      alreadyApplied,
      verification,
      normalizedPatch:
        normalizedPatchText !== patchText ? normalizedPatchText : undefined,
    });
  } catch (error) {
    const message = error?.stderr || error?.message || 'Patch apply failed.';
    return res.status(400).json({
      message: message.trim() || PATCH_REBASE_MESSAGE,
    });
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

    await writeActivity({
      type: 'restore_checkpoint',
      summary: `Restored checkpoint ${checkpointId}`,
      files: restoredFiles,
      details: { checkpointId, removedFiles },
    });

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
