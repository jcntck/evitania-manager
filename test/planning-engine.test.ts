import { describe, expect, it } from 'vitest';
import {
  adjustDrop,
  calculateBoss,
  calculateGathering,
  calculateMonster,
  calculateSmelting,
  resolveSources,
} from '../src/domain/estimate-calculator';
import { consolidateObjectivePlans } from '../src/domain/plan-consolidator';
import { PlanningEngine } from '../src/domain/planning-engine';
import type { Catalog, Planning, Product } from '../src/shared/domain';

const emptyPlanning = (): Planning => ({
  goals: [],
  stock: {},
  gatherRates: {},
  killRates: {},
  lootQuantity: 0,
  selectedSources: {},
  completionCredits: [],
});

const emptyCatalog = (): Catalog => ({
  items: [],
  resources: [],
  products: [],
  monsters: [],
  bosses: [],
});

const recipe = (id: string, components: Product['components'] = []): Product => ({
  id,
  name: id,
  kind: 'recipe',
  components,
});

const calculate = (catalog: Catalog, planning: Planning, maxNodes?: number) =>
  new PlanningEngine().calculate({
    catalog,
    planning,
    ...(maxNodes === undefined ? {} : { limits: { maxNodes } }),
  });

describe('PlanningEngine objective allocation and causal projection', () => {
  it('UT-022 validates recipe objectives and rejects every invalid objective shape', () => {
    const catalog = emptyCatalog();
    catalog.items.push({ id: 'raw', name: 'Raw' });
    catalog.products.push(recipe('valid', [{ entityId: 'raw', quantity: 1 }]), {
      id: 'smelt', name: 'Smelt', kind: 'smelting', processingSeconds: 1,
      components: [{ entityId: 'raw', quantity: 1 }],
    });
    const planning = emptyPlanning();
    planning.goals = [
      { id: 'ok', productId: 'valid', quantity: 1, completed: false, priority: 0 },
      { id: 'smelting', productId: 'smelt', quantity: 1, completed: false, priority: 1 },
      { id: 'stale', productId: 'gone', quantity: 1, completed: false, priority: 2 },
      { id: 'zero', productId: 'valid', quantity: 0, completed: false, priority: 3 },
      { id: 'fraction', productId: 'valid', quantity: 1.5, completed: false, priority: 4 },
      { id: 'unsafe', productId: 'valid', quantity: Number.MAX_SAFE_INTEGER + 1, completed: false, priority: 5 },
    ];

    const result = calculate(catalog, planning);

    expect(result.objectives.filter((objective) => objective.root)).toHaveLength(1);
    expect(result.diagnostics.filter((value) => value.code === 'invalid_objective')).toHaveLength(5);
  });

  it('UT-023 allocates scarce stock by stable priority and swaps only per-goal allocation', () => {
    const catalog = emptyCatalog();
    catalog.items.push({ id: 'raw', name: 'Raw' });
    catalog.products.push(recipe('target', [{ entityId: 'raw', quantity: 1 }]));
    const planning = emptyPlanning();
    planning.stock.target = 1;
    planning.goals = [
      { id: 'later', productId: 'target', quantity: 1, completed: false, priority: 1 },
      { id: 'first', productId: 'target', quantity: 1, completed: false, priority: 0 },
    ];

    const first = calculate(catalog, planning);
    expect(first.objectives.map((objective) => [objective.objectiveId, objective.root?.allocated]))
      .toEqual([['first', 1], ['later', 0]]);
    planning.goals[0].priority = 0;
    planning.goals[1].priority = 1;
    const swapped = calculate(catalog, planning);
    expect(swapped.objectives.map((objective) => [objective.objectiveId, objective.root?.allocated]))
      .toEqual([['later', 1], ['first', 0]]);
    expect(swapped.consolidated.find((need) => need.entityId === 'target'))
      .toMatchObject({ required: 2, allocated: 1, missing: 1 });
  });

  it('UT-024 preserves repeated raw components as distinct stable causal paths', () => {
    const catalog = emptyCatalog();
    catalog.items.push({ id: 'raw', name: 'Raw' });
    catalog.products.push(
      recipe('left', [{ entityId: 'raw', quantity: 2 }]),
      recipe('right', [{ entityId: 'raw', quantity: 3 }]),
      recipe('root', [{ entityId: 'left', quantity: 1 }, { entityId: 'right', quantity: 1 }]),
    );
    const planning = emptyPlanning();
    planning.goals.push({ id: 'goal', productId: 'root', quantity: 1, completed: false, priority: 0 });
    const inputBefore = structuredClone({ catalog, planning });

    const result = calculate(catalog, planning);
    const root = result.objectives[0].root!;

    expect(root.children.map((node) => node.pathId)).toEqual(['goal:0.0', 'goal:0.1']);
    expect(root.children.map((node) => node.children[0].pathId))
      .toEqual(['goal:0.0.0', 'goal:0.1.0']);
    expect(result.consolidated.find((need) => need.entityId === 'raw'))
      .toMatchObject({ required: 5, missing: 5 });
    expect({ catalog, planning }).toEqual(inputBefore);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(root.children)).toBe(true);
  });

  it('UT-025 exact and excess intermediate stock prevents only satisfied expansion', () => {
    const catalog = emptyCatalog();
    catalog.items.push({ id: 'ore', name: 'Ore' });
    catalog.products.push(
      { id: 'bar', name: 'Bar', kind: 'smelting', processingSeconds: 10,
        components: [{ entityId: 'ore', quantity: 3 }] },
      recipe('root', [{ entityId: 'bar', quantity: 2 }]),
    );
    const planning = emptyPlanning();
    planning.goals.push({ id: 'goal', productId: 'root', quantity: 1, completed: false, priority: 0 });
    planning.stock.bar = 1;
    const partial = calculate(catalog, planning);
    expect(partial.consolidated.find((need) => need.entityId === 'ore')?.required).toBe(3);
    planning.stock.bar = 2;
    const exact = calculate(catalog, planning);
    expect(exact.consolidated.some((need) => need.entityId === 'ore')).toBe(false);
    expect(exact.remainingStock.bar).toBe(0);
    planning.stock.bar = 3;
    expect(calculate(catalog, planning).remainingStock.bar).toBe(1);
  });

  it('UT-026 consolidates exclusively from nodes with exact contributor reconciliation', () => {
    const catalog = emptyCatalog();
    catalog.items.push({ id: 'raw', name: 'Raw' });
    catalog.products.push(recipe('root', [{ entityId: 'raw', quantity: 2 }]));
    const planning = emptyPlanning();
    planning.goals.push(
      { id: 'a', productId: 'root', quantity: 1, completed: false, priority: 0 },
      { id: 'b', productId: 'root', quantity: 2, completed: false, priority: 1 },
    );
    planning.stock.raw = 1;
    const result = calculate(catalog, planning);
    const projection = consolidateObjectivePlans(result.objectives);
    const raw = projection.consolidated.find((need) => need.entityId === 'raw')!;

    expect(raw).toMatchObject({ required: 6, allocated: 1, missing: 5 });
    expect(raw.contributors).toEqual([
      { objectiveId: 'a', pathId: 'a:0.0' },
      { objectiveId: 'b', pathId: 'b:0.0' },
    ]);
  });

  it('UT-027 diagnoses stale entities, invalid components/duration and preserves valid siblings', () => {
    const catalog = emptyCatalog();
    catalog.items.push({ id: 'valid', name: 'Valid' });
    catalog.products.push(
      {
        id: 'broken-smelt',
        name: 'Broken',
        kind: 'smelting',
        components: [{ entityId: 'valid', quantity: 1 }],
      } as Product,
      recipe('root', [
        { entityId: 'gone', quantity: 1 },
        { entityId: 'broken-smelt', quantity: 1 },
        { entityId: 'valid', quantity: 2 },
        { entityId: 'invalid', quantity: 0 },
      ]),
    );
    const planning = emptyPlanning();
    planning.goals.push({ id: 'goal', productId: 'root', quantity: 1, completed: false, priority: 0 });

    const result = calculate(catalog, planning);

    expect(result.diagnostics.map((value) => value.code)).toEqual(expect.arrayContaining([
      'stale_entity', 'invalid_duration', 'invalid_component',
    ]));
    expect(result.consolidated.find((need) => need.entityId === 'valid')?.required).toBe(3);
  });

  it('UT-028 isolates an exact path-local cycle while completing an independent branch', () => {
    const catalog = emptyCatalog();
    catalog.items.push({ id: 'raw', name: 'Raw' });
    catalog.products.push(
      recipe('a', [{ entityId: 'b', quantity: 1 }, { entityId: 'raw', quantity: 2 }]),
      recipe('b', [{ entityId: 'a', quantity: 1 }]),
    );
    const planning = emptyPlanning();
    planning.goals.push({ id: 'goal', productId: 'a', quantity: 1, completed: false, priority: 0 });

    const result = calculate(catalog, planning);

    expect(result.diagnostics.find((value) => value.code === 'cycle')?.cycle).toEqual(['a', 'b', 'a']);
    expect(result.consolidated.find((need) => need.entityId === 'raw')?.missing).toBe(2);
  });
});

describe('source resolution and estimates', () => {
  const sourceCatalog = (): Catalog => ({
    items: [{ id: 'raw', name: 'Raw' }],
    resources: [{ id: 'resource', itemId: 'raw', act: 'I' }],
    products: [],
    monsters: [{
      id: 'monster', name: 'Monster', act: 'II',
      drops: [{ itemId: 'raw', numerator: 1, denominator: 200 }],
    }],
    bosses: [{
      id: 'boss', name: 'Boss', act: 'III',
      drops: [{ itemId: 'raw', numerator: 1, denominator: 10 }],
    }],
  });

  it('UT-029 resolves zero, sole, and multiple incompatible origins exactly', () => {
    const none = emptyCatalog();
    none.items.push({ id: 'raw', name: 'Raw' });
    expect(resolveSources('raw', none, {}).resolution.status).toBe('none');
    const sole = sourceCatalog();
    sole.monsters = [];
    sole.bosses = [];
    expect(resolveSources('raw', sole, {}).resolution).toMatchObject({
      status: 'resolved', selected: { id: 'resource' },
    });
    expect(resolveSources('raw', sourceCatalog(), {}).resolution.status).toBe('selection_required');
  });

  it('UT-030 diagnoses stale selection and uses only the newly selected complete source', () => {
    expect(resolveSources('raw', sourceCatalog(), { raw: 'deleted' })).toMatchObject({
      resolution: { status: 'source_unresolved' },
      diagnostics: [{ code: 'source_unresolved', sourceId: 'deleted' }],
    });
    expect(resolveSources('raw', sourceCatalog(), { raw: 'boss' }).resolution).toMatchObject({
      status: 'resolved', selected: { id: 'boss', kind: 'boss', denominator: 10 },
    });
  });

  it('UT-031 calculates gathering hours, exact zero, and unavailable rates', () => {
    expect(calculateGathering(12, 3).estimate).toMatchObject({ hours: 4, ratePerHour: 3 });
    expect(calculateGathering(0, undefined).estimate?.hours).toBe(0);
    for (const rate of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(calculateGathering(1, rate)).toMatchObject({ diagnostics: [{ code: 'rate_required' }] });
    }
  });

  it('UT-032 withholds monster time for invalid inputs and returns zero attempts for zero missing', () => {
    const source = resolveSources('raw', sourceCatalog(), { raw: 'monster' }).resolution.selected!;
    expect(calculateMonster(1, source, undefined, 0).estimate).toBeUndefined();
    expect(calculateMonster(1, source, 10, -1).estimate).toBeUndefined();
    expect(calculateMonster(0, source, undefined, 0).estimate)
      .toMatchObject({ expectedAttempts: 0, hours: 0 });
  });

  it('UT-033 caps adjusted probability at one', () => {
    expect(adjustDrop(5, 5, 900)).toEqual({ adjustedDenominator: 1, adjustedProbability: 1 });
  });

  it('UT-034 uses Math.round immediately below, at, and above a half boundary', () => {
    expect(adjustDrop(1, 2.499, 0)?.adjustedDenominator).toBe(2);
    expect(adjustDrop(1, 2.5, 0)?.adjustedDenominator).toBe(3);
    expect(adjustDrop(1, 2.501, 0)?.adjustedDenominator).toBe(3);
    expect(adjustDrop(1, 1, 10_000)?.adjustedDenominator).toBe(1);
  });

  it('UT-035 preserves fractional boss fights, loot adjustment, zero, and no hourly input', () => {
    const source = resolveSources('raw', sourceCatalog(), { raw: 'boss' }).resolution.selected!;
    expect(calculateBoss(1, source, 0).estimate?.expectedFights).toBe(10);
    expect(calculateBoss(1, source, 100).estimate?.expectedFights).toBe(5);
    expect(calculateBoss(0, source, 0).estimate?.expectedFights).toBe(0);
    expect(calculateBoss(3, { ...source, numerator: 2, denominator: 3 }, 0)
      .estimate?.expectedFights).toBe(4.5);
  });

  it('UT-036 calculates exact smelting seconds, zero, invalid duration, and overflow', () => {
    expect(calculateSmelting(3, 90).estimate).toEqual({ kind: 'smelting', seconds: 270 });
    expect(calculateSmelting(0, 90).estimate?.seconds).toBe(0);
    expect(calculateSmelting(1, undefined).diagnostics[0].code).toBe('invalid_duration');
    expect(calculateSmelting(Number.MAX_SAFE_INTEGER, 2).diagnostics[0].code).toBe('quantity_overflow');
  });

  it('UT-037 reproduces the PRD aggregate numeric examples without presentation rounding', () => {
    const source = resolveSources('raw', sourceCatalog(), { raw: 'monster' }).resolution.selected!;
    expect(calculateMonster(12, source, 600, 0).estimate).toMatchObject({
      adjustedDenominator: 200,
      expectedItemsPerHour: 3,
      expectedAttempts: 2400,
      hours: 4,
    });
    expect(calculateMonster(12, source, 600, 43).estimate).toMatchObject({
      adjustedDenominator: 140,
      expectedAttempts: 1680,
      hours: 2.8,
    });
    expect(calculateGathering(12, 3).estimate?.hours).toBe(4);
    expect(calculateSmelting(3, 90).estimate?.seconds).toBe(270);
  });
});
