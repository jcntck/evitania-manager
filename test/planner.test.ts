import { describe, expect, it } from 'vitest';
import { Planner } from '../src/domain/planner';
import { createValidData, IDS } from './fixtures/storage-fixtures';

describe('legacy Planner compatibility with schema-v2', () => {
  it('uses stock once and recognizes normalized smelting products', () => {
    const data = createValidData();
    data.planning.stock[IDS.smelting] = 1;
    const rows = new Planner(data).calculate().rows;

    expect(rows.find((row) => row.entityId === IDS.smelting)).toMatchObject({
      category: 'smelting',
      required: 4,
      missing: 3,
      processingSeconds: 270,
    });
  });

  it('does not add completion credits a second time because migrated credits are already stock', () => {
    const data = createValidData();
    data.planning.stock[IDS.item] = 5;
    data.planning.completionCredits.push({
      id: IDS.credit,
      entityId: IDS.item,
      quantity: 3,
      createdAt: '2026-07-25T12:00:00.000Z',
    });

    const row = new Planner(data).calculate().rows.find((candidate) => candidate.entityId === IDS.item);
    expect(row?.available).toBe(5);
  });
});
