import {
  copyFile, mkdir, open, rename, unlink, writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export type AtomicWriteStage =
  | 'before_temp_write'
  | 'after_temp_write'
  | 'before_temp_flush'
  | 'after_temp_flush'
  | 'before_backup_copy'
  | 'after_backup_copy'
  | 'before_backup_rename'
  | 'after_backup_rename'
  | 'before_primary_rename'
  | 'after_primary_rename'
  | 'before_directory_sync'
  | 'after_directory_sync';

export interface FileHandleBoundary {
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
  open(path: string, flags: string): Promise<FileHandleBoundary>;
}

const nodeFileSystem: AtomicFileSystem = {
  mkdir,
  writeFile,
  copyFile,
  rename,
  unlink,
  open: (path, flags) => open(path, flags),
};

export type AtomicWriteError = {
  code: 'storage_unavailable';
  message: string;
  details: { stage: AtomicWriteStage | 'cleanup'; reason: string };
};

export type AtomicSnapshotWriterOptions = {
  fileSystem?: AtomicFileSystem;
  createTemporaryId?: () => string;
  fault?: (stage: AtomicWriteStage) => void | Promise<void>;
  platform?: NodeJS.Platform;
};

const errorReason = (error: unknown): string =>
  error instanceof Error ? error.message : 'unknown filesystem failure';

export class AtomicSnapshotWriter {
  private readonly fileSystem: AtomicFileSystem;
  private readonly createTemporaryId: () => string;
  private readonly fault: (stage: AtomicWriteStage) => void | Promise<void>;
  private readonly platform: NodeJS.Platform;

  constructor(options: AtomicSnapshotWriterOptions = {}) {
    this.fileSystem = options.fileSystem ?? nodeFileSystem;
    this.createTemporaryId = options.createTemporaryId ?? randomUUID;
    this.fault = options.fault ?? (() => undefined);
    this.platform = options.platform ?? process.platform;
  }

  async write(input: {
    primaryPath: string;
    contents: string;
    rotateBackup?: boolean;
  }): Promise<{ ok: true } | { ok: false; error: AtomicWriteError }> {
    const directory = dirname(input.primaryPath);
    const id = this.createTemporaryId();
    const temporaryPath = `${input.primaryPath}.${id}.tmp`;
    const backupPath = `${input.primaryPath}.backup`;
    const backupTemporaryPath = `${backupPath}.${id}.tmp`;
    let stage: AtomicWriteStage = 'before_temp_write';
    try {
      await this.fileSystem.mkdir(directory, { recursive: true });
      await this.fault(stage);
      await this.fileSystem.writeFile(temporaryPath, input.contents, 'utf8');
      stage = 'after_temp_write';
      await this.fault(stage);
      stage = 'before_temp_flush';
      await this.fault(stage);
      await this.flushFile(temporaryPath);
      stage = 'after_temp_flush';
      await this.fault(stage);

      if (input.rotateBackup !== false) {
        stage = 'before_backup_copy';
        await this.fault(stage);
        try {
          await this.fileSystem.copyFile(input.primaryPath, backupTemporaryPath);
          await this.flushFile(backupTemporaryPath);
          stage = 'after_backup_copy';
          await this.fault(stage);
          stage = 'before_backup_rename';
          await this.fault(stage);
          await this.fileSystem.rename(backupTemporaryPath, backupPath);
          stage = 'after_backup_rename';
          await this.fault(stage);
        } catch (error) {
          if (!this.isMissingFile(error)) throw error;
        }
      }

      stage = 'before_primary_rename';
      await this.fault(stage);
      await this.fileSystem.rename(temporaryPath, input.primaryPath);
      stage = 'after_primary_rename';
      await this.fault(stage);
      stage = 'before_directory_sync';
      await this.fault(stage);
      await this.syncDirectory(directory);
      stage = 'after_directory_sync';
      await this.fault(stage);
      await this.cleanup(backupTemporaryPath);
      return { ok: true };
    } catch (error) {
      await this.cleanup(temporaryPath);
      await this.cleanup(backupTemporaryPath);
      return {
        ok: false,
        error: {
          code: 'storage_unavailable',
          message: 'Não foi possível gravar o snapshot atomicamente.',
          details: { stage, reason: errorReason(error) },
        },
      };
    }
  }

  private async flushFile(path: string): Promise<void> {
    const handle = await this.fileSystem.open(path, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async syncDirectory(path: string): Promise<void> {
    if (this.platform === 'win32') return;
    let handle: FileHandleBoundary | undefined;
    try {
      handle = await this.fileSystem.open(path, 'r');
      await handle.sync();
    } catch (error) {
      const code = isNodeError(error) ? error.code : undefined;
      if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes(code ?? '')) throw error;
    } finally {
      await handle?.close();
    }
  }

  private async cleanup(path: string): Promise<void> {
    try {
      await this.fileSystem.unlink(path);
    } catch {
      // Temporary-file cleanup is best effort. Primary and backup are never deleted.
    }
  }

  private isMissingFile(error: unknown): boolean {
    return isNodeError(error) && error.code === 'ENOENT';
  }
}

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error;
