"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCommitmentInput = normalizeCommitmentInput;
exports.commitmentKey = commitmentKey;
exports.summarizeSourceText = summarizeSourceText;
exports.appendCommitment = appendCommitment;
function normalizeWhitespace(value) {
    return value.trim().replace(/\s+/g, ' ');
}
function normalizeCommitmentInput(title, deadline, source = 'manual', sourceText, sourceChatId, sourceMessageId) {
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
function commitmentKey(title, deadline) {
    const normalizedTitle = normalizeWhitespace(title).toLowerCase();
    const normalizedDeadline = deadline ? normalizeWhitespace(deadline).toLowerCase() : '';
    return `${normalizedTitle}::${normalizedDeadline}`;
}
function summarizeSourceText(sourceText, maxLength = 96) {
    if (!sourceText)
        return undefined;
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
function appendCommitment(existing, input, now = Date.now()) {
    const normalized = normalizeCommitmentInput(input.title, input.deadline, input.source ?? 'manual', input.sourceText, input.sourceChatId, input.sourceMessageId);
    if (!normalized) {
        return { commitments: existing, added: false, duplicate: false };
    }
    const key = commitmentKey(normalized.title, normalized.deadline);
    const duplicate = existing.some((commitment) => commitmentKey(commitment.title, commitment.deadline) === key);
    if (duplicate) {
        return { commitments: existing, added: false, duplicate: true };
    }
    const nextCommitment = {
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
