import type { DesktopResult } from '../../shared/desktop-api';

export type OperationStatus = 'in_flight' | 'succeeded' | 'failed';

export class OperationGuard {
  private readonly statuses = new Map<string, OperationStatus>();
  private readonly inFlight = new Map<string, Promise<DesktopResult<unknown>>>();

  status(operationId: string): OperationStatus | undefined {
    return this.statuses.get(operationId);
  }

  run<T>(operationId: string, operation: () => Promise<DesktopResult<T>>): Promise<DesktopResult<T>> {
    const existing = this.inFlight.get(operationId);
    if (existing) return existing as Promise<DesktopResult<T>>;
    if (this.statuses.get(operationId) === 'succeeded') {
      return Promise.resolve({
        ok: false,
        error: { code: 'invalid_request', message: 'A operação já foi concluída.' },
      });
    }
    this.statuses.set(operationId, 'in_flight');
    const pending = operation().then((result) => {
      this.inFlight.delete(operationId);
      this.statuses.set(operationId, result.ok ? 'succeeded' : 'failed');
      return result;
    }, () => {
      this.inFlight.delete(operationId);
      this.statuses.set(operationId, 'failed');
      return {
        ok: false,
        error: { code: 'storage_unavailable', message: 'A operação não pôde ser concluída.' },
      } as DesktopResult<T>;
    });
    this.inFlight.set(operationId, pending as Promise<DesktopResult<unknown>>);
    return pending;
  }
}
