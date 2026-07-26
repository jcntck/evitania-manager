import type { AppData, EntityCategory, Result } from './domain';

export const DESKTOP_CHANNELS = {
  load: 'app:load',
  save: 'app:save',
  importImage: 'image:import',
  openDataDirectory: 'folder:open',
} as const;

export type DesktopChannel = typeof DESKTOP_CHANNELS[keyof typeof DESKTOP_CHANNELS];

export type DesktopErrorCode =
  | 'invalid_request'
  | 'revision_conflict'
  | 'data_corrupt'
  | 'migration_failed'
  | 'storage_unavailable'
  | 'image_invalid'
  | 'native_action_failed'
  | 'calculation_limit';

export type DesktopError = Readonly<{
  code: DesktopErrorCode;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export type SnapshotNotice = Readonly<{
  code: string;
  message: string;
}>;

export type VersionedSnapshot = Readonly<{
  schemaVersion: 2;
  revision: number;
  writtenAt: string;
  data: AppData;
  notice?: SnapshotNotice;
}>;

export type SaveSnapshotInput = Readonly<{
  expectedRevision: number;
  data: AppData;
}>;

export type SaveSnapshotOutput = VersionedSnapshot;
export type ImportImageInput = Readonly<{ category: EntityCategory }>;
export type ManagedImage = string | null;
export type DesktopResult<T> = Result<T, DesktopError>;

export type DesktopApi = Readonly<{
  load(): Promise<DesktopResult<VersionedSnapshot>>;
  save(input: SaveSnapshotInput): Promise<DesktopResult<SaveSnapshotOutput>>;
  importImage(input: ImportImageInput): Promise<DesktopResult<ManagedImage>>;
  openDataDirectory(): Promise<DesktopResult<void>>;
}>;

export const freezeDesktopApi = (api: DesktopApi): DesktopApi => Object.freeze(api);
