import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { BibleRepo } from '../../src/data/repo.ts';
import { openDb } from '../../src/data/db.ts';
import { findOccurrences, outputSchema } from '../../src/tools/find-occurrences.ts';
import { getVerse } from '../../src/tools/get-verse.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { textOf } from '../helpers/tool-text.ts';

const dbPath =
  process.env['STEPBIBLE_DB'] ?? fileURLToPath(new URL('../../data/bible.sqlite', import.meta.url));
const skip = existsSync(dbPath) ? false : `no database at ${dbPath}; run pnpm data:fetch && pnpm data:build`;

const summary = (r: BibleRepo) =>
  r.senses('H7704').map((s) => ({ strong: s.strong, hebrew: s.hebrew, gloss: s.gloss }));

const full = skip === false ? openDb(dbPath) : null;
const repo = full === null ? null : createBibleRepo(full);

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
  const row = full.prepare('SELECT COUNT(*) AS n FROM words').get();
  const count = typeof row?.['n'] === 'number' ? row['n'] : 0;
  assert.ok(count > 300_000 && count < 310_000, `unexpected word count ${count}`);

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
