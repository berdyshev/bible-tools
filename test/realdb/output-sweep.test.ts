import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { BibleRepo } from '../../src/data/repo.ts';
import { openDb } from '../../src/data/db.ts';
import { BOOKS } from '../../src/domain/books.ts';
import { VERSION_IDS } from '../../src/domain/versions.ts';
import { getOriginal } from '../../src/tools/get-original.ts';
import { getTranslation } from '../../src/tools/get-translation.ts';
import { MAX_CHARS } from '../../src/tools/passage.ts';
import { textOf } from '../helpers/tool-text.ts';

const dbPath = process.env['BIBLE_DB'] ?? fileURLToPath(new URL('../../data/bible.sqlite', import.meta.url));
const skip = existsSync(dbPath) ? false : `no database at ${dbPath}; run pnpm data:fetch && pnpm data:build`;
const repo = skip === false ? createBibleRepo(openDb(dbPath)) : null;

// Verses whose word list alone, with the continuation line, passes the budget: the first verse of a call is
// always shown whole, so these calls are longer.
const LONG_VERSES = new Set([
  '2 Kings 16:15-20',
  '2 Chronicles 22:11-12',
  'Ezra 3:8-13',
  'Esther 3:12-15',
  'Esther 8:9-17',
  'Jeremiah 21:7-14',
  'Daniel 5:23-31',
]);

const CONTINUATION_RE = /\ntruncated — call \w+ again with "([^"]+)"$/;

/**
 * Calls `call` on every chapter and follows each continuation; returns the call count and the calls longer
 * than the budget.
 */
const sweep = (call: (ref: string, r: BibleRepo) => string): { calls: number; over: string[] } => {
  assert.ok(repo);
  let calls = 0;
  const over: string[] = [];
  for (const book of BOOKS) {
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      let ref: string | undefined = `${book.name} ${chapter}`;
      while (ref !== undefined) {
        const text = call(ref, repo);
        calls++;
        if (text.length > MAX_CHARS) over.push(ref);
        ref = CONTINUATION_RE.exec(text)?.[1];
      }
    }
  }
  return { calls, over };
};

for (const version of VERSION_IDS) {
  void test(`every get_translation ${version} chunk of every chapter fits the budget`, { skip }, () => {
    const { calls, over } = sweep((ref, r) => textOf(getTranslation.call({ ref, version }, r)));
    assert.ok(calls > 1189, `${calls} calls`);
    assert.deepEqual(over, []);
  });
}

void test(
  'every get_original chunk of every chapter fits the budget, except single long verses',
  { skip },
  () => {
    const { calls, over } = sweep((ref, r) => {
      const result = getOriginal.call({ ref }, r);
      assert.notEqual(result.isError, true, ref);
      return textOf(result);
    });
    assert.ok(calls > 1189, `${calls} calls`);
    assert.deepEqual(over, [...LONG_VERSES]);
  },
);
