import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { getVerse } from '../../src/tools/get-verse.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

void test('get_verse Ruth 1:1 matches the golden output', () => {
  const result = getVerse.call({ ref: 'Ruth 1:1' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('get_verse.Ruth_1_1.txt', textOf(result));
});

void test('get_verse Ruth 1:1 stays compact', () => {
  assert.ok(textOf(getVerse.call({ ref: 'Ruth 1:1' }, repo)).length < 2000);
});

const failure = (ref: string): string => {
  const result = getVerse.call({ ref }, repo);
  assert.equal(result.isError, true);
  return textOf(result);
};

void test('an unknown book gets a hint listing valid ids', () => {
  assert.match(
    failure('Руфь 1:2'),
    /^Unknown book "Руфь"\. Use English OSIS ids or names: Gen, Exod, Lev, …$/,
  );
});

void test('a chapter out of range gets the valid range', () => {
  assert.equal(failure('Ruth 99:1'), 'Ruth has no chapter 99. Use a chapter from 1 to 4');
});

void test('a verse out of range gets the last verse', () => {
  assert.equal(failure('Ruth 1:99'), 'Ruth 1 has no verse 99. Use a verse from 1 to 22');
});

void test('a range is refused with a hint', () => {
  assert.equal(
    failure('Ruth 1:2-3'),
    'Ranges are not supported here: "Ruth 1:2-3". Pass a single verse, e.g. "Ruth 1:1"',
  );
});
