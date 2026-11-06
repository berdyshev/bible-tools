import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { getVerse } from '../../src/tools/get-verse.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { psalmDb } from '../helpers/psalm-fixture.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

void test('get_verse Ruth 1:1 matches the golden output', () => {
  const result = getVerse.call({ ref: 'Ruth 1:1' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('get_verse.Ruth_1_1.txt', textOf(result));
});

void test('get_verse John 1:1 matches the golden output', () => {
  const result = getVerse.call({ ref: 'John 1:1' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('get_verse.John_1_1.txt', textOf(result));
});

void test('get_verse John 1:1 with morphology matches the golden output', () => {
  const result = getVerse.call({ ref: 'John 1:1', morphology: true }, repo);
  assert.equal(result.isError, undefined);
  const text = textOf(result);
  expectGolden('get_verse.John_1_1.morphology.txt', text);
  assert.match(text, /\n3\. ēn {2}G1510 {2}was {2}V-IAI-3S {2}ἦν\n/);
});

void test('get_verse Ruth 1:1 with morphology shows the Hebrew codes and the default stays plain', () => {
  const plain = textOf(getVerse.call({ ref: 'Ruth 1:1' }, repo));
  const withCodes = textOf(getVerse.call({ ref: 'Ruth 1:1', morphology: true }, repo));
  assert.match(withCodes, /\n1\. va\/y\.Hi {2}H1961 {2}and\/ it was {2}H\S*\/V\S+ {2}\S/);
  assert.equal(textOf(getVerse.call({ ref: 'Ruth 1:1', morphology: false }, repo)), plain);
  assert.doesNotMatch(plain, /Vqw3ms/);
});

void test('a Hebrew numbering request for the New Testament is answered in English numbering', () => {
  const eng = textOf(getVerse.call({ ref: 'John 1:1' }, repo));
  assert.equal(textOf(getVerse.call({ ref: 'John 1:1', versification: 'heb' }, repo)), eng);
  assert.match(eng, /^John 1:1 \(English numbering\) — Greek;/);
});

void test('a New Testament chapter the fixture lacks is an error, a verse past John 1 too', () => {
  assert.equal(failure('John 99:1'), 'John has no chapter 99. Use a chapter from 1 to 21');
  assert.equal(failure('John 1:99'), 'John 1 has no verse 99. Use a verse from 1 to 51');
});

void test('get_verse Ruth 1:1 stays compact', () => {
  assert.ok(textOf(getVerse.call({ ref: 'Ruth 1:1' }, repo)).length < 2000);
});

const failure = (ref: string): string => {
  const result = getVerse.call({ ref }, repo);
  assert.equal(result.isError, true);
  return textOf(result);
};

void test('an unknown book gets a hint listing valid ids', () => {
  assert.match(
    failure('Руфь 1:2'),
    /^Unknown book "Руфь"\. Use English OSIS ids or names: Gen, Exod, Lev, …$/,
  );
});

void test('a chapter out of range gets the valid range', () => {
  assert.equal(failure('Ruth 99:1'), 'Ruth has no chapter 99. Use a chapter from 1 to 4');
});

void test('a verse out of range gets the last verse', () => {
  assert.equal(failure('Ruth 1:99'), 'Ruth 1 has no verse 99. Use a verse from 1 to 22');
});

void test('get_verse Ruth 1:1-3 matches the golden output', () => {
  const result = getVerse.call({ ref: 'Ruth 1:1-3' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('get_verse.Ruth_1_1-3.txt', textOf(result));
});

void test('a short range is grouped by verse under sub-headers', () => {
  const lines = textOf(getVerse.call({ ref: 'Ruth 1:3-4' }, repo)).split('\n');
  assert.equal(
    lines[0],
    "Ruth 1:3-4 (English numbering) — Hebrew, read right to left; Strong's numbers per STEPBible",
  );
  assert.equal(lines[1], 'Ruth 1:3');
  assert.ok(lines.includes('Ruth 1:4'));
  assert.ok(!lines.some((l) => l.startsWith('truncated')));
});

void test('a range over the character cap stops at a verse boundary with the next call', () => {
  const text = textOf(getVerse.call({ ref: 'Ruth 1:1-3' }, repo));
  assert.ok(text.length <= 2000);
  assert.ok(text.endsWith('\ntruncated — call get_verse again with "Ruth 1:2-3"'));
  assert.ok(!text.includes('\nRuth 1:2\n'));
});

void test('a whole chapter returns the first chunk and a continuation to its end', () => {
  const text = textOf(getVerse.call({ ref: 'Ruth 1' }, repo));
  assert.match(text, /^Ruth 1:1-22 \(English numbering\)/);
  assert.ok(text.length <= 2000);
  assert.ok(text.endsWith('truncated — call get_verse again with "Ruth 1:2-22"'));
});

void test('following the continuation hint returns the next verses', () => {
  const text = textOf(getVerse.call({ ref: 'Ruth 1:2-22' }, repo));
  assert.match(text, /^Ruth 1:2-22 /);
  assert.match(text, /\nRuth 1:2\n[^]*\nRuth 1:3\n/);
  assert.ok(text.endsWith('truncated — call get_verse again with "Ruth 1:4-22"'));
});

void test('a range may cross a chapter boundary', () => {
  const text = textOf(getVerse.call({ ref: 'Ruth 1:22-2:2', versification: 'heb' }, repo));
  assert.match(text, /^Ruth 1:22-2:2 \(Hebrew numbering\)/);
  assert.match(text, /\nRuth 2:1\n/);
});

void test('a range past the end of its chapter gets the last verse', () => {
  assert.equal(failure('Ruth 1:20-23'), 'Ruth 1 has no verse 23. Use a verse from 1 to 22');
});

void test('a descending range is refused with a hint', () => {
  assert.equal(
    failure('Ruth 1:5-2'),
    'Range "Ruth 1:5-2" ends before it starts. Use an ascending range, e.g. "Ruth 1:1-5"',
  );
});

void test('a chapter the text does not have is an error', () => {
  assert.equal(failure('Ruth 5'), 'Ruth has no chapter 5. Use a chapter from 1 to 4');
  assert.equal(failure('Gen 1'), 'Genesis 1 has no verse 1. Use a verse from 1 to 0');
});

const psalms = createBibleRepo(psalmDb());

void test('a chapter with a superscription starts at verse 0', () => {
  const text = textOf(getVerse.call({ ref: 'Ps 3' }, psalms));
  assert.match(text, /^Psalms 3:0-2 \(English numbering\)/);
  assert.match(text, /\nPsalms 3:0\n1\. [^\n]+\n/);
  assert.match(text, /\nPsalms 3:1\n/);
  assert.match(text, /\n2\. le\.\/da\.Vid {2}H1732 /);
});

void test('verse 0 is a verse of a chapter that has it and an error elsewhere', () => {
  assert.match(textOf(getVerse.call({ ref: 'Ps 3:0' }, psalms)), /^Psalms 3:0 /);
  assert.equal(failure('Ruth 1:0-2'), 'Ruth 1 has no verse 0. Use a verse from 1 to 22');
  assert.equal(failure('Ruth 1:0'), 'Ruth 1 has no verse 0. Use a verse from 1 to 22');
});
