import { describe, expect, it } from 'vitest';
import { AppDataValidator } from '../src/domain/app-data-validator';
import { createEmptyData } from '../src/shared/domain';

describe('AppDataValidator', () => {
  it('accepts an empty valid database', () => {
    const validator = new AppDataValidator();

    expect(() => validator.validate(createEmptyData())).not.toThrow();
  });

  it('rejects manipulated image paths', () => {
    const validator = new AppDataValidator();
    const data = createEmptyData();
    data.catalog.items.push({ id: 'item', name: 'Item', image: 'file:///etc/passwd' });

    expect(() => validator.validate(data)).toThrow('Estrutura de dados inválida.');
  });
});
