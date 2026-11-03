import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { outputSchema, searchLexicon } from '../../src/tools/search-lexicon.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

void test('search_lexicon field lists whole-word glosses first and includes H7704G', () => {
  const result = searchLexicon.call({ query: 'field' }, repo);
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
