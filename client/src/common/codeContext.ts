import type { TCodeContext, TCodeContextFile } from 'librechat-data-provider';

export const MAX_CODE_CONTEXT_BYTES = 120 * 1024;

export const formatBytes = (bytes?: number | null) => {
  const safeBytes = Number.isFinite(bytes) && bytes != null ? bytes : 0;

  if (safeBytes < 1024) {
    return `${safeBytes} B`;
  }
  if (safeBytes < 1024 * 1024) {
    return `${(safeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(safeBytes / 1024 / 1024).toFixed(1)} MB`;
};

export const getTextBytes = (text: string) => new TextEncoder().encode(text).length;

export const createCodeContextSnippet = (file: TCodeContextFile) =>
  `File: ${file.path}\n\n\`\`\`\n${file.content}\n\`\`\``;

export const createCombinedCodeContextSnippet = (files: TCodeContextFile[]) =>
  files.map(createCodeContextSnippet).join('\n\n---\n\n');

export const createCodeContextPacket = (files: TCodeContextFile[]): TCodeContext => {
  const normalizedFiles = files.map((file) => ({
    path: file.path,
    size: Number.isFinite(file.size) ? file.size : getTextBytes(file.content),
    content: file.content,
  }));
  const totalBytes = getTextBytes(createCombinedCodeContextSnippet(normalizedFiles));
  return {
    id: `code-context-${Date.now()}`,
    title:
      normalizedFiles.length === 1
        ? normalizedFiles[0].path
        : `${normalizedFiles.length} code files`,
    createdAt: Date.now(),
    totalBytes,
    files: normalizedFiles,
  };
};
