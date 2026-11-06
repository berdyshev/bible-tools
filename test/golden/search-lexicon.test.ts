import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { outputSchema, searchLexicon } from '../../src/tools/search-lexicon.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

void test('search_lexicon field lists whole-word glosses first and includes H7704G', () => {
  const result = searchLexicon.call({ query: 'field', language: 'hebrew' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('search_lexicon.field.txt', text);
  const structured = outputSchema.parse(result.structuredContent);
  assert.equal(
    structured.results.findIndex((r) => r.strong === 'H7704G'),
    8,
  );
  assert.match(text, /\nH7704G {2}«land: country» {2}\S+$/m);
  assert.equal(structured.more, true);
  assert.equal(structured.results.length, 20);
});

void test('search_lexicon field in Greek lists Greek entries with the lemma last', () => {
  const result = searchLexicon.call({ query: 'field', language: 'greek' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('search_lexicon.field.greek.txt', text);
  const structured = outputSchema.parse(result.structuredContent);
  assert.ok(structured.results.every((r) => r.strong.startsWith('G')));
  assert.ok(structured.results.some((r) => r.strong === 'G0068G'));
  assert.match(text, /\nG0068G {2}«field» {2}\S+$/m);
});
