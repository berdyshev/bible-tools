import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { lookupStrong, outputSchema } from '../../src/tools/lookup-strong.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

void test('a bare number with several senses returns the full sense menu', () => {
  const result = lookupStrong.call({ strong: 'H7704' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('lookup_strong.H7704.txt', textOf(result));
  assert.deepEqual(
    outputSchema.parse(result.structuredContent).senses,
    repo.senses('H7704').map((e) => ({ strong: e.strong, lemma: e.hebrew, gloss: e.gloss })),
  );
});

void test('an exact sense gives the entry with its other senses', () => {
  const result = lookupStrong.call({ strong: 'H7704G' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('lookup_strong.H7704G.txt', textOf(result));
  assert.equal(outputSchema.parse(result.structuredContent).kind, 'entry');
});

void test('padding and case do not matter', () => {
  const plain = textOf(lookupStrong.call({ strong: 'H7704G' }, repo));
  assert.equal(textOf(lookupStrong.call({ strong: ' h07704g ' }, repo)), plain);
});

void test('a bare number with one sense gives that entry without a menu', () => {
  const text = textOf(lookupStrong.call({ strong: 'H9003' }, repo));
  assert.match(text, /^H9003 /);
  assert.doesNotMatch(text, /senses/);
});

void test('an unknown number gets a hint', () => {
  const result = lookupStrong.call({ strong: 'H99999' }, repo);
  assert.equal(result.isError, true);
  assert.equal(
    textOf(result),
    'Malformed Strong\'s number "H99999". Use H or G followed by digits, e.g. "H1254"',
  );
});

void test('a well-formed but absent number is unknown', () => {
  for (const strong of ['H9999', 'H7704Z', 'G0001']) {
    const result = lookupStrong.call({ strong }, repo);
    assert.equal(result.isError, true, strong);
    assert.equal(
      textOf(result),
      `Strong's number "${strong}" was not found. Check the number or try search_lexicon`,
    );
  }
});
