import {
  mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtomicSnapshotWriter, type AtomicWriteStage } from '../src/infrastructure/atomic-snapshot-writer';
import { JsonAppRepository } from '../src/infrastructure/json-app-repository';
import { SeedLoader } from '../src/infrastructure/seed-loader';
import {
  decodeStorageEnvelope, encodeStorageEnvelope,
} from '../src/infrastructure/storage-schema';
import { createEmptyData } from '../src/shared/domain';
import {
  createLegacyData, createSnapshot, createValidData, IDS,
} from './fixtures/storage-fixtures';

const directories: string[] = [];
const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'evitania-repository-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const fixedOptions = {
  now: () => '2026-07-25T12:00:00.000Z',
  createMigrationId: () => IDS.credit,
};

describe('JsonAppRepository load/save integration', () => {
  it('IT-001 loads, edits, saves, and restores exact data/revision after restart', async () => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    await writeFile(path, encodeStorageEnvelope(createSnapshot(2)), 'utf8');
    const first = new JsonAppRepository(path, fixedOptions);
    const loaded = await first.load();
    expect(loaded).toMatchObject({ ok: true, value: { revision: 2 } });
    if (!loaded.ok) return;
    const edited = structuredClone(loaded.value.data);
    edited.catalog.items[0].name = 'Minério editado';
    const saved = await first.save({ expectedRevision: 2, data: edited });
    expect(saved).toMatchObject({ ok: true, value: { revision: 3 } });

    const restarted = await new JsonAppRepository(path, fixedOptions).load();
    expect(restarted).toMatchObject({ ok: true, value: { revision: 3 } });
    if (restarted.ok) expect(restarted.value.data.catalog.items[0].name).toBe('Minério editado');
  });

  it.each([
    ['valid', JSON.stringify(createValidData()), 'seed_initialized', 2],
    ['missing', undefined, 'empty_initialized', 0],
    ['invalid', '{', 'empty_initialized', 0],
  ])('IT-002 initializes a %s packaged-seed scenario safely', async (_label, seedContents, notice, itemCount) => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    const seedPath = join(directory, 'seed.json');
    if (seedContents !== undefined) await writeFile(seedPath, seedContents, 'utf8');

    const loaded = await new JsonAppRepository(path, { ...fixedOptions, seedPath }).load();

    expect(loaded).toMatchObject({
      ok: true,
      value: {
        revision: 1,
        notice: { code: notice },
        data: { catalog: { items: expect.any(Array) } },
      },
    });
    if (loaded.ok) expect(loaded.value.data.catalog.items).toHaveLength(itemCount);
    expect(decodeStorageEnvelope(await readFile(path, 'utf8')).ok).toBe(true);
  });

  it.each([
    'before_temp_write',
    'after_temp_write',
    'before_temp_flush',
    'after_temp_flush',
    'before_primary_rename',
    'after_primary_rename',
    'before_directory_sync',
    'after_directory_sync',
  ] satisfies AtomicWriteStage[])('UT-008 and IT-003 first initialization retries idempotently after %s', async (faultStage) => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    const seedPath = join(directory, 'seed.json');
    await writeFile(seedPath, JSON.stringify(createValidData()), 'utf8');
    const faulted = new JsonAppRepository(path, {
      ...fixedOptions,
      seedPath,
      writer: new AtomicSnapshotWriter({
        createTemporaryId: () => 'initialization',
        fault: (stage) => {
          if (stage === faultStage) throw new Error(`injected:${stage}`);
        },
      }),
    });

    await faulted.load();
    const retried = await new JsonAppRepository(path, { ...fixedOptions, seedPath }).load();

    expect(retried.ok).toBe(true);
    if (retried.ok) {
      expect(new Set(retried.value.data.catalog.items.map((item) => item.id)).size)
        .toBe(retried.value.data.catalog.items.length);
    }
    expect(decodeStorageEnvelope(await readFile(path, 'utf8')).ok).toBe(true);
  });

  it.each([
    'before_temp_flush',
    'before_backup_copy',
    'before_backup_rename',
    'before_primary_rename',
    'after_primary_rename',
  ] satisfies AtomicWriteStage[])('IT-004 reloads an old or complete new snapshot after save fault %s', async (faultStage) => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    await writeFile(path, encodeStorageEnvelope(createSnapshot(4)), 'utf8');
    const repository = new JsonAppRepository(path, {
      ...fixedOptions,
      writer: new AtomicSnapshotWriter({
        createTemporaryId: () => 'save-fault',
        fault: (stage) => {
          if (stage === faultStage) throw new Error(`injected:${stage}`);
        },
      }),
    });
    const next = createValidData();
    next.catalog.items[0].name = 'Novo';

    await repository.save({ expectedRevision: 4, data: next });
    const reloaded = await new JsonAppRepository(path, fixedOptions).load();

    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect([4, 5]).toContain(reloaded.value.revision);
    const backupExists = await readFile(`${path}.backup`, 'utf8').then(() => true, () => false);
    if (backupExists) expect(decodeStorageEnvelope(await readFile(`${path}.backup`, 'utf8')).ok).toBe(true);
  });

  it('UT-004 and IT-005 return a side-effect-free conflict for stale repository clients', async () => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    const backupPath = `${path}.backup`;
    await writeFile(path, encodeStorageEnvelope(createSnapshot(3)), 'utf8');
    await writeFile(backupPath, 'unchanged-backup', 'utf8');
    let writeStages = 0;
    const observingWriter = new AtomicSnapshotWriter({
      fault: () => { writeStages += 1; },
    });
    const first = new JsonAppRepository(path, fixedOptions);
    const second = new JsonAppRepository(path, { ...fixedOptions, writer: observingWriter });
    const [firstLoaded, secondLoaded] = await Promise.all([first.load(), second.load()]);
    expect(firstLoaded.ok && secondLoaded.ok).toBe(true);
    const firstData = createValidData();
    firstData.catalog.items[0].name = 'Primeiro';
    expect(await first.save({ expectedRevision: 3, data: firstData })).toMatchObject({
      ok: true, value: { revision: 4 },
    });
    const primaryAfterFirst = await readFile(path, 'utf8');
    const backupAfterFirst = await readFile(backupPath, 'utf8');

    const staleData = createValidData();
    staleData.catalog.items[0].name = 'Obsoleto';
    const conflict = await second.save({ expectedRevision: 3, data: staleData });

    expect(conflict).toMatchObject({
      ok: false,
      error: { code: 'revision_conflict', details: { expectedRevision: 3, actualRevision: 4 } },
    });
    expect(writeStages).toBe(0);
    expect(await readFile(path, 'utf8')).toEqual(primaryAfterFirst);
    expect(await readFile(backupPath, 'utf8')).toEqual(backupAfterFirst);
  });

  it('recovers a corrupt primary from a valid backup through the atomic writer', async () => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    await writeFile(path, '{', 'utf8');
    await writeFile(`${path}.backup`, encodeStorageEnvelope(createSnapshot(6)), 'utf8');

    const loaded = await new JsonAppRepository(path, fixedOptions).load();

    expect(loaded).toMatchObject({
      ok: true, value: { revision: 6, notice: { code: 'recovered_backup' } },
    });
    expect(decodeStorageEnvelope(await readFile(path, 'utf8'))).toMatchObject({
      ok: true, value: { revision: 6 },
    });
  });

  it('UT-009 returns data_corrupt for invalid existing primary/backup and never reads seed', async () => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    await writeFile(path, '{', 'utf8');
    await writeFile(`${path}.backup`, '{"schemaVersion":99}', 'utf8');
    const readSeed = vi.fn(async () => ({ kind: 'empty' as const, data: createEmptyData(), reason: 'missing' as const }));
    const seedLoader = { read: readSeed } as unknown as SeedLoader;

    const loaded = await new JsonAppRepository(path, { ...fixedOptions, seedLoader }).load();

    expect(loaded).toMatchObject({ ok: false, error: { code: 'data_corrupt' } });
    expect(readSeed).not.toHaveBeenCalled();
    expect(await readFile(path, 'utf8')).toBe('{');
  });

  it('IT-010 migrates a v1 fixture, saves, and reloads exact stock/priorities/reversible credits', async () => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    const legacy = createLegacyData();
    await writeFile(path, JSON.stringify(legacy), 'utf8');
    const repository = new JsonAppRepository(path, fixedOptions);

    const loaded = await repository.load();
    expect(loaded).toMatchObject({
      ok: true,
      value: {
        revision: 1,
        notice: { code: 'migration_applied' },
        data: {
          planning: {
            stock: { [IDS.item]: 5 },
            goals: [{ priority: 0 }],
            completionCredits: [{ id: IDS.credit, entityId: IDS.item, quantity: 3 }],
          },
        },
      },
    });
    if (!loaded.ok) return;
    const saved = await repository.save({ expectedRevision: 1, data: loaded.value.data });
    expect(saved).toMatchObject({ ok: true, value: { revision: 2 } });

    const restarted = await new JsonAppRepository(path, fixedOptions).load();
    expect(restarted).toMatchObject({
      ok: true,
      value: {
        revision: 2,
        data: {
          planning: {
            stock: { [IDS.item]: 5 },
            goals: [{ priority: 0 }],
            completionCredits: [{ quantity: 3 }],
          },
        },
      },
    });
  });
});

describe('SeedLoader first-use contract', () => {
  it('UT-006 returns an existing snapshot unchanged without reading seed', async () => {
    const readText = vi.fn(async () => JSON.stringify(createValidData()));
    const loader = new SeedLoader('/seed.json', undefined, readText);
    const existing = createSnapshot(9);
    const persist = vi.fn();

    const result = await loader.initialize({
      primaryExists: true,
      backupExists: false,
      existing,
      persist,
    });

    expect(result).toBe(existing);
    expect(readText).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
