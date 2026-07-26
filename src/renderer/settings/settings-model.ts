import type { DesktopApi } from '../../shared/desktop-api';
import type { AppNotice } from '../store/app-store';

export const settingsState = Object.freeze({
  synchronization: Object.freeze({
    visible: true,
    disabled: true,
    label: 'Sincronizar (indisponível)',
  }),
});

export const openDataDirectory = async (
  desktop: Pick<DesktopApi, 'openDataDirectory'>,
): Promise<AppNotice> => {
  const result = await desktop.openDataDirectory();
  return result.ok
    ? { id: 'data-directory-opened', kind: 'info', message: 'Local dos dados aberto.' }
    : {
      id: 'data-directory-failed',
      kind: 'error',
      code: result.error.code,
      message: 'Não foi possível abrir o local dos dados. Tente novamente.',
    };
};
