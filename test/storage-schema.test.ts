import { describe, expect, it } from 'vitest';
import {
  decodeStorageEnvelope, encodeStorageEnvelope,
} from '../src/infrastructure/storage-schema';
import { createSnapshot, createValidData } from './fixtures/storage-fixtures';

describe('storage envelope', () => {
  it('UT-001 decodes a valid schema-v2 revision 7 exactly', () => {
    const snapshot = createSnapshot(7);
    const decoded = decodeStorageEnvelope(encodeStorageEnvelope(snapshot));

    expect(decoded).toEqual({ ok: true, value: snapshot });
    if (decoded.ok) {
      expect(decoded.value.revision).toBe(7);
      expect(decoded.value.data).toEqual(snapshot.data);
    }
  });

  it.each([
    ['malformed JSON', '{', 'malformed_json'],
    ['unknown schema', { ...createSnapshot(), schemaVersion: 99 }, 'unknown_schema'],
    ['negative revision', { ...createSnapshot(), revision: -1 }, 'invalid_envelope'],
    ['unknown envelope key', { ...createSnapshot(), extra: true }, 'invalid_envelope'],
    ['invalid domain', { ...createSnapshot(), data: { ...createValidData(), version: 1 } }, 'invalid_domain'],
  ])('UT-002 rejects %s without an empty fallback', (_label, input, code) => {
    const decoded = decodeStorageEnvelope(input);

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error.code).toBe(code);
    expect(decoded).not.toHaveProperty('value.data.catalog.items', []);
  });
});
