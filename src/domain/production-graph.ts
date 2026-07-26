import type { Product } from '../shared/domain';

/**
 * Returns the first cycle in deterministic product/component order. The first
 * product is repeated at the end so the returned value is an exact closed path.
 */
export const detectProductionCycle = (
  products: readonly Pick<Product, 'id' | 'components'>[],
): readonly string[] | undefined => {
  const productIds = new Set(products.map((product) => product.id));
  const edges = new Map(products.map((product) => [
    product.id,
    product.components
      .flatMap((component) =>
        typeof component === 'object' && component !== null
          && typeof (component as { entityId?: unknown }).entityId === 'string'
          ? [(component as { entityId: string }).entityId]
          : [])
      .filter((entityId) => productIds.has(entityId)),
  ]));
  const state = new Map<string, 'active' | 'done'>();
  const activeIndex = new Map<string, number>();
  const path: string[] = [];

  for (const product of products) {
    if (state.has(product.id)) continue;
    const frames: Array<{ id: string; nextEdge: number }> = [{ id: product.id, nextEdge: 0 }];
    state.set(product.id, 'active');
    activeIndex.set(product.id, 0);
    path.push(product.id);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const neighbours = edges.get(frame.id) ?? [];
      if (frame.nextEdge >= neighbours.length) {
        frames.pop();
        path.pop();
        activeIndex.delete(frame.id);
        state.set(frame.id, 'done');
        continue;
      }

      const next = neighbours[frame.nextEdge];
      frame.nextEdge += 1;
      const nextState = state.get(next);
      if (nextState === 'active') {
        return [...path.slice(activeIndex.get(next)), next];
      }
      if (nextState === 'done') continue;

      state.set(next, 'active');
      activeIndex.set(next, path.length);
      path.push(next);
      frames.push({ id: next, nextEdge: 0 });
    }
  }
  return undefined;
};
