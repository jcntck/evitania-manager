import type { AppData } from '../shared/domain';
import { PlanningEngine } from './planning-engine';
import type {
  LegacyPlanningResult,
  PlanningRow,
} from './planning-result';

/**
 * Compatibility adapter for the existing renderer. New code consumes
 * PlanningEngine and its immutable objective/consolidated result directly.
 */
export class Planner {
  constructor(private readonly data: Readonly<AppData>) {}

  calculate(): LegacyPlanningResult {
    const result = new PlanningEngine().calculate({
      catalog: this.data.catalog,
      planning: this.data.planning,
    });
    const rows: PlanningRow[] = result.consolidated.map((need) => {
      const estimate = need.estimate;
      return {
        entityId: need.entityId,
        name: need.name,
        category: need.category === 'recipe' ? 'craft'
          : need.category === 'item' ? (need.source?.selected?.kind ?? 'unknown')
            : need.category,
        required: need.required,
        available: need.allocated,
        missing: need.missing,
        sources: [...(need.source?.origins ?? [])],
        ...(need.source?.selected ? { selectedSource: need.source.selected } : {}),
        ...(estimate?.kind === 'gathering'
          ? { expectedPerHour: estimate.ratePerHour, estimatedHours: estimate.hours } : {}),
        ...(estimate?.kind === 'monster' ? {
          expectedAttempts: estimate.expectedAttempts,
          expectedPerHour: estimate.expectedItemsPerHour,
          estimatedHours: estimate.hours,
        } : {}),
        ...(estimate?.kind === 'boss' ? { expectedAttempts: estimate.expectedFights } : {}),
        ...(estimate?.kind === 'smelting' ? { processingSeconds: estimate.seconds } : {}),
      };
    });
    const cycle = result.diagnostics.find((value) => value.code === 'cycle')?.cycle;
    return { rows, ...(cycle ? { cycle: [...cycle] } : {}) };
  }
}
