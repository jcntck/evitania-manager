import { button, clear, element } from '../components/dom';
import type { Dispatch } from '../components/view-module';
import type { AppAction, AppPage, AppState } from '../store/app-store';

export const NAVIGATION_ITEMS: readonly Readonly<{
  page: AppPage;
  label: string;
  icon: string;
  group: 'primary' | 'catalog';
}>[] = Object.freeze([
  { page: 'planner', label: 'Planejador', icon: '⌘', group: 'primary' },
  { page: 'recipes', label: 'Receitas', icon: '⚒', group: 'catalog' },
  { page: 'smelting', label: 'Fundição', icon: '♨', group: 'catalog' },
  { page: 'bosses', label: 'Chefes', icon: '♛', group: 'catalog' },
  { page: 'monsters', label: 'Monstros', icon: '♞', group: 'catalog' },
  { page: 'resources', label: 'Recursos', icon: '♠', group: 'catalog' },
  { page: 'items', label: 'Itens', icon: '◇', group: 'catalog' },
]);

export const navigationLabel = (page: AppPage): string =>
  NAVIGATION_ITEMS.find((entry) => entry.page === page)?.label ?? 'Configurações';

export class NavigationView {
  private root?: HTMLElement;
  private dispatch?: Dispatch<AppAction>;

  private readonly onClick = (event: Event): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-page]');
    const page = target?.dataset.page as AppPage | undefined;
    if (!page) return;
    void this.dispatch?.({ type: 'navigate', page, focusToken: `page:${page}:heading` });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp'
      && event.key !== 'Home' && event.key !== 'End') return;
    const controls = [...(this.root?.querySelectorAll<HTMLButtonElement>('[data-page]') ?? [])];
    const current = controls.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || controls.length === 0) return;
    event.preventDefault();
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? controls.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
    controls[next].focus();
  };

  mount(root: HTMLElement, dispatch: Dispatch<AppAction>): void {
    this.unmount();
    this.root = root;
    this.dispatch = dispatch;
    root.setAttribute('aria-label', 'Navegação principal');
    root.addEventListener('click', this.onClick);
    root.addEventListener('keydown', this.onKeyDown);
    this.build();
  }

  render(state: Readonly<AppState>): void {
    this.root?.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((node) => {
      const active = node.dataset.page === state.page;
      node.classList.toggle('active', active);
      if (active) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
  }

  unmount(): void {
    this.root?.removeEventListener('click', this.onClick);
    this.root?.removeEventListener('keydown', this.onKeyDown);
    this.root = undefined;
    this.dispatch = undefined;
  }

  private build(): void {
    if (!this.root) return;
    clear(this.root);
    let catalogLabelAdded = false;
    for (const entry of NAVIGATION_ITEMS) {
      if (entry.group === 'catalog' && !catalogLabelAdded) {
        catalogLabelAdded = true;
        this.root.append(element('p', {
          className: 'nav-section-label',
          text: 'CATÁLOGO',
          attributes: { id: 'catalog-navigation-label' },
        }));
      }
      const node = button(entry.label, 'navigate', `nav-button nav-${entry.group}`);
      node.dataset.page = entry.page;
      node.setAttribute('aria-label', entry.label);
      node.replaceChildren(
        element('span', { text: entry.icon, attributes: { 'aria-hidden': 'true' } }),
        element('span', { className: 'nav-label', text: entry.label }),
      );
      this.root.append(node);
    }
  }
}
