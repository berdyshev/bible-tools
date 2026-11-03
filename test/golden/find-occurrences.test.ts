import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { findOccurrences, outputSchema } from '../../src/tools/find-occurrences.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

const RUTH_VERSES = [
  ['Ruth 1:1', 1],
  ['Ruth 1:2', 1],
  ['Ruth 1:6', 2],
  ['Ruth 1:22', 1],
  ['Ruth 2:2', 1],
  ['Ruth 2:3', 2],
  ['Ruth 2:6', 1],
  ['Ruth 2:8', 1],
  ['Ruth 2:9', 1],
  ['Ruth 2:17', 1],
  ['Ruth 2:22', 1],
  ['Ruth 4:3', 2],
  ['Ruth 4:5', 1],
] as const;

const run = (args: Parameters<typeof findOccurrences.call>[0]) => {
  const result = findOccurrences.call(args, repo);
  assert.equal(result.isError, undefined);
  return { text: textOf(result), structured: outputSchema.parse(result.structuredContent) };
};

void test('H7704G in Ruth: every verse and repeat, counted in text and structure', () => {
  const { text, structured } = run({ strong: 'H7704G', scope: 'Ruth' });
  expectGolden('find_occurrences.H7704G.Ruth.txt', text);
  assert.match(text, /^H7704G in Ruth: 16 occurrences in 13 verses/);
  assert.deepEqual(
    structured.occurrences.map((o) => [o.ref, o.count]),
    RUTH_VERSES,
  );
  assert.equal(structured.total, 16);
  assert.equal(structured.verses, 13);
  assert.equal(structured.truncated, false);
});

void test('H7704G in Ruth 2 lists only that chapter', () => {
  const { text, structured } = run({ strong: 'H7704G', scope: 'Ruth 2' });
  expectGolden('find_occurrences.H7704G.Ruth_2.txt', text);
  assert.deepEqual(
    structured.occurrences.map((o) => [o.ref, o.count]),
    RUTH_VERSES.filter(([ref]) => ref.startsWith('Ruth 2:')),
  );
});

void test('a bare number is grouped by sense with the sense gloss', () => {
  const { text, structured } = run({ strong: 'H7704', scope: 'Ruth' });
  expectGolden('find_occurrences.H7704.Ruth.txt', text);
  assert.deepEqual(structured.senses, [{ strong: 'H7704G', gloss: 'land: country', count: 16 }]);
});

void test('the default scope is the whole Old Testament', () => {
  const { text } = run({ strong: 'H7704G' });
  assert.match(text, /^H7704G in the Old Testament: 16 occurrences in 13 verses/);
});

void test('a chapter without the word is an empty result, not an error', () => {
  const { text, structured } = run({ strong: 'H7704G', scope: 'Ruth 3' });
  assert.equal(text, 'H7704G in Ruth 3: no occurrences (English numbering)');
  assert.deepEqual(structured.occurrences, []);
});

void test('limit cuts the list and says how to continue', () => {
  const { text, structured } = run({ strong: 'H7704G', scope: 'Ruth', limit: 3 });
  expectGolden('find_occurrences.H7704G.Ruth.limit3.txt', text);
  assert.equal(structured.occurrences.length, 3);
  assert.equal(structured.truncated, true);
  assert.equal(structured.total, 16);
});

void test('bad scope, bad number and unknown number are input errors with hints', () => {
  const cases = [
    [{ strong: 'H7704G', scope: 'Ruth 1:2' }, /^Invalid scope "Ruth 1:2"\. Use one of: OT, /],
    [{ strong: 'H7704G', scope: 'Ruth 9' }, /^Ruth has no chapter 9/],
    [{ strong: 'X1' }, /^Malformed Strong's number "X1"/],
    [{ strong: 'H9999' }, /^Strong's number "H9999" was not found/],
    [{ strong: 'H7704Z' }, /^Strong's number "H7704Z" was not found/],
  ] as const;
  for (const [args, pattern] of cases) {
    const result = findOccurrences.call(args, repo);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.match(textOf(result), pattern);
  }
});
