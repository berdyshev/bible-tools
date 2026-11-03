import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeBook } from '../../src/domain/books.ts';
import type { VerseRef } from '../../src/domain/ref.ts';
import { description, formatVerse, inputSchema } from '../../src/tools/get-verse.ts';
import type { VerseWord } from '../../src/tools/get-verse.ts';

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
