import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createSchema, load } from '../../src/ingest/load.ts';
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

void test('a Greek search without Greek lexicon data is empty and carries the note', () => {
  const noGreek = new DatabaseSync(':memory:');
  createSchema(noGreek);
  load(noGreek, { tahot: [], tbesh: [], tipnr: [] }, {});
  const result = searchLexicon.call({ query: 'field', language: 'greek' }, createBibleRepo(noGreek));
  assert.equal(result.isError, undefined);
  assert.equal(textOf(result), 'Greek lexicon data is not loaded yet; only Hebrew entries can be searched.');
  const structured = outputSchema.parse(result.structuredContent);
  assert.deepEqual(structured.results, []);
  assert.equal(structured.note, textOf(result));
});

void test('a Hebrew search has no note and a blank query is rejected by the schema', () => {
  const result = searchLexicon.call({ query: 'field', language: 'hebrew' }, repo);
  assert.equal(outputSchema.parse(result.structuredContent).note, undefined);
  assert.equal(searchLexicon.input.safeParse({ query: '   ' }).success, false);
  assert.equal(searchLexicon.input.safeParse({ query: 'x', limit: 0 }).success, false);
});

void test('the tool is named, described and documents every input', () => {
  assert.equal(searchLexicon.name, 'search_lexicon');
  assert.equal(searchLexicon.title, 'Search the Hebrew lexicon');
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

void test('the Greek note appears only for an empty Greek result', () => {
  const stub = { ...repo, searchLexicon: () => [entry('G1')] };
  const found = searchLexicon.call({ query: 'x', language: 'greek' }, stub);
  assert.equal(outputSchema.parse(found.structuredContent).note, undefined);
  assert.match(textOf(found), /^1 lexicon entry for "x"/);
  const empty = { ...repo, searchLexicon: () => [] };
  const none = searchLexicon.call({ query: 'x', language: 'hebrew' }, empty);
  assert.equal(outputSchema.parse(none.structuredContent).note, undefined);
  assert.match(textOf(none), /^No lexicon entries match "x"/);
});
