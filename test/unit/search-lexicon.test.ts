import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import {
  descriptionParts,
  formatSearch,
  outputSchema,
  searchLexicon,
} from '../../src/tools/search-lexicon.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { textOf } from '../helpers/tool-text.ts';

const hit = (strong: string, gloss: string, original: string) => ({ strong, gloss, original });

void test('formatSearch puts the lemma last and counts the entries', () => {
  assert.equal(
    formatSearch('field', [hit('H7704M', 'field', 'שָׂדֶה'), hit('H7709', 'field', 'שְׁדֵמָה')], false),
    '2 lexicon entries for "field"\nH7704M  «field»  שָׂדֶה\nH7709  «field»  שְׁדֵמָה',
  );
  assert.equal(
    formatSearch('field', [hit('H7704M', 'field', 'x')], false),
    '1 lexicon entry for "field"\nH7704M  «field»  x',
  );
});

void test('formatSearch says when the list is cut and when nothing matches', () => {
  assert.equal(
    formatSearch('field', [hit('H1', 'a', 'x')], true),
    '1+ lexicon entries for "field"\nH1  «a»  x\nMore entries match; raise limit or use a more specific word.',
  );
  assert.equal(
    formatSearch('zzz', [], false),
    'No lexicon entries match "zzz". Try a shorter or different English word.',
  );
});

const repo = createBibleRepo(fixtureDb());

void test('limit cuts the list and reports that more exist', () => {
  const result = searchLexicon.call({ query: 'field', limit: 2 }, repo);
  assert.equal(result.isError, undefined);
  assert.equal(textOf(result).split('\n').length, 4);
  assert.match(textOf(result), /^2\+ lexicon entries for "field"/);
  assert.equal(outputSchema.parse(result.structuredContent).more, true);
});

const strongsOf = (args: Parameters<typeof searchLexicon.call>[0]): string[] =>
  outputSchema.parse(searchLexicon.call(args, repo).structuredContent).results.map((r) => r.strong);

void test('a Greek search lists only Greek entries, a Hebrew one only Hebrew entries', () => {
  const greek = strongsOf({ query: 'field', language: 'greek' });
  assert.ok(greek.length > 0 && greek.every((k) => k.startsWith('G')));
  const hebrew = strongsOf({ query: 'field', language: 'hebrew' });
  assert.ok(hebrew.length > 0 && hebrew.every((k) => k.startsWith('H')));
});

void test('without a language both are searched', () => {
  const both = strongsOf({ query: 'field', limit: 100 });
  assert.ok(both.some((k) => k.startsWith('H')) && both.some((k) => k.startsWith('G')));
});

void test('a blank query is rejected by the schema', () => {
  assert.equal(searchLexicon.input.safeParse({ query: '   ' }).success, false);
  assert.equal(searchLexicon.input.safeParse({ query: 'x', limit: 0 }).success, false);
});

void test('the tool is named, described and documents every input', () => {
  assert.equal(searchLexicon.name, 'search_lexicon');
  assert.equal(searchLexicon.title, 'Search the lexicon');
  for (const part of Object.values(descriptionParts)) assert.ok(part.length > 40, part);
  for (const field of Object.values(searchLexicon.input.shape)) {
    assert.ok((field.description ?? '').length > 20);
  }
});

const accepts = (input: object) => searchLexicon.input.safeParse({ query: 'x', ...input }).success;

void test('input bounds: language is hebrew or greek, limit is 1 to 100', () => {
  assert.ok(accepts({ language: 'hebrew' }) && accepts({ language: 'greek' }));
  assert.ok(!accepts({ language: 'latin' }) && !accepts({ language: '' }));
  assert.ok(accepts({ limit: 1 }) && accepts({ limit: 100 }));
  assert.ok(!accepts({ limit: 101 }) && !accepts({ limit: 1.5 }));
});

const entry = (strong: string) => ({
  strong,
  extendedStrong: strong,
  unifiedStrong: strong,
  relation: '',
  original: 'א',
  transliteration: 't',
  morph: 'H:N',
  gloss: 'g',
  meaning: 'm',
});

void test('more is false when the matches fit exactly, true when one more exists', () => {
  const rows = [entry('H1'), entry('H2'), entry('H3')];
  const stub = { ...repo, searchLexicon: (_q: string, _l: unknown, limit: number) => rows.slice(0, limit) };
  const exact = outputSchema.parse(searchLexicon.call({ query: 'x', limit: 3 }, stub).structuredContent);
  assert.equal(exact.more, false);
  assert.equal(exact.results.length, 3);
  const cut = outputSchema.parse(searchLexicon.call({ query: 'x', limit: 2 }, stub).structuredContent);
  assert.equal(cut.more, true);
  assert.equal(cut.results.length, 2);
});

void test('an empty result says nothing matches, whatever the language', () => {
  const empty = { ...repo, searchLexicon: () => [] };
  for (const language of ['greek', 'hebrew'] as const) {
    const none = searchLexicon.call({ query: 'x', language }, empty);
    assert.match(textOf(none), /^No lexicon entries match "x"/);
    assert.deepEqual(outputSchema.parse(none.structuredContent), { query: 'x', results: [], more: false });
  }
});
