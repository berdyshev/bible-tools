import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hint } from '../../src/domain/errors.ts';
import { parseStrong } from '../../src/domain/strong.ts';

void test('bare numbers normalize to a four-digit key without a sense', () => {
  for (const input of ['H7704', 'h7704', 'H07704', ' H7704 ']) {
    const r = parseStrong(input);
    assert.ok(r.ok, input);
    assert.deepEqual(r.value, { lang: 'H', num: 7704, key: 'H7704' }, input);
    assert.ok(!('sense' in r.value), 'sense is omitted, not undefined');
  }
});

void test('sense letters are upper-cased and kept', () => {
  for (const input of ['H7704G', 'h7704g', ' H7704g ', 'H07704G']) {
    const r = parseStrong(input);
    assert.ok(r.ok, input);
    assert.deepEqual(r.value, { lang: 'H', num: 7704, sense: 'G', key: 'H7704G' }, input);
  }
});

void test('Greek numbers and short numbers are padded in the key', () => {
  const g = parseStrong('G3056');
  assert.ok(g.ok);
  assert.deepEqual(g.value, { lang: 'G', num: 3056, key: 'G3056' });
  const h = parseStrong('h376a');
  assert.ok(h.ok);
  assert.deepEqual(h.value, { lang: 'H', num: 376, sense: 'A', key: 'H0376A' });
  const one = parseStrong('H1');
  assert.ok(one.ok);
  assert.equal(one.value.key, 'H0001');
  assert.ok(parseStrong('H9999').ok);
  assert.ok(parseStrong('H0001').ok);
});

void test('malformed input keeps the original text in the error', () => {
  for (const input of [
    '',
    'H',
    '7704',
    'X7704',
    'H0',
    'H0000',
    'H12345',
    'H-1',
    'H77 04',
    'H7704GG',
    'H7704!',
    'H7704\nG',
    'XH7704',
    'ABCG3056',
    'H7704 G',
  ]) {
    const r = parseStrong(input);
    assert.ok(!r.ok, JSON.stringify(input));
    assert.deepEqual(r.error, { kind: 'malformed_strong', input });
  }
  const r = parseStrong('nope');
  assert.ok(!r.ok);
  assert.match(hint(r.error), /^Malformed Strong's number "nope"/);
});
