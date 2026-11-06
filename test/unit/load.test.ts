import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createSchema, load } from '../../src/ingest/load.ts';

const tab = (...cols: string[]): string => cols.join('\t');
const pad = (cols: string[]): string[] => [...cols, ...Array.from({ length: 17 - cols.length }, () => '')];

const word = (
  ref: string,
  original: string,
  gloss: string,
  strong: string,
  morph: string,
  expanded: string,
) => tab(...pad([ref, original, 'tr', gloss, strong, morph, '', '', '', '', '', expanded]));

const WAYEHI = word(
  'Rut.1.1#01=L',
  'וַ/יְהִ֗י',
  'and/ it was',
  'H9001/{H1961}',
  'Hc/Vqw3ms',
  'H9001=ו=&/{H1961=הָיָה=to be}',
);
const CHILION = word(
  'Rut.1.2#09=L',
  'וְ/כִלְיוֹן',
  'and/ Kilion',
  'H9002/{H3630}',
  'HC/Npm',
  'H9002=ו=and/{H3630=כִּלְיוֹן=Chilion»Chilion@Rut.1.2-}',
);
const BRACKETED = word(
  '1Sa.20.42(21.1)#01=L',
  'וַ/יָּקָם',
  'and/ he arose',
  'H9001/{H6965B}',
  'Hc/Vqw3ms',
  'H9001=ו=&/{H6965B=קוּם=to arise}',
);
const NO_ROOT_TAG = word('Gen.1.1#01=L', 'x', 'g', 'H9001', 'Hc', '');
const HEADER = 'Rut.1 header: not a word line';
const BAD_BOOK = word('Xyz.1.1#01=L', 'x', 'g', '{H1}', 'N', '');

const SENSE = tab(
  'H7704b',
  'H7704G = a Meaning of',
  'H7704B',
  'שָׂדֶה',
  'sa.deh',
  'H:N-M',
  'land: country',
  ': country/field<br>1) field, land',
);
const MAIN = tab('H0376', 'H0376G =', 'H0376G', 'אִישׁ', 'ish', 'H:N-M', 'man', ': man<br>1) man');

const TIPNR = [
  '$==========PERSON(s)',
  tab('Chilion@Rut.1.2-=H3630', "Man living before Israel's Monarchy", 'x'),
  '$==========PLACE',
  tab('Moab@Gen.19.37-=H4124G', 'Land east of the Dead Sea', 'x'),
  '– Named',
];

function* broken(): Generator<string> {
  yield WAYEHI;
  throw new Error('read failed');
}

const fresh = (): DatabaseSync => {
  const db = new DatabaseSync(':memory:');
  createSchema(db);
  return db;
};

const run = (db: DatabaseSync, tahot: string[], tbesh: string[] = [], tipnr: string[] = []) =>
  load(db, { tahot, tbesh, tipnr }, { stepbible_commit: 'abc' });

const row = (db: DatabaseSync, sql: string) => ({ ...db.prepare(sql).get() });

const scalar = (db: DatabaseSync, sql: string): unknown => Object.values(db.prepare(sql).get() ?? {})[0];

void test('createSchema creates the tables and the Strong index', () => {
  const db = fresh();
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name")
    .all()
    .map((r) => r['name']);
  for (const expected of [
    'words',
    'lexicon',
    'names',
    'meta',
    'idx_words_strong',
    'idx_words_ref',
    'idx_words_href',
  ]) {
    assert.ok(names.includes(expected), expected);
  }
});

void test('load stores words, lexicon rows and names and reports counts', () => {
  const db = fresh();
  const report = run(db, [WAYEHI, CHILION], [MAIN, SENSE], TIPNR);
  assert.deepEqual(report.counts, { words: 2, lexicon: 2, names: 2 });
  assert.deepEqual(report.issues, []);
  assert.equal(scalar(db, 'SELECT count(*) FROM words'), 2);
  assert.equal(scalar(db, "SELECT gloss FROM lexicon WHERE dstrong = 'H7704G'"), 'land: country');
  assert.equal(scalar(db, "SELECT relation FROM lexicon WHERE dstrong = 'H7704G'"), 'a Meaning of');
  assert.equal(scalar(db, "SELECT category FROM names WHERE dstrong = 'H4124G'"), 'place');
});

void test('load maps word fields to columns', () => {
  const db = fresh();
  run(db, [CHILION]);
  assert.deepEqual(row(db, 'SELECT * FROM words'), {
    id: 1,
    book: 'Ruth',
    chapter: 1,
    verse: 2,
    heb_chapter: 1,
    heb_verse: 2,
    position: 9,
    text_type: 'L',
    original: 'וְ/כִלְיוֹן',
    transliteration: 'tr',
    gloss: 'and/ Kilion',
    strong_raw: 'H9002/{H3630}',
    strong: 'H3630',
    strong_base: 'H3630',
    prefixes: '["H9002"]',
    suffixes: '[]',
    conjoined: 0,
    morph_raw: 'HC/Npm',
    morph: 'Npm',
    lemma: 'כִּלְיוֹן',
    lemma_gloss: 'Chilion',
    expanded_raw: 'H9002=ו=and/{H3630=כִּלְיוֹן=Chilion»Chilion@Rut.1.2-}',
    name_id: 'Chilion@Rut.1.2-',
    is_proper_name: 1,
    name_kind: 'person',
  });
});

void test('a bracketed reference stores both English and Hebrew numbering', () => {
  const db = fresh();
  run(db, [BRACKETED]);
  assert.deepEqual(row(db, 'SELECT book, chapter, verse, heb_chapter, heb_verse FROM words'), {
    book: '1Sam',
    chapter: 20,
    verse: 42,
    heb_chapter: 21,
    heb_verse: 1,
  });
});

void test('words without a root tag are stored with null Strong columns', () => {
  const db = fresh();
  run(db, [NO_ROOT_TAG]);
  assert.deepEqual(row(db, 'SELECT strong, strong_base, name_kind, is_proper_name FROM words'), {
    strong: null,
    strong_base: null,
    name_kind: null,
    is_proper_name: 0,
  });
});

void test('headers are skipped and unparsable lines are reported without stopping the load', () => {
  const db = fresh();
  const report = run(db, [HEADER, BAD_BOOK, WAYEHI]);
  assert.equal(report.counts.words, 1);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0]?.line, BAD_BOOK);
});

void test('meta rows are stored', () => {
  const db = fresh();
  load(db, { tahot: [], tbesh: [], tipnr: [] }, { stepbible_commit: 'abc', built_at: 'now' });
  assert.deepEqual(
    db
      .prepare('SELECT key, value FROM meta ORDER BY key')
      .all()
      .map((r) => ({ ...r })),
    [
      { key: 'built_at', value: 'now' },
      { key: 'stepbible_commit', value: 'abc' },
    ],
  );
});

void test('a failure while reading lines rolls the transaction back and rethrows', () => {
  const db = fresh();
  assert.throws(() => load(db, { tahot: broken(), tbesh: [], tipnr: [] }, {}), /read failed/);
  assert.equal(scalar(db, 'SELECT count(*) FROM words'), 0);
  db.exec('BEGIN');
  db.exec('ROLLBACK');
});
