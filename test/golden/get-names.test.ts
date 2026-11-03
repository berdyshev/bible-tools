import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { getNames } from '../../src/tools/get-names.ts';
import { inputSchema } from '../../src/tools/get-verse.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

void test('get_names Ruth 1:2 matches the golden output', () => {
  const result = getNames.call({ ref: 'Ruth 1:2' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('get_names.Ruth_1_2.txt', text);
  assert.doesNotMatch(text, /Bethlehem_1/);
});

void test('get_names Ruth 1:6 labels the divine name', () => {
  const result = getNames.call({ ref: 'Ruth 1:6' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('get_names.Ruth_1_6.txt', text);
  assert.match(text, /divine name\/title/);
});

void test('a verse without names says so', () => {
  assert.equal(
    textOf(getNames.call({ ref: 'Ruth 1:10' }, repo)).split('\n')[1],
    'No proper names in this verse.',
  );
});

void test('a verse that does not exist is an error with the last verse', () => {
  const result = getNames.call({ ref: 'Ruth 1:99' }, repo);
  assert.equal(result.isError, true);
  assert.equal(textOf(result), 'Ruth 1 has no verse 99. Use a verse from 1 to 22');
});

void test('an unknown book is an error with a hint', () => {
  const result = getNames.call({ ref: 'Руфь 1:2' }, repo);
  assert.equal(result.isError, true);
  assert.match(textOf(result), /^Unknown book/);
});

void test('versification other than eng or heb is refused with the custom message', () => {
  const parsed = inputSchema.safeParse({ ref: 'Ruth 1:2', versification: 'lxx' });
  assert.equal(parsed.success, false);
  assert.equal(
    parsed.error?.issues[0]?.message,
    'versification must be "eng" (English/NRSV, default) or "heb" (Hebrew/Leningrad)',
  );
});
