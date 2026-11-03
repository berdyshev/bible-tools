import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureDb } from '../helpers/fixture-db.ts';

const db = fixtureDb();
const rows = (sql: string, ...params: (string | number)[]) =>
  db
    .prepare(sql)
    .all(...params)
    .map((r) => ({ ...r }));

void test('fixture database holds the 19 words of Ruth 1:1 in order', () => {
  const words = rows(
    'SELECT position, strong FROM words WHERE book = ? AND chapter = 1 AND verse = 1 ORDER BY id',
    'Ruth',
  );
  assert.equal(words.length, 19);
  assert.deepEqual(words[0], { position: 1, strong: 'H1961' });
  assert.deepEqual(words[13], { position: 14, strong: 'H7704G' });
});

void test('fixture database holds only Ruth', () => {
  assert.deepEqual(rows('SELECT DISTINCT book FROM words'), [{ book: 'Ruth' }]);
});

void test('fixture database lists the senses of H7704', () => {
  const senses = rows("SELECT dstrong FROM lexicon WHERE substr(dstrong, 1, 5) = 'H7704' ORDER BY id");
  assert.deepEqual(
    senses.map((r) => r['dstrong']),
    ['H7704A', 'H7704B', 'H7704G', 'H7704H', 'H7704I', 'H7704M'],
  );
});

void test('fixture database has names with categories', () => {
  assert.deepEqual(rows("SELECT category FROM names WHERE dstrong = 'H4124G'"), [{ category: 'place' }]);
  assert.deepEqual(rows("SELECT category FROM names WHERE dstrong = 'H5281'"), [{ category: 'person' }]);
});
