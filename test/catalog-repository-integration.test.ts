import {
  mkdtemp, readFile, rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CatalogService,
  type CatalogEntity,
  type CatalogMutation,
} from '../src/domain/catalog-service';
import { JsonAppRepository } from '../src/infrastructure/json-app-repository';
import { decodeStorageEnvelope } from '../src/infrastructure/storage-schema';
import type { AppData, EntityCategory } from '../src/shared/domain';

const directories: string[] = [];
const id = (suffix: number): string =>
  `20000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe('CatalogService and revisioned repository integration', () => {
  it('IT-009 performs every catalog CRUD and persists neither deletion nor cycle failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'evitania-catalog-'));
    directories.push(directory);
    const path = join(directory, 'data.json');
    const repository = new JsonAppRepository(path, {
      now: () => '2026-07-25T12:00:00.000Z',
    });
    const service = new CatalogService();
    const loaded = await repository.load();
    expect(loaded).toMatchObject({ ok: true, value: { revision: 1 } });
    if (!loaded.ok) return;
    let data = loaded.value.data;
    let revision = loaded.value.revision;

    const applyAndSave = async (mutation: CatalogMutation): Promise<void> => {
      const applied = service.apply(data, mutation);
      expect(applied.ok).toBe(true);
      if (!applied.ok) return;
      expect(applied.value).not.toBe(data);
      const saved = await repository.save({
        expectedRevision: revision,
        data: applied.value,
      });
      expect(saved).toMatchObject({ ok: true, value: { revision: revision + 1 } });
      if (!saved.ok) return;
      data = saved.value.data;
      revision = saved.value.revision;
    };
    const current = (category: EntityCategory, entityId: string): CatalogEntity => {
      const entities: CatalogEntity[] = category === 'items'
        ? data.catalog.items
        : category === 'resources'
          ? data.catalog.resources
          : category === 'monsters'
            ? data.catalog.monsters
            : category === 'bosses'
              ? data.catalog.bosses
              : data.catalog.products;
      return entities.find((entity) => entity.id === entityId)!;
    };

    await applyAndSave({
      type: 'create',
      category: 'items',
      candidate: { id: id(1), name: 'Minério' },
    });
    await applyAndSave({
      type: 'create',
      category: 'items',
      candidate: { id: id(2), name: 'Carvão' },
    });
    await applyAndSave({
      type: 'create',
      category: 'resources',
      candidate: { id: id(3), itemId: id(1), act: 'I' },
    });
    await applyAndSave({
      type: 'create',
      category: 'smelting',
      candidate: {
        id: id(4),
        name: 'Barra',
        processingSeconds: '1m 30s',
        components: [{ entityId: id(1), quantity: 3 }],
      },
    });
    await applyAndSave({
      type: 'create',
      category: 'recipes',
      candidate: {
        id: id(5),
        name: 'Espada',
        components: [
          { entityId: id(4), quantity: 2 },
          { entityId: id(2), quantity: 1 },
        ],
      },
    });
    await applyAndSave({
      type: 'create',
      category: 'monsters',
      candidate: {
        id: id(6),
        name: 'Golem',
        act: 'I',
        drops: [{ itemId: id(2), numerator: 1, denominator: 5 }],
      },
    });
    await applyAndSave({
      type: 'create',
      category: 'bosses',
      candidate: {
        id: id(7),
        name: 'Titã',
        act: 'III',
        drops: [{ itemId: id(1), numerator: 1, denominator: 10 }],
      },
    });

    await applyAndSave({
      type: 'update',
      category: 'items',
      expectedEntity: current('items', id(1)),
      candidate: { id: id(1), name: 'Minério refinado' },
    });
    await applyAndSave({
      type: 'update',
      category: 'resources',
      expectedEntity: current('resources', id(3)),
      candidate: { id: id(3), itemId: id(1), act: 'II' },
    });
    await applyAndSave({
      type: 'update',
      category: 'smelting',
      expectedEntity: current('smelting', id(4)),
      candidate: {
        id: id(4),
        name: 'Barra refinada',
        processingSeconds: '2m',
        components: [{ entityId: id(1), quantity: 4 }],
      },
    });
    await applyAndSave({
      type: 'update',
      category: 'recipes',
      expectedEntity: current('recipes', id(5)),
      candidate: {
        id: id(5),
        name: 'Espada longa',
        components: [{ entityId: id(4), quantity: 2 }],
      },
    });
    await applyAndSave({
      type: 'update',
      category: 'monsters',
      expectedEntity: current('monsters', id(6)),
      candidate: {
        id: id(6),
        name: 'Golem antigo',
        act: 'II',
        drops: [{ itemId: id(2), numerator: 1, denominator: 4 }],
      },
    });
    await applyAndSave({
      type: 'update',
      category: 'bosses',
      expectedEntity: current('bosses', id(7)),
      candidate: {
        id: id(7),
        name: 'Titã antigo',
        act: 'III',
        drops: [{ itemId: id(1), numerator: 1, denominator: 8 }],
      },
    });

    const coherentBeforeFailures = structuredClone(data);
    const revisionBeforeFailures = revision;
    const cycleFailure = service.apply(data, {
      type: 'update',
      category: 'smelting',
      expectedEntity: current('smelting', id(4)),
      candidate: {
        id: id(4),
        name: 'Barra refinada',
        processingSeconds: 120,
        components: [{ entityId: id(5), quantity: 1 }],
      },
    });
    expect(cycleFailure).toEqual({
      ok: false,
      error: { code: 'production_cycle', cycle: [id(4), id(5), id(4)] },
    });
    const deletionFailure = service.apply(data, {
      type: 'delete',
      category: 'items',
      id: id(1),
      expectedEntity: current('items', id(1)),
    });
    expect(deletionFailure).toMatchObject({
      ok: false,
      error: { code: 'referenced_entity', entityId: id(1) },
    });
    expect(data).toEqual(coherentBeforeFailures);

    const afterFailures = await new JsonAppRepository(path).load();
    expect(afterFailures).toMatchObject({
      ok: true,
      value: {
        revision: revisionBeforeFailures,
        data: coherentBeforeFailures,
      },
    });
    const decoded = decodeStorageEnvelope(await readFile(path, 'utf8'));
    expect(decoded).toMatchObject({
      ok: true,
      value: { revision: revisionBeforeFailures, data: coherentBeforeFailures },
    });

    for (const [category, entityId] of [
      ['bosses', id(7)],
      ['monsters', id(6)],
      ['recipes', id(5)],
      ['smelting', id(4)],
      ['resources', id(3)],
      ['items', id(1)],
      ['items', id(2)],
    ] as const) {
      await applyAndSave({
        type: 'delete',
        category,
        id: entityId,
        expectedEntity: current(category, entityId),
      });
    }

    expect(data.catalog).toEqual({
      items: [],
      resources: [],
      products: [],
      monsters: [],
      bosses: [],
    });
    expect(revision).toBe(21);
    expect(await new JsonAppRepository(path).load()).toMatchObject({
      ok: true,
      value: { revision: 21, data: { catalog: data.catalog } },
    });
  });
});
