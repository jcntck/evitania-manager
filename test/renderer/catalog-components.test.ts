// @vitest-environment happy-dom

import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { ModalStack } from '../../src/renderer/components/modal-stack';
import { RelationMultiselect } from '../../src/renderer/components/relation-multiselect';
import {
  RelationSearchIndex,
  normalizeRelationText,
} from '../../src/renderer/components/relation-search';

describe('catalog relation components', () => {
  it('UT-042 normalizes case/diacritics, separates create from empty, and preserves capped selections', () => {
    const records = [
      { id: 'selected', name: 'Seleção distante' },
      { id: 'cafe', name: 'Café Raro' },
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `common-${index}`,
        name: `Comum ${index}`,
      })),
    ];
    const index = new RelationSearchIndex(records);
    expect(normalizeRelationText('  CAFÉ  ')).toBe('cafe');
    expect(index.search('CAFE').options.map((option) => option.id)).toContain('cafe');

    const missing = index.search('Ainda não existe');
    expect(missing).toMatchObject({
      noResults: true,
      canCreate: true,
      hasExactMatch: false,
    });
    const empty = index.search('');
    expect(empty).toMatchObject({ noResults: false, canCreate: false });

    const capped = index.search('comum', ['selected'], 10);
    expect(capped.totalMatches).toBe(100);
    expect(capped.options[0].id).toBe('selected');
    expect(capped.options).toHaveLength(11);
  });

  it('UT-043 adds every relation once and edits each safe integer quantity independently', () => {
    const selection = new RelationMultiselect();
    expect(selection.add(['a', 'b', 'a'])).toMatchObject({ ok: true });
    expect(selection.selected).toEqual([
      { id: 'a', quantity: 1 },
      { id: 'b', quantity: 1 },
    ]);
    expect(selection.setQuantity('a', '7')).toMatchObject({ ok: true });
    expect(selection.selected).toEqual([
      { id: 'a', quantity: 7 },
      { id: 'b', quantity: 1 },
    ]);
    expect(selection.setQuantity('b', '1.5')).toEqual({
      ok: false,
      field: 'relations.b.quantity',
    });
    expect(selection.setQuantity('b', Number.MAX_SAFE_INTEGER + 1)).toMatchObject({ ok: false });
    expect(selection.selected[1]).toEqual({ id: 'b', quantity: 1 });
  });

  it('UT-044 preserves parent/invalid child drafts and returns deterministic focus', () => {
    const stack = new ModalStack<{ name: string }>();
    stack.open('parent', { name: 'Receita em andamento' }, 'open-parent');
    stack.open('child', { name: '' }, 'component-picker');
    const invalid = stack.invalid(['name']);
    expect(invalid.frames).toHaveLength(2);
    expect(invalid.frames[0].draft).toEqual({ name: 'Receita em andamento' });
    expect(invalid.frames[1]).toMatchObject({ draft: { name: '' }, errors: ['name'] });

    const cancelled = stack.cancel();
    expect(cancelled.frames).toHaveLength(1);
    expect(cancelled.frames[0].draft.name).toBe('Receita em andamento');
    expect(cancelled.focusToken).toBe('component-picker');

    stack.open('child-2', { name: 'Novo item' }, 'component-picker');
    const succeeded = stack.succeed('item-id');
    expect(succeeded.frames).toHaveLength(1);
    expect(succeeded.selectedId).toBe('item-id');
    expect(succeeded.focusToken).toBe('component-picker:selected:item-id');
  });

  it('UT-050 searches 5,000 stable records and preserves selection below 500 ms', () => {
    const records = Array.from({ length: 5_000 }, (_, index) => ({
      id: `item-${index}`,
      name: index === 4_999 ? 'Minério Áureo Único' : `Material ${index}`,
    }));
    const index = new RelationSearchIndex(records);
    index.search('material');
    const started = performance.now();
    const result = index.search('MINERIO AUREO', ['item-3']);
    const duration = performance.now() - started;
    expect(result.options.map((option) => option.id)).toEqual(['item-3', 'item-4999']);
    expect(duration).toBeLessThan(500);
  });
});
