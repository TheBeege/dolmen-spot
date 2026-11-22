// Tests for the shared id helper (ids.ts): a UUID where `crypto.randomUUID`
// is available, and the random-string fallback where it isn't. Run with
// `npm test`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { newId } from './ids';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK_RE = /^id-[a-z0-9]+$/;

/**
 * `run` with `globalThis.crypto` replaced by `stub`, restoring whatever was
 * there afterwards. Passing `undefined` is the case where there's no `crypto`
 * at all; a stub without `randomUUID` is an older Safari's `crypto`.
 */
function withCrypto<T>(stub: { randomUUID?: () => string } | undefined, run: () => T): T {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: stub, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (real) Object.defineProperty(globalThis, 'crypto', real);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
}

describe('newId', () => {
  test('uses crypto.randomUUID when it is there', () => {
    const id = withCrypto({ randomUUID: () => '11111111-2222-3333-4444-555555555555' }, newId);
    assert.equal(id, '11111111-2222-3333-4444-555555555555');
  });

  test('the real crypto.randomUUID gives a UUID', () => {
    assert.match(newId(), UUID_RE);
  });

  test('falls back to a random string when randomUUID is missing', () => {
    const id = withCrypto({}, newId);
    assert.match(id, FALLBACK_RE);
  });

  test('falls back to a random string when crypto itself is missing', () => {
    const id = withCrypto(undefined, newId);
    assert.match(id, FALLBACK_RE);
  });

  test('the fallback mints distinct ids', () => {
    const ids = withCrypto({}, () => Array.from({ length: 1000 }, newId));
    assert.equal(new Set(ids).size, ids.length);
  });

  test('ids work again once crypto is back', () => {
    withCrypto(undefined, () => newId());
    assert.match(newId(), UUID_RE);
  });
});
