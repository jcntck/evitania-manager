import { mkdir } from 'node:fs/promises';
import type { DesktopResult } from '../shared/desktop-api';

export type FolderFileSystem = {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
};

export type FolderShell = {
  openPath(path: string): Promise<string>;
};

export class FolderService {
  constructor(
    private readonly dataDirectory: string,
    private readonly shell: FolderShell,
    private readonly fileSystem: FolderFileSystem = { mkdir },
    private readonly diagnostics?: {
      event(name: 'native_action_failed', fields?: Readonly<Record<string, unknown>>): void;
    },
  ) {}

  async open(): Promise<DesktopResult<void>> {
    try {
      await this.fileSystem.mkdir(this.dataDirectory, { recursive: true });
      const failure = await this.shell.openPath(this.dataDirectory);
      if (failure) return this.failed();
      return { ok: true, value: undefined };
    } catch {
      return this.failed();
    }
  }

  private failed(): DesktopResult<void> {
    this.diagnostics?.event('native_action_failed');
    return {
      ok: false,
      error: {
        code: 'native_action_failed',
        message: 'Não foi possível abrir o local dos dados. Tente novamente.',
      },
    };
  }
}
