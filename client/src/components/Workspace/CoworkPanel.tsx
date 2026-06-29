import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  FileText,
  FolderOpen,
  ListChecks,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type PlanStatus = 'todo' | 'doing' | 'done' | 'blocked';
type CopyState = 'idle' | 'copied' | 'failed';

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
  suggestedFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
};

type ListField = Exclude<keyof CoworkDraft, 'goal' | 'steps' | 'nextAction'>;

const statusOptions: PlanStatus[] = ['todo', 'doing', 'done', 'blocked'];
const statusLabelKeys: Record<PlanStatus, TranslationKeys> = {
  todo: 'com_ui_cowork_status_todo',
  doing: 'com_ui_cowork_status_doing',
  done: 'com_ui_cowork_status_done',
  blocked: 'com_ui_cowork_status_blocked',
};

const createStepId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createDefaultDraft = (): CoworkDraft => ({
  goal: 'Build the first Cowork planning workspace slice.',
  scope: [
    'Replace the static Cowork panel with editable planning fields.',
    'Keep Cowork as a read-only planning layer.',
    'Prepare prompts that hand work to Chat and Code safely.',
  ],
  exclusions: [
    'No direct file writes from Cowork.',
    'No backend route changes in this slice.',
    'No patch apply, checkpoint, restore, or verification actions from Cowork.',
  ],
  steps: [
    {
      id: createStepId(),
      title: 'Confirm the goal and scope.',
      status: 'done',
    },
    {
      id: createStepId(),
      title: 'Attach suggested files from Code > Files.',
      status: 'todo',
    },
    {
      id: createStepId(),
      title: 'Ask Chat for a unified diff.',
      status: 'todo',
    },
    {
      id: createStepId(),
      title: 'Review and apply only through Code > Changes.',
      status: 'todo',
    },
  ],
  suggestedFiles: ['client/src/components/Workspace/CoworkPanel.tsx'],
  risks: [
    'AI diff quality depends on current file context.',
    'Stale context can produce a patch that does not apply.',
    'Sensitive or blocked paths must stay out of scope.',
  ],
  verification: ['Fast workspace verification', 'git diff --check', 'UI smoke test'],
  nextAction: 'Open Code > Files and attach the suggested files before asking Chat for a diff.',
});

const splitLines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const formatList = (items: string[]) =>
  items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- TBD';

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
        ? draft.steps.map((step, index) => `${index + 1}. [${step.status}] ${step.title}`).join('\n')
        : '1. [todo] TBD'
    }`,
    '',
    `Files:\n${formatList(draft.suggestedFiles)}`,
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
    `Attached files expected from Code > Files:\n${formatList(draft.suggestedFiles)}`,
    '',
    `Verification target:\n${formatList(draft.verification)}`,
  ].join('\n');

function FieldShell({
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
  return (
    <section className="rounded-lg border border-border-light bg-surface-primary p-3">
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

export default function CoworkPanel() {
  const localize = useLocalize();
  const [draft, setDraft] = useState<CoworkDraft>(() => createDefaultDraft());
  const [planCopyState, setPlanCopyState] = useState<CopyState>('idle');
  const [diffCopyState, setDiffCopyState] = useState<CopyState>('idle');

  const planPrompt = useMemo(() => createPlanPrompt(draft), [draft]);
  const diffPrompt = useMemo(() => createDiffPrompt(draft), [draft]);
  const hasSuggestedFiles = draft.suggestedFiles.length > 0;

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

  const copyText = async (text: string, target: 'plan' | 'diff') => {
    const setState = target === 'plan' ? setPlanCopyState : setDiffCopyState;
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  const resetDraft = () => {
    setDraft(createDefaultDraft());
    setPlanCopyState('idle');
    setDiffCopyState('idle');
  };

  const renderCopyLabel = (base: string, state: CopyState) => {
    if (state === 'copied') {
      return localize('com_ui_cowork_copied');
    }
    if (state === 'failed') {
      return localize('com_ui_cowork_copy_failed');
    }
    return base;
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm">
      <div className="flex flex-col gap-3 rounded-lg border border-border-light bg-surface-secondary p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-text-primary">
              <ShieldCheck className="h-5 w-5 text-green-500" aria-hidden="true" />
              <h2 className="text-base font-semibold">{localize('com_ui_cowork')}</h2>
            </div>
            <p className="text-xs leading-5 text-text-secondary">
              {localize('com_ui_cowork_intro')}
            </p>
          </div>
          <ActionButton onClick={resetDraft}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_cowork_reset')}
          </ActionButton>
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton variant="primary" onClick={() => void copyText(planPrompt, 'plan')}>
            {planCopyState === 'copied' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {renderCopyLabel(localize('com_ui_cowork_copy_plan_prompt'), planCopyState)}
          </ActionButton>
          <ActionButton
            onClick={() => void copyText(diffPrompt, 'diff')}
            disabled={!hasSuggestedFiles}
          >
            {diffCopyState === 'copied' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {renderCopyLabel(localize('com_ui_cowork_prepare_diff_request'), diffCopyState)}
          </ActionButton>
        </div>

        {!hasSuggestedFiles ? (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-text-secondary">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
            <span>{localize('com_ui_cowork_diff_requires_files')}</span>
          </div>
        ) : null}
      </div>

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

      <div className="grid gap-3 xl:grid-cols-2">
        <FieldShell
          title={localize('com_ui_cowork_scope')}
          description={localize('com_ui_cowork_scope_help')}
          icon={ListChecks}
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
        >
          <div className="space-y-2">
            <TextAreaField
              value={draft.suggestedFiles.join('\n')}
              ariaLabel={localize('com_ui_cowork_files')}
              placeholder={localize('com_ui_cowork_files_placeholder')}
              onChange={(value) => updateListField('suggestedFiles', value)}
            />
            <ActionButton onClick={() => clearListField('suggestedFiles')}>
              {localize('com_ui_cowork_clear_files')}
            </ActionButton>
          </div>
        </FieldShell>
      </div>

      <FieldShell
        title={localize('com_ui_cowork_plan')}
        description={localize('com_ui_cowork_plan_help')}
        icon={ClipboardList}
      >
        <div className="space-y-2">
          {draft.steps.map((step, index) => (
            <div key={step.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
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
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border-light bg-surface-secondary text-text-secondary hover:text-text-primary"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <ActionButton onClick={addStep}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_cowork_add_step')}
          </ActionButton>
        </div>
      </FieldShell>

      <div className="grid gap-3 xl:grid-cols-2">
        <FieldShell
          title={localize('com_ui_cowork_risks')}
          description={localize('com_ui_cowork_risks_help')}
          icon={AlertTriangle}
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
        >
          <TextAreaField
            value={draft.verification.join('\n')}
            ariaLabel={localize('com_ui_cowork_verification')}
            placeholder={localize('com_ui_cowork_verification_placeholder')}
            onChange={(value) => updateListField('verification', value)}
          />
        </FieldShell>
      </div>

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
    </section>
  );
}
