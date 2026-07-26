import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';
import * as validatorModule from '../src/domain/app-data-validator.ts';

const AppDataValidator = validatorModule.AppDataValidator ?? validatorModule.default?.AppDataValidator;

const MODULES = ['items', 'resources', 'recipes', 'smelting', 'monsters', 'bosses'];
const REQUIRED_SHEETS = [
  'Receitas',
  'Registro de monstros',
  'Registro de Equipamentos',
  'Registro de ArmamentoColetavel',
];

const normalize = (value) => String(value ?? '')
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .trim();

const key = (value) => normalize(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const deterministicUuid = (namespace, value) => {
  const bytes = Buffer.from(createHash('sha256').update(`${namespace}\0${key(value)}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const parseInteger = (value) => {
  const text = normalize(value).replace(/\.(?=\d{3}(?:\D|$))/g, '');
  if (!/^\d+$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
};

const parseRelations = (value) => {
  const source = normalize(value);
  if (!source) return { accepted: [], rejected: [] };
  const accepted = [];
  const rejected = [];
  for (const rawPart of source.split(/\s+[|/]\s+(?=[^/|]+?:)/)) {
    const part = normalize(rawPart);
    const drop = /^(.+?):\s*(\d[\d.]*)\s*\/\s*(\d[\d.]*)$/u.exec(part);
    if (drop) {
      const numerator = parseInteger(drop[2]);
      const denominator = parseInteger(drop[3]);
      if (numerator && denominator && numerator <= denominator) {
        accepted.push({ name: normalize(drop[1]), numerator, denominator, kind: 'drop' });
      } else rejected.push({ value: part, reason: 'invalid_drop_rate' });
      continue;
    }
    const component = /^(.+?):\s*(\d[\d.]*)$/u.exec(part);
    if (component) {
      const quantity = parseInteger(component[2]);
      const name = normalize(component[1]).replace(/\s+\((?:Boss)\)$/iu, '');
      if (quantity && name && !name.endsWith(':')) {
        accepted.push({ name, quantity, kind: 'component' });
      } else rejected.push({ value: part, reason: 'invalid_component_quantity' });
      continue;
    }
    rejected.push({ value: part, reason: 'ambiguous_relation' });
  }
  return { accepted, rejected };
};

const redact = (value) => {
  const text = normalize(value);
  return text.length <= 80 ? text : `${text.slice(0, 77)}...`;
};

const emptyData = () => ({
  version: 2,
  catalog: { items: [], resources: [], products: [], monsters: [], bosses: [] },
  planning: {
    goals: [],
    stock: {},
    gatherRates: {},
    killRates: {},
    lootQuantity: 0,
    selectedSources: {},
    completionCredits: [],
  },
});

const headerMap = (row) => new Map(row.map((value, index) => [key(value).replace(/:$/, ''), index]));
const column = (headers, names) => names.map((name) => headers.get(key(name))).find((index) => index !== undefined);
const cell = (row, index) => index === undefined ? undefined : row[index];

const addItem = (state, name) => {
  const cleanName = normalize(name);
  const normalized = key(cleanName);
  if (!cleanName || normalized.length > 100) return undefined;
  const existing = state.itemsByName.get(normalized);
  if (existing) return existing;
  const item = { id: deterministicUuid('item', cleanName), name: cleanName };
  state.itemsByName.set(normalized, item);
  state.data.catalog.items.push(item);
  return item;
};

const addRejection = (state, sheet, row, field, reason, value) => {
  state.rejections.push({ sheet, row, field, reason, redactedValue: redact(value) });
};

const queueImage = (state, entity, module, value, sheet, row) => {
  const image = normalize(value);
  if (!image) return;
  state.assets.push({
    sourcePath: resolve(state.workbookDirectory, image),
    entity,
    module,
    sheet,
    row,
  });
};

const parseExplicitTable = (state, sheetName, rows) => {
  const headerIndex = rows.findIndex((row) => row.some((value) => ['nome', 'name'].includes(key(value).replace(/:$/, ''))));
  if (headerIndex < 0) return;
  const headers = headerMap(rows[headerIndex]);
  const nameIndex = column(headers, ['nome', 'name']);
  const actIndex = column(headers, ['ato', 'act']);
  const kindIndex = column(headers, ['tipo', 'kind']);
  const relationsIndex = column(headers, ['componentes', 'components', 'drops', 'informações', 'informacoes']);
  const durationIndex = column(headers, ['tempo', 'processingseconds', 'duração', 'duracao']);
  const itemIndex = column(headers, ['item']);
  const imageIndex = column(headers, ['imagem', 'image']);

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const name = normalize(cell(row, nameIndex));
    if (!name) continue;
    const rowNumber = index + 1;
    const relations = parseRelations(cell(row, relationsIndex));
    relations.rejected.forEach((entry) =>
      addRejection(state, sheetName, rowNumber, 'relations', entry.reason, entry.value));
    relations.accepted.forEach((relation) => addItem(state, relation.name));

    if (sheetName === 'Registro de monstros') {
      const act = normalize(cell(row, actIndex)).toUpperCase();
      const drops = relations.accepted.filter((relation) => relation.kind === 'drop');
      if (!['I', 'II', 'III'].includes(act)) {
        addRejection(state, sheetName, rowNumber, 'act', 'missing_or_invalid_act', cell(row, actIndex));
        continue;
      }
      const enemyKind = key(cell(row, kindIndex)) === 'boss' ? 'bosses' : 'monsters';
      const enemy = {
        id: deterministicUuid(enemyKind === 'bosses' ? 'boss' : 'monster', name),
        name,
        act,
        drops: drops.map((drop) => ({
          itemId: addItem(state, drop.name).id,
          numerator: drop.numerator,
          denominator: drop.denominator,
        })),
      };
      queueImage(state, enemy, enemyKind, cell(row, imageIndex), sheetName, rowNumber);
      state.data.catalog[enemyKind].push(enemy);
      continue;
    }

    const declaredKind = key(cell(row, kindIndex));
    if (sheetName === 'Receitas' || declaredKind === 'recipe' || declaredKind === 'smelting') {
      const components = relations.accepted.filter((relation) => relation.kind === 'component');
      if (components.length === 0) {
        addRejection(state, sheetName, rowNumber, 'components', 'missing_components', cell(row, relationsIndex));
        continue;
      }
      const productKind = declaredKind === 'smelting' ? 'smelting' : 'recipe';
      const product = {
        id: deterministicUuid('product', name),
        name,
        kind: productKind,
        components: components.map((component) => ({
          entityId: addItem(state, component.name).id,
          quantity: component.quantity,
        })),
      };
      if (productKind === 'smelting') {
        const processingSeconds = parseInteger(cell(row, durationIndex));
        if (!processingSeconds) {
          addRejection(state, sheetName, rowNumber, 'processingSeconds',
            'missing_or_invalid_processing_time', cell(row, durationIndex));
          continue;
        }
        product.processingSeconds = processingSeconds;
      }
      queueImage(state, product, productKind === 'smelting' ? 'smelting' : 'recipes',
        cell(row, imageIndex), sheetName, rowNumber);
      state.data.catalog.products.push(product);
      continue;
    }

    if (declaredKind === 'item') {
      const item = addItem(state, name);
      queueImage(state, item, 'items', cell(row, imageIndex), sheetName, rowNumber);
      continue;
    }

    if (declaredKind === 'resource') {
      const itemName = normalize(cell(row, itemIndex));
      const act = normalize(cell(row, actIndex)).toUpperCase();
      if (!itemName || !['I', 'II', 'III'].includes(act)) {
        addRejection(state, sheetName, rowNumber, 'resource', 'missing_item_or_act', `${itemName} ${act}`);
        continue;
      }
      const resource = {
        id: deterministicUuid('resource', `${name}|${itemName}|${act}`),
        itemId: addItem(state, itemName).id,
        act,
      };
      queueImage(state, resource, 'resources', cell(row, imageIndex), sheetName, rowNumber);
      state.data.catalog.resources.push(resource);
      continue;
    }

    addRejection(state, sheetName, rowNumber, 'row', 'unsupported_record_shape', name);
    if (cell(row, imageIndex)) {
      addRejection(state, sheetName, rowNumber, 'image', 'unmapped_workbook_image', cell(row, imageIndex));
    }
  }
};

const parseRecipeRelationCells = (state, rows) => {
  for (let index = 0; index < rows.length; index += 1) {
    for (const value of rows[index]) {
      if (typeof value !== 'string' || !/:\s*\d/u.test(value) || /^Item\/Qntd/iu.test(value)) continue;
      const relations = parseRelations(value);
      relations.accepted.filter((relation) => relation.kind === 'component')
        .forEach((relation) => addItem(state, relation.name));
      relations.rejected.forEach((entry) =>
        addRejection(state, 'Receitas', index + 1, 'components', entry.reason, entry.value));
      addRejection(state, 'Receitas', index + 1, 'product', 'missing_product_identity', value);
    }
  }
};

const validateSeed = (data) => {
  if (data.version !== 2) throw new Error('Seed version must be 2.');
  const ids = new Set();
  for (const collection of Object.values(data.catalog)) {
    for (const entity of collection) {
      if (ids.has(entity.id)) throw new Error(`Duplicate seed ID: ${entity.id}`);
      ids.add(entity.id);
    }
  }
  const entities = new Set([
    ...data.catalog.items.map((item) => item.id),
    ...data.catalog.products.map((product) => product.id),
  ]);
  for (const product of data.catalog.products) {
    if (product.components.length === 0) throw new Error(`Product without components: ${product.name}`);
    product.components.forEach((component) => {
      if (!entities.has(component.entityId)) throw new Error(`Missing component: ${component.entityId}`);
    });
  }
};

const copyManagedAsset = async (sourcePath, outputRoot, module, entityId) => {
  if (!MODULES.includes(module)) throw new Error('unsupported asset module');
  const extension = extname(sourcePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(extension)) throw new Error('unsupported image extension');
  const bytes = await readFile(sourcePath);
  const normalizedExtension = extension === '.jpeg' ? '.jpg' : extension;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if ((normalizedExtension === '.png' && !png) || (normalizedExtension === '.jpg' && !jpeg)) {
    throw new Error('image signature mismatch');
  }
  const filename = `${entityId}${normalizedExtension}`;
  const destination = resolve(outputRoot, 'assets', module, filename);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(sourcePath, destination);
  return `asset://${module}/${filename}`;
};

export const compileSeed = async ({
  workbookPath = resolve('docs/base-cadastro.xlsx'),
  seedPath = resolve('assets/seed/seed-v2.json'),
  rejectionPath = resolve('artifacts/seed-rejections.json'),
  assetRoot = resolve('assets/seed'),
} = {}) => {
  const workbook = XLSX.readFile(workbookPath, { cellDates: false, cellNF: false, cellStyles: false });
  const state = {
    data: emptyData(),
    itemsByName: new Map(),
    rejections: [],
    assets: [],
    workbookDirectory: dirname(workbookPath),
  };

  for (const sheetName of REQUIRED_SHEETS) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      addRejection(state, sheetName, 0, 'sheet', 'missing_sheet', sheetName);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
    parseExplicitTable(state, sheetName, rows);
    if (sheetName === 'Receitas' && !rows.some((row) => row.some((value) => key(value) === 'nome'))) {
      parseRecipeRelationCells(state, rows);
    }
  }

  state.data.catalog.items.sort((left, right) => left.id.localeCompare(right.id));
  state.data.catalog.resources.sort((left, right) => left.id.localeCompare(right.id));
  state.data.catalog.products.sort((left, right) => left.id.localeCompare(right.id));
  state.data.catalog.monsters.sort((left, right) => left.id.localeCompare(right.id));
  state.data.catalog.bosses.sort((left, right) => left.id.localeCompare(right.id));
  state.rejections.sort((left, right) =>
    left.sheet.localeCompare(right.sheet) || left.row - right.row
    || left.field.localeCompare(right.field) || left.reason.localeCompare(right.reason));
  validateSeed(state.data);
  new AppDataValidator().validate(state.data);

  await mkdir(dirname(seedPath), { recursive: true });
  await mkdir(dirname(rejectionPath), { recursive: true });
  await Promise.all(MODULES.map((module) => mkdir(resolve(assetRoot, 'assets', module), { recursive: true })));
  for (const asset of state.assets.sort((left, right) =>
    left.module.localeCompare(right.module) || left.entity.id.localeCompare(right.entity.id))) {
    try {
      asset.entity.image = await copyManagedAsset(asset.sourcePath, assetRoot, asset.module, asset.entity.id);
    } catch (error) {
      addRejection(state, asset.sheet, asset.row, 'image', 'invalid_or_missing_image',
        error instanceof Error ? error.message : 'unknown image error');
    }
  }
  state.rejections.sort((left, right) =>
    left.sheet.localeCompare(right.sheet) || left.row - right.row
    || left.field.localeCompare(right.field) || left.reason.localeCompare(right.reason));
  validateSeed(state.data);
  new AppDataValidator().validate(state.data);
  const seedBytes = `${JSON.stringify(state.data, null, 2)}\n`;
  const rejectionBytes = `${JSON.stringify(state.rejections, null, 2)}\n`;
  await writeFile(seedPath, seedBytes, 'utf8');
  await writeFile(rejectionPath, rejectionBytes, 'utf8');
  return {
    data: state.data,
    rejections: state.rejections,
    seedBytes,
    rejectionBytes,
    copyManagedAsset: (sourcePath, module, entityId) =>
      copyManagedAsset(sourcePath, assetRoot, module, entityId),
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await compileSeed();
  process.stdout.write(`Compiled ${result.data.catalog.items.length} items, `
    + `${result.data.catalog.products.length} products, ${result.data.catalog.monsters.length} monsters, `
    + `${result.rejections.length} rejections from ${basename(resolve('docs/base-cadastro.xlsx'))}.\n`);
}
