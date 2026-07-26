// @vitest-environment happy-dom

import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { CatalogView } from '../../src/renderer/catalog/catalog-view';
import { RelationPicker } from '../../src/renderer/components/relation-picker';
import { AppStore } from '../../src/renderer/store/app-store';
import type { AppState } from '../../src/renderer/store/app-store';
import type { DesktopApi } from '../../src/shared/desktop-api';
import { createEmptyData } from '../../src/shared/domain';
import { createSnapshot, createValidData } from '../fixtures/storage-fixtures';

const click = (root: ParentNode, selector: string): void => {
  const target = root.querySelector<HTMLElement>(selector);
  if (!target) throw new Error(`Missing test target: ${selector}`);
  target.click();
};

const input = (root: ParentNode, selector: string, value: string): void => {
  const target = root.querySelector<HTMLInputElement>(selector);
  if (!target) throw new Error(`Missing test input: ${selector}`);
  target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true }));
};

const settle = async (store: AppStore): Promise<void> => {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
    await store.whenIdle();
  }
};

const desktop = (): DesktopApi => ({
  load: vi.fn(async () => ({ ok: true as const, value: createSnapshot(1, createValidData()) })),
  save: vi.fn(async (candidate) => ({
    ok: true as const,
    value: createSnapshot(candidate.expectedRevision + 1, candidate.data),
  })),
  importImage: vi.fn(async () => ({ ok: true as const, value: null })),
  openDataDirectory: vi.fn(async () => ({ ok: true as const, value: undefined })),
});

describe('mounted catalog editor', () => {
  it('IT-016 preserves parent across invalid/cancel/success child flows and restores focus', async () => {
    const api = desktop();
    const store = new AppStore(api);
    await store.initialize();
    await store.dispatch({ type: 'navigate', page: 'recipes' });
    const root = document.createElement('main');
    document.body.replaceChildren(root);
    const view = new CatalogView(api);
    view.mount(root, (action) => store.dispatch(action));
    const unsubscribe = store.subscribe((state) => view.render(state));

    click(root, '[data-action="catalog-create"]');
    await store.whenIdle();
    input(root, '[name="name"]', 'Receita Pai');
    await store.whenIdle();
    input(root, '[data-role="relation-search"]', 'Item Filho');
    await store.whenIdle();
    click(root, '[data-action="relation-create"]');
    await store.whenIdle();
    expect(root.querySelector('.nested')).not.toBeNull();
    expect((root.querySelector('[name="name"]') as HTMLInputElement).value).toBe('Receita Pai');

    input(root, '[name="childName"]', '');
    await store.whenIdle();
    click(root, '[data-action="child-save"]');
    await settle(store);
    expect(root.querySelector('.nested [role="alert"]')?.textContent).toContain('nome');
    expect((root.querySelector('[name="name"]') as HTMLInputElement).value).toBe('Receita Pai');

    click(root, '[data-action="child-cancel"]');
    await store.whenIdle();
    expect(root.querySelector('.nested')).toBeNull();
    expect((root.querySelector('[name="name"]') as HTMLInputElement).value).toBe('Receita Pai');

    input(root, '[data-role="relation-search"]', 'Item Filho');
    await store.whenIdle();
    click(root, '[data-action="relation-create"]');
    await store.whenIdle();
    click(root, '[data-action="child-save"]');
    await settle(store);
    expect(store.state.notices).toEqual([]);
    expect(store.state.committed?.data.catalog.items.some((item) => item.name === 'Item Filho')).toBe(true);
    expect(store.state.drafts['catalog:inline-child']).toBeUndefined();
    expect(root.querySelector('.nested')).toBeNull();
    expect(root.querySelector('.form-list')?.textContent).toContain('Item Filho');
    expect(document.activeElement).toBe(root.querySelector('[data-role="relation-search"]'));

    unsubscribe();
    view.unmount();
  });

  it('IT-020 mounts 5,000 options with capped results, stable selection, focus, and sub-500 ms search', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const picker = new RelationPicker();
    let query = '';
    const records = Array.from({ length: 5_000 }, (_, index) => ({
      id: `record-${index}`,
      name: index === 4_999 ? 'Cristal Único' : `Registro ${index}`,
    }));
    picker.mount(root, (action) => {
      if (action.type === 'relation-query') query = action.query;
    });
    const started = performance.now();
    picker.render({
      label: 'Componente',
      query: 'cristal unico',
      records,
      selectedIds: ['record-2'],
      multiple: true,
    });
    const duration = performance.now() - started;
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(root.textContent).toContain('Registro 2');
    expect(root.textContent).toContain('Cristal Único');
    expect(duration).toBeLessThan(500);

    const listbox = root.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.focus();
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('Cristal Único');
    expect(query).toBe('');
    picker.unmount();

    const catalogData = createEmptyData();
    catalogData.catalog.items = Array.from({ length: 5_000 }, (_, index) => ({
      id: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
      name: index === 4_999 ? 'Item de Escala Único' : `Item de Escala ${index}`,
    }));
    const catalogRoot = document.createElement('main');
    document.body.replaceChildren(catalogRoot);
    const view = new CatalogView(desktop());
    view.mount(catalogRoot, vi.fn());
    const state: AppState = {
      committed: createSnapshot(1, catalogData),
      candidate: catalogData,
      page: 'items',
      plannerView: 'objectives',
      drafts: { 'catalog:list-query:items': 'unico' },
      operations: {},
      notices: [],
      savesBlocked: false,
    };
    const catalogStarted = performance.now();
    view.render(state);
    const catalogDuration = performance.now() - catalogStarted;
    expect(catalogRoot.querySelectorAll('.catalog-card')).toHaveLength(1);
    expect(catalogRoot.textContent).toContain('Item de Escala Único');
    expect(catalogDuration).toBeLessThan(500);
    view.unmount();
  });

  it('constructs hostile catalog names as text rather than markup', async () => {
    const api = desktop();
    const snapshot = createValidData();
    snapshot.catalog.items[0].name = '<img src=x onerror=alert(1)>';
    const store = new AppStore({
      ...api,
      load: vi.fn(async () => ({ ok: true as const, value: createSnapshot(1, snapshot) })),
    });
    await store.initialize();
    await store.dispatch({ type: 'navigate', page: 'items' });
    const root = document.createElement('main');
    const view = new CatalogView(api);
    view.mount(root, (action) => store.dispatch(action));
    view.render(store.state);
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
