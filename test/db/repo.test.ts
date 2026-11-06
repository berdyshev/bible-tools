import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { DatabaseNotFoundError, openDb } from '../../src/data/db.ts';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { VerseRef, Versification } from '../../src/domain/ref.ts';
import { parseRef, parseScope } from '../../src/domain/ref.ts';
import type { Scope } from '../../src/domain/ref.ts';
import { parseStrong } from '../../src/domain/strong.ts';
import { createSchema, load } from '../../src/ingest/load.ts';
import { buildFixtureDbFile, fixtureDb } from '../helpers/fixture-db.ts';
import { psalmDb } from '../helpers/psalm-fixture.ts';

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
    original: words[9]?.original,
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
  assert.equal(consonants(words[9]?.original), 'מ/בית');
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

void test('verseBounds is the first and last verse of the chapter, null when the chapter is absent', () => {
  assert.deepEqual(repo.verseBounds(ref('Ruth 1:1')), { first: 1, last: 22 });
  assert.deepEqual(repo.verseBounds(ref('Ruth 4:1')), { first: 1, last: 22 });
  assert.equal(repo.verseBounds(ref('Gen 1:1')), null);
});

void test('verseBounds starts a chapter with a superscription at verse 0', () => {
  const psalms = createBibleRepo(psalmDb());
  assert.deepEqual(psalms.verseBounds(ref('Psalms 3:1')), { first: 0, last: 2 });
  assert.deepEqual(psalms.verseBounds(ref('Psalms 3:1', 'heb')), { first: 1, last: 3 });
  assert.equal(psalms.verseBounds(ref('Psalms 4:1')), null);
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

void test('senses matches a base of any width and never a longer number that starts the same', () => {
  const db = new DatabaseSync(':memory:');
  createSchema(db);
  const ins = db.prepare(
    `INSERT INTO lexicon (estrong, dstrong, relation, ustrong, original, transliteration, morph, gloss,
       meaning_html, meaning)
     VALUES (?, ?, '', ?, '', '', '', ?, '', '')`,
  );
  for (const key of ['G2000', 'G2000A', 'G2000B', 'G20001', 'G20001A', 'G2000A1', 'G3004G']) {
    ins.run(key, key, key, key);
  }
  const lexicon = createBibleRepo(db);
  assert.deepEqual(
    lexicon.senses('G2000').map((e) => e.strong),
    ['G2000', 'G2000A', 'G2000B'],
  );
  assert.deepEqual(
    lexicon.senses('G20001').map((e) => e.strong),
    ['G20001', 'G20001A'],
  );
  assert.deepEqual(lexicon.senses('G200'), []);
});

void test('lexiconEntry finds the exact key and gives the sense gloss', () => {
  const entry = repo.lexiconEntry('H7704G');
  assert.equal(entry?.gloss, 'land: country');
  assert.equal(entry?.strong, 'H7704G');
  assert.equal(entry?.extendedStrong, 'H7704B');
  assert.equal(entry?.unifiedStrong, 'H7704B');
  assert.equal(entry?.relation, 'a Meaning of');
  assert.equal(consonants(entry?.original), 'שדה');
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
].map(([r = '', original = '', gloss = '', strong = '', morph = '', expanded = '']) =>
  [r, original, 'tr', gloss, strong, morph, '', '', '', '', '', expanded].join('\t'),
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
  assert.equal(samuel.verseBounds(ref('1 Samuel 20:1'))?.last, 42);
  assert.equal(samuel.verseBounds(ref('1 Samuel 21:1', 'heb'))?.last, 1);
  assert.equal(samuel.verseBounds(ref('1 Samuel 21:1')), null);
  assert.deepEqual(samuel.nameWords(ref('1 Samuel 21:1')), []);
  assert.deepEqual(samuel.nameWords(ref('1 Samuel 20:42', 'heb')), []);
});

const occ = (strong: string, scope: string, versification: Versification = 'eng') => {
  const s = parseStrong(strong);
  const sc = parseScope(scope, versification);
  assert.ok(s.ok && sc.ok);
  return repo.occurrences(s.value, sc.value, versification);
};
const where = (strong: string, scope: string) =>
  occ(strong, scope).map((o) => `${o.ref.chapter}:${o.ref.verse}#${o.position}`);

void test('occurrences of an exact sense in a book come in text order with their fields', () => {
  const rows = occ('H7704G', 'Ruth');
  assert.equal(rows.length, 16);
  assert.deepEqual(
    rows.map((o) => `${o.ref.chapter}:${o.ref.verse}`),
    [
      '1:1',
      '1:2',
      '1:6',
      '1:6',
      '1:22',
      '2:2',
      '2:3',
      '2:3',
      '2:6',
      '2:8',
      '2:9',
      '2:17',
      '2:22',
      '4:3',
      '4:3',
      '4:5',
    ],
  );
  assert.deepEqual(rows[0], {
    ref: { kind: 'verse', book: rows[0]?.ref.book, chapter: 1, verse: 1, versification: 'eng' },
    position: 14,
    transliteration: 'bi/s.Dei',
    original: rows[0]?.original,
    strong: 'H7704G',
  });
  assert.equal(rows[0]?.ref.book.id, 'Ruth');
  assert.equal(consonants(rows[0]?.original), 'ב/שדי');
});

void test('occurrences in a chapter or the whole OT are narrowed by the scope', () => {
  assert.deepEqual(where('H7704G', 'Ruth 2'), [
    '2:2#8',
    '2:3#4',
    '2:3#10',
    '2:6#13',
    '2:8#11',
    '2:9#2',
    '2:17#2',
    '2:22#15',
  ]);
  assert.equal(occ('H7704G', 'OT').length, 16);
  assert.equal(occ('H7704G', 'Gen').length, 0);
  assert.equal(occ('H7704G', 'Ruth 3').length, 0);
});

void test('a bare number matches the same words as the sense that occurs; other senses do not match', () => {
  const bare = occ('H7704', 'Ruth');
  assert.deepEqual(bare, occ('H7704G', 'Ruth'));
  assert.equal(bare.length, 16);
  assert.ok(bare.every((o) => o.strong === 'H7704G'));
  assert.equal(occ('H7704B', 'Ruth').length, 0);
  assert.equal(occ('H7704Z', 'Ruth').length, 0);
});

const scope = (text: string, v: Versification): Scope => {
  const s = parseScope(text, v);
  assert.ok(s.ok);
  return s.value;
};

void test('occurrences are numbered and scoped by the requested versification', () => {
  const db = new DatabaseSync(':memory:');
  createSchema(db);
  load(db, { tahot: SAMUEL, tbesh: [], tipnr: [] }, {});
  const samuel = createBibleRepo(db);
  const strong = parseStrong('H3083H');
  assert.ok(strong.ok);
  const eng = samuel.occurrences(strong.value, scope('1Sam 20', 'eng'), 'eng');
  assert.deepEqual(
    eng.map((o) => [o.ref.chapter, o.ref.verse, o.ref.versification]),
    [[20, 42, 'eng']],
  );
  const heb = samuel.occurrences(strong.value, scope('1Sam 21', 'heb'), 'heb');
  assert.deepEqual(
    heb.map((o) => [o.ref.chapter, o.ref.verse, o.ref.versification]),
    [[21, 1, 'heb']],
  );
  assert.deepEqual(samuel.occurrences(strong.value, scope('1Sam 21', 'eng'), 'eng'), []);
});

const keys = (query: string, language?: 'hebrew' | 'greek', limit = 50) =>
  repo.searchLexicon(query, language, limit).map((e) => e.strong);

void test('searchLexicon ranks whole-word gloss matches before meaning-only matches', () => {
  const found = keys('field', 'hebrew');
  assert.deepEqual(found.slice(0, 2), ['H1250B', 'H1251']);
  assert.ok(found.includes('H7704M'));
  assert.ok(found.includes('H7704G'));
  const glossHits = repo
    .searchLexicon('field', 'hebrew', 50)
    .filter((e) => /\bfield\b/i.test(e.gloss))
    .map((e) => e.strong);
  assert.deepEqual(found.slice(0, glossHits.length), glossHits);
  assert.ok(found.indexOf('H7704G') >= glossHits.length);
});

void test('searchLexicon prefers whole words to substrings and ignores case', () => {
  const found = repo.searchLexicon('FIELD', 'hebrew', 50);
  assert.deepEqual(found, repo.searchLexicon('field', 'hebrew', 50));
  const whole = found.findIndex((e) => /\bfields?\b/i.test(e.gloss));
  assert.equal(whole, 0);
  const partial = repo.searchLexicon('countr', undefined, 50);
  assert.ok(partial.some((e) => e.strong === 'H7704G'));
});

void test('searchLexicon honours the limit, the language and empty queries', () => {
  assert.equal(keys('field', 'hebrew', 3).length, 3);
  assert.deepEqual(keys('field', 'hebrew', 3), keys('field', 'hebrew').slice(0, 3));
  const greek = keys('field', 'greek');
  assert.ok(greek.length > 0 && greek.every((k) => k.startsWith('G')));
  assert.ok(greek.includes('G0068G'));
  const both = keys('field');
  assert.ok(both.some((k) => k.startsWith('H')) && both.some((k) => k.startsWith('G')));
  assert.deepEqual(keys('   '), []);
  assert.deepEqual(keys('zzzzqqq'), []);
});

void test('searchLexicon treats the query as text, not as a pattern', () => {
  assert.deepEqual(keys('%', 'hebrew'), []);
  assert.deepEqual(keys('.*', 'hebrew'), []);
  // Some Greek meanings really contain ".*"; only those may match.
  const literal = repo.searchLexicon('.*', 'greek', 50);
  assert.ok(literal.every((e) => (e.gloss + e.meaning).toLowerCase().includes('.*')));
  assert.deepEqual(keys("'; DROP TABLE lexicon; --"), []);
  assert.equal(repo.lexiconEntry('H7704G')?.strong, 'H7704G');
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
