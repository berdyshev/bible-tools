import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOOKS, type Book } from '../../src/domain/books.ts';
import { KJV_LINES, KJV_VERSES, kjvBounds, lineIndex, refAt } from '../../src/domain/kjv.ts';

const book = (id: string): Book => {
  const found = BOOKS.find((b) => b.id === id);
  assert.ok(found, id);
  return found;
};

const sum = (books: readonly Book[]): number =>
  books.reduce((acc, b) => acc + (KJV_VERSES[b.id] ?? []).reduce((a, n) => a + n, 0), 0);

void test('the KJV has 23 145 Old Testament and 7 957 New Testament verses, 31 102 in all', () => {
  assert.equal(sum(BOOKS.filter((b) => b.testament === 'OT')), 23_145);
  assert.equal(sum(BOOKS.filter((b) => b.testament === 'NT')), 7_957);
  assert.equal(KJV_LINES, 31_102);
});

void test('every book has the chapter count of the book table', () => {
  assert.deepEqual(
    Object.keys(KJV_VERSES),
    BOOKS.map((b) => b.id),
  );
  for (const b of BOOKS) assert.equal(KJV_VERSES[b.id]?.length, b.chapters, b.id);
});

void test('chapters where the KJV differs from the NRSV have their KJV verse counts', () => {
  assert.deepEqual(kjvBounds(book('Ps'))(119), { first: 1, last: 176 });
  assert.deepEqual(kjvBounds(book('3John'))(1), { first: 1, last: 14 });
  assert.deepEqual(kjvBounds(book('Rev'))(12), { first: 1, last: 17 });
  assert.deepEqual(kjvBounds(book('2Cor'))(13), { first: 1, last: 14 });
});

void test('bounds are null for a chapter the book does not have', () => {
  assert.equal(kjvBounds(book('Ruth'))(0), null);
  assert.equal(kjvBounds(book('Ruth'))(5), null);
  assert.deepEqual(kjvBounds(book('Ruth'))(4), { first: 1, last: 22 });
});

void test('line indexes match the theWord verse lines of the step-0 spot verses', () => {
  // 1-based line numbers from the module survey: Gen 1:1 = 1, Lev 6:1 = 2851, Rev 13:1 = 30910.
  const spots: [string, number, number, number][] = [
    ['Gen', 1, 1, 1],
    ['Lev', 6, 1, 2851],
    ['Num', 13, 1, 4077],
    ['Ps', 3, 1, 13959],
    ['Ps', 23, 1, 14237],
    ['Prov', 4, 27, 16518],
    ['Mal', 4, 1, 23140],
    ['Matt', 5, 22, 23257],
    ['2Cor', 13, 14, 29058],
    ['3John', 1, 14, 30673],
    ['Rev', 12, 17, 30909],
    ['Rev', 13, 1, 30910],
  ];
  for (const [id, chapter, verse, line] of spots) {
    assert.equal(lineIndex(book(id), chapter, verse), line - 1, `${id} ${chapter}:${verse}`);
  }
  assert.equal(lineIndex(book('Rev'), 22, 21), 31_101);
  assert.equal(lineIndex(book('Matt'), 1, 1), 23_145);
});

void test('line index is null for a verse outside the KJV', () => {
  assert.equal(lineIndex(book('3John'), 1, 15), null);
  assert.equal(lineIndex(book('Ps'), 3, 0), null);
  assert.equal(lineIndex(book('Ruth'), 5, 1), null);
  assert.equal(lineIndex(book('Ruth'), 0, 1), null);
  assert.equal(lineIndex(book('Ruth'), 1, 1.5), null);
});

void test('refAt inverts lineIndex for every verse line', () => {
  for (let index = 0; index < KJV_LINES; index++) {
    const ref = refAt(index);
    assert.ok(ref, String(index));
    assert.equal(lineIndex(ref.book, ref.chapter, ref.verse), index);
  }
  const first = refAt(0);
  assert.deepEqual([first?.book.id, first?.chapter, first?.verse], ['Gen', 1, 1]);
  const last = refAt(31_101);
  assert.deepEqual([last?.book.id, last?.chapter, last?.verse], ['Rev', 22, 21]);
});

void test('refAt is null outside the verse lines', () => {
  assert.equal(refAt(-1), null);
  assert.equal(refAt(31_102), null);
  assert.equal(refAt(0.5), null);
});
