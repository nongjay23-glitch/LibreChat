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
const { configMiddleware, buildEndpointOption, moderateText } = require('~/server/middleware');
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
const MAX_COWORK_CHAT_PROMPT_BYTES = 32 * 1024;
const MAX_COWORK_CHAT_CONTEXT_MESSAGES = 12;
const MAX_COWORK_PLANNER_PROMPT_BYTES = 32 * 1024;
const MAX_COWORK_PLANNER_RETRY_TEXT_LENGTH = 12000;
const MAX_COWORK_STRING_LENGTH = 1200;
const MAX_COWORK_CODEX_PROMPT_LENGTH = 6000;
const MAX_COWORK_LIST_ITEMS = 24;
const MAX_COWORK_STEPS = 12;
const MAX_COWORK_DECISION_OPTIONS = 4;
const MAX_COWORK_DECISION_QUESTION_LENGTH = 180;
const MAX_COWORK_DECISION_OPTION_LABEL_LENGTH = 80;
const MAX_COWORK_DECISION_OPTION_DESCRIPTION_LENGTH = 220;
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
/**
 * Matches actual secret-like VALUES, not bare label words.
 * Bare labels like "password", "token", ".env", "credential" are valid as
 * avoidFiles / exclusion guidance and must NOT be rejected.
 *
 * Catches: api_key=..., Bearer <long>, -----BEGIN, password=<value>,
 *          token=<value>, credential=<value>, long random API-key-like strings.
 */
const COWORK_SECRET_VALUE_PATTERN =
  /-----BEGIN|\b(api[-_ ]?key|password|token|secret|credential)\s*[:=]\s*\S{6,}|\bBearer\s+[A-Za-z0-9_.\-]{20,}|\b(?:sk|pk|rk|xox[baprs]?)-[A-Za-z0-9_\-]{12,}\b/i;
const COWORK_GENERIC_PLAN_PATTERN =
  /\b(improve|optimize|handle|implement feature|review code|test thoroughly|fix bugs|make it better|do the task|check everything|update things)\b/i;
const COWORK_SPECIFIC_ANCHOR_PATTERN =
  /\/|\.[a-z0-9]{1,8}\b|localStorage|endpoint|route|payload|schema|state|history|conversation|message|room|project|model|planner|sidebar|composer|backend|frontend|api|UI|Chat|Cowork|Code|Notebook|Sources|sandbox|diff|verify|test|expected|avoid|scope|risk/i;
const COWORK_ACTION_OFFER_PATTERN =
  /ให้(?:ผม|ฉัน|ช่วย|เริ่ม)?(?:สร้าง|เขียน|ติดตั้ง|รัน)(?:ไฟล์|โค้ด|โปรเจกต์|โครงสร้าง)|(?:shall|should|want)\s+(?:me|i)\s+(?:to\s+)?(?:create|build|write|scaffold|generate|set\s+up)/i;
const COWORK_PROMPT_LEAK_PATTERN =
  /Original requirement topic|Decision question|User answer|Continue \/ask|Continue \/plan|Cowork draft|Required JSON schema|quality contract|strict JSON/i;
const COWORK_PLANNER_RESPONSE_SCHEMA =
  '{"intent":"plan|ask","responseMode":"plan|decision","goal":"string","currentUnderstanding":"string","clarifyingQuestions":["string"],"scope":["string"],"exclusions":["string"],"steps":[{"title":"string","status":"todo"}],"inspectFiles":["string"],"suggestedFiles":["string"],"avoidFiles":["string"],"risks":["string"],"verification":["string"],"nextAction":"string","codexPrompt":"string","decision":{"question":"string","reason":"string","impact":"string","recommendedOptionId":"string","options":[{"id":"string","label":"string","description":"string"}],"allowCustomAnswer":true}}';

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

  return completion.map(getContentPartText).filter(Boolean).join('\n').trim();
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

function getSafeCoworkChatErrorMessage(error) {
  const rawMessage = error?.message || 'Cowork chat request failed.';
  return String(rawMessage)
    .replace(/\b(sk|pk|rk|xox[baprs]?)-[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
    .replace(/\b(api[-_ ]?key|token|password|credential|secret)=\S+/gi, '$1=[redacted]')
    .slice(0, 240);
}

function isSuspiciousCoworkText(value = '') {
  return COWORK_SECRET_VALUE_PATTERN.test(value);
}

function sanitizeCoworkText(value, maxLength = MAX_COWORK_STRING_LENGTH) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed || COWORK_SECRET_VALUE_PATTERN.test(trimmed)) {
    return '';
  }
  return trimmed.slice(0, maxLength);
}

function sanitizeCoworkDecisionQuestion(value) {
  let text = sanitizeCoworkText(value, 600);
  if (!text) {
    return '';
  }

  const lastQuestionMarker = Math.max(
    text.lastIndexOf('Decision question:'),
    text.lastIndexOf('คำถาม:'),
  );
  if (lastQuestionMarker >= 0) {
    text = text.slice(lastQuestionMarker).replace(/^Decision question:\s*/i, '').replace(/^คำถาม:\s*/i, '');
  }

  const stopIndex = [
    'User answer:',
    'Continue /ask',
    'Continue /plan',
    'Original planner request:',
    'Original requirement topic:',
    'Cowork draft:',
    'Required JSON schema:',
  ]
    .map((marker) => text.indexOf(marker))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0];

  if (stopIndex) {
    text = text.slice(0, stopIndex);
  }

  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_COWORK_DECISION_QUESTION_LENGTH);
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

function getCoworkLanguageHint(value) {
  return value === 'th' ? 'th' : 'en';
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
        status: (outputOnly ? COWORK_OUTPUT_STEP_STATUSES : COWORK_STEP_STATUSES).has(status)
          ? status
          : 'todo',
      };
    })
    .filter(Boolean)
    .slice(0, MAX_COWORK_STEPS);
}

function sanitizeCoworkDecision(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const options = Array.isArray(value.options)
    ? value.options
        .map((option, index) => {
          const id = sanitizeCoworkText(option?.id, 80) || `option-${index + 1}`;
          const label = sanitizeCoworkText(option?.label, MAX_COWORK_DECISION_OPTION_LABEL_LENGTH);
          const description = sanitizeCoworkText(
            option?.description,
            MAX_COWORK_DECISION_OPTION_DESCRIPTION_LENGTH,
          );
          if (!label || !description) {
            return null;
          }
          return { id, label, description };
        })
        .filter(Boolean)
        .slice(0, MAX_COWORK_DECISION_OPTIONS)
    : [];

  const optionIds = new Set(options.map((option) => option.id));
  const recommendedOptionId = sanitizeCoworkText(value.recommendedOptionId, 80);

  const decision = {
    question: sanitizeCoworkDecisionQuestion(value.question),
    reason: sanitizeCoworkText(value.reason, 260),
    impact: sanitizeCoworkText(value.impact, 220),
    recommendedOptionId: optionIds.has(recommendedOptionId) ? recommendedOptionId : '',
    options,
    allowCustomAnswer: value.allowCustomAnswer !== false,
  };

  if (!decision.question || options.length === 0) {
    return null;
  }

  return decision;
}

function sanitizeCoworkDraft(value = {}) {
  return {
    intent: value.intent === 'ask' ? 'ask' : 'plan',
    goal: sanitizeCoworkText(value.goal),
    languageHint: getCoworkLanguageHint(value.languageHint),
    avoidQuestions: sanitizeCoworkList(value.avoidQuestions, 360).slice(-12),
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
  const isAskIntent = draft.intent === 'ask';
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
    isAskIntent
      ? 'You produce one requirement/implementation decision question.'
      : 'You produce a structured plan.',
    'You keep scope small.',
    'You ask clarifying questions when needed.',
    'You prepare a Codex/Code handoff prompt.',
    'Code mode remains the only place for project-file context, patch review, apply, checkpoint, restore, and verification.',
    'Normal Cowork chat is for ordinary conversation. This planner is only for explicit /ask or /plan requests.',
    '/ask is requirement-question mode. It must ask one high-impact question at a time and must not return a full plan, Codex prompt, or implementation checklist.',
    '/plan is planning mode. It may ask one decision only when guessing would materially change scope or implementation direction; otherwise it must produce a high-quality implementation handoff.',
    'Return strict JSON only matching the requested schema.',
    'Do not include secrets, provider config, API keys, or full source content.',
    'Do not say Cowork ran terminal commands. Verification and codexPrompt may propose checks for Code mode or the user to run, but must clearly be proposed checks, not actions already performed.',
    'Treat these paths as unsafe and never recommend editing them: .env, token, password, credential, .git, node_modules, logs, uploads, database files, binary files, provider config files containing secrets.',
    '',
    'Quality contract:',
    '- Output language must follow the Cowork draft language hint.',
    '- If language hint is "th", all user-facing question, reason, impact, option labels, option descriptions, plan sections, and nextAction must be Thai unless a short technical term is unavoidable.',
    '- Never repeat or lightly rephrase any question listed in "Questions already asked".',
    '- Do not invent repository facts, file names, APIs, routes, or implementation details that are not present in the draft. If details are missing, say they are unknown.',
    '- intent must echo the requested mode: "ask" for /ask and "plan" for /plan.',
    '- For /ask, responseMode must be "decision". Ask exactly one highest-impact requirement or implementation question. Do not produce a plan card, Codex prompt, or broad checklist.',
    '- Questions must gather requirements or decisions only. Never ask for permission to create files, scaffold a project, generate code, or perform any action yourself. Cowork cannot act; it only plans.',
    '- For /ask, if the topic already has enough detail, ask whether to continue gathering details, narrow scope, or switch to /plan. Do not switch to plan by yourself.',
    '- For /plan, responseMode must be "plan" when enough information exists to make a useful scoped plan.',
    '- For /plan, responseMode may be "decision" only when one missing decision would materially change the plan and unsafe guessing would likely send implementation in the wrong direction.',
    '- For /plan, do not ask a decision question just because the schema supports it. If a safe default exists, state the assumption and return a plan.',
    '- For responseMode "decision", ask exactly one highest-impact question. The question must be short, direct, and ask one thing only. Put explanation in reason/impact, not in the question.',
    '- Decision question target: 1 sentence, 8-22 words, no compound lists, no repeated context, no previous prompt text.',
    '- decision.question must contain only the final user-facing question. Do not include original topic labels, previous answers, schema wording, JSON instructions, or internal planner instructions.',
    '- decision.reason and decision.impact must each be one short sentence. Keep details in option descriptions.',
    '- Provide 2-4 concrete options plus allowCustomAnswer true. Option labels must be short; option descriptions carry the detail. Every option must change scope, architecture, risk, or next implementation step.',
    '- currentUnderstanding must summarize the concrete goal, known constraints, current phase, and important unknowns. It must not be a vague restatement.',
    '- clarifyingQuestions must contain only questions that unblock implementation decisions. Prefer 0-5 questions. Do not ask generic questions when the next step is already clear.',
    '- scope must describe concrete included work for this phase. Each item should be specific enough to review.',
    '- exclusions must explicitly protect out-of-scope systems, normal Chat history, file edits, tools, terminal actions, sandbox, Notebook/Sources, and Code mode when applicable.',
    '- steps must be 3-8 small, ordered, reviewable implementation steps. Each step must include a clear target and avoid vague verbs like "improve", "handle", or "optimize" unless the object and expected behavior are concrete.',
    '- risks must describe real failure modes tied to this task, not generic project risk. Include how each risk could show up.',
    '- verification must list concrete checks or manual tests that prove the phase works and did not touch protected systems.',
    '- nextAction must be one immediate action. If critical inputs are missing, nextAction must be to answer the most important clarifying question; otherwise it must name the smallest safe implementation step.',
    '- codexPrompt must be ready to give to Code mode. It must include strict scope, files likely to inspect/edit, files or areas to avoid, required behavior, checks to run, and final report requirements. It must not ask Code mode to do broad refactors.',
    '- Prefer fewer, sharper items over long generic lists.',
    '',
    'Required JSON schema:',
    COWORK_PLANNER_RESPONSE_SCHEMA,
    '',
    'Cowork draft:',
    `Intent:\n${draft.intent}`,
    '',
    `Language hint:\n${draft.languageHint}`,
    '',
    `Questions already asked:\n${formatCoworkList(draft.avoidQuestions)}`,
    '',
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

function createCoworkPlannerRetryPrompt(originalPrompt, previousResponse, blocking = []) {
  return [
    'The previous Cowork planner response did not meet the quality contract.',
    'Revise it once. Return strict JSON only using the same required schema.',
    'Do not make the answer longer for its own sake. Make it more specific, actionable, and ready for Code mode handoff.',
    '',
    'Quality failures to fix:',
    formatCoworkList(blocking),
    '',
    'Original planner request:',
    originalPrompt,
    '',
    'Previous response:',
    truncateCoworkPlannerRetryText(previousResponse),
  ].join('\n');
}

function createCoworkPlannerJsonRepairPrompt(originalPrompt, previousResponse, parseError = '') {
  return [
    'The previous Cowork planner response was not valid JSON.',
    'Repair it once. Return strict JSON only using the required schema below.',
    'Do not include markdown fences, explanations, comments, or any text outside the JSON object.',
    'Preserve useful task-specific details from the previous response when possible.',
    'If the previous response cannot be reused, create a valid high-quality planner response from the original planner request.',
    'Use the same language as the user input when practical.',
    '',
    'Required JSON schema:',
    COWORK_PLANNER_RESPONSE_SCHEMA,
    '',
    'Parse error:',
    parseError || 'invalid JSON',
    '',
    'Original planner request:',
    originalPrompt,
    '',
    'Previous response:',
    truncateCoworkPlannerRetryText(previousResponse),
  ].join('\n');
}

function truncateCoworkPlannerRetryText(value = '') {
  const text = String(value);
  if (text.length <= MAX_COWORK_PLANNER_RETRY_TEXT_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_COWORK_PLANNER_RETRY_TEXT_LENGTH)}\n[truncated]`;
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

function extractBalancedCoworkJsonObjects(value = '') {
  const text = String(value);
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char !== '}' || depth === 0) {
      continue;
    }

    depth -= 1;
    if (depth === 0 && start >= 0) {
      objects.push(text.slice(start, index + 1));
      start = -1;
    }
  }

  return objects;
}

function getCoworkJsonCandidates(rawText = '') {
  const text = String(rawText).trim();
  const candidates = [unwrapCoworkJson(text)];
  const fencedPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fenced;

  while ((fenced = fencedPattern.exec(text)) !== null) {
    candidates.push(fenced[1].trim());
  }

  for (const candidate of [text, ...candidates]) {
    candidates.push(...extractBalancedCoworkJsonObjects(candidate));
  }

  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
}

function parseCoworkJsonObject(rawText = '') {
  for (const candidate of getCoworkJsonCandidates(rawText)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next candidate before declaring the model response unusable.
    }
  }

  const error = new Error('Cowork planner returned invalid JSON.');
  error.status = 502;
  throw error;
}

function hasSuspiciousCoworkPlannerContent(planner) {
  const textParts = [
    planner.goal,
    planner.currentUnderstanding,
    planner.nextAction,
    planner.codexPrompt,
    planner.decision?.question,
    planner.decision?.reason,
    planner.decision?.impact,
    ...planner.clarifyingQuestions,
    ...planner.scope,
    ...planner.exclusions,
    ...planner.inspectFiles,
    ...planner.suggestedFiles,
    ...planner.risks,
    ...planner.verification,
    ...planner.steps.map((step) => step.title),
    ...(planner.decision?.options ?? []).flatMap((option) => [option.label, option.description]),
  ];
  return textParts.some(isSuspiciousCoworkText);
}

function getCoworkWordCount(value = '') {
  const text = String(value).trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function getCoworkThaiCharCount(value = '') {
  return (String(value).match(/[฀-๿]/g) || []).length;
}

function hasCoworkSpecificAnchor(value = '') {
  return COWORK_SPECIFIC_ANCHOR_PATTERN.test(String(value));
}

function isLowInformationCoworkItem(value = '') {
  const text = String(value).trim();
  if (!text) {
    return true;
  }

  const isGeneric = COWORK_GENERIC_PLAN_PATTERN.test(text);
  const hasSpecificAnchor = hasCoworkSpecificAnchor(text);
  const hasEnoughShape =
    getCoworkWordCount(text) >= 4 || getCoworkThaiCharCount(text) >= 12 || /[.:;()]/.test(text);
  return (isGeneric && !hasSpecificAnchor) || (!hasSpecificAnchor && !hasEnoughShape);
}

function hasActionableCoworkItem(value = '') {
  const text = String(value).trim();
  if (isLowInformationCoworkItem(text)) {
    return false;
  }
  return /[a-z0-9)]/i.test(text);
}

function hasReadyCodexPrompt(value = '') {
  const text = String(value).trim();
  if (!text) {
    return false;
  }

  const checks = [
    /\bscope\b|strict scope|out of scope/i,
    /\bfiles?\b|areas?\b|inspect|edit/i,
    /\bavoid\b|do not|must not|forbidden/i,
    /\bbehavior\b|required|expected|must\b/i,
    /\bchecks?\b|verify|verification|test/i,
    /final report|report in|summary/i,
  ];

  const matched = checks.filter((pattern) => pattern.test(text)).length;
  return matched >= 4;
}

function hasUsefulUnderstanding(planner) {
  const text = planner.currentUnderstanding;
  if (!text) {
    return false;
  }
  if (isLowInformationCoworkItem(text)) {
    return false;
  }

  return hasCoworkSpecificAnchor(text) || planner.scope.length > 0 || planner.exclusions.length > 0;
}

function isOverloadedCoworkDecisionQuestion(value = '') {
  const text = String(value).trim();
  if (text.length > MAX_COWORK_DECISION_QUESTION_LENGTH) {
    return true;
  }
  if (getCoworkWordCount(text) > 28) {
    return true;
  }
  const clauseCount = (text.match(/,|;|\/| และ | and | หรือ | or /gi) || []).length;
  return clauseCount > 3;
}

function hasThaiCoworkText(value = '') {
  return /[\u0E00-\u0E7F]/.test(String(value));
}

function isWrongCoworkPlannerLanguage(planner, languageHint = 'en') {
  if (languageHint !== 'th') {
    return false;
  }

  if (planner.responseMode === 'decision' && planner.decision) {
    const decisionText = [
      planner.decision.question,
      planner.decision.reason,
      planner.decision.impact,
      ...planner.decision.options.flatMap((option) => [option.label, option.description]),
    ].join(' ');
    return !hasThaiCoworkText(decisionText);
  }

  return !hasThaiCoworkText(
    [
      planner.goal,
      planner.currentUnderstanding,
      planner.nextAction,
      ...planner.clarifyingQuestions,
      ...planner.scope,
      ...planner.exclusions,
      ...planner.risks,
      ...planner.verification,
      ...planner.steps.map((step) => step.title),
    ].join(' '),
  );
}

function normalizeCoworkQuestion(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function isRepeatedCoworkQuestion(question = '', avoidQuestions = []) {
  const normalized = normalizeCoworkQuestion(question);
  if (!normalized) {
    return false;
  }

  return avoidQuestions.some((item) => {
    const previous = normalizeCoworkQuestion(item);
    return (
      previous &&
      (normalized === previous || normalized.includes(previous) || previous.includes(normalized))
    );
  });
}

function validateCoworkPlannerQuality(planner, intent = 'plan', draft = {}) {
  const blocking = [];
  const warnings = [];

  if (isWrongCoworkPlannerLanguage(planner, draft.languageHint)) {
    blocking.push('planner output must use the requested language');
  }

  if (intent === 'ask' && planner.responseMode !== 'decision') {
    blocking.push('/ask must return responseMode "decision" with one requirement question');
    return { blocking, warnings };
  }

  if (planner.responseMode === 'decision') {
    const decisionQuality = validateCoworkPlannerDecisionQuality(planner, draft);
    return {
      blocking: [...blocking, ...decisionQuality.blocking],
      warnings: [...warnings, ...decisionQuality.warnings],
    };
  }

  if (!hasUsefulUnderstanding(planner)) {
    blocking.push('currentUnderstanding lacks concrete goal, constraint, or unknown detail');
  }

  const actionableSteps = planner.steps.filter((step) => hasActionableCoworkItem(step.title));
  if (planner.steps.length === 0) {
    blocking.push('plan has no steps');
  } else if (actionableSteps.length === 0) {
    blocking.push('plan steps lack actionable target detail');
  }

  if (!hasActionableCoworkItem(planner.nextAction)) {
    blocking.push('nextAction is missing an immediate action and target');
  }

  if (!hasReadyCodexPrompt(planner.codexPrompt)) {
    blocking.push('codexPrompt is not ready for scoped Code mode handoff');
  }

  if (planner.scope.length === 0) {
    warnings.push('Cowork planner returned no explicit scope items.');
  }
  if (planner.exclusions.length === 0) {
    warnings.push('Cowork planner returned no explicit exclusions.');
  }
  if (planner.risks.length === 0) {
    warnings.push('Cowork planner returned no task-specific risks.');
  }
  if (planner.verification.length === 0) {
    warnings.push('Cowork planner returned no verification checks.');
  }
  if (planner.clarifyingQuestions.length > 5) {
    warnings.push('Cowork planner returned more clarifying questions than the quality contract prefers.');
  }

  const weakStep = planner.steps.find((step) => isLowInformationCoworkItem(step.title));
  if (weakStep) {
    warnings.push('Cowork planner returned at least one step without concrete target detail.');
  }
  if (planner.risks.length > 0 && planner.risks.every(isLowInformationCoworkItem)) {
    blocking.push('risks lack concrete failure mode detail');
  } else if (planner.risks.some(isLowInformationCoworkItem)) {
    warnings.push('Cowork planner returned at least one risk without concrete failure mode detail.');
  }
  if (planner.verification.length > 0 && planner.verification.every(isLowInformationCoworkItem)) {
    blocking.push('verification lacks concrete expected-result detail');
  } else if (planner.verification.some(isLowInformationCoworkItem)) {
    warnings.push('Cowork planner returned at least one verification check without expected-result detail.');
  }

  return { blocking, warnings };
}

function validateCoworkPlannerDecisionQuality(planner, draft = {}) {
  const blocking = [];
  const warnings = [];
  const decision = planner.decision;

  if (!decision) {
    blocking.push('decision response is missing a decision object');
    return { blocking, warnings };
  }

  if (isLowInformationCoworkItem(decision.question)) {
    blocking.push('decision question lacks concrete implementation impact');
  }
  if (isOverloadedCoworkDecisionQuestion(decision.question)) {
    blocking.push('decision question must be short and ask one thing only');
  }
  if (isRepeatedCoworkQuestion(decision.question, draft.avoidQuestions)) {
    blocking.push('decision question repeats an already answered question');
  }
  if (COWORK_PROMPT_LEAK_PATTERN.test(decision.question)) {
    blocking.push('decision question includes internal prompt text');
  }
  if (COWORK_ACTION_OFFER_PATTERN.test(decision.question)) {
    blocking.push('decision question must not offer to create files or code; Cowork only plans');
  }
  if (isLowInformationCoworkItem(decision.reason)) {
    blocking.push('decision reason does not explain why guessing is unsafe');
  }
  if (isLowInformationCoworkItem(decision.impact)) {
    blocking.push('decision impact does not explain how the answer changes the plan');
  }
  if (decision.options.length < 2) {
    blocking.push('decision must provide at least two concrete options');
  }
  if (decision.options.length > MAX_COWORK_DECISION_OPTIONS) {
    warnings.push('Cowork planner returned more decision options than the UI supports.');
  }
  if (!decision.allowCustomAnswer) {
    blocking.push('decision must allow a custom answer');
  }

  const weakOption = decision.options.find(
    (option) => !option.label.trim() || isLowInformationCoworkItem(option.description),
  );
  if (weakOption) {
    blocking.push('decision options must include labels and concrete descriptions');
  }

  if (
    decision.recommendedOptionId &&
    !decision.options.some((option) => option.id === decision.recommendedOptionId)
  ) {
    warnings.push('Cowork planner recommended an option that is not present.');
  }

  return { blocking, warnings };
}

function compactCoworkTaskLabel(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function extractCoworkDisplayGoal(value = '') {
  let text = String(value).trim();
  const originalPattern =
    /Original (?:requirement topic|goal):\s*([\s\S]*?)(?:\n\n(?:Decision question|User answer|Continue)|$)/i;

  for (let index = 0; index < 4; index += 1) {
    const match = text.match(originalPattern);
    if (!match) {
      break;
    }
    text = match[1].trim();
  }

  text = text
    .replace(/^Original (?:requirement topic|goal):\s*/i, '')
    .split(/\n\n(?:Decision question|User answer|Continue)/i)[0]
    .split(/\bContinue the \/(?:ask|plan)\b/i)[0];

  const compacted = compactCoworkTaskLabel(text);
  if (!compacted) {
    return 'Cowork task';
  }
  if (compacted.length <= 90) {
    return compacted;
  }
  return `${compacted.slice(0, 87).trim()}...`;
}

function createFallbackCoworkDecision(goal, isThai, avoidQuestions = []) {
  const fallbackDecisions = isThai
    ? [
        {
          question: 'เริ่มจาก Workflow, Admin, หรือ MVP ก่อน?',
          reason: `หัวข้อ: ${goal}`,
          impact: 'คำตอบนี้จะกำหนดว่าคำถามถัดไปควรเจาะ workflow, ข้อมูล, หรือขอบเขตงานก่อน.',
          recommendedOptionId: 'workflow',
          options: [
            {
              id: 'workflow',
              label: 'Workflow การใช้งาน',
              description: 'เริ่มจากลำดับการใช้งานจริงตั้งแต่ต้นจนจบ ของผู้ใช้แต่ละบทบาทในระบบ.',
            },
            {
              id: 'data-admin',
              label: 'ข้อมูลและ Admin',
              description: 'เริ่มจากข้อมูลที่ต้องเก็บ หน้าจัดการ รายงาน และสิทธิ์การใช้งาน.',
            },
            {
              id: 'mvp-scope',
              label: 'ขอบเขต MVP',
              description: 'เริ่มจากฟีเจอร์ที่ต้องมีในเวอร์ชันแรก และสิ่งที่ยังไม่ทำ.',
            },
          ],
          allowCustomAnswer: true,
        },
        {
          question: 'ผู้ใช้หลักของระบบนี้คือใคร?',
          reason: `หัวข้อ: ${goal}`,
          impact: 'บทบาทผู้ใช้จะเปลี่ยน workflow, หน้าจอ, สิทธิ์, และข้อมูลที่ต้องเก็บ.',
          recommendedOptionId: 'staff',
          options: [
            {
              id: 'staff',
              label: 'ผู้ปฏิบัติงานภายใน',
              description: 'เน้นขั้นตอนทำงานประจำวันให้เร็ว ลดความผิดพลาด และเห็นงานค้างชัดเจน.',
            },
            {
              id: 'owner',
              label: 'เจ้าของหรือแอดมิน',
              description: 'เน้นตั้งค่า ดูรายงาน จัดการข้อมูล และติดตามภาพรวมของระบบ.',
            },
            {
              id: 'customer',
              label: 'ผู้ใช้ปลายทาง',
              description: 'เน้นประสบการณ์ใช้งานด้วยตัวเอง เช่น สมัคร ทำรายการ หรือติดตามสถานะ.',
            },
          ],
          allowCustomAnswer: true,
        },
        {
          question: 'ข้อมูลวันแรกต้องเก็บอะไรบ้าง?',
          reason: `หัวข้อ: ${goal}`,
          impact: 'ข้อมูลตั้งต้นจะกำหนด schema, หน้ากรอกข้อมูล, รายงาน, และงานที่ทำได้ใน MVP.',
          recommendedOptionId: 'transactions',
          options: [
            {
              id: 'transactions',
              label: 'ธุรกรรมหลักและสถานะ',
              description: 'เก็บรายการงานหรือธุรกรรมหลักของระบบ พร้อมสถานะ เวลา และผู้เกี่ยวข้องก่อน.',
            },
            {
              id: 'catalog',
              label: 'ข้อมูลตั้งต้นของระบบ',
              description: 'เก็บข้อมูลหลักที่ระบบต้องมีก่อนใช้งาน เช่น รายการสินค้า บริการ หรือเนื้อหา พร้อมหมวดหมู่.',
            },
            {
              id: 'reports',
              label: 'ข้อมูลสรุปและรายงาน',
              description: 'เก็บข้อมูลที่ต้องใช้สรุปผลรายวัน รายเดือน หรือสถิติการใช้งานก่อน.',
            },
          ],
          allowCustomAnswer: true,
        },
        {
          question: 'MVP รอบแรกไม่ทำอะไรบ้าง?',
          reason: `หัวข้อ: ${goal}`,
          impact: 'การตัดสิ่งที่ยังไม่ทำช่วยลด scope และทำให้แผนแรกนำไปทำจริงได้.',
          recommendedOptionId: 'external-integrations',
          options: [
            {
              id: 'external-integrations',
              label: 'ตัดระบบภายนอก',
              description: 'ยังไม่เชื่อมชำระเงิน ขนส่ง บัญชี หรือระบบอื่นในรอบแรก.',
            },
            {
              id: 'advanced-reporting',
              label: 'ตัดรายงานขั้นสูง',
              description: 'ทำเฉพาะรายงานจำเป็น ยังไม่ทำ analytics ลึกหรือ dashboard ซับซ้อน.',
            },
            {
              id: 'multi-unit',
              label: 'ตัดการขยายหลายหน่วย',
              description: 'เริ่มจากหน่วยเดียว flow เดียว หรือกลุ่มผู้ใช้เดียวก่อน แล้วค่อยขยาย.',
            },
          ],
          allowCustomAnswer: true,
        },
      ]
    : [
        {
          question: 'Start with workflow, Admin, or MVP scope first?',
          reason: `Topic: ${goal}`,
          impact: 'This decides whether the next question should focus on workflow, data, or scope.',
          recommendedOptionId: 'workflow',
          options: [
            {
              id: 'workflow',
              label: 'User workflow',
              description: 'Start with the real user journey, roles, and daily flow.',
            },
            {
              id: 'data-admin',
              label: 'Data and Admin',
              description: 'Start with stored data, admin screens, reports, and permissions.',
            },
            {
              id: 'mvp-scope',
              label: 'MVP scope',
              description: 'Start with first-version features and explicit exclusions.',
            },
          ],
          allowCustomAnswer: true,
        },
        {
          question: 'Who is the primary user for this system?',
          reason: `Topic: ${goal}`,
          impact: 'The main role changes workflows, screens, permissions, and stored data.',
          recommendedOptionId: 'staff',
          options: [
            {
              id: 'staff',
              label: 'Frontline staff',
              description: 'Optimize for fast daily operation and fewer mistakes.',
            },
            {
              id: 'owner',
              label: 'Owner or Admin',
              description: 'Optimize for setup, reports, data management, and oversight.',
            },
            {
              id: 'customer',
              label: 'Customer',
              description: 'Optimize for ordering, booking, payment, or self-service status.',
            },
          ],
          allowCustomAnswer: true,
        },
        {
          question: 'What data must be stored on day one?',
          reason: `Topic: ${goal}`,
          impact: 'Day-one data drives schema, input screens, reports, and MVP behavior.',
          recommendedOptionId: 'transactions',
          options: [
            {
              id: 'transactions',
              label: 'Core transactions and status',
              description: 'Store the main records or transactions with status, timestamps, and owner first.',
            },
            {
              id: 'catalog',
              label: 'Base system data',
              description: 'Store the core data the system needs before use, such as items, services, or content with categories.',
            },
            {
              id: 'reports',
              label: 'Summaries and reports',
              description: 'Store the data needed for daily, monthly, or usage summaries first.',
            },
          ],
          allowCustomAnswer: true,
        },
        {
          question: 'What is excluded from the first MVP?',
          reason: `Topic: ${goal}`,
          impact: 'Clear exclusions reduce scope and make the first implementation plan usable.',
          recommendedOptionId: 'external-integrations',
          options: [
            {
              id: 'external-integrations',
              label: 'External integrations',
              description: 'Skip payment, shipping, accounting, or other external systems first.',
            },
            {
              id: 'advanced-reporting',
              label: 'Advanced reporting',
              description: 'Keep only essential reports and skip deep analytics first.',
            },
            {
              id: 'multi-unit',
              label: 'Multi-unit expansion',
              description: 'Start with one unit, one workflow, or one user group before expanding.',
            },
          ],
          allowCustomAnswer: true,
        },
      ];

  return (
    fallbackDecisions.find((decision) => !isRepeatedCoworkQuestion(decision.question, avoidQuestions)) ??
    createExhaustedCoworkDecision(goal, isThai)
  );
}

function createExhaustedCoworkDecision(goal, isThai) {
  if (isThai) {
    return {
      question: 'ข้อมูลที่เก็บมาพอสำหรับเริ่มทำแผนแล้ว จะไปต่อแบบไหน?',
      reason: `หัวข้อ: ${goal}`,
      impact: 'คำตอบนี้กำหนดว่าจะสรุปแผนจากคำตอบที่มีอยู่ หรือเก็บรายละเอียดเพิ่มก่อนทำแผน.',
      recommendedOptionId: 'start-plan',
      options: [
        {
          id: 'start-plan',
          label: 'เริ่มทำแผนเลย',
          description: 'กดปุ่ม "เริ่มทำแผนเลย" ใต้การ์ดนี้ หรือพิมพ์ /plan เพื่อสรุปแผนจากคำตอบทั้งหมด.',
        },
        {
          id: 'add-detail',
          label: 'เพิ่มรายละเอียดเอง',
          description: 'พิมพ์ขอบเขต ข้อจำกัด หรือรายละเอียดที่ยังไม่ได้บอก ลงในช่องคำตอบของการ์ดนี้.',
        },
      ],
      allowCustomAnswer: true,
    };
  }

  return {
    question: 'Enough requirements are collected to draft a plan. How do you want to continue?',
    reason: `Topic: ${goal}`,
    impact: 'This decides whether Cowork drafts the plan from collected answers or gathers more detail first.',
    recommendedOptionId: 'start-plan',
    options: [
      {
        id: 'start-plan',
        label: 'Start the plan now',
        description: 'Press the "Start the plan now" button under this card, or type /plan to draft the plan.',
      },
      {
        id: 'add-detail',
        label: 'Add more detail',
        description: 'Type any missing scope, constraints, or requirements into the custom answer box.',
      },
    ],
    allowCustomAnswer: true,
  };
}
function createFallbackCoworkPlanner(draft = {}) {
  const goal = extractCoworkDisplayGoal(draft.goal || 'Cowork task');
  const isThai = draft.languageHint === 'th' || /[\u0E00-\u0E7F]/.test(goal);
  const intent = draft.intent === 'ask' ? 'ask' : 'plan';

  if (intent === 'ask') {
    return {
      intent,
      responseMode: 'decision',
      goal,
      currentUnderstanding: isThai
        ? `ผู้ใช้ต้องการเก็บ requirement สำหรับ ${goal} แต่โมเดลไม่คืน JSON ที่อ่านได้ จึงใช้คำถาม fallback ที่ปลอดภัยเพื่อเก็บข้อมูลสำคัญก่อนทำแผน.`
        : `The user wants requirements for ${goal}, but the model did not return valid JSON, so Cowork is asking one safe clarifying question first.`,
      clarifyingQuestions: [],
      scope: [],
      exclusions: [],
      steps: [],
      inspectFiles: [],
      suggestedFiles: [],
      avoidFiles: COWORK_DEFAULT_AVOID_FILES,
      risks: [],
      verification: [],
      nextAction: isThai
        ? 'ตอบตัวเลือกที่มีผลต่อ requirement มากที่สุด หรือพิมพ์คำตอบเอง.'
        : 'Choose the option that most affects requirements, or type a custom answer.',
      codexPrompt: '',
      decision: createFallbackCoworkDecision(goal, isThai, draft.avoidQuestions),
    };
  }

  return {
    intent,
    responseMode: 'plan',
    goal,
    currentUnderstanding: isThai
      ? `ผู้ใช้ต้องการแผนสำหรับ ${goal}. โมเดลไม่คืน JSON ที่อ่านได้ จึงใช้ fallback plan ที่ปลอดภัย โดยไม่อ้างว่าตรวจ repo หรือแก้ไฟล์แล้ว.`
      : `The user wants a plan for ${goal}. The model did not return valid JSON, so Cowork is using a safe fallback plan without claiming repo inspection or file changes.`,
    clarifyingQuestions: isThai
      ? [
          'MVP เวอร์ชันแรกต้องรองรับผู้ใช้หรือบทบาทใดบ้าง?',
          'ข้อมูลหลักที่ต้องเก็บตั้งแต่วันแรกมีอะไรบ้าง?',
          'มีระบบใดที่ต้องกันออกจาก scope รอบนี้หรือไม่?',
        ]
      : [
          'Which user roles must the first MVP support?',
          'Which core data must be stored on day one?',
          'Which systems should stay out of scope for this phase?',
        ],
    scope: isThai
      ? [
          `กำหนด MVP scope สำหรับ ${goal}`,
          'แยก workflow หลักของผู้ใช้ หน้างาน และ Admin',
          'กำหนด data model/API boundary โดยไม่แตะ normal Chat, Notebook, Sources หรือ Code mode',
        ]
      : [
          `Define MVP scope for ${goal}`,
          'Separate the main user, operator, and Admin workflows',
          'Define data model/API boundaries without touching normal Chat, Notebook, Sources, or Code mode',
        ],
    exclusions: [
      'Do not edit files from Cowork.',
      'Do not run terminal commands from Cowork.',
      'Do not write normal Chat conversations or messages.',
      'Do not touch Notebook, Sources, Code mode, sandbox, or tool execution.',
    ],
    steps: [
      { title: 'Audit the current relevant UI/API boundary before editing', status: 'todo' },
      { title: 'Define the smallest MVP workflow and data shape for this request', status: 'todo' },
      { title: 'Implement one narrow frontend/backend slice with protected normal Chat state', status: 'todo' },
      { title: 'Run targeted verification and manual Cowork-only checks', status: 'todo' },
    ],
    inspectFiles: [],
    suggestedFiles: [],
    avoidFiles: COWORK_DEFAULT_AVOID_FILES,
    risks: [
      'Scope can expand if Admin, customer, and reporting workflows are implemented in one phase.',
      'Normal Chat history could be polluted if Cowork reuses normal Chat submit or conversation writes.',
      'Planner quality can degrade when the selected model ignores JSON output instructions.',
    ],
    verification: [
      'Confirm Cowork messages stay out of normal Chat history.',
      'Confirm only Cowork planner/chat endpoints are called from Cowork commands.',
      'Run formatting, diff check, build api, restart api, and readyz after code changes.',
    ],
    nextAction: isThai
      ? 'ตอบคำถาม clarifying ที่สำคัญที่สุดก่อน แล้วค่อยให้ Code mode ทำ phase แรกแบบแคบ.'
      : 'Answer the highest-impact clarifying question first, then hand one narrow phase to Code mode.',
    codexPrompt: [
      'You are working inside the LibreChat repo.',
      `Task: implement the first narrow phase for ${goal}.`,
      'Strict scope: inspect only the relevant Cowork files and avoid broad refactors.',
      'Files: identify likely Cowork frontend/backend files before editing; do not touch normal Chat unless required for read-only reference.',
      'Avoid: Notebook, Sources, Code mode apply/checkpoint/rollback/verify, sandbox, terminal/tool execution, normal Chat conversation writes.',
      'Required behavior: keep Cowork separate from normal Chat and preserve existing localStorage behavior.',
      'Checks: run prettier on touched files, git diff --check, docker compose -f docker-compose.local.yml build api --progress=plain, docker compose -f docker-compose.local.yml up -d api, and readyz.',
      'Final report: summarize files changed, behavior added, protected areas not touched, checks run, readyz result, and final git status.',
    ].join('\n'),
    decision: null,
  };
}

function parseCoworkPlannerResponse(rawText = '', fallbackIntent = 'plan') {
  const parsed = parseCoworkJsonObject(rawText);

  const decision = sanitizeCoworkDecision(parsed.decision);
  const intent = parsed.intent === 'ask' || fallbackIntent === 'ask' ? 'ask' : 'plan';
  const responseMode = parsed.responseMode === 'decision' && decision ? 'decision' : 'plan';
  const planner = {
    intent,
    responseMode,
    goal: sanitizeCoworkText(parsed.goal),
    currentUnderstanding: sanitizeCoworkText(parsed.currentUnderstanding),
    clarifyingQuestions: sanitizeCoworkList(parsed.clarifyingQuestions),
    scope: sanitizeCoworkList(parsed.scope),
    exclusions: sanitizeCoworkList(parsed.exclusions),
    steps: sanitizeCoworkSteps(parsed.steps, true).map((step) => ({
      ...step,
      status: 'todo',
    })),
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
    decision: responseMode === 'decision' ? decision : null,
  };

  if (hasSuspiciousCoworkPlannerContent(planner)) {
    const error = new Error('Cowork planner returned unsafe content.');
    error.status = 422;
    throw error;
  }

  return planner;
}

function isCoworkPlannerInvalidJsonError(error) {
  return error?.message === 'Cowork planner returned invalid JSON.';
}

async function sendCoworkPlannerFollowup({
  abortController,
  client,
  conversationId,
  prompt,
  userMCPAuthMap,
}) {
  const userMessageId = randomUUID();
  const responseMessageId = randomUUID();
  const now = new Date().toISOString();

  client.parentMessageId = userMessageId;
  client.responseMessageId = responseMessageId;

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

  return extractCompletionText(completion);
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

function sanitizeCoworkChatMessages(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((message) => {
      const role = message?.role === 'assistant' ? 'assistant' : 'user';
      const content = sanitizeCoworkText(message?.content, MAX_COWORK_STRING_LENGTH);
      return content ? { role, content } : null;
    })
    .filter(Boolean)
    .slice(-MAX_COWORK_CHAT_CONTEXT_MESSAGES);
}

function createCoworkChatPrompt({ text, messages = [] }) {
  const context = messages
    .map((message) => `${message.role === 'assistant' ? 'Cowork' : 'User'}: ${message.content}`)
    .join('\n\n');

  return [
    'You are Cowork AI inside a chat-first work workspace.',
    'Reply naturally like a helpful collaborator. Keep the answer practical, direct, and in the user language.',
    'Do not claim you edited files, ran tools, used a terminal, changed Chat history, or accessed project files.',
    'If the user wants a structured implementation plan, mention that they can use /plan, but do not force every reply into a plan.',
    context ? `Recent Cowork room context:\n${context}` : '',
    `User message:\n${text}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function prepareCoworkChatRequest(req, _res, next) {
  const originalBody = req.body || {};
  const text = sanitizeCoworkText(originalBody.text, MAX_COWORK_STRING_LENGTH);
  const messages = sanitizeCoworkChatMessages(originalBody.messages);
  const prompt = text ? createCoworkChatPrompt({ text, messages }) : '';

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

function requireCoworkChatModelRouting(req, res, next) {
  if (typeof req.body?.endpoint !== 'string' || !req.body.endpoint.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'Cowork chat model routing is required.',
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
  if (
    resolved !== WORKSPACE_WRITE_ROOT &&
    !resolved.startsWith(`${WORKSPACE_WRITE_ROOT}${path.sep}`)
  ) {
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
  return (
    BLOCKED_EXTENSIONS.has(ext) || BLOCKED_FILE_NAMES.some((pattern) => pattern.test(fileName))
  );
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
    const typescriptPath = require.resolve('typescript', {
      paths: [WORKSPACE_WRITE_ROOT],
    });
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
          resolve(
            createVerificationCheck('runtime readyz', 'passed', `HTTP ${response.statusCode}`),
          );
          return;
        }
        resolve(
          createVerificationCheck('runtime readyz', 'failed', `HTTP ${response.statusCode || 0}`),
        );
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
    return [
      createVerificationCheck(`${normalized}: file`, 'failed', 'File is missing after apply'),
    ];
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
      checks.push(
        createVerificationCheck(`${normalized}: syntax`, 'failed', getCommandErrorMessage(error)),
      );
    }
  }

  if (options.checkTypeScriptSyntax && TS_SYNTAX_EXTENSIONS.has(ext)) {
    checks.push(verifyTypeScriptSyntax(options.ts, normalized, content));
  }

  return checks;
}

async function verifyAppliedFiles(files, profile = 'fast') {
  const normalizedProfile = getVerificationProfile(profile);
  const shouldCheckTypeScriptSyntax =
    normalizedProfile === 'normal' || normalizedProfile === 'strict';
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
    checks.push(
      createVerificationCheck('git diff --check', 'failed', getCommandErrorMessage(error)),
    );
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
  '/cowork/chat',
  configMiddleware,
  prepareCoworkChatRequest,
  requireCoworkChatModelRouting,
  moderateText,
  useAgentEndpointOptionBuilder,
  buildEndpointOption,
  async (req, res) => {
    try {
      const prompt = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!prompt) {
        return res.status(400).json({
          ok: false,
          error: 'Cowork chat message is required.',
        });
      }

      if (Buffer.byteLength(prompt, 'utf8') > MAX_COWORK_CHAT_PROMPT_BYTES) {
        return res.status(400).json({
          ok: false,
          error: 'Cowork chat request is too large.',
        });
      }

      const conversationId = `cowork-chat-${randomUUID()}`;
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
          error: 'Cowork chat returned an empty response.',
        });
      }

      return res.json({
        ok: true,
        text,
        answer: text,
      });
    } catch (error) {
      const status = error?.status || error?.response?.status || 500;
      const message = getSafeCoworkChatErrorMessage(error);
      logger.error('[cowork-chat] request failed', {
        status,
        message,
      });
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        ok: false,
        error: message,
      });
    }
  },
);

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
        warnings.push('Cowork planner returned an empty response; using safe fallback output.');
        return res.json({
          ok: true,
          planner: createFallbackCoworkPlanner(req.coworkPlannerDraft),
          warnings,
        });
      }

      let planner;
      let plannerText = text;
      try {
        planner = parseCoworkPlannerResponse(plannerText, req.coworkPlannerDraft?.intent);
      } catch (error) {
        if (!isCoworkPlannerInvalidJsonError(error)) {
          throw error;
        }

        const repairPrompt = createCoworkPlannerJsonRepairPrompt(prompt, plannerText, error.message);
        const repairText = await sendCoworkPlannerFollowup({
          abortController,
          client,
          conversationId,
          prompt: repairPrompt,
          userMCPAuthMap,
        });

        if (!repairText) {
          warnings.push(
            'Cowork planner JSON repair returned an empty response; using safe fallback output.',
          );
          planner = createFallbackCoworkPlanner(req.coworkPlannerDraft);
        } else {
          plannerText = repairText;
          try {
            planner = parseCoworkPlannerResponse(plannerText, req.coworkPlannerDraft?.intent);
          } catch (repairError) {
            if (!isCoworkPlannerInvalidJsonError(repairError)) {
              throw repairError;
            }
            warnings.push('Cowork planner returned invalid JSON after repair; using safe fallback output.');
            planner = createFallbackCoworkPlanner(req.coworkPlannerDraft);
          }
        }
      }

      let quality = validateCoworkPlannerQuality(
        planner,
        req.coworkPlannerDraft?.intent,
        req.coworkPlannerDraft,
      );
      if (quality.blocking.length > 0) {
        const retryText = await sendCoworkPlannerFollowup({
          abortController,
          client,
          conversationId,
          prompt: createCoworkPlannerRetryPrompt(prompt, plannerText, quality.blocking),
          userMCPAuthMap,
        });
        if (!retryText) {
          warnings.push('Cowork planner retry returned an empty response; using safe fallback output.');
          planner = createFallbackCoworkPlanner(req.coworkPlannerDraft);
        } else {
          plannerText = retryText;
          try {
            planner = parseCoworkPlannerResponse(plannerText, req.coworkPlannerDraft?.intent);
          } catch (error) {
            if (!isCoworkPlannerInvalidJsonError(error)) {
              throw error;
            }

            const repairText = await sendCoworkPlannerFollowup({
              abortController,
              client,
              conversationId,
              prompt: createCoworkPlannerJsonRepairPrompt(prompt, plannerText, error.message),
              userMCPAuthMap,
            });

            if (!repairText) {
              warnings.push(
                'Cowork planner retry JSON repair returned an empty response; using safe fallback output.',
              );
              planner = createFallbackCoworkPlanner(req.coworkPlannerDraft);
            } else {
              plannerText = repairText;
              try {
                planner = parseCoworkPlannerResponse(plannerText, req.coworkPlannerDraft?.intent);
              } catch (repairError) {
                if (!isCoworkPlannerInvalidJsonError(repairError)) {
                  throw repairError;
                }
                warnings.push(
                  'Cowork planner returned invalid JSON after retry repair; using safe fallback output.',
                );
                planner = createFallbackCoworkPlanner(req.coworkPlannerDraft);
              }
            }
          }
        }
        quality = validateCoworkPlannerQuality(
          planner,
          req.coworkPlannerDraft?.intent,
          req.coworkPlannerDraft,
        );
      }

      if (quality.blocking.length > 0) {
        warnings.push(
          `Cowork planner did not meet quality contract after retry; using safe fallback output: ${quality.blocking.join('; ')}`,
        );
        planner = createFallbackCoworkPlanner(req.coworkPlannerDraft);
        quality = validateCoworkPlannerQuality(
          planner,
          req.coworkPlannerDraft?.intent,
          req.coworkPlannerDraft,
        );
      }

      warnings.push(...quality.warnings);
      if (quality.blocking.length > 0) {
        warnings.push(
          `Cowork fallback did not meet quality contract but was returned to avoid blocking the user: ${quality.blocking.join('; ')}`,
        );
      }

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
    const writeStats = WORKSPACE_WRITE_ROOT
      ? await fs.stat(WORKSPACE_WRITE_ROOT).catch(() => null)
      : null;
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
      Math.max(
        1,
        Number.isFinite(requestedKeep) ? Math.floor(requestedKeep) : DEFAULT_CHECKPOINT_KEEP,
      ),
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
      .sort(
        (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
      )
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
          checks: [
            createVerificationCheck('post-apply verification', 'skipped', 'No file writes needed'),
          ],
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
      normalizedPatch: normalizedPatchText !== patchText ? normalizedPatchText : undefined,
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
module.exports.coworkInternals = {
  createExhaustedCoworkDecision,
  createFallbackCoworkDecision,
  getCoworkThaiCharCount,
  getCoworkWordCount,
  hasCoworkSpecificAnchor,
  isLowInformationCoworkItem,
  isOverloadedCoworkDecisionQuestion,
  isRepeatedCoworkQuestion,
  COWORK_ACTION_OFFER_PATTERN,
};
