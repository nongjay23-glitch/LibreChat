import type { TCodeContext, TCodeContextFile } from 'librechat-data-provider';

export const MAX_CODE_CONTEXT_BYTES = 120 * 1024;

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const getTextBytes = (text: string) => new TextEncoder().encode(text).length;

export const createCodeContextSnippet = (file: TCodeContextFile) =>
  `File: ${file.path}\n\n\`\`\`\n${file.content}\n\`\`\``;

export const createCombinedCodeContextSnippet = (files: TCodeContextFile[]) =>
  files.map(createCodeContextSnippet).join('\n\n---\n\n');

export const createCodeContextPacket = (files: TCodeContextFile[]): TCodeContext => {
  const normalizedFiles = files.map((file) => ({
    path: file.path,
    size: file.size,
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
