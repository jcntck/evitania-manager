import { AppDataValidator } from './app-data-validator';
import { detectProductionCycle } from './production-graph';
import type {
  Act,
  AppData,
  Component,
  Enemy,
  EntityCategory,
  Item,
  Product,
  Resource,
  Result,
} from '../shared/domain';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTS = new Set<unknown>(['I', 'II', 'III']);
const IMAGE_CATEGORY: Readonly<Record<EntityCategory, EntityCategory>> = {
  items: 'items',
  resources: 'resources',
  recipes: 'recipes',
  smelting: 'smelting',
  monsters: 'monsters',
  bosses: 'bosses',
};

export type CatalogFieldErrorCode =
  | 'invalid_identifier'
  | 'invalid_name'
  | 'invalid_image'
  | 'invalid_act'
  | 'invalid_reference'
  | 'invalid_quantity'
  | 'invalid_duration'
  | 'duplicate_relation'
  | 'invalid_product_kind';

export type CatalogFieldError = Readonly<{
  code: CatalogFieldErrorCode;
  field: string;
}>;

export type ReferenceKind =
  | 'resource'
  | 'component'
  | 'drop'
  | 'goal'
  | 'stock'
  | 'selected_source'
  | 'completion_credit'
  | 'gather_rate'
  | 'kill_rate';

export type BlockingReference = Readonly<{
  kind: ReferenceKind;
  entityId: string;
  ownerId: string;
  path: string;
}>;

export type CatalogError =
  | Readonly<{ code: 'invalid_candidate'; fields: readonly CatalogFieldError[] }>
  | Readonly<{ code: 'duplicate_identifier'; entityId: string }>
  | Readonly<{ code: 'entity_not_found'; entityId: string }>
  | Readonly<{ code: 'stale_entity'; entityId: string }>
  | Readonly<{ code: 'referenced_entity'; entityId: string; references: readonly BlockingReference[] }>
  | Readonly<{ code: 'production_cycle'; cycle: readonly string[] }>
  | Readonly<{ code: 'invalid_snapshot'; fields: readonly CatalogFieldError[] }>;

export type ItemCandidate = Readonly<{
  id: unknown;
  name: unknown;
  image?: unknown;
}>;

export type ResourceCandidate = Readonly<{
  id: unknown;
  itemId: unknown;
  act: unknown;
  image?: unknown;
}>;

export type ComponentCandidate = Readonly<{
  entityId: unknown;
  quantity: unknown;
}>;

export type ProductCandidate = Readonly<{
  id: unknown;
  name: unknown;
  kind?: unknown;
  image?: unknown;
  processingSeconds?: unknown;
  components: readonly ComponentCandidate[];
}>;

export type DropCandidate = Readonly<{
  itemId: unknown;
  numerator: unknown;
  denominator: unknown;
}>;

export type EnemyCandidate = Readonly<{
  id: unknown;
  name: unknown;
  act: unknown;
  image?: unknown;
  drops: readonly DropCandidate[];
}>;

type CandidateByCategory = {
  items: ItemCandidate;
  resources: ResourceCandidate;
  recipes: ProductCandidate;
  smelting: ProductCandidate;
  monsters: EnemyCandidate;
  bosses: EnemyCandidate;
};

export type CatalogEntity = Item | Resource | Product | Enemy;

export type CatalogMutation = {
  [Category in EntityCategory]:
    | Readonly<{
      type: 'create';
      category: Category;
      candidate: CandidateByCategory[Category];
    }>
    | Readonly<{
      type: 'update';
      category: Category;
      candidate: CandidateByCategory[Category];
      expectedEntity: CatalogEntity;
    }>
    | Readonly<{
      type: 'delete';
      category: Category;
      id: string;
      expectedEntity: CatalogEntity;
    }>
}[EntityCategory];

const field = (code: CatalogFieldErrorCode, name: string): CatalogFieldError => ({
  code,
  field: name,
});

const invalid = <T>(fields: readonly CatalogFieldError[]): Result<T, CatalogError> => ({
  ok: false,
  error: { code: 'invalid_candidate', fields },
});

const isSafePositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const parseIntegerInput = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const checkedTotal = (parts: readonly [number, number][]): number | undefined => {
  let total = 0;
  for (const [value, multiplier] of parts) {
    const part = value * multiplier;
    if (!Number.isSafeInteger(part) || !Number.isSafeInteger(total + part)) return undefined;
    total += part;
  }
  return total > 0 ? total : undefined;
};

export const parseProcessingDuration = (value: unknown): Result<number, CatalogFieldError> => {
  if (typeof value === 'number') {
    return isSafePositiveInteger(value)
      ? { ok: true, value }
      : { ok: false, error: field('invalid_duration', 'processingSeconds') };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: field('invalid_duration', 'processingSeconds') };
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return { ok: false, error: field('invalid_duration', 'processingSeconds') };
  }

  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    return isSafePositiveInteger(seconds)
      ? { ok: true, value: seconds }
      : { ok: false, error: field('invalid_duration', 'processingSeconds') };
  }
  const secondsOnly = normalized.match(/^(\d+)\s*s$/);
  if (secondsOnly) {
    const seconds = Number(secondsOnly[1]);
    return isSafePositiveInteger(seconds)
      ? { ok: true, value: seconds }
      : { ok: false, error: field('invalid_duration', 'processingSeconds') };
  }
  const clock = normalized.match(/^(\d+):([0-5]\d)$/);
  if (clock) {
    const total = checkedTotal([[Number(clock[1]), 60], [Number(clock[2]), 1]]);
    return total === undefined
      ? { ok: false, error: field('invalid_duration', 'processingSeconds') }
      : { ok: true, value: total };
  }

  const units = normalized.match(/^(?:(\d+)\s*d\s*)?(?:(\d+)\s*h\s*)?(?:(\d+)\s*m\s*)?(?:(\d+)\s*s\s*)?$/);
  if (units && units.slice(1).some((part) => part !== undefined)) {
    const total = checkedTotal([
      [Number(units[1] ?? 0), 86_400],
      [Number(units[2] ?? 0), 3_600],
      [Number(units[3] ?? 0), 60],
      [Number(units[4] ?? 0), 1],
    ]);
    return total === undefined
      ? { ok: false, error: field('invalid_duration', 'processingSeconds') }
      : { ok: true, value: total };
  }
  return { ok: false, error: field('invalid_duration', 'processingSeconds') };
};

export const parseStockQuantity = (value: unknown): Result<number, CatalogFieldError> => {
  const parsed = parseIntegerInput(value);
  return parsed !== undefined && parsed >= 0
    ? { ok: true, value: parsed }
    : { ok: false, error: field('invalid_quantity', 'stock') };
};

const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) =>
      key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]));
};

const sameEntity = (left: CatalogEntity, right: CatalogEntity): boolean =>
  sameValue(left, right);

export class ReferenceIndex {
  private readonly references = new Map<string, BlockingReference[]>();
  private readonly entities = new Map<string, CatalogEntity>();

  constructor(readonly data: Readonly<AppData>) {
    this.build();
  }

  referencesTo(entityId: string): readonly BlockingReference[] {
    return this.references.get(entityId) ?? [];
  }

  canDelete(
    entityId: string,
    expectedEntity?: CatalogEntity,
  ): Result<Readonly<{ entity: CatalogEntity }>, CatalogError> {
    const entity = this.entities.get(entityId);
    if (!entity) return { ok: false, error: { code: 'entity_not_found', entityId } };
    if (expectedEntity && !sameEntity(entity, expectedEntity)) {
      return { ok: false, error: { code: 'stale_entity', entityId } };
    }
    const references = this.referencesTo(entityId);
    return references.length > 0
      ? { ok: false, error: { code: 'referenced_entity', entityId, references } }
      : { ok: true, value: { entity } };
  }

  private add(entityId: string, reference: BlockingReference): void {
    const current = this.references.get(entityId);
    if (current) current.push(reference);
    else this.references.set(entityId, [reference]);
  }

  private build(): void {
    const { catalog, planning } = this.data;
    for (const entity of [
      ...catalog.items,
      ...catalog.resources,
      ...catalog.products,
      ...catalog.monsters,
      ...catalog.bosses,
    ]) this.entities.set(entity.id, entity);

    for (const resource of catalog.resources) {
      this.add(resource.itemId, {
        kind: 'resource',
        entityId: resource.itemId,
        ownerId: resource.id,
        path: `catalog.resources.${resource.id}.itemId`,
      });
    }
    for (const product of catalog.products) {
      for (const component of product.components) {
        this.add(component.entityId, {
          kind: 'component',
          entityId: component.entityId,
          ownerId: product.id,
          path: `catalog.products.${product.id}.components`,
        });
      }
    }
    for (const [kind, enemies] of [
      ['monsters', catalog.monsters],
      ['bosses', catalog.bosses],
    ] as const) {
      for (const enemy of enemies) {
        for (const drop of enemy.drops) {
          this.add(drop.itemId, {
            kind: 'drop',
            entityId: drop.itemId,
            ownerId: enemy.id,
            path: `catalog.${kind}.${enemy.id}.drops`,
          });
        }
      }
    }
    for (const goal of planning.goals) {
      this.add(goal.productId, {
        kind: 'goal',
        entityId: goal.productId,
        ownerId: goal.id,
        path: `planning.goals.${goal.id}.productId`,
      });
    }
    for (const entityId of Object.keys(planning.stock)) {
      this.add(entityId, {
        kind: 'stock',
        entityId,
        ownerId: entityId,
        path: `planning.stock.${entityId}`,
      });
    }
    for (const [itemId, sourceId] of Object.entries(planning.selectedSources)) {
      this.add(itemId, {
        kind: 'selected_source',
        entityId: itemId,
        ownerId: sourceId,
        path: `planning.selectedSources.${itemId}`,
      });
      this.add(sourceId, {
        kind: 'selected_source',
        entityId: sourceId,
        ownerId: itemId,
        path: `planning.selectedSources.${itemId}`,
      });
    }
    for (const credit of planning.completionCredits) {
      this.add(credit.entityId, {
        kind: 'completion_credit',
        entityId: credit.entityId,
        ownerId: credit.id,
        path: `planning.completionCredits.${credit.id}.entityId`,
      });
    }
    for (const sourceId of Object.keys(planning.gatherRates)) {
      this.add(sourceId, {
        kind: 'gather_rate',
        entityId: sourceId,
        ownerId: sourceId,
        path: `planning.gatherRates.${sourceId}`,
      });
    }
    for (const sourceId of Object.keys(planning.killRates)) {
      this.add(sourceId, {
        kind: 'kill_rate',
        entityId: sourceId,
        ownerId: sourceId,
        path: `planning.killRates.${sourceId}`,
      });
    }
  }
}

export class CatalogService {
  constructor(private readonly validator = new AppDataValidator()) {}

  validateItem(candidate: ItemCandidate): Result<Item, CatalogError> {
    const errors = this.validateIdNameImage(candidate, 'items');
    if (errors.length > 0) return invalid(errors);
    return {
      ok: true,
      value: {
        id: candidate.id as string,
        name: (candidate.name as string).trim(),
        ...(candidate.image === undefined ? {} : { image: candidate.image as string }),
      },
    };
  }

  validateResource(data: Readonly<AppData>, candidate: ResourceCandidate): Result<Resource, CatalogError> {
    const errors = this.validateIdImage(candidate, 'resources');
    if (typeof candidate.itemId !== 'string'
      || !data.catalog.items.some((item) => item.id === candidate.itemId)) {
      errors.push(field('invalid_reference', 'itemId'));
    }
    if (!ACTS.has(candidate.act)) errors.push(field('invalid_act', 'act'));
    if (errors.length > 0) return invalid(errors);
    return {
      ok: true,
      value: {
        id: candidate.id as string,
        itemId: candidate.itemId as string,
        act: candidate.act as Act,
        ...(candidate.image === undefined ? {} : { image: candidate.image as string }),
      },
    };
  }

  validateProduct(
    data: Readonly<AppData>,
    category: 'recipes' | 'smelting',
    candidate: ProductCandidate,
  ): Result<Product, CatalogError> {
    const errors = this.validateIdNameImage(candidate, category);
    const expectedKind = category === 'recipes' ? 'recipe' : 'smelting';
    if (candidate.kind !== undefined && candidate.kind !== expectedKind) {
      errors.push(field('invalid_product_kind', 'kind'));
    }
    const components = Array.isArray(candidate.components) ? candidate.components : [];
    if (components.length === 0) errors.push(field('invalid_quantity', 'components'));
    const entityIds = new Set([
      ...data.catalog.items.map((item) => item.id),
      ...data.catalog.products.map((product) => product.id),
    ]);
    if (typeof candidate.id === 'string' && UUID.test(candidate.id)) entityIds.add(candidate.id);
    const seen = new Set<string>();
    const normalizedComponents: Component[] = [];
    components.forEach((component, index) => {
      if (typeof component?.entityId !== 'string' || !entityIds.has(component.entityId)) {
        errors.push(field('invalid_reference', `components[${index}].entityId`));
      } else if (seen.has(component.entityId)) {
        errors.push(field('duplicate_relation', `components[${index}].entityId`));
      } else {
        seen.add(component.entityId);
      }
      const quantity = parseIntegerInput(component?.quantity);
      if (quantity === undefined || quantity <= 0) {
        errors.push(field('invalid_quantity', `components[${index}].quantity`));
      } else if (typeof component.entityId === 'string') {
        normalizedComponents.push({ entityId: component.entityId, quantity });
      }
    });
    let processingSeconds: number | undefined;
    if (category === 'smelting') {
      const duration = parseProcessingDuration(candidate.processingSeconds);
      if (!duration.ok) errors.push(duration.error);
      else processingSeconds = duration.value;
    } else if (candidate.processingSeconds !== undefined) {
      errors.push(field('invalid_duration', 'processingSeconds'));
    }
    if (errors.length > 0) return invalid(errors);
    return {
      ok: true,
      value: {
        id: candidate.id as string,
        name: (candidate.name as string).trim(),
        kind: expectedKind,
        ...(candidate.image === undefined ? {} : { image: candidate.image as string }),
        ...(processingSeconds === undefined ? {} : { processingSeconds }),
        components: normalizedComponents,
      },
    };
  }

  validateMonster(data: Readonly<AppData>, candidate: EnemyCandidate): Result<Enemy, CatalogError> {
    return this.validateEnemy(data, 'monsters', candidate);
  }

  validateBoss(data: Readonly<AppData>, candidate: EnemyCandidate): Result<Enemy, CatalogError> {
    return this.validateEnemy(data, 'bosses', candidate);
  }

  apply(data: Readonly<AppData>, mutation: CatalogMutation): Result<AppData, CatalogError> {
    if (mutation.type === 'delete') return this.delete(data, mutation);
    const normalized = this.normalize(data, mutation.category, mutation.candidate);
    if (!normalized.ok) return normalized;
    const existing = this.findByCategory(data, mutation.category, normalized.value.id);
    if (mutation.type === 'create' && this.findAny(data, normalized.value.id)) {
      return { ok: false, error: { code: 'duplicate_identifier', entityId: normalized.value.id } };
    }
    if (mutation.type === 'update') {
      if (!existing) {
        return { ok: false, error: { code: 'entity_not_found', entityId: normalized.value.id } };
      }
      if (!sameEntity(existing, mutation.expectedEntity)) {
        return { ok: false, error: { code: 'stale_entity', entityId: normalized.value.id } };
      }
    }

    const next = structuredClone(data) as AppData;
    const collection = this.collection(next, mutation.category);
    const index = collection.findIndex((entity) => entity.id === normalized.value.id);
    if (index < 0) collection.push(normalized.value);
    else collection[index] = normalized.value;
    return this.validateSnapshot(next);
  }

  private delete(
    data: Readonly<AppData>,
    mutation: Extract<CatalogMutation, { type: 'delete' }>,
  ): Result<AppData, CatalogError> {
    const existing = this.findByCategory(data, mutation.category, mutation.id);
    if (!existing) return { ok: false, error: { code: 'entity_not_found', entityId: mutation.id } };
    if (!sameEntity(existing, mutation.expectedEntity)) {
      return { ok: false, error: { code: 'stale_entity', entityId: mutation.id } };
    }
    const deletion = new ReferenceIndex(data).canDelete(mutation.id, mutation.expectedEntity);
    if (!deletion.ok) return deletion;
    const next = structuredClone(data) as AppData;
    const collection = this.collection(next, mutation.category);
    collection.splice(collection.findIndex((entity) => entity.id === mutation.id), 1);
    return this.validateSnapshot(next);
  }

  private normalize(
    data: Readonly<AppData>,
    category: EntityCategory,
    candidate: ItemCandidate | ResourceCandidate | ProductCandidate | EnemyCandidate,
  ): Result<CatalogEntity, CatalogError> {
    switch (category) {
      case 'items': return this.validateItem(candidate as ItemCandidate);
      case 'resources': return this.validateResource(data, candidate as ResourceCandidate);
      case 'recipes':
      case 'smelting': return this.validateProduct(data, category, candidate as ProductCandidate);
      case 'monsters': return this.validateMonster(data, candidate as EnemyCandidate);
      case 'bosses': return this.validateBoss(data, candidate as EnemyCandidate);
    }
  }

  private validateEnemy(
    data: Readonly<AppData>,
    category: 'monsters' | 'bosses',
    candidate: EnemyCandidate,
  ): Result<Enemy, CatalogError> {
    const errors = this.validateIdNameImage(candidate, category);
    if (!ACTS.has(candidate.act)) errors.push(field('invalid_act', 'act'));
    const drops = Array.isArray(candidate.drops) ? candidate.drops : [];
    const itemIds = new Set(data.catalog.items.map((item) => item.id));
    const seen = new Set<string>();
    const normalizedDrops: Enemy['drops'] = [];
    drops.forEach((drop, index) => {
      if (typeof drop?.itemId !== 'string' || !itemIds.has(drop.itemId)) {
        errors.push(field('invalid_reference', `drops[${index}].itemId`));
      } else if (seen.has(drop.itemId)) {
        errors.push(field('duplicate_relation', `drops[${index}].itemId`));
      } else {
        seen.add(drop.itemId);
      }
      const numerator = parseIntegerInput(drop?.numerator);
      const denominator = parseIntegerInput(drop?.denominator);
      if (numerator === undefined || numerator <= 0) {
        errors.push(field('invalid_quantity', `drops[${index}].numerator`));
      }
      if (denominator === undefined || denominator <= 0) {
        errors.push(field('invalid_quantity', `drops[${index}].denominator`));
      }
      if (numerator !== undefined && denominator !== undefined && numerator > denominator) {
        errors.push(field('invalid_quantity', `drops[${index}].numerator`));
      }
      if (typeof drop.itemId === 'string' && numerator !== undefined && numerator > 0
        && denominator !== undefined && denominator > 0) {
        normalizedDrops.push({ itemId: drop.itemId, numerator, denominator });
      }
    });
    if (errors.length > 0) return invalid(errors);
    return {
      ok: true,
      value: {
        id: candidate.id as string,
        name: (candidate.name as string).trim(),
        act: candidate.act as Act,
        ...(candidate.image === undefined ? {} : { image: candidate.image as string }),
        drops: normalizedDrops,
      },
    };
  }

  private validateIdNameImage(
    candidate: ItemCandidate | ProductCandidate | EnemyCandidate,
    category: EntityCategory,
  ): CatalogFieldError[] {
    const errors = this.validateIdImage(candidate, category);
    if (typeof candidate.name !== 'string') errors.push(field('invalid_name', 'name'));
    else {
      const name = candidate.name.trim();
      if (name.length === 0 || name.length > 100) errors.push(field('invalid_name', 'name'));
    }
    return errors;
  }

  private validateIdImage(
    candidate: { id: unknown; image?: unknown },
    category: EntityCategory,
  ): CatalogFieldError[] {
    const errors: CatalogFieldError[] = [];
    if (typeof candidate.id !== 'string' || !UUID.test(candidate.id)) {
      errors.push(field('invalid_identifier', 'id'));
    }
    if (candidate.image !== undefined) {
      const image = typeof candidate.image === 'string' ? candidate.image : '';
      const expected = IMAGE_CATEGORY[category];
      const pattern = new RegExp(
        `^asset://${expected}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(png|jpg)$`,
        'i',
      );
      if (!pattern.test(image)) errors.push(field('invalid_image', 'image'));
    }
    return errors;
  }

  private validateSnapshot(data: AppData): Result<AppData, CatalogError> {
    const cycle = detectProductionCycle(data.catalog.products);
    if (cycle) return { ok: false, error: { code: 'production_cycle', cycle } };
    const issues = this.validator.inspect(data);
    if (issues.length > 0) {
      return {
        ok: false,
        error: {
          code: 'invalid_snapshot',
          fields: issues.map((issue) =>
            field(this.mapValidationCode(issue.code), issue.path)),
        },
      };
    }
    return { ok: true, value: data };
  }

  private mapValidationCode(code: string): CatalogFieldErrorCode {
    switch (code) {
      case 'invalid_identifier':
      case 'invalid_name':
      case 'invalid_image':
      case 'invalid_act':
      case 'invalid_reference':
      case 'invalid_quantity':
      case 'duplicate_relation':
      case 'invalid_product_kind':
        return code;
      default:
        return 'invalid_quantity';
    }
  }

  private findByCategory(
    data: Readonly<AppData>,
    category: EntityCategory,
    id: string,
  ): CatalogEntity | undefined {
    const entity = this.collection(data, category).find((candidate) => candidate.id === id);
    if (!entity || (category !== 'recipes' && category !== 'smelting')) return entity;
    if (!('kind' in entity)) return undefined;
    return entity.kind === (category === 'recipes' ? 'recipe' : 'smelting') ? entity : undefined;
  }

  private findAny(data: Readonly<AppData>, id: string): CatalogEntity | undefined {
    return [
      ...data.catalog.items,
      ...data.catalog.resources,
      ...data.catalog.products,
      ...data.catalog.monsters,
      ...data.catalog.bosses,
    ].find((entity) => entity.id === id);
  }

  private collection(
    data: Readonly<AppData> | AppData,
    category: EntityCategory,
  ): CatalogEntity[] {
    switch (category) {
      case 'items': return data.catalog.items;
      case 'resources': return data.catalog.resources;
      case 'recipes':
      case 'smelting': return data.catalog.products;
      case 'monsters': return data.catalog.monsters;
      case 'bosses': return data.catalog.bosses;
    }
  }
}

export { detectProductionCycle };
