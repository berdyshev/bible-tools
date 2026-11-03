import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeBook } from '../../src/domain/books.ts';
import type { NameGroup } from '../../src/domain/names.ts';
import type { VerseRef } from '../../src/domain/ref.ts';
import { description, formatNames } from '../../src/tools/get-names.ts';

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
  hebrew: 'נָעֳמִי',
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
