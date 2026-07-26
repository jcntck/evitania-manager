import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCompletionCredit,
  reverseCompletionCredit,
} from '../src/domain/completion-service';
import { PlanningEngine } from '../src/domain/planning-engine';
import { JsonAppRepository } from '../src/infrastructure/json-app-repository';
import { encodeStorageEnvelope } from '../src/infrastructure/storage-schema';
import type { Catalog, Planning } from '../src/shared/domain';
import { createSnapshot, createValidData, IDS } from './fixtures/storage-fixtures';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe('planning composition', () => {
  it('IT-011 reconciles two goals, shared stock, all estimates, multiple sources, and one cycle branch', () => {
    const catalog: Catalog = {
      items: [
        { id: 'ore', name: 'Ore' },
        { id: 'monster-drop', name: 'Monster drop' },
        { id: 'boss-drop', name: 'Boss drop' },
      ],
      resources: [{ id: 'mine', itemId: 'ore', act: 'I' }],
      products: [
        {
          id: 'bar', name: 'Bar', kind: 'smelting', processingSeconds: 90,
          components: [{ entityId: 'ore', quantity: 3 }],
        },
        {
          id: 'cycle-a', name: 'Cycle A', kind: 'recipe',
          components: [{ entityId: 'cycle-b', quantity: 1 }],
        },
        {
          id: 'cycle-b', name: 'Cycle B', kind: 'smelting', processingSeconds: 1,
          components: [{ entityId: 'cycle-a', quantity: 1 }],
        },
        {
          id: 'target', name: 'Target', kind: 'recipe',
          components: [
            { entityId: 'bar', quantity: 2 },
            { entityId: 'monster-drop', quantity: 12 },
            { entityId: 'boss-drop', quantity: 1 },
            { entityId: 'cycle-a', quantity: 1 },
          ],
        },
      ],
      monsters: [{
        id: 'monster', name: 'Monster', act: 'II',
        drops: [
          { itemId: 'monster-drop', numerator: 1, denominator: 200 },
          { itemId: 'ore', numerator: 1, denominator: 5 },
        ],
      }],
      bosses: [{
        id: 'boss', name: 'Boss', act: 'III',
        drops: [{ itemId: 'boss-drop', numerator: 1, denominator: 10 }],
      }],
    };
    const planning: Planning = {
      goals: [
        { id: 'first', productId: 'target', quantity: 1, completed: false, priority: 0 },
        { id: 'second', productId: 'target', quantity: 1, completed: false, priority: 1 },
      ],
      stock: { bar: 1, ore: 1 },
      gatherRates: { mine: 5 },
      killRates: { monster: 600 },
      lootQuantity: 0,
      selectedSources: { ore: 'mine', 'monster-drop': 'monster', 'boss-drop': 'boss' },
      completionCredits: [],
    };

    const result = new PlanningEngine().calculate({ catalog, planning });
    const kinds = new Map(result.consolidated.map((need) => [need.entityId, need.estimate?.kind]));

    expect(kinds.get('bar')).toBe('smelting');
    expect(kinds.get('ore')).toBe('gathering');
    expect(kinds.get('monster-drop')).toBe('monster');
    expect(kinds.get('boss-drop')).toBe('boss');
    expect(result.diagnostics.find((value) => value.code === 'cycle')?.cycle)
      .toEqual(['cycle-a', 'cycle-b', 'cycle-a']);
    for (const need of result.consolidated) {
      expect(need.required).toBe(need.allocated + need.missing);
    }
    expect(result.remainingStock.bar).toBe(0);
    expect(result.remainingStock.ore).toBe(0);
  });

  it('IT-012 persists credit and undo candidates atomically and preserves committed state on conflict', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'evitania-task3-'));
    directories.push(directory);
    const filePath = join(directory, 'app-data.json');
    await writeFile(filePath, encodeStorageEnvelope(createSnapshot()), 'utf8');
    const repository = new JsonAppRepository(filePath);
    const loaded = await repository.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const created = createCompletionCredit(loaded.value.data, {
      operationId: IDS.credit,
      entityId: IDS.item,
      missing: 3,
      createdAt: '2026-07-25T13:00:00.000Z',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const saved = await repository.save({
      expectedRevision: loaded.value.revision,
      data: created.value.data,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const reloaded = await repository.load();
    expect(reloaded).toMatchObject({
      ok: true,
      value: {
        data: {
          planning: {
            stock: { [IDS.item]: 5 },
            completionCredits: [{ id: IDS.credit, quantity: 3 }],
          },
        },
      },
    });
    if (!reloaded.ok) return;

    const undone = reverseCompletionCredit(reloaded.value.data, {
      creditId: IDS.credit,
      reversedAt: '2026-07-25T14:00:00.000Z',
    });
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    const undoSaved = await repository.save({
      expectedRevision: reloaded.value.revision,
      data: undone.value.data,
    });
    expect(undoSaved).toMatchObject({
      ok: true,
      value: {
        data: {
          planning: {
            stock: { [IDS.item]: 2 },
            completionCredits: [{ id: IDS.credit, reversedAt: '2026-07-25T14:00:00.000Z' }],
          },
        },
      },
    });
    const conflictCandidate = createCompletionCredit(
      undoSaved.ok ? undoSaved.value.data : createValidData(),
      {
        operationId: '00000000-0000-4000-8000-00000000000b',
        entityId: IDS.item,
        missing: 4,
        createdAt: '2026-07-25T15:00:00.000Z',
      },
    );
    expect(conflictCandidate.ok).toBe(true);
    if (!conflictCandidate.ok) return;
    expect(await repository.save({
      expectedRevision: loaded.value.revision,
      data: conflictCandidate.value.data,
    })).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
    expect(await repository.load()).toMatchObject({
      ok: true,
      value: { data: { planning: { stock: { [IDS.item]: 2 } } } },
    });
  });
});
