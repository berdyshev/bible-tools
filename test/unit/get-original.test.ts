import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeBook } from '../../src/domain/books.ts';
import { parsePassage, spanOf } from '../../src/domain/ref.ts';
import type { Span, VerseRef } from '../../src/domain/ref.ts';
import { description, formatPassage, formatVerse, inputSchema } from '../../src/tools/get-original.ts';
import type { PassageVerse, VerseWord } from '../../src/tools/get-original.ts';

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
  original: 'וַיְהִי',
  textType: 'L',
  morphRaw: 'HC/Vqw3ms',
  isProperName: false,
  nameKind: null,
  ...over,
});

void test('formats a header and one line per word with Hebrew last', () => {
  const text = formatVerse(ref('eng'), [
    word({}),
    word({ position: 2, strong: null, isProperName: true, nameKind: 'place', original: 'מוֹאָב' }),
  ]);
  assert.deepEqual(text.split('\n'), [
    "Ruth 1:2 (English numbering) — Hebrew, read right to left; Strong's numbers per STEPBible",
    '1. va.Yehi  H1961  and/ he was  וַיְהִי',
    '2. va.Yehi  —  and/ he was  [name: place]  מוֹאָב',
  ]);
});

const john = normalizeBook('John');
assert.ok(john.ok);
const johnRef: VerseRef = { kind: 'verse', book: john.value, chapter: 5, verse: 4, versification: 'eng' };
const greek = (over: Partial<VerseWord>): VerseWord =>
  word({
    transliteration: 'En',
    strong: 'G1722',
    gloss: 'In [the]',
    original: 'Ἐν',
    textType: 'NKO',
    ...over,
  });

void test('a Greek verse has a Greek header and the same line layout', () => {
  const text = formatVerse(johnRef, [
    greek({}),
    greek({ position: 2, strong: 'G2424G', isProperName: true, nameKind: 'person', original: 'Ἰησοῦ' }),
  ]);
  assert.deepEqual(text.split('\n'), [
    "John 5:4 (English numbering) — Greek; Strong's numbers per STEPBible",
    '1. En  G1722  In [the]  Ἐν',
    '2. En  G2424G  In [the]  [name: person]  Ἰησοῦ',
  ]);
});

void test('a Greek verse without Nestlé-Aland words says it is shown from the traditional text', () => {
  const note = 'Not in the Nestlé-Aland text; shown from the traditional text.';
  for (const textType of ['KO', 'k', 'O']) {
    assert.deepEqual(
      formatVerse(johnRef, [greek({ textType })])
        .split('\n')
        .slice(0, 3),
      [
        "John 5:4 (English numbering) — Greek; Strong's numbers per STEPBible",
        note,
        '1. En  G1722  In [the]  Ἐν',
      ],
    );
  }
  for (const textType of ['NKO', 'no']) {
    assert.ok(!formatVerse(johnRef, [greek({ textType: 'KO' }), greek({ textType })]).includes(note));
  }
  assert.ok(!formatVerse(johnRef, []).includes(note));
});

void test('the note is Greek only: Hebrew word types never contain N', () => {
  assert.ok(!formatVerse(ref('eng'), [word({ textType: 'L' })]).includes('Nestlé'));
  assert.ok(!formatVerse(ref('eng'), [word({ textType: 'K' })]).includes('Nestlé'));
});

const johnVerse = (n: number, textType: string): PassageVerse => ({
  ref: { ...johnRef, verse: n },
  words: [greek({ textType })],
});

void test('a passage puts the note under the sub-header of each verse that needs it', () => {
  const span = spanOfText('John 5:3-4');
  const text = formatPassage(span, [johnVerse(3, 'NKO'), johnVerse(4, 'KO')]);
  assert.deepEqual(text.split('\n'), [
    "John 5:3-4 (English numbering) — Greek; Strong's numbers per STEPBible",
    'John 5:3',
    '1. En  G1722  In [the]  Ἐν',
    'John 5:4',
    'Not in the Nestlé-Aland text; shown from the traditional text.',
    '1. En  G1722  In [the]  Ἐν',
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
  const span = spanOf(passage.value, () => ({ first: 1, last: 40 }));
  assert.ok(span.ok);
  return span.value;
};

const verses = (from: number, to: number, original = 'א'): PassageVerse[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    ref: verseAt(1, from + i),
    words: [word({ original })],
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
  const lines = formatPassage(spanOfText('Ruth 1:1-12'), verses(1, 12)).split('\n');
  assert.equal(lines.filter((l) => /^Ruth 1:\d+$/.test(l)).length, 10);
  assert.equal(lines.at(-1), 'truncated — call get_original again with "Ruth 1:11-12"');
  const exact = formatPassage(spanOfText('Ruth 1:1-10'), verses(1, 10));
  assert.ok(!exact.includes('truncated'));
});

void test('a passage stops before the verse that would pass the character cap', () => {
  // Each verse block is about 850 characters: two fit under 2000 with the header and the continuation line,
  // three do not.
  const wide = 'א'.repeat(850);
  const text = formatPassage(spanOfText('Ruth 1:1-3'), verses(1, 3, wide));
  assert.ok(text.includes('\nRuth 1:1\n'));
  assert.ok(text.includes('\nRuth 1:2\n'));
  assert.ok(!text.includes('\nRuth 1:3\n'));
  assert.ok(text.endsWith('truncated — call get_original again with "Ruth 1:3"'));
  const first = formatPassage(spanOfText('Ruth 1:1-3'), verses(1, 3, 'א'.repeat(2500)));
  assert.ok(first.includes('\nRuth 1:1\n'));
  assert.ok(first.endsWith('"Ruth 1:2-3"'));
});

void test('a cut passage leaves room for its continuation line', () => {
  for (let size = 600; size <= 1000; size += 5) {
    const text = formatPassage(spanOfText('Ruth 1:1-3'), verses(1, 3, 'א'.repeat(size)));
    assert.ok(text.length <= 2000, `${size}: ${text.length}`);
  }
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
  assert.match(description, /truncated — call get_original again with "Ruth 1:7-12"/);
});

void test('morphology adds the raw code after the gloss and name, before the original', () => {
  const text = formatVerse(
    johnRef,
    [
      greek({
        position: 3,
        transliteration: 'ēn',
        strong: 'G1510',
        gloss: 'was',
        original: 'ἦν',
        morphRaw: 'V-IAI-3S',
      }),
      greek({ position: 4, isProperName: true, nameKind: 'person', morphRaw: 'N-GSM-P' }),
      greek({ position: 5, morphRaw: 'G1 + G2' }),
    ],
    true,
  );
  assert.deepEqual(text.split('\n').slice(1), [
    '3. ēn  G1510  was  V-IAI-3S  ἦν',
    '4. En  G1722  In [the]  [name: person]  N-GSM-P  Ἐν',
    '5. En  G1722  In [the]  G1 + G2  Ἐν',
  ]);
});

void test('Hebrew morphology is shown as the source gives it, an empty code as a dash', () => {
  assert.equal(
    formatVerse(ref('eng'), [word({ position: 1 }), word({ position: 2, morphRaw: '' })], true),
    [
      "Ruth 1:2 (English numbering) — Hebrew, read right to left; Strong's numbers per STEPBIBLE".replace(
        'STEPBIBLE',
        'STEPBible',
      ),
      '1. va.Yehi  H1961  and/ he was  HC/Vqw3ms  וַיְהִי',
      '2. va.Yehi  H1961  and/ he was  —  וַיְהִי',
    ].join('\n'),
  );
});

void test('morphology is off by default, in a verse and in a passage', () => {
  const words = [word({})];
  assert.equal(formatVerse(ref('eng'), words), formatVerse(ref('eng'), words, false));
  assert.doesNotMatch(formatVerse(ref('eng'), words), /Vqw3ms/);
  const span = spanOfText('Ruth 1:2-3');
  const passageVerses: PassageVerse[] = [{ ref: ref('eng'), words }];
  assert.doesNotMatch(formatPassage(span, passageVerses), /Vqw3ms/);
  assert.match(formatPassage(span, passageVerses, true), /and\/ he was {2}HC\/Vqw3ms {2}וַיְהִי/);
});

void test('the morphology input is an optional boolean', () => {
  assert.ok(inputSchema.safeParse({ ref: 'John 1:1' }).success);
  assert.ok(inputSchema.safeParse({ ref: 'John 1:1', morphology: true }).success);
  assert.ok(!inputSchema.safeParse({ ref: 'John 1:1', morphology: 'yes' }).success);
});
