const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { createSeed } = require('./wiki-importer');

const filePath = () => path.join(app.getPath('userData'), 'evitania-data.json');
async function readData() {
  try {
    const data = JSON.parse(await fs.readFile(filePath(), 'utf8'));
    return data.version === 2 ? data : createSeed(path.join(__dirname, '..', 'docs', 'base-cadastro.xlsx'));
  }
  catch { return createSeed(path.join(__dirname, '..', 'docs', 'base-cadastro.xlsx')); }
}
async function writeData(data) {
  await fs.mkdir(path.dirname(filePath()), { recursive: true });
  await fs.writeFile(filePath(), JSON.stringify(data, null, 2), 'utf8');
}
function createWindow() {
  const window = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1000, minHeight: 650,
    backgroundColor: '#101820',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => {
  ipcMain.handle('data:load', readData);
  ipcMain.handle('data:save', (_, data) => writeData(data));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
