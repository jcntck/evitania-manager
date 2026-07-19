import { describe, expect, it } from 'vitest';
import { Planner } from '../src/domain/planner';
import type { AppData } from '../src/shared/domain';
import { createEmptyData } from '../src/shared/domain';

const createData = (): AppData => {
  const data = createEmptyData();
  data.catalog.items.push({ id: 'ore', name: 'Minério' }, { id: 'drop', name: 'Item X' });
  data.catalog.resources.push({ id: 'mine', itemId: 'ore', act: 'I' });
  data.catalog.monsters.push({ id: 'monster-z', name: 'Monstro Z', act: 'I',
    drops: [{ itemId: 'drop', numerator: 1, denominator: 200 }] });
  data.catalog.products.push({ id: 'bar', name: 'Barra', kind: 'smeltery', processingSeconds: 90,
    components: [{ entityId: 'ore', quantity: 3 }] });
  data.catalog.products.push({ id: 'sword', name: 'Espada', kind: 'recipe', components: [
    { entityId: 'bar', quantity: 2 }, { entityId: 'drop', quantity: 12 },
  ] });
  data.planning.goals.push({ id: 'goal', productId: 'sword', quantity: 1, completed: false });
  data.planning.gatherRates.mine = 2;
  data.planning.killRates['monster-z'] = 600;
  return data;
};

describe('Planner', () => {
  it('expands products and consumes intermediate stock before raw materials', () => {
    const data = createData();
    data.planning.stock.bar = 1;
    data.planning.stock.ore = 1;

    const rows = new Planner(data).calculate().rows;

    expect(rows.find((row) => row.entityId === 'ore')).toMatchObject({ required: 3, available: 1, missing: 2, estimatedHours: 1 });
    expect(rows.find((row) => row.entityId === 'bar')).toMatchObject({ required: 2, missing: 1, processingSeconds: 90 });
  });

  it('calculates the expected monster drop time without loot bonus', () => {
    const row = new Planner(createData()).calculate().rows.find((candidate) => candidate.entityId === 'drop');

    expect(row).toMatchObject({ missing: 12, expectedPerHour: 3, estimatedHours: 4, expectedAttempts: 2400 });
  });

  it('adjusts the denominator to 140 with 43 loot quantity', () => {
    const data = createData();
    data.planning.lootQuantity = 43;

    const row = new Planner(data).calculate().rows.find((candidate) => candidate.entityId === 'drop');

    expect(row?.expectedPerHour).toBeCloseTo(600 / 140);
    expect(row?.estimatedHours).toBeCloseTo(2.8);
    expect(row?.expectedAttempts).toBe(1680);
  });

  it('detects circular product references', () => {
    const data = createEmptyData();
    data.catalog.products.push({ id: 'a', name: 'A', kind: 'recipe', components: [{ entityId: 'b', quantity: 1 }] });
    data.catalog.products.push({ id: 'b', name: 'B', kind: 'recipe', components: [{ entityId: 'a', quantity: 1 }] });
    data.planning.goals.push({ id: 'goal', productId: 'a', quantity: 1, completed: false });

    expect(new Planner(data).calculate().cycle).toEqual(['A', 'B', 'A']);
  });
});
