import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeBook } from '../../src/domain/books.ts';
import { parsePassage, spanOf } from '../../src/domain/ref.ts';
import type { Span, VerseRef } from '../../src/domain/ref.ts';
import {
  description,
  formatPassage,
  formatVerse,
  inputSchema,
  MAX_VERSES,
} from '../../src/tools/get-verse.ts';
import type { PassageVerse, VerseWord } from '../../src/tools/get-verse.ts';

const book = normalizeBook('Ruth');
assert.ok(book.ok);
const ref = (versification: VerseRef['versification']): VerseRef => ({
  kind: 'verse',
  book: book.value,
  chapter: 1,
  verse: 2,
  versification,
});

const word = (over: Partial<VerseWord>): VerseWord => ({
  position: 1,
  transliteration: 'va.Yehi',
  strong: 'H1961',
  gloss: 'and/ he was',
  hebrew: 'וַיְהִי',
  isProperName: false,
  nameKind: null,
  ...over,
});

void test('formats a header and one line per word with Hebrew last', () => {
  const text = formatVerse(ref('eng'), [
    word({}),
    word({ position: 2, strong: null, isProperName: true, nameKind: 'place', hebrew: 'מוֹאָב' }),
  ]);
  assert.deepEqual(text.split('\n'), [
    "Ruth 1:2 (English numbering) — Hebrew, read right to left; Strong's numbers per STEPBible",
    '1. va.Yehi  H1961  and/ he was  וַיְהִי',
    '2. va.Yehi  —  and/ he was  [name: place]  מוֹאָב',
  ]);
});

void test('the header states Hebrew numbering when asked', () => {
  assert.match(formatVerse(ref('heb'), []), /^Ruth 1:2 \(Hebrew numbering\)/);
});

void test('the description is generic and states what it does not do', () => {
  assert.doesNotMatch(description, /german|russian|elberfelder|rbo|name table/i);
  assert.match(description, /does not translate/);
  assert.match(description, /lookup_strong/);
});

void test('the schema requires a non-empty ref and validates versification', () => {
  assert.equal(inputSchema.safeParse({ ref: '' }).success, false);
  assert.equal(inputSchema.safeParse({ ref: 'Ruth 1:1', versification: 'lxx' }).success, false);
  assert.equal(inputSchema.safeParse({ ref: 'Ruth 1:1', versification: 'heb' }).success, true);
});

void test('a proper name without a kind is marked unknown', () => {
  const [, line] = formatVerse(ref('eng'), [word({ isProperName: true })]).split('\n');
  assert.match(line ?? '', /\[name: unknown\]/);
});

const verseAt = (chapter: number, verse: number): VerseRef => ({ ...ref('eng'), chapter, verse });

const spanOfText = (input: string): Span => {
  const passage = parsePassage(input);
  assert.ok(passage.ok);
  const span = spanOf(passage.value, () => 40);
  assert.ok(span.ok);
  return span.value;
};

const verses = (from: number, to: number, hebrew = 'א'): PassageVerse[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    ref: verseAt(1, from + i),
    words: [word({ hebrew })],
  }));

void test('a passage has one header, then each verse under its own sub-header', () => {
  assert.deepEqual(formatPassage(spanOfText('Ruth 1:2-3'), verses(2, 3)).split('\n'), [
    "Ruth 1:2-3 (English numbering) — Hebrew, read right to left; Strong's numbers per STEPBible",
    'Ruth 1:2',
    '1. va.Yehi  H1961  and/ he was  א',
    'Ruth 1:3',
    '1. va.Yehi  H1961  and/ he was  א',
  ]);
});

void test('a passage stops at the verse cap and names the rest', () => {
  assert.equal(MAX_VERSES, 10);
  const lines = formatPassage(spanOfText('Ruth 1:1-12'), verses(1, 12)).split('\n');
  assert.equal(lines.filter((l) => /^Ruth 1:\d+$/.test(l)).length, 10);
  assert.equal(lines.at(-1), 'truncated — call get_verse again with "Ruth 1:11-12"');
  const exact = formatPassage(spanOfText('Ruth 1:1-10'), verses(1, 10));
  assert.ok(!exact.includes('truncated'));
});

void test('a passage stops before the verse that would pass the character cap', () => {
  // Each verse block is about 900 characters, so two do not fit under 2000 with the header.
  const wide = 'א'.repeat(900);
  const text = formatPassage(spanOfText('Ruth 1:1-3'), verses(1, 3, wide));
  assert.ok(text.includes('\nRuth 1:1\n'));
  assert.ok(text.includes('\nRuth 1:2\n'));
  assert.ok(!text.includes('\nRuth 1:3\n'));
  assert.ok(text.endsWith('truncated — call get_verse again with "Ruth 1:3"'));
  const first = formatPassage(spanOfText('Ruth 1:1-3'), verses(1, 3, 'א'.repeat(2500)));
  assert.ok(first.includes('\nRuth 1:1\n'));
  assert.ok(first.endsWith('"Ruth 1:2-3"'));
});

void test('a passage that fits exactly under the character cap is not cut', () => {
  const header = formatPassage(spanOfText('Ruth 1:1'), []);
  const base = formatPassage(spanOfText('Ruth 1:1'), verses(1, 1)).length;
  const pad = 2000 - base;
  const text = formatPassage(spanOfText('Ruth 1:1'), verses(1, 1, 'א'.repeat(1 + pad)));
  assert.equal(header.split('\n').length, 1);
  assert.equal(text.length, 2000);
  const two = formatPassage(spanOfText('Ruth 1:1-2'), [
    ...verses(1, 1, 'א'.repeat(1 + pad)),
    ...verses(2, 2),
  ]);
  assert.ok(two.includes('truncated'));
});

void test('the description states the range format, the cap and that get_passage does not exist', () => {
  assert.match(description, /Ruth 1:1-5/);
  assert.match(description, /10 verses/);
  assert.match(description, /2000 characters/);
  assert.match(description, /There is no get_passage tool/);
  assert.match(description, /truncated — call get_verse again with "Ruth 1:7-12"/);
});
