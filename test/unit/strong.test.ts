import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hint } from '../../src/domain/errors.ts';
import { parseStrong, strongBase } from '../../src/domain/strong.ts';

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
    'H10000',
    'G123456',
    'G00000',
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

void test('five-digit Greek numbers keep all digits and a sense letter', () => {
  const g = parseStrong('g20447');
  assert.ok(g.ok);
  assert.deepEqual(g.value, { lang: 'G', num: 20447, key: 'G20447' });
  const lettered = parseStrong('G20001a');
  assert.ok(lettered.ok);
  assert.deepEqual(lettered.value, { lang: 'G', num: 20001, sense: 'A', key: 'G20001A' });
  const padded = parseStrong('G03056');
  assert.ok(padded.ok);
  assert.equal(padded.value.key, 'G3056');
});

void test('Hebrew numbers stop at four digits', () => {
  assert.ok(parseStrong('H9999').ok);
  assert.ok(!parseStrong('H10000').ok);
});

void test('strongBase drops only a trailing sense letter', () => {
  assert.equal(strongBase('H7704G'), 'H7704');
  assert.equal(strongBase('H7704'), 'H7704');
  assert.equal(strongBase('G20447'), 'G20447');
  assert.equal(strongBase('G3004G'), 'G3004');
  assert.equal(strongBase('G20001B'), 'G20001');
});
