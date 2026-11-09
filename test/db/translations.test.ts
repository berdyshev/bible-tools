import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { kjvBounds } from '../../src/domain/kjv.ts';
import { parsePassage, spanOf, type Span } from '../../src/domain/ref.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';

const repo = createBibleRepo(fixtureDb());

const spanFor = (ref: string): Span => {
  const passage = parsePassage(ref);
  assert.ok(passage.ok);
  const span = spanOf(passage.value, kjvBounds(passage.value.book));
  assert.ok(span.ok);
  return span.value;
};

void test('translations lists the five versions in their fixed order with their markers', () => {
  assert.deepEqual(
    repo.translations().map((t) => [t.version, t.label, t.bracketMeaning !== null, t.hasNotes]),
    [
      ['kjv', 'KJV', true, true],
      ['darby', 'Darby', true, false],
      ['elb1905', 'Elb1905', true, false],
      ['ohienko', 'Ohienko', false, false],
      ['rst', 'RST', true, false],
    ],
  );
});

void test('translationVerses returns the verses of a span in order, across chapters', () => {
  const rows = repo.translationVerses('kjv', spanFor('Ruth 1:21-2:2'));
  assert.deepEqual(
    rows.map((r) => `${r.chapter}:${r.verse}`),
    ['1:21', '1:22', '2:1', '2:2'],
  );
  assert.ok(rows.every((r) => r.text.length > 0 && !/[<>]/.test(r.text)));
});

void test('translationVerses keeps the version apart and skips verses the version lacks', () => {
  assert.deepEqual(repo.translationVerses('darby', spanFor('Acts 8:37')), []);
  assert.equal(repo.translationVerses('kjv', spanFor('Acts 8:37')).length, 1);
  assert.deepEqual(repo.translationVerses('rst', spanFor('Gen 1:1')), []);
});

void test("translationVerses carries the version's own number", () => {
  assert.deepEqual(
    repo.translationVerses('rst', spanFor('Num 13:1-2')).map((r) => r.nativeRef),
    ['13:2', '13:3'],
  );
  assert.equal(repo.translationVerses('elb1905', spanFor('Lev 6:1'))[0]?.nativeRef, '5:20');
  assert.equal(repo.translationVerses('kjv', spanFor('Lev 6:1'))[0]?.nativeRef, null);
});
