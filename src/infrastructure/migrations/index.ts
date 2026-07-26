import type { AppData, Result } from '../../shared/domain';
import {
  migrateV1ToV2,
  type LegacyAppDataV1,
  type MigrationDependencies,
  type MigrationError,
} from './v1-to-v2';

type MigrationState =
  | { schemaVersion: 1; data: LegacyAppDataV1 }
  | { schemaVersion: 2; data: AppData };

type Migration = (
  data: never,
  dependencies: MigrationDependencies,
) => Result<unknown, MigrationError>;

export const migrationRegistry: ReadonlyMap<number, Migration> = new Map([
  [1, migrateV1ToV2 as Migration],
]);

export const migrateSequentially = (
  initial: { schemaVersion: 1; data: LegacyAppDataV1 },
  dependencies: MigrationDependencies = {},
): Result<{ schemaVersion: 2; data: AppData }, MigrationError> => {
  let state: MigrationState = initial;
  while (state.schemaVersion < 2) {
    const migration = migrationRegistry.get(state.schemaVersion);
    if (!migration) {
      return {
        ok: false,
        error: {
          code: 'migration_failed',
          message: `Não há migração registrada para o schema ${state.schemaVersion}.`,
        },
      };
    }
    const migrated = migration(state.data as never, dependencies);
    if (!migrated.ok) return migrated;
    state = {
      schemaVersion: (state.schemaVersion + 1) as 2,
      data: migrated.value as AppData,
    };
  }
  return { ok: true, value: state as { schemaVersion: 2; data: AppData } };
};
