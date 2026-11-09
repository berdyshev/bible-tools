import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HEB_CHAPTER_VERSES, hebrewToKjv } from '../../scripts/normalize-theword.ts';
import { BOOKS } from '../../src/domain/books.ts';
import { KJV_VERSES } from '../../src/domain/kjv.ts';

const dbPath =
  process.env['STEPBIBLE_DB'] ?? fileURLToPath(new URL('../../data/bible.sqlite', import.meta.url));
const skip = existsSync(dbPath) ? false : `no database at ${dbPath}; run pnpm data:fetch && pnpm data:build`;

void test(
  'the Hebrew-to-KJV table in normalize-theword.ts matches the STEPBible word coordinates',
  { skip },
  () => {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const ot = BOOKS.filter((b) => b.testament === 'OT').map((b) => b.id);
    const rows = db
      .prepare(
        `SELECT DISTINCT book, heb_chapter AS hc, heb_verse AS hv, chapter AS c, MAX(verse, 1) AS v FROM words
       ORDER BY book, hc, hv, c, v`,
      )
      .all();
    const actual = new Map<string, string[]>();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const book = String(row['book']);
      if (!ot.includes(book)) continue;
      const heb = `${book} ${String(row['hc'])}:${String(row['hv'])}`;
      actual.set(heb, [...(actual.get(heb) ?? []), `${String(row['c'])}:${String(row['v'])}`]);
      const chapter = `${book} ${String(row['hc'])}`;
      counts.set(chapter, Math.max(counts.get(chapter) ?? 0, Number(row['hv'])));
    }
    db.close();

    const table = hebrewToKjv();
    const mismatches: string[] = [];
    for (const [heb, kjv] of actual) {
      const identity = heb.split(' ')[1] ?? '';
      const expected = table.get(heb) ?? [identity];
      if (expected.join(',') !== [...new Set(kjv)].join(',')) mismatches.push(`${heb}: db ${kjv.join(',')}`);
    }
    assert.deepEqual(mismatches, []);

    const differing: string[] = [];
    for (const id of ot) {
      const kjv = KJV_VERSES[id] ?? [];
      const chapters = Math.max(
        kjv.length,
        ...[...counts.keys()].filter((k) => k.startsWith(`${id} `)).map((k) => Number(k.split(' ')[1])),
      );
      for (let c = 1; c <= chapters; c++) {
        const heb = counts.get(`${id} ${c}`) ?? 0;
        if (heb !== (kjv[c - 1] ?? 0)) differing.push(`${id} ${c}:${heb}`);
      }
    }
    assert.deepEqual(differing, [...HEB_CHAPTER_VERSES]);
  },
);
