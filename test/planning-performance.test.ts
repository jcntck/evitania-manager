import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { PlanningEngine } from '../src/domain/planning-engine';
import type { Catalog, Planning } from '../src/shared/domain';

const buildScaleFixture = (nodesPerGoal: 400): { catalog: Catalog; planning: Planning } => {
  const productCount = nodesPerGoal - 1;
  const totalItems = 5_000 - productCount;
  const catalog: Catalog = {
    items: Array.from({ length: totalItems }, (_, index) => ({
      id: index === 0 ? 'raw' : `unused-${index}`,
      name: `Item ${index}`,
    })),
    resources: [],
    products: Array.from({ length: productCount }, (_, index) => ({
      id: `product-${index}`,
      name: `Product ${index}`,
      kind: 'recipe' as const,
      components: [{
        entityId: index === productCount - 1 ? 'raw' : `product-${index + 1}`,
        quantity: 1,
      }],
    })),
    monsters: [],
    bosses: [],
  };
  const planning: Planning = {
    goals: Array.from({ length: 50 }, (_, index) => ({
      id: `goal-${index}`,
      productId: 'product-0',
      quantity: 1,
      completed: false,
      priority: index,
    })),
    stock: {},
    gatherRates: {},
    killRates: {},
    lootQuantity: 0,
    selectedSources: {},
    completionCredits: [],
  };
  return { catalog, planning };
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

describe('planning scale and calculation limit', () => {
  it('UT-051 calculates 50 objectives and exactly 20,000 nodes below 500 ms median', () => {
    const fixture = buildScaleFixture(400);
    const engine = new PlanningEngine();
    engine.calculate(fixture);
    const measurements = Array.from({ length: 5 }, () => {
      const started = performance.now();
      const result = engine.calculate(fixture);
      const elapsed = performance.now() - started;
      expect(result.nodeCount).toBe(20_000);
      expect(result.diagnostics.some((value) => value.code === 'calculation_limit')).toBe(false);
      return elapsed;
    });
    expect(median(measurements)).toBeLessThan(500);
  });

  it('UT-052 stops node 20,001, retains completed work, and stays iterative', () => {
    const fixture = buildScaleFixture(401);
    const result = new PlanningEngine().calculate(fixture);

    expect(result.nodeCount).toBe(20_000);
    expect(result.diagnostics.some((value) => value.code === 'calculation_limit')).toBe(true);
    expect(result.objectives[0].root?.pathId).toBe('goal-0:0');
    expect(result.consolidated.length).toBeGreaterThan(0);
  });

  it('IT-021 composes 5,000 records, 50 goals, calculation and collapsed-root access below 500 ms', () => {
    const fixture = buildScaleFixture(400);
    const engine = new PlanningEngine();
    engine.calculate(fixture);
    const measurements = Array.from({ length: 5 }, () => {
      const started = performance.now();
      const result = engine.calculate(fixture);
      const collapsedRoots = result.objectives.map((objective) => ({
        id: objective.objectiveId,
        pathId: objective.root?.pathId,
        missing: objective.root?.missing,
      }));
      expect(collapsedRoots).toHaveLength(50);
      expect(result.consolidated).toHaveLength(400);
      return performance.now() - started;
    });
    expect(median(measurements)).toBeLessThan(500);
  });
});
