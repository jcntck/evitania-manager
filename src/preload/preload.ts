import { contextBridge, ipcRenderer } from 'electron';
import type { DESKTOP_CHANNELS, DesktopApi } from '../shared/desktop-api';

const channels = {
  load: 'app:load',
  save: 'app:save',
  importImage: 'image:import',
  openDataDirectory: 'folder:open',
} as const satisfies typeof DESKTOP_CHANNELS;

const desktopApi: DesktopApi = Object.freeze({
  load: () => ipcRenderer.invoke(channels.load),
  save: (input) => ipcRenderer.invoke(channels.save, input),
  importImage: (input) => ipcRenderer.invoke(channels.importImage, input),
  openDataDirectory: () => ipcRenderer.invoke(channels.openDataDirectory),
});

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
