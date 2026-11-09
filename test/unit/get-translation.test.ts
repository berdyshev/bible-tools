import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { BibleRepo, TranslationMeta, TranslationVerse } from '../../src/data/repo.ts';
import { parsePassage, spanOf, type Span } from '../../src/domain/ref.ts';
import { kjvBounds } from '../../src/domain/kjv.ts';
import { formatTranslation, getTranslation, inputSchema } from '../../src/tools/get-translation.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

const META: TranslationMeta = {
  version: 'rst',
  label: 'RST',
  title: 'Russian Synodal',
  language: 'rus',
  licence: 'public domain',
  attribution: 'test',
  bracketMeaning: 'words added by the translators',
  hasNotes: false,
};

const spanFor = (ref: string): Span => {
  const passage = parsePassage(ref);
  assert.ok(passage.ok);
  const span = spanOf(passage.value, kjvBounds(passage.value.book));
  assert.ok(span.ok);
  return span.value;
};

const verse = (chapter: number, v: number, text: string, nativeRef: string | null = null) =>
  ({ chapter, verse: v, text, nativeRef }) satisfies TranslationVerse;

void test('the header names the span, the version, KJV numbering and the bracket legend', () => {
  const text = formatTranslation(spanFor('Num 13:1-2'), META, [verse(13, 1, 'a'), verse(13, 2, 'b')]);
  assert.equal(
    text,
    [
      'Numbers 13:1-2 — RST (Russian Synodal), KJV numbering; [..] = words added by the translators',
      '13:1 a',
      '13:2 b',
    ].join('\n'),
  );
});

void test('the legend lists only the markers the version uses', () => {
  const span = spanFor('Ruth 1:1');
  const first = (meta: TranslationMeta) => formatTranslation(span, meta, []).split('\n')[0];
  assert.equal(first({ ...META, bracketMeaning: null }), 'Ruth 1:1 — RST (Russian Synodal), KJV numbering');
  assert.equal(
    first({ ...META, hasNotes: true }),
    'Ruth 1:1 — RST (Russian Synodal), KJV numbering; [..] = words added by the translators; ⸨..⸩ = note',
  );
  assert.equal(
    first({ ...META, bracketMeaning: null, hasNotes: true }),
    'Ruth 1:1 — RST (Russian Synodal), KJV numbering; ⸨..⸩ = note',
  );
});

void test("the version's own number ends the line, a verse it lacks is a dash", () => {
  const text = formatTranslation(spanFor('Num 13:1-3'), META, [
    verse(13, 1, 'И сказал', '13:2'),
    verse(13, 3, 'И послал', '13:3-4'),
  ]);
  assert.deepEqual(text.split('\n').slice(1), [
    '13:1 И сказал  [RST 13:2]',
    '13:2 —',
    '13:3 И послал  [RST 13:3-4]',
  ]);
});

void test('a single verse the version lacks is a dash, not an error', () => {
  assert.equal(formatTranslation(spanFor('Acts 8:37'), META, []).split('\n')[1], '8:37 —');
});

void test('a passage stops after ten verses with the call for the rest', () => {
  const rows = Array.from({ length: 22 }, (_, i) => verse(1, i + 1, `v${i + 1}`));
  const lines = formatTranslation(spanFor('Ruth 1'), META, rows).split('\n');
  assert.equal(lines.length, 12);
  assert.equal(lines[10], '1:10 v10');
  assert.equal(lines[11], 'truncated — call get_translation again with "Ruth 1:11-22"');
});

void test('a passage stops before the verse that would pass the character cap, inside a range', () => {
  const long = 'x'.repeat(900);
  const rows = [verse(1, 2, long), verse(1, 3, long), verse(1, 4, long)];
  const text = formatTranslation(spanFor('Ruth 1:2-4'), META, rows);
  assert.ok(text.length <= 2000, `${text.length}`);
  assert.ok(text.endsWith('\n1:3 ' + long + '\ntruncated — call get_translation again with "Ruth 1:4"'));
});

void test('the first verse is shown even when it alone passes the character cap', () => {
  const text = formatTranslation(spanFor('Ruth 1:1-2'), META, [verse(1, 1, 'x'.repeat(2500))]);
  assert.match(text, /\n1:1 x{2500}\ntruncated — call get_translation again with "Ruth 1:2"$/);
});

void test('a range across chapters labels each verse with its chapter', () => {
  const text = formatTranslation(spanFor('Ruth 1:22-2:1'), META, [verse(1, 22, 'a'), verse(2, 1, 'b')]);
  assert.deepEqual(text.split('\n').slice(1), ['1:22 a', '2:1 b']);
});

const failure = (ref: string, version: 'kjv' | 'rst' = 'kjv'): string => {
  const result = getTranslation.call({ ref, version }, repo);
  assert.equal(result.isError, true);
  return textOf(result);
};

void test('reference errors get the same hints as get_original, with KJV verse counts', () => {
  assert.match(
    failure('Руфь 1:1'),
    /^Unknown book "Руфь"\. Use English OSIS ids or names: Gen, Exod, Lev, …$/,
  );
  assert.equal(failure('Ruth 9:1'), 'Ruth has no chapter 9. Use a chapter from 1 to 4');
  assert.equal(failure('Ruth 1:99'), 'Ruth 1 has no verse 99. Use a verse from 1 to 22');
  assert.equal(failure('3John 1:15'), '3 John 1 has no verse 15. Use a verse from 1 to 14');
  assert.equal(
    failure('Ruth 1:5-2'),
    'Range "Ruth 1:5-2" ends before it starts. Use an ascending range, e.g. "Ruth 1:1-5"',
  );
});

void test('KJV numbering accepts verses NRSV lacks and has no Psalm verse 0', () => {
  assert.equal(getTranslation.call({ ref: '2Cor 13:14', version: 'kjv' }, repo).isError, undefined);
  assert.equal(failure('Ps 3:0'), 'Psalms 3 has no verse 0. Use a verse from 1 to 8');
  assert.match(textOf(getTranslation.call({ ref: 'Ps 3', version: 'rst' }, repo)), /^Psalms 3:1-8 .*\n3:1 /);
});

void test('an unknown version is rejected with every id listed', () => {
  const parsed = inputSchema.safeParse({ ref: 'Ruth 1:1', version: 'niv' });
  assert.ok(!parsed.success);
  const message = parsed.error.issues[0]?.message ?? '';
  for (const id of ['kjv', 'darby', 'elb1905', 'ohienko', 'rst'])
    assert.match(message, new RegExp(`"${id}"`));
});

void test('a database without the version is an internal error', () => {
  const empty: BibleRepo = { ...repo, translations: () => [] };
  const original = console.error;
  console.error = () => {};
  try {
    const result = getTranslation.call({ ref: 'Ruth 1:1', version: 'kjv' }, empty);
    assert.equal(result.isError, true);
    assert.match(textOf(result), /^Internal error while running get_translation/);
  } finally {
    console.error = original;
  }
});
