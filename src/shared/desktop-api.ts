import type { AppData, EntityCategory } from './domain';

export type DesktopApi = {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  selectImage(category: EntityCategory): Promise<string | null>;
  openDataFolder(): Promise<void>;
};
