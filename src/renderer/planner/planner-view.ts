import {
  createCompletionCredit,
  reverseCompletionCredit,
} from '../../domain/completion-service';
import type {
  ConsolidatedNeed,
  PlanDiagnostic,
  PlanEstimate,
  PlanNode,
  PlanningSource,
} from '../../domain/planning-result';
import { formatDuration } from '../../shared/duration-formatter';
import type { AppData, Goal } from '../../shared/domain';
import { button, clear, element, labelledInput } from '../components/dom';
import type { Dispatch, ViewModule } from '../components/view-module';
import type { AppAction, AppState } from '../store/app-store';

const CONSOLIDATED_WINDOW = 100;
const GOAL_DRAFT_KEY = 'planner:goal';

type GoalDraft = Readonly<{
  goalId?: string;
  productId: string;
  quantity: string;
}>;

const CATEGORY_LABELS: Record<PlanNode['category'], string> = {
  item: 'Item',
  recipe: 'Receita',
  smelting: 'Fundição',
  unknown: 'Não resolvido',
};

const DIAGNOSTIC_LABELS: Record<PlanDiagnostic['code'], string> = {
  invalid_objective: 'Objetivo indisponível',
  stale_entity: 'Entidade não encontrada',
  invalid_component: 'Componente inválido',
  quantity_overflow: 'Quantidade acima do limite seguro',
  cycle: 'Ciclo de produção detectado',
  invalid_duration: 'Duração de fundição inválida',
  source_required: 'Selecione uma origem',
  source_unresolved: 'Origem não resolvida',
  rate_required: 'Informe a taxa necessária',
  invalid_rate: 'Taxa inválida',
  calculation_limit: 'Limite de cálculo atingido',
  consolidation_overflow: 'Total consolidado acima do limite seguro',
};

const safeInteger = (value: string, allowZero: boolean): number | undefined => {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) return undefined;
  return parsed;
};

const finiteNonnegative = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const operationId = (prefix: string): string => `${prefix}:${crypto.randomUUID()}`;
const fullNumber = (value: number): string => Number.isInteger(value)
  ? String(value)
  : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(value);

const appendBadge = (parent: HTMLElement, category: PlanNode['category']): void => {
  parent.append(element('span', {
    className: `planner-badge planner-badge-${category}`,
    text: CATEGORY_LABELS[category],
    attributes: { 'aria-label': `Categoria: ${CATEGORY_LABELS[category]}` },
  }));
};

const sourceKindLabel = (source: PlanningSource): string =>
  source.kind === 'gather' ? 'Recurso'
    : source.kind === 'monster' ? 'Monstro' : 'Chefe';

const sourceBadge = (source: PlanningSource): HTMLElement => element('span', {
  className: `planner-badge planner-badge-source-${source.kind}`,
  text: sourceKindLabel(source),
  attributes: { 'aria-label': `Categoria da origem: ${sourceKindLabel(source)}` },
});

const sourceSummary = (node: Pick<PlanNode, 'source'>): HTMLElement | undefined => {
  if (!node.source) return undefined;
  const root = element('div', { className: 'planner-source-summary' });
  if (node.source.selected) {
    root.append(
      sourceBadge(node.source.selected),
      element('span', {
        text: `Origem: ${node.source.selected.name} · Ato ${node.source.selected.act}`,
        attributes: { title: node.source.selected.name },
      }),
    );
  } else {
    root.append(element('strong', {
      text: node.source.status === 'selection_required'
        ? 'Origem: seleção necessária'
        : 'Origem: não disponível',
    }));
  }
  return root;
};

const quantity = (label: string, value: number, className = ''): HTMLElement =>
  element('span', {
    className: `planner-quantity ${className}`.trim(),
    text: `${label}: ${fullNumber(value)}`,
    attributes: { title: `${label}: ${String(value)}` },
  });

export const plannerStatus = (
  missing: number,
  diagnostics: readonly PlanDiagnostic[],
): Readonly<{ key: 'unresolved' | 'complete' | 'remaining'; label: string }> => {
  if (diagnostics.length > 0) return { key: 'unresolved', label: 'Não resolvido' };
  if (missing === 0) return { key: 'complete', label: 'Completo' };
  return { key: 'remaining', label: 'Restante' };
};

const estimateResult = (
  estimate: PlanEstimate | undefined,
  category: PlanNode['category'],
): HTMLElement => {
  const root = element('div', { className: 'planner-estimate' });
  if (!estimate) {
    if (category === 'recipe') {
      root.append(element('span', { text: 'Produção detalhada nos componentes.' }));
      return root;
    }
    root.append(
      element('strong', { text: 'Não calculável' }),
      element('span', { text: 'Informe uma origem e as taxas necessárias.' }),
    );
    return root;
  }
  if (estimate.kind === 'boss') {
    root.append(
      element('strong', {
        text: `Lutas estimadas: ${fullNumber(estimate.expectedFights)}`,
        attributes: { title: String(estimate.expectedFights) },
      }),
      element('span', { text: 'Média esperada, não é garantia.' }),
    );
    return root;
  }
  if (estimate.kind === 'smelting') {
    root.append(
      element('strong', {
        text: `Tempo de fundição: ${formatDuration(estimate.seconds)}`,
        attributes: { title: `${estimate.seconds} segundos` },
      }),
    );
    return root;
  }
  root.append(
    element('strong', {
      text: `Tempo estimado: ${formatDuration(estimate.hours * 3_600)}`,
      attributes: { title: `${estimate.hours} horas` },
    }),
  );
  if (estimate.kind === 'monster') {
    root.append(element('span', { text: 'Média esperada, não é garantia.' }));
  }
  return root;
};

const diagnosticList = (diagnostics: readonly PlanDiagnostic[]): HTMLElement | undefined => {
  if (diagnostics.length === 0) return undefined;
  const list = element('ul', {
    className: 'planner-diagnostics',
    attributes: { 'aria-label': 'Diagnósticos desta ramificação' },
  });
  for (const diagnostic of diagnostics) {
    const cycle = diagnostic.cycle?.length ? `: ${diagnostic.cycle.join(' → ')}` : '';
    list.append(element('li', {
      text: `${DIAGNOSTIC_LABELS[diagnostic.code]}${cycle}`,
      attributes: { 'data-diagnostic': diagnostic.code },
    }));
  }
  return list;
};

const normalizeGoals = (goals: readonly Goal[]): Goal[] =>
  [...goals]
    .sort((left, right) => left.priority - right.priority)
    .map((goal, priority) => ({ ...goal, priority }));

export class PlannerView implements ViewModule<AppState, AppAction> {
  private root?: HTMLElement;
  private dispatch?: Dispatch<AppAction>;
  private state?: Readonly<AppState>;
  private search = '';
  private expandedPaths = new Set<string>();
  private readonly initializedRoots = new Set<string>();
  private editingGoalId?: string;
  private readonly completionOperations = new Map<string, string>();

  private readonly onClick = (event: Event): void => {
    const control = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    const action = control?.dataset.action;
    if (!action || !this.state) return;
    if (action === 'planner-view') {
      const view = control.dataset.view === 'consolidated' ? 'consolidated' : 'objectives';
      this.persistGoalDraft();
      void this.dispatch?.({ type: 'set-planner-view', view });
      return;
    }
    if (action === 'goal-create') {
      this.editingGoalId = undefined;
      this.openGoalEditor();
      return;
    }
    if (action === 'goal-edit') {
      this.editingGoalId = control.dataset.goalId;
      this.openGoalEditor();
      return;
    }
    if (action === 'goal-cancel') {
      this.editingGoalId = undefined;
      void this.dispatch?.({ type: 'discard-draft', key: GOAL_DRAFT_KEY });
      this.render(this.state, true);
      return;
    }
    if (action === 'goal-remove') {
      this.removeGoal(control.dataset.goalId);
      return;
    }
    if (action === 'goal-toggle') {
      this.toggleGoal(control.dataset.goalId);
      return;
    }
    if (action === 'goal-move') {
      this.moveGoal(control.dataset.goalId, control.dataset.direction === 'up' ? -1 : 1);
      return;
    }
    if (action === 'tree-toggle') {
      const pathId = control.dataset.pathId;
      if (!pathId) return;
      if (this.expandedPaths.has(pathId)) this.expandedPaths.delete(pathId);
      else this.expandedPaths.add(pathId);
      this.render(this.state, true);
      queueMicrotask(() => this.root?.querySelector<HTMLElement>(
        `[data-action="tree-toggle"][data-path-id="${CSS.escape(pathId)}"]`,
      )?.focus());
      return;
    }
    if (action === 'need-complete') {
      this.completeNeed(control.dataset.entityId);
      return;
    }
    if (action === 'credit-undo') {
      this.undoCredit(control.dataset.creditId);
    }
  };

  private readonly onSubmit = (event: SubmitEvent): void => {
    const form = event.target as HTMLFormElement;
    if (!form.matches('[data-role="goal-form"]')) return;
    event.preventDefault();
    this.saveGoal(form);
  };

  private readonly onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.role !== 'consolidated-search') return;
    this.search = input.value;
    if (this.state) this.render(this.state, true);
    queueMicrotask(() => {
      const search = this.root?.querySelector<HTMLInputElement>('[data-role="consolidated-search"]');
      if (search) {
        search.focus();
        search.setSelectionRange(this.search.length, this.search.length);
      }
    });
  };

  private readonly onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.dataset.role === 'loot-quantity') {
      const value = finiteNonnegative(input.value);
      if (value === undefined) return this.invalidInput('Loot Quantity deve ser um número não negativo.');
      this.mutate('loot', (next) => { next.planning.lootQuantity = value; });
      return;
    }
    const entityId = input.dataset.entityId;
    if (input.dataset.role === 'stock' && entityId) {
      const value = safeInteger(input.value, true);
      if (value === undefined) return this.invalidInput('Estoque deve ser um inteiro não negativo.');
      this.mutate(`stock:${entityId}`, (next) => { next.planning.stock[entityId] = value; });
      return;
    }
    if (input.dataset.role === 'source' && entityId) {
      this.mutate(`source:${entityId}`, (next) => {
        if (input.value) next.planning.selectedSources[entityId] = input.value;
        else delete next.planning.selectedSources[entityId];
      });
      return;
    }
    const sourceId = input.dataset.sourceId;
    if (input.dataset.role === 'gather-rate' && sourceId) {
      const value = finiteNonnegative(input.value);
      if (value === undefined) return this.invalidInput('Taxa de coleta deve ser um número não negativo.');
      this.mutate(`gather-rate:${sourceId}`, (next) => { next.planning.gatherRates[sourceId] = value; });
      return;
    }
    if (input.dataset.role === 'kill-rate' && sourceId) {
      const value = finiteNonnegative(input.value);
      if (value === undefined) return this.invalidInput('Abates por hora deve ser um número não negativo.');
      this.mutate(`kill-rate:${sourceId}`, (next) => { next.planning.killRates[sourceId] = value; });
    }
  };

  mount(root: HTMLElement, dispatch: Dispatch<AppAction>): void {
    this.unmount();
    this.root = root;
    this.dispatch = dispatch;
    root.addEventListener('click', this.onClick);
    root.addEventListener('submit', this.onSubmit);
    root.addEventListener('input', this.onInput);
    root.addEventListener('change', this.onChange);
  }

  render(state: Readonly<AppState>, force = false): void {
    if (!this.root || state.page !== 'planner') return;
    if (!force && this.state === state) return;
    this.state = state;
    for (const [operation, entityId] of this.completionOperations) {
      const status = state.operations[operation];
      if (status && status !== 'in_flight') this.completionOperations.delete(operation);
      if (!status && !state.candidate) this.completionOperations.delete(operation);
      void entityId;
    }
    clear(this.root);
    const data = state.candidate ?? state.committed?.data;
    if (!data || !state.planning) {
      this.root.append(element('p', {
        className: 'panel empty state-unresolved',
        text: 'Carregando o planejamento local…',
        attributes: { role: 'status' },
      }));
      return;
    }
    this.root.append(this.renderHeader(data, state), this.renderObjectiveList(data));
    if (this.editingGoalId !== undefined || this.root.dataset.creatingGoal === 'true') {
      this.root.append(this.renderGoalEditor(data));
    }
    const view = element('section', {
      className: 'planner-workspace panel',
      attributes: {
        'aria-label': state.plannerView === 'objectives'
          ? 'Árvores dos objetivos' : 'Trabalho consolidado',
      },
    });
    if (state.plannerView === 'objectives') view.append(this.renderTrees(state));
    else view.append(this.renderConsolidated(data, state));
    this.root.append(view);
  }

  unmount(): void {
    this.root?.removeEventListener('click', this.onClick);
    this.root?.removeEventListener('submit', this.onSubmit);
    this.root?.removeEventListener('input', this.onInput);
    this.root?.removeEventListener('change', this.onChange);
    if (this.root) clear(this.root);
    this.root = undefined;
    this.dispatch = undefined;
    this.state = undefined;
  }

  private renderHeader(data: Readonly<AppData>, state: Readonly<AppState>): HTMLElement {
    const header = element('section', {
      className: 'planner-header panel',
      attributes: { 'aria-labelledby': 'planner-heading' },
    });
    const intro = element('div');
    intro.append(
      element('p', { className: 'eyebrow', text: 'PLANEJADOR' }),
      element('h2', { text: 'Plano de produção', attributes: { id: 'planner-heading' } }),
      element('p', {
        className: 'planner-summary',
        text: `${data.planning.goals.filter((goal) => !goal.completed).length} objetivos pendentes · `
          + `${state.planning?.nodeCount ?? 0} nós calculados`,
      }),
    );
    const controls = element('div', {
      className: 'planner-global-controls',
      attributes: { 'aria-label': 'Controles globais do plano' },
    });
    const loot = labelledInput(
      'Loot Quantity (%)',
      'lootQuantity',
      String(data.planning.lootQuantity),
      'number',
    );
    const lootInput = loot.querySelector('input')!;
    lootInput.id = 'loot-quantity';
    lootInput.dataset.role = 'loot-quantity';
    lootInput.min = '0';
    lootInput.step = 'any';
    controls.append(loot);
    header.append(intro, controls);

    const tabs = element('div', {
      className: 'planner-tabs',
      attributes: { role: 'tablist', 'aria-label': 'Visualização do planejamento' },
    });
    for (const view of ['objectives', 'consolidated'] as const) {
      const selected = state.plannerView === view;
      const tab = button(
        view === 'objectives' ? 'Árvores por objetivo' : 'Trabalho consolidado',
        'planner-view',
        `button planner-tab${selected ? ' active' : ''}`,
      );
      tab.dataset.view = view;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tabs.append(tab);
    }
    header.append(tabs);
    return header;
  }

  private renderObjectiveList(data: Readonly<AppData>): HTMLElement {
    const section = element('section', {
      className: 'objective-section panel',
      attributes: { 'aria-labelledby': 'objective-list-title' },
    });
    const toolbar = element('div', { className: 'toolbar' });
    const title = element('div');
    title.append(
      element('h2', { text: 'Objetivos em prioridade', attributes: { id: 'objective-list-title' } }),
      element('p', { text: 'O primeiro objetivo recebe o estoque disponível antes dos seguintes.' }),
    );
    toolbar.append(title, button('Adicionar objetivo', 'goal-create', 'button primary'));
    section.append(toolbar);
    const goals = normalizeGoals(data.planning.goals);
    if (goals.length === 0) {
      section.append(this.emptyState(
        'Nenhum objetivo',
        'Crie um objetivo de receita para iniciar as árvores e o trabalho consolidado.',
        'empty',
      ));
      return section;
    }
    const list = element('ol', { className: 'objective-list' });
    goals.forEach((goal, index) => {
      const product = data.catalog.products.find((candidate) => candidate.id === goal.productId);
      const row = element('li', {
        className: `objective-row ${goal.completed ? 'is-complete' : 'is-remaining'}`,
        attributes: {
          'data-goal-id': goal.id,
          'aria-label': `Prioridade ${index + 1}: ${product?.name ?? 'Objetivo indisponível'}`,
        },
      });
      const summary = element('div', { className: 'objective-summary' });
      summary.append(
        element('span', { className: 'priority-shape', text: String(index + 1), attributes: { 'aria-hidden': 'true' } }),
        element('strong', {
          text: product?.name ?? 'Objetivo indisponível',
          attributes: { title: product?.name ?? goal.productId },
        }),
        quantity('Quantidade', goal.quantity),
        element('span', {
          className: `status-cue state-${goal.completed ? 'complete' : 'remaining'}`,
          text: goal.completed ? '✓ Concluído' : '○ Pendente',
        }),
      );
      const actions = element('div', { className: 'objective-actions' });
      const up = button('Mover para cima', 'goal-move');
      up.dataset.goalId = goal.id;
      up.dataset.direction = 'up';
      up.disabled = index === 0;
      const down = button('Mover para baixo', 'goal-move');
      down.dataset.goalId = goal.id;
      down.dataset.direction = 'down';
      down.disabled = index === goals.length - 1;
      const edit = button('Editar', 'goal-edit');
      edit.dataset.goalId = goal.id;
      const toggle = button(goal.completed ? 'Restaurar' : 'Concluir', 'goal-toggle');
      toggle.dataset.goalId = goal.id;
      const remove = button('Remover', 'goal-remove', 'button danger');
      remove.dataset.goalId = goal.id;
      actions.append(up, down, edit, toggle, remove);
      row.append(summary, actions);
      list.append(row);
    });
    section.append(list);
    return section;
  }

  private renderGoalEditor(data: Readonly<AppData>): HTMLElement {
    const goal = this.editingGoalId
      ? data.planning.goals.find((candidate) => candidate.id === this.editingGoalId)
      : undefined;
    const storedDraft = this.state?.drafts[GOAL_DRAFT_KEY] as GoalDraft | undefined;
    const draft = storedDraft && storedDraft.goalId === this.editingGoalId
      ? storedDraft : undefined;
    const form = element('form', {
      className: 'goal-editor panel',
      attributes: {
        'data-role': 'goal-form',
        'aria-label': goal ? 'Editar objetivo' : 'Adicionar objetivo',
      },
    });
    form.append(element('h2', { text: goal ? 'Editar objetivo' : 'Adicionar objetivo' }));
    const productLabel = element('label', { text: 'Receita objetivo' });
    const select = element('select', {
      attributes: { name: 'productId', required: 'true' },
    });
    select.append(element('option', { text: 'Selecione uma receita', attributes: { value: '' } }));
    for (const product of data.catalog.products.filter((candidate) => candidate.kind === 'recipe')) {
      const option = element('option', {
        text: product.name,
        attributes: { value: product.id, title: product.name },
      });
      option.selected = product.id === (draft?.productId ?? goal?.productId);
      select.append(option);
    }
    productLabel.append(select);
    const quantityLabel = labelledInput(
      'Quantidade desejada',
      'quantity',
      draft?.quantity ?? String(goal?.quantity ?? 1),
      'number',
    );
    const quantityInput = quantityLabel.querySelector('input')!;
    quantityInput.min = '1';
    quantityInput.step = '1';
    quantityInput.required = true;
    const actions = element('div', { className: 'dialog-actions' });
    actions.append(
      button('Cancelar', 'goal-cancel'),
      element('button', {
        className: 'button primary',
        text: 'Salvar objetivo',
        attributes: { type: 'submit' },
      }),
    );
    form.append(productLabel, quantityLabel, actions);
    return form;
  }

  private renderTrees(state: Readonly<AppState>): HTMLElement {
    const result = state.planning!;
    if (result.objectives.length === 0) {
      return this.emptyState(
        'Nenhuma árvore pendente',
        'Adicione ou restaure um objetivo para visualizar sua cadeia causal.',
        'empty',
      );
    }
    const section = element('div', { className: 'tree-objectives' });
    for (const objective of result.objectives) {
      const article = element('article', {
        className: 'objective-tree',
        attributes: { 'aria-labelledby': `tree-title-${objective.objectiveId}` },
      });
      article.append(element('h3', {
        text: objective.root?.name ?? 'Objetivo não resolvido',
        attributes: {
          id: `tree-title-${objective.objectiveId}`,
          title: objective.root?.name ?? objective.productId,
        },
      }));
      const objectiveDiagnostics = diagnosticList(objective.diagnostics);
      if (objectiveDiagnostics) article.append(objectiveDiagnostics);
      if (objective.root) {
        if (!this.initializedRoots.has(objective.root.pathId)) {
          this.initializedRoots.add(objective.root.pathId);
          this.expandedPaths.add(objective.root.pathId);
        }
        const list = element('ul', { className: 'planner-tree', attributes: { role: 'list' } });
        list.append(this.renderTreeNode(objective.root));
        article.append(list);
      }
      section.append(article);
    }
    return section;
  }

  private renderTreeNode(node: PlanNode): HTMLLIElement {
    const state = plannerStatus(node.missing, node.diagnostics);
    const row = element('li', {
      className: `tree-node state-${state.key}`,
      attributes: {
        'data-path-id': node.pathId,
        'data-entity-id': node.entityId,
      },
    });
    const card = element('div', { className: 'tree-node-card' });
    const heading = element('div', { className: 'tree-node-heading' });
    if (node.children.length > 0) {
      const expanded = this.expandedPaths.has(node.pathId);
      const toggle = button(expanded ? 'Recolher ramificação' : 'Expandir ramificação', 'tree-toggle', 'tree-toggle');
      toggle.dataset.pathId = node.pathId;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-controls', `children-${node.pathId.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
      heading.append(toggle);
    }
    heading.append(
      element('strong', { text: node.name, attributes: { title: node.name } }),
      element('span', { className: `status-cue state-${state.key}`, text: state.label }),
    );
    appendBadge(heading, node.category);
    const values = element('div', { className: 'planner-values' });
    values.append(
      quantity('Necessário', node.required),
      quantity('Do estoque', node.allocated),
      quantity('Faltante', node.missing, node.missing > 0 ? 'quantity-missing' : ''),
    );
    card.append(heading, values);
    const source = sourceSummary(node);
    if (source) card.append(source);
    card.append(estimateResult(node.estimate, node.category));
    const diagnostics = diagnosticList(node.diagnostics);
    if (diagnostics) card.append(diagnostics);
    row.append(card);
    const expanded = this.expandedPaths.has(node.pathId);
    if (node.children.length > 0 && expanded) {
      const children = element('ul', {
        className: 'planner-tree',
        attributes: {
          id: `children-${node.pathId.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
          role: 'list',
        },
      });
      for (const child of node.children) children.append(this.renderTreeNode(child));
      row.append(children);
    }
    return row;
  }

  private renderConsolidated(data: Readonly<AppData>, state: Readonly<AppState>): HTMLElement {
    const section = element('div', { className: 'consolidated-view' });
    const searchLabel = labelledInput(
      'Buscar no trabalho consolidado',
      'consolidatedSearch',
      this.search,
      'search',
    );
    searchLabel.className = 'consolidated-search';
    searchLabel.querySelector('input')!.dataset.role = 'consolidated-search';
    const normalized = this.search.trim().toLocaleLowerCase('pt-BR');
    const filtered = state.planning!.consolidated.filter((need) =>
      need.name.toLocaleLowerCase('pt-BR').includes(normalized));
    const count = element('p', {
      className: 'consolidated-count',
      text: `${filtered.length} de ${state.planning!.consolidated.length} necessidades consolidadas`,
      attributes: { role: 'status', 'aria-live': 'polite' },
    });
    section.append(searchLabel, count);
    if (state.planning!.diagnostics.some((item) => item.code === 'calculation_limit')) {
      section.append(this.emptyState(
        'Limite de cálculo atingido',
        'Os resultados concluídos continuam visíveis; reduza o plano para expandir ramificações adicionais.',
        'limit',
      ));
    }
    if (filtered.length === 0) {
      section.append(this.emptyState(
        state.planning!.consolidated.length === 0 ? 'Plano completo ou vazio' : 'Nenhum resultado',
        state.planning!.consolidated.length === 0
          ? 'Não há necessidades pendentes para consolidar.'
          : 'A busca não corresponde a nenhuma necessidade.',
        state.planning!.consolidated.length === 0 ? 'complete' : 'empty',
      ));
    } else {
      const list = element('div', {
        className: 'consolidated-list',
        attributes: { role: 'list', 'aria-label': 'Necessidades consolidadas' },
      });
      for (const need of filtered.slice(0, CONSOLIDATED_WINDOW)) {
        list.append(this.renderNeed(data, state, need));
      }
      section.append(list);
      if (filtered.length > CONSOLIDATED_WINDOW) {
        section.append(element('p', {
          className: 'window-notice',
          text: `Mostrando os primeiros ${CONSOLIDATED_WINDOW}. Use a busca para acessar todos os ${filtered.length} resultados.`,
          attributes: { role: 'note' },
        }));
      }
    }
    section.append(this.renderCredits(data, state));
    return section;
  }

  private renderNeed(
    data: Readonly<AppData>,
    state: Readonly<AppState>,
    need: ConsolidatedNeed,
  ): HTMLElement {
    const status = plannerStatus(need.missing, need.diagnostics);
    const row = element('article', {
      className: `consolidated-row state-${status.key}`,
      attributes: {
        role: 'listitem',
        'data-entity-id': need.entityId,
        'aria-label': `${need.name}: ${status.label}`,
      },
    });
    const heading = element('div', { className: 'consolidated-heading' });
    heading.append(
      element('h3', { text: need.name, attributes: { title: need.name } }),
      element('span', { className: `status-cue state-${status.key}`, text: status.label }),
    );
    appendBadge(heading, need.category);
    const values = element('div', { className: 'planner-values' });
    values.append(
      quantity('Necessário', need.required),
      quantity('Do estoque', need.allocated),
      quantity('Faltante', need.missing, need.missing > 0 ? 'quantity-missing' : ''),
    );
    const controls = element('div', { className: 'need-controls' });
    controls.append(this.stockControl(data, need.entityId));
    if (need.source) controls.append(this.sourceControl(data, need));
    const complete = button(
      need.missing === 0 ? 'Necessidade completa' : 'Creditar como adquirido',
      'need-complete',
      'button primary',
    );
    complete.dataset.entityId = need.entityId;
    complete.disabled = need.missing === 0
      || [...this.completionOperations.entries()].some(([id, value]) =>
        value === need.entityId && state.operations[id] !== 'failed');
    controls.append(complete);
    row.append(heading, values, estimateResult(need.estimate, need.category), controls);
    const contributors = element('p', {
      className: 'contributors',
      text: `${need.contributors.length} caminho(s) causal(is)`,
      attributes: {
        title: need.contributors.map((item) => `${item.objectiveId} · ${item.pathId}`).join('\n'),
      },
    });
    row.append(contributors);
    const diagnostics = diagnosticList(need.diagnostics);
    if (diagnostics) row.append(diagnostics);
    return row;
  }

  private stockControl(data: Readonly<AppData>, entityId: string): HTMLLabelElement {
    const label = labelledInput(
      'Estoque global',
      `stock-${entityId}`,
      String(data.planning.stock[entityId] ?? 0),
      'number',
    );
    const input = label.querySelector('input')!;
    input.dataset.role = 'stock';
    input.dataset.entityId = entityId;
    input.min = '0';
    input.step = '1';
    return label;
  }

  private sourceControl(data: Readonly<AppData>, need: ConsolidatedNeed): HTMLElement {
    const group = element('div', {
      className: 'source-controls',
      attributes: { role: 'group', 'aria-label': `Origem de ${need.name}` },
    });
    const label = element('label', { text: 'Origem ativa' });
    const select = element('select', {
      attributes: { name: `source-${need.entityId}` },
    });
    select.dataset.role = 'source';
    select.dataset.entityId = need.entityId;
    select.append(element('option', { text: 'Selecione uma origem', attributes: { value: '' } }));
    for (const origin of need.source!.origins) {
      const option = element('option', {
        text: this.sourceLabel(origin),
        attributes: { value: origin.id },
      });
      option.selected = origin.id === need.source!.selected?.id;
      select.append(option);
    }
    label.append(select);
    group.append(label);
    const selected = need.source!.selected;
    if (selected) group.prepend(sourceBadge(selected));
    if (selected?.kind === 'gather') {
      const rate = labelledInput(
        'Coletas por hora',
        `gather-${selected.id}`,
        data.planning.gatherRates[selected.id] === undefined
          ? '' : String(data.planning.gatherRates[selected.id]),
        'number',
      );
      const input = rate.querySelector('input')!;
      input.dataset.role = 'gather-rate';
      input.dataset.sourceId = selected.id;
      input.min = '0';
      input.step = 'any';
      group.append(rate);
    }
    if (selected?.kind === 'monster') {
      const rate = labelledInput(
        'Abates por hora',
        `kills-${selected.id}`,
        data.planning.killRates[selected.id] === undefined
          ? '' : String(data.planning.killRates[selected.id]),
        'number',
      );
      const input = rate.querySelector('input')!;
      input.dataset.role = 'kill-rate';
      input.dataset.sourceId = selected.id;
      input.min = '0';
      input.step = 'any';
      group.append(rate);
    }
    return group;
  }

  private sourceLabel(source: PlanningSource): string {
    const rate = source.numerator !== undefined && source.denominator !== undefined
      ? ` · ${source.numerator} em ${source.denominator}` : '';
    const kind = sourceKindLabel(source);
    return source.kind === 'gather'
      ? `${kind}: ${source.name}${rate}`
      : `${kind}: ${source.name} · Ato ${source.act}${rate}`;
  }

  private renderCredits(data: Readonly<AppData>, state: Readonly<AppState>): HTMLElement {
    const section = element('section', {
      className: 'credit-history',
      attributes: { 'aria-labelledby': 'credit-history-title' },
    });
    section.append(element('h3', {
      text: 'Créditos de conclusão',
      attributes: { id: 'credit-history-title' },
    }));
    const active = data.planning.completionCredits.filter((credit) => credit.reversedAt === undefined);
    if (active.length === 0) {
      section.append(element('p', { className: 'state-empty', text: 'Nenhum crédito ativo.' }));
      return section;
    }
    const list = element('ul', { className: 'credit-list' });
    for (const credit of active) {
      const entity = data.catalog.items.find((item) => item.id === credit.entityId)
        ?? data.catalog.products.find((product) => product.id === credit.entityId);
      const row = element('li');
      const undo = button('Desfazer crédito exato', 'credit-undo');
      undo.dataset.creditId = credit.id;
      undo.disabled = state.operations[`undo:${credit.id}`] === 'in_flight';
      row.append(
        element('span', {
          text: `${entity?.name ?? credit.entityId}: +${credit.quantity}`,
          attributes: { title: `${entity?.name ?? credit.entityId}: ${credit.quantity}` },
        }),
        undo,
      );
      list.append(row);
    }
    section.append(list);
    return section;
  }

  private emptyState(
    title: string,
    message: string,
    state: 'empty' | 'complete' | 'limit',
  ): HTMLElement {
    const root = element('div', {
      className: `planner-state state-${state}`,
      attributes: { role: 'status' },
    });
    root.append(element('h3', { text: title }), element('p', { text: message }));
    return root;
  }

  private openGoalEditor(): void {
    if (!this.root || !this.state) return;
    const data = this.state.candidate ?? this.state.committed?.data;
    const goal = this.editingGoalId
      ? data?.planning.goals.find((candidate) => candidate.id === this.editingGoalId)
      : undefined;
    void this.dispatch?.({
      type: 'set-draft',
      key: GOAL_DRAFT_KEY,
      value: {
        ...(this.editingGoalId ? { goalId: this.editingGoalId } : {}),
        productId: goal?.productId ?? '',
        quantity: String(goal?.quantity ?? 1),
      } satisfies GoalDraft,
    });
    this.root.dataset.creatingGoal = this.editingGoalId ? 'false' : 'true';
    this.render(this.state, true);
    queueMicrotask(() => this.root?.querySelector<HTMLElement>('[data-role="goal-form"] select')?.focus());
  }

  private persistGoalDraft(): void {
    const form = this.root?.querySelector<HTMLFormElement>('[data-role="goal-form"]');
    if (!form) return;
    const values = new FormData(form);
    void this.dispatch?.({
      type: 'set-draft',
      key: GOAL_DRAFT_KEY,
      value: {
        ...(this.editingGoalId ? { goalId: this.editingGoalId } : {}),
        productId: String(values.get('productId') ?? ''),
        quantity: String(values.get('quantity') ?? ''),
      } satisfies GoalDraft,
    });
  }

  private saveGoal(form: HTMLFormElement): void {
    const data = this.state?.candidate ?? this.state?.committed?.data;
    if (!data) return;
    const productId = String(new FormData(form).get('productId') ?? '');
    const parsedQuantity = safeInteger(String(new FormData(form).get('quantity') ?? ''), false);
    const recipe = data.catalog.products.find((product) =>
      product.id === productId && product.kind === 'recipe');
    if (!recipe || parsedQuantity === undefined) {
      this.invalidInput('Selecione uma receita e informe uma quantidade inteira positiva.');
      return;
    }
    const goalId = this.editingGoalId;
    this.mutate(goalId ? `goal-edit:${goalId}` : 'goal-create', (next) => {
      const goals = normalizeGoals(next.planning.goals);
      if (goalId) {
        const goal = goals.find((candidate) => candidate.id === goalId);
        if (!goal) throw new Error('stale goal');
        goal.productId = productId;
        goal.quantity = parsedQuantity;
      } else {
        goals.push({
          id: crypto.randomUUID(),
          productId,
          quantity: parsedQuantity,
          completed: false,
          priority: goals.length,
        });
      }
      next.planning.goals = normalizeGoals(goals);
    });
    this.editingGoalId = undefined;
    if (this.root) delete this.root.dataset.creatingGoal;
    void this.dispatch?.({ type: 'discard-draft', key: GOAL_DRAFT_KEY });
  }

  private removeGoal(goalId: string | undefined): void {
    if (!goalId) return;
    this.mutate(`goal-remove:${goalId}`, (next) => {
      next.planning.goals = normalizeGoals(next.planning.goals.filter((goal) => goal.id !== goalId));
    });
  }

  private toggleGoal(goalId: string | undefined): void {
    if (!goalId) return;
    this.mutate(`goal-toggle:${goalId}`, (next) => {
      const goals = normalizeGoals(next.planning.goals);
      const goal = goals.find((candidate) => candidate.id === goalId);
      if (!goal) throw new Error('stale goal');
      goal.completed = !goal.completed;
      next.planning.goals = goals;
    });
  }

  private moveGoal(goalId: string | undefined, offset: -1 | 1): void {
    if (!goalId) return;
    this.mutate(`goal-move:${goalId}:${offset}`, (next) => {
      const goals = normalizeGoals(next.planning.goals);
      const index = goals.findIndex((goal) => goal.id === goalId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= goals.length) return;
      [goals[index], goals[target]] = [goals[target], goals[index]];
      next.planning.goals = goals.map((goal, priority) => ({ ...goal, priority }));
    });
  }

  private completeNeed(entityId: string | undefined): void {
    const data = this.state?.candidate ?? this.state?.committed?.data;
    const need = this.state?.planning?.consolidated.find((candidate) => candidate.entityId === entityId);
    if (!data || !need || need.missing <= 0) return;
    if ([...this.completionOperations.values()].includes(need.entityId)) return;
    const id = crypto.randomUUID();
    const result = createCompletionCredit(data, {
      operationId: id,
      entityId: need.entityId,
      missing: need.missing,
      createdAt: new Date().toISOString(),
    });
    if (!result.ok) {
      this.invalidInput(`Não foi possível creditar a necessidade: ${result.error.code}.`);
      return;
    }
    this.completionOperations.set(id, need.entityId);
    void this.dispatch?.({
      type: 'mutate-and-save',
      operationId: id,
      update: () => result.value.data,
    });
  }

  private undoCredit(creditId: string | undefined): void {
    const data = this.state?.candidate ?? this.state?.committed?.data;
    if (!data || !creditId) return;
    const result = reverseCompletionCredit(data, {
      creditId,
      reversedAt: new Date().toISOString(),
    });
    if (!result.ok) {
      const message = result.error.code === 'insufficient_stock'
        ? 'Não é possível desfazer: o estoque atual é menor que o crédito original.'
        : `Não foi possível desfazer o crédito: ${result.error.code}.`;
      this.invalidInput(message);
      return;
    }
    void this.dispatch?.({
      type: 'mutate-and-save',
      operationId: `undo:${creditId}`,
      update: () => result.value.data,
    });
  }

  private mutate(prefix: string, change: (candidate: AppData) => void): void {
    void this.dispatch?.({
      type: 'mutate-and-save',
      operationId: operationId(prefix),
      update: (current) => {
        const next = structuredClone(current);
        change(next);
        return next;
      },
    });
  }

  private invalidInput(message: string): void {
    void this.dispatch?.({ type: 'add-notice', kind: 'error', code: 'invalid_request', message });
  }
}
