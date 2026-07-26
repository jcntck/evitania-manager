// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { PlanningEngine } from '../../src/domain/planning-engine';
import { NavigationView, NAVIGATION_ITEMS } from '../../src/renderer/navigation/navigation-view';
import { PlannerView, plannerStatus } from '../../src/renderer/planner/planner-view';
import type { AppAction, AppState } from '../../src/renderer/store/app-store';
import { createSnapshot, createValidData, IDS } from '../fixtures/storage-fixtures';

const mountedState = (view: AppState['plannerView'] = 'objectives'): AppState => {
  const data = createValidData();
  data.catalog.items[1].name = `Carvão ${'muito longo '.repeat(30)}`;
  data.planning.stock[IDS.secondItem] = 2;
  const snapshot = createSnapshot(1, data);
  return {
    committed: snapshot,
    candidate: data,
    page: 'planner',
    plannerView: view,
    drafts: {},
    operations: {},
    notices: [],
    planning: new PlanningEngine().calculate({ catalog: data.catalog, planning: data.planning }),
    savesBlocked: false,
  };
};

describe('planner renderer contracts', () => {
  it('UT-046 renders explicit empty, complete, remaining, unresolved, zero, long/full-value states', () => {
    expect(plannerStatus(0, [])).toEqual({ key: 'complete', label: 'Completo' });
    expect(plannerStatus(2, [])).toEqual({ key: 'remaining', label: 'Restante' });
    expect(plannerStatus(2, [{ code: 'source_required' }])).toEqual({
      key: 'unresolved',
      label: 'Não resolvido',
    });

    const root = document.createElement('main');
    const planner = new PlannerView();
    planner.mount(root, vi.fn());
    const state = mountedState('consolidated');
    planner.render(state);

    expect(root.textContent).toContain('Completo');
    expect(root.textContent).toContain('Restante');
    expect(root.textContent).toContain('Não resolvido');
    expect(root.textContent).toContain('Estoque global');
    expect(root.textContent).toContain('Faltante: 0');
    expect(root.textContent).toContain('Não calculável');
    expect(root.textContent).not.toContain('Sem imagem');
    const longName = state.candidate!.catalog.items[1].name;
    const longNode = [...root.querySelectorAll<HTMLElement>('[title]')]
      .find((node) => node.title === longName);
    expect(longNode?.textContent).toBe(longName);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toMatch(/necessidades consolidadas/);

    const emptyData = createValidData();
    emptyData.planning.goals = [];
    const emptyState: AppState = {
      ...state,
      candidate: emptyData,
      committed: createSnapshot(2, emptyData),
      planning: new PlanningEngine().calculate({
        catalog: emptyData.catalog,
        planning: emptyData.planning,
      }),
    };
    planner.render(emptyState);
    expect(root.textContent).toContain('Nenhum objetivo');
    expect(root.textContent).toContain('Plano completo ou vazio');
    expect(root.querySelector('.planner-state[role="status"]')).not.toBeNull();
  });

  it('UT-047 exposes ordered navigation, semantic focus/keyboard actions, trees, and non-color cues', () => {
    const actions: AppAction[] = [];
    const navRoot = document.createElement('nav');
    document.body.append(navRoot);
    const navigation = new NavigationView();
    navigation.mount(navRoot, (action) => { actions.push(action); });
    const state = mountedState();
    navigation.render(state);

    expect([...navRoot.querySelectorAll<HTMLElement>('[data-page]')].map((node) => node.dataset.page))
      .toEqual(NAVIGATION_ITEMS.map((entry) => entry.page));
    expect(navRoot.querySelector('[data-page="planner"]')?.getAttribute('aria-current')).toBe('page');
    expect(navRoot.querySelector('.nav-primary')).not.toBeNull();
    const first = navRoot.querySelector<HTMLButtonElement>('[data-page="planner"]')!;
    const second = navRoot.querySelector<HTMLButtonElement>('[data-page="recipes"]')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(second);
    second.click();
    expect(actions.at(-1)).toMatchObject({ type: 'navigate', page: 'recipes' });

    const plannerRoot = document.createElement('main');
    const planner = new PlannerView();
    planner.mount(plannerRoot, (action) => { actions.push(action); });
    planner.render(state);
    expect(plannerRoot.querySelector('[role="tablist"]')).not.toBeNull();
    expect(plannerRoot.querySelector('[role="tab"][aria-selected="true"]')?.textContent)
      .toContain('Árvores');
    expect(plannerRoot.querySelector('ol.objective-list')).not.toBeNull();
    expect(plannerRoot.querySelector('[data-action="goal-move"][data-direction="up"]'))
      .not.toBeNull();
    expect(plannerRoot.querySelector('ul.planner-tree[role="list"]')).not.toBeNull();
    const toggle = plannerRoot.querySelector<HTMLButtonElement>('[data-action="tree-toggle"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBeTruthy();
    expect(plannerRoot.querySelector('.status-cue')?.textContent).toMatch(/Pendente|Restante|Completo/);
    expect(plannerRoot.querySelector('[aria-label^="Categoria:"]')).not.toBeNull();
    expect(plannerRoot.querySelector('[title]')).not.toBeNull();

    toggle.click();
    const sameToggle = plannerRoot.querySelector<HTMLButtonElement>('[data-action="tree-toggle"]')!;
    expect(sameToggle.getAttribute('aria-expanded')).toBe('false');
  });
});
