import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOOK_IDS, BOOKS, normalizeBook } from '../../src/domain/books.ts';
import { hint } from '../../src/domain/errors.ts';

const idOf = (input: string): string | undefined => {
  const r = normalizeBook(input);
  return r.ok ? r.value.id : undefined;
};

void test('table has the 39 Old Testament books with unique ids and codes', () => {
  assert.equal(BOOKS.length, 39);
  assert.equal(new Set(BOOK_IDS).size, 39);
  assert.equal(new Set(BOOKS.map((b) => b.sourceCode)).size, 39);
  assert.ok(BOOKS.every((b) => b.testament === 'OT'));
  assert.deepEqual(BOOK_IDS.slice(0, 3), ['Gen', 'Exod', 'Lev']);
  assert.equal(BOOK_IDS.at(-1), 'Mal');
});

void test('no spelling resolves to two different books', () => {
  const seen = new Map<string, string>();
  for (const b of BOOKS) {
    for (const s of [b.id, b.name, b.sourceCode, ...b.aliases]) {
      const k = s.toLowerCase().replace(/[\s.]+/g, '');
      assert.equal(seen.get(k) ?? b.id, b.id, `${s} is ambiguous`);
      seen.set(k, b.id);
    }
  }
});

void test('every book is found by its id, name and TAHOT code', () => {
  for (const b of BOOKS) {
    assert.equal(idOf(b.id), b.id);
    assert.equal(idOf(b.name), b.id);
    assert.equal(idOf(b.sourceCode), b.id);
  }
});

void test('every alias resolves to its own book', () => {
  for (const b of BOOKS) {
    for (const a of b.aliases) assert.equal(idOf(a), b.id, a);
  }
});

void test('names and abbreviations', () => {
  assert.equal(idOf('Genesis'), 'Gen');
  assert.equal(idOf('Gen'), 'Gen');
  assert.equal(idOf('Exodus'), 'Exod');
  assert.equal(idOf('Song of Songs'), 'Song');
  assert.equal(idOf('Song'), 'Song');
  assert.equal(idOf('Song of Solomon'), 'Song');
  assert.equal(idOf('Psalm'), 'Ps');
  assert.equal(idOf('Ruth'), 'Ruth');
  assert.equal(idOf('Rut'), 'Ruth');
});

void test('numbered books accept spaced, compact and roman forms', () => {
  assert.equal(idOf('1 Samuel'), '1Sam');
  assert.equal(idOf('1Sam'), '1Sam');
  assert.equal(idOf('1 Sam'), '1Sam');
  assert.equal(idOf('1 Sam.'), '1Sam');
  assert.equal(idOf('I Samuel'), '1Sam');
  assert.equal(idOf('2 Kings'), '2Kgs');
  assert.equal(idOf('2Ki'), '2Kgs');
  assert.equal(idOf('1 Chronicles'), '1Chr');
  assert.notEqual(idOf('1 Samuel'), idOf('2 Samuel'));
});

void test('matching ignores case and surrounding or inner whitespace', () => {
  assert.equal(idOf('  rUtH  '), 'Ruth');
  assert.equal(idOf('SONG OF SONGS'), 'Song');
  assert.equal(idOf('\t1\tsamuel\n'), '1Sam');
});

void test('book metadata', () => {
  const ruth = normalizeBook('Ruth');
  assert.ok(ruth.ok);
  assert.equal(ruth.value.name, 'Ruth');
  assert.equal(ruth.value.sourceCode, 'Rut');
  assert.equal(ruth.value.chapters, 4);
  assert.equal(ruth.value.hebChapters, undefined);
  const joel = normalizeBook('Joel');
  assert.ok(joel.ok);
  assert.deepEqual([joel.value.chapters, joel.value.hebChapters], [3, 4]);
  const ps = normalizeBook('Ps');
  assert.ok(ps.ok);
  assert.equal(ps.value.chapters, 150);
});

void test('unknown book carries the input and the valid ids', () => {
  const r = normalizeBook('Руфь');
  assert.ok(!r.ok);
  assert.deepEqual(r.error, { kind: 'unknown_book', input: 'Руфь', validIds: BOOK_IDS });
  assert.match(hint(r.error), /^Unknown book "Руфь"\. Use English OSIS ids or names: Gen, Exod, Lev, …$/);
  assert.ok(!normalizeBook('').ok);
  assert.ok(!normalizeBook('Matthew').ok);
});
