export type SelectedRelation = Readonly<{
  id: string;
  quantity: number;
}>;

export type QuantityResult =
  | Readonly<{ ok: true; value: readonly SelectedRelation[] }>
  | Readonly<{ ok: false; field: string }>;

const parseSafePositiveInteger = (value: unknown): number | undefined => {
  const normalized = typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;
  return typeof normalized === 'number'
    && Number.isSafeInteger(normalized)
    && normalized > 0
    ? normalized
    : undefined;
};

export class RelationMultiselect {
  private readonly values = new Map<string, number>();

  constructor(initial: readonly SelectedRelation[] = []) {
    for (const relation of initial) {
      const quantity = parseSafePositiveInteger(relation.quantity);
      if (quantity !== undefined && !this.values.has(relation.id)) {
        this.values.set(relation.id, quantity);
      }
    }
  }

  get selected(): readonly SelectedRelation[] {
    return Object.freeze([...this.values].map(([id, quantity]) => ({ id, quantity })));
  }

  add(ids: readonly string[], initialQuantity = 1): QuantityResult {
    const quantity = parseSafePositiveInteger(initialQuantity);
    if (quantity === undefined) return { ok: false, field: 'quantity' };
    for (const id of ids) {
      if (id.length > 0 && !this.values.has(id)) this.values.set(id, quantity);
    }
    return { ok: true, value: this.selected };
  }

  setQuantity(id: string, value: unknown): QuantityResult {
    if (!this.values.has(id)) return { ok: false, field: `relations.${id}` };
    const quantity = parseSafePositiveInteger(value);
    if (quantity === undefined) return { ok: false, field: `relations.${id}.quantity` };
    this.values.set(id, quantity);
    return { ok: true, value: this.selected };
  }

  remove(id: string): readonly SelectedRelation[] {
    this.values.delete(id);
    return this.selected;
  }
}
