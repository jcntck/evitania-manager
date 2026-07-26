import {
  CatalogService,
  type CatalogEntity,
  type CatalogFieldError,
  type CatalogMutation,
} from '../../domain/catalog-service';
import { formatDuration } from '../../shared/duration-formatter';
import type {
  Act,
  AppData,
  Component,
  Drop,
  Enemy,
  EntityCategory,
  Item,
  Product,
  Resource,
} from '../../shared/domain';
import type { DesktopApi } from '../../shared/desktop-api';
import type { AppAction, AppState } from '../store/app-store';
import { button, clear, element, labelledInput } from '../components/dom';
import { RelationPicker, type RelationPickerAction } from '../components/relation-picker';
import type { RelationRecord } from '../components/relation-search';
import { normalizeRelationText } from '../components/relation-search';
import type { Dispatch, ViewModule } from '../components/view-module';

const EDITOR_KEY = 'catalog:editor';
const CHILD_KEY = 'catalog:inline-child';
const LIST_RENDER_CAP = 200;
const CATEGORIES: readonly EntityCategory[] = [
  'recipes',
  'smelting',
  'bosses',
  'monsters',
  'resources',
  'items',
];

const LABELS: Readonly<Record<EntityCategory, string>> = {
  items: 'Itens',
  resources: 'Recursos',
  recipes: 'Receitas',
  smelting: 'Fundição',
  monsters: 'Monstros',
  bosses: 'Chefes',
};
const ENTITY_LABELS: Readonly<Record<EntityCategory, string>> = {
  items: 'item',
  resources: 'recurso',
  recipes: 'receita',
  smelting: 'fundição',
  monsters: 'monstro',
  bosses: 'chefe',
};

const DESCRIPTIONS: Readonly<Record<EntityCategory, string>> = {
  items: 'Materiais brutos compartilhados entre coleta, drops e produção.',
  resources: 'Origens coletáveis vinculadas a um item e ato.',
  recipes: 'Produtos fabricados e seus componentes.',
  smelting: 'Produtos processados, componentes e tempo por unidade.',
  monsters: 'Monstros, atos e taxas de drop.',
  bosses: 'Chefes, atos e taxas de drop.',
};

type DraftComponent = Readonly<{ entityId: string; quantity: unknown }>;
type DraftDrop = Readonly<{ itemId: string; numerator: unknown; denominator: unknown }>;

export type CatalogEditorDraft = Readonly<{
  key: string;
  operationId: string;
  category: EntityCategory;
  mode: 'create' | 'update';
  id: string;
  expectedEntity?: CatalogEntity;
  name: string;
  itemId: string;
  act: Act;
  image?: string;
  processingSeconds: unknown;
  components: readonly DraftComponent[];
  drops: readonly DraftDrop[];
  relationQuery: string;
  errors: readonly CatalogFieldError[];
  openerFocusToken: string;
}>;

const isDraft = (value: unknown): value is CatalogEditorDraft => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CatalogEditorDraft>;
  return typeof candidate.key === 'string'
    && typeof candidate.id === 'string'
    && CATEGORIES.includes(candidate.category as EntityCategory)
    && Array.isArray(candidate.components)
    && Array.isArray(candidate.drops);
};

const dataFor = (state: Readonly<AppState>): Readonly<AppData> | undefined =>
  state.candidate ?? state.committed?.data;

const collectionFor = (
  data: Readonly<AppData>,
  category: EntityCategory,
): readonly CatalogEntity[] => {
  if (category === 'items') return data.catalog.items;
  if (category === 'resources') return data.catalog.resources;
  if (category === 'monsters') return data.catalog.monsters;
  if (category === 'bosses') return data.catalog.bosses;
  const kind = category === 'recipes' ? 'recipe' : 'smelting';
  return data.catalog.products.filter((product) => product.kind === kind);
};

const entityName = (data: Readonly<AppData>, entity: CatalogEntity): string => {
  if ('name' in entity) return entity.name;
  return data.catalog.items.find((item) => item.id === entity.itemId)?.name ?? 'Item indisponível';
};

const fieldMessage = (error: CatalogFieldError): string => {
  const messages: Readonly<Record<CatalogFieldError['code'], string>> = {
    invalid_identifier: 'Identificador inválido.',
    invalid_name: 'Informe um nome entre 1 e 100 caracteres.',
    invalid_image: 'A referência da imagem não pertence a este módulo.',
    invalid_act: 'Selecione o Ato I, II ou III.',
    invalid_reference: 'Selecione um cadastro existente.',
    invalid_quantity: 'Use um número inteiro positivo e seguro.',
    invalid_duration: 'Use uma duração como 1m 30s, 1:30, 90 ou 90s.',
    duplicate_relation: 'Cada relacionamento pode aparecer somente uma vez.',
    invalid_product_kind: 'O tipo do produto não corresponde a esta seção.',
  };
  return messages[error.code];
};

const cloneDraft = (
  draft: CatalogEditorDraft,
  patch: Partial<CatalogEditorDraft>,
): CatalogEditorDraft => structuredClone({ ...draft, ...patch });

export class CatalogView implements ViewModule<AppState, AppAction> {
  private root?: HTMLElement;
  private dispatch?: Dispatch<AppAction>;
  private state?: Readonly<AppState>;
  private relationPicker?: RelationPicker;
  private childRelationPicker?: RelationPicker;
  private readonly service: CatalogService;
  private renderedPage?: EntityCategory;
  private renderedData?: Readonly<AppData>;
  private renderedDraftKey?: string;
  private renderedChildKey?: string;
  private renderedDraftStructure?: string;
  private renderedChildStructure?: string;
  private renderedListQuery?: string;
  private relationRecordsData?: Readonly<AppData>;
  private relationRecordsCategory?: EntityCategory;
  private relationRecords?: readonly RelationRecord[];

  constructor(
    private readonly desktop: DesktopApi,
    service = new CatalogService(),
  ) {
    this.service = service;
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'catalog-create') void this.openEditor();
    else if (action === 'catalog-edit') void this.openEditor(target.dataset.entityId);
    else if (action === 'catalog-delete') void this.deleteEntity(target.dataset.entityId ?? '');
    else if (action === 'catalog-cancel') void this.closeEditor();
    else if (action === 'catalog-save') void this.saveEditor();
    else if (action === 'catalog-image') void this.importImage();
    else if (action === 'catalog-image-remove') void this.updateDraft({ image: undefined });
    else if (action === 'relation-remove') this.removeRelation(target.dataset.entityId ?? '');
    else if (action === 'child-cancel') void this.closeChild();
    else if (action === 'child-save') void this.saveChild();
  };

  private readonly onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.dataset.role === 'catalog-search') {
      const category = this.state?.page;
      if (category && category !== 'planner' && category !== 'settings') {
        void this.dispatch?.({
          type: 'set-draft',
          key: `catalog:list-query:${category}`,
          value: input.value,
        });
      }
      return;
    }
    const inChild = Boolean(input.closest('.inline-child'));
    const draft = inChild ? this.childDraft() : this.editorDraft();
    if (!draft) return;
    if (input.dataset.componentQuantity) {
      const patch = {
        components: draft.components.map((component) =>
          component.entityId === input.dataset.componentQuantity
            ? { ...component, quantity: input.value }
            : component),
      };
      if (inChild) this.updateChild(patch);
      else this.updateDraft(patch);
      return;
    }
    if (!input.name) return;
    if (input.dataset.dropNumerator || input.dataset.dropDenominator) {
      const itemId = input.dataset.dropNumerator ?? input.dataset.dropDenominator ?? '';
      const patch = {
        drops: draft.drops.map((drop) => drop.itemId === itemId ? {
          ...drop,
          ...(input.dataset.dropNumerator ? { numerator: input.value } : {}),
          ...(input.dataset.dropDenominator ? { denominator: input.value } : {}),
        } : drop),
      };
      if (inChild) this.updateChild(patch);
      else this.updateDraft(patch);
      return;
    }
    const value = input.value;
    if (input.name === 'name') {
      if (inChild) this.updateChild({ name: value });
      else this.updateDraft({ name: value });
    } else if (input.name === 'act') {
      if (inChild) this.updateChild({ act: value as Act });
      else this.updateDraft({ act: value as Act });
    } else if (input.name === 'processingSeconds') {
      if (inChild) this.updateChild({ processingSeconds: value });
      else this.updateDraft({ processingSeconds: value });
    }
    else if (input.name === 'childName') this.updateChild({ name: value });
  };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.childDraft()) {
      event.preventDefault();
      void this.closeChild();
    } else if (this.editorDraft()) {
      event.preventDefault();
      void this.closeEditor();
    }
  };

  mount(root: HTMLElement, dispatch: Dispatch<AppAction>): void {
    this.unmount();
    this.root = root;
    this.dispatch = dispatch;
    root.addEventListener('click', this.onClick);
    root.addEventListener('input', this.onInput);
    root.addEventListener('change', this.onInput);
    root.addEventListener('keydown', this.onKeyDown);
  }

  render(state: Readonly<AppState>): void {
    if (!this.root) throw new Error('CatalogView must be mounted before render.');
    this.state = state;
    const data = dataFor(state);
    if (!data || state.page === 'planner' || state.page === 'settings') return;
    const draft = this.editorDraft();
    const child = this.childDraft();
    const listQuery = String(state.drafts[`catalog:list-query:${state.page}`] ?? '');
    const draftStructure = draft ? JSON.stringify({
      image: draft.image,
      itemId: draft.itemId,
      components: draft.components.map((component) => component.entityId),
      drops: draft.drops.map((drop) => drop.itemId),
      errors: draft.errors,
    }) : undefined;
    const childStructure = child ? JSON.stringify({
      category: child.category,
      components: child.components.map((component) => component.entityId),
      errors: child.errors,
    }) : undefined;
    const needsFullRender = this.renderedPage !== state.page
      || this.renderedData !== data
      || this.renderedDraftKey !== draft?.key
      || this.renderedChildKey !== child?.key
      || this.renderedDraftStructure !== draftStructure
      || this.renderedChildStructure !== childStructure
      || this.renderedListQuery !== listQuery
      || (!draft && Boolean(this.root.querySelector('[role="dialog"]')));
    if (!needsFullRender) {
      this.renderErrors(draft);
      this.applyFocus(state.focusToken);
      return;
    }
    this.renderedPage = state.page;
    this.renderedData = data;
    this.renderedDraftKey = draft?.key;
    this.renderedChildKey = child?.key;
    this.renderedDraftStructure = draftStructure;
    this.renderedChildStructure = childStructure;
    this.renderedListQuery = listQuery;
    clear(this.root);
    this.renderList(data, state.page, listQuery);
    if (draft) this.renderEditor(data, draft);
    if (child) this.renderChild(data, child);
    this.applyFocus(state.focusToken);
  }

  unmount(): void {
    this.relationPicker?.unmount();
    this.relationPicker = undefined;
    this.childRelationPicker?.unmount();
    this.childRelationPicker = undefined;
    if (this.root) {
      this.root.removeEventListener('click', this.onClick);
      this.root.removeEventListener('input', this.onInput);
      this.root.removeEventListener('change', this.onInput);
      this.root.removeEventListener('keydown', this.onKeyDown);
      clear(this.root);
    }
    this.root = undefined;
    this.dispatch = undefined;
    this.state = undefined;
  }

  private renderList(
    data: Readonly<AppData>,
    category: EntityCategory,
    query: string,
  ): void {
    if (!this.root) return;
    const toolbar = element('div', { className: 'toolbar catalog-toolbar' });
    toolbar.append(element('p', { text: DESCRIPTIONS[category] }));
    const create = button('+ Novo cadastro', 'catalog-create', 'button primary');
    create.dataset.focusToken = `catalog:${category}:create`;
    toolbar.append(create);
    this.root.append(toolbar);

    const searchLabel = element('label', {
      className: 'catalog-search',
      text: `Pesquisar em ${LABELS[category]}`,
    });
    const search = element('input', {
      attributes: {
        type: 'search',
        value: query,
        autocomplete: 'off',
      },
    });
    search.dataset.role = 'catalog-search';
    searchLabel.append(search);
    this.root.append(searchLabel);

    const normalizedQuery = normalizeRelationText(query);
    const matchingEntities = collectionFor(data, category).filter((entity) =>
      normalizeRelationText(entityName(data, entity)).includes(normalizedQuery));
    const entities = matchingEntities.slice(0, LIST_RENDER_CAP);
    if (entities.length === 0) {
      const hasCatalogEntities = collectionFor(data, category).length > 0;
      const empty = element('section', {
        className: 'panel empty',
        attributes: {
          'aria-label': hasCatalogEntities
            ? `Nenhum resultado em ${LABELS[category]}`
            : `Nenhum cadastro em ${LABELS[category]}`,
        },
      });
      empty.append(
        element('h2', {
          text: hasCatalogEntities
            ? 'Nenhum resultado encontrado'
            : `Nenhum cadastro em ${LABELS[category]}`,
        }),
        element('p', {
          text: hasCatalogEntities
            ? 'Tente outro termo de pesquisa.'
            : 'Crie o primeiro cadastro para começar.',
        }),
      );
      if (!hasCatalogEntities) empty.append(button('Criar cadastro', 'catalog-create', 'button primary'));
      this.root.append(empty);
      return;
    }
    const grid = element('div', {
      className: 'catalog-grid',
      attributes: { role: 'list', 'aria-label': LABELS[category] },
    });
    for (const entity of entities) grid.append(this.renderCard(data, category, entity));
    this.root.append(grid);
    if (matchingEntities.length > entities.length) {
      this.root.append(element('p', {
        className: 'catalog-result-count',
        text: `Mostrando ${entities.length} de ${matchingEntities.length} resultados. Refine a pesquisa para localizar outros cadastros.`,
        attributes: { role: 'status' },
      }));
    }
  }

  private renderCard(
    data: Readonly<AppData>,
    category: EntityCategory,
    entity: CatalogEntity,
  ): HTMLElement {
    const name = entityName(data, entity);
    const card = element('article', {
      className: `card catalog-card category-${category}`,
      attributes: { role: 'listitem' },
    });
    if (entity.image) {
      card.append(element('img', {
        className: 'card-image',
        attributes: { src: entity.image, alt: name },
      }));
    } else {
      card.append(element('div', {
        className: 'card-placeholder',
        text: 'Sem imagem',
        attributes: { 'aria-label': `Sem imagem para ${name}` },
      }));
    }
    const body = element('div', { className: 'card-body' });
    body.append(
      element('span', { className: 'badge', text: LABELS[category] }),
      element('h2', { text: name, attributes: { title: name } }),
    );
    const details = element('ul', { className: 'catalog-details' });
    for (const detail of this.detailsFor(data, entity)) details.append(element('li', { text: detail }));
    body.append(details);
    const actions = element('div', { className: 'card-actions' });
    const edit = button('Editar', 'catalog-edit');
    edit.dataset.entityId = entity.id;
    edit.dataset.focusToken = `catalog:${category}:edit:${entity.id}`;
    const remove = button('Excluir', 'catalog-delete', 'button danger');
    remove.dataset.entityId = entity.id;
    actions.append(edit, remove);
    body.append(actions);
    card.append(body);
    return card;
  }

  private detailsFor(data: Readonly<AppData>, entity: CatalogEntity): readonly string[] {
    if ('components' in entity) {
      const components = entity.components.map((component) =>
        `${component.quantity} × ${this.relationName(data, component.entityId)}`);
      if (entity.kind === 'smelting' && entity.processingSeconds) {
        return [`Tempo por unidade: ${formatDuration(entity.processingSeconds)}`, ...components];
      }
      return components;
    }
    if ('drops' in entity) {
      return entity.drops.length
        ? entity.drops.map((drop) =>
          `${this.relationName(data, drop.itemId)}: ${drop.numerator} em ${drop.denominator}`)
        : ['Sem drops'];
    }
    if ('itemId' in entity) {
      return [`Item: ${this.relationName(data, entity.itemId)}`, `Ato ${entity.act}`];
    }
    return ['Material bruto'];
  }

  private renderEditor(data: Readonly<AppData>, draft: CatalogEditorDraft): void {
    if (!this.root) return;
    const dialog = element('section', {
      className: 'catalog-dialog-layer',
      attributes: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'catalog-editor-title',
      },
    });
    const form = element('div', { className: 'dialog catalog-editor' });
    const header = element('div', { className: 'dialog-header' });
    header.append(
      element('h2', {
        text: `${draft.mode === 'create' ? 'Novo' : 'Editar'} cadastro`,
        attributes: { id: 'catalog-editor-title' },
      }),
      button('Fechar', 'catalog-cancel'),
    );
    form.append(header);
    if (draft.category !== 'resources') {
      form.append(labelledInput('Nome', 'name', draft.name));
    }
    if (draft.category === 'resources' || draft.category === 'monsters' || draft.category === 'bosses') {
      const label = element('label', { text: 'Ato' });
      const select = element('select', { attributes: { name: 'act' } });
      for (const act of ['I', 'II', 'III'] as const) {
        const option = element('option', { text: act, attributes: { value: act } });
        option.selected = draft.act === act;
        select.append(option);
      }
      label.append(select);
      form.append(label);
    }
    if (draft.category === 'smelting') {
      const duration = labelledInput(
        'Tempo por unidade',
        'processingSeconds',
        String(draft.processingSeconds ?? ''),
      );
      duration.append(element('small', { text: 'Exemplos: 1m 30s, 1:30, 90 ou 90s.' }));
      form.append(duration);
    }
    form.append(this.renderImage(draft));
    const relationRoot = element('div', { className: 'relation-picker-root' });
    form.append(relationRoot);
    this.renderSelectedRelations(data, draft, form);
    const errors = element('div', {
      className: 'form-errors',
      attributes: { role: 'alert', 'aria-live': 'polite' },
    });
    errors.dataset.role = 'catalog-errors';
    form.append(errors);
    const actions = element('div', { className: 'dialog-actions' });
    actions.append(
      button('Cancelar', 'catalog-cancel'),
      button('Salvar', 'catalog-save', 'button primary'),
    );
    form.append(actions);
    dialog.append(form);
    this.root.append(dialog);
    this.renderErrors(draft);
    this.mountRelationPicker(data, draft, relationRoot);
  }

  private renderImage(draft: CatalogEditorDraft): HTMLElement {
    const picker = element('div', { className: 'image-picker' });
    if (draft.image) {
      picker.append(element('img', {
        className: 'image-preview',
        attributes: { src: draft.image, alt: 'Prévia da imagem selecionada' },
      }));
    } else {
      picker.append(element('div', {
        className: 'image-preview card-placeholder',
        text: 'Sem imagem',
      }));
    }
    picker.append(button(draft.image ? 'Substituir imagem' : 'Selecionar imagem', 'catalog-image'));
    if (draft.image) picker.append(button('Remover imagem', 'catalog-image-remove', 'button danger'));
    return picker;
  }

  private renderSelectedRelations(
    data: Readonly<AppData>,
    draft: CatalogEditorDraft,
    form: HTMLElement,
  ): void {
    if (draft.category === 'recipes' || draft.category === 'smelting') {
      const list = element('div', {
        className: 'form-list',
        attributes: { 'aria-label': 'Componentes selecionados' },
      });
      for (const component of draft.components) {
        const row = element('div', { className: 'form-row components' });
        row.append(element('span', {
          text: this.relationName(data, component.entityId),
          attributes: { title: this.relationName(data, component.entityId) },
        }));
        const quantity = element('input', {
          attributes: {
            type: 'number',
            min: '1',
            step: '1',
            value: String(component.quantity),
            'aria-label': `Quantidade de ${this.relationName(data, component.entityId)}`,
          },
        });
        quantity.dataset.componentQuantity = component.entityId;
        const remove = button('Remover', 'relation-remove', 'button danger');
        remove.dataset.entityId = component.entityId;
        row.append(quantity, remove);
        list.append(row);
      }
      form.append(list);
    } else if (draft.category === 'monsters' || draft.category === 'bosses') {
      const list = element('div', {
        className: 'form-list',
        attributes: { 'aria-label': 'Drops selecionados' },
      });
      for (const drop of draft.drops) {
        const row = element('div', { className: 'form-row drop-row' });
        row.append(element('span', { text: this.relationName(data, drop.itemId) }));
        const numerator = element('input', {
          attributes: {
            type: 'number',
            min: '1',
            step: '1',
            value: String(drop.numerator),
            'aria-label': `Numerador de ${this.relationName(data, drop.itemId)}`,
          },
        });
        numerator.dataset.dropNumerator = drop.itemId;
        const denominator = element('input', {
          attributes: {
            type: 'number',
            min: '1',
            step: '1',
            value: String(drop.denominator),
            'aria-label': `Denominador de ${this.relationName(data, drop.itemId)}`,
          },
        });
        denominator.dataset.dropDenominator = drop.itemId;
        const remove = button('Remover', 'relation-remove', 'button danger');
        remove.dataset.entityId = drop.itemId;
        row.append(numerator, denominator, remove);
        list.append(row);
      }
      form.append(list);
    }
  }

  private mountRelationPicker(
    data: Readonly<AppData>,
    draft: CatalogEditorDraft,
    root: HTMLElement,
    remount = true,
  ): void {
    if (draft.category === 'items') return;
    this.relationPicker ??= new RelationPicker();
    if (remount) {
      this.relationPicker.mount(root, (action) => this.handleRelationAction(action));
    }
    const records = this.recordsFor(data, draft);
    const selectedIds = draft.category === 'resources'
      ? (draft.itemId ? [draft.itemId] : [])
      : draft.category === 'recipes' || draft.category === 'smelting'
        ? draft.components.map((component) => component.entityId)
        : draft.drops.map((drop) => drop.itemId);
    this.relationPicker.render({
      label: draft.category === 'resources'
        ? 'Item relacionado'
        : draft.category === 'recipes' || draft.category === 'smelting'
          ? 'Pesquisar e selecionar componentes'
          : 'Pesquisar e selecionar drops',
      query: draft.relationQuery,
      records,
      selectedIds,
      multiple: draft.category !== 'resources',
      createLabel: draft.relationQuery.trim()
        ? `Criar item “${draft.relationQuery.trim()}”`
        : 'Criar item',
      ...(draft.category === 'recipes' || draft.category === 'smelting'
        ? {
          createOptions: [
            { kind: 'items', label: `Criar item “${draft.relationQuery.trim()}”` },
            { kind: 'recipes', label: `Criar receita “${draft.relationQuery.trim()}”` },
            { kind: 'smelting', label: `Criar fundição “${draft.relationQuery.trim()}”` },
          ],
        }
        : {}),
    });
  }

  private recordsFor(
    data: Readonly<AppData>,
    draft: CatalogEditorDraft,
  ): readonly RelationRecord[] {
    if (this.relationRecordsData === data
      && this.relationRecordsCategory === draft.category
      && this.relationRecords) return this.relationRecords;
    this.relationRecordsData = data;
    this.relationRecordsCategory = draft.category;
    this.relationRecords = draft.category === 'resources'
      || draft.category === 'monsters'
      || draft.category === 'bosses'
      ? data.catalog.items
      : [...data.catalog.items, ...data.catalog.products.filter((product) => product.id !== draft.id)];
    return this.relationRecords;
  }

  private renderChild(data: Readonly<AppData>, draft: CatalogEditorDraft): void {
    if (!this.root) return;
    const layer = element('section', {
      className: 'catalog-dialog-layer nested',
      attributes: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'inline-child-title',
      },
    });
    const form = element('div', { className: 'dialog inline-child' });
    form.append(element('h2', {
      text: `Criar ${ENTITY_LABELS[draft.category]} relacionado`,
      attributes: { id: 'inline-child-title' },
    }));
    const name = labelledInput('Nome', 'childName', draft.name);
    name.querySelector('input')?.setAttribute('name', 'childName');
    form.append(name);
    if (draft.category === 'smelting') {
      form.append(labelledInput(
        'Tempo por unidade',
        'processingSeconds',
        String(draft.processingSeconds),
      ));
    }
    let childRelationRoot: HTMLElement | undefined;
    if (draft.category === 'recipes' || draft.category === 'smelting') {
      childRelationRoot = element('div', { className: 'child-relation-picker-root' });
      form.append(childRelationRoot);
      this.renderSelectedRelations(data, draft, form);
    }
    const errors = element('div', {
      className: 'form-errors',
      attributes: { role: 'alert' },
    });
    for (const error of draft.errors) errors.append(element('p', { text: fieldMessage(error) }));
    form.append(errors);
    const actions = element('div', { className: 'dialog-actions' });
    actions.append(button('Cancelar', 'child-cancel'), button('Criar e selecionar', 'child-save', 'button primary'));
    form.append(actions);
    layer.append(form);
    this.root.append(layer);
    if (childRelationRoot) this.mountChildRelationPicker(data, draft, childRelationRoot);
  }

  private mountChildRelationPicker(
    data: Readonly<AppData>,
    draft: CatalogEditorDraft,
    root: HTMLElement,
    remount = true,
  ): void {
    this.childRelationPicker ??= new RelationPicker();
    if (remount) {
      this.childRelationPicker.mount(root, (action) => this.handleChildRelationAction(action));
    }
    this.childRelationPicker.render({
      label: 'Pesquisar componente do novo produto',
      query: draft.relationQuery,
      records: [...data.catalog.items, ...data.catalog.products],
      selectedIds: draft.components.map((component) => component.entityId),
      multiple: true,
      allowCreate: false,
    });
  }

  private async openEditor(entityId?: string): Promise<void> {
    const data = this.state && dataFor(this.state);
    const category = this.state?.page;
    if (!data || !category || category === 'planner' || category === 'settings') return;
    const entity = entityId
      ? collectionFor(data, category).find((candidate) => candidate.id === entityId)
      : undefined;
    const draft = this.draftFrom(category, entity);
    await this.dispatch?.({
      type: 'set-draft',
      key: EDITOR_KEY,
      value: draft,
      focusToken: 'catalog-editor:first',
    });
  }

  private draftFrom(
    category: EntityCategory,
    entity?: CatalogEntity,
    overrides: Partial<CatalogEditorDraft> = {},
  ): CatalogEditorDraft {
    const product = entity && 'components' in entity ? entity as Product : undefined;
    const enemy = entity && 'drops' in entity ? entity as Enemy : undefined;
    const resource = entity && 'itemId' in entity ? entity as Resource : undefined;
    const named = entity && 'name' in entity ? entity as Item | Product | Enemy : undefined;
    const id = entity?.id ?? crypto.randomUUID();
    return {
      key: `${category}:${id}`,
      operationId: entity
        ? `catalog:update:${category}:${id}:${crypto.randomUUID()}`
        : `catalog:create:${category}:${id}`,
      category,
      mode: entity ? 'update' : 'create',
      id,
      ...(entity ? { expectedEntity: structuredClone(entity) } : {}),
      name: named?.name ?? '',
      itemId: resource?.itemId ?? '',
      act: resource?.act ?? enemy?.act ?? 'I',
      image: entity?.image,
      processingSeconds: product?.processingSeconds ?? '',
      components: structuredClone(product?.components ?? []),
      drops: structuredClone(enemy?.drops ?? []),
      relationQuery: '',
      errors: [],
      openerFocusToken: entity
        ? `catalog:${category}:edit:${entity.id}`
        : `catalog:${category}:create`,
      ...overrides,
    };
  }

  private updateDraft(
    patch: Partial<CatalogEditorDraft>,
    focusToken?: string,
  ): void {
    const draft = this.editorDraft();
    if (!draft) return;
    void this.dispatch?.({
      type: 'set-draft',
      key: EDITOR_KEY,
      value: cloneDraft(draft, { ...patch, errors: patch.errors ?? [] }),
      ...(focusToken ? { focusToken } : {}),
    });
  }

  private updateChild(patch: Partial<CatalogEditorDraft>): void {
    const draft = this.childDraft();
    if (!draft) return;
    void this.dispatch?.({
      type: 'set-draft',
      key: CHILD_KEY,
      value: cloneDraft(draft, { ...patch, errors: patch.errors ?? [] }),
    });
  }

  private async closeEditor(): Promise<void> {
    const draft = this.editorDraft();
    if (!draft) return;
    await this.dispatch?.({ type: 'discard-draft', key: CHILD_KEY });
    await this.dispatch?.({
      type: 'discard-draft',
      key: EDITOR_KEY,
      focusToken: draft.openerFocusToken,
    });
  }

  private async closeChild(): Promise<void> {
    const parent = this.editorDraft();
    await this.dispatch?.({
      type: 'discard-draft',
      key: CHILD_KEY,
      focusToken: parent ? `catalog-relation:${parent.id}` : undefined,
    });
  }

  private async saveEditor(): Promise<void> {
    const draft = this.editorDraft();
    const data = this.state && dataFor(this.state);
    if (!draft || !data) return;
    const mutation = this.mutationFor(draft);
    const result = this.service.apply(data, mutation);
    if (!result.ok) {
      const errors = result.error.code === 'invalid_candidate'
        || result.error.code === 'invalid_snapshot'
        ? result.error.fields
        : [];
      await this.dispatch?.({
        type: 'set-draft',
        key: EDITOR_KEY,
        value: cloneDraft(draft, { errors }),
        focusToken: errors[0] ? `catalog-error:${errors[0].field}` : 'catalog-editor:first',
      });
      await this.dispatch?.({
        type: 'add-notice',
        kind: 'error',
        message: this.catalogErrorMessage(result.error),
      });
      return;
    }
    await this.dispatch?.({
      type: 'mutate-and-save',
      operationId: draft.operationId,
      update: () => result.value,
    });
    const savedData = this.state && dataFor(this.state);
    if (!savedData || !collectionFor(savedData, draft.category).some((entity) => entity.id === draft.id)) return;
    await this.dispatch?.({
      type: 'discard-draft',
      key: EDITOR_KEY,
      focusToken: draft.openerFocusToken,
    });
  }

  private async saveChild(): Promise<void> {
    const child = this.childDraft();
    const parent = this.editorDraft();
    const data = this.state && dataFor(this.state);
    if (!child || !parent || !data) return;
    const result = this.service.apply(data, this.mutationFor(child));
    if (!result.ok) {
      const errors = result.error.code === 'invalid_candidate' ? result.error.fields : [];
      await this.dispatch?.({
        type: 'set-draft',
        key: CHILD_KEY,
        value: cloneDraft(child, { errors }),
      });
      return;
    }
    await this.dispatch?.({
      type: 'mutate-and-save',
      operationId: child.operationId,
      update: () => result.value,
    });
    const savedData = this.state && dataFor(this.state);
    if (!savedData || !collectionFor(savedData, child.category).some((entity) => entity.id === child.id)) return;
    let next = parent;
    if (parent.category === 'resources') next = cloneDraft(parent, { itemId: child.id });
    else if (parent.category === 'recipes' || parent.category === 'smelting') {
      const components = parent.components.some((component) => component.entityId === child.id)
        ? parent.components
        : [...parent.components, { entityId: child.id, quantity: 1 }];
      next = cloneDraft(parent, { components });
    } else {
      const drops = parent.drops.some((drop) => drop.itemId === child.id)
        ? parent.drops
        : [...parent.drops, { itemId: child.id, numerator: 1, denominator: 1 }];
      next = cloneDraft(parent, { drops });
    }
    await this.dispatch?.({
      type: 'set-draft',
      key: EDITOR_KEY,
      value: next,
    });
    await this.dispatch?.({
      type: 'discard-draft',
      key: CHILD_KEY,
      focusToken: `catalog-relation:${parent.id}:selected:${child.id}`,
    });
  }

  private async deleteEntity(entityId: string): Promise<void> {
    const data = this.state && dataFor(this.state);
    const category = this.state?.page;
    if (!data || !category || category === 'planner' || category === 'settings') return;
    const entity = collectionFor(data, category).find((candidate) => candidate.id === entityId);
    if (!entity) return;
    const result = this.service.apply(data, {
      type: 'delete',
      category,
      id: entityId,
      expectedEntity: entity,
    } as CatalogMutation);
    if (!result.ok) {
      await this.dispatch?.({
        type: 'add-notice',
        kind: 'error',
        message: this.catalogErrorMessage(result.error),
      });
      return;
    }
    await this.dispatch?.({
      type: 'mutate-and-save',
      operationId: `catalog:delete:${category}:${entityId}`,
      update: () => result.value,
    });
  }

  private async importImage(): Promise<void> {
    const draft = this.editorDraft();
    if (!draft) return;
    const result = await this.desktop.importImage({ category: draft.category });
    if (!result.ok) {
      await this.dispatch?.({
        type: 'add-notice',
        kind: 'error',
        code: result.error.code,
        message: result.error.message,
      });
      return;
    }
    if (result.value) this.updateDraft({ image: result.value });
  }

  private handleRelationAction(action: RelationPickerAction): void {
    const draft = this.editorDraft();
    if (!draft) return;
    if (action.type === 'relation-query') {
      const next = cloneDraft(draft, { relationQuery: action.query, errors: [] });
      void this.dispatch?.({ type: 'set-draft', key: EDITOR_KEY, value: next });
      const data = this.state && dataFor(this.state);
      const root = this.root?.querySelector<HTMLElement>('.relation-picker-root');
      if (data && root) this.mountRelationPicker(data, next, root, false);
      return;
    }
    if (action.type === 'relation-create') {
      const category = action.kind === 'recipes' || action.kind === 'smelting'
        ? action.kind
        : 'items';
      const child = this.draftFrom(category, undefined, {
        name: action.name,
        processingSeconds: category === 'smelting' ? '90' : '',
        openerFocusToken: `catalog-relation:${draft.id}`,
      });
      void this.dispatch?.({
        type: 'set-draft',
        key: CHILD_KEY,
        value: child,
        focusToken: 'inline-child:first',
      });
      return;
    }
    if (draft.category === 'resources') {
      this.updateDraft(
        { itemId: action.selected ? action.id : '' },
        `catalog-relation:${draft.id}`,
      );
    } else if (draft.category === 'recipes' || draft.category === 'smelting') {
      const components = action.selected
        ? draft.components.some((component) => component.entityId === action.id)
          ? draft.components
          : [...draft.components, { entityId: action.id, quantity: 1 }]
        : draft.components.filter((component) => component.entityId !== action.id);
      this.updateDraft({ components }, `catalog-relation:${draft.id}`);
    } else {
      const drops = action.selected
        ? draft.drops.some((drop) => drop.itemId === action.id)
          ? draft.drops
          : [...draft.drops, { itemId: action.id, numerator: 1, denominator: 1 }]
        : draft.drops.filter((drop) => drop.itemId !== action.id);
      this.updateDraft({ drops }, `catalog-relation:${draft.id}`);
    }
  }

  private handleChildRelationAction(action: RelationPickerAction): void {
    const draft = this.childDraft();
    const data = this.state && dataFor(this.state);
    if (!draft || !data) return;
    if (action.type === 'relation-query') {
      const next = cloneDraft(draft, { relationQuery: action.query, errors: [] });
      void this.dispatch?.({ type: 'set-draft', key: CHILD_KEY, value: next });
      const root = this.root?.querySelector<HTMLElement>('.child-relation-picker-root');
      if (root) this.mountChildRelationPicker(data, next, root, false);
      return;
    }
    if (action.type !== 'relation-select') return;
    const components = action.selected
      ? draft.components.some((component) => component.entityId === action.id)
        ? draft.components
        : [...draft.components, { entityId: action.id, quantity: 1 }]
      : draft.components.filter((component) => component.entityId !== action.id);
    this.updateChild({ components });
  }

  private removeRelation(entityId: string): void {
    const draft = this.editorDraft();
    if (!draft) return;
    if (draft.category === 'recipes' || draft.category === 'smelting') {
      this.updateDraft({
        components: draft.components.filter((component) => component.entityId !== entityId),
      });
    } else {
      this.updateDraft({ drops: draft.drops.filter((drop) => drop.itemId !== entityId) });
    }
  }

  private mutationFor(draft: CatalogEditorDraft): CatalogMutation {
    const base = {
      type: draft.mode,
      category: draft.category,
      ...(draft.mode === 'update' ? { expectedEntity: draft.expectedEntity! } : {}),
    };
    if (draft.category === 'items') {
      return {
        ...base,
        category: 'items',
        candidate: { id: draft.id, name: draft.name, image: draft.image },
      } as CatalogMutation;
    }
    if (draft.category === 'resources') {
      return {
        ...base,
        category: 'resources',
        candidate: {
          id: draft.id,
          itemId: draft.itemId,
          act: draft.act,
          image: draft.image,
        },
      } as CatalogMutation;
    }
    if (draft.category === 'recipes' || draft.category === 'smelting') {
      return {
        ...base,
        category: draft.category,
        candidate: {
          id: draft.id,
          name: draft.name,
          image: draft.image,
          kind: draft.category === 'recipes' ? 'recipe' : 'smelting',
          processingSeconds: draft.category === 'smelting' ? draft.processingSeconds : undefined,
          components: draft.components,
        },
      } as CatalogMutation;
    }
    return {
      ...base,
      category: draft.category,
      candidate: {
        id: draft.id,
        name: draft.name,
        act: draft.act,
        image: draft.image,
        drops: draft.drops,
      },
    } as CatalogMutation;
  }

  private catalogErrorMessage(error: ReturnType<CatalogService['apply']> extends infer R
    ? R extends { ok: false; error: infer E } ? E : never
    : never): string {
    if (error.code === 'referenced_entity') {
      const associations = error.references.map((reference) => reference.kind).join(', ');
      return `Remova as associações antes de excluir: ${associations}.`;
    }
    if (error.code === 'production_cycle') {
      return `Ciclo de produção: ${error.cycle.join(' → ')}.`;
    }
    if (error.code === 'stale_entity' || error.code === 'entity_not_found') {
      return 'O cadastro mudou ou foi removido. Revise os dados atuais.';
    }
    if (error.code === 'duplicate_identifier') return 'Este cadastro já foi criado.';
    return 'Corrija os campos indicados antes de salvar.';
  }

  private renderErrors(draft?: CatalogEditorDraft): void {
    const root = this.root?.querySelector<HTMLElement>('[data-role="catalog-errors"]');
    if (!root) return;
    clear(root);
    for (const error of draft?.errors ?? []) {
      root.append(element('p', {
        text: fieldMessage(error),
        attributes: { 'data-field': error.field },
      }));
    }
  }

  private applyFocus(focusToken?: string): void {
    if (!focusToken || !this.root) return;
    let target: HTMLElement | null = null;
    if (focusToken === 'catalog-editor:first') {
      target = this.root.querySelector<HTMLElement>('[role="dialog"] input, [role="dialog"] select');
    } else if (focusToken === 'inline-child:first') {
      target = this.root.querySelector<HTMLElement>('.nested input');
    } else if (focusToken.startsWith('catalog-error:')) {
      const field = focusToken.slice('catalog-error:'.length).split(/[.[\]]/)[0];
      target = field === 'components' || field === 'drops' || field === 'itemId'
        ? this.root.querySelector<HTMLElement>('[data-role="relation-search"]')
        : this.root.querySelector<HTMLElement>(`[name="${field}"]`);
    } else if (focusToken.startsWith('catalog-relation:')) {
      target = this.root.querySelector<HTMLElement>('[data-role="relation-search"]');
    } else {
      target = this.root.querySelector<HTMLElement>(`[data-focus-token="${CSS.escape(focusToken)}"]`);
    }
    target?.focus();
    if (target) void this.dispatch?.({ type: 'set-focus', focusToken: undefined });
  }

  private relationName(data: Readonly<AppData>, id: string): string {
    return [...data.catalog.items, ...data.catalog.products]
      .find((entity) => entity.id === id)?.name ?? 'Cadastro indisponível';
  }

  private editorDraft(): CatalogEditorDraft | undefined {
    const value = this.state?.drafts[EDITOR_KEY];
    return isDraft(value) ? value : undefined;
  }

  private childDraft(): CatalogEditorDraft | undefined {
    const value = this.state?.drafts[CHILD_KEY];
    return isDraft(value) ? value : undefined;
  }
}
