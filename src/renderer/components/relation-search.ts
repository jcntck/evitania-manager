export type RelationRecord = Readonly<{
  id: string;
  name: string;
}>;

export type RelationSearchResult = Readonly<{
  query: string;
  options: readonly RelationRecord[];
  totalMatches: number;
  hasExactMatch: boolean;
  canCreate: boolean;
  noResults: boolean;
}>;

const COMBINING_MARKS = /[\u0300-\u036f]/g;

export const normalizeRelationText = (value: string): string =>
  value.normalize('NFD').replace(COMBINING_MARKS, '').toLocaleLowerCase().trim();

export class RelationSearchIndex {
  private readonly entries: readonly Readonly<RelationRecord & { normalizedName: string }>[];
  private readonly byId: ReadonlyMap<string, Readonly<RelationRecord & { normalizedName: string }>>;

  constructor(records: readonly RelationRecord[]) {
    const seen = new Set<string>();
    this.entries = records.flatMap((record) => {
      if (seen.has(record.id)) return [];
      seen.add(record.id);
      return [{ ...record, normalizedName: normalizeRelationText(record.name) }];
    });
    this.byId = new Map(this.entries.map((entry) => [entry.id, entry]));
  }

  search(
    query: string,
    selectedIds: readonly string[] = [],
    renderCap = 50,
  ): RelationSearchResult {
    const normalizedQuery = normalizeRelationText(query);
    const matches = normalizedQuery.length === 0
      ? this.entries
      : this.entries.filter((entry) => entry.normalizedName.includes(normalizedQuery));
    const hasExactMatch = normalizedQuery.length > 0
      && matches.some((entry) => entry.normalizedName === normalizedQuery);
    const options: RelationRecord[] = [];
    const included = new Set<string>();
    for (const id of selectedIds) {
      const selected = this.byId.get(id);
      if (selected && !included.has(id)) {
        options.push({ id: selected.id, name: selected.name });
        included.add(id);
      }
    }
    for (const match of matches) {
      if (options.length >= renderCap + selectedIds.length || included.has(match.id)) continue;
      options.push({ id: match.id, name: match.name });
      included.add(match.id);
    }
    return Object.freeze({
      query,
      options: Object.freeze(options),
      totalMatches: matches.length,
      hasExactMatch,
      canCreate: normalizedQuery.length > 0 && !hasExactMatch,
      noResults: matches.length === 0,
    });
  }
}
