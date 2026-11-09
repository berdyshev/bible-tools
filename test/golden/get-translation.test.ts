import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { VersionId } from '../../src/domain/versions.ts';
import { getTranslation } from '../../src/tools/get-translation.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

const call = (ref: string, version: VersionId): string => {
  const result = getTranslation.call({ ref, version }, repo);
  assert.equal(result.isError, undefined, `${ref} ${version}`);
  return textOf(result);
};

const goldens: readonly (readonly [ref: string, version: VersionId])[] = [
  ['Ruth 1:1', 'kjv'],
  ['Ruth 1:1', 'darby'],
  ['Ruth 1:1', 'elb1905'],
  ['Ruth 1:1', 'ohienko'],
  ['Ruth 1:1', 'rst'],
  ['Ruth 2:1-15', 'kjv'],
  ['Num 13:1-3', 'rst'],
  ['Ps 3:1-2', 'rst'],
  ['Rom 16:25', 'rst'],
  ['Lev 6:1', 'elb1905'],
  ['Lev 6:1', 'ohienko'],
  ['Rev 13:1', 'elb1905'],
  ['3John 1:14', 'elb1905'],
  ['Matt 5:22', 'elb1905'],
  ['2Cor 13:12-14', 'darby'],
  ['Num 7', 'darby'],
];

for (const [ref, version] of goldens) {
  void test(`get_translation ${ref} ${version} matches the golden output`, () => {
    expectGolden(
      `get_translation.${ref.replaceAll(' ', '_').replaceAll(':', '_')}.${version}.txt`,
      call(ref, version),
    );
  });
}

void test('RST native numbers are tags at the line end, not markers in the text', () => {
  const text = call('Num 13:1-3', 'rst');
  assert.match(text, /\n13:1 [^\n]*  \[RST 13:2\]\n/);
  assert.doesNotMatch(text, /\(13:\d+\)/);
});

void test('KJV shows added words in brackets and its marginal notes inline', () => {
  const text = call('Ruth 1:1', 'kjv');
  assert.match(text, /; \[\.\.\] = words added by the translators; ⸨\.\.⸩ = note$/m);
  assert.match(text, /⸨[^⸩]+⸩/);
  assert.match(call('Ruth 1:2', 'kjv'), /\[was\]/);
  assert.match(call('Ruth 1:1', 'darby'), /\[[^\]]+\]/);
});

void test('the Elberfelder legend says its brackets are traditional-text readings', () => {
  assert.match(
    call('Matt 5:22', 'elb1905'),
    /\[\.\.\] = readings of the traditional text[^\n]*\n[^\n]*\[ohne Grund\]/,
  );
});

void test('Elberfelder carries its Hebrew and Greek verse numbers', () => {
  assert.match(call('Lev 6:1', 'elb1905'), /  \[Elb1905 5:20\]$/);
  assert.match(call('Rev 13:1', 'elb1905'), /  \[Elb1905 12:18-13:1\]$/);
});

void test('a psalm starts at verse 1 with its title, never at verse 0', () => {
  const lines = call('Ps 3', 'rst').split('\n');
  assert.match(lines[0] ?? '', /^Psalms 3:1-8 /);
  assert.match(lines[1] ?? '', /^3:1 \S/);
  assert.ok(!lines.some((l) => l.startsWith('3:0')));
});

void test('a verse the version lacks is a dash', () => {
  assert.equal(call('Acts 8:37', 'darby').split('\n')[1], '8:37 —');
});

void test('a parenthesis without chapter and verse is text, not a native number', () => {
  const text = call('Judg 16:9', 'rst');
  assert.match(text, /\n16:9 \(Между тем [^\n]*$/);
  assert.doesNotMatch(text, /\[RST /);
});

void test('Num 7 in Darby comes in chunks of at most ten verses that continue to 7:89', () => {
  let ref: string | undefined = 'Num 7';
  const seen: string[] = [];
  for (let calls = 0; ref !== undefined; calls++) {
    assert.ok(calls < 10, 'too many calls');
    const text = call(ref, 'darby');
    assert.ok(text.length <= 2000, `${ref}: ${text.length}`);
    const verses = text.split('\n').filter((l) => /^7:\d+ /.test(l));
    assert.ok(verses.length >= 1 && verses.length <= 10, ref);
    seen.push(...verses.map((l) => l.split(' ')[0] ?? ''));
    ref = /truncated — call get_translation again with "([^"]+)"$/.exec(text)?.[1];
  }
  assert.deepEqual(
    seen,
    Array.from({ length: 89 }, (_, i) => `7:${i + 1}`),
  );
});
