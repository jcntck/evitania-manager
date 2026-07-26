import { describe, expect, it, vi } from 'vitest';
import { AppStore } from '../src/renderer/store/app-store';
import { OperationGuard } from '../src/renderer/store/operation-guard';
import { openDataDirectory, settingsState } from '../src/renderer/settings/settings-model';
import type { DesktopApi, VersionedSnapshot } from '../src/shared/desktop-api';
import type { AppData } from '../src/shared/domain';
import { createSnapshot, createValidData } from './fixtures/storage-fixtures';

const desktopWith = (overrides: Partial<DesktopApi> = {}): DesktopApi => ({
  load: vi.fn(async () => ({ ok: true as const, value: createSnapshot() })),
  save: vi.fn(async (input) => ({
    ok: true as const,
    value: { ...createSnapshot(input.expectedRevision + 1, input.data), data: structuredClone(input.data) },
  })),
  importImage: vi.fn(async () => ({ ok: true as const, value: null })),
  openDataDirectory: vi.fn(async () => ({ ok: true as const, value: undefined })),
  ...overrides,
});

const setStock = (entityId: string, quantity: number) => (data: Readonly<AppData>): AppData => {
  const candidate = structuredClone(data);
  candidate.planning.stock[entityId] = quantity;
  return candidate;
};

describe('renderer application store', () => {
  it('UT-045 serializes rapid actions and exposes only complete immutable latest calculations', async () => {
    const revisions: number[] = [];
    const desktop = desktopWith({
      save: vi.fn(async (input) => {
        revisions.push(input.expectedRevision);
        await Promise.resolve();
        return {
          ok: true as const,
          value: createSnapshot(input.expectedRevision + 1, input.data),
        };
      }),
    });
    const store = new AppStore(desktop);
    await store.initialize();
    const itemId = store.state.committed!.data.catalog.items[0].id;
    const first = store.dispatch({ type: 'mutate-and-save', operationId: 'stock-1', update: setStock(itemId, 2) });
    const second = store.dispatch({ type: 'mutate-and-save', operationId: 'stock-2', update: setStock(itemId, 7) });
    const navigation = store.dispatch({ type: 'navigate', page: 'items', focusToken: 'items-heading' });
    await Promise.all([first, second, navigation]);
    expect(revisions).toEqual([1, 2]);
    expect(store.state.committed?.revision).toBe(3);
    expect(store.state.committed?.data.planning.stock[itemId]).toBe(7);
    expect(store.state.page).toBe('items');
    expect(store.state.focusToken).toBe('items-heading');
    expect(Object.isFrozen(store.state)).toBe(true);
    expect(Object.isFrozen(store.state.candidate?.planning.stock)).toBe(true);
  });

  it('UT-048 keeps synchronization disabled and maps folder results to bounded notices', async () => {
    expect(settingsState.synchronization).toMatchObject({ visible: true, disabled: true });
    expect(await openDataDirectory(desktopWith())).toMatchObject({ kind: 'info' });
    expect(await openDataDirectory(desktopWith({
      openDataDirectory: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'native_action_failed' as const, message: '/secret denied' },
      })),
    }))).toEqual({
      id: 'data-directory-failed',
      kind: 'error',
      code: 'native_action_failed',
      message: 'Não foi possível abrir o local dos dados. Tente novamente.',
    });
  });

  it('UT-049 deduplicates in-flight operations and permits same-ID retry only after typed failure', async () => {
    const guard = new OperationGuard();
    let resolve!: (value: { ok: true; value: number }) => void;
    const operation = vi.fn(() => new Promise<{ ok: true; value: number }>((done) => { resolve = done; }));
    const first = guard.run('same', operation);
    const duplicate = guard.run('same', operation);
    expect(operation).toHaveBeenCalledTimes(1);
    resolve({ ok: true, value: 1 });
    expect(await duplicate).toEqual(await first);
    expect(operation).toHaveBeenCalledTimes(1);

    const retry = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'storage_unavailable', message: 'failed' } })
      .mockResolvedValueOnce({ ok: true, value: 2 });
    expect(await guard.run('retry', retry)).toMatchObject({ ok: false });
    expect(await guard.run('retry', retry)).toEqual({ ok: true, value: 2 });
  });

  it('IT-014 repeated renderer submissions increment one revision and apply one mutation', async () => {
    let saves = 0;
    const desktop = desktopWith({
      save: vi.fn(async (input) => {
        saves += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ok: true as const, value: createSnapshot(input.expectedRevision + 1, input.data) };
      }),
    });
    const store = new AppStore(desktop);
    await store.initialize();
    const itemId = store.state.committed!.data.catalog.items[0].id;
    const initialStock = store.state.committed!.data.planning.stock[itemId] ?? 0;
    const update = (data: Readonly<AppData>): AppData => {
      const candidate = structuredClone(data);
      candidate.planning.stock[itemId] = (candidate.planning.stock[itemId] ?? 0) + 1;
      return candidate;
    };
    await Promise.all([
      store.dispatch({ type: 'mutate-and-save', operationId: 'submit-once', update }),
      store.dispatch({ type: 'mutate-and-save', operationId: 'submit-once', update }),
    ]);
    expect(saves).toBe(1);
    expect(store.state.committed?.revision).toBe(2);
    expect(store.state.committed?.data.planning.stock[itemId]).toBe(initialStock + 1);
  });

  it('IT-015 persists rapid objective/stock/rate/source actions in revision order with latest state', async () => {
    const persisted: VersionedSnapshot[] = [];
    const desktop = desktopWith({
      save: vi.fn(async (input) => {
        const snapshot = createSnapshot(input.expectedRevision + 1, input.data);
        persisted.push(snapshot);
        return { ok: true as const, value: snapshot };
      }),
    });
    const store = new AppStore(desktop);
    await store.initialize();
    const data = createValidData();
    const itemId = data.catalog.items[0].id;
    const resourceId = data.catalog.resources[0].id;
    const actions = [
      (candidate: AppData) => { candidate.planning.stock[itemId] = 4; },
      (candidate: AppData) => { candidate.planning.gatherRates[resourceId] = 12; },
      (candidate: AppData) => { candidate.planning.selectedSources[itemId] = resourceId; },
    ];
    await Promise.all(actions.map((change, index) => store.dispatch({
      type: 'mutate-and-save',
      operationId: `ordered-${index}`,
      update: (current) => {
        const candidate = structuredClone(current);
        change(candidate);
        return candidate;
      },
    })));
    expect(persisted.map((snapshot) => snapshot.revision)).toEqual([2, 3, 4]);
    expect(store.state.committed?.data.planning).toMatchObject({
      stock: { [itemId]: 4 },
      gatherRates: { [resourceId]: 12 },
      selectedSources: { [itemId]: resourceId },
    });
  });

  it('E2E-010 preserves a stale candidate, blocks saves, then discards it only on explicit reload', async () => {
    const current = createSnapshot(2);
    let loadCount = 0;
    const save = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'revision_conflict' as const,
        message: 'conflict',
        details: { expectedRevision: 1, actualRevision: 2 },
      },
    }));
    const desktop = desktopWith({
      load: vi.fn(async () => ({
        ok: true as const,
        value: loadCount++ === 0 ? createSnapshot(1) : current,
      })),
      save,
    });
    const store = new AppStore(desktop);
    await store.initialize();
    const itemId = store.state.committed!.data.catalog.items[0].id;
    await store.dispatch({ type: 'mutate-and-save', operationId: 'stale-save', update: setStock(itemId, 99) });
    expect(store.state.savesBlocked).toBe(true);
    expect(store.state.conflictCandidate?.planning.stock[itemId]).toBe(99);
    await store.dispatch({ type: 'mutate-and-save', operationId: 'blocked-save', update: setStock(itemId, 100) });
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.state.conflictCandidate?.planning.stock[itemId]).toBe(99);
    await store.dispatch({ type: 'reload', operationId: 'explicit-reload' });
    expect(store.state.savesBlocked).toBe(false);
    expect(store.state.conflictCandidate).toBeUndefined();
    expect(store.state.committed?.revision).toBe(2);
    expect(store.state.committed?.data).toEqual(current.data);
  });

  it('E2E-002 keeps sync inert while folder failure leaves the local workflow usable', async () => {
    const data = createValidData();
    const desktop = desktopWith({
      load: vi.fn(async () => ({ ok: true as const, value: createSnapshot(1, data) })),
      openDataDirectory: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'native_action_failed' as const, message: 'bounded' },
      })),
    });
    const store = new AppStore(desktop);
    await store.initialize();
    const notice = await openDataDirectory(desktop);
    expect(settingsState.synchronization.disabled).toBe(true);
    expect(notice).toMatchObject({ kind: 'error', code: 'native_action_failed' });
    expect(store.state.committed?.data).toEqual(data);
    await store.dispatch({ type: 'navigate', page: 'items' });
    expect(store.state.page).toBe('items');
  });
});
