const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storage', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data)
});
