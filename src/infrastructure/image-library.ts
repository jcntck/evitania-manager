import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import type { DesktopResult } from '../shared/desktop-api';
import type { AppData, EntityCategory } from '../shared/domain';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const allowedExtensions = new Set(['.png', '.jpg', '.jpeg']);
const categories = new Set<EntityCategory>([
  'items', 'resources', 'recipes', 'smelting', 'monsters', 'bosses',
]);
const managedFilePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg)$/i;

export type ImageDecoder = {
  metadata(input: Buffer): Promise<{ width?: number; height?: number; format?: string }>;
  encode(input: Buffer, extension: '.png' | '.jpg'): Promise<Buffer>;
};

const sharpDecoder: ImageDecoder = {
  metadata: async (input) => {
    const metadata = await sharp(input, { failOn: 'error' }).metadata();
    return { width: metadata.width, height: metadata.height, format: metadata.format };
  },
  encode: async (input, extension) => extension === '.png'
    ? sharp(input, { failOn: 'error' }).png().toBuffer()
    : sharp(input, { failOn: 'error' }).jpeg().toBuffer(),
};

export type ImageDiagnostics = {
  event(name: 'image_import_rejected' | 'asset_gc_failed', fields?: Readonly<Record<string, unknown>>): void;
};

const silentDiagnostics: ImageDiagnostics = { event: () => undefined };

export type ImageFileSystem = {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  writeFile(path: string, data: Buffer, options: { flag: 'wx' }): Promise<unknown>;
  rename(source: string, destination: string): Promise<void>;
  rm(path: string, options?: { force: true }): Promise<void>;
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
};

const nodeFileSystem: ImageFileSystem = { mkdir, writeFile, rename, rm, readdir };

const imageInvalid = (): DesktopResult<never> => ({
  ok: false,
  error: { code: 'image_invalid', message: 'A imagem deve ser PNG ou JPEG válida, de 1 a 8192 pixels.' },
});

const storageUnavailable = (): DesktopResult<never> => ({
  ok: false,
  error: { code: 'storage_unavailable', message: 'Não foi possível armazenar a imagem.' },
});

const signatureFormat = (bytes: Buffer): 'png' | 'jpeg' | null => {
  const png = bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
  return png ? 'png' : jpeg ? 'jpeg' : null;
};

export const validateImageInput = async (
  sourcePath: string,
  decoder: ImageDecoder = sharpDecoder,
): Promise<DesktopResult<{ bytes: Buffer; extension: '.png' | '.jpg' }>> => {
  try {
    const extension = extname(sourcePath).toLowerCase();
    if (!allowedExtensions.has(extension)) return imageInvalid();
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.size < 1 || sourceStat.size > MAX_IMAGE_BYTES) {
      return imageInvalid();
    }
    const bytes = await readFile(sourcePath);
    if (bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES) return imageInvalid();
    const signature = signatureFormat(bytes);
    const expected = extension === '.png' ? 'png' : 'jpeg';
    if (signature !== expected) return imageInvalid();
    const metadata = await decoder.metadata(bytes);
    if (metadata.format !== expected
      || !metadata.width || !metadata.height
      || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      return imageInvalid();
    }
    return { ok: true, value: { bytes, extension: expected === 'png' ? '.png' : '.jpg' } };
  } catch {
    return imageInvalid();
  }
};

export const parseAssetUrl = (url: string, assetsPath: string): string | null => {
  try {
    if (/%2f|%5c|%2e/i.test(url) || /(?:^|\/)\.\.(?:\/|$)/.test(url)) return null;
    const parsed = new URL(url);
    if (parsed.protocol !== 'asset:' || parsed.username || parsed.password
      || parsed.search || parsed.hash || parsed.port) return null;
    const category = parsed.hostname as EntityCategory;
    if (!categories.has(category)) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    const fileName = decodeURIComponent(segments[0]);
    if (!managedFilePattern.test(fileName)) return null;
    const root = resolve(assetsPath);
    const candidate = resolve(root, category, fileName);
    const fromRoot = relative(root, candidate);
    if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) return null;
    return candidate;
  } catch {
    return null;
  }
};

const collectCommittedReferences = (data: Readonly<AppData>): Set<string> => {
  const references = new Set<string>();
  const add = (category: EntityCategory, image?: string): void => {
    if (!image) return;
    const parsed = new URL(image);
    if (parsed.protocol === 'asset:' && parsed.hostname === category) references.add(image);
  };
  for (const item of data.catalog.items) add('items', item.image);
  for (const resource of data.catalog.resources) add('resources', resource.image);
  for (const product of data.catalog.products) add(product.kind === 'recipe' ? 'recipes' : 'smelting', product.image);
  for (const monster of data.catalog.monsters) add('monsters', monster.image);
  for (const boss of data.catalog.bosses) add('bosses', boss.image);
  return references;
};

export type OrphanCollectionReport = Readonly<{
  deleted: readonly string[];
  failed: readonly string[];
}>;

export class ImageLibrary {
  constructor(
    private readonly assetsPath: string,
    private readonly options: {
      decoder?: ImageDecoder;
      createId?: () => string;
      diagnostics?: ImageDiagnostics;
      fileSystem?: ImageFileSystem;
    } = {},
  ) {}

  async import(sourcePath: string, category: EntityCategory): Promise<DesktopResult<string>> {
    if (!categories.has(category)) return imageInvalid();
    const decoder = this.options.decoder ?? sharpDecoder;
    const validated = await validateImageInput(sourcePath, decoder);
    if (!validated.ok) {
      (this.options.diagnostics ?? silentDiagnostics).event('image_import_rejected', { category });
      return validated;
    }
    try {
      const fileSystem = this.options.fileSystem ?? nodeFileSystem;
      const categoryPath = join(this.assetsPath, category);
      await fileSystem.mkdir(categoryPath, { recursive: true });
      const id = (this.options.createId ?? randomUUID)();
      const fileName = `${id}${validated.value.extension}`;
      if (!managedFilePattern.test(fileName)) return storageUnavailable();
      const destination = join(categoryPath, fileName);
      const temporary = join(categoryPath, `.${fileName}.${randomUUID()}.tmp`);
      const encoded = await decoder.encode(validated.value.bytes, validated.value.extension);
      try {
        await fileSystem.writeFile(temporary, encoded, { flag: 'wx' });
        await fileSystem.rename(temporary, destination);
      } catch (error) {
        await fileSystem.rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      return { ok: true, value: `asset://${category}/${fileName}` };
    } catch {
      return storageUnavailable();
    }
  }

  resolve(url: string): string | null {
    return parseAssetUrl(url, this.assetsPath);
  }

  async collectOrphans(data: Readonly<AppData>): Promise<OrphanCollectionReport> {
    const references = collectCommittedReferences(data);
    const fileSystem = this.options.fileSystem ?? nodeFileSystem;
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const category of categories) {
      const directory = join(this.assetsPath, category);
      let entries;
      try {
        entries = await fileSystem.readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        failed.push(category);
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !managedFilePattern.test(entry.name)) continue;
        const reference = `asset://${category}/${entry.name}`;
        if (references.has(reference)) continue;
        try {
          await fileSystem.rm(join(directory, entry.name));
          deleted.push(reference);
        } catch {
          failed.push(reference);
          (this.options.diagnostics ?? silentDiagnostics).event('asset_gc_failed', { category });
        }
      }
    }
    return { deleted, failed };
  }
}
