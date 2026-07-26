import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ImageLibrary,
  validateImageInput,
  type ImageDecoder,
} from '../src/infrastructure/image-library';
import { createValidData } from './fixtures/storage-fixtures';

const temporaryDirectories: string[] = [];
const temporaryDirectory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'evitania-images-'));
  temporaryDirectories.push(path);
  return path;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const fakeDecoder = (
  metadata: { width?: number; height?: number; format?: string } =
    { width: 32, height: 32, format: 'png' },
): ImageDecoder => ({
  metadata: vi.fn(async () => metadata),
  encode: vi.fn(async () => Buffer.from('re-encoded-without-metadata')),
});

describe('managed image validation and lifecycle', () => {
  it('UT-010 rejects size, extension, signature, decode, zero, and dimension violations', async () => {
    const root = await temporaryDirectory();
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const validPath = join(root, 'valid.png');
    await writeFile(validPath, png);
    const cases = [
      validateImageInput(join(root, 'missing.gif'), fakeDecoder()),
      validateImageInput(validPath, fakeDecoder({ width: 1, height: 1, format: 'jpeg' })),
      validateImageInput(validPath, { ...fakeDecoder(), metadata: async () => { throw new Error('decode'); } }),
      validateImageInput(validPath, fakeDecoder({ width: 0, height: 1, format: 'png' })),
      validateImageInput(validPath, fakeDecoder({ width: 8193, height: 1, format: 'png' })),
    ];
    const mismatch = join(root, 'mismatch.jpg');
    await writeFile(mismatch, png);
    cases.push(validateImageInput(mismatch, fakeDecoder({ width: 1, height: 1, format: 'jpeg' })));
    const oversized = join(root, 'oversized.png');
    await writeFile(oversized, Buffer.alloc(10 * 1024 * 1024 + 1));
    cases.push(validateImageInput(oversized, fakeDecoder()));
    for (const result of await Promise.all(cases)) {
      expect(result).toMatchObject({ ok: false, error: { code: 'image_invalid' } });
    }
  });

  it('UT-011 re-encodes, ignores hostile basenames, and generates unique category UUID references', async () => {
    const root = await temporaryDirectory();
    const source = join(root, '.. hostile name ..png');
    await writeFile(source, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
    const ids = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
    ];
    const decoder = fakeDecoder();
    const library = new ImageLibrary(join(root, 'assets'), {
      decoder,
      createId: () => ids.shift()!,
    });
    const first = await library.import(source, 'items');
    const second = await library.import(source, 'items');
    expect(first).toEqual({ ok: true, value: 'asset://items/10000000-0000-4000-8000-000000000001.png' });
    expect(second).toEqual({ ok: true, value: 'asset://items/10000000-0000-4000-8000-000000000002.png' });
    expect(await readFile(library.resolve(first.ok ? first.value : '')!, 'utf8'))
      .toBe('re-encoded-without-metadata');
    expect(decoder.encode).toHaveBeenCalledTimes(2);
  });

  it('UT-012 retains referenced/shared files, deletes only managed orphans, and reports retryable failures', async () => {
    const root = await temporaryDirectory();
    const assets = join(root, 'assets');
    const decoder = fakeDecoder();
    const ids = [
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
    ];
    const source = join(root, 'source.png');
    await writeFile(source, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
    const library = new ImageLibrary(assets, { decoder, createId: () => ids.shift()! });
    const referenced = await library.import(source, 'items');
    const orphan = await library.import(source, 'items');
    if (!referenced.ok || !orphan.ok) throw new Error('fixture import failed');
    await writeFile(join(assets, 'items', 'leave-me.txt'), 'not managed');
    const data = createValidData();
    data.catalog.items[0].image = referenced.value;
    data.catalog.items.push({ id: 'shared', name: 'Shared', image: referenced.value });
    const report = await library.collectOrphans(data);
    expect(report.deleted).toEqual([orphan.value]);
    expect(report.failed).toEqual([]);
    expect(await readdir(join(assets, 'items'))).toEqual(expect.arrayContaining([
      referenced.value.split('/').at(-1)!,
      'leave-me.txt',
    ]));

    const retryId = '20000000-0000-4000-8000-000000000003';
    const retryLibrary = new ImageLibrary(assets, {
      decoder,
      createId: () => retryId,
      fileSystem: {
        mkdir,
        writeFile,
        rename,
        readdir,
        rm: vi.fn()
          .mockRejectedValueOnce(new Error('locked'))
          .mockImplementation((path: string, options?: { force: true }) => rm(path, options)),
      },
    });
    const retryAsset = await retryLibrary.import(source, 'items');
    if (!retryAsset.ok) throw new Error('retry fixture import failed');
    expect((await retryLibrary.collectOrphans(data)).failed).toEqual([retryAsset.value]);
    expect((await retryLibrary.collectOrphans(data)).deleted).toEqual([retryAsset.value]);
  });

  it('IT-007 uses real decoding/re-encoding and leaves no partial file after invalid input', async () => {
    const root = await temporaryDirectory();
    const valid = join(root, 'valid.png');
    await sharp({ create: { width: 4, height: 4, channels: 4, background: '#ff0000' } })
      .png({ text: { keyword: 'private', text: 'metadata' } }).toFile(valid);
    const library = new ImageLibrary(join(root, 'assets'), {
      createId: () => '30000000-0000-4000-8000-000000000001',
    });
    const imported = await library.import(valid, 'resources');
    expect(imported).toMatchObject({ ok: true });
    if (!imported.ok) return;
    const metadata = await sharp(library.resolve(imported.value)!).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 4, height: 4 });
    await writeFile(join(root, 'invalid.png'), Buffer.from('not an image'));
    expect(await library.import(join(root, 'invalid.png'), 'resources'))
      .toMatchObject({ ok: false, error: { code: 'image_invalid' } });
    expect((await readdir(join(root, 'assets', 'resources'))).filter((name) => name.endsWith('.tmp')))
      .toEqual([]);

    const interrupted = new ImageLibrary(join(root, 'interrupted'), {
      createId: () => '30000000-0000-4000-8000-000000000002',
      fileSystem: {
        mkdir,
        writeFile,
        readdir,
        rm,
        rename: vi.fn(async () => { throw new Error('interrupted'); }),
      },
    });
    expect(await interrupted.import(valid, 'resources'))
      .toMatchObject({ ok: false, error: { code: 'storage_unavailable' } });
    expect((await readdir(join(root, 'interrupted', 'resources'))).filter((name) => name.endsWith('.tmp')))
      .toEqual([]);
  });

  it('IT-008 collects shared assets only after the last committed reference disappears', async () => {
    const root = await temporaryDirectory();
    const source = join(root, 'source.png');
    await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toFile(source);
    const library = new ImageLibrary(join(root, 'assets'), {
      createId: () => '40000000-0000-4000-8000-000000000001',
    });
    const imported = await library.import(source, 'items');
    if (!imported.ok) throw new Error('fixture import failed');
    const data = createValidData();
    data.catalog.items[0].image = imported.value;
    data.catalog.items.push({ id: 'shared-item', name: 'Shared', image: imported.value });
    expect((await library.collectOrphans(data)).deleted).toEqual([]);
    delete data.catalog.items[0].image;
    expect((await library.collectOrphans(data)).deleted).toEqual([]);
    delete data.catalog.items.find((item) => item.id === 'shared-item')!.image;
    expect((await library.collectOrphans(data)).deleted).toEqual([imported.value]);
  });
});
