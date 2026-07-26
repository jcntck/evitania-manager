import { describe, expect, it } from 'vitest';
import { AppDataValidationError, AppDataValidator } from '../src/domain/app-data-validator';
import { createEmptyData } from '../src/shared/domain';
import { createValidData, IDS } from './fixtures/storage-fixtures';

describe('AppDataValidator schema-v2', () => {
  const validator = new AppDataValidator();

  it('accepts empty and fully related valid schema-v2 data', () => {
    expect(() => validator.validate(createEmptyData())).not.toThrow();
    expect(() => validator.validate(createValidData())).not.toThrow();
  });

  it('rejects legacy fields, unknown keys, invalid quantities, and manipulated images', () => {
    const legacy = createValidData() as unknown as Record<string, unknown>;
    (legacy.planning as Record<string, unknown>).completedEntities = {};
    expect(() => validator.validate(legacy)).toThrow(AppDataValidationError);

    const invalid = createValidData();
    invalid.catalog.items[0].image = 'file:///etc/passwd';
    invalid.catalog.products[0].components[0].quantity = 0;
    const issues = validator.inspect(invalid);
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['invalid_image', 'invalid_quantity']));

    const malformed = createValidData() as unknown as { catalog: { items: unknown[] } };
    malformed.catalog.items.push(null);
    expect(() => validator.validate(malformed)).toThrow(AppDataValidationError);
  });

  it('rejects stale references, duplicate relations, priority gaps, and production cycles', () => {
    const data = createValidData();
    data.catalog.products[0].components.push({ entityId: IDS.item, quantity: 1 });
    data.catalog.products[1].components[0].entityId = IDS.recipe;
    data.planning.goals[0].priority = 3;

    const codes = validator.inspect(data).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      'duplicate_relation', 'production_cycle', 'invalid_priority',
    ]));
  });
});
