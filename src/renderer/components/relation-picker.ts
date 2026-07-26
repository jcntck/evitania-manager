import { button, clear, element } from './dom';
import { RelationSearchIndex, type RelationRecord } from './relation-search';
import type { Dispatch, ViewModule } from './view-module';

export type RelationPickerState = Readonly<{
  label: string;
  query: string;
  records: readonly RelationRecord[];
  selectedIds: readonly string[];
  multiple?: boolean;
  createLabel?: string;
  createOptions?: readonly Readonly<{ kind: string; label: string }>[];
  allowCreate?: boolean;
  disabledIds?: readonly string[];
}>;

export type RelationPickerAction =
  | Readonly<{ type: 'relation-query'; query: string }>
  | Readonly<{ type: 'relation-select'; id: string; selected: boolean }>
  | Readonly<{ type: 'relation-create'; name: string; kind?: string }>;

export class RelationPicker implements ViewModule<RelationPickerState, RelationPickerAction> {
  private root?: HTMLElement;
  private dispatch?: Dispatch<RelationPickerAction>;
  private state?: RelationPickerState;
  private activeIndex = 0;
  private indexedRecords?: readonly RelationRecord[];
  private searchIndex?: RelationSearchIndex;
  private readonly onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.role === 'relation-search') {
      void this.dispatch?.({ type: 'relation-query', query: input.value });
    }
  };
  private readonly onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-relation-id],[data-action="relation-create"]');
    if (!target || !this.state) return;
    if (target.dataset.action === 'relation-create') {
      void this.dispatch?.({
        type: 'relation-create',
        name: this.state.query.trim(),
        ...(target.dataset.createKind ? { kind: target.dataset.createKind } : {}),
      });
      return;
    }
    const id = target.dataset.relationId;
    if (!id) return;
    const selected = !this.state.selectedIds.includes(id);
    void this.dispatch?.({ type: 'relation-select', id, selected });
  };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.root || !this.state) return;
    const options = [...this.root.querySelectorAll<HTMLElement>('[role="option"]')];
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = Math.min(options.length - 1, this.activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = Math.max(0, this.activeIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.activeIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      this.activeIndex = Math.max(0, options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const active = options[this.activeIndex];
      if (!active) return;
      event.preventDefault();
      active.click();
      return;
    } else if (event.key === 'Escape') {
      const input = this.root.querySelector<HTMLInputElement>('[data-role="relation-search"]');
      if (input && input.value.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        input.value = '';
        void this.dispatch?.({ type: 'relation-query', query: '' });
      }
      return;
    } else {
      return;
    }
    this.syncActiveOption(options);
  };

  mount(root: HTMLElement, dispatch: Dispatch<RelationPickerAction>): void {
    this.unmount();
    this.root = root;
    this.dispatch = dispatch;
    root.addEventListener('input', this.onInput);
    root.addEventListener('click', this.onClick);
    root.addEventListener('keydown', this.onKeyDown);
  }

  render(state: Readonly<RelationPickerState>): void {
    if (!this.root) throw new Error('RelationPicker must be mounted before render.');
    const previousInput = this.root.querySelector<HTMLInputElement>('[data-role="relation-search"]');
    const restoreSearchFocus = previousInput === document.activeElement;
    const selectionStart = previousInput?.selectionStart ?? state.query.length;
    this.state = state;
    if (this.indexedRecords !== state.records || !this.searchIndex) {
      this.indexedRecords = state.records;
      this.searchIndex = new RelationSearchIndex(state.records);
    }
    const result = this.searchIndex.search(state.query, state.selectedIds);
    clear(this.root);

    const label = element('label', { className: 'relation-picker-label', text: state.label });
    const input = element('input', {
      attributes: {
        type: 'search',
        value: state.query,
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': 'true',
        'aria-controls': 'relation-options',
        autocomplete: 'off',
      },
    });
    input.dataset.role = 'relation-search';
    label.append(input);
    this.root.append(label);
    if (restoreSearchFocus) {
      input.focus();
      input.setSelectionRange(selectionStart, selectionStart);
    }

    const list = element('div', {
      className: 'relation-options',
      attributes: {
        id: 'relation-options',
        role: 'listbox',
        tabindex: '0',
        ...(state.multiple ? { 'aria-multiselectable': 'true' } : {}),
      },
    });
    const disabled = new Set(state.disabledIds ?? []);
    for (const record of result.options) {
      const selected = state.selectedIds.includes(record.id);
      const option = element('button', {
        className: `relation-option${selected ? ' selected' : ''}`,
        text: record.name,
        attributes: {
          type: 'button',
          role: 'option',
          'aria-selected': String(selected),
          title: record.name,
          ...(disabled.has(record.id) ? { disabled: '' } : {}),
        },
      });
      option.dataset.relationId = record.id;
      list.append(option);
    }
    if (result.noResults) {
      list.append(element('p', {
        className: 'relation-empty',
        text: 'Nenhum resultado encontrado.',
        attributes: { role: 'status' },
      }));
    }
    this.root.append(list);

    if (result.canCreate && state.allowCreate !== false) {
      const createOptions = state.createOptions ?? [{
        kind: 'items',
        label: state.createLabel ?? `Criar “${state.query.trim()}”`,
      }];
      const actions = element('div', { className: 'relation-create-actions' });
      for (const createOption of createOptions) {
        const create = button(createOption.label, 'relation-create', 'button relation-create');
        create.dataset.createKind = createOption.kind;
        actions.append(create);
      }
      this.root.append(actions);
    }
    this.activeIndex = Math.min(this.activeIndex, Math.max(0, result.options.length - 1));
    this.syncActiveOption([...list.querySelectorAll<HTMLElement>('[role="option"]')]);
  }

  unmount(): void {
    if (this.root) {
      this.root.removeEventListener('input', this.onInput);
      this.root.removeEventListener('click', this.onClick);
      this.root.removeEventListener('keydown', this.onKeyDown);
      clear(this.root);
    }
    this.root = undefined;
    this.dispatch = undefined;
    this.state = undefined;
  }

  private syncActiveOption(options: readonly HTMLElement[]): void {
    options.forEach((option, index) => {
      option.tabIndex = index === this.activeIndex ? 0 : -1;
      option.classList.toggle('active', index === this.activeIndex);
    });
    const active = options[this.activeIndex];
    if (active && this.root?.contains(document.activeElement)) active.focus();
  }
}
