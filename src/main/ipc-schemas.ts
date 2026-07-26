import { DESKTOP_CHANNELS, type DesktopChannel, type SaveSnapshotInput } from '../shared/desktop-api';
import type { AppData, EntityCategory } from '../shared/domain';

export const IPC_LIMITS = Object.freeze({
  catalogRecords: 5_000,
  activeGoals: 50,
  relations: 20_000,
});

const categories = new Set<EntityCategory>([
  'items', 'resources', 'recipes', 'smelting', 'monsters', 'bosses',
]);

const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

const collectionCountsWithinLimits = (data: AppData): boolean => {
  const catalog = data?.catalog;
  const planning = data?.planning;
  if (!catalog || !planning) return false;
  const collections = [
    catalog.items, catalog.resources, catalog.products, catalog.monsters, catalog.bosses,
  ];
  if (collections.some((collection) => !Array.isArray(collection))) return false;
  const recordCount = collections.reduce((total, collection) => total + collection.length, 0);
  const activeGoals = Array.isArray(planning.goals)
    ? planning.goals.filter((goal) =>
      typeof goal === 'object' && goal !== null && goal.completed !== true).length
    : Number.POSITIVE_INFINITY;
  const relations = catalog.products.reduce(
    (total, product) => total + (
      typeof product === 'object' && product !== null && Array.isArray(product.components)
        ? product.components.length
        : IPC_LIMITS.relations + 1
    ),
    0,
  ) + [...catalog.monsters, ...catalog.bosses].reduce(
    (total, enemy) => total + (
      typeof enemy === 'object' && enemy !== null && Array.isArray(enemy.drops)
        ? enemy.drops.length
        : IPC_LIMITS.relations + 1
    ),
    0,
  );
  return recordCount <= IPC_LIMITS.catalogRecords
    && activeGoals <= IPC_LIMITS.activeGoals
    && relations <= IPC_LIMITS.relations;
};

export type ParsedIpcRequest =
  | { channel: typeof DESKTOP_CHANNELS.load; value: undefined }
  | { channel: typeof DESKTOP_CHANNELS.save; value: SaveSnapshotInput }
  | { channel: typeof DESKTOP_CHANNELS.importImage; value: { category: EntityCategory } }
  | { channel: typeof DESKTOP_CHANNELS.openDataDirectory; value: undefined };

export function parseIpcRequest(
  channel: typeof DESKTOP_CHANNELS.load,
  args: readonly unknown[],
): Extract<ParsedIpcRequest, { channel: typeof DESKTOP_CHANNELS.load }> | null;
export function parseIpcRequest(
  channel: typeof DESKTOP_CHANNELS.save,
  args: readonly unknown[],
): Extract<ParsedIpcRequest, { channel: typeof DESKTOP_CHANNELS.save }> | null;
export function parseIpcRequest(
  channel: typeof DESKTOP_CHANNELS.importImage,
  args: readonly unknown[],
): Extract<ParsedIpcRequest, { channel: typeof DESKTOP_CHANNELS.importImage }> | null;
export function parseIpcRequest(
  channel: typeof DESKTOP_CHANNELS.openDataDirectory,
  args: readonly unknown[],
): Extract<ParsedIpcRequest, { channel: typeof DESKTOP_CHANNELS.openDataDirectory }> | null;
export function parseIpcRequest(
  channel: string,
  args: readonly unknown[],
): ParsedIpcRequest | null;
export function parseIpcRequest(
  channel: string,
  args: readonly unknown[],
): ParsedIpcRequest | null {
  if (channel === DESKTOP_CHANNELS.load || channel === DESKTOP_CHANNELS.openDataDirectory) {
    return args.length === 0
      ? channel === DESKTOP_CHANNELS.load
        ? { channel: DESKTOP_CHANNELS.load, value: undefined }
        : { channel: DESKTOP_CHANNELS.openDataDirectory, value: undefined }
      : null;
  }
  if (channel === DESKTOP_CHANNELS.importImage) {
    const value = args[0];
    return args.length === 1
      && exactKeys(value, ['category'])
      && categories.has(value.category as EntityCategory)
      ? { channel, value: { category: value.category as EntityCategory } }
      : null;
  }
  if (channel === DESKTOP_CHANNELS.save) {
    const value = args[0];
    if (args.length !== 1 || !exactKeys(value, ['expectedRevision', 'data'])) return null;
    if (!Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 1) return null;
    if (!collectionCountsWithinLimits(value.data as AppData)) return null;
    return { channel, value: value as SaveSnapshotInput };
  }
  return null;
}

export const isDesktopChannel = (channel: string): channel is DesktopChannel =>
  Object.values(DESKTOP_CHANNELS).includes(channel as DesktopChannel);
