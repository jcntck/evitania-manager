import type { Act } from '../shared/domain';

export type PlanNodeCategory = 'item' | 'recipe' | 'smelting' | 'unknown';
export type SourceKind = 'gather' | 'monster' | 'boss';

export type PlanDiagnosticCode =
  | 'invalid_objective'
  | 'stale_entity'
  | 'invalid_component'
  | 'quantity_overflow'
  | 'cycle'
  | 'invalid_duration'
  | 'source_required'
  | 'source_unresolved'
  | 'rate_required'
  | 'invalid_rate'
  | 'calculation_limit'
  | 'consolidation_overflow';

export type PlanDiagnostic = Readonly<{
  code: PlanDiagnosticCode;
  objectiveId?: string;
  pathId?: string;
  entityId?: string;
  sourceId?: string;
  field?: string;
  cycle?: readonly string[];
}>;

export type PlanningSource = Readonly<{
  id: string;
  name: string;
  kind: SourceKind;
  act: Act;
  numerator?: number;
  denominator?: number;
}>;

export type SourceResolutionStatus =
  | 'none'
  | 'resolved'
  | 'selection_required'
  | 'source_unresolved';

export type SourceResolution = Readonly<{
  status: SourceResolutionStatus;
  origins: readonly PlanningSource[];
  selected?: PlanningSource;
}>;

export type GatheringEstimate = Readonly<{
  kind: 'gathering';
  ratePerHour: number;
  hours: number;
}>;

export type MonsterEstimate = Readonly<{
  kind: 'monster';
  adjustedDenominator: number;
  adjustedProbability: number;
  expectedAttempts: number;
  expectedItemsPerHour: number;
  hours: number;
}>;

export type BossEstimate = Readonly<{
  kind: 'boss';
  adjustedDenominator: number;
  adjustedProbability: number;
  expectedFights: number;
}>;

export type SmeltingEstimate = Readonly<{
  kind: 'smelting';
  seconds: number;
}>;

export type PlanEstimate =
  | GatheringEstimate
  | MonsterEstimate
  | BossEstimate
  | SmeltingEstimate;

export type PlanNode = Readonly<{
  pathId: string;
  entityId: string;
  name: string;
  category: PlanNodeCategory;
  required: number;
  allocated: number;
  missing: number;
  children: readonly PlanNode[];
  source?: SourceResolution;
  estimate?: PlanEstimate;
  diagnostics: readonly PlanDiagnostic[];
}>;

export type ObjectivePlan = Readonly<{
  objectiveId: string;
  productId: string;
  priority: number;
  originalIndex: number;
  root?: PlanNode;
  diagnostics: readonly PlanDiagnostic[];
}>;

export type PlanContributor = Readonly<{
  objectiveId: string;
  pathId: string;
}>;

export type ConsolidatedNeed = Readonly<{
  entityId: string;
  name: string;
  category: PlanNodeCategory;
  required: number;
  allocated: number;
  missing: number;
  contributors: readonly PlanContributor[];
  source?: SourceResolution;
  estimate?: PlanEstimate;
  diagnostics: readonly PlanDiagnostic[];
}>;

export type PlanningLimits = Readonly<{
  maxNodes: number;
}>;

export const DEFAULT_PLANNING_LIMITS: PlanningLimits = Object.freeze({
  maxNodes: 20_000,
});

export type PlanningResult = Readonly<{
  objectives: readonly ObjectivePlan[];
  consolidated: readonly ConsolidatedNeed[];
  remainingStock: Readonly<Record<string, number>>;
  diagnostics: readonly PlanDiagnostic[];
  nodeCount: number;
}>;

// Temporary compatibility surface for the pre-Task-6 renderer.
export type LegacySourceKind = SourceKind | 'craft' | 'smelting' | 'unknown';
export type LegacyPlanningSource = PlanningSource;
export type PlanningRow = {
  entityId: string;
  name: string;
  category: LegacySourceKind;
  required: number;
  available: number;
  missing: number;
  expectedAttempts?: number;
  expectedPerHour?: number;
  estimatedHours?: number;
  processingSeconds?: number;
  sources: LegacyPlanningSource[];
  selectedSource?: LegacyPlanningSource;
};

export type LegacyPlanningResult = {
  rows: PlanningRow[];
  cycle?: string[];
};
