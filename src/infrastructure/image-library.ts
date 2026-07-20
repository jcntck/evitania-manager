import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EntityCategory } from '../shared/domain';

const allowedExtensions = new Set(['.png', '.jpg', '.jpeg']);

export class ImageLibrary {
  constructor(private readonly assetsPath: string) {}

  async import(sourcePath: string, category: EntityCategory): Promise<string> {
    const extension = extname(sourcePath).toLowerCase();
    if (!allowedExtensions.has(extension)) throw new Error('Formato de imagem inválido.');
    await this.validateSignature(sourcePath, extension);
    const categoryPath = join(this.assetsPath, category);
    await mkdir(categoryPath, { recursive: true });
    const fileName = `${randomUUID()}${extension === '.jpeg' ? '.jpg' : extension}`;
    await copyFile(sourcePath, join(categoryPath, fileName));
    return `asset://${category}/${fileName}`;
  }

  resolve(url: string): string | null {
    if (!url.startsWith('asset://')) return null;
    const relativePath = url.slice('asset://'.length);
    if (relativePath.includes('..') || basename(relativePath) !== relativePath.split('/').at(-1)) return null;
    return join(this.assetsPath, relativePath);
  }

  private async validateSignature(sourcePath: string, extension: string): Promise<void> {
    const bytes = await readFile(sourcePath);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
    if (extension === '.png' && !png) throw new Error('O conteúdo não é um PNG válido.');
    if (extension !== '.png' && !jpeg) throw new Error('O conteúdo não é um JPG válido.');
  }
}
