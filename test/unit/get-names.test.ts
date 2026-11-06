import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeBook } from '../../src/domain/books.ts';
import type { NameGroup, NameVerse } from '../../src/domain/names.ts';
import { parsePassage, spanOf } from '../../src/domain/ref.ts';
import type { Span, VerseRef } from '../../src/domain/ref.ts';
import { z } from 'zod/v4';
import { description, formatNames, formatPassageNames, inputSchema } from '../../src/tools/get-names.ts';

const book = normalizeBook('Ruth');
assert.ok(book.ok);
const ref = (versification: VerseRef['versification']): VerseRef => ({
  kind: 'verse',
  book: book.value,
  chapter: 1,
  verse: 2,
  versification,
});

const group = (over: Partial<NameGroup>): NameGroup => ({
  name: 'Naomi',
  strong: 'H5281',
  kind: 'person',
  original: 'נָעֳמִי',
  transliteration: 'no.o.Mi',
  positions: [6],
  note: null,
  ...over,
});

void test('formats one line per name with the Hebrew last', () => {
  assert.deepEqual(
    formatNames(ref('eng'), [
      group({}),
      group({ name: 'Bethlehem', strong: null, kind: 'place', positions: [13, 14], note: 'town' }),
      group({ name: 'LORD', kind: 'other' }),
    ]).split('\n'),
    [
      'Ruth 1:2 (English numbering) — proper names (Hebrew original)',
      '- Naomi  H5281  (person)  no.o.Mi  words 6  נָעֳמִי',
      '- Bethlehem  —  (place)  no.o.Mi  words 13,14 — town  נָעֳמִי',
      '- LORD  H5281  (divine name/title)  no.o.Mi  words 6  נָעֳמִי',
    ],
  );
});

void test('says so when there are no names and names the numbering', () => {
  assert.equal(
    formatNames(ref('heb'), []),
    'Ruth 1:2 (Hebrew numbering) — proper names (Hebrew original)\nNo proper names in this verse.',
  );
});

void test('the description is generic', () => {
  assert.doesNotMatch(description, /german|russian|elberfelder|rbo|name table/i);
  assert.match(description, /does not give forms/);
});

const spanOfText = (input: string, versification: 'eng' | 'heb' = 'eng'): Span => {
  const passage = parsePassage(input, versification);
  assert.ok(passage.ok);
  const span = spanOf(passage.value, () => ({ first: 1, last: 40 }));
  assert.ok(span.ok);
  return span.value;
};

const verse = (n: number, groups: NameGroup[]): NameVerse & { ref: VerseRef } => ({
  ref: { ...ref('eng'), verse: n },
  chapter: 1,
  verse: n,
  groups,
});

void test('a passage lists each name once with verse and word positions, Hebrew last', () => {
  assert.deepEqual(
    formatPassageNames(spanOfText('Ruth 1:2-5'), [
      verse(2, [
        group({ positions: [6] }),
        group({ name: 'Moab', strong: null, kind: 'place', note: 'land' }),
      ]),
      verse(3, []),
      verse(5, [group({ positions: [2, 3] })]),
    ]).split('\n'),
    [
      'Ruth 1:2-5 (English numbering) — proper names (Hebrew original)',
      '- Naomi  H5281  (person)  no.o.Mi  at 1:2 w6; 1:5 w2,3  נָעֳמִי',
      '- Moab  —  (place)  no.o.Mi  at 1:2 w6 — land  נָעֳמִי',
    ],
  );
});

void test('a passage without names says so and names the numbering', () => {
  assert.equal(
    formatPassageNames(spanOfText('Ruth 1:2-3', 'heb'), [verse(2, []), verse(3, [])]),
    'Ruth 1:2-3 (Hebrew numbering) — proper names (Hebrew original)\nNo proper names in this passage.',
  );
});

const long = (n: number): NameVerse & { ref: VerseRef } =>
  verse(n, [group({ name: `Name${n}`, strong: `H${n}`, original: 'א'.repeat(900) })]);

void test('a passage is cut before the verse that would pass 2000 characters', () => {
  const text = formatPassageNames(spanOfText('Ruth 1:1-9'), [long(1), long(2), long(3)]);
  assert.ok(text.includes('Name1'));
  assert.ok(text.includes('Name2'));
  assert.ok(!text.includes('Name3'));
  assert.ok(text.length <= 2100);
  assert.ok(text.endsWith('\ntruncated — call get_names again with "Ruth 1:3-9"'));
  assert.ok(!formatPassageNames(spanOfText('Ruth 1:1-2'), [long(1), long(2)]).includes('truncated'));
});

void test('the first verse is shown even when it alone passes the cap', () => {
  const huge = verse(1, [group({ original: 'א'.repeat(2500) })]);
  const text = formatPassageNames(spanOfText('Ruth 1:1-3'), [
    huge,
    verse(2, [group({ name: 'Other', strong: 'H2' })]),
  ]);
  assert.ok(text.includes('Naomi'));
  assert.ok(!text.includes('Other'));
  assert.ok(text.endsWith('"Ruth 1:2-3"'));
});

void test('the description covers ranges, chapters and the cap', () => {
  assert.match(description, /verse range or chapter/);
  assert.match(description, /Ruth 1:1-5/);
  assert.match(description, /2000 characters/);
  assert.match(description, /truncated — call get_names again with "Ruth 1:7-12"/);
});

void test('the ref description does not claim a verse cap', () => {
  const refSchema = z.toJSONSchema(inputSchema).properties?.['ref'];
  assert.ok(typeof refSchema === 'object');
  assert.match(String(refSchema['description']), /no verse cap/);
  assert.doesNotMatch(String(refSchema['description']), /up to \d+ verses/);
  assert.match(String(refSchema['description']), /2000 characters/);
});
