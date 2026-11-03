import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { formatSearch, outputSchema, searchLexicon } from '../../src/tools/search-lexicon.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { textOf } from '../helpers/tool-text.ts';

const hit = (strong: string, gloss: string, hebrew: string) => ({ strong, gloss, hebrew });

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

void test('a Greek search is empty and carries the note', () => {
  const result = searchLexicon.call({ query: 'field', language: 'greek' }, repo);
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
