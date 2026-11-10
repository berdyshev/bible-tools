import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBibleRepo } from '../../src/data/repo.ts';
import { openDb } from '../../src/data/db.ts';
import { BOOKS } from '../../src/domain/books.ts';
import { KJV_LINES } from '../../src/domain/kjv.ts';
import { VERSION_IDS } from '../../src/domain/versions.ts';
import { getTranslation } from '../../src/tools/get-translation.ts';
import { textOf } from '../helpers/tool-text.ts';

const dbPath = process.env['BIBLE_DB'] ?? fileURLToPath(new URL('../../data/bible.sqlite', import.meta.url));
const skip = existsSync(dbPath) ? false : `no database at ${dbPath}; run pnpm data:fetch && pnpm data:build`;

const full = skip === false ? openDb(dbPath) : null;
const repo = full === null ? null : createBibleRepo(full);

const scalar = (sql: string, ...params: string[]): number => {
  assert.ok(full);
  const value = Object.values(full.prepare(sql).get(...params) ?? {})[0];
  assert.equal(typeof value, 'number', sql);
  return typeof value === 'number' ? value : -1;
};

void test('all five translations are loaded from their checked modules', { skip }, () => {
  assert.ok(repo);
  assert.deepEqual(
    repo.translations().map((t) => t.id),
    [...VERSION_IDS],
  );
  assert.equal(
    scalar("SELECT count(*) FROM translation_meta WHERE sha256 GLOB '" + '[0-9a-f]'.repeat(64) + "'"),
    5,
  );
});

void test('every translation fills nearly all of the 31 102 KJV verse slots', { skip }, () => {
  for (const version of VERSION_IDS) {
    const stored = scalar('SELECT count(*) FROM translation_verses WHERE version = ?', version);
    assert.ok(stored <= KJV_LINES && stored > KJV_LINES - 200, `${version}: ${stored}`);
  }
  assert.equal(scalar("SELECT count(*) FROM translation_verses WHERE version = 'kjv'"), KJV_LINES);
});

void test('no translation text keeps a tag, an empty text or a note marker outside notes', { skip }, () => {
  assert.equal(scalar("SELECT count(*) FROM translation_verses WHERE text GLOB '*[<>]*'"), 0);
  assert.equal(scalar("SELECT count(*) FROM translation_verses WHERE trim(text) = ''"), 0);
  assert.equal(
    scalar("SELECT count(*) FROM translation_verses WHERE version <> 'kjv' AND text GLOB '*⸨*'"),
    0,
  );
});

void test('the last verse of the Bible is in every translation', { skip }, () => {
  assert.ok(repo);
  for (const version of VERSION_IDS) {
    const text = textOf(getTranslation.call({ ref: 'Rev 22:21', version }, repo));
    assert.match(text, /\n22:21 \S/, version);
  }
});

type NativeRow = { version: string; book: string; chapter: number; verse: number; nativeRef: string };

const nativeRows = (): NativeRow[] => {
  assert.ok(full);
  const order = new Map(BOOKS.map((b, i) => [b.id, i]));
  // Canonical position of a verse: book, then chapter, then verse.
  const place = (r: { book: string; chapter: number; verse: number }): number =>
    (order.get(r.book) ?? 0) * 1_000_000 + r.chapter * 1000 + r.verse;
  return full
    .prepare(
      `SELECT version, book, chapter, verse, native_ref AS nativeRef FROM translation_verses
       WHERE native_ref IS NOT NULL`,
    )
    .all()
    .map((r) => ({
      version: String(r['version']),
      book: String(r['book']),
      chapter: Number(r['chapter']),
      verse: Number(r['verse']),
      nativeRef: String(r['nativeRef']),
    }))
    .toSorted((a, b) => (a.version === b.version ? place(a) - place(b) : a.version < b.version ? -1 : 1));
};

/** First and last native verse of `13:2`, `3:1-2` or `12:18-13:1`, as chapter * 1000 + verse. */
const endpoints = (ref: string): { first: number; last: number } => {
  const [from = '', to] = ref.split('-');
  const [c1, v1] = from.split(':').map(Number);
  const [c2, v2] =
    to === undefined ? [c1, v1] : to.includes(':') ? to.split(':').map(Number) : [c1, Number(to)];
  return { first: (c1 ?? 0) * 1000 + (v1 ?? 0), last: (c2 ?? 0) * 1000 + (v2 ?? 0) };
};

// Places where a version itself repeats a number or runs backwards: RST joins KJV Ps 13:5-6 and 90:5-6
// into one verse each; Ohienko numbers Phil 1:16 and 1:17 the other way round.
const REPEATS = ['rst Ps 13:6 12:6', 'rst Ps 90:6 89:6'];
const BACKWARDS = ['ohienko Phil 1:17 1:16'];

void test('own numbers do not repeat or run backwards within a book, except listed places', { skip }, () => {
  const repeats: string[] = [];
  const backwards: string[] = [];
  let book = '';
  let last = 0;
  const seen = new Set<string>();
  for (const r of nativeRows()) {
    const at = `${r.version} ${r.book} ${r.chapter}:${r.verse} ${r.nativeRef}`;
    if (`${r.version} ${r.book}` !== book) {
      book = `${r.version} ${r.book}`;
      last = 0;
      seen.clear();
    }
    const { first, last: end } = endpoints(r.nativeRef);
    if (!r.nativeRef.includes('-')) {
      if (seen.has(r.nativeRef)) repeats.push(at);
      seen.add(r.nativeRef);
    }
    if (first < last) backwards.push(at);
    last = end;
  }
  assert.deepEqual(repeats, REPEATS);
  assert.deepEqual(backwards, BACKWARDS);
});

void test('no own number equals its KJV slot', { skip }, () => {
  assert.equal(
    scalar("SELECT count(*) FROM translation_verses WHERE native_ref = chapter || ':' || verse"),
    0,
  );
});

void test('Elberfelder shows no verse numbers of its own', { skip }, () => {
  assert.equal(
    scalar("SELECT count(*) FROM translation_verses WHERE version = 'elb1905' AND native_ref IS NOT NULL"),
    0,
  );
});

void test(
  'verses a translation omits come out as their number alone, the psalm hint only for a titled psalm',
  { skip },
  () => {
    assert.ok(repo);
    const call = (ref: string, version: (typeof VERSION_IDS)[number]) =>
      textOf(getTranslation.call({ ref, version }, repo));
    for (const ref of ['Matt 23:14', 'Acts 8:37']) {
      assert.equal(call(ref, 'elb1905').split('\n')[1], ref.split(' ')[1], ref);
    }
    assert.equal(
      scalar("SELECT count(*) FROM translation_verses WHERE text LIKE '%gehört nicht zum ursprünglichen%'"),
      0,
    );
    assert.match(call('Ps 3:0', 'kjv'), /a psalm title is part of verse 1/);
    assert.doesNotMatch(call('Ps 1:0', 'kjv'), /psalm title/);
  },
);
