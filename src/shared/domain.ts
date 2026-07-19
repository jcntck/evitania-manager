export type Act = 'I' | 'II' | 'III';
export type ProductKind = 'recipe' | 'smeltery';
export type EntityCategory = 'items' | 'resources' | 'recipes' | 'smeltery' | 'monsters' | 'bosses';

export type Item = {
  id: string;
  name: string;
  image?: string;
};

export type Resource = {
  id: string;
  itemId: string;
  act: Act;
  image?: string;
};

export type Component = {
  entityId: string;
  quantity: number;
};

export type Product = {
  id: string;
  name: string;
  kind: ProductKind;
  image?: string;
  processingSeconds?: number;
  components: Component[];
};

export type Drop = {
  itemId: string;
  numerator: number;
  denominator: number;
};

export type Enemy = {
  id: string;
  name: string;
  act: Act;
  image?: string;
  drops: Drop[];
};

export type Goal = {
  id: string;
  productId: string;
  quantity: number;
  completed: boolean;
};

export type Planning = {
  goals: Goal[];
  stock: Record<string, number>;
  gatherRates: Record<string, number>;
  killRates: Record<string, number>;
  lootQuantity: number;
  completedEntities: Record<string, number>;
  selectedSources: Record<string, string>;
};

export type Catalog = {
  items: Item[];
  resources: Resource[];
  products: Product[];
  monsters: Enemy[];
  bosses: Enemy[];
};

export type AppData = {
  version: 1;
  catalog: Catalog;
  planning: Planning;
};

export const createEmptyData = (): AppData => ({
  version: 1,
  catalog: { items: [], resources: [], products: [], monsters: [], bosses: [] },
  planning: {
    goals: [], stock: {}, gatherRates: {}, killRates: {}, lootQuantity: 0,
    completedEntities: {}, selectedSources: {},
  },
});
