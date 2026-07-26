import { PlanningEngine } from '../../domain/planning-engine';
import { AppDataValidator } from '../../domain/app-data-validator';
import type { PlanningResult } from '../../domain/planning-result';
import type {
  DesktopApi,
  DesktopError,
  VersionedSnapshot,
} from '../../shared/desktop-api';
import type { AppData, EntityCategory } from '../../shared/domain';
import { OperationGuard, type OperationStatus } from './operation-guard';

export type AppPage = 'planner' | EntityCategory | 'settings';
export type PlannerView = 'objectives' | 'consolidated';

export type AppNotice = Readonly<{
  id: string;
  kind: 'info' | 'error' | 'conflict';
  code?: DesktopError['code'];
  message: string;
}>;

export type AppState = Readonly<{
  committed?: VersionedSnapshot;
  candidate?: AppData;
  conflictCandidate?: AppData;
  page: AppPage;
  plannerView: PlannerView;
  drafts: Readonly<Record<string, unknown>>;
  focusToken?: string;
  operations: Readonly<Record<string, OperationStatus>>;
  notices: readonly AppNotice[];
  planning?: PlanningResult;
  savesBlocked: boolean;
}>;

export type AppAction =
  | Readonly<{ type: 'navigate'; page: AppPage; focusToken?: string }>
  | Readonly<{ type: 'set-planner-view'; view: PlannerView }>
  | Readonly<{ type: 'set-draft'; key: string; value: unknown; focusToken?: string }>
  | Readonly<{ type: 'discard-draft'; key: string; focusToken?: string }>
  | Readonly<{ type: 'set-focus'; focusToken?: string }>
  | Readonly<{
    type: 'add-notice';
    kind: AppNotice['kind'];
    message: string;
    code?: DesktopError['code'];
  }>
  | Readonly<{
    type: 'mutate-and-save';
    operationId: string;
    update(data: Readonly<AppData>): AppData;
  }>
  | Readonly<{ type: 'reload'; operationId: string }>
  | Readonly<{ type: 'dismiss-notice'; id: string }>;

type Subscriber = (state: AppState) => void;

const cloneData = (data: Readonly<AppData>): AppData => structuredClone(data);

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
};

const freezeState = (state: AppState): AppState => {
  if (state.candidate) deepFreeze(state.candidate);
  if (state.conflictCandidate) deepFreeze(state.conflictCandidate);
  return Object.freeze({
    ...state,
    drafts: Object.freeze({ ...state.drafts }),
    operations: Object.freeze({ ...state.operations }),
    notices: Object.freeze([...state.notices]),
  });
};

export class AppStore {
  private stateValue: AppState = freezeState({
    page: 'planner',
    plannerView: 'objectives',
    drafts: {},
    operations: {},
    notices: [],
    savesBlocked: false,
  });
  private effectQueue: Promise<void> = Promise.resolve();
  private readonly subscribers = new Set<Subscriber>();
  private readonly guard = new OperationGuard();
  private readonly submitted = new Set<string>();
  private readonly operationCandidates = new Map<string, AppData>();

  constructor(
    private readonly desktop: DesktopApi,
    private readonly planningEngine: Pick<PlanningEngine, 'calculate'> = new PlanningEngine(),
    private readonly validator: Pick<AppDataValidator, 'validate'> = new AppDataValidator(),
  ) {}

  get state(): AppState {
    return this.stateValue;
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.stateValue);
    return () => this.subscribers.delete(subscriber);
  }

  initialize(): Promise<void> {
    return this.enqueue(async () => {
      const loaded = await this.desktop.load();
      if (!loaded.ok) {
        this.addNotice('error', loaded.error.message, loaded.error.code);
        return;
      }
      this.acceptSnapshot(loaded.value, false);
      if (loaded.value.notice) this.addNotice('info', loaded.value.notice.message);
    });
  }

  dispatch(action: AppAction): Promise<void> {
    if ((action.type === 'mutate-and-save' || action.type === 'reload')
      && this.submitted.has(action.operationId)) return Promise.resolve();
    if (action.type === 'mutate-and-save' || action.type === 'reload') {
      this.submitted.add(action.operationId);
    }
    return this.enqueue(async () => {
      if (action.type === 'navigate') {
        this.patch({ page: action.page, ...(action.focusToken ? { focusToken: action.focusToken } : {}) });
        return;
      }
      if (action.type === 'set-planner-view') {
        this.patch({ plannerView: action.view });
        return;
      }
      if (action.type === 'set-draft') {
        this.patch({
          drafts: { ...this.stateValue.drafts, [action.key]: structuredClone(action.value) },
          ...(action.focusToken ? { focusToken: action.focusToken } : {}),
        });
        return;
      }
      if (action.type === 'discard-draft') {
        const drafts = { ...this.stateValue.drafts };
        delete drafts[action.key];
        this.patch({ drafts, ...(action.focusToken ? { focusToken: action.focusToken } : {}) });
        return;
      }
      if (action.type === 'set-focus') {
        this.patch({ focusToken: action.focusToken });
        return;
      }
      if (action.type === 'add-notice') {
        this.addNotice(action.kind, action.message, action.code);
        return;
      }
      if (action.type === 'dismiss-notice') {
        this.patch({ notices: this.stateValue.notices.filter((notice) => notice.id !== action.id) });
        return;
      }
      if (action.type === 'reload') {
        await this.reload(action.operationId);
        return;
      }
      await this.mutateAndSave(action);
    });
  }

  whenIdle(): Promise<void> {
    return this.effectQueue;
  }

  private enqueue(effect: () => Promise<void>): Promise<void> {
    const next = this.effectQueue.then(effect, effect);
    this.effectQueue = next.catch(() => undefined);
    return next;
  }

  private async mutateAndSave(action: Extract<AppAction, { type: 'mutate-and-save' }>): Promise<void> {
    if (!this.stateValue.committed || this.stateValue.savesBlocked) {
      this.submitted.delete(action.operationId);
      return;
    }
    const existingCandidate = this.operationCandidates.get(action.operationId);
    const base = this.stateValue.candidate ?? this.stateValue.committed.data;
    let candidate: AppData;
    try {
      candidate = existingCandidate ?? cloneData(action.update(cloneData(base)));
      this.validator.validate(candidate);
    } catch {
      this.submitted.delete(action.operationId);
      this.addNotice('error', 'A alteração candidata é inválida.', 'invalid_request');
      return;
    }
    this.operationCandidates.set(action.operationId, candidate);
    this.patch({ candidate, planning: this.calculate(candidate) });
    this.patch({ operations: { ...this.stateValue.operations, [action.operationId]: 'in_flight' } });
    const result = await this.guard.run(action.operationId, () => this.desktop.save({
      expectedRevision: this.stateValue.committed!.revision,
      data: candidate,
    }));
    this.syncOperation(action.operationId);
    if (result.ok) {
      this.operationCandidates.delete(action.operationId);
      this.acceptSnapshot(result.value, false);
      return;
    }
    this.submitted.delete(action.operationId);
    if (result.error.code === 'revision_conflict') {
      this.patch({
        candidate,
        conflictCandidate: candidate,
        savesBlocked: true,
      });
      this.addNotice('conflict', 'Os dados locais mudaram. Recarregue para continuar.', result.error.code);
      return;
    }
    this.addNotice('error', result.error.message, result.error.code);
  }

  private async reload(operationId: string): Promise<void> {
    this.patch({ operations: { ...this.stateValue.operations, [operationId]: 'in_flight' } });
    const result = await this.guard.run(operationId, () => this.desktop.load());
    this.syncOperation(operationId);
    if (!result.ok) {
      this.submitted.delete(operationId);
      this.addNotice('error', result.error.message, result.error.code);
      return;
    }
    this.acceptSnapshot(result.value, true);
  }

  private acceptSnapshot(snapshot: VersionedSnapshot, discardConflict: boolean): void {
    const data = cloneData(snapshot.data);
    this.patch({
      committed: Object.freeze({ ...snapshot, data }),
      candidate: data,
      planning: this.calculate(data),
      ...(discardConflict ? { conflictCandidate: undefined } : {}),
      savesBlocked: false,
    });
  }

  private calculate(data: Readonly<AppData>): PlanningResult {
    return this.planningEngine.calculate({ catalog: data.catalog, planning: data.planning });
  }

  private syncOperation(operationId: string): void {
    const status = this.guard.status(operationId);
    if (status) this.patch({ operations: { ...this.stateValue.operations, [operationId]: status } });
  }

  private addNotice(
    kind: AppNotice['kind'],
    message: string,
    code?: DesktopError['code'],
  ): void {
    const notice: AppNotice = Object.freeze({
      id: `${Date.now()}-${this.stateValue.notices.length}`,
      kind,
      message,
      ...(code ? { code } : {}),
    });
    this.patch({ notices: [...this.stateValue.notices, notice] });
  }

  private patch(patch: Partial<AppState>): void {
    this.stateValue = freezeState({ ...this.stateValue, ...patch });
    for (const subscriber of this.subscribers) subscriber(this.stateValue);
  }
}
