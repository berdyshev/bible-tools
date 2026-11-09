import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBibleRepo } from '../../src/data/repo.ts';
import { openDb } from '../../src/data/db.ts';
import { KJV_LINES } from '../../src/domain/kjv.ts';
import { VERSION_IDS } from '../../src/domain/versions.ts';
import { getTranslation } from '../../src/tools/get-translation.ts';
import { textOf } from '../helpers/tool-text.ts';

const dbPath =
  process.env['STEPBIBLE_DB'] ?? fileURLToPath(new URL('../../data/bible.sqlite', import.meta.url));
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
    repo.translations().map((t) => t.version),
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
