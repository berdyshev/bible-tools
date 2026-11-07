import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { BibleRepo } from '../../src/data/repo.ts';
import { openDb } from '../../src/data/db.ts';
import { BOOKS } from '../../src/domain/books.ts';
import { explainMorphology, resolveMorphology } from '../../src/tools/explain-morphology.ts';
import { findOccurrences, outputSchema } from '../../src/tools/find-occurrences.ts';
import { getNames } from '../../src/tools/get-names.ts';
import { getVerse } from '../../src/tools/get-verse.ts';
import { lookupStrong, outputSchema as strongOutput } from '../../src/tools/lookup-strong.ts';
import { MAX_CHARS } from '../../src/tools/passage.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { textOf } from '../helpers/tool-text.ts';

const dbPath =
  process.env['STEPBIBLE_DB'] ?? fileURLToPath(new URL('../../data/bible.sqlite', import.meta.url));
const skip = existsSync(dbPath) ? false : `no database at ${dbPath}; run pnpm data:fetch && pnpm data:build`;

const idList = (testament: 'OT' | 'NT'): string =>
  BOOKS.filter((b) => b.testament === testament)
    .map((b) => `'${b.id}'`)
    .join(', ');

const summary = (r: BibleRepo) =>
  r.senses('H7704').map((s) => ({ strong: s.strong, original: s.original, gloss: s.gloss }));

const full = skip === false ? openDb(dbPath) : null;
const repo = full === null ? null : createBibleRepo(full);

const scalar = (sql: string): number => {
  assert.ok(full);
  const value = Object.values(full.prepare(sql).get() ?? {})[0];
  assert.equal(typeof value, 'number', sql);
  return typeof value === 'number' ? value : -1;
};

const words = (text: string) =>
  text
    .split('\n')
    .slice(1)
    .map((line) => line.replace(/^\d+\. /, ''));

// English 1 Samuel 20:42 is Hebrew 20:42 followed by Hebrew 21:1, so the latter is its tail.
void test('Hebrew 1Sam 21:1 is the tail of English 1Sam 20:42', { skip }, () => {
  assert.ok(repo);
  const eng = words(textOf(getVerse.call({ ref: '1Sam 20:42' }, repo)));
  const heb = words(textOf(getVerse.call({ ref: '1Sam 21:1', versification: 'heb' }, repo)));
  assert.ok(heb.length > 0 && heb.length < eng.length);
  assert.deepEqual(eng.slice(-heb.length), heb);
  assert.match(heb[0] ?? '', /^va\/i\.Ya\.kom {2}H6965B /);
});

void test('the H7704 senses match the fixture database', { skip }, () => {
  assert.ok(repo);
  const expected = summary(createBibleRepo(fixtureDb()));
  assert.ok(expected.length > 1);
  assert.deepEqual(summary(repo), expected);
});

void test('the database holds the whole text at the pinned data revision', { skip }, () => {
  assert.ok(full);
  assert.ok(repo);
  const count = scalar(`SELECT COUNT(*) FROM words WHERE book IN (${idList('OT')})`);
  assert.ok(count > 300_000 && count < 310_000, `unexpected Old Testament word count ${count}`);

  const script = readFileSync(
    fileURLToPath(new URL('../../scripts/fetch-stepbible.ts', import.meta.url)),
    'utf8',
  );
  const pinned = /DEFAULT_COMMIT = '([0-9a-f]{40})'/.exec(script)?.[1];
  assert.notEqual(pinned, undefined);
  assert.equal(repo.meta('stepbible_commit'), pinned);
});

void test('find_occurrences counts the whole OT like a direct count of the word table', { skip }, () => {
  assert.ok(full);
  assert.ok(repo);
  const row = full.prepare("SELECT COUNT(*) AS n FROM words WHERE strong = 'H7704G'").get();
  const expected = typeof row?.['n'] === 'number' ? row['n'] : -1;
  assert.ok(expected > 0);
  const result = findOccurrences.call({ strong: 'H7704G', limit: 500 }, repo);
  assert.equal(result.isError, undefined);
  const structured = outputSchema.parse(result.structuredContent);
  assert.equal(structured.total, expected);
  assert.match(textOf(result), new RegExp(`^H7704G in the Old Testament: ${expected} occurrences in `));
  assert.ok(textOf(result).length <= 2000);
});

void test('get_verse on a psalm chapter starts with its superscription at verse 0', { skip }, () => {
  assert.ok(repo);
  const text = textOf(getVerse.call({ ref: 'Ps 3' }, repo));
  assert.match(text, /^Psalms 3:0-8 \(English numbering\)/);
  assert.match(text, /\nPsalms 3:0\n1\. miz\.Mor {2}H4210 /);
  assert.match(text, /\nPsalms 3:1\n/);
});

void test('get_names on a psalm chapter lists David from the superscription', { skip }, () => {
  assert.ok(repo);
  const text = textOf(getNames.call({ ref: 'Ps 3' }, repo));
  assert.match(text, /\n- David {2}H1732 .* at 3:0 w2\b/);
});

void test('a chapter without a verse 0 rejects it', { skip }, () => {
  assert.ok(repo);
  const result = getVerse.call({ ref: 'Ruth 1:0-2' }, repo);
  assert.equal(result.isError, true);
  assert.equal(textOf(result), 'Ruth 1 has no verse 0. Use a verse from 1 to 22');
});

void test('John 1:1 has 17 words, in Greek, in English numbering', { skip }, () => {
  assert.ok(repo);
  const text = textOf(getVerse.call({ ref: 'John 1:1' }, repo));
  assert.match(text, /^John 1:1 \(English numbering\) — Greek; /);
  assert.equal(text.split('\n').length - 1, 17);
  assert.equal(scalar("SELECT COUNT(*) FROM words WHERE book = 'John' AND chapter = 1 AND verse = 1"), 17);
});

void test(
  'the New Testament holds the Nestlé-Aland words plus the fallback verses, nothing else',
  { skip },
  () => {
    const nt = idList('NT');
    const total = scalar(`SELECT COUNT(*) FROM words WHERE book IN (${nt})`);
    const nestle = scalar(
      `SELECT COUNT(*) FROM words WHERE book IN (${nt}) AND (text_type LIKE '%N%' OR text_type LIKE '%n%')`,
    );
    assert.equal(nestle, 137_645);
    assert.equal(total, 138_211);
    assert.equal(
      scalar(
        `SELECT COUNT(*) FROM (SELECT book, chapter, verse FROM words WHERE book IN (${nt}) GROUP BY book, chapter, verse
         HAVING SUM(text_type LIKE '%N%' OR text_type LIKE '%n%') > 0
            AND SUM(NOT (text_type LIKE '%N%' OR text_type LIKE '%n%')) > 0)`,
      ),
      0,
      'a verse mixes Nestlé-Aland and other words',
    );
    assert.equal(
      scalar(
        `SELECT COUNT(*) FROM words WHERE book IN (${nt}) AND (heb_chapter != chapter OR heb_verse != verse)`,
      ),
      0,
    );
  },
);

void test('John 8:7 is shown from the traditional text and says so', { skip }, () => {
  assert.ok(repo);
  const text = textOf(getVerse.call({ ref: 'John 8:7' }, repo));
  assert.match(
    text,
    /^John 8:7 \(English numbering\) — Greek; [^\n]*\nNot in the Nestlé-Aland text; shown from the traditional text\.\n1\. /,
  );
  assert.doesNotMatch(textOf(getVerse.call({ ref: 'John 1:1' }, repo)), /Nestlé/);
  assert.doesNotMatch(textOf(getVerse.call({ ref: 'Ruth 1:1' }, repo)), /Nestlé/);
});

void test('lookup_strong G3056 is cut to the budget but structured keeps the whole meaning', { skip }, () => {
  assert.ok(repo);
  const result = lookupStrong.call({ strong: 'G3056' }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  assert.match(text, /^G3056 {2}\S+ {2}logos {2}\[G:N-M\] {2}«word»\n/);
  assert.ok(text.length <= MAX_CHARS);
  assert.ok(text.endsWith('… (entry shortened)'));
  const meaning = strongOutput.parse(result.structuredContent).entry?.meaning ?? '';
  assert.ok(meaning.length > MAX_CHARS);
  assert.doesNotMatch(meaning, /entry shortened/);
});

void test('find_occurrences G3056 over the whole New Testament equals a direct count', { skip }, () => {
  assert.ok(repo);
  const expected = scalar("SELECT COUNT(*) FROM words WHERE strong_base = 'G3056'");
  assert.ok(expected > 300, `unexpected count ${expected}`);
  const result = findOccurrences.call({ strong: 'G3056', limit: 500 }, repo);
  assert.equal(result.isError, undefined);
  assert.equal(outputSchema.parse(result.structuredContent).total, expected);
  assert.match(textOf(result), new RegExp(`^G3056 in the New Testament: ${expected} occurrences in `));
  assert.ok(textOf(result).length <= MAX_CHARS);
  const inOt = findOccurrences.call({ strong: 'G3056', scope: 'OT' }, repo);
  assert.equal(inOt.isError, true);
  assert.match(textOf(inOt), /^Strong's number "G3056" is Greek and occurs only in the New Testament/);
});

void test('explain_morphology knows V-AAI-3S and the Hebrew forms as get_verse shows them', { skip }, () => {
  assert.ok(repo);
  const greek = explainMorphology.call({ code: 'V-AAI-3S' }, repo);
  assert.equal(greek.isError, undefined);
  assert.match(textOf(greek), /^V-AAI-3S — Verb Aorist Active Indicative 3rd Singular\nParsing: /);
  const shown = textOf(getVerse.call({ ref: 'Ruth 1:1', morphology: true }, repo));
  assert.match(shown, /\n1\. va\/y\.Hi {2}H1961 {2}and\/ it was {2}Hc\/Vqw3ms {2}/);
  assert.match(shown, /\n2\. bi\.\/Mei {2}H3117G {2}in\/ \[the\] days of {2}HR\/Ncmpc {2}/);
  for (const code of ['Hc/Vqw3ms', 'HR/Ncmpc']) {
    const result = explainMorphology.call({ code }, repo);
    assert.equal(result.isError, undefined, code);
    assert.equal(textOf(result).split('\n\n').length, 2, code);
  }
});

void test('every distinct morphology code in the word table resolves, except the empty one', { skip }, () => {
  assert.ok(full);
  assert.ok(repo);
  const rows = full.prepare('SELECT DISTINCT morph_raw AS code FROM words').all();
  assert.ok(rows.length > 4000, `only ${rows.length} distinct codes`);
  const unresolved = rows.map((r) => String(r['code'])).filter((code) => !resolveMorphology(repo, code).ok);
  // 14 placeholder words ("[ ]" Ketiv/Qere slots) have no morphology in the source.
  assert.deepEqual(unresolved, ['']);
  assert.equal(scalar("SELECT COUNT(*) FROM words WHERE morph_raw = ''"), 14);
});

void test('Aramaic compound codes are explained with Aramaic entries', { skip }, () => {
  assert.ok(full);
  assert.ok(repo);
  const haphel = explainMorphology.call({ code: 'AC/Vhp3ms' }, repo);
  assert.equal(haphel.isError, undefined);
  assert.match(textOf(haphel), /\n\nAVhp3ms — Verb : Haphel /);
  assert.doesNotMatch(textOf(haphel), /Hiphil/);
  const peal = explainMorphology.call({ code: 'AR/Vqcc' }, repo);
  assert.match(textOf(peal), /\n\nAVqcc — Verb : Peal /);
  assert.doesNotMatch(textOf(peal), /Qal/);
  assert.match(textOf(explainMorphology.call({ code: 'HC/Vhp3ms' }, repo)), /HVhp3ms — Verb : Hiphil /);

  const aramaic = full
    .prepare("SELECT DISTINCT morph_raw AS code FROM words WHERE morph_raw GLOB 'A*/*'")
    .all()
    .map((r) => String(r['code']));
  assert.ok(aramaic.length > 200, `only ${aramaic.length} Aramaic compounds`);
  for (const code of aramaic) {
    const resolved = resolveMorphology(repo, code);
    assert.ok(resolved.ok, code);
    assert.ok(
      resolved.value.every((e) => e.code.startsWith('A')),
      `${code} resolved to ${resolved.value.map((e) => e.code).join(', ')}`,
    );
  }
});

void test(
  'G3700G, which TAGNT uses and the lexicon lists as G3700, can be looked up and counted',
  { skip },
  () => {
    assert.ok(repo);
    const lookup = lookupStrong.call({ strong: 'G3700G' }, repo);
    assert.equal(lookup.isError, undefined);
    assert.match(textOf(lookup), /^G3700 {2}\S+ {2}\S+ {2}\[G:V\] {2}«to appear»\n/);
    assert.match(textOf(lookup), /\nG3700G has no entry of its own; this is the entry of G3700\./);
    for (const [strong, expected] of [
      ['G3700G', 29],
      ['G3700H', 25],
    ] as const) {
      assert.equal(scalar(`SELECT COUNT(*) FROM words WHERE strong = '${strong}'`), expected);
      const result = findOccurrences.call({ strong, limit: 500 }, repo);
      assert.equal(result.isError, undefined, strong);
      assert.equal(outputSchema.parse(result.structuredContent).total, expected, strong);
    }
  },
);

void test('no lexicon meaning keeps an HTML entity, and G0048 reads with a real ">"', { skip }, () => {
  assert.ok(full);
  assert.equal(
    scalar("SELECT COUNT(*) FROM lexicon WHERE meaning LIKE '%&gt;%' OR meaning LIKE '%&lt;%'"),
    0,
  );
  assert.equal(
    scalar("SELECT COUNT(*) FROM lexicon WHERE meaning LIKE '%&amp;%' OR meaning LIKE '%&quot;%'"),
    0,
  );
  assert.equal(scalar("SELECT COUNT(*) FROM lexicon WHERE meaning GLOB '*&#[0-9]*;*'"), 0);
  assert.equal(scalar("SELECT COUNT(*) FROM lexicon WHERE dstrong = 'G0048' AND meaning LIKE '%(> %'"), 1);
  assert.equal(scalar("SELECT COUNT(*) FROM lexicon WHERE meaning_html LIKE '%&gt;%'"), 3);
});
