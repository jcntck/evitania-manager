import type { Catalog, Enemy, Planning, Product } from '../shared/domain';
import type {
  BossEstimate,
  GatheringEstimate,
  MonsterEstimate,
  PlanDiagnostic,
  PlanEstimate,
  PlanningSource,
  SmeltingEstimate,
  SourceResolution,
} from './planning-result';

export type EstimateOutcome<T extends PlanEstimate> = Readonly<{
  estimate?: T;
  diagnostics: readonly PlanDiagnostic[];
}>;

const diagnostic = (
  code: PlanDiagnostic['code'],
  context: Partial<PlanDiagnostic> = {},
): PlanDiagnostic => ({ code, ...context });

const positiveFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const nonnegativeFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const safeNonnegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export const resolveSources = (
  itemId: string,
  catalog: Readonly<Catalog>,
  selectedSources: Readonly<Record<string, string>>,
): Readonly<{ resolution: SourceResolution; diagnostics: readonly PlanDiagnostic[] }> => {
  const origins: PlanningSource[] = [
    ...catalog.resources
      .filter((resource) => resource.itemId === itemId)
      .map((resource) => ({
        id: resource.id,
        name: `Coleta · Ato ${resource.act}`,
        kind: 'gather' as const,
        act: resource.act,
      })),
    ...enemySources(itemId, catalog.monsters, 'monster'),
    ...enemySources(itemId, catalog.bosses, 'boss'),
  ];
  const persisted = selectedSources[itemId];
  if (persisted !== undefined) {
    const selected = origins.find((origin) => origin.id === persisted);
    return selected
      ? { resolution: { status: 'resolved', origins, selected }, diagnostics: [] }
      : {
        resolution: { status: 'source_unresolved', origins },
        diagnostics: [diagnostic('source_unresolved', { entityId: itemId, sourceId: persisted })],
      };
  }
  if (origins.length === 0) {
    return {
      resolution: { status: 'none', origins },
      diagnostics: [diagnostic('source_unresolved', { entityId: itemId })],
    };
  }
  if (origins.length === 1) {
    return { resolution: { status: 'resolved', origins, selected: origins[0] }, diagnostics: [] };
  }
  return {
    resolution: { status: 'selection_required', origins },
    diagnostics: [diagnostic('source_required', { entityId: itemId })],
  };
};

const enemySources = (
  itemId: string,
  enemies: readonly Enemy[],
  kind: 'monster' | 'boss',
): PlanningSource[] => enemies.flatMap((enemy) =>
  enemy.drops
    .filter((drop) => drop.itemId === itemId)
    .map((drop) => ({
      id: enemy.id,
      name: enemy.name,
      kind,
      act: enemy.act,
      numerator: drop.numerator,
      denominator: drop.denominator,
    })));

export const calculateGathering = (
  missing: number,
  rate: unknown,
  context: Partial<PlanDiagnostic> = {},
): EstimateOutcome<GatheringEstimate> => {
  if (missing === 0) {
    return { estimate: { kind: 'gathering', ratePerHour: positiveFinite(rate) ? rate : 0, hours: 0 }, diagnostics: [] };
  }
  if (!positiveFinite(rate)) {
    return { diagnostics: [diagnostic('rate_required', { ...context, field: 'gatherRate' })] };
  }
  return { estimate: { kind: 'gathering', ratePerHour: rate, hours: missing / rate }, diagnostics: [] };
};

export type DropAdjustment = Readonly<{
  adjustedDenominator: number;
  adjustedProbability: number;
}>;

export const adjustDrop = (
  numerator: unknown,
  denominator: unknown,
  lootQuantity: unknown,
): DropAdjustment | undefined => {
  if (!positiveFinite(numerator) || !positiveFinite(denominator)
    || !nonnegativeFinite(lootQuantity)) return undefined;
  const adjustedDenominator = Math.max(1, Math.round(denominator / (1 + lootQuantity / 100)));
  return {
    adjustedDenominator,
    adjustedProbability: Math.min(1, numerator / adjustedDenominator),
  };
};

export const calculateMonster = (
  missing: number,
  source: PlanningSource,
  killsPerHour: unknown,
  lootQuantity: unknown,
  context: Partial<PlanDiagnostic> = {},
): EstimateOutcome<MonsterEstimate> => {
  const adjustment = adjustDrop(source.numerator, source.denominator, lootQuantity);
  if (missing === 0 && adjustment) {
    return {
      estimate: {
        kind: 'monster',
        ...adjustment,
        expectedAttempts: 0,
        expectedItemsPerHour: positiveFinite(killsPerHour)
          ? killsPerHour * adjustment.adjustedProbability : 0,
        hours: 0,
      },
      diagnostics: [],
    };
  }
  if (!adjustment) {
    return { diagnostics: [diagnostic('invalid_rate', { ...context, field: 'lootQuantity' })] };
  }
  if (!positiveFinite(killsPerHour)) {
    return { diagnostics: [diagnostic('rate_required', { ...context, field: 'killRate', sourceId: source.id })] };
  }
  const expectedAttempts = missing / adjustment.adjustedProbability;
  const expectedItemsPerHour = killsPerHour * adjustment.adjustedProbability;
  return {
    estimate: {
      kind: 'monster',
      ...adjustment,
      expectedAttempts,
      expectedItemsPerHour,
      hours: expectedAttempts / killsPerHour,
    },
    diagnostics: [],
  };
};

export const calculateBoss = (
  missing: number,
  source: PlanningSource,
  lootQuantity: unknown,
  context: Partial<PlanDiagnostic> = {},
): EstimateOutcome<BossEstimate> => {
  const adjustment = adjustDrop(source.numerator, source.denominator, lootQuantity);
  if (!adjustment) {
    return { diagnostics: [diagnostic('invalid_rate', { ...context, field: 'lootQuantity' })] };
  }
  return {
    estimate: {
      kind: 'boss',
      ...adjustment,
      expectedFights: missing === 0 ? 0 : missing / adjustment.adjustedProbability,
    },
    diagnostics: [],
  };
};

export const calculateSmelting = (
  missing: number,
  processingSeconds: unknown,
  context: Partial<PlanDiagnostic> = {},
): EstimateOutcome<SmeltingEstimate> => {
  if (!safeNonnegativeInteger(missing) || !positiveFinite(processingSeconds)
    || !Number.isSafeInteger(processingSeconds)) {
    return { diagnostics: [diagnostic('invalid_duration', context)] };
  }
  const seconds = missing * processingSeconds;
  if (!Number.isSafeInteger(seconds)) {
    return { diagnostics: [diagnostic('quantity_overflow', context)] };
  }
  return { estimate: { kind: 'smelting', seconds }, diagnostics: [] };
};

export const estimateForNode = (
  entityId: string,
  missing: number,
  source: SourceResolution | undefined,
  product: Readonly<Product> | undefined,
  planning: Readonly<Planning>,
  context: Partial<PlanDiagnostic>,
): EstimateOutcome<PlanEstimate> => {
  if (product?.kind === 'smelting') {
    return calculateSmelting(missing, product.processingSeconds, context);
  }
  const selected = source?.selected;
  if (!selected) return { diagnostics: [] };
  if (selected.kind === 'gather') {
    return calculateGathering(missing, planning.gatherRates[selected.id], context);
  }
  if (selected.kind === 'monster') {
    return calculateMonster(missing, selected, planning.killRates[selected.id], planning.lootQuantity, context);
  }
  return calculateBoss(missing, selected, planning.lootQuantity, context);
};
