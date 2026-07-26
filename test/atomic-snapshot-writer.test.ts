import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AtomicSnapshotWriter, type AtomicFileSystem, type AtomicWriteStage,
} from '../src/infrastructure/atomic-snapshot-writer';
import {
  decodeStorageEnvelope, encodeStorageEnvelope,
} from '../src/infrastructure/storage-schema';
import { createSnapshot } from './fixtures/storage-fixtures';

const directories: string[] = [];
const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'evitania-atomic-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const injectedStages: AtomicWriteStage[] = [
  'before_temp_write',
  'after_temp_write',
  'before_temp_flush',
  'after_temp_flush',
  'before_backup_copy',
  'after_backup_copy',
  'before_backup_rename',
  'after_backup_rename',
  'before_primary_rename',
  'after_primary_rename',
  'before_directory_sync',
  'after_directory_sync',
];

describe('AtomicSnapshotWriter', () => {
  it.each(injectedStages)('UT-003 preserves a complete old or next snapshot when faulted at %s', async (faultStage) => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    const oldSnapshot = createSnapshot(4);
    const nextSnapshot = createSnapshot(5);
    await writeFile(path, encodeStorageEnvelope(oldSnapshot), 'utf8');
    const writer = new AtomicSnapshotWriter({
      createTemporaryId: () => 'fault-case',
      fault: (stage) => {
        if (stage === faultStage) throw new Error(`injected:${stage}`);
      },
    });

    const result = await writer.write({ primaryPath: path, contents: encodeStorageEnvelope(nextSnapshot) });
    expect(result.ok).toBe(false);
    const decoded = decodeStorageEnvelope(await readFile(path, 'utf8'));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect([4, 5]).toContain(decoded.value.revision);
  });

  it('commits a flushed snapshot and recoverable validated backup', async () => {
    const directory = await createDirectory();
    const path = join(directory, 'data.json');
    await writeFile(path, encodeStorageEnvelope(createSnapshot(4)), 'utf8');

    const result = await new AtomicSnapshotWriter().write({
      primaryPath: path,
      contents: encodeStorageEnvelope(createSnapshot(5)),
    });

    expect(result).toEqual({ ok: true });
    expect(decodeStorageEnvelope(await readFile(path, 'utf8'))).toMatchObject({
      ok: true, value: { revision: 5 },
    });
    expect(decodeStorageEnvelope(await readFile(`${path}.backup`, 'utf8'))).toMatchObject({
      ok: true, value: { revision: 4 },
    });
  });

  it('skips unsupported directory fsync on Windows after flushing the snapshot file', async () => {
    const openedFiles: Array<{ path: string; flags: string }> = [];
    const fileSystem: AtomicFileSystem = {
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      copyFile: async () => undefined,
      rename: async () => undefined,
      unlink: async () => undefined,
      open: async (path, flags) => {
        openedFiles.push({ path, flags });
        return { sync: async () => undefined, close: async () => undefined };
      },
    };
    const writer = new AtomicSnapshotWriter({
      fileSystem,
      platform: 'win32',
      createTemporaryId: () => 'windows',
    });

    await expect(writer.write({
      primaryPath: 'C:\\Evitania\\data.json',
      contents: '{}',
      rotateBackup: false,
    })).resolves.toEqual({ ok: true });
    expect(openedFiles).toEqual([{
      path: 'C:\\Evitania\\data.json.windows.tmp',
      flags: 'r+',
    }]);
  });
});
