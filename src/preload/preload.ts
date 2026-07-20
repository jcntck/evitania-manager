import { contextBridge, ipcRenderer } from 'electron';
import type { AppData, EntityCategory } from '../shared/domain';
import type { DesktopApi } from '../shared/desktop-api';

const desktopApi: DesktopApi = {
  load: () => ipcRenderer.invoke('app:load') as Promise<AppData>,
  save: (data: AppData) => ipcRenderer.invoke('app:save', data) as Promise<void>,
  selectImage: (category: EntityCategory) => ipcRenderer.invoke('image:select', category) as Promise<string | null>,
  openDataFolder: () => ipcRenderer.invoke('folder:open') as Promise<void>,
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
