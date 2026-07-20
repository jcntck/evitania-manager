import type { AppData, Enemy, Product } from '../shared/domain';
import type { PlanningResult, PlanningRow, PlanningSource } from './planning-result';

const safeNumber = (value: number | undefined): number => Math.max(0, Number(value) || 0);

export class Planner {
  private readonly products: Map<string, Product>;
  private readonly names: Map<string, string>;
  private readonly needs = new Map<string, number>();
  private readonly remainingAvailability: Map<string, number>;
  private cycle?: string[];

  constructor(private readonly data: AppData) {
    this.products = new Map(data.catalog.products.map((product) => [product.id, product]));
    this.names = new Map([
      ...data.catalog.items.map((item) => [item.id, item.name] as const),
      ...data.catalog.products.map((product) => [product.id, product.name] as const),
    ]);
    const entityIds = new Set([...Object.keys(data.planning.stock), ...Object.keys(data.planning.completedEntities)]);
    this.remainingAvailability = new Map([...entityIds].map((id) => [id,
      safeNumber(data.planning.stock[id]) + safeNumber(data.planning.completedEntities[id])]));
  }

  calculate(): PlanningResult {
    this.expandActiveGoals();
    const rows = [...this.needs].map(([entityId, required]) => this.createRow(entityId, required));
    return { rows: rows.sort(this.compareRows), cycle: this.cycle };
  }

  private expandActiveGoals(): void {
    for (const goal of this.data.planning.goals) {
      if (!goal.completed) this.expand(goal.productId, safeNumber(goal.quantity), []);
    }
  }

  private expand(entityId: string, quantity: number, trail: string[]): void {
    if (!quantity || this.cycle) return;
    this.needs.set(entityId, (this.needs.get(entityId) ?? 0) + quantity);
    const missing = this.consumeAvailability(entityId, quantity);
    const product = this.products.get(entityId);
    if (!product || !missing) return;
    if (trail.includes(entityId)) return this.registerCycle(trail, entityId);
    for (const component of product.components) {
      this.expand(component.entityId, missing * safeNumber(component.quantity), [...trail, entityId]);
    }
  }

  private consumeAvailability(entityId: string, quantity: number): number {
    const available = safeNumber(this.remainingAvailability.get(entityId));
    this.remainingAvailability.set(entityId, Math.max(0, available - quantity));
    return Math.max(0, quantity - available);
  }

  private registerCycle(trail: string[], entityId: string): void {
    const start = trail.indexOf(entityId);
    this.cycle = [...trail.slice(start), entityId].map((id) => this.names.get(id) ?? id);
  }

  private createRow(entityId: string, required: number): PlanningRow {
    const available = safeNumber(this.data.planning.stock[entityId])
      + safeNumber(this.data.planning.completedEntities[entityId]);
    const missing = Math.max(0, required - available);
    const sources = this.findSources(entityId);
    const selectedSource = this.selectSource(entityId, sources);
    return this.addEstimate({
      entityId, name: this.names.get(entityId) ?? 'Registro removido', required,
      available, missing, category: selectedSource?.kind ?? this.productKind(entityId),
      sources, selectedSource,
    });
  }

  private productKind(entityId: string): PlanningRow['category'] {
    const product = this.products.get(entityId);
    if (!product) return 'unknown';
    return product.kind === 'smeltery' ? 'smeltery' : 'craft';
  }

  private findSources(itemId: string): PlanningSource[] {
    const gather = this.data.catalog.resources
      .filter((resource) => resource.itemId === itemId)
      .map((resource) => ({ id: resource.id, name: `Coleta · Ato ${resource.act}`, kind: 'gather' as const }));
    return [...gather, ...this.enemySources(itemId, this.data.catalog.monsters, 'monster'),
      ...this.enemySources(itemId, this.data.catalog.bosses, 'boss')];
  }

  private enemySources(itemId: string, enemies: Enemy[], kind: 'monster' | 'boss'): PlanningSource[] {
    return enemies.flatMap((enemy) => enemy.drops.filter((drop) => drop.itemId === itemId).map((drop) => ({
      id: enemy.id, name: enemy.name, kind, numerator: drop.numerator, denominator: drop.denominator,
    })));
  }

  private selectSource(entityId: string, sources: PlanningSource[]): PlanningSource | undefined {
    const selectedId = this.data.planning.selectedSources[entityId];
    return sources.find((source) => source.id === selectedId) ?? sources[0];
  }

  private addEstimate(row: PlanningRow): PlanningRow {
    const source = row.selectedSource;
    if (!source || !row.missing) return this.addProcessingTime(row);
    if (source.kind === 'gather') return this.addGatherEstimate(row, source);
    if (source.kind === 'monster' || source.kind === 'boss') return this.addDropEstimate(row, source);
    return this.addProcessingTime(row);
  }

  private addGatherEstimate(row: PlanningRow, source: PlanningSource): PlanningRow {
    const rate = safeNumber(this.data.planning.gatherRates[source.id]);
    return { ...row, expectedPerHour: rate || undefined, estimatedHours: rate ? row.missing / rate : undefined };
  }

  private addDropEstimate(row: PlanningRow, source: PlanningSource): PlanningRow {
    const multiplier = 1 + safeNumber(this.data.planning.lootQuantity) / 100;
    const denominator = Math.max(1, Math.round(safeNumber(source.denominator) / multiplier));
    const probability = Math.min(1, safeNumber(source.numerator) / denominator);
    const expectedAttempts = probability ? row.missing / probability : undefined;
    if (source.kind === 'boss') return { ...row, expectedAttempts };
    const kills = safeNumber(this.data.planning.killRates[source.id]);
    const expectedPerHour = kills * probability;
    return { ...row, expectedAttempts, expectedPerHour: expectedPerHour || undefined,
      estimatedHours: expectedPerHour ? row.missing / expectedPerHour : undefined };
  }

  private addProcessingTime(row: PlanningRow): PlanningRow {
    const product = this.products.get(row.entityId);
    if (product?.kind !== 'smeltery') return row;
    return { ...row, processingSeconds: row.missing * safeNumber(product.processingSeconds) };
  }

  private compareRows(left: PlanningRow, right: PlanningRow): number {
    return Number(right.sources.length > 0) - Number(left.sources.length > 0)
      || right.missing - left.missing || left.name.localeCompare(right.name);
  }
}
