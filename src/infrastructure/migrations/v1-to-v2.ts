import { AppDataValidator } from '../../domain/app-data-validator';
import type { AppData, Result } from '../../shared/domain';
import { createHash } from 'node:crypto';

export type LegacyProductKind = 'recipe' | 'smeltery';

export type LegacyAppDataV1 = {
  version: 1;
  catalog: {
    items: Array<{ id: string; name: string; image?: string }>;
    resources: Array<{ id: string; itemId: string; act: 'I' | 'II' | 'III'; image?: string }>;
    products: Array<{
      id: string;
      name: string;
      kind: LegacyProductKind;
      image?: string;
      processingSeconds?: number;
      components: Array<{ entityId: string; quantity: number }>;
    }>;
    monsters: Array<{
      id: string;
      name: string;
      act: 'I' | 'II' | 'III';
      image?: string;
      drops: Array<{ itemId: string; numerator: number; denominator: number }>;
    }>;
    bosses: Array<{
      id: string;
      name: string;
      act: 'I' | 'II' | 'III';
      image?: string;
      drops: Array<{ itemId: string; numerator: number; denominator: number }>;
    }>;
  };
  planning: {
    goals: Array<{
      id: string;
      productId: string;
      quantity: number;
      completed: boolean;
    }>;
    stock: Record<string, number>;
    gatherRates: Record<string, number>;
    killRates: Record<string, number>;
    lootQuantity: number;
    completedEntities: Record<string, number>;
    selectedSources: Record<string, string>;
  };
};

export type MigrationError = {
  code: 'migration_failed';
  message: string;
  details?: Readonly<Record<string, unknown>>;
};

export type MigrationDependencies = {
  now?: () => string;
  createId?: (entityId: string, index: number) => string;
  validator?: AppDataValidator;
};

const defaultId = (entityId: string, index: number): string => {
  const bytes = Buffer.from(createHash('sha256').update(`completion-credit\0${entityId}\0${index}`).digest()
    .subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const compact = bytes.toString('hex');
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
};

const normalizeImage = (image: string | undefined): string | undefined =>
  image?.replace(/^asset:\/\/smeltery\//, 'asset://smelting/');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFIXED_UUID =
  /^(?:items|resources|recipes|smeltery|monsters|bosses|goal)-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const normalizeLegacyId = (id: string): string => {
  if (UUID.test(id)) return id;
  const match = PREFIXED_UUID.exec(id);
  if (match?.[1]) return match[1];
  return id;
};

const normalizeNumericMap = (
  source: Readonly<Record<string, number>>,
): Record<string, number> => Object.fromEntries(
  Object.entries(source).map(([id, value]) => [normalizeLegacyId(id), value]),
);

const normalizeSelectedSources = (
  source: Readonly<Record<string, string>>,
): Record<string, string> => Object.fromEntries(
  Object.entries(source).map(([itemId, sourceId]) => [
    normalizeLegacyId(itemId),
    normalizeLegacyId(sourceId),
  ]),
);

export const migrateV1ToV2 = (
  source: LegacyAppDataV1,
  dependencies: MigrationDependencies = {},
): Result<AppData, MigrationError> => {
  try {
    const legacy = structuredClone(source);
    if (legacy.version !== 1 || typeof legacy.planning?.completedEntities !== 'object'
      || legacy.planning.completedEntities === null) {
      return { ok: false, error: { code: 'migration_failed', message: 'Estrutura schema-v1 inválida.' } };
    }
    const now = dependencies.now ?? (() => new Date(0).toISOString());
    const createId = dependencies.createId ?? defaultId;
    const stock = normalizeNumericMap(legacy.planning.stock);
    const completionCredits: AppData['planning']['completionCredits'] = [];

    Object.entries(legacy.planning.completedEntities).forEach(([entityId, quantity], index) => {
      const normalizedEntityId = normalizeLegacyId(entityId);
      if (!Number.isSafeInteger(quantity) || quantity < 0) {
        throw new Error(`invalid completed quantity for ${entityId}`);
      }
      const current = stock[normalizedEntityId] ?? 0;
      if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(current + quantity)) {
        throw new Error(`invalid stock quantity for ${entityId}`);
      }
      stock[normalizedEntityId] = current + quantity;
      if (quantity > 0) {
        completionCredits.push({
          id: createId(normalizedEntityId, index),
          entityId: normalizedEntityId,
          quantity,
          createdAt: now(),
        });
      }
    });

    const data: AppData = {
      version: 2,
      catalog: {
        items: legacy.catalog.items.map((item) => ({
          ...item,
          id: normalizeLegacyId(item.id),
          image: normalizeImage(item.image),
        })),
        resources: legacy.catalog.resources.map((resource) => ({
          ...resource,
          id: normalizeLegacyId(resource.id),
          itemId: normalizeLegacyId(resource.itemId),
          image: normalizeImage(resource.image),
        })),
        products: legacy.catalog.products.map((product) => ({
          ...product,
          id: normalizeLegacyId(product.id),
          kind: product.kind === 'smeltery' ? 'smelting' : 'recipe',
          image: normalizeImage(product.image),
          components: product.components.map((component) => ({
            ...component,
            entityId: normalizeLegacyId(component.entityId),
          })),
        })),
        monsters: legacy.catalog.monsters.map((enemy) => ({
          ...enemy,
          id: normalizeLegacyId(enemy.id),
          image: normalizeImage(enemy.image),
          drops: enemy.drops.map((drop) => ({ ...drop, itemId: normalizeLegacyId(drop.itemId) })),
        })),
        bosses: legacy.catalog.bosses.map((enemy) => ({
          ...enemy,
          id: normalizeLegacyId(enemy.id),
          image: normalizeImage(enemy.image),
          drops: enemy.drops.map((drop) => ({ ...drop, itemId: normalizeLegacyId(drop.itemId) })),
        })),
      },
      planning: {
        goals: legacy.planning.goals.map((goal, priority) => ({
          ...goal,
          id: normalizeLegacyId(goal.id),
          productId: normalizeLegacyId(goal.productId),
          priority,
        })),
        stock,
        gatherRates: normalizeNumericMap(legacy.planning.gatherRates),
        killRates: normalizeNumericMap(legacy.planning.killRates),
        lootQuantity: legacy.planning.lootQuantity,
        selectedSources: normalizeSelectedSources(legacy.planning.selectedSources),
        completionCredits,
      },
    };
    const validator: AppDataValidator = dependencies.validator ?? new AppDataValidator();
    validator.validate(data);
    return { ok: true, value: data };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'migration_failed',
        message: 'Os dados schema-v1 não puderam ser migrados com segurança.',
        details: { reason: error instanceof Error ? error.message : 'unknown' },
      },
    };
  }
};
