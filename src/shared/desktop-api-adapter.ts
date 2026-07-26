import {
  DESKTOP_CHANNELS,
  freezeDesktopApi,
  type DesktopApi,
  type DesktopResult,
  type ManagedImage,
  type SaveSnapshotOutput,
  type VersionedSnapshot,
} from './desktop-api';

export type IpcInvoker = {
  invoke(channel: string, ...args: readonly unknown[]): Promise<unknown>;
};

export const createDesktopApi = (ipc: IpcInvoker): DesktopApi => freezeDesktopApi({
  load: () => ipc.invoke(DESKTOP_CHANNELS.load) as Promise<DesktopResult<VersionedSnapshot>>,
  save: (input) => ipc.invoke(DESKTOP_CHANNELS.save, input) as Promise<DesktopResult<SaveSnapshotOutput>>,
  importImage: (input) =>
    ipc.invoke(DESKTOP_CHANNELS.importImage, input) as Promise<DesktopResult<ManagedImage>>,
  openDataDirectory: () =>
    ipc.invoke(DESKTOP_CHANNELS.openDataDirectory) as Promise<DesktopResult<void>>,
});
