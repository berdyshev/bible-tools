import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { findOccurrences, outputSchema } from '../../src/tools/find-occurrences.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const db = fixtureDb();
const repo = createBibleRepo(db);

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

void test('G3056 in John 1 lists the verses with the Greek forms', () => {
  const { text, structured } = run({ strong: 'G3056', scope: 'John 1' });
  expectGolden('find_occurrences.G3056.John_1.txt', text);
  assert.match(text, /^G3056 in John 1: \d+ occurrences in \d+ verses \(English numbering\)/);
  const row = db.prepare("SELECT count(*) AS n FROM words WHERE strong = 'G3056' AND book = 'John'").get();
  assert.equal(structured.total, row?.['n']);
  assert.ok(structured.occurrences.every((o) => o.ref.startsWith('John 1:')));
});

void test('a sense letter the lexicon lacks still finds the words that carry it', () => {
  const sense = run({ strong: 'G3700G', scope: 'John 1' });
  assert.match(sense.text, /^G3700G in John 1: 2 occurrences in 2 verses/);
  assert.deepEqual(
    sense.structured.occurrences.map((o) => [o.ref, o.strong]),
    [
      ['John 1:39', 'G3700G'],
      ['John 1:51', 'G3700G'],
    ],
  );
  const bare = run({ strong: 'G3700', scope: 'John 1' });
  assert.equal(bare.structured.total, 2);
  assert.deepEqual(bare.structured.senses, [{ strong: 'G3700G', gloss: 'to appear', count: 2 }]);
  assert.equal(run({ strong: 'G3700H', scope: 'John 1' }).structured.total, 0);
});

void test('a number that the lexicon lists only as lettered senses finds its words', () => {
  const bare = run({ strong: 'G2453', scope: 'John 1' });
  assert.equal(
    bare.text,
    'G2453 in John 1: 1 occurrence in 1 verse (English numbering)\nG2453: 1 occurrence\nJohn 1:19 Ioudaioi — Ἰουδαῖοι',
  );
  assert.deepEqual(
    bare.structured.senses.map((s) => s.strong),
    ['G2453'],
  );
  // The tag has no entry of its own, so its group has no gloss.
  assert.equal(bare.structured.senses[0]?.gloss, '');
  const tagged = findOccurrences.call({ strong: 'G2453B', scope: 'John 1' }, repo);
  assert.equal(tagged.isError, undefined);
  assert.equal(outputSchema.parse(tagged.structuredContent).total, 0);
});

void test('a sense letter the base number does not list is a known tag with no words', () => {
  const { text } = run({ strong: 'H7704Z' });
  assert.equal(text, 'H7704Z in the Old Testament: no occurrences (English numbering)');
});

void test('a sense letter without any entry stays unknown', () => {
  const result = findOccurrences.call({ strong: 'G9999G' }, repo);
  assert.equal(result.isError, true);
});

void test('the default scope follows the language of the number', () => {
  const greek = run({ strong: 'G3056' });
  assert.match(greek.text, /^G3056 in the New Testament: /);
  assert.equal(greek.structured.total, run({ strong: 'G3056', scope: 'NT' }).structured.total);
  assert.equal(run({ strong: 'G3056', scope: 'all' }).structured.scope, 'the New Testament');
  assert.equal(run({ strong: 'H7704G', scope: 'all' }).structured.scope, 'the Old Testament');
  assert.equal(run({ strong: 'G3056', scope: 'John 1' }).structured.total, greek.structured.total);
});

void test('a number in a scope of the other testament is an input error with a hint, not an empty result', () => {
  for (const [args, pattern] of [
    [
      { strong: 'G3056', scope: 'OT' },
      /^Strong's number "G3056" is Greek and occurs only in the New Testament, but the scope "OT" is in the Old Testament\. Use scope "NT"/,
    ],
    [{ strong: 'G3056', scope: 'Ruth' }, /but the scope "Ruth" is in the Old Testament/],
    [{ strong: 'G3056', scope: 'Ruth 2' }, /but the scope "Ruth 2" is in the Old Testament/],
    [
      { strong: 'H7704G', scope: 'NT' },
      /^Strong's number "H7704G" is Hebrew and occurs only in the Old Testament, but the scope "NT" is in the New Testament\. Use scope "OT"/,
    ],
    [{ strong: 'H7704G', scope: 'John' }, /but the scope "John" is in the New Testament/],
    [{ strong: 'H7704', scope: 'New Testament' }, /but the scope "New Testament" is in the New Testament/],
  ] as const) {
    const result = findOccurrences.call(args, repo);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.match(textOf(result), pattern);
  }
});

void test('the matching testament, or no scope, is still fine', () => {
  for (const args of [
    { strong: 'G3056', scope: 'NT' },
    { strong: 'G3056', scope: 'John' },
    { strong: 'G3056', scope: 'all' },
    { strong: 'G3056' },
    { strong: 'H7704G', scope: 'OT' },
    { strong: 'H7704G', scope: 'Old Testament' },
    { strong: 'H7704G', scope: 'Ruth' },
  ]) {
    assert.equal(findOccurrences.call(args, repo).isError, undefined, JSON.stringify(args));
  }
});

void test('New Testament scopes are labelled with English numbering even when Hebrew is asked for', () => {
  for (const scope of ['NT', 'John', 'John 1']) {
    const { text, structured } = run({ strong: 'G3056', scope, versification: 'heb' });
    assert.match(text, /\(English numbering\)/, scope);
    assert.equal(structured.versification, 'eng', scope);
  }
  assert.equal(
    run({ strong: 'H7704G', scope: 'Ruth', versification: 'heb' }).structured.versification,
    'heb',
  );
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
    [{ strong: 'H7704G', scope: 'Ruth 1:2' }, /^Invalid scope "Ruth 1:2"\. Use one of: OT, NT, /],
    [{ strong: 'H7704G', scope: 'Ruth 9' }, /^Ruth has no chapter 9/],
    [
      { strong: 'H7704G', scope: 'NT' },
      /^Strong's number "H7704G" is Hebrew and occurs only in the Old Testament/,
    ],
    [{ strong: 'X1' }, /^Malformed Strong's number "X1"/],
    [{ strong: 'H9999' }, /^Strong's number "H9999" was not found/],
    [{ strong: 'H9999Z' }, /^Strong's number "H9999Z" was not found/],
  ] as const;
  for (const [args, pattern] of cases) {
    const result = findOccurrences.call(args, repo);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.match(textOf(result), pattern);
  }
});
