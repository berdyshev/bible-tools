import assert from 'node:assert/strict';
import { test } from 'node:test';
import { err, ok, type Result } from '../../src/domain/result.ts';

const half = (n: number): Result<number, string> => (n % 2 === 0 ? ok(n / 2) : err(`${n} is odd`));

void test('ok carries a value and discriminates on ok: true', () => {
  const r = half(4);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 2);
});

void test('err carries an error and discriminates on ok: false', () => {
  const r = half(3);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, '3 is odd');
});
