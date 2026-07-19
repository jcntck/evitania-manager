import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AppData } from '../shared/domain';
import { createEmptyData } from '../shared/domain';
import { AppDataValidator } from '../domain/app-data-validator';

export class JsonAppRepository {
  constructor(private readonly filePath: string,
    private readonly validator: AppDataValidator = new AppDataValidator()) {}

  async load(): Promise<AppData> {
    try {
      const stored = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      this.validator.validate(stored);
      return stored;
    } catch {
      return createEmptyData();
    }
  }

  async save(data: AppData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
    await this.backupCurrentFile();
    await rename(temporaryPath, this.filePath);
  }

  private async backupCurrentFile(): Promise<void> {
    try {
      await copyFile(this.filePath, `${this.filePath}.backup`);
    } catch {
      // The first save has no previous file to back up.
    }
  }
}
