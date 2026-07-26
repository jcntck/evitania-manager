import type { AppData, CompletionCredit, Result } from '../shared/domain';

export type CompletionErrorCode =
  | 'invalid_operation'
  | 'invalid_quantity'
  | 'quantity_overflow'
  | 'credit_not_found'
  | 'credit_already_reversed'
  | 'insufficient_stock';

export type CompletionError = Readonly<{
  code: CompletionErrorCode;
  operationId?: string;
  creditId?: string;
  entityId?: string;
}>;

export type CompletionCandidate = Readonly<{
  data: AppData;
  credit: Readonly<CompletionCredit>;
  applied: boolean;
}>;

const clone = (data: Readonly<AppData>): AppData => structuredClone(data);

export const createCompletionCredit = (
  data: Readonly<AppData>,
  input: Readonly<{
    operationId: string;
    entityId: string;
    missing: number;
    createdAt: string;
  }>,
): Result<CompletionCandidate, CompletionError> => {
  if (input.operationId.length === 0) {
    return { ok: false, error: { code: 'invalid_operation', operationId: input.operationId } };
  }
  const existing = data.planning.completionCredits.find((credit) => credit.id === input.operationId);
  if (existing) {
    return { ok: true, value: { data: clone(data), credit: Object.freeze({ ...existing }), applied: false } };
  }
  if (!Number.isSafeInteger(input.missing) || input.missing <= 0) {
    return { ok: false, error: { code: 'invalid_quantity', entityId: input.entityId } };
  }
  const current = data.planning.stock[input.entityId] ?? 0;
  const nextStock = current + input.missing;
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(nextStock)) {
    return { ok: false, error: { code: 'quantity_overflow', entityId: input.entityId } };
  }
  const candidate = clone(data);
  const credit: CompletionCredit = {
    id: input.operationId,
    entityId: input.entityId,
    quantity: input.missing,
    createdAt: input.createdAt,
  };
  candidate.planning.stock[input.entityId] = nextStock;
  candidate.planning.completionCredits.push(credit);
  return { ok: true, value: { data: candidate, credit: Object.freeze({ ...credit }), applied: true } };
};

export const reverseCompletionCredit = (
  data: Readonly<AppData>,
  input: Readonly<{ creditId: string; reversedAt: string }>,
): Result<CompletionCandidate, CompletionError> => {
  const index = data.planning.completionCredits.findIndex((credit) => credit.id === input.creditId);
  if (index < 0) {
    return { ok: false, error: { code: 'credit_not_found', creditId: input.creditId } };
  }
  const existing = data.planning.completionCredits[index];
  if (existing.reversedAt !== undefined) {
    return { ok: false, error: { code: 'credit_already_reversed', creditId: input.creditId } };
  }
  const current = data.planning.stock[existing.entityId] ?? 0;
  if (!Number.isSafeInteger(current) || current < existing.quantity) {
    return {
      ok: false,
      error: { code: 'insufficient_stock', creditId: input.creditId, entityId: existing.entityId },
    };
  }
  const candidate = clone(data);
  const credit = { ...existing, reversedAt: input.reversedAt };
  candidate.planning.stock[existing.entityId] = current - existing.quantity;
  candidate.planning.completionCredits[index] = credit;
  return { ok: true, value: { data: candidate, credit: Object.freeze(credit), applied: true } };
};
