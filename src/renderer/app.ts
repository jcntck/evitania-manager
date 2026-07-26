import { CatalogView } from './catalog/catalog-view';
import { element } from './components/dom';
import { NavigationView, navigationLabel } from './navigation/navigation-view';
import { PlannerView } from './planner/planner-view';
import { openDataDirectory } from './settings/settings-model';
import { AppStore, type AppState } from './store/app-store';

class ApplicationComposition {
  private readonly store = new AppStore(window.desktopApi);
  private readonly catalog = new CatalogView(window.desktopApi);
  private readonly planner = new PlannerView();
  private readonly navigation = new NavigationView();
  private unsubscribe?: () => void;
  private catalogRoot?: HTMLElement;
  private plannerRoot?: HTMLElement;

  async start(): Promise<void> {
    this.navigation.mount(this.required('navigation'), (action) => this.store.dispatch(action));
    this.catalogRoot = element('div', { attributes: { id: 'catalog-root' } });
    this.plannerRoot = element('div', { attributes: { id: 'planner-root' } });
    const content = this.required('content');
    content.replaceChildren(this.catalogRoot, this.plannerRoot);
    this.catalog.mount(this.catalogRoot, (action) => this.store.dispatch(action));
    this.planner.mount(this.plannerRoot, (action) => this.store.dispatch(action));
    this.bindShell();
    this.unsubscribe = this.store.subscribe((state) => this.render(state));
    await this.store.initialize();
  }

  private bindShell(): void {
    this.required('open-folder').addEventListener('click', async () => {
      const notice = await openDataDirectory(window.desktopApi);
      await this.store.dispatch({
        type: 'add-notice',
        kind: notice.kind,
        message: notice.message,
        code: notice.code,
      });
    });
    this.required('reload-conflict').addEventListener('click', () =>
      void this.store.dispatch({
        type: 'reload',
        operationId: `reload:${crypto.randomUUID()}`,
      }));
  }

  private render(state: Readonly<AppState>): void {
    this.navigation.render(state);
    const heading = this.required('page-title');
    heading.textContent = navigationLabel(state.page);
    heading.dataset.focusToken = `page:${state.page}:heading`;
    heading.tabIndex = -1;
    if (this.catalogRoot && this.plannerRoot) {
      const planner = state.page === 'planner';
      this.plannerRoot.hidden = !planner;
      this.catalogRoot.hidden = planner || state.page === 'settings';
    }
    this.catalog.render(state);
    this.planner.render(state);
    this.renderStatus(state);
    if (state.focusToken?.startsWith('page:')) {
      heading.focus();
      void this.store.dispatch({ type: 'set-focus', focusToken: undefined });
    }
  }

  private renderStatus(state: Readonly<AppState>): void {
    const status = this.required('save-status');
    const inFlight = Object.values(state.operations).some((operation) => operation === 'in_flight');
    status.textContent = state.savesBlocked
      ? 'Conflito: recarregue os dados'
      : inFlight
        ? 'Salvando…'
        : state.committed
          ? 'Salvo localmente'
          : 'Carregando…';
    this.required<HTMLButtonElement>('reload-conflict').hidden = !state.savesBlocked;
    const toast = this.required('toast');
    const notice = state.notices.at(-1);
    toast.textContent = notice?.message ?? '';
    toast.classList.toggle('visible', Boolean(notice));
    toast.classList.toggle('error', notice?.kind === 'error' || notice?.kind === 'conflict');
  }

  private required<T extends HTMLElement = HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing renderer root: ${id}`);
    return node as T;
  }

  stop(): void {
    this.unsubscribe?.();
    this.navigation.unmount();
    this.catalog.unmount();
    this.planner.unmount();
  }
}

void new ApplicationComposition().start();
