import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Occurrence } from '../../src/data/repo.ts';
import { normalizeBook } from '../../src/domain/books.ts';
import type { VerseRef } from '../../src/domain/ref.ts';
import {
  descriptionParts,
  outputSchema,
  findOccurrences,
  formatOccurrences,
  groupByVerse,
  type OccurrenceView,
  type SenseGroup,
} from '../../src/tools/find-occurrences.ts';
import { createBibleRepo } from '../../src/data/repo.ts';
import { MAX_CHARS } from '../../src/tools/passage.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { textOf } from '../helpers/tool-text.ts';

const ref = (id: string, chapter: number, verse: number): VerseRef => {
  const book = normalizeBook(id);
  assert.ok(book.ok);
  return { kind: 'verse', book: book.value, chapter, verse, versification: 'eng' };
};

const occ = (
  id: string,
  c: number,
  v: number,
  strong: string,
  translit: string,
  original: string,
): Occurrence => ({
  ref: ref(id, c, v),
  position: 1,
  transliteration: translit,
  original,
  strong,
});

void test('groupByVerse folds repeats, keeps distinct forms and separates senses', () => {
  const hits = groupByVerse([
    occ('Ruth', 1, 6, 'H7704G', 'a', 'א'),
    occ('Ruth', 1, 6, 'H7704G', 'b', 'ב'),
    occ('Ruth', 1, 6, 'H7704B', 'a', 'א'),
    occ('Ruth', 1, 7, 'H7704G', 'a', 'א'),
    occ('Ruth', 1, 7, 'H7704G', 'a', 'א'),
  ]);
  assert.deepEqual(
    hits.map((h) => [h.ref.verse, h.strong, h.count, h.forms.map((f) => f.transliteration)]),
    [
      [6, 'H7704G', 2, ['a', 'b']],
      [6, 'H7704B', 1, ['a']],
      [7, 'H7704G', 2, ['a']],
    ],
  );
});

void test('groupByVerse ignores trailing punctuation when comparing forms', () => {
  const hits = groupByVerse([
    occ('Ruth', 1, 1, 'G3056', 'logos', 'λόγος,'),
    occ('Ruth', 1, 1, 'G3056', 'logos', 'λόγος'),
    occ('Ruth', 1, 1, 'G3056', 'logos', 'λόγος.'),
    occ('Ruth', 1, 1, 'G3056', 'logou', 'λόγου·'),
  ]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.count, 4);
  assert.deepEqual(hits[0]?.forms, [
    { transliteration: 'logos', original: 'λόγος' },
    { transliteration: 'logou', original: 'λόγου' },
  ]);
});

const group = (strong: string, gloss: string, hits: SenseGroup['hits']): SenseGroup => ({
  strong,
  gloss,
  hits,
  count: hits.reduce((n, h) => n + h.count, 0),
});

const view = (over: Partial<OccurrenceView>): OccurrenceView => ({
  strong: 'H7704',
  scopeLabel: 'the Old Testament',
  versification: 'eng',
  total: 0,
  verses: 0,
  bySense: false,
  groups: [],
  omitted: 0,
  nextScope: null,
  ...over,
});

void test('formatOccurrences lists books on their own lines with Hebrew last and senses as sub-headings', () => {
  const g = group('H7704G', 'land: country', [
    {
      ref: ref('Ruth', 1, 6),
      strong: 'H7704G',
      count: 2,
      forms: [
        { transliteration: 'a', original: 'א' },
        { transliteration: 'b', original: 'ב' },
      ],
    },
    { ref: ref('Ruth', 2, 3), strong: 'H7704G', count: 1, forms: [{ transliteration: 'a', original: 'א' }] },
    { ref: ref('1Sam', 4, 1), strong: 'H7704G', count: 1, forms: [{ transliteration: 'c', original: 'ג' }] },
  ]);
  const h = group('H7704B', 'land: soil', [
    { ref: ref('Gen', 2, 5), strong: 'H7704B', count: 1, forms: [{ transliteration: 'd', original: 'ד' }] },
  ]);
  assert.equal(
    formatOccurrences(view({ total: 5, verses: 4, bySense: true, groups: [h, g] })),
    [
      'H7704 in the Old Testament: 5 occurrences in 4 verses (English numbering)',
      'H7704B «land: soil»: 1 occurrence',
      'Genesis 2:5 d — ד',
      'H7704G «land: country»: 4 occurrences',
      'Ruth 1:6 a + b ×2, 2:3 a — א ב',
      '1 Samuel 4:1 c — ג',
    ].join('\n'),
  );
});

void test('formatOccurrences handles the singular, an exact sense, Hebrew numbering and the truncation hint', () => {
  const g = group('H7704G', 'x', [
    { ref: ref('Ruth', 1, 6), strong: 'H7704G', count: 1, forms: [{ transliteration: 'a', original: 'א' }] },
  ]);
  assert.equal(
    formatOccurrences(
      view({
        strong: 'H7704G',
        versification: 'heb',
        total: 1,
        verses: 1,
        groups: [g],
        omitted: 1,
        nextScope: 'Ruth 2',
      }),
    ),
    [
      'H7704G in the Old Testament: 1 occurrence in 1 verse (Hebrew numbering)',
      'Ruth 1:6 a — א',
      'Truncated — 1 more verse; narrow the scope or raise limit, or call again with scope "Ruth 2"',
    ].join('\n'),
  );
  assert.match(
    formatOccurrences(view({ omitted: 5 })),
    /Truncated — 5 more verses; narrow the scope or raise limit$/,
  );
  assert.equal(
    formatOccurrences(view({ strong: 'H7704G', scopeLabel: 'Ruth 3' })),
    'H7704G in Ruth 3: no occurrences (English numbering)',
  );
});

void test('the text is capped at MAX_CHARS by dropping verses and says how to continue', () => {
  const rows = Array.from({ length: 300 }, (_, i) =>
    occ('Ps', 1 + Math.floor(i / 20), 1 + (i % 20), 'H7704G', 'sa.deh', 'שדה'),
  );
  const stub = {
    ...createBibleRepo(fixtureDb()),
    occurrences: () => rows,
  };
  const result = findOccurrences.call({ strong: 'H7704G', limit: 500 }, stub);
  const text = textOf(result);
  assert.ok(text.length <= MAX_CHARS, String(text.length));
  assert.ok(text.length > MAX_CHARS - 200, String(text.length));
  assert.match(text, /^H7704G in the Old Testament: 300 occurrences in 300 verses/);
  assert.match(
    text,
    /\nTruncated — \d+ more verses; narrow the scope or raise limit, or call again with scope "Psalms \d+"$/,
  );
  const shown = text.split('\n')[1]?.split(', ').length ?? 0;
  const omitted = Number(/Truncated — (\d+)/.exec(text)?.[1]);
  assert.equal(shown + omitted, 300);
});

void test('the tool is named, described and documents every input', () => {
  assert.equal(findOccurrences.name, 'find_occurrences');
  assert.equal(findOccurrences.title, 'Occurrences of a word');
  for (const part of Object.values(descriptionParts)) assert.ok(part.length > 40, part);
  for (const field of Object.values(findOccurrences.input.shape)) {
    assert.ok((field.description ?? '').length > 20);
  }
});

const accepts = (input: object) => findOccurrences.input.safeParse({ strong: 'H1', ...input }).success;

void test('input bounds: strong is required and non-empty, limit is 1 to 500', () => {
  assert.ok(!findOccurrences.input.safeParse({ strong: '' }).success);
  assert.ok(accepts({ limit: 1 }) && accepts({ limit: 500 }));
  assert.ok(!accepts({ limit: 0 }) && !accepts({ limit: 501 }) && !accepts({ limit: 2.5 }));
});

void test('a bare number reports each sense with its gloss and count', () => {
  const rows = [
    occ('Ruth', 1, 1, 'H7704B', 'a', 'א'),
    occ('Ruth', 1, 2, 'H7704G', 'b', 'ב'),
    occ('Ruth', 1, 2, 'H7704G', 'c', 'ג'),
  ];
  const repo = { ...createBibleRepo(fixtureDb()), occurrences: () => rows };
  const result = findOccurrences.call({ strong: 'H7704' }, repo);
  assert.deepEqual(outputSchema.parse(result.structuredContent).senses, [
    { strong: 'H7704B', gloss: 'land: soil', count: 1 },
    { strong: 'H7704G', gloss: 'land: country', count: 2 },
  ]);
  assert.match(
    textOf(result),
    /\nH7704B «land: soil»: 1 occurrence\nRuth 1:1 a — א\nH7704G «land: country»: 2 occurrences\n/,
  );
});

void test('limit counts verses across senses and the continuation names the next chapter', () => {
  const rows = [
    occ('Ruth', 1, 1, 'H7704B', 'a', 'א'),
    occ('Ruth', 2, 1, 'H7704B', 'b', 'ב'),
    occ('Ruth', 3, 1, 'H7704G', 'c', 'ג'),
    occ('Ruth', 4, 1, 'H7704G', 'd', 'ד'),
  ];
  const repo = { ...createBibleRepo(fixtureDb()), occurrences: () => rows };
  const result = findOccurrences.call({ strong: 'H7704', limit: 3 }, repo);
  const structured = outputSchema.parse(result.structuredContent);
  assert.deepEqual(
    structured.occurrences.map((o) => o.ref),
    ['Ruth 1:1', 'Ruth 2:1', 'Ruth 3:1'],
  );
  assert.equal(structured.truncated, true);
  assert.match(textOf(result), /Truncated — 1 more verse-sense entry; .*scope "Ruth 4"$/);
});

const senseRepo = (rows: Occurrence[]) => ({ ...createBibleRepo(fixtureDb()), occurrences: () => rows });

void test('by sense, the continuation scope is the earliest omitted verse in text order', () => {
  // Sense B comes first in the listing but its last verse is in chapter 3; sense G's omitted verse is earlier in the text.
  const rows = [
    occ('Ruth', 1, 1, 'H7704B', 'a', 'א'),
    occ('Ruth', 3, 1, 'H7704B', 'b', 'ב'),
    occ('Ruth', 2, 1, 'H7704G', 'c', 'ג'),
    occ('Ruth', 4, 1, 'H7704G', 'd', 'ד'),
  ];
  const text = textOf(findOccurrences.call({ strong: 'H7704', limit: 1 }, senseRepo(rows)));
  assert.match(text, /Truncated — 3 more verse-sense entries; .*scope "Ruth 2"$/);
});

void test('by sense, continuation compares books, then chapters, then verses', () => {
  const rows = [
    occ('Gen', 1, 1, 'H7704B', 'a', 'א'),
    occ('Ruth', 1, 1, 'H7704B', 'b', 'ב'),
    occ('Exod', 5, 1, 'H7704G', 'c', 'ג'),
    occ('Exod', 2, 9, 'H7704G', 'd', 'ד'),
  ];
  const text = textOf(findOccurrences.call({ strong: 'H7704', limit: 1 }, senseRepo(rows)));
  assert.match(text, /scope "Exodus 2"$/);
});

void test('an exact sense still says verses, and continues at the next verse', () => {
  const rows = [occ('Ruth', 1, 1, 'H7704G', 'a', 'א'), occ('Ruth', 2, 1, 'H7704G', 'b', 'ב')];
  const text = textOf(findOccurrences.call({ strong: 'H7704G', limit: 1 }, senseRepo(rows)));
  assert.match(text, /Truncated — 1 more verse; .*scope "Ruth 2"$/);
});
