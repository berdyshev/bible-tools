import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { lookupStrong, outputSchema } from '../../src/tools/lookup-strong.ts';
import { MAX_CHARS } from '../../src/tools/passage.ts';
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
    repo.senses('H7704').map((e) => ({ strong: e.strong, lemma: e.original, gloss: e.gloss })),
  );
});

void test('an exact sense gives the entry with its other senses', () => {
  const result = lookupStrong.call({ strong: 'H7704G' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('lookup_strong.H7704G.txt', textOf(result));
  assert.equal(outputSchema.parse(result.structuredContent).kind, 'entry');
});

void test('a Greek entry matches the golden output, shortened to the output budget', () => {
  const result = lookupStrong.call({ strong: 'G3056' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('lookup_strong.G3056.txt', text);
  assert.ok(text.length <= MAX_CHARS);
  assert.ok(text.endsWith('… (entry shortened)'));
  const structured = outputSchema.parse(result.structuredContent);
  assert.equal(structured.kind, 'entry');
  assert.ok((structured.entry?.meaning.length ?? 0) > MAX_CHARS);
  assert.equal(structured.entry?.meaning.includes('entry shortened'), false);
});

void test('a sense letter the lexicon lacks shows the base entry with a note', () => {
  const result = lookupStrong.call({ strong: 'G3700G' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('lookup_strong.G3700G.txt', text);
  const structured = outputSchema.parse(result.structuredContent);
  assert.equal(structured.entry?.strong, 'G3700');
  assert.equal(structured.note, 'G3700G has no entry of its own; this is the entry of G3700.');
  assert.ok(text.includes(`\n${structured.note}`));
  // The bare number and the base entry carry no note.
  assert.equal(
    outputSchema.parse(lookupStrong.call({ strong: 'G3700' }, repo).structuredContent).note,
    undefined,
  );
});

void test('a tag whose base number has only lettered senses gets the sense menu with a note', () => {
  const result = lookupStrong.call({ strong: 'H0430J' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('lookup_strong.H0430J.txt', text);
  assert.match(
    text,
    /^H0430J has no entry of its own; its base number H0430 has these senses\.\nH0430 has \d+ senses; /,
  );
  const structured = outputSchema.parse(result.structuredContent);
  assert.equal(structured.kind, 'menu');
  assert.deepEqual(
    structured.senses.map((s) => s.strong),
    repo.senses('H0430').map((e) => e.strong),
  );
  assert.ok(structured.senses.length > 1);
  assert.ok(!structured.senses.some((s) => s.strong === 'H0430J'));
  assert.equal(structured.note, 'H0430J has no entry of its own; its base number H0430 has these senses.');
});

void test('a tag whose base number has exactly one sense shows that entry with a note', () => {
  assert.deepEqual(
    repo.senses('G2453').map((e) => e.strong),
    ['G2453G'],
  );
  const result = lookupStrong.call({ strong: 'G2453B' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('lookup_strong.G2453B.txt', text);
  const structured = outputSchema.parse(result.structuredContent);
  assert.equal(structured.kind, 'entry');
  assert.equal(structured.entry?.strong, 'G2453G');
  assert.equal(structured.note, 'G2453B has no entry of its own; this is the entry of G2453G.');
  // The bare number and the real sense need no note.
  for (const strong of ['G2453', 'G2453G']) {
    const plain = outputSchema.parse(lookupStrong.call({ strong }, repo).structuredContent);
    assert.equal(plain.note, undefined, strong);
    assert.equal(plain.entry?.strong, 'G2453G', strong);
  }
});

void test('a sense letter is still unknown when the base number has no entry either', () => {
  for (const strong of ['G9999G', 'H9999Z', 'G9998A']) {
    const result = lookupStrong.call({ strong }, repo);
    assert.equal(result.isError, true, strong);
    assert.match(textOf(result), /was not found/);
  }
});

void test('a Greek number with several senses returns a menu', () => {
  const result = lookupStrong.call({ strong: 'G3004' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('lookup_strong.G3004.txt', textOf(result));
  assert.deepEqual(
    outputSchema.parse(result.structuredContent).senses.map((s) => s.strong),
    ['G3004G', 'G3004H'],
  );
});

void test('a five-digit Greek number is found with or without padding or a letter', () => {
  for (const strong of ['G20001', 'g20001']) {
    const result = lookupStrong.call({ strong }, repo);
    assert.equal(result.isError, undefined, strong);
    assert.match(textOf(result), /^G20001 /);
  }
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

void test('a number with too many digits is malformed', () => {
  for (const strong of ['G123456', 'H12345'])
    assert.equal(lookupStrong.call({ strong }, repo).isError, true, strong);
  const result = lookupStrong.call({ strong: 'H99999' }, repo);
  assert.equal(result.isError, true);
  assert.equal(
    textOf(result),
    'Malformed Strong\'s number "H99999". Use H or G, then a number (up to 4 digits for H, 5 for G; zero-padding optional) and an optional sense letter, e.g. "H1254", "H7704G" or "G3056"',
  );
});

void test('a well-formed but absent number is unknown', () => {
  for (const strong of ['H9999', 'H9999Z', 'G9999']) {
    const result = lookupStrong.call({ strong }, repo);
    assert.equal(result.isError, true, strong);
    assert.equal(
      textOf(result),
      `Strong's number "${strong}" was not found. Check the number or try search_lexicon`,
    );
  }
});
