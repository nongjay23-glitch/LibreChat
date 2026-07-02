import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  Code2,
  FileText,
  FolderOpen,
  ListChecks,
  MessageSquareText,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { request } from 'librechat-data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useActivePanel } from '~/Providers';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

type PlanStatus = 'todo' | 'doing' | 'done' | 'blocked';
type CopyState = 'idle' | 'copied' | 'selected';
type PromptKind = 'plan' | 'diff' | 'verification' | 'handoff';
type ReadinessStatus = 'planning' | 'needsFiles' | 'needsVerification' | 'readyForCode';
type CoworkTemplateId = 'uiPolish' | 'bugFix' | 'refactor' | 'testUpdate' | 'docsUpdate';
type CoworkTemplateField =
  'goal' | 'scope' | 'exclusions' | 'steps' | 'risks' | 'verification' | 'nextAction';

type CoworkStep = {
  id: string;
  title: string;
  status: PlanStatus;
};

type CoworkDraft = {
  goal: string;
  scope: string[];
  exclusions: string[];
  steps: CoworkStep[];
  inspectFiles: string[];
  suggestedFiles: string[];
  avoidFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
};

type CoworkDraftCandidate = Partial<{
  goal: string;
  scope: string[];
  exclusions: string[];
  steps: Array<Partial<CoworkStep>>;
  inspectFiles: string[];
  suggestedFiles: string[];
  avoidFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
}>;

type CoworkPlannerStep = {
  title: string;
  status: 'todo';
};

type CoworkPlannerResult = {
  goal: string;
  currentUnderstanding: string;
  clarifyingQuestions: string[];
  scope: string[];
  exclusions: string[];
  steps: CoworkPlannerStep[];
  inspectFiles: string[];
  suggestedFiles: string[];
  avoidFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
  codexPrompt: string;
};

type CoworkPlannerResponse = {
  ok?: boolean;
  planner?: Partial<CoworkPlannerResult>;
  warnings?: string[];
  error?: string;
};

type CoworkHistoryItem = {
  id: string;
  createdAt: string;
  title: string;
  draft: CoworkDraft;
  plannerPreview: CoworkPlannerResult | null;
  plannerWarnings: string[];
  isPlannerAccepted: boolean;
};

type CoworkHistoryCandidate = Partial<{
  id: string;
  createdAt: string;
  title: string;
  draft: CoworkDraftCandidate;
  plannerPreview: Partial<CoworkPlannerResult> | null;
  plannerWarnings: string[];
  isPlannerAccepted: boolean;
}>;

type RequestError = Error & {
  response?: {
    data?: {
      error?: string;
      message?: string;
    };
  };
};

type ListField = Exclude<keyof CoworkDraft, 'goal' | 'steps' | 'nextAction'>;
type ReadinessItem = {
  labelKey: TranslationKeys;
  isReady: boolean;
};
type CoworkReadiness = {
  status: ReadinessStatus;
  statusKey: TranslationKeys;
  helpKey: TranslationKeys;
  items: ReadinessItem[];
  readyCount: number;
  nextMissingKey?: TranslationKeys;
};

const coworkDraftStorageKey = 'librechat.coworkDraft.v2';
const coworkHistoryStorageKey = 'librechat.coworkPlanHistory.v1';
const maxCoworkHistoryItems = 20;
const statusOptions: PlanStatus[] = ['todo', 'doing', 'done', 'blocked'];
const promptKinds: PromptKind[] = ['plan', 'diff', 'verification', 'handoff'];
const templateIds: CoworkTemplateId[] = [
  'uiPolish',
  'bugFix',
  'refactor',
  'testUpdate',
  'docsUpdate',
];
const statusLabelKeys: Record<PlanStatus, TranslationKeys> = {
  todo: 'com_ui_cowork_status_todo',
  doing: 'com_ui_cowork_status_doing',
  done: 'com_ui_cowork_status_done',
  blocked: 'com_ui_cowork_status_blocked',
};
const promptLabelKeys: Record<PromptKind, TranslationKeys> = {
  plan: 'com_ui_cowork_prompt_plan',
  diff: 'com_ui_cowork_prompt_diff',
  verification: 'com_ui_cowork_prompt_verification',
  handoff: 'com_ui_cowork_prompt_handoff_summary',
};
const templateLabelKeys: Record<CoworkTemplateId, TranslationKeys> = {
  uiPolish: 'com_ui_cowork_template_ui_polish',
  bugFix: 'com_ui_cowork_template_bug_fix',
  refactor: 'com_ui_cowork_template_refactor',
  testUpdate: 'com_ui_cowork_template_test_update',
  docsUpdate: 'com_ui_cowork_template_docs_update',
};
const templateFieldKeys: Record<CoworkTemplateId, Record<CoworkTemplateField, TranslationKeys>> = {
  uiPolish: {
    goal: 'com_ui_cowork_template_ui_goal',
    scope: 'com_ui_cowork_template_ui_scope',
    exclusions: 'com_ui_cowork_template_ui_exclusions',
    steps: 'com_ui_cowork_template_ui_steps',
    risks: 'com_ui_cowork_template_ui_risks',
    verification: 'com_ui_cowork_template_ui_verification',
    nextAction: 'com_ui_cowork_template_ui_next_action',
  },
  bugFix: {
    goal: 'com_ui_cowork_template_bug_goal',
    scope: 'com_ui_cowork_template_bug_scope',
    exclusions: 'com_ui_cowork_template_bug_exclusions',
    steps: 'com_ui_cowork_template_bug_steps',
    risks: 'com_ui_cowork_template_bug_risks',
    verification: 'com_ui_cowork_template_bug_verification',
    nextAction: 'com_ui_cowork_template_bug_next_action',
  },
  refactor: {
    goal: 'com_ui_cowork_template_refactor_goal',
    scope: 'com_ui_cowork_template_refactor_scope',
    exclusions: 'com_ui_cowork_template_refactor_exclusions',
    steps: 'com_ui_cowork_template_refactor_steps',
    risks: 'com_ui_cowork_template_refactor_risks',
    verification: 'com_ui_cowork_template_refactor_verification',
    nextAction: 'com_ui_cowork_template_refactor_next_action',
  },
  testUpdate: {
    goal: 'com_ui_cowork_template_test_goal',
    scope: 'com_ui_cowork_template_test_scope',
    exclusions: 'com_ui_cowork_template_test_exclusions',
    steps: 'com_ui_cowork_template_test_steps',
    risks: 'com_ui_cowork_template_test_risks',
    verification: 'com_ui_cowork_template_test_verification',
    nextAction: 'com_ui_cowork_template_test_next_action',
  },
  docsUpdate: {
    goal: 'com_ui_cowork_template_docs_goal',
    scope: 'com_ui_cowork_template_docs_scope',
    exclusions: 'com_ui_cowork_template_docs_exclusions',
    steps: 'com_ui_cowork_template_docs_steps',
    risks: 'com_ui_cowork_template_docs_risks',
    verification: 'com_ui_cowork_template_docs_verification',
    nextAction: 'com_ui_cowork_template_docs_next_action',
  },
};
const blockedPathExamples = [
  '.env',
  'token',
  'password',
  'credential',
  '.git',
  'node_modules',
  'logs',
  'uploads',
  'database files',
];
const workflowLabelKeys: TranslationKeys[] = [
  'com_ui_cowork_workflow_plan',
  'com_ui_cowork_workflow_attach',
  'com_ui_cowork_workflow_diff',
  'com_ui_cowork_workflow_verify',
];

const createStepId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createEmptyDraft = (): CoworkDraft => ({
  goal: '',
  scope: [],
  exclusions: [],
  steps: [],
  inspectFiles: [],
  suggestedFiles: [],
  avoidFiles: ['.env', 'librechat.yaml', '.git', 'node_modules'],
  risks: [],
  verification: [],
  nextAction: '',
});

const splitLines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const createStepsFromText = (value: string) =>
  splitLines(value).map((title) => ({
    id: createStepId(),
    title,
    status: 'todo' as const,
  }));

const formatList = (items: string[]) =>
  items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- TBD';

const formatHistoryDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

/**
 * Matches actual secret-like VALUES, not bare label words.
 * Bare labels like "password", "token", ".env" are valid avoidFiles guidance.
 * Only reject: key=value, Bearer <long>, -----BEGIN, long API-key-like strings.
 */
const sensitiveDraftPattern =
  /-----BEGIN|\b(api[-_ ]?key|password|token|secret|credential)\s*[:=]\s*\S{6,}|\bBearer\s+[A-Za-z0-9_.\-]{20,}|\b(?:sk|pk|rk|xox[baprs]?)-[A-Za-z0-9_\-]{12,}\b/i;

const sanitizeDraftText = (value: string) =>
  sensitiveDraftPattern.test(value) ? '' : value.trim();

const getDraftText = (value: string | undefined, fallback: string) =>
  typeof value === 'string' ? sanitizeDraftText(value) : fallback;

const getDraftList = (value: string[] | undefined, fallback: string[]) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => (typeof item === 'string' ? sanitizeDraftText(item) : ''))
    .filter(Boolean);
};

const isPlanStatus = (value: string | undefined): value is PlanStatus =>
  value ? statusOptions.includes(value as PlanStatus) : false;

const getDraftSteps = (value: Array<Partial<CoworkStep>> | undefined, fallback: CoworkStep[]) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.map((step) => ({
    id: typeof step.id === 'string' && step.id ? step.id : createStepId(),
    title: typeof step.title === 'string' ? sanitizeDraftText(step.title) : '',
    status: isPlanStatus(step.status) ? step.status : 'todo',
  }));
};

const getPlannerText = (value: string | undefined) =>
  typeof value === 'string' ? sanitizeDraftText(value) : '';

const getPlannerList = (value: string[] | undefined) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? sanitizeDraftText(item) : ''))
    .filter(Boolean);
};

const getPlannerPathList = (value: string[] | undefined) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
};

const normalizePlannerResult = (value: Partial<CoworkPlannerResult> = {}): CoworkPlannerResult => ({
  goal: getPlannerText(value.goal),
  currentUnderstanding: getPlannerText(value.currentUnderstanding),
  clarifyingQuestions: getPlannerList(value.clarifyingQuestions),
  scope: getPlannerList(value.scope),
  exclusions: getPlannerList(value.exclusions),
  steps: Array.isArray(value.steps)
    ? value.steps
        .map((step) => ({
          title: getPlannerText(step?.title),
          status: 'todo' as const,
        }))
        .filter((step) => step.title)
    : [],
  inspectFiles: getPlannerList(value.inspectFiles),
  suggestedFiles: getPlannerList(value.suggestedFiles),
  avoidFiles: getPlannerPathList(value.avoidFiles),
  risks: getPlannerList(value.risks),
  verification: getPlannerList(value.verification),
  nextAction: getPlannerText(value.nextAction),
  codexPrompt: getPlannerText(value.codexPrompt),
});

const createDraftFromPlanner = (planner: CoworkPlannerResult): CoworkDraft => ({
  goal: planner.goal,
  scope: planner.scope,
  exclusions: planner.exclusions,
  steps: planner.steps.map((step) => ({
    id: createStepId(),
    title: step.title,
    status: 'todo',
  })),
  inspectFiles: planner.inspectFiles,
  suggestedFiles: planner.suggestedFiles,
  avoidFiles: planner.avoidFiles,
  risks: planner.risks,
  verification: planner.verification,
  nextAction: planner.nextAction,
});

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  const requestError = error as RequestError;
  return requestError?.response?.data?.error || requestError?.response?.data?.message || fallback;
};

const normalizeStoredDraft = (value: CoworkDraftCandidate, fallback: CoworkDraft): CoworkDraft => ({
  goal: getDraftText(value.goal, fallback.goal),
  scope: getDraftList(value.scope, fallback.scope),
  exclusions: getDraftList(value.exclusions, fallback.exclusions),
  steps: getDraftSteps(value.steps, fallback.steps),
  inspectFiles: getDraftList(value.inspectFiles, fallback.inspectFiles),
  suggestedFiles: getDraftList(value.suggestedFiles, fallback.suggestedFiles),
  avoidFiles: getDraftList(value.avoidFiles, fallback.avoidFiles),
  risks: getDraftList(value.risks, fallback.risks),
  verification: getDraftList(value.verification, fallback.verification),
  nextAction: getDraftText(value.nextAction, fallback.nextAction),
});

const sanitizeDraftForStorage = (draft: CoworkDraft) => normalizeStoredDraft(draft, draft);

const createDraftSignature = (draft: CoworkDraft) =>
  JSON.stringify({
    ...sanitizeDraftForStorage(draft),
    steps: draft.steps.map((step) => ({
      title: sanitizeDraftText(step.title),
      status: step.status,
    })),
  });

const createPlannerSignature = (plannerPreview: CoworkPlannerResult | null) =>
  plannerPreview
    ? JSON.stringify({
        goal: plannerPreview.goal,
        currentUnderstanding: plannerPreview.currentUnderstanding,
        clarifyingQuestions: plannerPreview.clarifyingQuestions,
        scope: plannerPreview.scope,
        exclusions: plannerPreview.exclusions,
        steps: plannerPreview.steps.map((step) => step.title),
        inspectFiles: plannerPreview.inspectFiles,
        suggestedFiles: plannerPreview.suggestedFiles,
        avoidFiles: plannerPreview.avoidFiles,
        risks: plannerPreview.risks,
        verification: plannerPreview.verification,
        nextAction: plannerPreview.nextAction,
        codexPrompt: plannerPreview.codexPrompt,
      })
    : '';

const createHistorySignature = (draft: CoworkDraft, plannerPreview: CoworkPlannerResult | null) =>
  `${createDraftSignature(draft)}::${createPlannerSignature(plannerPreview)}`;

const hasHistoryContent = (draft: CoworkDraft, plannerPreview: CoworkPlannerResult | null) =>
  hasDraftContent(draft) ||
  Boolean(
    plannerPreview?.goal ||
    plannerPreview?.currentUnderstanding ||
    plannerPreview?.codexPrompt ||
    plannerPreview?.steps.length,
  );

const createHistoryTitle = (draft: CoworkDraft, plannerPreview: CoworkPlannerResult | null) =>
  (draft.goal || plannerPreview?.goal || plannerPreview?.currentUnderstanding || 'Untitled plan')
    .trim()
    .slice(0, 120);

const normalizeHistoryItem = (
  value: CoworkHistoryCandidate,
  fallbackDraft: CoworkDraft,
): CoworkHistoryItem | null => {
  const draft = normalizeStoredDraft(value.draft ?? {}, fallbackDraft);
  const plannerPreview = value.plannerPreview ? normalizePlannerResult(value.plannerPreview) : null;

  if (!hasHistoryContent(draft, plannerPreview)) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === 'string' && value.createdAt
      ? value.createdAt
      : new Date().toISOString();
  const title =
    typeof value.title === 'string' && value.title.trim()
      ? sanitizeDraftText(value.title).slice(0, 120)
      : createHistoryTitle(draft, plannerPreview);

  return {
    id: typeof value.id === 'string' && value.id ? value.id : createStepId(),
    createdAt,
    title,
    draft,
    plannerPreview,
    plannerWarnings: getPlannerList(value.plannerWarnings),
    isPlannerAccepted: value.isPlannerAccepted === true,
  };
};

const sanitizeHistoryForStorage = (items: CoworkHistoryItem[]) =>
  items.slice(0, maxCoworkHistoryItems).map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    title: sanitizeDraftText(item.title).slice(0, 120),
    draft: sanitizeDraftForStorage(item.draft),
    plannerPreview: item.plannerPreview ? normalizePlannerResult(item.plannerPreview) : null,
    plannerWarnings: getPlannerList(item.plannerWarnings),
    isPlannerAccepted: item.isPlannerAccepted === true,
  }));

const createStarterDraft = (localize: (key: TranslationKeys) => string): CoworkDraft => ({
  ...createEmptyDraft(),
  goal: localize('com_ui_cowork_starter_goal'),
  scope: splitLines(localize('com_ui_cowork_starter_scope')),
  exclusions: splitLines(localize('com_ui_cowork_starter_exclusions')),
  steps: createStepsFromText(localize('com_ui_cowork_starter_steps')),
  risks: splitLines(localize('com_ui_cowork_starter_risks')),
  verification: splitLines(localize('com_ui_cowork_starter_verification')),
  nextAction: localize('com_ui_cowork_starter_next_action'),
});

const createTemplateDraft = (
  templateId: CoworkTemplateId,
  localize: (key: TranslationKeys) => string,
): CoworkDraft => {
  const keys = templateFieldKeys[templateId];

  return {
    ...createEmptyDraft(),
    goal: localize(keys.goal),
    scope: splitLines(localize(keys.scope)),
    exclusions: splitLines(localize(keys.exclusions)),
    steps: createStepsFromText(localize(keys.steps)),
    risks: splitLines(localize(keys.risks)),
    verification: splitLines(localize(keys.verification)),
    nextAction: localize(keys.nextAction),
  };
};

const hasDraftContent = (draft: CoworkDraft) =>
  Boolean(
    draft.goal.trim() ||
    draft.scope.length ||
    draft.exclusions.length ||
    draft.steps.some((step) => step.title.trim()) ||
    draft.inspectFiles.length ||
    draft.suggestedFiles.length ||
    draft.risks.length ||
    draft.verification.length ||
    draft.nextAction.trim(),
  );

const loadStoredDraft = () => {
  const fallback = createEmptyDraft();

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const storedDraft = window.localStorage.getItem(coworkDraftStorageKey);

    if (!storedDraft) {
      return fallback;
    }

    return normalizeStoredDraft(JSON.parse(storedDraft) as CoworkDraftCandidate, fallback);
  } catch {
    return fallback;
  }
};

const loadStoredHistory = () => {
  const fallbackDraft = createEmptyDraft();

  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const storedHistory = window.localStorage.getItem(coworkHistoryStorageKey);

    if (!storedHistory) {
      return [];
    }

    const parsed = JSON.parse(storedHistory);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeHistoryItem(item as CoworkHistoryCandidate, fallbackDraft))
      .filter((item): item is CoworkHistoryItem => Boolean(item))
      .slice(0, maxCoworkHistoryItems);
  } catch {
    return [];
  }
};

const writeStoredDraft = (draft: CoworkDraft) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    coworkDraftStorageKey,
    JSON.stringify(sanitizeDraftForStorage(draft)),
  );
};

const writeStoredHistory = (items: CoworkHistoryItem[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    coworkHistoryStorageKey,
    JSON.stringify(sanitizeHistoryForStorage(items)),
  );
};

const writeClipboard = (text: string) =>
  Promise.race([
    navigator.clipboard.writeText(text),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('Clipboard write timed out')), 1000);
    }),
  ]);

const copyTextFallback = (text: string, visibleTextArea?: HTMLTextAreaElement | null) => {
  if (visibleTextArea && visibleTextArea.value === text) {
    visibleTextArea.focus();
    visibleTextArea.select();
    return document.execCommand('copy');
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textArea);
  }
};

const createPlanPrompt = (draft: CoworkDraft) =>
  [
    'Help turn this request into a small, reviewable implementation plan.',
    'Keep Cowork as the planning layer only. Do not write files. Do not ask for secrets.',
    'Use English section headings: Goal, Scope, Plan, Files, Risks, Verification, Next Action.',
    'If anything is unclear, ask one focused question before proposing file changes.',
    '',
    `Goal:\n${draft.goal || 'TBD'}`,
    '',
    `Scope:\n${formatList(draft.scope)}`,
    '',
    `Out of scope:\n${formatList(draft.exclusions)}`,
    '',
    `Plan:\n${
      draft.steps.length > 0
        ? draft.steps
            .map((step, index) => `${index + 1}. [${step.status}] ${step.title}`)
            .join('\n')
        : '1. [todo] TBD'
    }`,
    '',
    `Files to inspect:\n${formatList(draft.inspectFiles)}`,
    '',
    `Files to attach in Code > Files:\n${formatList(draft.suggestedFiles)}`,
    '',
    `Files or paths to avoid:\n${formatList(draft.avoidFiles)}`,
    '',
    `Risks:\n${formatList(draft.risks)}`,
    '',
    `Verification:\n${formatList(draft.verification)}`,
    '',
    `Next Action:\n${draft.nextAction || 'TBD'}`,
  ].join('\n');

const createDiffPrompt = (draft: CoworkDraft) =>
  [
    'Return ONLY a valid unified diff. Do not explain. Do not paste full files.',
    'Use the latest attached file content as the source of truth.',
    'Every changed file must include: diff --git a/path b/path, --- a/path, +++ b/path, and valid @@ hunks.',
    'Keep hunks small and include enough unchanged context lines so git apply can match them.',
    'Do not edit or mention blocked paths such as .env, token, password, credential, .git, node_modules, logs, uploads, or database files.',
    'If the change cannot be expressed safely as a unified diff, return an empty diff block.',
    '',
    `Goal:\n${draft.goal || 'TBD'}`,
    '',
    `In scope:\n${formatList(draft.scope)}`,
    '',
    `Out of scope:\n${formatList(draft.exclusions)}`,
    '',
    `Files to inspect first:\n${formatList(draft.inspectFiles)}`,
    '',
    `Attached files expected from Code > Files:\n${formatList(draft.suggestedFiles)}`,
    '',
    `Do not edit these files or paths:\n${formatList(draft.avoidFiles)}`,
    '',
    `Verification target:\n${formatList(draft.verification)}`,
  ].join('\n');

const createVerificationPrompt = (draft: CoworkDraft) =>
  [
    'Review the result after Code applies the patch.',
    'Do not request new file writes unless verification clearly fails.',
    'Use English section headings: Result, Checks, Issues, Next Action.',
    'If a fix is needed, ask for a new small unified diff that stays inside the original scope.',
    '',
    `Goal:\n${draft.goal || 'TBD'}`,
    '',
    `Files expected to be inspected:\n${formatList(draft.inspectFiles)}`,
    '',
    `Files expected to be changed or attached:\n${formatList(draft.suggestedFiles)}`,
    '',
    `Files or paths that should remain untouched:\n${formatList(draft.avoidFiles)}`,
    '',
    `Verification checks to run or inspect:\n${formatList(draft.verification)}`,
    '',
    `Known risks:\n${formatList(draft.risks)}`,
  ].join('\n');

const createHandoffSummary = (draft: CoworkDraft) =>
  [
    'Cowork handoff summary',
    '',
    `Goal:\n${draft.goal || 'TBD'}`,
    '',
    `Files to inspect:\n${formatList(draft.inspectFiles)}`,
    '',
    `Files to attach in Code > Files:\n${formatList(draft.suggestedFiles)}`,
    '',
    `Files or paths to avoid:\n${formatList(draft.avoidFiles)}`,
    '',
    `Verification:\n${formatList(draft.verification)}`,
    '',
    `Next Action:\n${draft.nextAction || 'Open Code > Files and attach the suggested files.'}`,
  ].join('\n');

const createHandoffPayload = (draft: CoworkDraft) => {
  const safeDraft = sanitizeDraftForStorage(draft);

  return {
    id: `cowork-${createStepId()}`,
    createdAt: new Date().toISOString(),
    goal: safeDraft.goal,
    scope: safeDraft.scope,
    exclusions: safeDraft.exclusions,
    steps: safeDraft.steps
      .filter((step) => step.title.trim())
      .map((step) => ({
        title: step.title,
        status: step.status,
      })),
    inspectFiles: safeDraft.inspectFiles,
    suggestedFiles: safeDraft.suggestedFiles,
    avoidFiles: safeDraft.avoidFiles,
    risks: safeDraft.risks,
    verification: safeDraft.verification,
    nextAction: safeDraft.nextAction,
    summary: createHandoffSummary(safeDraft),
  };
};

const getReadiness = (draft: CoworkDraft): CoworkReadiness => {
  const hasGoal = draft.goal.trim().length > 0;
  const hasScope = draft.scope.length > 0 || draft.exclusions.length > 0;
  const hasPlan = draft.steps.some((step) => step.title.trim().length > 0);
  const hasFiles = draft.suggestedFiles.length > 0;
  const hasVerification = draft.verification.length > 0;
  const hasNextAction = draft.nextAction.trim().length > 0;
  const items: ReadinessItem[] = [
    { labelKey: 'com_ui_cowork_ready_goal', isReady: hasGoal },
    { labelKey: 'com_ui_cowork_ready_scope', isReady: hasScope },
    { labelKey: 'com_ui_cowork_ready_plan', isReady: hasPlan },
    { labelKey: 'com_ui_cowork_ready_files', isReady: hasFiles },
    { labelKey: 'com_ui_cowork_ready_verification', isReady: hasVerification },
    { labelKey: 'com_ui_cowork_ready_next_action', isReady: hasNextAction },
  ];
  const readyCount = items.filter((item) => item.isReady).length;
  const nextMissingKey = items.find((item) => !item.isReady)?.labelKey;

  if (!hasGoal || !hasScope || !hasPlan || !hasNextAction) {
    return {
      status: 'planning',
      statusKey: 'com_ui_cowork_ready_status_planning',
      helpKey: 'com_ui_cowork_ready_help_planning',
      items,
      readyCount,
      nextMissingKey,
    };
  }

  if (!hasFiles) {
    return {
      status: 'needsFiles',
      statusKey: 'com_ui_cowork_ready_status_needs_files',
      helpKey: 'com_ui_cowork_ready_help_needs_files',
      items,
      readyCount,
      nextMissingKey,
    };
  }

  if (!hasVerification) {
    return {
      status: 'needsVerification',
      statusKey: 'com_ui_cowork_ready_status_needs_verification',
      helpKey: 'com_ui_cowork_ready_help_needs_verification',
      items,
      readyCount,
      nextMissingKey,
    };
  }

  return {
    status: 'readyForCode',
    statusKey: 'com_ui_cowork_ready_status_ready_for_code',
    helpKey: 'com_ui_cowork_ready_help_ready_for_code',
    items,
    readyCount,
    nextMissingKey,
  };
};

function FieldShell({
  title,
  description,
  icon: Icon,
  variant = 'card',
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  variant?: 'card' | 'plain';
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        variant === 'card'
          ? 'rounded-lg border border-border-light bg-surface-primary p-3'
          : 'min-w-0',
      )}
    >
      <div className="mb-2 flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-text-secondary">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function DisclosureShell({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const localize = useLocalize();

  return (
    <details className="group rounded-lg border border-border-light bg-surface-primary p-3">
      <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-text-secondary">{description}</p>
          ) : null}
        </div>
        <span className="text-xs font-semibold text-text-secondary group-open:hidden">
          {localize('com_ui_show')}
        </span>
        <span className="hidden text-xs font-semibold text-text-secondary group-open:inline">
          {localize('com_ui_hide')}
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function TextAreaField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full resize-none rounded-md border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-blue-500"
    />
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'secondary',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary'
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'border border-border-light bg-surface-secondary text-text-primary hover:bg-surface-hover',
      )}
    >
      {children}
    </button>
  );
}

function PlannerPreviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0 rounded-md border border-border-light bg-surface-secondary p-2">
      <div className="text-xs font-semibold text-text-primary">{title}</div>
      {items.length > 0 ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-text-secondary">
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 text-xs leading-5 text-text-tertiary">-</div>
      )}
    </div>
  );
}

export default function CoworkPanel() {
  const localize = useLocalize();
  const { setActive } = useActivePanel();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const setCoworkCodeHandoff = useSetRecoilState(store.coworkCodeHandoffByIndex(0));
  const promptPreviewRef = useRef<HTMLTextAreaElement | null>(null);
  const plannerCodexPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState<CoworkDraft>(() => loadStoredDraft());
  const [activePromptKind, setActivePromptKind] = useState<PromptKind>('plan');
  const [planCopyState, setPlanCopyState] = useState<CopyState>('idle');
  const [diffCopyState, setDiffCopyState] = useState<CopyState>('idle');
  const [verificationCopyState, setVerificationCopyState] = useState<CopyState>('idle');
  const [handoffCopyState, setHandoffCopyState] = useState<CopyState>('idle');
  const [plannerPreview, setPlannerPreview] = useState<CoworkPlannerResult | null>(null);
  const [plannerWarnings, setPlannerWarnings] = useState<string[]>([]);
  const [plannerError, setPlannerError] = useState('');
  const [isPlannerLoading, setIsPlannerLoading] = useState(false);
  const [plannerCopyState, setPlannerCopyState] = useState<CopyState>('idle');
  const [isPlannerAccepted, setIsPlannerAccepted] = useState(false);
  const [coworkHistory, setCoworkHistory] = useState<CoworkHistoryItem[]>(() =>
    loadStoredHistory(),
  );
  const [historyCopyId, setHistoryCopyId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isReadyDetailsOpen, setIsReadyDetailsOpen] = useState(false);

  const planPrompt = useMemo(() => createPlanPrompt(draft), [draft]);
  const diffPrompt = useMemo(() => createDiffPrompt(draft), [draft]);
  const verificationPrompt = useMemo(() => createVerificationPrompt(draft), [draft]);
  const handoffSummary = useMemo(() => createHandoffSummary(draft), [draft]);
  const readiness = useMemo(() => getReadiness(draft), [draft]);
  const isDraftEmpty = useMemo(() => !hasDraftContent(draft), [draft]);
  const prompts: Record<PromptKind, string> = useMemo(
    () => ({
      plan: planPrompt,
      diff: diffPrompt,
      verification: verificationPrompt,
      handoff: handoffSummary,
    }),
    [diffPrompt, handoffSummary, planPrompt, verificationPrompt],
  );
  const hasSuggestedFiles = draft.suggestedFiles.length > 0;

  useEffect(() => {
    setPlanCopyState('idle');
    setDiffCopyState('idle');
    setVerificationCopyState('idle');
    setHandoffCopyState('idle');
  }, [draft]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      writeStoredDraft(draft);
    } catch {
      return;
    }
  }, [draft]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      writeStoredHistory(coworkHistory);
    } catch {
      return;
    }
  }, [coworkHistory]);

  useEffect(() => {
    if (!hasSuggestedFiles && activePromptKind === 'diff') {
      setActivePromptKind('plan');
    }
  }, [activePromptKind, hasSuggestedFiles]);

  const updateListField = (field: ListField, value: string) => {
    setDraft((current) => ({ ...current, [field]: splitLines(value) }));
  };

  const clearListField = (field: ListField) => {
    setDraft((current) => ({ ...current, [field]: [] }));
  };

  const updateStepTitle = (id: string, title: string) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === id ? { ...step, title } : step)),
    }));
  };

  const updateStepStatus = (id: string, status: PlanStatus) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === id ? { ...step, status } : step)),
    }));
  };

  const addStep = () => {
    setDraft((current) => ({
      ...current,
      steps: [...current.steps, { id: createStepId(), title: '', status: 'todo' }],
    }));
  };

  const removeStep = (id: string) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.id !== id),
    }));
  };

  const resetCopyStates = () => {
    setPlanCopyState('idle');
    setDiffCopyState('idle');
    setVerificationCopyState('idle');
    setHandoffCopyState('idle');
  };

  const replaceDraft = (nextDraft: CoworkDraft) => {
    setDraft(nextDraft);
    setActivePromptKind('plan');
    resetCopyStates();
  };

  const clearPlannerState = () => {
    setPlannerPreview(null);
    setPlannerWarnings([]);
    setPlannerError('');
    setIsPlannerAccepted(false);
    setPlannerCopyState('idle');
  };

  const archiveCurrentPlan = () => {
    if (!hasHistoryContent(draft, plannerPreview)) {
      return;
    }

    const nextItem: CoworkHistoryItem = {
      id: createStepId(),
      createdAt: new Date().toISOString(),
      title: createHistoryTitle(draft, plannerPreview),
      draft: sanitizeDraftForStorage(draft),
      plannerPreview: plannerPreview ? normalizePlannerResult(plannerPreview) : null,
      plannerWarnings: getPlannerList(plannerWarnings),
      isPlannerAccepted,
    };
    const nextSignature = createHistorySignature(nextItem.draft, nextItem.plannerPreview);

    const first = coworkHistory[0];
    const firstSignature = first ? createHistorySignature(first.draft, first.plannerPreview) : '';

    if (firstSignature === nextSignature) {
      return;
    }

    const nextHistory = [nextItem, ...coworkHistory].slice(0, maxCoworkHistoryItems);
    setCoworkHistory(nextHistory);
    writeStoredHistory(nextHistory);
  };

  const startNewPlan = () => {
    archiveCurrentPlan();
    const nextDraft = createEmptyDraft();
    replaceDraft(nextDraft);
    clearPlannerState();
    writeStoredDraft(nextDraft);
  };

  const applyTemplate = (templateId: CoworkTemplateId) => {
    replaceDraft(createTemplateDraft(templateId, localize));
    clearPlannerState();
  };

  const prepareForCode = () => {
    const handoff = createHandoffPayload(draft);
    setCoworkCodeHandoff(handoff);
    void copyText(handoff.summary, 'handoff');
  };

  const askCoworkAI = async () => {
    if (isPlannerLoading) {
      return;
    }

    if (!conversation?.endpoint) {
      setPlannerError(localize('com_ui_cowork_planner_error'));
      setPlannerWarnings([]);
      return;
    }

    setPlannerError('');
    setPlannerWarnings([]);
    setPlannerPreview(null);
    setIsPlannerAccepted(false);
    setPlannerCopyState('idle');
    setIsPlannerLoading(true);
    try {
      const data = (await request.post('/api/workspace/cowork/planner', {
        goal: draft.goal,
        scope: draft.scope,
        exclusions: draft.exclusions,
        steps: draft.steps.map(({ title, status }) => ({ title, status })),
        inspectFiles: draft.inspectFiles,
        suggestedFiles: draft.suggestedFiles,
        avoidFiles: draft.avoidFiles,
        risks: draft.risks,
        verification: draft.verification,
        nextAction: draft.nextAction,
        endpoint: conversation.endpoint,
        endpointType: conversation.endpointType,
        model: conversation.model,
        spec: conversation.spec,
        agent_id: conversation.agent_id,
        chatProjectId: conversation.chatProjectId,
      })) as CoworkPlannerResponse;

      if (!data?.ok || !data.planner) {
        throw new Error(data?.error || localize('com_ui_cowork_planner_error'));
      }

      setPlannerPreview(normalizePlannerResult(data.planner));
      setPlannerWarnings(getPlannerList(data.warnings));
    } catch (error) {
      setPlannerError(getRequestErrorMessage(error, localize('com_ui_cowork_planner_error')));
    } finally {
      setIsPlannerLoading(false);
    }
  };

  const acceptPlannerPreview = () => {
    if (!plannerPreview) {
      return;
    }
    replaceDraft(createDraftFromPlanner(plannerPreview));
    setIsPlannerAccepted(true);
    setPlannerError('');
    setPlannerCopyState('idle');
  };

  const discardPlannerPreview = () => {
    clearPlannerState();
  };

  const copyPlannerCodexPrompt = async () => {
    if (!plannerPreview?.codexPrompt) {
      return;
    }

    if (copyTextFallback(plannerPreview.codexPrompt, plannerCodexPromptRef.current)) {
      setPlannerCopyState('copied');
      return;
    }

    try {
      await writeClipboard(plannerPreview.codexPrompt);
      setPlannerCopyState('copied');
    } catch {
      window.setTimeout(() => {
        const promptPreview = plannerCodexPromptRef.current;

        if (copyTextFallback(plannerPreview.codexPrompt, promptPreview)) {
          setPlannerCopyState('copied');
          return;
        }

        promptPreview?.focus();
        promptPreview?.select();
        setPlannerCopyState('selected');
      }, 0);
    }
  };

  const copyText = async (text: string, target: PromptKind) => {
    const setState =
      target === 'plan'
        ? setPlanCopyState
        : target === 'diff'
          ? setDiffCopyState
          : target === 'verification'
            ? setVerificationCopyState
            : setHandoffCopyState;
    setActivePromptKind(target);

    if (copyTextFallback(text, promptPreviewRef.current)) {
      setState('copied');
      return;
    }

    try {
      await writeClipboard(text);
      setState('copied');
    } catch {
      window.setTimeout(() => {
        const promptPreview = promptPreviewRef.current;

        if (copyTextFallback(text, promptPreview)) {
          setState('copied');
          return;
        }

        promptPreview?.focus();
        promptPreview?.select();
        setState('selected');
      }, 0);
    }
  };

  const resetDraft = () => {
    archiveCurrentPlan();
    const nextDraft = createStarterDraft(localize);
    replaceDraft(nextDraft);
    clearPlannerState();
    writeStoredDraft(nextDraft);
  };

  const restoreHistoryItem = (item: CoworkHistoryItem) => {
    replaceDraft(item.draft);
    setPlannerPreview(item.plannerPreview);
    setPlannerWarnings(getPlannerList(item.plannerWarnings));
    setPlannerError('');
    setIsPlannerAccepted(item.isPlannerAccepted);
    setPlannerCopyState('idle');
    setHistoryCopyId(null);
    writeStoredDraft(item.draft);
  };

  const copyHistoryCodexPrompt = async (item: CoworkHistoryItem) => {
    if (!item.plannerPreview?.codexPrompt) {
      return;
    }

    try {
      await writeClipboard(item.plannerPreview.codexPrompt);
      setHistoryCopyId(item.id);
    } catch {
      setHistoryCopyId(null);
    }
  };

  const deleteHistoryItem = (itemId: string) => {
    if (!window.confirm(localize('com_ui_cowork_history_delete_confirm'))) {
      return;
    }

    const nextHistory = coworkHistory.filter((item) => item.id !== itemId);
    setCoworkHistory(nextHistory);
    writeStoredHistory(nextHistory);
  };

  const clearAllHistory = () => {
    const confirmation = window.prompt(localize('com_ui_cowork_history_clear_confirm'));

    if (confirmation !== 'CLEAR HISTORY') {
      return;
    }

    setCoworkHistory([]);
    setHistoryCopyId(null);
    writeStoredHistory([]);
  };

  const renderCopyLabel = (base: string, state: CopyState) => {
    if (state === 'copied') {
      return localize('com_ui_cowork_copied');
    }
    if (state === 'selected') {
      return localize('com_ui_cowork_prompt_selected');
    }
    return base;
  };
  const activeCopyState =
    activePromptKind === 'plan'
      ? planCopyState
      : activePromptKind === 'diff'
        ? diffCopyState
        : activePromptKind === 'verification'
          ? verificationCopyState
          : handoffCopyState;

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm">
      <div className="flex flex-col gap-3 rounded-lg border border-border-light bg-surface-secondary p-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-text-primary">
            <ShieldCheck className="h-5 w-5 text-green-500" aria-hidden="true" />
            <h2 className="text-base font-semibold">{localize('com_ui_cowork')}</h2>
          </div>
          <p className="text-xs leading-5 text-text-secondary">{localize('com_ui_cowork_intro')}</p>
          <p className="mt-1 text-xs leading-5 text-text-tertiary">
            {localize('com_ui_cowork_saved_locally')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={startNewPlan}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_cowork_new_plan')}
          </ActionButton>
          <ActionButton
            variant="primary"
            onClick={() => void askCoworkAI()}
            disabled={isPlannerLoading}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {isPlannerLoading
              ? localize('com_ui_cowork_planner_loading')
              : localize('com_ui_cowork_ask_ai')}
          </ActionButton>
          <ActionButton onClick={prepareForCode}>
            {handoffCopyState !== 'idle' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {renderCopyLabel(localize('com_ui_cowork_prepare_for_code'), handoffCopyState)}
          </ActionButton>
          <ActionButton onClick={() => setIsHistoryOpen((current) => !current)}>
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_cowork_history_compact').replace(
              '{{0}}',
              String(coworkHistory.length),
            )}
          </ActionButton>
          <ActionButton onClick={() => setIsMoreOpen((current) => !current)}>
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            {localize(isMoreOpen ? 'com_ui_cowork_hide_more' : 'com_ui_cowork_more')}
          </ActionButton>
        </div>

        {isDraftEmpty ? (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs leading-5 text-text-secondary">
            <div className="font-semibold text-text-primary">
              {localize('com_ui_cowork_empty_title')}
            </div>
            <div className="mt-1">{localize('com_ui_cowork_empty_help')}</div>
          </div>
        ) : null}

        {isMoreOpen ? (
          <div className="rounded-md border border-border-light bg-surface-primary p-3">
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={resetDraft}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {localize('com_ui_cowork_reset')}
              </ActionButton>
              <ActionButton variant="primary" onClick={() => void copyText(planPrompt, 'plan')}>
                {planCopyState !== 'idle' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {renderCopyLabel(localize('com_ui_cowork_refine_plan'), planCopyState)}
              </ActionButton>
              <ActionButton onClick={() => setActive('code-workspace')}>
                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                {localize('com_ui_cowork_open_code')}
              </ActionButton>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer list-none text-xs font-semibold text-text-secondary [&::-webkit-details-marker]:hidden">
                {localize('com_ui_cowork_templates')}
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {templateIds.map((templateId) => (
                  <ActionButton key={templateId} onClick={() => applyTemplate(templateId)}>
                    {localize(templateLabelKeys[templateId])}
                  </ActionButton>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-text-tertiary">
                {localize('com_ui_cowork_templates_help')}
              </p>
            </details>
          </div>
        ) : null}

        {!hasSuggestedFiles ? (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-text-secondary">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
            <span>{localize('com_ui_cowork_diff_requires_files')}</span>
          </div>
        ) : null}
      </div>

      {plannerError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-text-secondary">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
          <span>{plannerError}</span>
        </div>
      ) : null}

      {plannerPreview ? (
        <section className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-text-primary">
                  {localize('com_ui_cowork_planner_preview')}
                </h3>
              </div>
              <p className="text-xs leading-5 text-text-secondary">
                {localize('com_ui_cowork_planner_current_understanding')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                {plannerPreview.currentUnderstanding || '-'}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <ActionButton
                variant="primary"
                onClick={acceptPlannerPreview}
                disabled={isPlannerAccepted}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {localize(
                  isPlannerAccepted
                    ? 'com_ui_cowork_planner_accepted'
                    : 'com_ui_cowork_planner_accept',
                )}
              </ActionButton>
              <ActionButton onClick={discardPlannerPreview}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {localize(
                  isPlannerAccepted
                    ? 'com_ui_cowork_planner_clear_preview'
                    : 'com_ui_cowork_planner_discard',
                )}
              </ActionButton>
            </div>
          </div>

          {plannerWarnings.length > 0 ? (
            <div className="mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
              <div className="text-xs font-semibold text-text-primary">
                {localize('com_ui_cowork_planner_warnings')}
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-text-secondary">
                {plannerWarnings.map((warning, index) => (
                  <li key={`planner-warning-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 xl:grid-cols-2">
            <PlannerPreviewList
              title={localize('com_ui_cowork_goal')}
              items={plannerPreview.goal ? [plannerPreview.goal] : []}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_planner_clarifying_questions')}
              items={plannerPreview.clarifyingQuestions}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_planner_in_scope')}
              items={plannerPreview.scope}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_planner_out_of_scope')}
              items={plannerPreview.exclusions}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_planner_likely_files')}
              items={plannerPreview.inspectFiles}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_planner_suggested_files')}
              items={plannerPreview.suggestedFiles}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_plan')}
              items={plannerPreview.steps.map((step) => step.title)}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_risks')}
              items={plannerPreview.risks}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_verification')}
              items={plannerPreview.verification}
            />
            <PlannerPreviewList
              title={localize('com_ui_cowork_planner_next_action')}
              items={plannerPreview.nextAction ? [plannerPreview.nextAction] : []}
            />
          </div>

          <details className="mt-3 rounded-md border border-border-light bg-surface-primary p-3">
            <summary className="cursor-pointer list-none text-xs font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
              {localize('com_ui_cowork_planner_codex_prompt')}
            </summary>
            <textarea
              ref={plannerCodexPromptRef}
              readOnly
              rows={6}
              value={plannerPreview.codexPrompt}
              aria-label={localize('com_ui_cowork_planner_codex_prompt')}
              className="mt-2 w-full resize-none rounded-md border border-border-light bg-surface-secondary px-3 py-2 font-mono text-xs leading-5 text-text-primary outline-none"
            />
            <div className="mt-2 flex justify-end">
              <ActionButton
                onClick={() => void copyPlannerCodexPrompt()}
                disabled={!plannerPreview.codexPrompt}
              >
                {plannerCopyState === 'copied' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {plannerCopyState === 'copied'
                  ? localize('com_ui_cowork_planner_copied')
                  : localize('com_ui_cowork_planner_copy_codex_prompt')}
              </ActionButton>
            </div>
          </details>
        </section>
      ) : null}

      {isHistoryOpen ? (
        <section className="rounded-lg border border-border-light bg-surface-primary p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <FileText className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-text-primary">
                  {localize('com_ui_cowork_history')}
                </h3>
              </div>
              <p className="text-xs leading-5 text-text-secondary">
                {localize('com_ui_cowork_history_help')}
              </p>
            </div>
            <div className="shrink-0 rounded-md border border-border-light bg-surface-secondary px-3 py-2 text-xs font-semibold text-text-primary">
              {localize('com_ui_cowork_history_count').replace(
                '{{0}}',
                String(coworkHistory.length),
              )}
            </div>
          </div>

          {coworkHistory.length > 0 ? (
            <div className="mt-3 space-y-2">
              {coworkHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-border-light bg-surface-secondary p-2"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text-primary">
                        {item.title}
                      </div>
                      <div className="mt-1 text-xs text-text-tertiary">
                        {formatHistoryDate(item.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <ActionButton onClick={() => restoreHistoryItem(item)}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        {localize('com_ui_cowork_history_restore')}
                      </ActionButton>
                      <ActionButton
                        onClick={() => void copyHistoryCodexPrompt(item)}
                        disabled={!item.plannerPreview?.codexPrompt}
                      >
                        {historyCopyId === item.id ? (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {historyCopyId === item.id
                          ? localize('com_ui_cowork_copied')
                          : localize('com_ui_cowork_planner_copy_codex_prompt')}
                      </ActionButton>
                      <ActionButton onClick={() => deleteHistoryItem(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {localize('com_ui_cowork_history_delete')}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-border-light bg-surface-secondary px-3 py-2 text-xs leading-5 text-text-secondary">
              {localize('com_ui_cowork_history_empty')}
            </div>
          )}

          <details className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3">
            <summary className="cursor-pointer list-none text-xs font-semibold text-text-primary [&::-webkit-details-marker]:hidden">
              {localize('com_ui_cowork_history_advanced')}
            </summary>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              {localize('com_ui_cowork_history_clear_help')}
            </p>
            <div className="mt-2">
              <ActionButton onClick={clearAllHistory} disabled={coworkHistory.length === 0}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {localize('com_ui_cowork_history_clear_all')}
              </ActionButton>
            </div>
          </details>
        </section>
      ) : null}

      <section className="rounded-lg border border-border-light bg-surface-primary p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <Target className="h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
            <span className="font-semibold text-text-primary">
              {localize('com_ui_cowork_ready_title')}
            </span>
            <span className="text-text-secondary">
              {localize('com_ui_cowork_ready_count')
                .replace('{{0}}', String(readiness.readyCount))
                .replace('{{1}}', String(readiness.items.length))}
            </span>
            <span className="text-text-secondary">- {localize(readiness.statusKey)}</span>
          </div>
          <ActionButton onClick={() => setIsReadyDetailsOpen((current) => !current)}>
            {localize(
              isReadyDetailsOpen
                ? 'com_ui_cowork_hide_checklist_details'
                : 'com_ui_cowork_show_checklist_details',
            )}
          </ActionButton>
        </div>

        {isReadyDetailsOpen ? (
          <>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              {localize(readiness.helpKey)}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-tertiary">
              {readiness.nextMissingKey
                ? localize('com_ui_cowork_ready_next_missing').replace(
                    '{{0}}',
                    localize(readiness.nextMissingKey),
                  )
                : localize('com_ui_cowork_ready_all_set')}
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {readiness.items.map((item) => (
                <div
                  key={item.labelKey}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs',
                    item.isReady
                      ? 'border-green-500/30 bg-green-500/10 text-text-primary'
                      : 'border-border-light bg-surface-secondary text-text-secondary',
                  )}
                >
                  {item.isReady ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden="true" />
                  ) : (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-yellow-500"
                      aria-hidden="true"
                    />
                  )}
                  <span>{localize(item.labelKey)}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-1 rounded-md bg-surface-secondary p-1 sm:grid-cols-4">
              {workflowLabelKeys.map((labelKey, index) => {
                const isActive =
                  (readiness.status === 'planning' && index === 0) ||
                  (readiness.status === 'needsFiles' && index === 1) ||
                  (readiness.status === 'readyForCode' && index === 2) ||
                  (readiness.status === 'needsVerification' && index === 3);

                return (
                  <div
                    key={labelKey}
                    className={cn(
                      'rounded px-2 py-1.5 text-center text-xs font-semibold',
                      isActive
                        ? 'bg-surface-active-alt text-text-primary shadow-sm'
                        : 'text-text-secondary',
                    )}
                  >
                    {index + 1}. {localize(labelKey)}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <FieldShell
          title={localize('com_ui_cowork_goal')}
          description={localize('com_ui_cowork_goal_help')}
          icon={Target}
        >
          <TextAreaField
            value={draft.goal}
            rows={2}
            ariaLabel={localize('com_ui_cowork_goal')}
            placeholder={localize('com_ui_cowork_goal_placeholder')}
            onChange={(goal) => setDraft((current) => ({ ...current, goal }))}
          />
        </FieldShell>

        <FieldShell
          title={localize('com_ui_cowork_next_action')}
          description={localize('com_ui_cowork_next_action_help')}
          icon={Check}
        >
          <TextAreaField
            value={draft.nextAction}
            rows={2}
            ariaLabel={localize('com_ui_cowork_next_action')}
            placeholder={localize('com_ui_cowork_next_action_placeholder')}
            onChange={(nextAction) => setDraft((current) => ({ ...current, nextAction }))}
          />
        </FieldShell>
      </div>

      <FieldShell
        title={localize('com_ui_cowork_plan')}
        description={localize('com_ui_cowork_plan_help')}
        icon={ClipboardList}
      >
        <div className="space-y-2">
          {draft.steps.length > 0 ? (
            draft.steps.map((step, index) => (
              <div key={step.id} className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <select
                  value={step.status}
                  aria-label={`${localize('com_ui_cowork_step_status')} ${index + 1}`}
                  onChange={(event) => updateStepStatus(step.id, event.target.value as PlanStatus)}
                  className="h-9 rounded-md border border-border-light bg-surface-secondary px-2 text-xs text-text-primary outline-none focus:border-blue-500"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {localize(statusLabelKeys[status])}
                    </option>
                  ))}
                </select>
                <input
                  value={step.title}
                  aria-label={`${localize('com_ui_cowork_step')} ${index + 1}`}
                  placeholder={localize('com_ui_cowork_step_placeholder')}
                  onChange={(event) => updateStepTitle(step.id, event.target.value)}
                  className="h-9 min-w-0 rounded-md border border-border-light bg-surface-secondary px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  aria-label={`${localize('com_ui_cowork_remove_step')} ${index + 1}`}
                  className="flex h-9 w-9 items-center justify-center justify-self-end rounded-md border border-border-light bg-surface-secondary text-text-secondary hover:text-text-primary"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-border-light bg-surface-secondary px-3 py-3 text-xs leading-5 text-text-secondary">
              {localize('com_ui_cowork_plan_empty')}
            </div>
          )}
          <ActionButton onClick={addStep}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_cowork_add_step')}
          </ActionButton>
        </div>
      </FieldShell>

      <DisclosureShell
        title={localize('com_ui_cowork_details')}
        description={localize('com_ui_cowork_details_help')}
        icon={ListChecks}
      >
        <div className="grid gap-3 xl:grid-cols-2">
          <FieldShell
            title={localize('com_ui_cowork_scope')}
            description={localize('com_ui_cowork_scope_help')}
            icon={ListChecks}
            variant="plain"
          >
            <div className="space-y-2">
              <TextAreaField
                value={draft.scope.join('\n')}
                ariaLabel={localize('com_ui_cowork_scope')}
                placeholder={localize('com_ui_cowork_scope_placeholder')}
                onChange={(value) => updateListField('scope', value)}
              />
              <TextAreaField
                value={draft.exclusions.join('\n')}
                ariaLabel={localize('com_ui_cowork_exclusions')}
                placeholder={localize('com_ui_cowork_exclusions_placeholder')}
                onChange={(value) => updateListField('exclusions', value)}
              />
              <ActionButton onClick={() => clearListField('exclusions')}>
                {localize('com_ui_cowork_clear_exclusions')}
              </ActionButton>
            </div>
          </FieldShell>

          <FieldShell
            title={localize('com_ui_cowork_files')}
            description={localize('com_ui_cowork_files_help')}
            icon={FolderOpen}
            variant="plain"
          >
            <div className="space-y-2">
              <TextAreaField
                value={draft.inspectFiles.join('\n')}
                ariaLabel={localize('com_ui_cowork_files_inspect')}
                placeholder={localize('com_ui_cowork_files_inspect_placeholder')}
                onChange={(value) => updateListField('inspectFiles', value)}
              />
              <TextAreaField
                value={draft.suggestedFiles.join('\n')}
                ariaLabel={localize('com_ui_cowork_files_attach')}
                placeholder={localize('com_ui_cowork_files_placeholder')}
                onChange={(value) => updateListField('suggestedFiles', value)}
              />
              <TextAreaField
                value={draft.avoidFiles.join('\n')}
                ariaLabel={localize('com_ui_cowork_files_avoid')}
                placeholder={localize('com_ui_cowork_files_avoid_placeholder')}
                onChange={(value) => updateListField('avoidFiles', value)}
              />
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-text-secondary">
                <div className="font-semibold text-text-primary">
                  {localize('com_ui_cowork_files_safety')}
                </div>
                <div className="mt-1">
                  {localize('com_ui_cowork_files_safety_help')}{' '}
                  <span className="font-mono">{blockedPathExamples.join(', ')}</span>
                </div>
              </div>
              <ActionButton onClick={() => clearListField('suggestedFiles')}>
                {localize('com_ui_cowork_clear_files')}
              </ActionButton>
            </div>
          </FieldShell>

          <FieldShell
            title={localize('com_ui_cowork_risks')}
            description={localize('com_ui_cowork_risks_help')}
            icon={AlertTriangle}
            variant="plain"
          >
            <TextAreaField
              value={draft.risks.join('\n')}
              ariaLabel={localize('com_ui_cowork_risks')}
              placeholder={localize('com_ui_cowork_risks_placeholder')}
              onChange={(value) => updateListField('risks', value)}
            />
          </FieldShell>

          <FieldShell
            title={localize('com_ui_cowork_verification')}
            description={localize('com_ui_cowork_verification_help')}
            icon={FileText}
            variant="plain"
          >
            <TextAreaField
              value={draft.verification.join('\n')}
              ariaLabel={localize('com_ui_cowork_verification')}
              placeholder={localize('com_ui_cowork_verification_placeholder')}
              onChange={(value) => updateListField('verification', value)}
            />
          </FieldShell>
        </div>
      </DisclosureShell>

      <DisclosureShell
        title={localize('com_ui_cowork_prompt_handoff')}
        description={localize('com_ui_cowork_prompt_handoff_help')}
        icon={MessageSquareText}
      >
        <div className="space-y-2">
          <div
            className="grid grid-cols-2 gap-1 rounded-md bg-surface-secondary p-1 sm:grid-cols-4"
            role="tablist"
            aria-label={localize('com_ui_cowork_prompt_handoff')}
          >
            {promptKinds.map((kind) => {
              const isActive = activePromptKind === kind;
              const isDisabled = kind === 'diff' && !hasSuggestedFiles;
              return (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  disabled={isDisabled}
                  onClick={() => setActivePromptKind(kind)}
                  className={cn(
                    'h-8 rounded px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    isActive
                      ? 'bg-surface-active-alt text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {localize(promptLabelKeys[kind])}
                </button>
              );
            })}
          </div>
          <textarea
            ref={promptPreviewRef}
            readOnly
            rows={8}
            value={prompts[activePromptKind]}
            aria-label={localize('com_ui_cowork_prompt_preview')}
            className="w-full resize-none rounded-md border border-border-light bg-surface-secondary px-3 py-2 font-mono text-xs leading-5 text-text-primary outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs leading-5 text-text-secondary">
              {activePromptKind === 'diff'
                ? localize('com_ui_cowork_prompt_diff_help')
                : localize('com_ui_cowork_prompt_manual_help')}
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                onClick={() => void copyText(diffPrompt, 'diff')}
                disabled={!hasSuggestedFiles}
              >
                {diffCopyState !== 'idle' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {renderCopyLabel(localize('com_ui_cowork_prepare_diff_request'), diffCopyState)}
              </ActionButton>
              <ActionButton onClick={() => void copyText(verificationPrompt, 'verification')}>
                {verificationCopyState !== 'idle' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {renderCopyLabel(
                  localize('com_ui_cowork_copy_verification_prompt'),
                  verificationCopyState,
                )}
              </ActionButton>
              <ActionButton
                onClick={() => void copyText(prompts[activePromptKind], activePromptKind)}
                disabled={activePromptKind === 'diff' && !hasSuggestedFiles}
              >
                {activeCopyState !== 'idle' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {renderCopyLabel(localize('com_ui_cowork_copy_active_prompt'), activeCopyState)}
              </ActionButton>
            </div>
          </div>
        </div>
      </DisclosureShell>
    </section>
  );
}
