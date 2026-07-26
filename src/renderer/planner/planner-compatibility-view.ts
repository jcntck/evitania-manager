import type { AppData } from '../../shared/domain';
import type { AppAction, AppState } from '../store/app-store';
import { clear, element } from '../components/dom';
import type { Dispatch, ViewModule } from '../components/view-module';

export class PlannerCompatibilityView implements ViewModule<AppState, AppAction> {
  private root?: HTMLElement;
  private dispatch?: Dispatch<AppAction>;
  private renderedData?: Readonly<AppData>;
  private readonly onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (input.id !== 'loot-quantity') return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0) return;
    void this.dispatch?.({
      type: 'mutate-and-save',
      operationId: `planner:loot:${crypto.randomUUID()}`,
      update: (current) => {
        const next = structuredClone(current);
        next.planning.lootQuantity = value;
        return next;
      },
    });
  };

  mount(root: HTMLElement, dispatch: Dispatch<AppAction>): void {
    this.unmount();
    this.root = root;
    this.dispatch = dispatch;
    root.addEventListener('change', this.onChange);
  }

  render(state: Readonly<AppState>): void {
    if (!this.root || state.page !== 'planner') return;
    const data = state.candidate ?? state.committed?.data;
    if (!data || this.renderedData === data) return;
    this.renderedData = data;
    clear(this.root);
    const panel = element('section', {
      className: 'panel',
      attributes: { 'aria-labelledby': 'planner-compatibility-title' },
    });
    panel.append(
      element('p', { className: 'eyebrow', text: 'PLANEJADOR' }),
      element('h2', {
        text: 'Resumo do planejamento',
        attributes: { id: 'planner-compatibility-title' },
      }),
      element('p', {
        text: `${data.planning.goals.filter((goal) => !goal.completed).length} objetivos ativos`,
      }),
    );
    const label = element('label', { text: 'Quantidade de Saque' });
    label.append(element('input', {
      attributes: {
        id: 'loot-quantity',
        type: 'number',
        min: '0',
        value: String(data.planning.lootQuantity),
      },
    }));
    panel.append(label);
    this.root.append(panel);
  }

  unmount(): void {
    if (this.root) {
      this.root.removeEventListener('change', this.onChange);
      clear(this.root);
    }
    this.root = undefined;
    this.dispatch = undefined;
    this.renderedData = undefined;
  }
}
