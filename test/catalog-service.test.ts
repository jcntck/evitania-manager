import { describe, expect, it } from 'vitest';
import {
  CatalogService,
  ReferenceIndex,
  detectProductionCycle,
  parseProcessingDuration,
  parseStockQuantity,
  type CatalogError,
  type EnemyCandidate,
  type ProductCandidate,
} from '../src/domain/catalog-service';
import type { Product } from '../src/shared/domain';
import { createEmptyData } from '../src/shared/domain';
import { createValidData, IDS } from './fixtures/storage-fixtures';

const service = new CatalogService();
const id = (suffix: number): string =>
  `10000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;

const fieldCodes = (result: { ok: boolean; error?: CatalogError }): string[] =>
  !result.ok && result.error?.code === 'invalid_candidate'
    ? result.error.fields.map((error) => `${error.field}:${error.code}`)
    : [];

describe('CatalogService candidates', () => {
  it('UT-013 validates item names/images and normalizes a valid trimmed name', () => {
    expect(fieldCodes(service.validateItem({ id: id(1), name: '   ' })))
      .toContain('name:invalid_name');
    expect(fieldCodes(service.validateItem({ id: id(1), name: 'x'.repeat(101) })))
      .toContain('name:invalid_name');
    expect(fieldCodes(service.validateItem({
      id: id(1),
      name: 'Minério',
      image: 'asset://resources/10000000-0000-4000-8000-000000000001.png',
    }))).toContain('image:invalid_image');

    expect(service.validateItem({
      id: id(1),
      name: '  Minério de cobre  ',
      image: 'asset://items/10000000-0000-4000-8000-000000000001.jpg',
    })).toEqual({
      ok: true,
      value: {
        id: id(1),
        name: 'Minério de cobre',
        image: 'asset://items/10000000-0000-4000-8000-000000000001.jpg',
      },
    });
  });

  it('UT-014 rejects a missing resource item and invalid act', () => {
    const data = createEmptyData();
    expect(fieldCodes(service.validateResource(data, {
      id: id(2),
      itemId: id(999),
      act: 'IV',
    }))).toEqual(expect.arrayContaining([
      'itemId:invalid_reference',
      'act:invalid_act',
    ]));
  });

  it('UT-015 rejects empty/duplicate/stale components and every unsafe quantity shape', () => {
    const data = createValidData();
    const base: ProductCandidate = {
      id: id(3),
      name: 'Produto',
      components: [{ entityId: IDS.item, quantity: 1 }],
    };
    expect(fieldCodes(service.validateProduct(data, 'recipes', { ...base, components: [] })))
      .toContain('components:invalid_quantity');
    expect(fieldCodes(service.validateProduct(data, 'recipes', {
      ...base,
      components: [
        { entityId: IDS.item, quantity: 1 },
        { entityId: IDS.item, quantity: 2 },
        { entityId: id(999), quantity: 1 },
      ],
    }))).toEqual(expect.arrayContaining([
      'components[1].entityId:duplicate_relation',
      'components[2].entityId:invalid_reference',
    ]));

    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY, '1.5']) {
      expect(fieldCodes(service.validateProduct(data, 'recipes', {
        ...base,
        components: [{ entityId: IDS.item, quantity }],
      }))).toContain('components[0].quantity:invalid_quantity');
    }
    expect(service.validateProduct(data, 'smelting', {
      ...base,
      kind: 'smelting',
      processingSeconds: '1m 30s',
    })).toMatchObject({
      ok: true,
      value: { kind: 'smelting', processingSeconds: 90 },
    });
  });

  it.each([
    ['1m 30s', 90],
    ['1:30', 90],
    ['90', 90],
    ['90s', 90],
    ['2d 3h 4m 5s', 183_845],
  ])('UT-016 parses documented duration %j to %i seconds', (input, expected) => {
    expect(parseProcessingDuration(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    '',
    ' ',
    '1:2',
    '1:60',
    '1m 30',
    '1.5s',
    '-1',
    '0',
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    `${Number.MAX_SAFE_INTEGER}d`,
  ])('UT-016 rejects ambiguous, fractional, nonpositive, or overflowing duration %j', (input) => {
    expect(parseProcessingDuration(input)).toMatchObject({
      ok: false,
      error: { code: 'invalid_duration' },
    });
  });

  const invalidEnemyCandidate = (overrides: Partial<EnemyCandidate> = {}): EnemyCandidate => ({
    id: id(4),
    name: 'Inimigo',
    act: 'I',
    drops: [{ itemId: IDS.item, numerator: 1, denominator: 10 }],
    ...overrides,
  });

  it('UT-017 enforces monster identity, act, distinct item, and drop probability invariants', () => {
    const data = createValidData();
    const result = service.validateMonster(data, invalidEnemyCandidate({
      name: ' ',
      act: 'IV',
      drops: [
        { itemId: id(999), numerator: 0, denominator: 1.5 },
        { itemId: IDS.item, numerator: 11, denominator: 10 },
        { itemId: IDS.item, numerator: 1, denominator: 2 },
      ],
    }));
    expect(fieldCodes(result)).toEqual(expect.arrayContaining([
      'name:invalid_name',
      'act:invalid_act',
      'drops[0].itemId:invalid_reference',
      'drops[0].numerator:invalid_quantity',
      'drops[0].denominator:invalid_quantity',
      'drops[1].numerator:invalid_quantity',
      'drops[2].itemId:duplicate_relation',
    ]));
  });

  it('UT-018 applies the same drop and identity invariants to bosses', () => {
    const data = createValidData();
    const result = service.validateBoss(data, invalidEnemyCandidate({
      image: 'file:///tmp/boss.png',
      drops: [
        { itemId: IDS.secondItem, numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 1 },
        { itemId: IDS.secondItem, numerator: 1, denominator: 1 },
      ],
    }));
    expect(fieldCodes(result)).toEqual(expect.arrayContaining([
      'image:invalid_image',
      'drops[0].numerator:invalid_quantity',
      'drops[1].itemId:duplicate_relation',
    ]));
  });
});

describe('ReferenceIndex and shared stock validation', () => {
  it('UT-019 returns every typed blocker and rejects a stale entity action', () => {
    const data = createValidData();
    data.planning.stock[IDS.recipe] = 0;
    data.planning.selectedSources[IDS.item] = IDS.resource;
    data.planning.completionCredits.push({
      id: IDS.credit,
      entityId: IDS.item,
      quantity: 1,
      createdAt: '2026-07-25T12:00:00.000Z',
    });
    data.catalog.products[0].components.push({ entityId: IDS.recipe, quantity: 1 });
    const index = new ReferenceIndex(data);

    expect(index.referencesTo(IDS.item).map((reference) => reference.kind))
      .toEqual(expect.arrayContaining([
        'resource',
        'component',
        'drop',
        'stock',
        'selected_source',
        'completion_credit',
      ]));
    expect(index.referencesTo(IDS.recipe).map((reference) => reference.kind))
      .toEqual(expect.arrayContaining(['component', 'goal', 'stock']));
    expect(index.referencesTo(IDS.resource).map((reference) => reference.kind))
      .toEqual(expect.arrayContaining(['selected_source', 'gather_rate']));

    expect(index.canDelete(IDS.item, { ...data.catalog.items[0], name: 'stale' }))
      .toEqual({ ok: false, error: { code: 'stale_entity', entityId: IDS.item } });
    const blocked = index.canDelete(IDS.item, data.catalog.items[0]);
    expect(blocked).toMatchObject({ ok: false, error: { code: 'referenced_entity' } });
    if (!blocked.ok && blocked.error.code === 'referenced_entity') {
      expect(blocked.error.references).toEqual(index.referencesTo(IDS.item));
    }
  });

  it.each([
    [0, 0],
    [1, 1],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ['0', 0],
    ['42', 42],
  ])('UT-020 accepts stock %j as %i', (input, expected) => {
    expect(parseStockQuantity(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    '',
    'one',
    '1.5',
    '-1',
  ])('UT-020 rejects malformed or unsafe stock %j', (input) => {
    expect(parseStockQuantity(input)).toMatchObject({
      ok: false,
      error: { code: 'invalid_quantity' },
    });
  });
});

describe('production graph cycles', () => {
  const product = (
    entityId: string,
    dependencies: readonly string[],
    kind: Product['kind'] = 'recipe',
  ): Product => ({
    id: entityId,
    name: entityId,
    kind,
    ...(kind === 'smelting' ? { processingSeconds: 1 } : {}),
    components: dependencies.map((dependency) => ({ entityId: dependency, quantity: 1 })),
  });

  it('UT-021 returns exact closed paths for every prohibited cycle shape and none for a DAG', () => {
    const a = id(10);
    const b = id(11);
    const c = id(12);
    const d = id(13);

    expect(detectProductionCycle([product(a, [a])])).toEqual([a, a]);
    expect(detectProductionCycle([product(a, [b]), product(b, [a])])).toEqual([a, b, a]);
    expect(detectProductionCycle([
      product(a, [b]),
      product(b, [c]),
      product(c, [d]),
      product(d, [b]),
    ])).toEqual([b, c, d, b]);
    expect(detectProductionCycle([
      product(a, [b], 'recipe'),
      product(b, [a], 'smelting'),
    ])).toEqual([a, b, a]);
    expect(detectProductionCycle([
      product(a, [b, c]),
      product(b, [d], 'smelting'),
      product(c, []),
      product(d, []),
    ])).toBeUndefined();
  });

  it('candidate application preserves the input snapshot after validation failure', () => {
    const data = createValidData();
    const before = structuredClone(data);
    const current = data.catalog.products.find((entry) => entry.id === IDS.smelting)!;
    const result = service.apply(data, {
      type: 'update',
      category: 'smelting',
      expectedEntity: structuredClone(current),
      candidate: {
        ...current,
        processingSeconds: current.processingSeconds,
        components: [{ entityId: IDS.recipe, quantity: 1 }],
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'production_cycle',
        cycle: [IDS.smelting, IDS.recipe, IDS.smelting],
      },
    });
    expect(data).toEqual(before);
  });
});
