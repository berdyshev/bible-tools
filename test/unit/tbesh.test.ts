import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTbeshLine } from '../../src/ingest/tbesh.ts';

const tab = (...cols: string[]): string => cols.join('\t');

// Literal rows from TBESH.
const MAIN = tab(
  'H0376',
  'H0376G =',
  'H0376G',
  'אִישׁ',
  'ish',
  'H:N-M',
  'man',
  ': man<br>1) man<br>1a) man, male (in contrast to woman, female)<br>1b) husband',
);
const SENSE = tab(
  'H7704b',
  'H7704G = a Meaning of',
  'H7704B',
  'שָׂדֶה',
  'sa.deh',
  'H:N-M',
  'land: country',
  ': country/field<br>1) field, land<br>1a) open field, country',
);

const entry = (line: string) => {
  const r = parseTbeshLine(line);
  assert.ok(r.ok);
  assert.notEqual(r.value, null);
  return r.value;
};

void test('main entry: columns map one-to-one and the relation is empty', () => {
  const e = entry(MAIN);
  assert.equal(e?.estrong, 'H0376');
  assert.equal(e?.dstrong, 'H0376G');
  assert.equal(e?.relation, '');
  assert.equal(e?.ustrong, 'H0376G');
  assert.equal(e?.hebrew, 'אִישׁ');
  assert.equal(e?.transliteration, 'ish');
  assert.equal(e?.morph, 'H:N-M');
  assert.equal(e?.gloss, 'man');
});

void test('sense entry: relation text, upper-cased extended Strong', () => {
  const e = entry(SENSE);
  assert.equal(e?.estrong, 'H7704B');
  assert.equal(e?.dstrong, 'H7704G');
  assert.equal(e?.relation, 'a Meaning of');
  assert.equal(e?.ustrong, 'H7704B');
  assert.equal(e?.gloss, 'land: country');
});

void test('meaning keeps the HTML and a plain-text version', () => {
  const e = entry(SENSE);
  assert.equal(e?.meaningHtml, ': country/field<br>1) field, land<br>1a) open field, country');
  assert.equal(e?.meaning, ': country/field\n1) field, land\n1a) open field, country');
});

void test('HTML stripping handles self-closing breaks, entities and trailing spaces', () => {
  const line = tab('H0001', 'H0001G =', 'H0001G', 'a', 'b', 'c', 'd', 'x &nbsp;y <i>it</i> <BR/>z <br />\tw');
  const e = entry(line);
  assert.equal(e?.meaning, 'x  y it\nz\n\tw');
  assert.equal(e?.meaningHtml, 'x &nbsp;y <i>it</i> <BR/>z <br />\tw');
});

void test('a trailing carriage return is ignored', () => {
  const e = entry(`${MAIN}\r`);
  assert.equal(e?.meaning.slice(-11), '1b) husband');
});

void test('missing trailing columns become empty strings', () => {
  const e = entry('H0001\tH0001G =');
  assert.equal(e?.estrong, 'H0001');
  assert.equal(e?.ustrong, '');
  assert.equal(e?.hebrew, '');
  assert.equal(e?.transliteration, '');
  assert.equal(e?.morph, '');
  assert.equal(e?.gloss, '');
  assert.equal(e?.meaningHtml, '');
  assert.equal(e?.meaning, '');
});

const parsed = (col: string) => {
  const e = entry(tab('H0001', col, 'H0001G'));
  return [e?.dstrong, e?.relation];
};

const plain = (html: string) => entry(tab('H0001', 'H0001G =', 'H0001G', 'a', 'b', 'c', 'd', html))?.meaning;

void test('the dStrong column tolerates spacing and a missing relation', () => {
  assert.deepEqual(parsed('H0001'), ['H0001', '']);
  assert.deepEqual(parsed('H0001 ='), ['H0001', '']);
  assert.deepEqual(parsed('H0001G=x'), ['H0001G', 'x']);
  assert.deepEqual(parsed('H0001G   =   a Part of  '), ['H0001G', 'a Part of']);
  assert.deepEqual(parsed('H0001G = a Part of'), ['H0001G', 'a Part of']);
});

void test('plain text drops tags, trims, and removes whitespace before line breaks', () => {
  assert.equal(plain('  <b>x</b>  '), 'x');
  assert.equal(plain('a  \t<br>b'), 'a\nb');
  assert.equal(plain('<br>x<BR>'), 'x');
});

void test('header and prose lines are skipped', () => {
  for (const line of ['', 'eStrong\tdStrong = Unified', 'H\tx', 'Some prose\tH0001\tx', 'G0001\tG0001 =']) {
    const r = parseTbeshLine(line);
    assert.ok(r.ok, line);
    assert.equal(r.value, null, line);
  }
});

void test('a Strong row with an unreadable dStrong column is an issue', () => {
  for (const col of ['oops', 'see H0001G', '']) {
    const line = tab('H0001', col, 'H0001G');
    const r = parseTbeshLine(line);
    assert.ok(!r.ok, col);
    assert.deepEqual(r.error, { line, reason: 'malformed dStrong column' });
  }
});
