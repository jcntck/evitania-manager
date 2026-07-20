export type SourceKind = 'gather' | 'monster' | 'boss' | 'craft' | 'smeltery' | 'unknown';

export type PlanningSource = {
  id: string;
  name: string;
  kind: SourceKind;
  numerator?: number;
  denominator?: number;
};

export type PlanningRow = {
  entityId: string;
  name: string;
  category: SourceKind;
  required: number;
  available: number;
  missing: number;
  expectedAttempts?: number;
  expectedPerHour?: number;
  estimatedHours?: number;
  processingSeconds?: number;
  sources: PlanningSource[];
  selectedSource?: PlanningSource;
};

export type PlanningResult = {
  rows: PlanningRow[];
  cycle?: string[];
};
