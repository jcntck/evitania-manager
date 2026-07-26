import type {
  AppData, CompletionCredit, Enemy, Goal, Item, Product, Resource,
} from '../shared/domain';
import { detectProductionCycle } from './production-graph';

export type DomainValidationCode =
  | 'invalid_structure'
  | 'invalid_identifier'
  | 'invalid_name'
  | 'invalid_image'
  | 'invalid_act'
  | 'invalid_quantity'
  | 'invalid_rate'
  | 'invalid_reference'
  | 'duplicate_identifier'
  | 'duplicate_relation'
  | 'invalid_product_kind'
  | 'invalid_priority'
  | 'production_cycle';

export type DomainValidationIssue = {
  code: DomainValidationCode;
  path: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
};

export class AppDataValidationError extends Error {
  constructor(readonly issues: readonly DomainValidationIssue[]) {
    super(issues[0]?.message ?? 'Estrutura de dados inválida.');
    this.name = 'AppDataValidationError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET = /^asset:\/\/(items|resources|recipes|smelting|monsters|bosses)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg)$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
};

const isSafePositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === 'number' && value > 0;

const isSafeNonnegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;

const isPositiveRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export class AppDataValidator {
  validate(value: unknown): asserts value is AppData {
    const issues = this.inspect(value);
    if (issues.length > 0) throw new AppDataValidationError(issues);
  }

  inspect(value: unknown): DomainValidationIssue[] {
    const issues: DomainValidationIssue[] = [];
    const issue = (code: DomainValidationCode, path: string, message: string,
      details?: Readonly<Record<string, unknown>>): void => {
      issues.push({ code, path, message, ...(details ? { details } : {}) });
    };

    if (!isRecord(value) || !exactKeys(value, ['version', 'catalog', 'planning']) || value.version !== 2) {
      issue('invalid_structure', '$', 'Estrutura de dados schema-v2 inválida.');
      return issues;
    }
    if (!isRecord(value.catalog)
      || !exactKeys(value.catalog, ['items', 'resources', 'products', 'monsters', 'bosses'])
      || !Array.isArray(value.catalog.items)
      || !Array.isArray(value.catalog.resources)
      || !Array.isArray(value.catalog.products)
      || !Array.isArray(value.catalog.monsters)
      || !Array.isArray(value.catalog.bosses)) {
      issue('invalid_structure', '$.catalog', 'Catálogo inválido.');
      return issues;
    }
    if (!isRecord(value.planning)
      || !exactKeys(value.planning, [
        'goals', 'stock', 'gatherRates', 'killRates', 'lootQuantity',
        'selectedSources', 'completionCredits',
      ])
      || !Array.isArray(value.planning.goals)
      || !Array.isArray(value.planning.completionCredits)
      || !isRecord(value.planning.stock)
      || !isRecord(value.planning.gatherRates)
      || !isRecord(value.planning.killRates)
      || !isRecord(value.planning.selectedSources)) {
      issue('invalid_structure', '$.planning', 'Planejamento inválido.');
      return issues;
    }

    const data = value as unknown as AppData;
    const allIds = new Map<string, string>();
    const registerId = (id: unknown, path: string): id is string => {
      if (typeof id !== 'string' || !UUID.test(id)) {
        issue('invalid_identifier', path, 'Identificador UUID inválido.');
        return false;
      }
      const existing = allIds.get(id);
      if (existing) issue('duplicate_identifier', path, 'Identificador duplicado.', { existing });
      else allIds.set(id, path);
      return true;
    };
    const validateName = (name: unknown, path: string): void => {
      if (typeof name !== 'string' || name.trim() !== name || name.length === 0 || name.length > 100) {
        issue('invalid_name', path, 'Nome obrigatório, sem espaços externos e com até 100 caracteres.');
      }
    };
    const validateImage = (image: unknown, path: string): void => {
      if (image !== undefined && (typeof image !== 'string' || !ASSET.test(image))) {
        issue('invalid_image', path, 'Referência de imagem gerenciada inválida.');
      }
    };

    data.catalog.items.forEach((item, index) => {
      const path = `$.catalog.items[${index}]`;
      if (!isRecord(item) || !exactKeys(item, ['id', 'name'], ['image'])) {
        issue('invalid_structure', path, 'Item inválido.');
        return;
      }
      registerId(item.id, `${path}.id`);
      validateName(item.name, `${path}.name`);
      validateImage(item.image, `${path}.image`);
    });
    data.catalog.resources.forEach((resource, index) => {
      const path = `$.catalog.resources[${index}]`;
      if (!isRecord(resource) || !exactKeys(resource, ['id', 'itemId', 'act'], ['image'])) {
        issue('invalid_structure', path, 'Recurso inválido.');
        return;
      }
      registerId(resource.id, `${path}.id`);
      if (typeof resource.itemId !== 'string' || !UUID.test(resource.itemId)) {
        issue('invalid_identifier', `${path}.itemId`, 'Referência de item inválida.');
      }
      if (!['I', 'II', 'III'].includes(String(resource.act))) issue('invalid_act', `${path}.act`, 'Ato inválido.');
      validateImage(resource.image, `${path}.image`);
    });
    data.catalog.products.forEach((product, index) => {
      const path = `$.catalog.products[${index}]`;
      if (!isRecord(product)
        || !exactKeys(product, ['id', 'name', 'kind', 'components'], ['image', 'processingSeconds'])
        || !Array.isArray(product.components)) {
        issue('invalid_structure', path, 'Produto inválido.');
        return;
      }
      registerId(product.id, `${path}.id`);
      validateName(product.name, `${path}.name`);
      validateImage(product.image, `${path}.image`);
      if (product.kind !== 'recipe' && product.kind !== 'smelting') {
        issue('invalid_product_kind', `${path}.kind`, 'Tipo de produto inválido.');
      }
      if (product.kind === 'smelting' && !isSafePositiveInteger(product.processingSeconds)) {
        issue('invalid_quantity', `${path}.processingSeconds`, 'Tempo de processamento deve ser inteiro positivo.');
      }
      if (product.kind === 'recipe' && product.processingSeconds !== undefined) {
        issue('invalid_structure', `${path}.processingSeconds`, 'Receita não possui tempo de fundição.');
      }
      if (product.components.length === 0) issue('invalid_structure', `${path}.components`, 'Produto requer componentes.');
      const relations = new Set<string>();
      product.components.forEach((component, componentIndex) => {
        const componentPath = `${path}.components[${componentIndex}]`;
        if (!isRecord(component) || !exactKeys(component, ['entityId', 'quantity'])) {
          issue('invalid_structure', componentPath, 'Componente inválido.');
          return;
        }
        if (typeof component.entityId !== 'string' || !UUID.test(component.entityId)) {
          issue('invalid_identifier', `${componentPath}.entityId`, 'Referência de componente inválida.');
        } else if (relations.has(component.entityId)) {
          issue('duplicate_relation', `${componentPath}.entityId`, 'Componente duplicado.');
        } else relations.add(component.entityId);
        if (!isSafePositiveInteger(component.quantity)) {
          issue('invalid_quantity', `${componentPath}.quantity`, 'Quantidade deve ser inteiro seguro positivo.');
        }
      });
    });
    const validateEnemy = (enemy: Enemy, path: string): void => {
      if (!isRecord(enemy) || !exactKeys(enemy, ['id', 'name', 'act', 'drops'], ['image'])
        || !Array.isArray(enemy.drops)) {
        issue('invalid_structure', path, 'Inimigo inválido.');
        return;
      }
      registerId(enemy.id, `${path}.id`);
      validateName(enemy.name, `${path}.name`);
      validateImage(enemy.image, `${path}.image`);
      if (!['I', 'II', 'III'].includes(String(enemy.act))) issue('invalid_act', `${path}.act`, 'Ato inválido.');
      const drops = new Set<string>();
      enemy.drops.forEach((drop, dropIndex) => {
        const dropPath = `${path}.drops[${dropIndex}]`;
        if (!isRecord(drop) || !exactKeys(drop, ['itemId', 'numerator', 'denominator'])) {
          issue('invalid_structure', dropPath, 'Drop inválido.');
          return;
        }
        if (typeof drop.itemId !== 'string' || !UUID.test(drop.itemId)) {
          issue('invalid_identifier', `${dropPath}.itemId`, 'Referência de item inválida.');
        } else if (drops.has(drop.itemId)) {
          issue('duplicate_relation', `${dropPath}.itemId`, 'Drop duplicado.');
        } else drops.add(drop.itemId);
        if (!isSafePositiveInteger(drop.numerator) || !isSafePositiveInteger(drop.denominator)
          || (typeof drop.numerator === 'number' && typeof drop.denominator === 'number'
            && drop.numerator > drop.denominator)) {
          issue('invalid_quantity', dropPath, 'Taxa de drop deve ser inteira, positiva e no máximo 1.');
        }
      });
    };
    data.catalog.monsters.forEach((enemy, index) => validateEnemy(enemy, `$.catalog.monsters[${index}]`));
    data.catalog.bosses.forEach((enemy, index) => validateEnemy(enemy, `$.catalog.bosses[${index}]`));

    const itemIds = new Set(data.catalog.items.flatMap((item: Item) =>
      isRecord(item) && typeof item.id === 'string' ? [item.id] : []));
    const validProducts = data.catalog.products.filter((product: Product) =>
      isRecord(product) && typeof product.id === 'string' && Array.isArray(product.components));
    const productIds = new Set(validProducts.map((product) => product.id));
    const entityIds = new Set([...itemIds, ...productIds]);
    const resourceIds = new Set(data.catalog.resources.flatMap((resource: Resource) =>
      isRecord(resource) && typeof resource.id === 'string' ? [resource.id] : []));
    const monsterIds = new Set(data.catalog.monsters.flatMap((enemy: Enemy) =>
      isRecord(enemy) && typeof enemy.id === 'string' ? [enemy.id] : []));
    const bossIds = new Set(data.catalog.bosses.flatMap((enemy: Enemy) =>
      isRecord(enemy) && typeof enemy.id === 'string' ? [enemy.id] : []));
    const sourceIds = new Set([...resourceIds, ...monsterIds, ...bossIds]);

    data.catalog.resources.forEach((resource, index) => {
      if (!isRecord(resource)) return;
      if (!itemIds.has(resource.itemId)) {
        issue('invalid_reference', `$.catalog.resources[${index}].itemId`, 'Item referenciado não existe.');
      }
    });
    data.catalog.products.forEach((product, index) => {
      if (!isRecord(product) || !Array.isArray(product.components)) return;
      product.components.forEach((component, componentIndex) => {
      if (!isRecord(component)) return;
      if (!entityIds.has(component.entityId)) {
        issue('invalid_reference', `$.catalog.products[${index}].components[${componentIndex}].entityId`,
          'Componente referenciado não existe.');
      }
    });
    });
    [...data.catalog.monsters, ...data.catalog.bosses].forEach((enemy, enemyIndex) => {
      if (!isRecord(enemy) || !Array.isArray(enemy.drops)) return;
      enemy.drops.forEach((drop, dropIndex) => {
        if (!isRecord(drop)) return;
        if (!itemIds.has(drop.itemId)) {
          issue('invalid_reference', `$.catalog.enemies[${enemyIndex}].drops[${dropIndex}].itemId`,
            'Item de drop não existe.');
        }
      });
    });

    const priorities = new Set<number>();
    data.planning.goals.forEach((goal: Goal, index) => {
      const path = `$.planning.goals[${index}]`;
      if (!isRecord(goal) || !exactKeys(goal, ['id', 'productId', 'quantity', 'completed', 'priority'])) {
        issue('invalid_structure', path, 'Objetivo inválido.');
        return;
      }
      registerId(goal.id, `${path}.id`);
      if (!productIds.has(goal.productId)
        || data.catalog.products.find((product) => product.id === goal.productId)?.kind !== 'recipe') {
        issue('invalid_reference', `${path}.productId`, 'Objetivo deve referenciar uma receita.');
      }
      if (!isSafePositiveInteger(goal.quantity)) issue('invalid_quantity', `${path}.quantity`, 'Quantidade inválida.');
      if (typeof goal.completed !== 'boolean') issue('invalid_structure', `${path}.completed`, 'Estado inválido.');
      if (!isSafeNonnegativeInteger(goal.priority) || priorities.has(goal.priority)) {
        issue('invalid_priority', `${path}.priority`, 'Prioridade deve ser inteira, não negativa e única.');
      } else priorities.add(goal.priority);
    });
    if (priorities.size === data.planning.goals.length
      && [...priorities].some((priority) => priority >= data.planning.goals.length)) {
      issue('invalid_priority', '$.planning.goals', 'Prioridades devem formar a sequência 0..n-1.');
    }

    this.validateNumericMap(data.planning.stock, '$.planning.stock', entityIds, isSafeNonnegativeInteger, issue,
      'invalid_quantity');
    this.validateNumericMap(data.planning.gatherRates, '$.planning.gatherRates', resourceIds, isPositiveRate, issue,
      'invalid_rate');
    this.validateNumericMap(data.planning.killRates, '$.planning.killRates', monsterIds, isPositiveRate, issue,
      'invalid_rate');
    if (typeof data.planning.lootQuantity !== 'number' || !Number.isFinite(data.planning.lootQuantity)
      || data.planning.lootQuantity < 0) {
      issue('invalid_rate', '$.planning.lootQuantity', 'Quantidade de saque deve ser finita e não negativa.');
    }
    for (const [itemId, sourceId] of Object.entries(data.planning.selectedSources)) {
      if (!itemIds.has(itemId) || typeof sourceId !== 'string' || !sourceIds.has(sourceId)
        || !this.sourceProvidesItem(data, sourceId, itemId)) {
        issue('invalid_reference', `$.planning.selectedSources.${itemId}`, 'Origem selecionada incompatível.');
      }
    }
    data.planning.completionCredits.forEach((credit: CompletionCredit, index) => {
      const path = `$.planning.completionCredits[${index}]`;
      if (!isRecord(credit)
        || !exactKeys(credit, ['id', 'entityId', 'quantity', 'createdAt'], ['reversedAt'])) {
        issue('invalid_structure', path, 'Crédito de conclusão inválido.');
        return;
      }
      registerId(credit.id, `${path}.id`);
      if (!entityIds.has(credit.entityId)) issue('invalid_reference', `${path}.entityId`, 'Entidade não existe.');
      if (!isSafePositiveInteger(credit.quantity)) issue('invalid_quantity', `${path}.quantity`, 'Crédito inválido.');
      if (typeof credit.createdAt !== 'string' || !ISO_INSTANT.test(credit.createdAt)
        || Number.isNaN(Date.parse(credit.createdAt))) {
        issue('invalid_structure', `${path}.createdAt`, 'Data de criação inválida.');
      }
      if (credit.reversedAt !== undefined && (typeof credit.reversedAt !== 'string'
        || !ISO_INSTANT.test(credit.reversedAt) || Number.isNaN(Date.parse(credit.reversedAt)))) {
        issue('invalid_structure', `${path}.reversedAt`, 'Data de reversão inválida.');
      }
    });

    const cycle = detectProductionCycle(validProducts);
    if (cycle) {
      issue('production_cycle', '$.catalog.products', 'Ciclo de produção detectado.', { cycle });
    }
    return issues;
  }

  private validateNumericMap(
    map: Record<string, unknown>,
    path: string,
    allowedIds: ReadonlySet<string>,
    predicate: (value: unknown) => boolean,
    issue: (code: DomainValidationCode, path: string, message: string) => void,
    code: DomainValidationCode,
  ): void {
    for (const [id, value] of Object.entries(map)) {
      if (!allowedIds.has(id)) issue('invalid_reference', `${path}.${id}`, 'Entidade referenciada não existe.');
      if (!predicate(value)) issue(code, `${path}.${id}`, 'Valor numérico inválido.');
    }
  }

  private sourceProvidesItem(data: AppData, sourceId: string, itemId: string): boolean {
    return data.catalog.resources.some((resource) => isRecord(resource)
      && resource.id === sourceId && resource.itemId === itemId)
      || data.catalog.monsters.some((enemy) => isRecord(enemy) && enemy.id === sourceId
        && Array.isArray(enemy.drops)
        && enemy.drops.some((drop) => isRecord(drop) && drop.itemId === itemId))
      || data.catalog.bosses.some((enemy) => isRecord(enemy) && enemy.id === sourceId
        && Array.isArray(enemy.drops)
        && enemy.drops.some((drop) => isRecord(drop) && drop.itemId === itemId));
  }

}
