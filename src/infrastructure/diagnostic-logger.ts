import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_BYTES = 1024 * 1024;
const RETAINED_FILES = 3;

export type DiagnosticEvent =
  | 'app_start' | 'load_primary' | 'load_backup' | 'seed_initialized' | 'migration'
  | 'save_committed' | 'save_conflict' | 'save_failed' | 'image_import_rejected'
  | 'asset_gc_failed' | 'planning_limit' | 'native_action_failed';

const safeFields = new Set([
  'schemaVersion', 'revision', 'operationId', 'errorCode', 'entityCount',
  'categoryCount', 'durationMs', 'platform', 'category',
]);

export class DiagnosticLogger {
  constructor(
    private readonly path: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  event(event: DiagnosticEvent, fields: Readonly<Record<string, unknown>> = {}): void {
    const redacted = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) =>
        safeFields.has(key) && ['string', 'number', 'boolean'].includes(typeof value)),
    );
    void this.write(`${JSON.stringify({ timestamp: this.now(), event, ...redacted })}\n`);
  }

  private async write(line: string): Promise<void> {
    try {
      await mkdir(dirname(this.path), { recursive: true });
      let currentSize = 0;
      try {
        currentSize = (await stat(this.path)).size;
      } catch {
        currentSize = 0;
      }
      if (currentSize + Buffer.byteLength(line) > MAX_BYTES) await this.rotate();
      await appendFile(this.path, line, 'utf8');
    } catch {
      // Diagnostics are deliberately non-blocking.
    }
  }

  private async rotate(): Promise<void> {
    for (let index = RETAINED_FILES - 1; index >= 1; index -= 1) {
      await rename(`${this.path}.${index}`, `${this.path}.${index + 1}`).catch(() => undefined);
    }
    await rename(this.path, `${this.path}.1`).catch(async () => {
      const existing = await readFile(this.path, 'utf8').catch(() => '');
      if (existing) await writeFile(`${this.path}.1`, existing, 'utf8');
    });
  }
}
