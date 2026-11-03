import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hint } from '../../src/domain/errors.ts';
import {
  formatRef,
  formatSpan,
  parsePassage,
  parseRef,
  parseScope,
  spanFrom,
  spanOf,
  spanVerses,
} from '../../src/domain/ref.ts';
import type { Passage, Span, VerseBounds, VerseRef } from '../../src/domain/ref.ts';

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

const passage = (input: string, versification: 'eng' | 'heb' = 'eng'): Passage => {
  const r = parsePassage(input, versification);
  assert.ok(r.ok, input);
  return r.value;
};

void test('parsePassage returns a verse for a single verse', () => {
  const p = passage('Ruth 1:2');
  assert.ok(p.kind === 'verse');
  assert.deepEqual([p.book.id, p.chapter, p.verse], ['Ruth', 1, 2]);
});

void test('parsePassage reads a same-chapter range with any dash and spacing', () => {
  for (const input of ['Ruth 1:1-5', 'Ruth 1:1 – 5', 'ruth1:1—5', '  Ruth 1 : 1 - 5 ']) {
    const p = passage(input);
    assert.ok(p.kind === 'range', input);
    assert.deepEqual([p.book.id, p.chapter, p.verse, p.endChapter, p.endVerse], ['Ruth', 1, 1, 1, 5], input);
  }
});

void test('parsePassage reads a cross-chapter range', () => {
  const p = passage('Ruth 1:20-2:3');
  assert.ok(p.kind === 'range');
  assert.deepEqual([p.chapter, p.verse, p.endChapter, p.endVerse], [1, 20, 2, 3]);
  const same = passage('Ruth 1:2-1:4');
  assert.ok(same.kind === 'range');
  assert.deepEqual([same.endChapter, same.endVerse], [1, 4]);
});

void test('parsePassage reads a whole chapter and carries the versification', () => {
  const p = passage('1 Samuel 3', 'heb');
  assert.ok(p.kind === 'chapter');
  assert.deepEqual([p.book.id, p.chapter, p.versification], ['1Sam', 3, 'heb']);
  assert.equal(passage('Ruth 1:1-2', 'heb').versification, 'heb');
});

void test('parsePassage accepts a range of one verse', () => {
  const p = passage('Ruth 1:3-3');
  assert.ok(p.kind === 'range');
  assert.deepEqual([p.verse, p.endVerse], [3, 3]);
});

void test('parsePassage rejects a range that ends before it starts', () => {
  for (const input of ['Ruth 1:5-2', 'Ruth 2:1-1:3', 'Ruth 2:1-1:9']) {
    const r = parsePassage(input);
    assert.ok(!r.ok, input);
    assert.deepEqual(r.error, { kind: 'invalid_range', input }, input);
  }
});

void test('parsePassage checks both chapters against the versification', () => {
  const start = parsePassage('Ruth 9:1-2');
  assert.ok(!start.ok);
  assert.deepEqual(start.error, { kind: 'chapter_out_of_range', book: 'Ruth', chapter: 9, max: 4 });
  const end = parsePassage('Ruth 4:1-5:2');
  assert.ok(!end.ok);
  assert.deepEqual(end.error, { kind: 'chapter_out_of_range', book: 'Ruth', chapter: 5, max: 4 });
  const chapter = parsePassage('Ruth 0');
  assert.ok(!chapter.ok);
  assert.equal(chapter.error.kind, 'chapter_out_of_range');
  assert.ok(!parsePassage('Joel 4').ok);
  assert.ok(parsePassage('Joel 4', 'heb').ok);
});

void test('parsePassage reports an unknown book first and keeps malformed input', () => {
  const unknown = parsePassage('Руфь 1:2-3');
  assert.ok(!unknown.ok);
  assert.equal(unknown.error.kind, 'unknown_book');
  for (const input of ['', 'Ruth', 'Ruth 1:', 'Ruth 1:2-', 'Ruth 1-2', 'Ruth 1:2:3']) {
    const r = parsePassage(input);
    assert.ok(!r.ok, input);
    assert.deepEqual(r.error, { kind: 'malformed_reference', input }, input);
  }
});

// Ruth in the fixture: chapter 1 has 22 verses, chapter 2 has 23.
const last = (chapter: number): VerseBounds | null =>
  ({ 1: { first: 1, last: 22 }, 2: { first: 1, last: 23 } })[chapter] ?? null;
const span = (input: string): Span => {
  const r = spanOf(passage(input), last);
  assert.ok(r.ok, input);
  return r.value;
};

void test('spanOf gives the first and last verse of each passage kind', () => {
  assert.deepEqual(span('Ruth 1:4').start, { chapter: 1, verse: 4 });
  assert.deepEqual(span('Ruth 1:4').end, { chapter: 1, verse: 4 });
  assert.deepEqual(span('Ruth 1:2-5').end, { chapter: 1, verse: 5 });
  assert.deepEqual(span('Ruth 1:20-2:3').end, { chapter: 2, verse: 3 });
  assert.deepEqual(span('Ruth 2').start, { chapter: 2, verse: 1 });
  assert.deepEqual(span('Ruth 2').end, { chapter: 2, verse: 23 });
  assert.equal(span('Ruth 2').versification, 'eng');
});

void test('spanOf reports a verse beyond the chapter with the last verse', () => {
  for (const [input, chapter, verse, max] of [
    ['Ruth 1:23', 1, 23, 22],
    ['Ruth 1:2-23', 1, 23, 22],
    ['Ruth 1:20-2:24', 2, 24, 23],
    ['Ruth 3:1-2', 3, 1, 0],
    ['Ruth 3', 3, 1, 0],
  ] as const) {
    const r = spanOf(passage(input), last);
    assert.ok(!r.ok, input);
    assert.deepEqual(
      r.error,
      { kind: 'verse_out_of_range', book: 'Ruth', chapter, verse, min: 1, max },
      input,
    );
  }
  assert.ok(spanOf(passage('Ruth 1:22'), last).ok);
});

void test('spanVerses walks verses in order across chapter boundaries', () => {
  const labels = (input: string): string[] =>
    [...spanVerses(span(input), last)].map((v) => `${v.chapter}:${v.verse}`);
  assert.deepEqual(labels('Ruth 1:2-4'), ['1:2', '1:3', '1:4']);
  assert.deepEqual(labels('Ruth 1:21-2:2'), ['1:21', '1:22', '2:1', '2:2']);
  assert.deepEqual(labels('Ruth 1:7'), ['1:7']);
  assert.equal(labels('Ruth 2').length, 23);
  const first = [...spanVerses(span('Ruth 1:2'), last)][0];
  assert.equal(first?.kind, 'verse');
  assert.equal(first?.book.id, 'Ruth');
  assert.equal(first?.versification, 'eng');
});

const passageVerse = (): VerseRef => {
  const p = passage('Ruth 1:1');
  assert.ok(p.kind === 'verse');
  return p;
};

void test('spanFrom keeps the end and moves the start', () => {
  const rest = spanFrom(span('Ruth 1:1-12'), { ...passageVerse(), chapter: 1, verse: 7 });
  assert.equal(formatSpan(rest), 'Ruth 1:7-12');
  assert.equal(
    formatSpan(spanFrom(span('Ruth 1:20-2:3'), { ...passageVerse(), chapter: 2, verse: 1 })),
    'Ruth 2:1-3',
  );
});

void test('formatSpan writes the form the parser accepts', () => {
  assert.equal(formatSpan(span('Ruth 1:4')), 'Ruth 1:4');
  assert.equal(formatSpan(span('Ruth 1:3-3')), 'Ruth 1:3');
  assert.equal(formatSpan(span('Ruth 1:1-5')), 'Ruth 1:1-5');
  assert.equal(formatSpan(span('Ruth 1:20-2:3')), 'Ruth 1:20-2:3');
  assert.equal(formatSpan(span('Ruth 1')), 'Ruth 1:1-22');
  const sam = passage('1 Samuel 3:1-2');
  const samSpan = spanOf(sam, () => ({ first: 1, last: 21 }));
  assert.ok(samSpan.ok);
  assert.equal(formatSpan(samSpan.value), '1 Samuel 3:1-2');
});

// A psalm with a superscription: its chapter 3 runs from verse 0 to 8, chapter 4 from 1 to 9.
const psalm = (chapter: number): VerseBounds | null =>
  ({ 3: { first: 0, last: 8 }, 4: { first: 1, last: 9 } })[chapter] ?? null;

void test('a chapter starts at its first verse, which is 0 with a superscription', () => {
  const r = spanOf(passage('Psalms 3'), psalm);
  assert.ok(r.ok);
  assert.deepEqual(r.value.start, { chapter: 3, verse: 0 });
  assert.deepEqual(r.value.end, { chapter: 3, verse: 8 });
  assert.equal(formatSpan(r.value), 'Psalms 3:0-8');
});

void test('verse 0 is accepted only where the chapter has it', () => {
  assert.ok(spanOf(passage('Psalms 3:0-2'), psalm).ok);
  const r = spanOf(passage('Ruth 1:0-2'), last);
  assert.ok(!r.ok);
  assert.deepEqual(r.error, {
    kind: 'verse_out_of_range',
    book: 'Ruth',
    chapter: 1,
    verse: 0,
    min: 1,
    max: 22,
  });
  const after = spanOf(passage('Psalms 4:0'), psalm);
  assert.ok(!after.ok);
  assert.equal(hint(after.error), 'Psalms 4 has no verse 0. Use a verse from 1 to 9');
});

void test('the hint names the real first verse of a chapter with a superscription', () => {
  const r = spanOf(passage('Psalms 3:9'), psalm);
  assert.ok(!r.ok);
  assert.equal(hint(r.error), 'Psalms 3 has no verse 9. Use a verse from 0 to 8');
});

void test('spanVerses restarts each chapter at its own first verse', () => {
  const r = spanOf(passage('Psalms 3:7-4:2'), psalm);
  assert.ok(r.ok);
  assert.deepEqual(
    [...spanVerses(r.value, psalm)].map((v) => `${v.chapter}:${v.verse}`),
    ['3:7', '3:8', '4:1', '4:2'],
  );
  const wide = spanOf(passage('Psalms 2:1-3:1'), (c) => (c === 2 ? { first: 1, last: 2 } : psalm(c)));
  assert.ok(wide.ok);
  assert.deepEqual(
    [...spanVerses(wide.value, (c) => (c === 2 ? { first: 1, last: 2 } : psalm(c)))].map(
      (v) => `${v.chapter}:${v.verse}`,
    ),
    ['2:1', '2:2', '3:0', '3:1'],
  );
});
