import { describe, expect, it } from 'vitest';
import {
  createCompletionCredit,
  reverseCompletionCredit,
} from '../src/domain/completion-service';
import { formatDuration } from '../src/shared/duration-formatter';
import { createValidData, IDS } from './fixtures/storage-fixtures';

describe('completion credits', () => {
  it('UT-038 creates an immutable exact candidate and rejects zero missing', () => {
    const data = createValidData();
    const before = structuredClone(data);
    const outcome = createCompletionCredit(data, {
      operationId: IDS.credit,
      entityId: IDS.item,
      missing: 3,
      createdAt: '2026-07-25T13:00:00.000Z',
    });

    expect(outcome).toMatchObject({
      ok: true,
      value: { applied: true, credit: { entityId: IDS.item, quantity: 3 } },
    });
    if (outcome.ok) expect(outcome.value.data.planning.stock[IDS.item]).toBe(5);
    expect(data).toEqual(before);
    expect(createCompletionCredit(data, {
      operationId: IDS.credit,
      entityId: IDS.item,
      missing: 0,
      createdAt: '2026-07-25T13:00:00.000Z',
    })).toMatchObject({ ok: false, error: { code: 'invalid_quantity' } });
  });

  it('UT-039 treats the operation ID as idempotency key without double stock', () => {
    const first = createCompletionCredit(createValidData(), {
      operationId: IDS.credit,
      entityId: IDS.item,
      missing: 3,
      createdAt: '2026-07-25T13:00:00.000Z',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const repeated = createCompletionCredit(first.value.data, {
      operationId: IDS.credit,
      entityId: IDS.item,
      missing: 99,
      createdAt: '2026-07-25T14:00:00.000Z',
    });
    expect(repeated).toMatchObject({
      ok: true,
      value: { applied: false, credit: { quantity: 3 } },
    });
    if (repeated.ok) {
      expect(repeated.value.data.planning.stock[IDS.item]).toBe(5);
      expect(repeated.value.data.planning.completionCredits).toHaveLength(1);
    }
  });

  it('UT-040 reverses exactly once, preserves unrelated stock, and reports all conflicts', () => {
    const created = createCompletionCredit(createValidData(), {
      operationId: IDS.credit,
      entityId: IDS.item,
      missing: 3,
      createdAt: '2026-07-25T13:00:00.000Z',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    created.value.data.planning.stock[IDS.item] += 2;
    const reversed = reverseCompletionCredit(created.value.data, {
      creditId: IDS.credit,
      reversedAt: '2026-07-25T15:00:00.000Z',
    });
    expect(reversed).toMatchObject({
      ok: true,
      value: { data: { planning: { stock: { [IDS.item]: 4 } } } },
    });
    if (!reversed.ok) return;
    expect(reverseCompletionCredit(reversed.value.data, {
      creditId: IDS.credit,
      reversedAt: '2026-07-25T16:00:00.000Z',
    })).toMatchObject({ ok: false, error: { code: 'credit_already_reversed' } });
    expect(reverseCompletionCredit(createValidData(), {
      creditId: IDS.credit,
      reversedAt: '2026-07-25T16:00:00.000Z',
    })).toMatchObject({ ok: false, error: { code: 'credit_not_found' } });
    const insufficient = structuredClone(created.value.data);
    insufficient.planning.stock[IDS.item] = 2;
    expect(reverseCompletionCredit(insufficient, {
      creditId: IDS.credit,
      reversedAt: '2026-07-25T16:00:00.000Z',
    })).toMatchObject({ ok: false, error: { code: 'insufficient_stock' } });
  });
});

describe('duration presentation', () => {
  it('UT-041 obeys exact boundaries and never formats positive input as zero', () => {
    expect(formatDuration(0)).toBe('0m 0s');
    expect(formatDuration(0.01)).toBe('0m 1s');
    expect(formatDuration(3_599)).toBe('59m 59s');
    expect(formatDuration(3_600)).toBe('1h 0m 0s');
    expect(formatDuration(86_399)).toBe('23h 59m 59s');
    expect(formatDuration(86_400)).toBe('1d 0h 0m 0s');
  });
});
