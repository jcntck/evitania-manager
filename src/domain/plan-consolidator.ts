import type {
  ConsolidatedNeed,
  ObjectivePlan,
  PlanDiagnostic,
  PlanNode,
} from './planning-result';

type MutableNeed = {
  entityId: string;
  name: string;
  category: PlanNode['category'];
  required: number;
  allocated: number;
  missing: number;
  contributors: { objectiveId: string; pathId: string }[];
  source?: PlanNode['source'];
  estimate?: PlanNode['estimate'];
  diagnostics: PlanDiagnostic[];
};

const safeAdd = (left: number, right: number): number | undefined => {
  const total = left + right;
  return Number.isSafeInteger(total) ? total : undefined;
};

export const consolidateObjectivePlans = (
  objectives: readonly ObjectivePlan[],
): Readonly<{ consolidated: readonly ConsolidatedNeed[]; diagnostics: readonly PlanDiagnostic[] }> => {
  const byEntity = new Map<string, MutableNeed>();
  const diagnostics: PlanDiagnostic[] = [];
  for (const objective of objectives) {
    if (!objective.root) continue;
    const stack: PlanNode[] = [objective.root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      let need = byEntity.get(node.entityId);
      if (!need) {
        need = {
          entityId: node.entityId,
          name: node.name,
          category: node.category,
          required: 0,
          allocated: 0,
          missing: 0,
          contributors: [],
          ...(node.source ? { source: node.source } : {}),
          ...(node.estimate ? { estimate: node.estimate } : {}),
          diagnostics: [],
        };
        byEntity.set(node.entityId, need);
      }
      const required = safeAdd(need.required, node.required);
      const allocated = safeAdd(need.allocated, node.allocated);
      const missing = safeAdd(need.missing, node.missing);
      if (required === undefined || allocated === undefined || missing === undefined) {
        const overflow: PlanDiagnostic = {
          code: 'consolidation_overflow',
          objectiveId: objective.objectiveId,
          pathId: node.pathId,
          entityId: node.entityId,
        };
        need.diagnostics.push(overflow);
        diagnostics.push(overflow);
      } else {
        need.required = required;
        need.allocated = allocated;
        need.missing = missing;
      }
      need.contributors.push({ objectiveId: objective.objectiveId, pathId: node.pathId });
      need.diagnostics.push(...node.diagnostics);
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]);
      }
    }
  }
  return {
    consolidated: [...byEntity.values()].map((need): ConsolidatedNeed => Object.freeze({
      ...need,
      contributors: Object.freeze(need.contributors.map((contributor) =>
        Object.freeze({ ...contributor }))),
      diagnostics: Object.freeze([...need.diagnostics]),
    })),
    diagnostics: Object.freeze(diagnostics),
  };
};
