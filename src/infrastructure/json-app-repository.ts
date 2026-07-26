import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppDataValidationError, AppDataValidator } from '../domain/app-data-validator';
import type { AppData, Result } from '../shared/domain';
import { AtomicSnapshotWriter, type AtomicWriteError } from './atomic-snapshot-writer';
import { SeedLoader, type SeedNoticeCode } from './seed-loader';
import {
  CURRENT_SCHEMA_VERSION,
  decodeAndMigrateStoredSnapshot,
  decodeStorageEnvelope,
  encodeStorageEnvelope,
  type StorageDecodeError,
  type VersionedSnapshot,
} from './storage-schema';

export type RepositoryErrorCode =
  | 'invalid_request'
  | 'revision_conflict'
  | 'data_corrupt'
  | 'migration_failed'
  | 'storage_unavailable';

export type RepositoryError = {
  code: RepositoryErrorCode;
  message: string;
  details?: Readonly<Record<string, unknown>>;
};

export type LoadNotice = {
  code: SeedNoticeCode | 'recovered_backup' | 'migration_applied';
  message: string;
};

export type LoadedSnapshot = VersionedSnapshot & { notice?: LoadNotice };
export type LoadOutcome = Result<LoadedSnapshot, RepositoryError>;
export type SaveOutcome = Result<VersionedSnapshot, RepositoryError>;

export interface AppRepository {
  load(): Promise<LoadOutcome>;
  save(input: { expectedRevision: number; data: AppData }): Promise<SaveOutcome>;
}

export type RepositoryFileSystem = {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  exists(path: string): Promise<boolean>;
};

const nodeFileSystem: RepositoryFileSystem = {
  mkdir,
  readFile,
  exists: async (path) => {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return false;
      throw error;
    }
  },
};

export type JsonAppRepositoryOptions = {
  validator?: AppDataValidator;
  writer?: AtomicSnapshotWriter;
  seedLoader?: SeedLoader;
  seedPath?: string;
  fileSystem?: RepositoryFileSystem;
  now?: () => string;
  createMigrationId?: (entityId: string, index: number) => string;
};

const locks = new Map<string, Promise<void>>();

const withPathLock = async <T>(path: string, action: () => Promise<T>): Promise<T> => {
  const key = resolve(path);
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });
  const queued = previous.then(() => current);
  locks.set(key, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
};

export class JsonAppRepository implements AppRepository {
  private readonly validator: AppDataValidator;
  private readonly writer: AtomicSnapshotWriter;
  private readonly seedLoader: SeedLoader;
  private readonly fileSystem: RepositoryFileSystem;
  private readonly now: () => string;
  private readonly createMigrationId?: (entityId: string, index: number) => string;

  constructor(
    readonly filePath: string,
    options: JsonAppRepositoryOptions = {},
  ) {
    this.validator = options.validator ?? new AppDataValidator();
    this.writer = options.writer ?? new AtomicSnapshotWriter();
    this.fileSystem = options.fileSystem ?? nodeFileSystem;
    this.seedLoader = options.seedLoader ?? new SeedLoader(options.seedPath, this.validator);
    this.now = options.now ?? (() => new Date().toISOString());
    this.createMigrationId = options.createMigrationId;
  }

  async load(): Promise<LoadOutcome> {
    return withPathLock(this.filePath, async () => {
      try {
        await this.fileSystem.mkdir(dirname(this.filePath), { recursive: true });
        const primaryExists = await this.fileSystem.exists(this.filePath);
        const backupExists = await this.fileSystem.exists(this.backupPath);

        const primary = primaryExists ? await this.readStored(this.filePath) : undefined;
        if (primary?.ok) {
          if (primary.value.migratedFrom) {
            const persistedMigration = await this.writer.write({
              primaryPath: this.filePath,
              contents: encodeStorageEnvelope(primary.value.snapshot),
            });
            if (!persistedMigration.ok) return persistedMigration;
          }
          return {
            ok: true,
            value: this.withNotice(primary.value.snapshot,
              primary.value.migratedFrom ? 'migration_applied' : undefined),
          };
        }

        const backup = backupExists ? await this.readStored(this.backupPath) : undefined;
        if (backup?.ok) {
          const restored = await this.writer.write({
            primaryPath: this.filePath,
            contents: encodeStorageEnvelope(backup.value.snapshot),
            rotateBackup: false,
          });
          if (!restored.ok) return restored;
          return {
            ok: true,
            value: this.withNotice(backup.value.snapshot, 'recovered_backup'),
          };
        }

        if (primaryExists || backupExists) {
          return {
            ok: false,
            error: this.corruptError(primary && !primary.ok ? primary.error : undefined,
              backup && !backup.ok ? backup.error : undefined),
          };
        }

        const seed = await this.seedLoader.read();
        const snapshot: VersionedSnapshot = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          revision: 1,
          writtenAt: this.now(),
          data: seed.data,
        };
        const initialized = await this.writer.write({
          primaryPath: this.filePath,
          contents: encodeStorageEnvelope(snapshot),
          rotateBackup: false,
        });
        if (!initialized.ok) return initialized;
        return {
          ok: true,
          value: this.withNotice(snapshot, seed.kind === 'seed' ? 'seed_initialized' : 'empty_initialized'),
        };
      } catch (error) {
        return { ok: false, error: this.storageError(error) };
      }
    });
  }

  async save(input: { expectedRevision: number; data: AppData }): Promise<SaveOutcome> {
    return withPathLock(this.filePath, async () => {
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
        return {
          ok: false,
          error: { code: 'invalid_request', message: 'Revisão esperada inválida.' },
        };
      }
      try {
        const persistedText = await this.fileSystem.readFile(this.filePath, 'utf8');
        const persisted = decodeAndMigrateStoredSnapshot(persistedText, {
          validator: this.validator,
          now: this.now,
          ...(this.createMigrationId ? { createId: this.createMigrationId } : {}),
        });
        if (!persisted.ok) {
          return { ok: false, error: this.corruptError(persisted.error, undefined) };
        }
        if (persisted.value.snapshot.revision !== input.expectedRevision) {
          return {
            ok: false,
            error: {
              code: 'revision_conflict',
              message: 'O workspace foi alterado desde a última leitura.',
              details: {
                expectedRevision: input.expectedRevision,
                actualRevision: persisted.value.snapshot.revision,
              },
            },
          };
        }
        try {
          this.validator.validate(input.data);
        } catch (error) {
          return {
            ok: false,
            error: {
              code: 'invalid_request',
              message: 'O snapshot candidato é inválido.',
              ...(error instanceof AppDataValidationError ? { details: { issues: error.issues } } : {}),
            },
          };
        }
        const snapshot: VersionedSnapshot = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          revision: input.expectedRevision + 1,
          writtenAt: this.now(),
          data: structuredClone(input.data),
        };
        const committed = await this.writer.write({
          primaryPath: this.filePath,
          contents: encodeStorageEnvelope(snapshot),
        });
        return committed.ok ? { ok: true, value: snapshot } : committed;
      } catch (error) {
        return { ok: false, error: this.storageError(error) };
      }
    });
  }

  private get backupPath(): string {
    return `${this.filePath}.backup`;
  }

  private async readStored(path: string): Promise<ReturnType<typeof decodeAndMigrateStoredSnapshot>> {
    const text = await this.fileSystem.readFile(path, 'utf8');
    return decodeAndMigrateStoredSnapshot(text, {
      validator: this.validator,
      now: this.now,
      ...(this.createMigrationId ? { createId: this.createMigrationId } : {}),
    });
  }

  private withNotice(snapshot: VersionedSnapshot, code?: LoadNotice['code']): LoadedSnapshot {
    if (!code) return snapshot;
    const messages: Record<LoadNotice['code'], string> = {
      recovered_backup: 'O arquivo principal estava inválido e foi recuperado do backup.',
      seed_initialized: 'O catálogo inicial foi instalado neste primeiro uso.',
      empty_initialized: 'Nenhum catálogo inicial válido estava disponível; o workspace vazio está pronto.',
      migration_applied: 'Os dados locais foram migrados para o schema atual.',
    };
    return { ...snapshot, notice: { code, message: messages[code] } };
  }

  private corruptError(primary?: StorageDecodeError, backup?: StorageDecodeError): RepositoryError {
    const migration = [primary, backup].find((error) => error?.code === 'migration_failed');
    if (migration) {
      return { code: 'migration_failed', message: migration.message, details: migration.details };
    }
    return {
      code: 'data_corrupt',
      message: 'Os arquivos de dados existentes não puderam ser validados.',
      details: {
        ...(primary ? { primary: primary.code } : {}),
        ...(backup ? { backup: backup.code } : {}),
      },
    };
  }

  private storageError(error: unknown): RepositoryError {
    if (isAtomicWriteError(error)) return error;
    return {
      code: 'storage_unavailable',
      message: 'O armazenamento local não está disponível.',
      details: { reason: error instanceof Error ? error.message : 'unknown' },
    };
  }
}

const isAtomicWriteError = (error: unknown): error is AtomicWriteError =>
  typeof error === 'object' && error !== null && 'code' in error
  && (error as { code: unknown }).code === 'storage_unavailable';

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error;
