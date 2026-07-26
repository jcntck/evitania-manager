import type { OpenDialogOptions } from 'electron';
import { DESKTOP_CHANNELS, type DesktopError, type DesktopResult } from '../shared/desktop-api';
import type { AppController } from '../controllers/app-controller';
import type { ImageLibrary } from '../infrastructure/image-library';
import type { FolderService } from './folder-service';
import { parseIpcRequest } from './ipc-schemas';

type IpcRegistrar = {
  handle(channel: string, listener: (_event: unknown, ...args: unknown[]) => unknown): void;
};

type ImageDialog = {
  showOpenDialog(options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }>;
};

const invalidRequest = (): DesktopResult<never> => ({
  ok: false,
  error: { code: 'invalid_request', message: 'Solicitação inválida.' },
});

const boundedImageError = (code: DesktopError['code']): DesktopResult<never> => ({
  ok: false,
  error: {
    code,
    message: code === 'image_invalid'
      ? 'A imagem selecionada é inválida.'
      : 'Não foi possível armazenar a imagem.',
  },
});

export const registerIpcHandlers = (
  ipc: IpcRegistrar,
  dependencies: {
    controller: Pick<AppController, 'load' | 'save'>;
    images: Pick<ImageLibrary, 'import'>;
    dialog: ImageDialog;
    folders: Pick<FolderService, 'open'>;
  },
): void => {
  ipc.handle(DESKTOP_CHANNELS.load, (_event, ...args) => {
    if (!parseIpcRequest(DESKTOP_CHANNELS.load, args)) return invalidRequest();
    return dependencies.controller.load();
  });
  ipc.handle(DESKTOP_CHANNELS.save, (_event, ...args) => {
    const parsed = parseIpcRequest(DESKTOP_CHANNELS.save, args);
    return parsed ? dependencies.controller.save(parsed.value) : invalidRequest();
  });
  ipc.handle(DESKTOP_CHANNELS.importImage, async (_event, ...args) => {
    const parsed = parseIpcRequest(DESKTOP_CHANNELS.importImage, args);
    if (!parsed) return invalidRequest();
    try {
      const selected = await dependencies.dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg'] }],
      });
      if (selected.canceled || !selected.filePaths[0]) return { ok: true, value: null };
      const imported = await dependencies.images.import(selected.filePaths[0], parsed.value.category);
      return imported.ok ? imported : boundedImageError(imported.error.code);
    } catch {
      return boundedImageError('native_action_failed');
    }
  });
  ipc.handle(DESKTOP_CHANNELS.openDataDirectory, (_event, ...args) => {
    if (!parseIpcRequest(DESKTOP_CHANNELS.openDataDirectory, args)) return invalidRequest();
    return dependencies.folders.open();
  });
};
