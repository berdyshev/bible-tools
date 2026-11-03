import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { DatabaseNotFoundError, openDb } from '../../src/data/db.ts';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { VerseRef, Versification } from '../../src/domain/ref.ts';
import { parseRef } from '../../src/domain/ref.ts';
import { createSchema, load } from '../../src/ingest/load.ts';
import { buildFixtureDbFile, fixtureDb } from '../helpers/fixture-db.ts';

const repo = createBibleRepo(fixtureDb());

// Consonants only: the pointing of the source text is irrelevant to these assertions.
const consonants = (s: string | null | undefined): string => (s ?? '').replace(/[^\u05D0-\u05EA/ ]/g, '');

const ref = (text: string, versification: Versification = 'eng'): VerseRef => {
  const parsed = parseRef(text, versification);
  assert.ok(parsed.ok, text);
  return parsed.value;
};

void test('verseWords returns Ruth 1:1 in text order with parsed fields', () => {
  const words = repo.verseWords(ref('Ruth 1:1'));
  assert.deepEqual(
    words.map((w) => w.position),
    Array.from({ length: 19 }, (_, i) => i + 1),
  );
  assert.deepEqual(words[9], {
    book: 'Ruth',
    chapter: 1,
    verse: 1,
    hebChapter: 1,
    hebVerse: 1,
    position: 10,
    textType: 'L',
    hebrew: words[9]?.hebrew,
    transliteration: 'mi./Beit',
    gloss: 'from/ Beth-',
    strongRaw: 'H9006/{H1035G}+',
    strong: 'H1035G',
    strongBase: 'H1035',
    prefixes: ['H9006'],
    suffixes: [],
    conjoined: true,
    morph: 'Npl',
    morphRaw: 'HR/Npl',
    lemma: words[9]?.lemma,
    lemmaGloss: 'Bethlehem',
    nameId: 'Bethlehem@Gen.35.16-Jhn',
    isProperName: true,
    nameKind: 'place',
  });
  assert.equal(consonants(words[9]?.hebrew), 'מ/בית');
  assert.equal(consonants(words[9]?.lemma), 'בית לחם');
  const plain = words[0];
  assert.equal(plain?.conjoined, false);
  assert.equal(plain?.isProperName, false);
  assert.equal(plain?.nameKind, null);
  assert.equal(words[16]?.suffixes[0], 'H9023');
});

void test('verseWords is empty for a verse the text does not contain', () => {
  assert.deepEqual(repo.verseWords(ref('Ruth 1:99')), []);
  assert.deepEqual(repo.verseWords(ref('Gen 1:1')), []);
});

void test('lastVerse is the highest verse of the chapter, 0 when the chapter is absent', () => {
  assert.equal(repo.lastVerse(ref('Ruth 1:1')), 22);
  assert.equal(repo.lastVerse(ref('Ruth 4:1')), 22);
  assert.equal(repo.lastVerse(ref('Gen 1:1')), 0);
});

void test('meta returns stored build values', () => {
  assert.equal(repo.meta('stepbible_commit'), 'fixture');
  assert.equal(repo.meta('absent'), null);
});

void test('nameWords returns only the proper-name words of Ruth 1:2', () => {
  const names = repo.nameWords(ref('Ruth 1:2'));
  assert.deepEqual(
    names.map((w) => [w.position, w.lemmaGloss, w.nameKind]),
    [
      [3, 'Elimelech', 'person'],
      [6, 'Naomi', 'person'],
      [10, 'Mahlon', 'person'],
      [11, 'Chilion', 'person'],
      [12, 'Ephrathite', 'gentilic'],
      [13, 'Bethlehem', 'place'],
      [14, 'Bethlehem', 'place'],
      [15, 'Judah', 'place'],
      [18, 'Moab', 'place'],
    ],
  );
});

void test('senses lists every H7704 sense in file order', () => {
  assert.deepEqual(
    repo.senses('H7704').map((e) => e.strong),
    ['H7704A', 'H7704B', 'H7704G', 'H7704H', 'H7704I', 'H7704M'],
  );
  assert.deepEqual(repo.senses('H9999'), []);
});

void test('lexiconEntry finds the exact key and gives the sense gloss', () => {
  const entry = repo.lexiconEntry('H7704G');
  assert.equal(entry?.gloss, 'land: country');
  assert.equal(entry?.strong, 'H7704G');
  assert.equal(entry?.extendedStrong, 'H7704B');
  assert.equal(entry?.unifiedStrong, 'H7704B');
  assert.equal(entry?.relation, 'a Meaning of');
  assert.equal(consonants(entry?.hebrew), 'שדה');
  assert.equal(entry?.transliteration, 'sa.deh');
  assert.equal(entry?.morph, 'H:N-M');
  assert.ok(entry?.meaning.startsWith(': country/field'));
});

void test('lexiconEntry is exact: a base number or unknown key is not an entry', () => {
  assert.equal(repo.lexiconEntry('H7704'), null);
  assert.equal(repo.lexiconEntry('H7704Z'), null);
});

void test('tipnr returns the first record for a disambiguated key', () => {
  assert.deepEqual(repo.tipnr('H5281'), {
    uniqueName: 'Naomi@Rut.1.2-',
    dstrong: 'H5281',
    category: 'person',
    description: "Woman living before Israel's Monarchy",
  });
  assert.equal(repo.tipnr('H4124G')?.category, 'place');
  assert.equal(repo.tipnr('H7704G'), null);
});

const SAMUEL = [
  [
    '1Sa.20.42(21.1)#01=L',
    'וַ/יָּקָם',
    'and/ he arose',
    'H9001/{H6965B}',
    'Hc/Vqw3ms',
    'H9001=ו=&/{H6965B=קוּם=to arise}',
  ],
  [
    '1Sa.20.42(21.1)#02=L',
    'יְהוֹנָתָן',
    'Jonathan',
    '{H3083H}',
    'HNpm',
    '{H3083H=יְהוֹנָתָן=Jonathan»Jonathan@1Sa.13.2-1Ch}',
  ],
].map(([r = '', hebrew = '', gloss = '', strong = '', morph = '', expanded = '']) =>
  [r, hebrew, 'tr', gloss, strong, morph, '', '', '', '', '', expanded].join('\t'),
);

void test('versification selects English or Hebrew numbering', () => {
  const db = new DatabaseSync(':memory:');
  createSchema(db);
  load(db, { tahot: SAMUEL, tbesh: [], tipnr: [] }, {});
  const samuel = createBibleRepo(db);

  const eng = samuel.verseWords(ref('1 Samuel 20:42'));
  const heb = samuel.verseWords(ref('1 Samuel 21:1', 'heb'));
  assert.equal(eng.length, 2);
  assert.deepEqual(heb, eng);
  assert.deepEqual([eng[0]?.chapter, eng[0]?.verse, eng[0]?.hebChapter, eng[0]?.hebVerse], [20, 42, 21, 1]);
  assert.deepEqual(samuel.verseWords(ref('1 Samuel 21:1')), []);
  assert.deepEqual(samuel.verseWords(ref('1 Samuel 20:42', 'heb')), []);

  assert.deepEqual(
    samuel.nameWords(ref('1 Samuel 21:1', 'heb')).map((w) => w.lemmaGloss),
    ['Jonathan'],
  );
  assert.deepEqual(
    samuel.nameWords(ref('1 Samuel 20:42')).map((w) => w.lemmaGloss),
    ['Jonathan'],
  );
  assert.equal(samuel.lastVerse(ref('1 Samuel 20:1')), 42);
  assert.equal(samuel.lastVerse(ref('1 Samuel 21:1', 'heb')), 1);
  assert.equal(samuel.lastVerse(ref('1 Samuel 21:1')), 0);
  assert.deepEqual(samuel.nameWords(ref('1 Samuel 21:1')), []);
  assert.deepEqual(samuel.nameWords(ref('1 Samuel 20:42', 'heb')), []);
});

const dir = mkdtempSync(join(tmpdir(), 'stepbible-repo-'));
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

void test('openDb opens a database file read-only', () => {
  const db = openDb(buildFixtureDbFile(dir));
  assert.equal(createBibleRepo(db).lexiconEntry('H7704G')?.gloss, 'land: country');
  assert.throws(() => db.exec('DELETE FROM words'), /readonly/i);
  db.close();
});

void test('openDb reports a missing file with the path and the fix', () => {
  const missing = join(dir, 'absent.sqlite');
  assert.throws(
    () => openDb(missing),
    (e) =>
      e instanceof DatabaseNotFoundError &&
      e.path === missing &&
      e.message.includes('run pnpm data:fetch && pnpm data:build') &&
      e.message.includes(missing),
  );
});
