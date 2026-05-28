export type CommitmentSource = 'manual' | 'chat';

export interface CommitmentRecord {
  id: string;
  title: string;
  deadline?: string;
  status: 'pending' | 'completed';
  createdAt: number;
  source: CommitmentSource;
  sourceText?: string;
  sourceChatId?: string;
  sourceMessageId?: string;
}

export interface CommitmentInput {
  title: string;
  deadline?: string;
  source?: CommitmentSource;
  sourceText?: string;
  sourceChatId?: string;
  sourceMessageId?: string;
}

export interface NormalizedCommitmentInput {
  title: string;
  deadline?: string;
  source: CommitmentSource;
  sourceText?: string;
  sourceChatId?: string;
  sourceMessageId?: string;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeCommitmentInput(
  title: string,
  deadline?: string,
  source: CommitmentSource = 'manual',
  sourceText?: string,
  sourceChatId?: string,
  sourceMessageId?: string,
): NormalizedCommitmentInput | null {
  const normalizedTitle = normalizeWhitespace(title);
  if (!normalizedTitle) {
    return null;
  }

  const normalizedDeadline = deadline ? normalizeWhitespace(deadline) : undefined;

  return {
    title: normalizedTitle,
    deadline: normalizedDeadline || undefined,
    source,
    sourceText: sourceText ? sourceText.trim() : undefined,
    sourceChatId: sourceChatId?.trim() || undefined,
    sourceMessageId: sourceMessageId?.trim() || undefined,
  };
}

export function commitmentKey(title: string, deadline?: string): string {
  const normalizedTitle = normalizeWhitespace(title).toLowerCase();
  const normalizedDeadline = deadline ? normalizeWhitespace(deadline).toLowerCase() : '';
  return `${normalizedTitle}::${normalizedDeadline}`;
}

export function summarizeSourceText(sourceText?: string, maxLength: number = 96): string | undefined {
  if (!sourceText) return undefined;

  const normalized = normalizeWhitespace(sourceText);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const cutoff = Math.max(0, maxLength - 3);
  const truncated = normalized.slice(0, cutoff).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  const preview = lastSpace > 0 ? truncated.slice(0, lastSpace).trimEnd() : truncated;
  return `${preview}...`;
}

export function appendCommitment(
  existing: CommitmentRecord[],
  input: CommitmentInput,
  now: number = Date.now(),
): { commitments: CommitmentRecord[]; added: boolean; duplicate: boolean } {
  const normalized = normalizeCommitmentInput(
    input.title,
    input.deadline,
    input.source ?? 'manual',
    input.sourceText,
    input.sourceChatId,
    input.sourceMessageId,
  );

  if (!normalized) {
    return { commitments: existing, added: false, duplicate: false };
  }

  const key = commitmentKey(normalized.title, normalized.deadline);
  const duplicate = existing.some((commitment) => commitmentKey(commitment.title, commitment.deadline) === key);

  if (duplicate) {
    return { commitments: existing, added: false, duplicate: true };
  }

  const nextCommitment: CommitmentRecord = {
    id: `${now.toString()}-${Math.random().toString(36).slice(2, 9)}`,
    title: normalized.title,
    deadline: normalized.deadline,
    source: normalized.source,
    sourceText: normalized.sourceText,
    sourceChatId: normalized.sourceChatId,
    sourceMessageId: normalized.sourceMessageId,
    status: 'pending',
    createdAt: now,
  };

  return {
    commitments: [...existing, nextCommitment],
    added: true,
    duplicate: false,
  };
}
