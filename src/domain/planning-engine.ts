import type { Catalog, Component, Goal, Planning, Product } from '../shared/domain';
import {
  estimateForNode,
  resolveSources,
} from './estimate-calculator';
import { consolidateObjectivePlans } from './plan-consolidator';
import {
  DEFAULT_PLANNING_LIMITS,
  type ConsolidatedNeed,
  type ObjectivePlan,
  type PlanDiagnostic,
  type PlanNode,
  type PlanningLimits,
  type PlanningResult,
} from './planning-result';

export type PlanningInput = Readonly<{
  catalog: Readonly<Catalog>;
  planning: Readonly<Planning>;
  limits?: Readonly<PlanningLimits>;
}>;

type MutableNode = {
  pathId: string;
  entityId: string;
  name: string;
  category: PlanNode['category'];
  required: number;
  allocated: number;
  missing: number;
  children: MutableNode[];
  source?: PlanNode['source'];
  estimate?: PlanNode['estimate'];
  diagnostics: PlanDiagnostic[];
};

type Expansion = {
  entityId: string;
  required: number;
  pathId: string;
  trail: readonly string[];
  parent?: MutableNode;
  assignRoot?: (node: MutableNode) => void;
};

const safePositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const safeNonnegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const freezeDiagnostic = (value: PlanDiagnostic): PlanDiagnostic => Object.freeze({
  ...value,
  ...(value.cycle ? { cycle: Object.freeze([...value.cycle]) } : {}),
});

const freezeNode = (root: MutableNode): PlanNode => {
  const frozen = new Map<MutableNode, PlanNode>();
  const stack: { node: MutableNode; visited: boolean }[] = [{ node: root, visited: false }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!current.visited) {
      stack.push({ node: current.node, visited: true });
      for (const child of current.node.children) stack.push({ node: child, visited: false });
      continue;
    }
    frozen.set(current.node, Object.freeze({
      ...current.node,
      children: Object.freeze(current.node.children.map((child) => frozen.get(child)!)),
      ...(current.node.source ? {
        source: Object.freeze({
          ...current.node.source,
          origins: Object.freeze(current.node.source.origins.map((origin) => Object.freeze({ ...origin }))),
          ...(current.node.source.selected
            ? { selected: Object.freeze({ ...current.node.source.selected }) } : {}),
        }),
      } : {}),
      ...(current.node.estimate ? { estimate: Object.freeze({ ...current.node.estimate }) } : {}),
      diagnostics: Object.freeze(current.node.diagnostics.map(freezeDiagnostic)),
    }));
  }
  return frozen.get(root)!;
};

export class PlanningEngine {
  calculate(input: PlanningInput): PlanningResult {
    const products = new Map(input.catalog.products.map((product) => [product.id, product]));
    const items = new Map(input.catalog.items.map((item) => [item.id, item]));
    const remainingStock: Record<string, number> = {};
    for (const [entityId, quantity] of Object.entries(input.planning.stock)) {
      remainingStock[entityId] = safeNonnegativeInteger(quantity) ? quantity : 0;
    }
    const requestedLimit = input.limits?.maxNodes ?? DEFAULT_PLANNING_LIMITS.maxNodes;
    const maxNodes = safePositiveInteger(requestedLimit)
      ? Math.min(requestedLimit, DEFAULT_PLANNING_LIMITS.maxNodes)
      : DEFAULT_PLANNING_LIMITS.maxNodes;
    const pending = input.planning.goals
      .map((goal, originalIndex) => ({ goal, originalIndex }))
      .filter(({ goal }) => goal.completed !== true)
      .sort((left, right) => {
        const leftPriority = safeNonnegativeInteger(left.goal.priority)
          ? left.goal.priority : Number.MAX_SAFE_INTEGER;
        const rightPriority = safeNonnegativeInteger(right.goal.priority)
          ? right.goal.priority : Number.MAX_SAFE_INTEGER;
        return leftPriority - rightPriority || left.originalIndex - right.originalIndex;
      });

    const objectives: ObjectivePlan[] = [];
    const allDiagnostics: PlanDiagnostic[] = [];
    let nodeCount = 0;
    let limitReached = false;

    for (const { goal, originalIndex } of pending) {
      const objectiveDiagnostics: PlanDiagnostic[] = [];
      let root: MutableNode | undefined;
      const priority = safeNonnegativeInteger(goal.priority) ? goal.priority : originalIndex;
      const product = products.get(goal.productId);
      if (!this.validObjective(goal, product)) {
        const invalid: PlanDiagnostic = {
          code: 'invalid_objective',
          objectiveId: typeof goal.id === 'string' ? goal.id : String(originalIndex),
          entityId: typeof goal.productId === 'string' ? goal.productId : undefined,
        };
        objectiveDiagnostics.push(invalid);
        allDiagnostics.push(invalid);
      } else if (limitReached) {
        const limit: PlanDiagnostic = {
          code: 'calculation_limit',
          objectiveId: goal.id,
          entityId: goal.productId,
        };
        objectiveDiagnostics.push(limit);
        allDiagnostics.push(limit);
      } else {
        const stack: Expansion[] = [{
          entityId: goal.productId,
          required: goal.quantity,
          pathId: `${goal.id}:0`,
          trail: [],
          assignRoot: (node) => { root = node; },
        }];
        while (stack.length > 0 && !limitReached) {
          const expansion = stack.pop()!;
          if (nodeCount >= maxNodes) {
            const limit: PlanDiagnostic = {
              code: 'calculation_limit',
              objectiveId: goal.id,
              pathId: expansion.pathId,
              entityId: expansion.entityId,
            };
            expansion.parent?.diagnostics.push(limit);
            objectiveDiagnostics.push(limit);
            allDiagnostics.push(limit);
            limitReached = true;
            break;
          }
          const available = remainingStock[expansion.entityId] ?? 0;
          const allocated = Math.min(expansion.required, available);
          if (Object.hasOwn(remainingStock, expansion.entityId)) {
            remainingStock[expansion.entityId] = available - allocated;
          }
          const entityProduct = products.get(expansion.entityId);
          const item = items.get(expansion.entityId);
          const node: MutableNode = {
            pathId: expansion.pathId,
            entityId: expansion.entityId,
            name: entityProduct?.name ?? item?.name ?? expansion.entityId,
            category: entityProduct?.kind ?? (item ? 'item' : 'unknown'),
            required: expansion.required,
            allocated,
            missing: expansion.required - allocated,
            children: [],
            diagnostics: [],
          };
          nodeCount += 1;
          if (expansion.parent) expansion.parent.children.push(node);
          else expansion.assignRoot?.(node);

          const context = {
            objectiveId: goal.id,
            pathId: node.pathId,
            entityId: node.entityId,
          };
          if (!entityProduct && !item) {
            const stale: PlanDiagnostic = { code: 'stale_entity', ...context };
            node.diagnostics.push(stale);
            allDiagnostics.push(stale);
            continue;
          }
          if (item) {
            const resolved = resolveSources(item.id, input.catalog, input.planning.selectedSources);
            node.source = resolved.resolution;
            const sourceDiagnostics = resolved.diagnostics.map((value) => ({ ...value, ...context }));
            node.diagnostics.push(...sourceDiagnostics);
            allDiagnostics.push(...sourceDiagnostics);
          }
          const estimate = estimateForNode(
            node.entityId,
            node.missing,
            node.source,
            entityProduct,
            input.planning,
            context,
          );
          if (estimate.estimate) node.estimate = estimate.estimate;
          node.diagnostics.push(...estimate.diagnostics);
          allDiagnostics.push(...estimate.diagnostics);
          if (!entityProduct || node.missing === 0) continue;

          const cycleStart = expansion.trail.indexOf(entityProduct.id);
          if (cycleStart >= 0) {
            const cycle: PlanDiagnostic = {
              code: 'cycle',
              ...context,
              cycle: [...expansion.trail.slice(cycleStart), entityProduct.id],
            };
            node.diagnostics.push(cycle);
            allDiagnostics.push(cycle);
            continue;
          }
          const nextTrail = [...expansion.trail, entityProduct.id];
          for (let index = entityProduct.components.length - 1; index >= 0; index -= 1) {
            const component = entityProduct.components[index] as Component;
            const childPath = `${node.pathId}.${index}`;
            if (!component || typeof component.entityId !== 'string'
              || !safePositiveInteger(component.quantity)) {
              const invalid: PlanDiagnostic = {
                code: 'invalid_component',
                objectiveId: goal.id,
                pathId: childPath,
                entityId: typeof component?.entityId === 'string' ? component.entityId : entityProduct.id,
              };
              node.diagnostics.push(invalid);
              allDiagnostics.push(invalid);
              continue;
            }
            const required = node.missing * component.quantity;
            if (!Number.isSafeInteger(required)) {
              const overflow: PlanDiagnostic = {
                code: 'quantity_overflow',
                objectiveId: goal.id,
                pathId: childPath,
                entityId: component.entityId,
              };
              node.diagnostics.push(overflow);
              allDiagnostics.push(overflow);
              continue;
            }
            stack.push({
              entityId: component.entityId,
              required,
              pathId: childPath,
              trail: nextTrail,
              parent: node,
            });
          }
        }
      }
      objectives.push(Object.freeze({
        objectiveId: typeof goal.id === 'string' ? goal.id : String(originalIndex),
        productId: typeof goal.productId === 'string' ? goal.productId : '',
        priority,
        originalIndex,
        ...(root ? { root: freezeNode(root) } : {}),
        diagnostics: Object.freeze(objectiveDiagnostics.map(freezeDiagnostic)),
      }));
    }

    const projection = consolidateObjectivePlans(objectives);
    const consolidated = projection.consolidated.map((need) =>
      this.recalculateConsolidatedEstimate(need, products.get(need.entityId), input));
    allDiagnostics.push(...projection.diagnostics);
    return Object.freeze({
      objectives: Object.freeze(objectives),
      consolidated: Object.freeze(consolidated),
      remainingStock: Object.freeze({ ...remainingStock }),
      diagnostics: Object.freeze(allDiagnostics.map(freezeDiagnostic)),
      nodeCount,
    });
  }

  private validObjective(goal: Goal, product: Product | undefined): boolean {
    return typeof goal.id === 'string'
      && typeof goal.productId === 'string'
      && safePositiveInteger(goal.quantity)
      && goal.completed === false
      && product?.kind === 'recipe';
  }

  private recalculateConsolidatedEstimate(
    need: ConsolidatedNeed,
    product: Product | undefined,
    input: PlanningInput,
  ): ConsolidatedNeed {
    const outcome = estimateForNode(
      need.entityId,
      need.missing,
      need.source,
      product,
      input.planning,
      { entityId: need.entityId },
    );
    return Object.freeze({
      ...need,
      ...(outcome.estimate ? { estimate: Object.freeze({ ...outcome.estimate }) } : { estimate: undefined }),
      diagnostics: Object.freeze([
        ...need.diagnostics,
        ...outcome.diagnostics.map(freezeDiagnostic),
      ]),
    });
  }
}
