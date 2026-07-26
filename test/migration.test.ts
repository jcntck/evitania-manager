import { describe, expect, it } from 'vitest';
import { migrateV1ToV2 } from '../src/infrastructure/migrations/v1-to-v2';
import { createLegacyData, IDS } from './fixtures/storage-fixtures';

describe('schema-v1 to schema-v2 migration', () => {
  it('UT-005 preserves source/identity/data and creates ordered reversible credits', () => {
    const source = createLegacyData();
    const before = structuredClone(source);
    const migrated = migrateV1ToV2(source, {
      now: () => '2026-07-25T12:00:00.000Z',
      createId: () => IDS.credit,
    });

    expect(source).toEqual(before);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.catalog.products.map((product) => [product.id, product.kind])).toEqual([
      [IDS.smelting, 'smelting'],
      [IDS.recipe, 'recipe'],
    ]);
    expect(migrated.value.planning.goals).toEqual([
      { ...source.planning.goals[0], priority: 0 },
    ]);
    expect(migrated.value.planning.stock[IDS.item]).toBe(5);
    expect(migrated.value.planning.completionCredits).toEqual([{
      id: IDS.credit,
      entityId: IDS.item,
      quantity: 3,
      createdAt: '2026-07-25T12:00:00.000Z',
    }]);
    expect(migrated.value.planning).not.toHaveProperty('completedEntities');
  });

  it('fails the complete migration when legacy references or quantities are invalid', () => {
    const source = createLegacyData();
    source.catalog.products[0].components[0].entityId = '00000000-0000-4000-8000-000000000099';

    const migrated = migrateV1ToV2(source);
    expect(migrated).toMatchObject({ ok: false, error: { code: 'migration_failed' } });
  });

  it('migrates category-prefixed identifiers written by v0.2.3 and rewrites every reference', () => {
    const source = createLegacyData();
    const prefixed = (prefix: string, id: string): string => `${prefix}-${id}`;
    const itemId = prefixed('items', IDS.item);
    const secondItemId = prefixed('items', IDS.secondItem);
    const resourceId = prefixed('resources', IDS.resource);
    const smeltingId = prefixed('smeltery', IDS.smelting);
    const recipeId = prefixed('recipes', IDS.recipe);
    const goalId = prefixed('goal', IDS.goal);

    source.catalog.items[0].id = itemId;
    source.catalog.items[1].id = secondItemId;
    source.catalog.resources[0] = { ...source.catalog.resources[0], id: resourceId, itemId };
    source.catalog.products[0] = {
      ...source.catalog.products[0],
      id: smeltingId,
      components: [{ entityId: itemId, quantity: 3 }],
    };
    source.catalog.products[1] = {
      ...source.catalog.products[1],
      id: recipeId,
      components: [{ entityId: smeltingId, quantity: 2 }],
    };
    source.planning.goals[0] = {
      ...source.planning.goals[0],
      id: goalId,
      productId: recipeId,
    };
    source.planning.stock = { [itemId]: 2 };
    source.planning.gatherRates = { [resourceId]: 10 };
    source.planning.completedEntities = { [itemId]: 3, [smeltingId]: 0 };
    source.planning.selectedSources = { [itemId]: resourceId };

    const migrated = migrateV1ToV2(source, {
      now: () => '2026-07-25T12:00:00.000Z',
      createId: () => IDS.credit,
    });

    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.catalog.items.map((item) => item.id)).toEqual([IDS.item, IDS.secondItem]);
    expect(migrated.value.catalog.resources[0]).toMatchObject({
      id: IDS.resource,
      itemId: IDS.item,
    });
    expect(migrated.value.catalog.products.map((product) => product.id)).toEqual([
      IDS.smelting,
      IDS.recipe,
    ]);
    expect(migrated.value.catalog.products[1].components[0].entityId).toBe(IDS.smelting);
    expect(migrated.value.planning.goals[0]).toMatchObject({
      id: IDS.goal,
      productId: IDS.recipe,
    });
    expect(migrated.value.planning.stock).toEqual({ [IDS.item]: 5, [IDS.smelting]: 0 });
    expect(migrated.value.planning.gatherRates).toEqual({ [IDS.resource]: 10 });
    expect(migrated.value.planning.selectedSources).toEqual({ [IDS.item]: IDS.resource });
    expect(migrated.value.planning.completionCredits[0]).toMatchObject({ entityId: IDS.item });
  });
});
