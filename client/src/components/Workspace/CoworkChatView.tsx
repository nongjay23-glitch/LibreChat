import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { SendIcon, TextareaAutosize } from "@librechat/client";
import {
  AlertTriangle,
  ArrowUpDown,
  Bookmark,
  Check,
  Copy,
  Folder,
  MessageSquareText,
  Mic,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type {
  Dispatch,
  FormEvent,
  MutableRefObject,
  SetStateAction,
} from "react";
import { request } from "librechat-data-provider";
import { useRecoilValue } from "recoil";
import type {
  CoworkDecisionOption,
  CoworkMessage,
  CoworkMessageModel,
  CoworkPlannerResult,
  CoworkProject,
  CoworkRoom,
} from "./coworkRooms";
import MarkdownLite from "~/components/Chat/Messages/Content/MarkdownLite";
import MessageTimestamp from "~/components/Chat/Messages/ui/MessageTimestamp";
import { useLocalize } from "~/hooks";
import { fontSizeAtom } from "~/store/fontSize";
import { cn, removeFocusRings } from "~/utils";
import store from "~/store";
import { useCoworkRooms } from "./coworkRooms";

type CoworkPlannerResponse = {
  ok?: boolean;
  planner?: Partial<CoworkPlannerResult>;
  warnings?: string[];
  error?: string;
};

type CoworkChatResponse = {
  ok?: boolean;
  text?: string;
  answer?: string;
  error?: string;
};

type CoworkChatPayload = {
  text: string;
  messages: Array<Pick<CoworkMessage, "role" | "content">>;
  roomId: string;
  endpoint: string;
  endpointType?: string | null;
  model?: string | null;
  spec?: string | null;
  agent_id?: string | null;
  chatProjectId?: string | null;
};

type CoworkPlannerPayload = {
  intent: CoworkPlannerIntent;
  goal: string;
  languageHint: CoworkLanguageHint;
  avoidQuestions: string[];
  scope: string[];
  exclusions: string[];
  steps: never[];
  inspectFiles: string[];
  suggestedFiles: string[];
  avoidFiles: string[];
  risks: string[];
  verification: string[];
  nextAction: string;
  endpoint: string;
  endpointType?: string | null;
  model?: string | null;
  spec?: string | null;
  agent_id?: string | null;
  chatProjectId?: string | null;
};

type CoworkPlanRequest = {
  roomId: string;
  task: string;
  model: CoworkMessageModel;
  intent: CoworkPlannerIntent;
  languageHint: CoworkLanguageHint;
  avoidQuestions: string[];
  scope?: string[];
  nextAction?: string;
};

type CoworkPlannerIntent = "plan" | "ask";
type CoworkLanguageHint = "th" | "en";

type CoworkCommand = {
  kind: "chat" | CoworkPlannerIntent;
  task: string;
};

function parseCoworkCommand(value: string) {
  const trimmedValue = value.trim();
  const match = /^\/(plan|ask)(?:\s+([\s\S]*))?$/i.exec(trimmedValue);

  if (!match) {
    return {
      kind: "chat",
      task: "",
    } satisfies CoworkCommand;
  }

  return {
    kind: match[1].toLowerCase() === "ask" ? "ask" : "plan",
    task: (match[2] ?? "").trim(),
  } satisfies CoworkCommand;
}

function getPlannerText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPlannerList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => getPlannerText(item))
        .filter((item) => item.length > 0)
    : [];
}

function getPlannerSteps(value: unknown): CoworkPlannerResult["steps"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((step) => {
      const candidate =
        step != null && typeof step === "object"
          ? (step as { title?: unknown })
          : null;
      return {
        title: getPlannerText(candidate?.title),
        status: "todo" as const,
      };
    })
    .filter((step) => step.title.length > 0);
}

function getPlannerDecision(value: unknown): CoworkPlannerResult["decision"] {
  if (value == null || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    question?: unknown;
    reason?: unknown;
    impact?: unknown;
    recommendedOptionId?: unknown;
    options?: unknown;
    allowCustomAnswer?: unknown;
  };
  const options = Array.isArray(candidate.options)
    ? candidate.options
        .map((option, index) => {
          const optionCandidate =
            option != null && typeof option === "object"
              ? (option as { id?: unknown; label?: unknown; description?: unknown })
              : null;
          return {
            id: getPlannerText(optionCandidate?.id) || `option-${index + 1}`,
            label: getPlannerText(optionCandidate?.label),
            description: getPlannerText(optionCandidate?.description),
          };
        })
        .filter((option) => option.label.length > 0 && option.description.length > 0)
        .slice(0, 4)
    : [];
  const recommendedOptionId = getPlannerText(candidate.recommendedOptionId);
  const validRecommendedOptionId = options.some((option) => option.id === recommendedOptionId)
    ? recommendedOptionId
    : "";
  const decision = {
    question: getPlannerText(candidate.question),
    reason: getPlannerText(candidate.reason),
    impact: getPlannerText(candidate.impact),
    recommendedOptionId: validRecommendedOptionId,
    options,
    allowCustomAnswer: candidate.allowCustomAnswer !== false,
  };

  if (!decision.question || options.length === 0) {
    return null;
  }

  return decision;
}

function normalizePlannerResult(
  planner: Partial<CoworkPlannerResult> | undefined,
  warnings: string[] | undefined,
): CoworkPlannerResult {
  const decision = getPlannerDecision(planner?.decision);
  return {
    intent: planner?.intent === "ask" ? "ask" : "plan",
    responseMode: planner?.responseMode === "decision" && decision ? "decision" : "plan",
    goal: getPlannerText(planner?.goal),
    currentUnderstanding: getPlannerText(planner?.currentUnderstanding),
    clarifyingQuestions: getPlannerList(planner?.clarifyingQuestions),
    scope: getPlannerList(planner?.scope),
    exclusions: getPlannerList(planner?.exclusions),
    steps: getPlannerSteps(planner?.steps),
    inspectFiles: getPlannerList(planner?.inspectFiles),
    suggestedFiles: getPlannerList(planner?.suggestedFiles),
    avoidFiles: getPlannerList(planner?.avoidFiles),
    risks: getPlannerList(planner?.risks),
    verification: getPlannerList(planner?.verification),
    nextAction: getPlannerText(planner?.nextAction),
    codexPrompt: getPlannerText(planner?.codexPrompt),
    warnings: getPlannerList(warnings),
    decision,
  };
}

function getPlannerMessageContent(plannerResult: CoworkPlannerResult, fallback: string) {
  if (plannerResult.responseMode === "decision" && plannerResult.decision) {
    return plannerResult.decision.question;
  }
  return plannerResult.currentUnderstanding || plannerResult.goal || fallback;
}

function getCoworkContinuationTopic(planner: CoworkPlannerResult, fallback: string) {
  const topic = (planner.goal || fallback || planner.currentUnderstanding).trim();
  if (topic.length <= 240) {
    return topic;
  }
  return `${topic.slice(0, 237).trim()}...`;
}

function getCoworkLanguageHint(value: string): CoworkLanguageHint {
  return /[\u0E00-\u0E7F]/.test(value) ? "th" : "en";
}

function getCoworkDecisionQuestions(messages: CoworkMessage[], excludeMessageId = "") {
  return messages
    .filter((message) => message.id !== excludeMessageId)
    .map((message) => message.plannerResult?.decision?.question?.trim() || "")
    .filter(Boolean)
    .slice(-12);
}

function getCoworkAnsweredRequirements(
  messages: CoworkMessage[],
  languageHint: CoworkLanguageHint,
) {
  return messages
    .filter(
      (message) =>
        message.role === "assistant" &&
        message.plannerResult?.decision != null &&
        message.decisionAnswer != null,
    )
    .slice(-12)
    .flatMap((message) => {
      const decisionAnswer = message.decisionAnswer!;
      return languageHint === "th"
        ? [
            `คำถามที่ตอบแล้ว: ${decisionAnswer.question}`,
            `คำตอบผู้ใช้: ${decisionAnswer.answer}`,
          ]
        : [
            `Answered question: ${decisionAnswer.question}`,
            `User answer: ${decisionAnswer.answer}`,
          ];
    });
}

function getCoworkPlannerMarkdown(
  planner: CoworkPlannerResult,
  fallback: string,
  labels: {
    clarifyingQuestions: string;
    nextAction: string;
    plan: string;
    risks: string;
    verification: string;
  },
) {
  const sections = [
    planner.currentUnderstanding || fallback || planner.goal,
    planner.nextAction ? `**${labels.nextAction}**\n${planner.nextAction}` : "",
    planner.steps.length
      ? `**${labels.plan}**\n${planner.steps
          .map((step, index) => `${index + 1}. ${step.title}`)
          .join("\n")}`
      : "",
    planner.clarifyingQuestions.length
      ? `**${labels.clarifyingQuestions}**\n${planner.clarifyingQuestions
          .map((question) => `- ${question}`)
          .join("\n")}`
      : "",
    planner.risks.length
      ? `**${labels.risks}**\n${planner.risks.map((risk) => `- ${risk}`).join("\n")}`
      : "",
    planner.verification.length
      ? `**${labels.verification}**\n${planner.verification
          .map((check) => `- ${check}`)
          .join("\n")}`
      : "",
  ].filter((section) => section.trim().length > 0);

  return sections.join("\n\n");
}

function getCoworkContinuationInstruction(
  intent: CoworkPlannerIntent,
  languageHint: CoworkLanguageHint,
) {
  if (languageHint === "th") {
    return intent === "ask"
      ? "ถามคำถามถัดไปเพียง 1 ข้อที่ต่างจากเดิมและมีผลต่อ requirement มากที่สุด ถ้าข้อมูลพอแล้ว ให้ถามสั้น ๆ ว่าจะเริ่ม /plan หรือเก็บรายละเอียดต่อ"
      : "ถ้ายังขาด decision สำคัญจริง ๆ ให้ถาม 1 ข้อที่ต่างจากเดิม ไม่อย่างนั้นให้สรุปเป็นแผนที่ทำต่อได้";
  }

  return intent === "ask"
    ? "Ask one different highest-impact requirement question. If enough information is available, ask briefly whether to start /plan or keep gathering details."
    : "If one important decision is still truly missing, ask one different question. Otherwise return a usable plan.";
}

function isAnsweredCoworkDecisionMessage(message: CoworkMessage) {
  return (
    message.role === "assistant" &&
    message.plannerResult?.responseMode === "decision" &&
    message.plannerResult.decision != null &&
    message.decisionAnswer != null
  );
}

function getRequestErrorMessage(error: unknown, fallback: string) {
  const requestError = error as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };
  return (
    requestError.response?.data?.error ||
    requestError.response?.data?.message ||
    requestError.message ||
    fallback
  );
}

function getRecentCoworkChatMessages(messages: CoworkMessage[]) {
  return messages
    .filter((message) => !message.error && !message.plannerResult && message.content.trim())
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function StreamingCoworkText({
  animate,
  className,
  text,
}: {
  animate: boolean;
  className: string;
  text: string;
}) {
  const [visibleText, setVisibleText] = useState(animate ? "" : text);

  useEffect(() => {
    if (!animate) {
      setVisibleText(text);
      return;
    }

    const characters = Array.from(text);
    let cursor = 0;
    let timeoutId = 0;

    const tick = () => {
      cursor = Math.min(cursor + 2, characters.length);
      setVisibleText(characters.slice(0, cursor).join(""));
      if (cursor < characters.length) {
        timeoutId = window.setTimeout(tick, 16);
      }
    };

    timeoutId = window.setTimeout(tick, 40);
    return () => window.clearTimeout(timeoutId);
  }, [animate, text]);

  return (
    <div className={className} aria-live={animate ? "polite" : undefined}>
      <MarkdownLite content={visibleText} codeExecution={false} />
      {animate && visibleText.length < text.length ? (
        <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded-full bg-text-secondary align-middle" />
      ) : null}
    </div>
  );
}

function CoworkMessageRow({
  animateAssistant,
  copiedMessageId,
  message,
  onCopyCodexPrompt,
  onStartPlanNow,
  onSubmitDecisionAnswer,
}: {
  animateAssistant: boolean;
  copiedMessageId: string;
  message: CoworkMessage;
  onCopyCodexPrompt: (message: CoworkMessage) => void;
  onStartPlanNow: (message: CoworkMessage) => void;
  onSubmitDecisionAnswer: (
    message: CoworkMessage,
    option: CoworkDecisionOption | null,
    customAnswer: string,
  ) => void;
}) {
  const fontSize = useAtomValue(fontSizeAtom);
  const localize = useLocalize();
  const userLabel = localize("com_ui_you");
  const assistantLabel = localize("com_ui_cowork");

  if (message.role === "assistant") {
    return (
      <div className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent">
        <div className="m-auto justify-center p-4 py-2 md:gap-6">
          <div
            id={message.id}
            aria-label={`${localize("com_ui_cowork")} ${localize("com_ui_assistant")}`}
            className="message-render group mx-auto flex flex-1 gap-3 transition-all duration-300 transform-gpu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy md:max-w-[47rem] xl:max-w-[55rem]"
          >
            <div className="relative flex flex-shrink-0 flex-col items-center">
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full pt-0.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-active-alt text-text-primary">
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
            </div>
            <div className="relative flex min-w-0 flex-1 flex-col">
              <h2
                className={cn(
                  "select-none font-semibold text-text-primary",
                  fontSize,
                )}
              >
                {assistantLabel}
                <MessageTimestamp value={message.createdAt} />
              </h2>
              <CoworkAssistantCard
                animateText={animateAssistant}
                copied={copiedMessageId === message.id}
                message={message}
                onCopyCodexPrompt={onCopyCodexPrompt}
                onStartPlanNow={onStartPlanNow}
                onSubmitDecisionAnswer={onSubmitDecisionAnswer}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent">
      <div className="m-auto justify-center p-4 py-2 md:gap-6">
        <div
          id={message.id}
          aria-label={`${localize("com_ui_cowork")} ${localize("com_ui_user")}`}
          className="message-render group mx-auto flex flex-1 flex-row-reverse gap-3 transition-all duration-300 transform-gpu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy md:max-w-[47rem] xl:max-w-[55rem]"
        >
          <div className="relative flex flex-shrink-0 flex-col items-center">
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full pt-0.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-text-primary text-[10px] font-semibold text-surface-primary">
                {userLabel}
              </div>
            </div>
          </div>
          <div className="user-turn relative flex w-11/12 flex-col items-end">
            <h2
              className={cn(
                "select-none text-right font-semibold text-text-primary",
                fontSize,
              )}
            >
              {userLabel}
              <MessageTimestamp value={message.createdAt} />
            </h2>
            <div className="flex w-full flex-col items-end gap-1">
              <div className="flex min-h-[20px] min-w-20 max-w-[75%] flex-col gap-0 rounded-2xl rounded-tr-md border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-left shadow-sm">
                <div
                  className={cn("whitespace-pre-wrap break-words", fontSize)}
                >
                  {message.content}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlannerList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-border-light bg-surface-secondary px-3 py-2">
      <div className="text-xs font-semibold text-text-primary">{title}</div>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-text-secondary">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function CoworkDecisionCard({
  message,
  onStartPlanNow,
  onSubmitDecisionAnswer,
}: {
  message: CoworkMessage;
  onStartPlanNow: (message: CoworkMessage) => void;
  onSubmitDecisionAnswer: (
    message: CoworkMessage,
    option: CoworkDecisionOption | null,
    customAnswer: string,
  ) => void;
}) {
  const localize = useLocalize();
  const [customAnswer, setCustomAnswer] = useState("");
  const decision = message.plannerResult?.decision;

  if (!decision) {
    return null;
  }

  const isAskFlow = message.plannerResult?.intent === "ask";

  const submitCustomAnswer = () => {
    const answer = customAnswer.trim();
    if (!answer) {
      return;
    }
    onSubmitDecisionAnswer(message, null, answer);
    setCustomAnswer("");
  };

  return (
    <div className="mt-2 max-w-3xl rounded-lg border border-border-light bg-surface-primary p-3 text-sm text-text-primary shadow-sm">
      <div className="text-[15px] font-semibold leading-6">{decision.question}</div>
      {decision.reason || decision.impact ? (
        <details className="mt-1 text-xs text-text-secondary">
          <summary className="cursor-pointer list-none hover:text-text-primary [&::-webkit-details-marker]:hidden">
            {localize("com_ui_cowork_decision_why")}
          </summary>
          <div className="mt-1 space-y-1 leading-5">
            {decision.reason ? <p>{decision.reason}</p> : null}
            {decision.impact ? <p>{decision.impact}</p> : null}
          </div>
        </details>
      ) : null}

      <div className="mt-3 grid gap-2">
        {decision.options.map((option) => {
          const isRecommended = option.id === decision.recommendedOptionId;
          return (
            <button
              type="button"
              key={`${message.id}-${option.id}`}
              onClick={() => onSubmitDecisionAnswer(message, option, "")}
              className="w-full rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-left transition-colors hover:bg-surface-hover"
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-text-primary">{option.label}</span>
                {isRecommended ? (
                  <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
                    {localize("com_ui_cowork_decision_recommended")}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
                {option.description}
              </div>
            </button>
          );
        })}
      </div>

      {decision.allowCustomAnswer ? (
        <div className="mt-3 rounded-lg border border-border-light bg-surface-secondary p-2">
          <textarea
            rows={2}
            value={customAnswer}
            onChange={(event) => setCustomAnswer(event.target.value)}
            placeholder={localize("com_ui_cowork_decision_custom_placeholder")}
            className="w-full resize-none bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={submitCustomAnswer}
              disabled={!customAnswer.trim()}
              className="inline-flex h-8 items-center rounded-md bg-surface-active px-3 text-xs font-semibold text-text-primary hover:bg-surface-active-alt disabled:cursor-not-allowed disabled:opacity-50"
            >
              {localize("com_ui_cowork_decision_send_custom")}
            </button>
          </div>
        </div>
      ) : null}

      {isAskFlow ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-light pt-3">
          <span className="text-xs text-text-secondary">
            {localize("com_ui_cowork_decision_start_plan_hint")}
          </span>
          <button
            type="button"
            onClick={() => onStartPlanNow(message)}
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-border-light bg-surface-primary px-3 text-xs font-semibold text-text-primary hover:bg-surface-hover"
          >
            {localize("com_ui_cowork_decision_start_plan")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CoworkAssistantCard({
  animateText,
  copied,
  message,
  onCopyCodexPrompt,
  onStartPlanNow,
  onSubmitDecisionAnswer,
}: {
  animateText: boolean;
  copied: boolean;
  message: CoworkMessage;
  onCopyCodexPrompt: (message: CoworkMessage) => void;
  onStartPlanNow: (message: CoworkMessage) => void;
  onSubmitDecisionAnswer: (
    message: CoworkMessage,
    option: CoworkDecisionOption | null,
    customAnswer: string,
  ) => void;
}) {
  const localize = useLocalize();
  const planner = message.plannerResult;

  if (message.error) {
    return (
      <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-text-primary">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />
          {localize("com_ui_cowork_planner_error")}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
          {message.error}
        </p>
      </div>
    );
  }

  if (!planner) {
    return (
      <StreamingCoworkText
        animate={animateText}
        className="mt-2 text-sm leading-7 text-text-primary [&_h1]:mb-2 [&_h1]:mt-4 [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:mb-2 [&_h3]:mt-4 [&_li]:my-1 [&_ol]:my-2 [&_p:last-child]:mb-0 [&_p]:mb-2 [&_ul]:my-2"
        text={message.content}
      />
    );
  }

  if (planner.responseMode === "decision" && planner.decision) {
    return (
      <CoworkDecisionCard
        message={message}
        onStartPlanNow={onStartPlanNow}
        onSubmitDecisionAnswer={onSubmitDecisionAnswer}
      />
    );
  }

  const planText = getCoworkPlannerMarkdown(
    planner,
    message.content,
    {
      clarifyingQuestions: localize("com_ui_cowork_planner_clarifying_questions"),
      nextAction: localize("com_ui_cowork_planner_next_action"),
      plan: localize("com_ui_cowork_plan"),
      risks: localize("com_ui_cowork_risks"),
      verification: localize("com_ui_cowork_verification"),
    },
  );
  const hasDetails =
    planner.scope.length > 0 ||
    planner.exclusions.length > 0 ||
    planner.inspectFiles.length > 0 ||
    planner.suggestedFiles.length > 0 ||
    planner.avoidFiles.length > 0 ||
    planner.warnings.length > 0 ||
    Boolean(planner.codexPrompt);

  return (
    <div className="mt-2 space-y-3 text-sm text-text-primary">
      <StreamingCoworkText
        animate={animateText}
        className="text-sm leading-7 text-text-primary [&_h1]:mb-2 [&_h1]:mt-4 [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:mb-2 [&_h3]:mt-4 [&_li]:my-0.5 [&_ol]:my-2 [&_p:last-child]:mb-0 [&_p]:mb-2 [&_ul]:my-2"
        text={planText}
      />

      {hasDetails ? (
        <details className="rounded-lg border border-border-light bg-surface-primary px-3 py-2 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
            <span>{localize("com_ui_cowork_planner_details")}</span>
            {message.model?.endpoint ? (
              <span className="rounded-full bg-surface-secondary px-2 py-1 font-normal">
                {message.model.model || message.model.spec || message.model.endpoint}
              </span>
            ) : null}
          </summary>
          <div className="mt-3 space-y-3">
            <PlannerList
              title={localize("com_ui_cowork_planner_in_scope")}
              items={planner.scope}
            />
            <PlannerList
              title={localize("com_ui_cowork_planner_out_of_scope")}
              items={planner.exclusions}
            />
            <PlannerList
              title={localize("com_ui_cowork_planner_likely_files")}
              items={planner.inspectFiles}
            />
            <PlannerList
              title={localize("com_ui_cowork_planner_suggested_files")}
              items={planner.suggestedFiles}
            />
            <PlannerList
              title={localize("com_ui_cowork_planner_warnings")}
              items={planner.warnings}
            />

            {planner.codexPrompt ? (
              <div className="rounded-md border border-border-light bg-surface-secondary px-3 py-2">
                <div className="text-xs font-semibold text-text-primary">
                  {localize("com_ui_cowork_planner_codex_prompt")}
                </div>
                <textarea
                  readOnly
                  rows={6}
                  value={planner.codexPrompt}
                  aria-label={localize("com_ui_cowork_planner_codex_prompt")}
                  className="mt-2 w-full resize-none rounded-md border border-border-light bg-surface-primary px-3 py-2 font-mono text-xs leading-5 text-text-primary outline-none"
                />
                <button
                  type="button"
                  onClick={() => onCopyCodexPrompt(message)}
                  className="mt-2 inline-flex h-8 items-center gap-2 rounded-md border border-border-light bg-surface-primary px-3 text-xs font-semibold text-text-primary hover:bg-surface-hover"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copied
                    ? localize("com_ui_cowork_copied")
                    : localize("com_ui_cowork_planner_copy_codex_prompt")}
                </button>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function CoworkEmptyState({
  active,
  roomTitle,
}: {
  active: boolean;
  roomTitle?: string;
}) {
  const localize = useLocalize();

  return (
    <div className="flex h-full max-h-full transform-gpu flex-col items-center justify-center pb-16 transition-all duration-200">
      <div className="flex flex-col items-center gap-0 p-2">
        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <div className="relative size-10 justify-center">
            <div className="shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white text-black dark:bg-presentation dark:text-white dark:after:shadow-none">
              <MessageSquareText
                className="h-2/3 w-2/3 text-black dark:text-white"
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="flex flex-col items-center gap-0 p-2">
            <h2 className="text-center text-2xl font-medium text-text-primary sm:text-4xl">
              {active ? (roomTitle ?? localize("com_ui_cowork")) : localize("com_ui_cowork")}
            </h2>
          </div>
        </div>
        <p className="animate-fadeIn mt-4 max-w-md text-center text-sm font-normal text-text-primary">
          {active
            ? localize("com_ui_cowork_task_prompt")
            : localize("com_ui_cowork_create_or_select_room")}
        </p>
      </div>
    </div>
  );
}

function CoworkHeader({
  activeRoomTitle,
  onCreateRoom,
}: {
  activeRoomTitle?: string;
  onCreateRoom: () => void;
}) {
  const localize = useLocalize();

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-10 flex h-[52px] w-full items-center justify-between bg-gradient-to-b from-presentation to-transparent p-2 font-semibold text-text-primary 2xl:via-transparent">
      <div className="hide-scrollbar flex w-full items-center justify-between gap-2 overflow-x-auto">
        <div className="mx-1 flex items-center">
          <div className="flex items-center gap-2 pl-2 transition-all duration-200 ease-in-out">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-light bg-surface-primary px-3 text-sm font-semibold text-text-primary shadow-sm">
              <MessageSquareText
                className="h-4 w-4 text-blue-500"
                aria-hidden="true"
              />
              <span className="max-w-[13rem] truncate">
                {activeRoomTitle ?? localize("com_ui_cowork")}
              </span>
            </span>
            <button
              type="button"
              disabled
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-light bg-surface-primary text-text-primary opacity-60 shadow-sm"
              aria-label={localize("com_ui_cowork_bookmarks_disabled")}
            >
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onCreateRoom}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-light bg-surface-primary text-text-primary shadow-sm transition-colors hover:bg-surface-hover"
              aria-label={localize("com_ui_cowork_create_room")}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-light bg-surface-primary px-3 text-sm font-semibold text-text-primary opacity-75 shadow-sm"
            aria-label={localize("com_ui_cowork_local_only_status")}
          >
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            <span>{localize("com_ui_cowork_local_only")}</span>
          </button>
        </div>
      </div>
      <div />
    </div>
  );
}

function CoworkMessagesView({
  copiedMessageId,
  messages,
  onCopyCodexPrompt,
  onStartPlanNow,
  onSubmitDecisionAnswer,
  roomId,
}: {
  copiedMessageId: string;
  messages: CoworkMessage[];
  onCopyCodexPrompt: (message: CoworkMessage) => void;
  onStartPlanNow: (message: CoworkMessage) => void;
  onSubmitDecisionAnswer: (
    message: CoworkMessage,
    option: CoworkDecisionOption | null,
    customAnswer: string,
  ) => void;
  roomId: string;
}) {
  const visibleMessages = useMemo(
    () => messages.filter((message) => !isAnsweredCoworkDecisionMessage(message)),
    [messages],
  );
  const previousRoomIdRef = useRef(roomId);
  const previousMessageIdsRef = useRef(new Set(visibleMessages.map((message) => message.id)));
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const currentMessageIds = new Set(visibleMessages.map((message) => message.id));
    if (previousRoomIdRef.current !== roomId) {
      previousRoomIdRef.current = roomId;
      previousMessageIdsRef.current = currentMessageIds;
      setAnimatedMessageIds(new Set());
      return;
    }

    const nextAnimatedIds = visibleMessages
      .filter(
        (message) =>
          message.role === "assistant" &&
          !message.error &&
          (!message.plannerResult || message.plannerResult.responseMode === "plan") &&
          !previousMessageIdsRef.current.has(message.id),
      )
      .map((message) => message.id);

    previousMessageIdsRef.current = currentMessageIds;
    if (nextAnimatedIds.length === 0) {
      return;
    }

    setAnimatedMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextAnimatedIds.forEach((messageId) => nextIds.add(messageId));
      return nextIds;
    });
  }, [visibleMessages, roomId]);

  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative h-full">
        <div
          className="scrollbar-gutter-stable"
          style={{
            height: "100%",
            overflowY: "auto",
            width: "100%",
          }}
        >
          <div className="flex flex-col pb-9 pt-14 dark:bg-transparent">
            {visibleMessages.map((message) => (
              <CoworkMessageRow
                animateAssistant={animatedMessageIds.has(message.id)}
                key={message.id}
                copiedMessageId={copiedMessageId}
                message={message}
                onCopyCodexPrompt={onCopyCodexPrompt}
                onStartPlanNow={onStartPlanNow}
                onSubmitDecisionAnswer={onSubmitDecisionAnswer}
              />
            ))}
            <div
              id="cowork-messages-end"
              className="group h-0 w-full flex-shrink-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CoworkFooter() {
  const localize = useLocalize();

  return (
    <div className="relative w-full">
      <div
        className="absolute bottom-0 left-0 right-0 hidden items-center justify-center gap-2 px-2 py-2 text-center text-xs text-text-primary sm:flex md:px-[60px]"
        role="contentinfo"
      >
        {localize("com_ui_cowork_local_only_note")}
      </div>
    </div>
  );
}

type CoworkProjectSort = "updatedAt" | "createdAt" | "title";

function formatProjectDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getProjectChatCount(projectId: string, rooms: CoworkRoom[]) {
  return rooms.filter((room) => room.projectId === projectId && !room.archivedAt)
    .length;
}

function sortProjects(
  projects: CoworkProject[],
  sortBy: CoworkProjectSort,
  rooms: CoworkRoom[],
) {
  return projects.slice().sort((a, b) => {
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }

    if (sortBy === "createdAt") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }

    const aRoomTime = rooms
      .filter((room) => room.projectId === a.id && !room.archivedAt)
      .reduce((latestTime, room) => {
        return Math.max(latestTime, new Date(room.updatedAt).getTime());
      }, 0);
    const bRoomTime = rooms
      .filter((room) => room.projectId === b.id && !room.archivedAt)
      .reduce((latestTime, room) => {
        return Math.max(latestTime, new Date(room.updatedAt).getTime());
      }, 0);

    return (
      Math.max(bRoomTime, new Date(b.updatedAt).getTime()) -
      Math.max(aRoomTime, new Date(a.updatedAt).getTime())
    );
  });
}

function CoworkProjectsOverview({
  createProject,
  openProjectId,
  projects,
  rooms,
}: {
  createProject: () => void;
  openProjectId: string;
  projects: CoworkProject[];
  rooms: CoworkRoom[];
}) {
  const localize = useLocalize();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<CoworkProjectSort>("updatedAt");

  const sortLabel = useMemo(() => {
    if (sortBy === "title") {
      return localize("com_ui_name");
    }
    if (sortBy === "createdAt") {
      return localize("com_ui_sort_created");
    }
    return localize("com_ui_latest_activity");
  }, [localize, sortBy]);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const matchingProjects = normalizedSearch
      ? projects.filter((project) =>
          project.title.toLowerCase().includes(normalizedSearch),
        )
      : projects;

    return sortProjects(matchingProjects, sortBy, rooms);
  }, [projects, rooms, search, sortBy]);

  const cycleSort = () => {
    setSortBy((currentSort) => {
      if (currentSort === "updatedAt") {
        return "createdAt";
      }
      if (currentSort === "createdAt") {
        return "title";
      }
      return "updatedAt";
    });
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <div className="container mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 md:px-6 lg:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
            {localize("com_ui_projects")}
          </h1>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-text-secondary sm:inline">
              {localize("com_ui_sort_by")}
            </span>
            <button
              type="button"
              onClick={cycleSort}
              aria-label={localize("com_ui_sort_projects_by")}
              className="inline-flex h-10 items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-border-medium bg-surface-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary sm:w-44"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ArrowUpDown
                  className="h-4 w-4 shrink-0 text-text-secondary"
                  aria-hidden="true"
                />
                <span className="truncate">{sortLabel}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={createProject}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {localize("com_ui_new_project")}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{localize("com_ui_search_projects")}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={localize("com_ui_search_projects")}
              className="flex h-10 w-full rounded-lg border border-border-medium bg-surface-secondary py-2 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          </label>
          <div className="flex items-center">
            <span className="rounded-full bg-surface-active-alt px-4 py-2 text-sm font-medium text-text-primary">
              {localize("com_ui_your_projects")}
            </span>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="rounded-lg border border-border-medium bg-transparent py-16 text-center text-sm text-text-secondary">
            {localize("com_ui_cowork_no_projects")}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {filteredProjects.map((project) => {
              const chatCount = getProjectChatCount(project.id, rooms);
              return (
                <div
                  key={project.id}
                  className={cn(
                    "group/project flex min-h-[8.5rem] flex-col rounded-xl border border-border-medium bg-surface-secondary p-4 text-left transition-colors",
                    project.id === openProjectId
                      ? "border-border-heavy bg-surface-tertiary"
                      : "hover:border-border-heavy hover:bg-surface-tertiary",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Folder
                      className="h-4 w-4 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                    <span className="truncate text-base font-semibold text-text-primary">
                      {project.title}
                    </span>
                  </span>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-text-secondary">
                    <span>
                      {chatCount === 1
                        ? localize("com_ui_project_chat_count_single")
                        : localize("com_ui_project_chat_count", { count: chatCount })}
                    </span>
                    <span className="shrink-0 truncate">
                      {formatProjectDate(project.updatedAt)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function CoworkChatView() {
  const {
    activeRoom,
    addAssistantMessage,
    addMessage,
    answerDecisionMessage,
    createProject,
    createRoom,
    isProjectsViewOpen,
    openProjectId,
    projects,
    rooms,
  } = useCoworkRooms();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const [draft, setDraft] = useState("");
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [pendingRoomId, setPendingRoomId] = useState("");
  const [pendingKind, setPendingKind] = useState<"chat" | CoworkPlannerIntent | "">("");
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const localize = useLocalize();

  const selectedModel = useMemo<CoworkMessageModel>(
    () => ({
      endpoint: conversation?.endpoint ?? null,
      endpointType: conversation?.endpointType ?? null,
      model: conversation?.model ?? null,
      spec: conversation?.spec ?? null,
      agent_id: conversation?.agent_id ?? null,
      chatProjectId: conversation?.chatProjectId ?? null,
    }),
    [
      conversation?.agent_id,
      conversation?.chatProjectId,
      conversation?.endpoint,
      conversation?.endpointType,
      conversation?.model,
      conversation?.spec,
    ],
  );

  const canSend = useMemo(() => {
    return (
      activeRoom != null &&
      draft.trim().length > 0 &&
      !pendingRoomId
    );
  }, [activeRoom, draft, pendingRoomId]);

  const isLandingPage = !activeRoom || activeRoom.messages.length === 0;

  const handleContainerClick = () => {
    if (window.matchMedia?.("(pointer: coarse)").matches) {
      return;
    }
    textAreaRef.current?.focus();
  };

  const handleCopyCodexPrompt = async (message: CoworkMessage) => {
    const codexPrompt = message.plannerResult?.codexPrompt;
    if (!codexPrompt) {
      return;
    }

    await navigator.clipboard.writeText(codexPrompt);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(""), 1600);
  };

  const requestCoworkPlan = async ({
    roomId,
    task,
    model,
    intent,
    languageHint,
    avoidQuestions,
    scope = [],
    nextAction = "",
  }: CoworkPlanRequest) => {
    if (!model.endpoint) {
      addAssistantMessage(roomId, {
        content: "",
        error: localize("com_ui_cowork_planner_missing_endpoint"),
        model,
      });
      return;
    }

    setPendingRoomId(roomId);
    setPendingKind(intent);
    try {
      const payload: CoworkPlannerPayload = {
        intent,
        goal: task,
        languageHint,
        avoidQuestions,
        scope,
        exclusions: [],
        steps: [],
        inspectFiles: [],
        suggestedFiles: [],
        avoidFiles: [],
        risks: [],
        verification: [],
        nextAction,
        endpoint: model.endpoint,
        endpointType: model.endpointType,
        model: model.model,
        spec: model.spec,
        agent_id: model.agent_id,
        chatProjectId: model.chatProjectId,
      };
      const data = (await request.post(
        "/api/workspace/cowork/planner",
        payload,
      )) as CoworkPlannerResponse;

      if (!data?.ok || !data.planner) {
        throw new Error(data?.error || localize("com_ui_cowork_planner_error"));
      }

      const plannerResult = normalizePlannerResult(data.planner, data.warnings);
      addAssistantMessage(roomId, {
        content: getPlannerMessageContent(
          plannerResult,
          localize("com_ui_cowork_planner_preview"),
        ),
        plannerResult,
        model,
      });
    } catch (error) {
      addAssistantMessage(roomId, {
        content: "",
        error: getRequestErrorMessage(error, localize("com_ui_cowork_planner_error")),
        model,
      });
    } finally {
      setPendingRoomId("");
      setPendingKind("");
    }
  };

  const handleSubmitDecisionAnswer = (
    message: CoworkMessage,
    option: CoworkDecisionOption | null,
    customAnswer: string,
  ) => {
    if (!activeRoom || pendingRoomId) {
      return;
    }

    const decision = message.plannerResult?.decision;
    const planner = message.plannerResult;
    if (!decision || !planner) {
      return;
    }

    const answer = option
      ? `${option.label}\n${option.description}`
      : customAnswer.trim();
    if (!answer) {
      return;
    }

    const userMessage = option
      ? `${localize("com_ui_cowork_decision_selected")}: ${option.label}`
      : answer;
    const intent = planner.intent === "ask" ? "ask" : "plan";
    const languageHint = getCoworkLanguageHint(
      [
        ...activeRoom.messages.map((roomMessage) => roomMessage.content),
        planner.goal,
        planner.currentUnderstanding,
        decision.question,
        answer,
      ].join(" "),
    );
    const avoidQuestions = [
      ...getCoworkDecisionQuestions(activeRoom.messages, message.id),
      decision.question,
    ];
    const nextTask = getCoworkContinuationTopic(planner, message.content);
    const scope = [
      ...getCoworkAnsweredRequirements(activeRoom.messages, languageHint),
      ...(languageHint === "th"
        ? [`คำถามที่ตอบแล้ว: ${decision.question}`, `คำตอบผู้ใช้: ${answer}`]
        : [`Answered question: ${decision.question}`, `User answer: ${answer}`]),
    ].slice(-24);

    answerDecisionMessage(activeRoom.id, message.id, {
      question: decision.question,
      answer,
      optionId: option?.id,
      optionLabel: option?.label,
    });
    addMessage(activeRoom.id, userMessage);
    void requestCoworkPlan({
      roomId: activeRoom.id,
      task: nextTask,
      model: selectedModel,
      intent,
      languageHint,
      avoidQuestions,
      scope,
      nextAction: getCoworkContinuationInstruction(intent, languageHint),
    });
  };

  const handleStartPlanNow = (message: CoworkMessage) => {
    if (!activeRoom || pendingRoomId) {
      return;
    }

    const planner = message.plannerResult;
    if (!planner) {
      return;
    }

    const languageHint = getCoworkLanguageHint(
      [
        ...activeRoom.messages.map((roomMessage) => roomMessage.content),
        planner.goal,
        planner.currentUnderstanding,
      ].join(" "),
    );
    const nextTask = getCoworkContinuationTopic(planner, message.content);
    const scope = getCoworkAnsweredRequirements(activeRoom.messages, languageHint);

    addMessage(activeRoom.id, localize("com_ui_cowork_decision_start_plan"));
    void requestCoworkPlan({
      roomId: activeRoom.id,
      task: nextTask,
      model: selectedModel,
      intent: "plan",
      languageHint,
      avoidQuestions: getCoworkDecisionQuestions(activeRoom.messages),
      scope,
      nextAction: getCoworkContinuationInstruction("plan", languageHint),
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!activeRoom || !prompt) {
      return;
    }

    const roomId = activeRoom.id;
    addMessage(roomId, prompt);
    setDraft("");
    requestAnimationFrame(() => {
      if (textAreaRef.current) {
        textAreaRef.current.style.height = "44px";
      }
    });

    const command = parseCoworkCommand(prompt);
    if (command.kind === "chat") {
      const model = selectedModel;
      if (!model.endpoint) {
        addAssistantMessage(roomId, {
          content: "",
          error: localize("com_ui_cowork_chat_missing_endpoint"),
          model,
        });
        return;
      }

      setPendingRoomId(roomId);
      setPendingKind("chat");
      try {
        const payload: CoworkChatPayload = {
          text: prompt,
          messages: getRecentCoworkChatMessages(activeRoom.messages),
          roomId,
          endpoint: model.endpoint,
          endpointType: model.endpointType,
          model: model.model,
          spec: model.spec,
          agent_id: model.agent_id,
          chatProjectId: model.chatProjectId,
        };
        const data = (await request.post(
          "/api/workspace/cowork/chat",
          payload,
        )) as CoworkChatResponse;
        const content = (data?.text || data?.answer || "").trim();

        if (!data?.ok || !content) {
          throw new Error(data?.error || localize("com_ui_cowork_chat_error"));
        }

        addAssistantMessage(roomId, {
          content,
          model,
        });
      } catch (error) {
        addAssistantMessage(roomId, {
          content: "",
          error: getRequestErrorMessage(error, localize("com_ui_cowork_chat_error")),
          model,
        });
      } finally {
        setPendingRoomId("");
        setPendingKind("");
      }
      return;
    }

    if (!command.task) {
      addAssistantMessage(roomId, {
        content: "",
        error: localize(
          command.kind === "ask"
            ? "com_ui_cowork_ask_command_empty"
            : "com_ui_cowork_plan_command_empty",
        ),
      });
      return;
    }

    if (pendingRoomId) {
      addAssistantMessage(roomId, {
        content: "",
        error: localize("com_ui_cowork_planner_already_running"),
      });
      return;
    }

    const languageHint = getCoworkLanguageHint(command.task || prompt);
    await requestCoworkPlan({
      roomId,
      task: command.task,
      model: selectedModel,
      intent: command.kind,
      languageHint,
      avoidQuestions: getCoworkDecisionQuestions(activeRoom.messages),
      scope: getCoworkAnsweredRequirements(activeRoom.messages, languageHint),
    });
  };

  if (isProjectsViewOpen) {
    return (
      <CoworkProjectsOverview
        createProject={createProject}
        openProjectId={openProjectId}
        projects={projects}
        rooms={rooms}
      />
    );
  }

  return (
    <main
      className="flex h-full flex-col overflow-y-auto bg-presentation text-text-primary"
      role="main"
    >
      <div className="relative flex h-full w-full flex-col">
        <CoworkHeader
          activeRoomTitle={activeRoom?.title}
          onCreateRoom={createRoom}
        />
        <div
          className={cn(
            "flex flex-col",
            isLandingPage
              ? "flex-1 items-center justify-end sm:justify-center"
              : "h-full overflow-y-auto",
          )}
        >
          {isLandingPage ? (
            <CoworkEmptyState
              active={!!activeRoom}
              roomTitle={activeRoom?.title}
            />
          ) : (
            <CoworkMessagesView
              copiedMessageId={copiedMessageId}
              messages={activeRoom.messages}
              onCopyCodexPrompt={handleCopyCodexPrompt}
              onStartPlanNow={handleStartPlanNow}
              onSubmitDecisionAnswer={handleSubmitDecisionAnswer}
              roomId={activeRoom.id}
            />
          )}

          <div
            className={cn(
              "w-full",
              isLandingPage &&
                "max-w-3xl transition-all duration-200 xl:max-w-4xl",
            )}
          >
            <CoworkComposer
              canSend={canSend}
              draft={draft}
              disabled={!activeRoom || !!pendingRoomId}
              isTextAreaFocused={isTextAreaFocused}
              setDraft={setDraft}
              setIsTextAreaFocused={setIsTextAreaFocused}
              textAreaRef={textAreaRef}
              onContainerClick={handleContainerClick}
              onSubmit={handleSubmit}
            />
            {pendingRoomId && pendingRoomId === activeRoom?.id ? (
              <div className="mx-auto -mt-8 mb-8 max-w-3xl px-4 text-xs text-text-secondary xl:max-w-4xl">
                {localize(
                  pendingKind === "ask"
                    ? "com_ui_cowork_ask_loading"
                    : pendingKind === "plan"
                    ? "com_ui_cowork_planner_loading"
                    : "com_ui_cowork_chat_loading",
                )}
              </div>
            ) : null}
            {!isLandingPage && <CoworkFooter />}
          </div>
        </div>
        {isLandingPage && <CoworkFooter />}
      </div>
    </main>
  );
}

function CoworkComposer({
  canSend,
  disabled,
  draft,
  isTextAreaFocused,
  onContainerClick,
  onSubmit,
  setDraft,
  setIsTextAreaFocused,
  textAreaRef,
}: {
  canSend: boolean;
  disabled: boolean;
  draft: string;
  isTextAreaFocused: boolean;
  onContainerClick: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setDraft: Dispatch<SetStateAction<string>>;
  setIsTextAreaFocused: Dispatch<SetStateAction<boolean>>;
  textAreaRef: MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const localize = useLocalize();
  const baseClasses = useMemo(
    () =>
      "md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/60 bg-transparent dark:placeholder-white/60 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)] max-h-[45vh] md:max-h-[55vh] px-5",
    [],
  );

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full flex-row gap-3 transition-[max-width] duration-300 sm:mb-10 sm:px-2 md:max-w-3xl xl:max-w-4xl"
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className="flex w-full items-center">
          <div
            onClick={onContainerClick}
            className={cn(
              "relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border border-border-light bg-surface-chat pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0",
              isTextAreaFocused ? "shadow-lg" : "shadow-md",
            )}
          >
            <div className="flex">
              <div className="relative flex-1">
                <TextareaAutosize
                  ref={textAreaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  disabled={disabled}
                  id="cowork-text-input"
                  tabIndex={0}
                  data-testid="cowork-text-input"
                  rows={1}
                  onFocus={() => setIsTextAreaFocused(true)}
                  onBlur={() => setIsTextAreaFocused(false)}
                  aria-label={localize("com_ui_cowork_message_or_plan")}
                  placeholder={localize("com_ui_cowork_message_or_plan")}
                  style={{ height: 44, overflowY: "auto" }}
                  className={cn(
                    baseClasses,
                    removeFocusRings,
                    "scrollbar-hover transition-[max-height] duration-200 disabled:cursor-not-allowed",
                  )}
                />
              </div>
            </div>
            <div className="@container items-between flex gap-2 pb-2">
              <div className="ml-2">
                <button
                  type="button"
                  disabled
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary opacity-70"
                  aria-label={localize("com_ui_cowork_local_only_status")}
                >
                  <Paperclip className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                disabled
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary opacity-70"
                aria-label={localize("com_ui_cowork_local_only_status")}
              >
                <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="mx-auto flex" />
              <button
                type="button"
                disabled
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary opacity-70"
                aria-label={localize("com_ui_cowork_local_only_status")}
              >
                <Mic className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="mr-2">
                <button
                  type="submit"
                  disabled={!canSend}
                  id="cowork-send-button"
                  data-testid="cowork-send-button"
                  className="rounded-full bg-text-primary p-1.5 text-text-primary outline-offset-4 transition-all duration-200 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10"
                  aria-label={localize("com_nav_send_message")}
                >
                  <span data-state="closed">
                    <SendIcon size={24} />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
