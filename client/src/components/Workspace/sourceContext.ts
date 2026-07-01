import type {
  WorkspaceNotebookSource,
  WorkspaceSourceChatMessage,
  WorkspaceSourceChunk,
  WorkspaceSourceContextStats,
  WorkspaceSourceEvidence,
  WorkspaceSourceType,
} from "~/store/families";

export type NotebookSource = WorkspaceNotebookSource;
export type SourceChunk = WorkspaceSourceChunk;
export type SourceContextStats = WorkspaceSourceContextStats;
export type SourceEvidence = WorkspaceSourceEvidence;

export const maxSourceChatContextBytes = 24 * 1024;
const maxChunkBytes = 4 * 1024;
const maxSelectedSourceChatChunks = 8;
const maxSelectedSourceChatChunksPerSource = 3;
const evidenceSnippetLength = 180;

type ScoredSourceChunk = {
  source: NotebookSource;
  sourceTitle: string;
  chunk: SourceChunk;
  score: number;
};

export type NotebookContextSelection = {
  sourceBlocks: string;
  sourceTitles: string[];
  contextStats: SourceContextStats;
  evidence: SourceEvidence[];
};

export const getTextBytes = (value: string) => new Blob([value]).size;

export const estimateTokens = (value: string) => Math.ceil(value.length / 4);

export const sliceTextToByteLimit = (value: string, maxBytes: number) => {
  if (getTextBytes(value) <= maxBytes) {
    return value;
  }

  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (getTextBytes(value.slice(0, mid)) <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return value.slice(0, low).trimEnd();
};

const trimChunkContent = (content: string, startOffset: number) => {
  const leadingWhitespace = content.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace = content.match(/\s*$/)?.[0].length ?? 0;
  const trimmedContent = content.trim();

  return {
    content: trimmedContent,
    startOffset: startOffset + leadingWhitespace,
    endOffset: startOffset + content.length - trailingWhitespace,
  };
};

const getChunkKind = (
  content: string,
  fallback: SourceChunk["kind"],
): SourceChunk["kind"] => {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length >= 2 && lines.every((line) => line.includes("|"))) {
    return "table";
  }
  if (/^#{1,6}\s+/m.test(content)) {
    return "heading";
  }
  return fallback;
};

const createChunk = ({
  sourceId,
  index,
  heading,
  content,
  kind,
  startOffset,
  endOffset,
}: {
  sourceId: string;
  index: number;
  heading?: string;
  content: string;
  kind: SourceChunk["kind"];
  startOffset: number;
  endOffset: number;
}): SourceChunk => ({
  id: `${sourceId}-chunk-${index}`,
  sourceId,
  index,
  heading,
  content,
  kind,
  startOffset,
  endOffset,
  sizeBytes: getTextBytes(content),
  tokenEstimate: estimateTokens(content),
});

const getSeparatedBlocks = (content: string) => {
  const blocks: Array<{
    content: string;
    startOffset: number;
    endOffset: number;
  }> = [];
  const blockPattern = /\S[\s\S]*?(?=(?:\r?\n\s*){2,}|$)/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(content)) != null) {
    const trimmed = trimChunkContent(match[0], match.index);
    if (trimmed.content) {
      blocks.push(trimmed);
    }
  }

  return blocks;
};

const splitLongTextBlock = (block: {
  content: string;
  startOffset: number;
  endOffset: number;
}) => {
  const chunks: Array<{
    content: string;
    startOffset: number;
    endOffset: number;
  }> = [];
  let remaining = block.content;
  let currentOffset = block.startOffset;

  while (remaining) {
    const content = sliceTextToByteLimit(remaining, maxChunkBytes);
    const chunkContent =
      content ||
      remaining.slice(0, Math.max(1, Math.floor(remaining.length / 2)));
    const endOffset = currentOffset + chunkContent.length;
    chunks.push({
      content: chunkContent,
      startOffset: currentOffset,
      endOffset,
    });
    remaining = remaining.slice(chunkContent.length);
    const skippedWhitespace = remaining.match(/^\s*/)?.[0].length ?? 0;
    remaining = remaining.slice(skippedWhitespace);
    currentOffset = endOffset + skippedWhitespace;
  }

  return chunks;
};

const getMarkdownHeadingSections = (content: string) => {
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  const headings = Array.from(content.matchAll(headingPattern));

  if (!headings.length) {
    return [];
  }

  return headings
    .map((headingMatch, index) => {
      const nextHeading = headings[index + 1];
      const startOffset = headingMatch.index ?? 0;
      const endOffset = nextHeading?.index ?? content.length;
      const trimmed = trimChunkContent(
        content.slice(startOffset, endOffset),
        startOffset,
      );
      return {
        ...trimmed,
        heading: headingMatch[2]?.trim(),
      };
    })
    .filter((section) => section.content);
};

export const createSourceChunks = ({
  sourceId,
  type,
  content,
}: {
  sourceId: string;
  type: WorkspaceSourceType;
  content: string;
}): SourceChunk[] => {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return [];
  }

  const sections =
    type === "markdown"
      ? getMarkdownHeadingSections(content)
      : ([] as Array<{
          content: string;
          startOffset: number;
          endOffset: number;
          heading?: string;
        }>);
  const blocks = sections.length ? sections : getSeparatedBlocks(content);

  const chunks: SourceChunk[] = [];

  blocks.forEach((block) => {
    const kind = getChunkKind(
      block.content,
      sections.length ? "heading" : "paragraph",
    );
    const shouldKeepBlockWhole =
      kind === "table" || getTextBytes(block.content) <= maxChunkBytes;
    const chunkBlocks = shouldKeepBlockWhole
      ? [block]
      : splitLongTextBlock(block);

    chunkBlocks.forEach((chunkBlock) => {
      chunks.push(
        createChunk({
          sourceId,
          index: chunks.length,
          heading: "heading" in block ? block.heading : undefined,
          content: chunkBlock.content,
          kind: shouldKeepBlockWhole ? kind : "text",
          startOffset: chunkBlock.startOffset,
          endOffset: chunkBlock.endOffset,
        }),
      );
    });
  });

  return chunks;
};

export const getSourceChunks = (source: NotebookSource | null) => {
  if (!source || source.baseStatus !== "ready" || !source.content.trim()) {
    return [];
  }
  return source.chunks?.length
    ? source.chunks
    : createSourceChunks({
        sourceId: source.id,
        type: source.type,
        content: source.content,
      });
};

export const getReadyNotebookSources = (sources: NotebookSource[]) =>
  sources.filter(
    (source) =>
      source.baseStatus === "ready" && source.enabled && source.content.trim(),
  );

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const getCompactSearchText = (value: string) =>
  normalizeSearchText(value).replace(/\s+/g, "");

const getQuestionTerms = (question: string) => {
  const normalizedQuestion = normalizeSearchText(question);
  const compactQuestion = getCompactSearchText(question);
  const terms = new Set<string>();

  normalizedQuestion
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .forEach((term) => terms.add(term));

  if (compactQuestion.length >= 4) {
    terms.add(compactQuestion);
    for (let start = 0; start < compactQuestion.length; start += 1) {
      for (
        let length = Math.min(24, compactQuestion.length - start);
        length >= 4;
        length -= 1
      ) {
        terms.add(compactQuestion.slice(start, start + length));
        if (terms.size > 120) {
          return Array.from(terms).sort((a, b) => b.length - a.length);
        }
      }
    }
  }

  return Array.from(terms).sort((a, b) => b.length - a.length);
};

const scoreChunkForQuestion = ({
  chunk,
  question,
  terms,
  sourceTitle,
}: {
  chunk: SourceChunk;
  question: string;
  terms: string[];
  sourceTitle: string;
}) => {
  const normalizedQuestion = normalizeSearchText(question);
  const compactQuestion = getCompactSearchText(question);
  const normalizedContent = normalizeSearchText(chunk.content);
  const compactContent = getCompactSearchText(chunk.content);
  const normalizedHeading = normalizeSearchText(chunk.heading ?? "");
  const compactHeading = getCompactSearchText(chunk.heading ?? "");
  const normalizedTitle = normalizeSearchText(sourceTitle);
  const compactTitle = getCompactSearchText(sourceTitle);
  let score = 0;

  if (normalizedQuestion && normalizedContent.includes(normalizedQuestion)) {
    score += 24;
  }
  if (compactQuestion && compactContent.includes(compactQuestion)) {
    score += 24;
  }
  if (normalizedQuestion && normalizedHeading.includes(normalizedQuestion)) {
    score += 12;
  }
  if (normalizedQuestion && normalizedTitle.includes(normalizedQuestion)) {
    score += 8;
  }

  terms.forEach((term) => {
    if (term.length < 2) {
      return;
    }
    const isCompactTerm = !term.includes(" ");
    if (
      normalizedContent.includes(term) ||
      (isCompactTerm && compactContent.includes(term))
    ) {
      score += Math.min(8, Math.max(2, Math.floor(term.length / 3)));
    }
    if (
      normalizedHeading.includes(term) ||
      (isCompactTerm && compactHeading.includes(term))
    ) {
      score += Math.min(12, Math.max(4, Math.floor(term.length / 2)));
    }
    if (
      normalizedTitle.includes(term) ||
      (isCompactTerm && compactTitle.includes(term))
    ) {
      score += Math.min(10, Math.max(3, Math.floor(term.length / 2)));
    }
  });

  return score;
};

export const getChunkLabel = (chunk: SourceChunk) =>
  chunk.heading || `Chunk ${chunk.index + 1}`;

const getEvidenceSnippet = (content: string) => {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (normalizedContent.length <= evidenceSnippetLength) {
    return normalizedContent;
  }
  return `${normalizedContent.slice(0, evidenceSnippetLength).trimEnd()}...`;
};

export const isGeneralNotebookQuestion = (question: string) => {
  const normalizedQuestion = normalizeSearchText(question);
  const compactQuestion = getCompactSearchText(question);
  return (
    normalizedQuestion.includes("who are you") ||
    normalizedQuestion.includes("what do you do") ||
    normalizedQuestion.includes("how do i use") ||
    normalizedQuestion.includes("what is source") ||
    normalizedQuestion.includes("what is note") ||
    compactQuestion.includes("คุณเป็นใคร") ||
    compactQuestion.includes("ทำหน้าที่อะไร") ||
    compactQuestion.includes("ใช้งานnotebook") ||
    compactQuestion.includes("sourceคืออะไร") ||
    compactQuestion.includes("noteคืออะไร")
  );
};

export const selectNotebookSourceContext = ({
  question,
  sources,
  untitledSourceTitle,
  evidencePrefix = "Evidence",
  allowFallback = true,
  minScore = 1,
}: {
  question: string;
  sources: NotebookSource[];
  untitledSourceTitle: string;
  evidencePrefix?: string;
  allowFallback?: boolean;
  minScore?: number;
}): NotebookContextSelection => {
  let remainingBytes = maxSourceChatContextBytes;
  let truncated = false;
  let fallback = false;
  const questionTerms = getQuestionTerms(question);
  const candidateChunks: ScoredSourceChunk[] = getReadyNotebookSources(
    sources,
  ).flatMap((source) => {
    const sourceTitle = source.title.trim() || untitledSourceTitle;
    return getSourceChunks(source).map((chunk) => ({
      source,
      sourceTitle,
      chunk,
      score: scoreChunkForQuestion({
        chunk,
        question,
        terms: questionTerms,
        sourceTitle,
      }),
    }));
  });
  const sortedMatchedChunks = candidateChunks
    .filter((candidate) => candidate.score >= minScore)
    .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);
  if (!sortedMatchedChunks.length && !allowFallback) {
    return {
      sourceBlocks: "",
      sourceTitles: [],
      evidence: [],
      contextStats: {
        chunkCount: 0,
        sourceCount: 0,
        truncated: false,
        fallback: false,
      },
    };
  }

  const chunksToConsider = sortedMatchedChunks.length
    ? sortedMatchedChunks
    : candidateChunks
        .filter((candidate) => candidate.chunk.index === 0)
        .sort((a, b) => a.sourceTitle.localeCompare(b.sourceTitle));
  fallback = sortedMatchedChunks.length === 0 && candidateChunks.length > 0;

  const chunkCountsBySource = new Map<string, number>();
  const selectedChunksToConsider: ScoredSourceChunk[] = [];
  for (const candidate of chunksToConsider) {
    if (selectedChunksToConsider.length >= maxSelectedSourceChatChunks) {
      break;
    }

    const currentSourceCount =
      chunkCountsBySource.get(candidate.source.id) ?? 0;
    if (
      !fallback &&
      currentSourceCount >= maxSelectedSourceChatChunksPerSource
    ) {
      continue;
    }

    selectedChunksToConsider.push(candidate);
    chunkCountsBySource.set(candidate.source.id, currentSourceCount + 1);
  }

  const includedChunks: ScoredSourceChunk[] = [];

  for (const candidate of selectedChunksToConsider) {
    if (remainingBytes <= 0) {
      truncated = true;
      break;
    }

    const sectionLabel = getChunkLabel(candidate.chunk);
    const header = `[${evidencePrefix} ${includedChunks.length + 1}]\n[Source: ${
      candidate.sourceTitle
    }]\n[Section: ${sectionLabel}]\n`;
    const headerBytes = getTextBytes(header);
    const availableContentBytes = remainingBytes - headerBytes;
    if (availableContentBytes <= 0) {
      truncated = true;
      break;
    }

    const content = sliceTextToByteLimit(
      candidate.chunk.content.trim(),
      availableContentBytes,
    );
    if (content.length < candidate.chunk.content.trim().length) {
      truncated = true;
    }

    includedChunks.push({
      ...candidate,
      chunk: {
        ...candidate.chunk,
        content,
      },
    });
    remainingBytes -= getTextBytes(`${header}${content}\n\n`);
  }

  const sourceBlocks = includedChunks
    .map(
      ({ chunk, sourceTitle }, index) =>
        `[${evidencePrefix} ${index + 1}]\n[Source: ${sourceTitle}]\n[Section: ${getChunkLabel(
          chunk,
        )}]\n${chunk.content}`,
    )
    .join("\n\n");
  const sourceTitles = Array.from(
    new Set(includedChunks.map((candidate) => candidate.sourceTitle)),
  );
  const evidence = includedChunks.map(
    ({ chunk, score, source, sourceTitle }) => ({
      sourceId: source.id,
      sourceTitle,
      chunkId: chunk.id,
      chunkIndex: chunk.index,
      chunkHeading: chunk.heading,
      chunkKind: chunk.kind,
      tokenEstimate: chunk.tokenEstimate,
      score,
      snippet: getEvidenceSnippet(chunk.content),
      wasFallback: fallback || undefined,
    }),
  );

  return {
    sourceBlocks,
    sourceTitles,
    evidence,
    contextStats: {
      chunkCount: includedChunks.length,
      sourceCount: sourceTitles.length,
      truncated,
      fallback,
    },
  };
};

export const getSourceChatSourceTitles = ({
  answer,
  sourceTitles,
}: {
  answer: string;
  sourceTitles: string[];
}) =>
  sourceTitles.filter(
    (title) =>
      answer.includes(`[Source: ${title}]`) ||
      answer.includes(`[Source: ${title} /`),
  );

export const createSourceChatMessage = (
  message: Omit<WorkspaceSourceChatMessage, "id" | "createdAt">,
  getMessageId: () => string,
) => ({
  id: getMessageId(),
  createdAt: new Date().toISOString(),
  ...message,
});
