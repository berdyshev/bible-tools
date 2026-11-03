import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hint } from '../../src/domain/errors.ts';
import { formatRef, parseRef, parseScope } from '../../src/domain/ref.ts';

void test('parses a plain reference', () => {
  const r = parseRef('Ruth 1:2');
  assert.ok(r.ok);
  assert.equal(r.value.kind, 'verse');
  assert.equal(r.value.book.id, 'Ruth');
  assert.equal(r.value.chapter, 1);
  assert.equal(r.value.verse, 2);
  assert.equal(r.value.versification, 'eng');
});

void test('book spellings, numbered books and whitespace', () => {
  for (const [input, id, c, v] of [
    ['Gen 12:10', 'Gen', 12, 10],
    ['gen12:10', 'Gen', 12, 10],
    ['  1 Samuel  20 : 42  ', '1Sam', 20, 42],
    ['1Sam 20:42', '1Sam', 20, 42],
    ['Song of Songs 2:3', 'Song', 2, 3],
    ['Ps 119:176', 'Ps', 119, 176],
    ['Psalm 3:0', 'Ps', 3, 0],
    ['Rut 4:22', 'Ruth', 4, 22],
  ] as const) {
    const r = parseRef(input);
    assert.ok(r.ok, input);
    assert.deepEqual([r.value.book.id, r.value.chapter, r.value.verse], [id, c, v], input);
  }
});

void test('versification is carried through and selects the chapter bound', () => {
  const heb = parseRef('1Sam 21:1', 'heb');
  assert.ok(heb.ok);
  assert.equal(heb.value.versification, 'heb');

  assert.ok(!parseRef('Joel 4:1').ok);
  assert.ok(parseRef('Joel 4:1', 'heb').ok);
  assert.ok(!parseRef('Mal 4:1', 'heb').ok);
  assert.ok(parseRef('Mal 4:1', 'eng').ok);
  assert.ok(parseRef('Ruth 4:1', 'heb').ok);
  assert.ok(!parseRef('Ruth 5:1', 'heb').ok);
});

void test('unknown book (non-English names included)', () => {
  const r = parseRef('Руфь 1:2');
  assert.ok(!r.ok);
  assert.equal(r.error.kind, 'unknown_book');
  assert.match(hint(r.error), /^Unknown book "Руфь"/);
  const m = parseRef('Matthew 1:1');
  assert.ok(!m.ok);
  assert.equal(m.error.kind, 'unknown_book');
});

void test('chapter out of range reports the book name and maximum', () => {
  const r = parseRef('Ruth 99:1');
  assert.ok(!r.ok);
  assert.deepEqual(r.error, { kind: 'chapter_out_of_range', book: 'Ruth', chapter: 99, max: 4 });
  assert.ok(parseRef('Ruth 4:1').ok);
  const zero = parseRef('Ruth 0:1');
  assert.ok(!zero.ok);
  assert.equal(zero.error.kind, 'chapter_out_of_range');
});

void test('ranges and chapter-only references are not supported yet', () => {
  for (const input of ['Ruth 1:2-3', 'Ruth 1:2 – 3', 'Ruth 1:2-2:3', 'Ruth 1', '1 Samuel 3']) {
    const r = parseRef(input);
    assert.ok(!r.ok, input);
    assert.deepEqual(r.error, { kind: 'range_not_supported', input }, input);
  }
});

void test('a range in an unknown book reports the book first', () => {
  const r = parseRef('Руфь 1:2-3');
  assert.ok(!r.ok);
  assert.equal(r.error.kind, 'unknown_book');
});

void test('malformed references keep the original input', () => {
  for (const input of [
    '',
    'Ruth',
    '1:2',
    '12',
    'Ruth one:two',
    'Ruth 1:',
    'Ruth 1:2:3',
    'Ruth 1:2-',
    ' Ruth ',
  ]) {
    const r = parseRef(input);
    assert.ok(!r.ok, input);
    assert.deepEqual(r.error, { kind: 'malformed_reference', input }, input);
  }
});

void test('formatRef uses the English book name', () => {
  const r = parseRef('1sam 20:42');
  assert.ok(r.ok);
  assert.equal(formatRef(r.value), '1 Samuel 20:42');
  const s = parseRef('song 2:3');
  assert.ok(s.ok);
  assert.equal(formatRef(s.value), 'Song of Songs 2:3');
});

void test('parseScope accepts the whole OT, a book and a chapter', () => {
  for (const input of ['OT', 'ot', ' all ', '']) {
    assert.deepEqual(parseScope(input), { ok: true, value: { kind: 'testament', testament: 'OT' } }, input);
  }
  const book = parseScope(' Ruth ');
  assert.ok(book.ok && book.value.kind === 'book');
  assert.equal(book.value.book.id, 'Ruth');
  const chapter = parseScope('1 Samuel 20');
  assert.ok(chapter.ok && chapter.value.kind === 'chapter');
  assert.deepEqual([chapter.value.book.id, chapter.value.chapter], ['1Sam', 20]);
  const glued = parseScope('Ruth2');
  assert.ok(glued.ok && glued.value.kind === 'chapter' && glued.value.chapter === 2);
});

void test('parseScope checks the chapter against the versification', () => {
  const eng = parseScope('Joel 4');
  assert.ok(!eng.ok);
  assert.deepEqual(eng.error, { kind: 'chapter_out_of_range', book: 'Joel', chapter: 4, max: 3 });
  assert.ok(parseScope('Joel 4', 'heb').ok);
  assert.ok(!parseScope('Ruth 5').ok);
  assert.ok(!parseScope('Ruth 0').ok);
});

void test('parseScope rejects other shapes with the allowed forms, and unknown books as such', () => {
  for (const input of ['Ruth 1:2', 'Ruth 1-2', '12', 'Ruth!']) {
    const r = parseScope(input);
    assert.ok(!r.ok, input);
    assert.equal(r.error.kind, 'invalid_scope', input);
  }
  const bad = parseScope('Ruth 1:2');
  assert.ok(!bad.ok);
  assert.equal(
    hint(bad.error),
    'Invalid scope "Ruth 1:2". Use one of: OT, a book such as "Ruth", a chapter such as "Ruth 2"',
  );
  const unknown = parseScope('Foo 2');
  assert.ok(!unknown.ok);
  assert.equal(unknown.error.kind, 'unknown_book');
});
