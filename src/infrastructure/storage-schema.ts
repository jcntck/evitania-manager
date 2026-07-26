import { AppDataValidationError, AppDataValidator } from '../domain/app-data-validator';
import type { AppData, Result } from '../shared/domain';
import {
  type LegacyAppDataV1, type MigrationDependencies,
} from './migrations/v1-to-v2';
import { migrateSequentially } from './migrations';

export const CURRENT_SCHEMA_VERSION = 2 as const;

export type StorageEnvelope = {
  schemaVersion: 2;
  revision: number;
  writtenAt: string;
  data: AppData;
};

export type VersionedSnapshot = Readonly<StorageEnvelope>;

export type StorageDecodeErrorCode =
  | 'malformed_json'
  | 'invalid_envelope'
  | 'unknown_schema'
  | 'invalid_domain'
  | 'migration_failed';

export type StorageDecodeError = {
  code: StorageDecodeErrorCode;
  message: string;
  details?: Readonly<Record<string, unknown>>;
};

type LegacyStorageEnvelope = {
  schemaVersion: 1;
  revision: number;
  writtenAt: string;
  data: LegacyAppDataV1;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactEnvelope = (value: Record<string, unknown>): boolean =>
  Object.keys(value).length === 4
  && Object.hasOwn(value, 'schemaVersion')
  && Object.hasOwn(value, 'revision')
  && Object.hasOwn(value, 'writtenAt')
  && Object.hasOwn(value, 'data');

const validRevision = (revision: unknown): revision is number =>
  Number.isSafeInteger(revision) && typeof revision === 'number' && revision >= 1;

const validWrittenAt = (writtenAt: unknown): writtenAt is string =>
  typeof writtenAt === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(writtenAt)
  && !Number.isNaN(Date.parse(writtenAt));

const parseJson = (input: string | unknown): Result<unknown, StorageDecodeError> => {
  if (typeof input !== 'string') return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch {
    return {
      ok: false,
      error: { code: 'malformed_json', message: 'O arquivo JSON está malformado.' },
    };
  }
};

export const decodeStorageEnvelope = (
  input: string | unknown,
  validator = new AppDataValidator(),
): Result<VersionedSnapshot, StorageDecodeError> => {
  const parsed = parseJson(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (!isRecord(value) || !exactEnvelope(value)) {
    return { ok: false, error: { code: 'invalid_envelope', message: 'Envelope de armazenamento inválido.' } };
  }
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: { code: 'unknown_schema', message: 'Versão de schema desconhecida.' } };
  }
  if (!validRevision(value.revision) || !validWrittenAt(value.writtenAt)) {
    return { ok: false, error: { code: 'invalid_envelope', message: 'Metadados do envelope inválidos.' } };
  }
  try {
    const domainValidator: AppDataValidator = validator;
    domainValidator.validate(value.data);
    return { ok: true, value: value as VersionedSnapshot };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'invalid_domain',
        message: 'O snapshot contém dados de domínio inválidos.',
        ...(error instanceof AppDataValidationError ? { details: { issues: error.issues } } : {}),
      },
    };
  }
};

export type DecodedStoredSnapshot = {
  snapshot: VersionedSnapshot;
  migratedFrom?: number;
};

export const decodeAndMigrateStoredSnapshot = (
  input: string | unknown,
  migrationDependencies: MigrationDependencies = {},
): Result<DecodedStoredSnapshot, StorageDecodeError> => {
  const parsed = parseJson(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (isRecord(value) && value.schemaVersion === CURRENT_SCHEMA_VERSION) {
    const current = decodeStorageEnvelope(value, migrationDependencies.validator);
    return current.ok ? { ok: true, value: { snapshot: current.value } } : current;
  }

  let legacyData: LegacyAppDataV1;
  let revision = 1;
  let writtenAt = new Date(0).toISOString();
  if (isRecord(value) && value.schemaVersion === 1) {
    if (!exactEnvelope(value) || !validRevision(value.revision) || !validWrittenAt(value.writtenAt)) {
      return { ok: false, error: { code: 'invalid_envelope', message: 'Envelope schema-v1 inválido.' } };
    }
    legacyData = (value as LegacyStorageEnvelope).data;
    revision = value.revision;
    writtenAt = value.writtenAt;
  } else if (isRecord(value) && value.version === 1) {
    legacyData = value as unknown as LegacyAppDataV1;
  } else if (isRecord(value) && ('schemaVersion' in value || 'version' in value)) {
    return { ok: false, error: { code: 'unknown_schema', message: 'Versão de schema desconhecida.' } };
  } else {
    return { ok: false, error: { code: 'invalid_envelope', message: 'Envelope de armazenamento inválido.' } };
  }

  const migrated = migrateSequentially({ schemaVersion: 1, data: legacyData }, migrationDependencies);
  if (!migrated.ok) return { ok: false, error: migrated.error };
  return {
    ok: true,
    value: {
      snapshot: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        revision,
        writtenAt,
        data: migrated.value.data,
      },
      migratedFrom: 1,
    },
  };
};

export const encodeStorageEnvelope = (snapshot: VersionedSnapshot): string =>
  `${JSON.stringify(snapshot, null, 2)}\n`;
