import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import XLSX from 'xlsx';
import { AppDataValidator } from '../src/domain/app-data-validator';
import { compileSeed } from '../scripts/compile-seed.mjs';

const directories: string[] = [];
const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'evitania-seed-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const createWorkbook = async (directory: string): Promise<string> => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Nome', 'Tipo', 'Componentes', 'Tempo'],
    ['Espada', 'recipe', 'Ferro: 2 | Carvão: 1', ''],
    ['Mistério', 'recipe', 'quantidade desconhecida', ''],
  ]), 'Receitas');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Nome', 'Ato', 'Tipo', 'Drops'],
    ['Golem', 'I', 'monster', 'Carvão: 1/4 | Pele: 1/10'],
  ]), 'Registro de monstros');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Nome', 'Tipo', 'Imagem'],
    ['Ícone', 'item', 'tiny.png'],
  ]), 'Registro de Equipamentos');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Nome', 'Tipo'],
  ]), 'Registro de ArmamentoColetavel');
  const path = join(directory, 'fixture.xlsx');
  XLSX.writeFile(workbook, path);
  await writeFile(join(directory, 'tiny.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return path;
};

const compileFixture = async (directory: string, workbookPath: string) => compileSeed({
  workbookPath,
  seedPath: join(directory, 'seed-v2.json'),
  rejectionPath: join(directory, 'seed-rejections.json'),
  assetRoot: directory,
});

describe('deterministic workbook compiler', () => {
  it('UT-007 omits an ambiguous row, reports its coordinates, and keeps independent valid rows/assets', async () => {
    const directory = await createDirectory();
    const workbookPath = await createWorkbook(directory);

    const result = await compileFixture(directory, workbookPath);

    expect(result.data.catalog.products.map((product) => product.name)).toEqual(['Espada']);
    expect(result.data.catalog.monsters.map((monster) => monster.name)).toEqual(['Golem']);
    expect(result.data.catalog.items.map((item) => item.name)).toEqual(expect.arrayContaining([
      'Ferro', 'Carvão', 'Pele', 'Ícone',
    ]));
    expect(result.rejections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sheet: 'Receitas',
        row: 3,
        field: 'relations',
        reason: 'ambiguous_relation',
      }),
    ]));
    const imageItem = result.data.catalog.items.find((item) => item.name === 'Ícone');
    expect(imageItem?.image).toMatch(/^asset:\/\/items\/[0-9a-f-]+\.png$/);
    expect(await readFile(join(directory, imageItem!.image!.replace('asset://', 'assets/'))))
      .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it('UT-008 and IT-006 compile byte-identically twice and pass current full-domain validation', async () => {
    const sourceDirectory = await createDirectory();
    const firstDirectory = await createDirectory();
    const secondDirectory = await createDirectory();
    const workbookPath = await createWorkbook(sourceDirectory);

    const first = await compileFixture(firstDirectory, workbookPath);
    const second = await compileFixture(secondDirectory, workbookPath);

    expect(first.seedBytes).toBe(second.seedBytes);
    expect(first.rejectionBytes).toBe(second.rejectionBytes);
    const validator = new AppDataValidator();
    expect(() => validator.validate(first.data)).not.toThrow();
    for (const product of first.data.catalog.products) {
      expect(product.components.every((component) =>
        first.data.catalog.items.some((item) => item.id === component.entityId)
        || first.data.catalog.products.some((candidate) => candidate.id === component.entityId))).toBe(true);
    }
  });

  it('keeps XLSX parsing out of runtime source', async () => {
    const scan = async (path: string): Promise<string[]> => {
      const entries = await readdir(path, { withFileTypes: true });
      const matches: string[] = [];
      for (const entry of entries) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) matches.push(...await scan(child));
        else if (/\.(ts|js|mjs)$/u.test(entry.name)
          && (await readFile(child, 'utf8')).match(/\b(?:from|require\()\s*['"]xlsx/u)) matches.push(child);
      }
      return matches;
    };

    expect(await scan(join(process.cwd(), 'src'))).toEqual([]);
  });
});
