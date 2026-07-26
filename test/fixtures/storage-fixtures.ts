import type { AppData } from '../../src/shared/domain';
import { createEmptyData } from '../../src/shared/domain';
import type { LegacyAppDataV1 } from '../../src/infrastructure/migrations/v1-to-v2';
import type { VersionedSnapshot } from '../../src/infrastructure/storage-schema';

export const IDS = {
  item: '00000000-0000-4000-8000-000000000001',
  secondItem: '00000000-0000-4000-8000-000000000002',
  resource: '00000000-0000-4000-8000-000000000003',
  smelting: '00000000-0000-4000-8000-000000000004',
  recipe: '00000000-0000-4000-8000-000000000005',
  monster: '00000000-0000-4000-8000-000000000006',
  boss: '00000000-0000-4000-8000-000000000007',
  goal: '00000000-0000-4000-8000-000000000008',
  secondGoal: '00000000-0000-4000-8000-000000000009',
  credit: '00000000-0000-4000-8000-00000000000a',
} as const;

export const createValidData = (): AppData => {
  const data = createEmptyData();
  data.catalog.items.push(
    { id: IDS.item, name: 'Minério' },
    { id: IDS.secondItem, name: 'Carvão' },
  );
  data.catalog.resources.push({ id: IDS.resource, itemId: IDS.item, act: 'I' });
  data.catalog.products.push({
    id: IDS.smelting,
    name: 'Barra',
    kind: 'smelting',
    processingSeconds: 90,
    components: [{ entityId: IDS.item, quantity: 3 }],
  });
  data.catalog.products.push({
    id: IDS.recipe,
    name: 'Espada',
    kind: 'recipe',
    components: [
      { entityId: IDS.smelting, quantity: 2 },
      { entityId: IDS.secondItem, quantity: 1 },
    ],
  });
  data.catalog.monsters.push({
    id: IDS.monster,
    name: 'Golem',
    act: 'I',
    drops: [{ itemId: IDS.secondItem, numerator: 1, denominator: 4 }],
  });
  data.catalog.bosses.push({
    id: IDS.boss,
    name: 'Titã',
    act: 'II',
    drops: [{ itemId: IDS.item, numerator: 1, denominator: 10 }],
  });
  data.planning.goals.push({
    id: IDS.goal,
    productId: IDS.recipe,
    quantity: 2,
    completed: false,
    priority: 0,
  });
  data.planning.stock[IDS.item] = 2;
  data.planning.gatherRates[IDS.resource] = 10;
  data.planning.killRates[IDS.monster] = 20;
  data.planning.selectedSources[IDS.secondItem] = IDS.monster;
  return data;
};

export const createSnapshot = (revision = 1, data = createValidData()): VersionedSnapshot => ({
  schemaVersion: 2,
  revision,
  writtenAt: '2026-07-25T12:00:00.000Z',
  data,
});

export const createLegacyData = (): LegacyAppDataV1 => ({
  version: 1,
  catalog: {
    items: [
      { id: IDS.item, name: 'Minério' },
      { id: IDS.secondItem, name: 'Carvão' },
    ],
    resources: [{ id: IDS.resource, itemId: IDS.item, act: 'I' }],
    products: [
      {
        id: IDS.smelting,
        name: 'Barra',
        kind: 'smeltery',
        processingSeconds: 90,
        components: [{ entityId: IDS.item, quantity: 3 }],
      },
      {
        id: IDS.recipe,
        name: 'Espada',
        kind: 'recipe',
        components: [{ entityId: IDS.smelting, quantity: 2 }],
      },
    ],
    monsters: [],
    bosses: [],
  },
  planning: {
    goals: [{ id: IDS.goal, productId: IDS.recipe, quantity: 2, completed: false }],
    stock: { [IDS.item]: 2 },
    gatherRates: { [IDS.resource]: 10 },
    killRates: {},
    lootQuantity: 0,
    completedEntities: { [IDS.item]: 3, [IDS.smelting]: 0 },
    selectedSources: { [IDS.item]: IDS.resource },
  },
});
