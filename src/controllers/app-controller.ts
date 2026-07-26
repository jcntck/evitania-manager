import type {
  DesktopError,
  DesktopResult,
  SaveSnapshotInput,
  SaveSnapshotOutput,
  VersionedSnapshot,
} from '../shared/desktop-api';
import type { AppRepository, RepositoryError } from '../infrastructure/json-app-repository';
import type { ImageLibrary } from '../infrastructure/image-library';

const allowedDetails = (error: RepositoryError): DesktopError['details'] => {
  if (error.code !== 'revision_conflict') return undefined;
  const expectedRevision = error.details?.expectedRevision;
  const actualRevision = error.details?.actualRevision;
  return typeof expectedRevision === 'number' && typeof actualRevision === 'number'
    ? { expectedRevision, actualRevision }
    : undefined;
};

const mapRepositoryError = (error: RepositoryError): DesktopError => ({
  code: error.code,
  message: error.message,
  ...(allowedDetails(error) ? { details: allowedDetails(error) } : {}),
});

export class AppController {
  constructor(
    private readonly repository: AppRepository,
    private readonly images?: Pick<ImageLibrary, 'collectOrphans'>,
    private readonly diagnostics?: {
      event(
        name: 'save_committed' | 'save_conflict' | 'save_failed',
        fields?: Readonly<Record<string, unknown>>,
      ): void;
    },
  ) {}

  async load(): Promise<DesktopResult<VersionedSnapshot>> {
    const outcome = await this.repository.load();
    return outcome.ok
      ? { ok: true, value: outcome.value }
      : { ok: false, error: mapRepositoryError(outcome.error) };
  }

  async save(input: SaveSnapshotInput): Promise<DesktopResult<SaveSnapshotOutput>> {
    const outcome = await this.repository.save(input);
    if (!outcome.ok) {
      this.diagnostics?.event(
        outcome.error.code === 'revision_conflict' ? 'save_conflict' : 'save_failed',
        { errorCode: outcome.error.code, revision: input.expectedRevision },
      );
      return { ok: false, error: mapRepositoryError(outcome.error) };
    }
    if (this.images) {
      await this.images.collectOrphans(outcome.value.data).catch(() => undefined);
    }
    this.diagnostics?.event('save_committed', { revision: outcome.value.revision });
    return { ok: true, value: outcome.value };
  }
}
