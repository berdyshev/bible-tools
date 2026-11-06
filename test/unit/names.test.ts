import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupNames, kindLabel, mergeNames } from '../../src/domain/names.ts';
import type { NameGroup, NameInput, NameKind, NameRecord, NameWord } from '../../src/domain/names.ts';

const word = (position: number, over: Partial<NameWord> = {}): NameWord => ({
  position,
  original: `h${position}`,
  transliteration: `t${position}`,
  gloss: 'g',
  strong: 'H0001',
  conjoined: false,
  lemmaGloss: 'Abel',
  nameKind: 'person',
  ...over,
});

const input = (w: NameWord, record: NameRecord | null = null): NameInput => ({ word: w, record });

void test('merges conjoined parts of one name into a single group', () => {
  const groups = groupNames([
    input(word(13, { strong: 'H1035G', conjoined: true, lemmaGloss: 'Bethlehem', nameKind: 'place' })),
    input(word(14, { strong: 'H1035G', lemmaGloss: 'Bethlehem', nameKind: 'place' })),
  ]);
  assert.deepEqual(groups, [
    {
      name: 'Bethlehem',
      strong: 'H1035G',
      kind: 'place',
      original: 'h13 h14',
      transliteration: 't13 t14',
      positions: [13, 14],
      note: null,
    },
  ]);
});

void test('a name is shown without the punctuation that follows it', () => {
  const groups = groupNames([
    input(word(1, { original: 'Ἰωάννης.', strong: 'G2491G' })),
    input(word(2, { original: 'Ἰσαάκ·', strong: 'G2464', lemmaGloss: 'Isaac' })),
    input(word(3, { original: 'Βηθ,', strong: 'G0001', conjoined: true, lemmaGloss: 'Beth' })),
    input(word(4, { original: 'λεέμ;', strong: 'G0001', lemmaGloss: 'Beth' })),
  ]);
  assert.deepEqual(
    groups.map((g) => g.original),
    ['Ἰωάννης', 'Ἰσαάκ', 'Βηθ λεέμ'],
  );
});

void test('does not merge adjacent words when the first is not conjoined', () => {
  const groups = groupNames([input(word(1)), input(word(2))]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.positions, [1, 2]);
  assert.equal(groups[0]?.original, 'h1');
});

void test('does not merge conjoined words with different Strong numbers', () => {
  const groups = groupNames([
    input(word(1, { conjoined: true, strong: 'H0001', lemmaGloss: 'A' })),
    input(word(2, { strong: 'H0002', lemmaGloss: 'B' })),
  ]);
  assert.deepEqual(
    groups.map((g) => g.name),
    ['A', 'B'],
  );
});

void test('lists a repeated name once with every position, in first-seen order', () => {
  const groups = groupNames([
    input(word(2, { strong: 'H0002', lemmaGloss: 'Moab' })),
    input(word(5, { strong: 'H0003', lemmaGloss: 'Ruth' })),
    input(word(9, { strong: 'H0002', lemmaGloss: 'Moab' })),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.name, g.positions]),
    [
      ['Moab', [2, 9]],
      ['Ruth', [5]],
    ],
  );
});

void test('groups words without a Strong number by name', () => {
  const groups = groupNames([
    input(word(1, { strong: null, lemmaGloss: 'X' })),
    input(word(2, { strong: null, lemmaGloss: 'Y' })),
    input(word(3, { strong: null, lemmaGloss: 'X' })),
  ]);
  assert.deepEqual(
    groups.map((g) => g.positions),
    [[1, 3], [2]],
  );
});

void test('falls back to the last gloss segment when there is no lemma gloss', () => {
  const groups = groupNames([input(word(1, { lemmaGloss: null, gloss: 'and/ Kilion ' }))]);
  assert.equal(groups[0]?.name, 'Kilion');
});

void test('takes the kind from the word, not from the TIPNR category', () => {
  const [group] = groupNames([
    input(word(1, { nameKind: 'place' }), { category: 'person', description: 'Jacob son' }),
  ]);
  assert.equal(group?.kind, 'place');
  assert.equal(group?.note, null);
});

void test('shows the description only when category matches, differs from the name and is no placeholder', () => {
  const note = (record: NameRecord, name = 'Abel'): string | null =>
    groupNames([input(word(1, { lemmaGloss: name }), record)])[0]?.note ?? null;
  assert.equal(note({ category: 'person', description: 'Second son of Adam' }), 'Second son of Adam');
  assert.equal(note({ category: 'place', description: 'Second son of Adam' }), null);
  assert.equal(note({ category: 'person', description: 'Abel' }), null);
  assert.equal(note({ category: 'person', description: 'Abel_1' }, 'Cain'), null);
  assert.equal(note({ category: 'person', description: 'Abel 1' }, 'Cain'), 'Abel 1');
  assert.equal(note({ category: 'person', description: 'Abel_12' }, 'Cain'), null);
  assert.equal(note({ category: 'person', description: 'Abel_1 of Judah' }, 'Cain'), 'Abel_1 of Judah');
  assert.equal(groupNames([input(word(1))])[0]?.note, null);
});

void test('skips words with no kind', () => {
  assert.deepEqual(groupNames([input(word(1, { nameKind: null }))]), []);
});

void test('labels the divine name', () => {
  const kinds: NameKind[] = ['person', 'place', 'gentilic'];
  for (const k of kinds) assert.equal(kindLabel(k), k);
  assert.equal(kindLabel('other'), 'divine name/title');
});

const group = (over: Partial<NameGroup>): NameGroup => ({
  name: 'Naomi',
  strong: 'H5281',
  kind: 'person',
  original: 'h',
  transliteration: 't',
  positions: [1],
  note: null,
  ...over,
});

void test('mergeNames lists a name once per Strong number with every verse it stands in', () => {
  const merged = mergeNames([
    {
      chapter: 1,
      verse: 2,
      groups: [group({ positions: [6] }), group({ name: 'Moab', strong: 'H4124G', kind: 'place' })],
    },
    { chapter: 1, verse: 3, groups: [] },
    { chapter: 1, verse: 8, groups: [group({ positions: [2, 3], original: 'later' })] },
  ]);
  assert.deepEqual(merged, [
    {
      name: 'Naomi',
      strong: 'H5281',
      kind: 'person',
      original: 'h',
      transliteration: 't',
      note: null,
      occurrences: [
        { chapter: 1, verse: 2, positions: [6] },
        { chapter: 1, verse: 8, positions: [2, 3] },
      ],
    },
    {
      name: 'Moab',
      strong: 'H4124G',
      kind: 'place',
      original: 'h',
      transliteration: 't',
      note: null,
      occurrences: [{ chapter: 1, verse: 2, positions: [1] }],
    },
  ]);
});

void test('mergeNames tells apart senses with different Strong numbers and keys by name without one', () => {
  const merged = mergeNames([
    {
      chapter: 2,
      verse: 1,
      groups: [
        group({ name: 'Moab', strong: 'H4124G' }),
        group({ name: 'Moab', strong: 'H4125' }),
        group({ name: 'Boaz', strong: null }),
      ],
    },
    { chapter: 2, verse: 4, groups: [group({ name: 'Boaz', strong: null, positions: [3] })] },
  ]);
  assert.deepEqual(
    merged.map((m) => [m.name, m.strong, m.occurrences.length]),
    [
      ['Moab', 'H4124G', 1],
      ['Moab', 'H4125', 1],
      ['Boaz', null, 2],
    ],
  );
});
