import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppController } from '../controllers/app-controller';
import { DiagnosticLogger } from '../infrastructure/diagnostic-logger';
import { ImageLibrary } from '../infrastructure/image-library';
import { JsonAppRepository } from '../infrastructure/json-app-repository';
import { FolderService } from './folder-service';
import { registerIpcHandlers } from './ipc-handlers';

protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { secure: true, supportFetchAPI: true, standard: true } },
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  if (!app.isPackaged && process.env.EVITANIA_E2E_USER_DATA) {
    app.setPath('userData', resolve(process.env.EVITANIA_E2E_USER_DATA));
  }
  let mainWindow: BrowserWindow | undefined;

  const createWindow = (): BrowserWindow => {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : join(__dirname, '../../../assets/app/icon.png');
    const window = new BrowserWindow({
      width: 1360,
      height: 850,
      minWidth: 1040,
      minHeight: 680,
      backgroundColor: '#0d1514',
      icon: iconPath,
      webPreferences: {
        preload: join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    void window.loadFile(join(__dirname, '../../renderer/index.html'));
    return window;
  };

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    const userDataPath = app.getPath('userData');
    const seedPath = app.isPackaged
      ? join(process.resourcesPath, 'seed', 'seed-v2.json')
      : join(__dirname, '../../../assets/seed/seed-v2.json');
    const diagnostics = new DiagnosticLogger(join(userDataPath, 'diagnostics', 'events.jsonl'));
    diagnostics.event('app_start', { platform: process.platform });
    const images = new ImageLibrary(join(userDataPath, 'assets'), { diagnostics });
    const repository = new JsonAppRepository(join(userDataPath, 'evitania-data.json'), { seedPath });
    const controller = new AppController(repository, images, diagnostics);
    const folderMode = !app.isPackaged ? process.env.EVITANIA_E2E_FOLDER_MODE : undefined;
    const folderShell = folderMode === 'success'
      ? { openPath: async () => '' }
      : folderMode === 'denied'
        ? { openPath: async () => 'denied' }
        : shell;
    const folders = new FolderService(userDataPath, folderShell, undefined, diagnostics);
    const imageSequence = !app.isPackaged && process.env.EVITANIA_E2E_IMAGE_SEQUENCE
      ? (() => {
        try {
          const parsed = JSON.parse(process.env.EVITANIA_E2E_IMAGE_SEQUENCE) as unknown;
          return Array.isArray(parsed)
            && parsed.every((entry) => entry === null || typeof entry === 'string')
            ? [...parsed] as Array<string | null>
            : undefined;
        } catch {
          return undefined;
        }
      })()
      : undefined;
    const imageDialog = imageSequence
      ? {
        showOpenDialog: async () => {
          const selected = imageSequence.shift();
          return selected
            ? { canceled: false, filePaths: [selected] }
            : { canceled: true, filePaths: [] };
        },
      }
      : dialog;

    protocol.handle('asset', (request) => {
      const filePath = images.resolve(request.url);
      return filePath
        ? net.fetch(pathToFileURL(filePath).toString())
        : new Response(null, { status: 404 });
    });
    registerIpcHandlers(ipcMain, { controller, images, dialog: imageDialog, folders });
    mainWindow = createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
