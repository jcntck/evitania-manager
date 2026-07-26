import { readFile } from 'node:fs/promises';
import { AppDataValidator } from '../domain/app-data-validator';
import { createEmptyData, type AppData } from '../shared/domain';
import type { VersionedSnapshot } from './storage-schema';

export type SeedNoticeCode = 'seed_initialized' | 'empty_initialized';

export type SeedReadOutcome =
  | { kind: 'seed'; data: AppData }
  | { kind: 'empty'; data: AppData; reason: 'missing' | 'invalid' };

export class SeedLoader {
  constructor(
    private readonly seedPath: string | undefined,
    private readonly validator = new AppDataValidator(),
    private readonly readText: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
  ) {}

  async read(): Promise<SeedReadOutcome> {
    if (!this.seedPath) return { kind: 'empty', data: createEmptyData(), reason: 'missing' };
    try {
      const parsed = JSON.parse(await this.readText(this.seedPath)) as unknown;
      const validator: AppDataValidator = this.validator;
      validator.validate(parsed);
      return { kind: 'seed', data: parsed };
    } catch (error) {
      return {
        kind: 'empty',
        data: createEmptyData(),
        reason: isNodeError(error) && error.code === 'ENOENT' ? 'missing' : 'invalid',
      };
    }
  }

  async initialize(input: {
    primaryExists: boolean;
    backupExists: boolean;
    existing?: VersionedSnapshot;
    persist: (data: AppData, notice: SeedNoticeCode) => Promise<VersionedSnapshot>;
  }): Promise<VersionedSnapshot> {
    if (input.primaryExists || input.backupExists) {
      if (!input.existing) throw new Error('Existing snapshot is required when storage files exist.');
      return input.existing;
    }
    const seed = await this.read();
    return input.persist(seed.data, seed.kind === 'seed' ? 'seed_initialized' : 'empty_initialized');
  }
}

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error;
