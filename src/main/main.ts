import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EntityCategory } from '../shared/domain';
import { AppController } from '../controllers/app-controller';
import { JsonAppRepository } from '../infrastructure/json-app-repository';
import { ImageLibrary } from '../infrastructure/image-library';

protocol.registerSchemesAsPrivileged([{ scheme: 'asset', privileges: { secure: true, supportFetchAPI: true } }]);

let controller: AppController;
let imageLibrary: ImageLibrary;

const createWindow = (): void => {
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../../assets/app/icon.png');
  const window = new BrowserWindow({
    width: 1360, height: 850, minWidth: 1040, minHeight: 680,
    backgroundColor: '#0d1514',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  void window.loadFile(join(__dirname, '../../renderer/index.html'));
};

const registerIpc = (): void => {
  ipcMain.handle('app:load', () => controller.load());
  ipcMain.handle('app:save', (_event, data: unknown) => controller.save(data));
  ipcMain.handle('image:select', (_event, category: EntityCategory) => selectImage(category));
  ipcMain.handle('folder:open', () => shell.openPath(app.getPath('userData')));
};

const selectImage = async (category: EntityCategory): Promise<string | null> => {
  const allowedCategories: EntityCategory[] = ['items', 'resources', 'recipes', 'smeltery', 'monsters', 'bosses'];
  if (!allowedCategories.includes(category)) throw new Error('Categoria de imagem inválida.');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'], filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return imageLibrary.import(result.filePaths[0], category);
};

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  controller = new AppController(new JsonAppRepository(join(userDataPath, 'evitania-data.json')));
  imageLibrary = new ImageLibrary(join(userDataPath, 'assets'));
  protocol.handle('asset', (request) => {
    const filePath = imageLibrary.resolve(request.url);
    return filePath ? net.fetch(pathToFileURL(filePath).toString()) : new Response(null, { status: 404 });
  });
  registerIpc();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
