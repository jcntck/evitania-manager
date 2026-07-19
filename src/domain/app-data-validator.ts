import type { AppData, Enemy, Product } from '../shared/domain';

export class AppDataValidator {
  validate(value: unknown): asserts value is AppData {
    if (!this.isRecord(value) || value.version !== 1) throw new Error('Versão de dados inválida.');
    if (!this.isCatalog(value.catalog) || !this.isPlanning(value.planning)) throw new Error('Estrutura de dados inválida.');
  }

  private isCatalog(value: unknown): boolean {
    if (!this.isRecord(value)) return false;
    return this.isArray(value.items) && value.items.every((item) => this.isNamedEntity(item))
      && this.isArray(value.resources) && value.resources.every((resource) => this.isResource(resource))
      && this.isArray(value.products) && value.products.every((product) => this.isProduct(product))
      && this.isArray(value.monsters) && value.monsters.every((enemy) => this.isEnemy(enemy))
      && this.isArray(value.bosses) && value.bosses.every((enemy) => this.isEnemy(enemy));
  }

  private isPlanning(value: unknown): boolean {
    if (!this.isRecord(value) || !this.isArray(value.goals)) return false;
    const maps = ['stock', 'gatherRates', 'killRates', 'completedEntities', 'selectedSources'];
    return value.goals.every((goal) => this.isGoal(goal)) && maps.every((key) => this.isRecord(value[key]))
      && this.isFiniteNumber(value.lootQuantity);
  }

  private isNamedEntity(value: unknown): boolean {
    return this.isRecord(value) && this.isIdentifier(value.id) && this.isName(value.name)
      && this.isOptionalImage(value.image);
  }

  private isResource(value: unknown): boolean {
    return this.isRecord(value) && this.isIdentifier(value.id) && this.isIdentifier(value.itemId)
      && this.isAct(value.act) && this.isOptionalImage(value.image);
  }

  private isProduct(value: unknown): value is Product {
    if (!this.isNamedEntity(value) || !this.isRecord(value) || !this.isArray(value.components)) return false;
    const validKind = value.kind === 'recipe' || value.kind === 'smeltery';
    const validComponents = value.components.every((component) => this.isComponent(component));
    return validKind && validComponents && (value.processingSeconds === undefined || this.isFiniteNumber(value.processingSeconds));
  }

  private isEnemy(value: unknown): value is Enemy {
    if (!this.isNamedEntity(value) || !this.isRecord(value) || !this.isArray(value.drops)) return false;
    return this.isAct(value.act) && value.drops.every((drop) => this.isDrop(drop));
  }

  private isComponent(value: unknown): boolean {
    return this.isRecord(value) && this.isIdentifier(value.entityId) && this.isPositiveNumber(value.quantity);
  }

  private isDrop(value: unknown): boolean {
    return this.isRecord(value) && this.isIdentifier(value.itemId)
      && this.isPositiveNumber(value.numerator) && this.isPositiveNumber(value.denominator);
  }

  private isGoal(value: unknown): boolean {
    return this.isRecord(value) && this.isIdentifier(value.id) && this.isIdentifier(value.productId)
      && this.isPositiveNumber(value.quantity) && typeof value.completed === 'boolean';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  private isIdentifier(value: unknown): boolean {
    return typeof value === 'string' && value.length > 0 && value.length <= 150;
  }

  private isName(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
  }

  private isAct(value: unknown): boolean {
    return value === 'I' || value === 'II' || value === 'III';
  }

  private isOptionalImage(value: unknown): boolean {
    return value === undefined || (typeof value === 'string' && /^asset:\/\/[a-z]+\/[a-f0-9-]+\.(png|jpg)$/.test(value));
  }

  private isPositiveNumber(value: unknown): boolean {
    return this.isFiniteNumber(value) && value > 0;
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
}
