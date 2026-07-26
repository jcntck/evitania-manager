import { describe, expect, it, vi } from 'vitest';
import { AppController } from '../src/controllers/app-controller';
import { FolderService } from '../src/main/folder-service';
import { registerIpcHandlers } from '../src/main/ipc-handlers';
import { parseIpcRequest } from '../src/main/ipc-schemas';
import { parseAssetUrl } from '../src/infrastructure/image-library';
import { DESKTOP_CHANNELS, freezeDesktopApi } from '../src/shared/desktop-api';
import { createDesktopApi } from '../src/shared/desktop-api-adapter';
import { createSnapshot, createValidData } from './fixtures/storage-fixtures';

describe('desktop trust boundary', () => {
  it('UT-053 rejects unknown channels and every malformed/oversized exact request shape', () => {
    const validData = createValidData();
    expect(parseIpcRequest('unknown', [])).toBeNull();
    expect(parseIpcRequest(DESKTOP_CHANNELS.load, [undefined])).toBeNull();
    expect(parseIpcRequest(DESKTOP_CHANNELS.openDataDirectory, [{}])).toBeNull();
    expect(parseIpcRequest(DESKTOP_CHANNELS.importImage, [])).toBeNull();
    expect(parseIpcRequest(DESKTOP_CHANNELS.importImage, [{ category: 'items', path: '/tmp/x' }])).toBeNull();
    expect(parseIpcRequest(DESKTOP_CHANNELS.importImage, [{ category: '../items' }])).toBeNull();
    expect(parseIpcRequest(DESKTOP_CHANNELS.save, [{ expectedRevision: '1', data: validData }])).toBeNull();
    expect(parseIpcRequest(DESKTOP_CHANNELS.save, [{ expectedRevision: 1, data: validData, command: 'rm' }])).toBeNull();
    const tooManyRecords = structuredClone(validData);
    tooManyRecords.catalog.items = Array.from({ length: 5_001 }, (_, index) => ({
      id: `item-${index}`,
      name: `Item ${index}`,
    }));
    expect(parseIpcRequest(DESKTOP_CHANNELS.save, [{ expectedRevision: 1, data: tooManyRecords }])).toBeNull();
    const tooManyGoals = structuredClone(validData);
    tooManyGoals.planning.goals = Array.from({ length: 51 }, (_, index) => ({
      id: `goal-${index}`,
      productId: validData.catalog.products[0].id,
      quantity: 1,
      completed: false,
      priority: index,
    }));
    expect(parseIpcRequest(DESKTOP_CHANNELS.save, [{ expectedRevision: 1, data: tooManyGoals }])).toBeNull();
  });

  it('UT-054 maps all repository outcomes to closed results without path or stack leakage', async () => {
    const snapshot = createSnapshot(7);
    const images = { collectOrphans: vi.fn(async () => ({ deleted: [], failed: [] })) };
    const successRepository = {
      load: vi.fn(async () => ({ ok: true as const, value: snapshot })),
      save: vi.fn(async () => ({ ok: true as const, value: createSnapshot(8) })),
    };
    const success = new AppController(successRepository, images);
    expect(await success.load()).toMatchObject({ ok: true, value: { revision: 7 } });
    expect(await success.save({ expectedRevision: 7, data: snapshot.data }))
      .toMatchObject({ ok: true, value: { revision: 8 } });
    expect(images.collectOrphans).toHaveBeenCalledOnce();
    for (const code of ['data_corrupt', 'migration_failed', 'storage_unavailable', 'revision_conflict'] as const) {
      const repository = {
        load: vi.fn(async () => ({
          ok: false as const,
          error: { code, message: 'bounded', details: { path: '/secret', stack: 'secret' } },
        })),
        save: vi.fn(async () => ({
          ok: false as const,
          error: { code, message: 'bounded', details: { path: '/secret', stack: 'secret' } },
        })),
      };
      const failedImages = { collectOrphans: vi.fn() };
      const controller = new AppController(repository, failedImages);
      expect(JSON.stringify(await controller.load())).not.toContain('/secret');
      expect(JSON.stringify(await controller.save({ expectedRevision: 7, data: snapshot.data })))
        .not.toContain('stack');
      expect(failedImages.collectOrphans).not.toHaveBeenCalled();
    }
  });

  it('UT-055 rejects all malformed asset URLs and containment attempts', () => {
    const root = '/safe/assets';
    const valid = 'asset://items/50000000-0000-4000-8000-000000000001.png';
    expect(parseAssetUrl(valid, root)).toBe('/safe/assets/items/50000000-0000-4000-8000-000000000001.png');
    for (const hostile of [
      'asset://user:pass@items/50000000-0000-4000-8000-000000000001.png',
      `${valid}?x=1`,
      `${valid}#x`,
      'asset://items/%2e%2e%2fsecret.png',
      'asset://items/foo%5cbar.png',
      'asset://unknown/50000000-0000-4000-8000-000000000001.png',
      'asset://items/not-a-uuid.png',
      'asset://items/../../50000000-0000-4000-8000-000000000001.png',
    ]) expect(parseAssetUrl(hostile, root)).toBeNull();
  });

  it('UT-056 maps shell denial/throw to native_action_failed and empty result to success', async () => {
    const mkdir = vi.fn(async () => undefined);
    const success = new FolderService('/data', { openPath: vi.fn(async () => '') }, { mkdir });
    expect(await success.open()).toEqual({ ok: true, value: undefined });
    const denied = new FolderService('/data', { openPath: vi.fn(async () => 'denied /secret') }, { mkdir });
    expect(await denied.open()).toMatchObject({ ok: false, error: { code: 'native_action_failed' } });
    expect(JSON.stringify(await denied.open())).not.toContain('/secret');
    const thrown = new FolderService('/data', { openPath: vi.fn(async () => { throw new Error('/secret'); }) }, { mkdir });
    expect(await thrown.open()).toMatchObject({ ok: false, error: { code: 'native_action_failed' } });
  });

  it('IT-013 composes exactly four registered handlers and a frozen preload adapter', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc = { handle: (channel: string, listener: (...args: unknown[]) => unknown) => handlers.set(channel, listener) };
    const snapshot = createSnapshot();
    const controller = {
      load: vi.fn(async () => ({ ok: true as const, value: snapshot })),
      save: vi.fn(async () => ({ ok: true as const, value: createSnapshot(2) })),
    };
    registerIpcHandlers(ipc, {
      controller,
      images: { import: vi.fn(async () => ({ ok: true as const, value: 'asset://items/50000000-0000-4000-8000-000000000001.png' })) },
      dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
      folders: { open: vi.fn(async () => ({ ok: true as const, value: undefined })) },
    });
    expect([...handlers.keys()]).toEqual(Object.values(DESKTOP_CHANNELS));
    const invoker = {
      invoke: vi.fn(async (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args)),
    };
    const api = createDesktopApi(invoker);
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.keys(api)).toEqual(['load', 'save', 'importImage', 'openDataDirectory']);
    expect(await api.load()).toMatchObject({ ok: true, value: { revision: 1 } });
    expect(await api.save({ expectedRevision: 1, data: snapshot.data }))
      .toMatchObject({ ok: true, value: { revision: 2 } });
    expect(await handlers.get(DESKTOP_CHANNELS.save)!({}, { expectedRevision: 1, data: snapshot.data, extra: true }))
      .toMatchObject({ ok: false, error: { code: 'invalid_request' } });
  });

  it('IT-017 recreates a missing data directory and maps OS denial without leaking it', async () => {
    const mkdir = vi.fn(async () => undefined);
    const shell = { openPath: vi.fn(async () => '') };
    const service = new FolderService('/isolated/data', shell, { mkdir });
    expect(await service.open()).toEqual({ ok: true, value: undefined });
    expect(mkdir).toHaveBeenCalledWith('/isolated/data', { recursive: true });
    shell.openPath.mockResolvedValueOnce('platform denied /isolated/data');
    const denied = await service.open();
    expect(denied).toMatchObject({ ok: false, error: { code: 'native_action_failed' } });
    expect(JSON.stringify(denied)).not.toContain('/isolated/data');
  });

  it('exposes a helper that cannot be mutated after construction', () => {
    expect(Object.isFrozen(freezeDesktopApi({
      load: vi.fn(), save: vi.fn(), importImage: vi.fn(), openDataDirectory: vi.fn(),
    }))).toBe(true);
  });
});
