import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTahotLine } from '../../src/ingest/tahot.ts';

const tab = (...cols: string[]): string => cols.join('\t');

// Literal rows from TAHOT (Ruth 1:1, 1:2, 1 Samuel 20:42).
const WAYEHI = tab(
  'Rut.1.1#01=L',
  'וַ/יְהִ֗י',
  'va/y.Hi',
  'and/ it was',
  'H9001/{H1961}',
  'Hc/Vqw3ms',
  '',
  '',
  'H1961_A',
  '',
  '',
  'H9001=ו=&/{H1961=הָיָה=to be}',
  '',
  '',
  '',
  '',
  '',
);
const BETH = tab(
  'Rut.1.1#10=L',
  'מִ/בֵּ֧ית',
  'mi./Beit',
  'from/ Beth-',
  'H9006/{H1035G}+',
  'HR/Npl',
  '',
  '',
  'H1035G_A',
  '',
  '',
  'H9006=מ=from/{H1035G=בֵּית לֶ֫חֶם=Bethlehem»Bethlehem@Gen.35.16-Jhn}+',
);
const LEHEM = tab(
  'Rut.1.1#11=L',
  'לֶ֣חֶם',
  'Le.chem',
  '-lehem',
  '{H1035G}',
  'HNpl',
  '',
  '',
  'H1035G_b',
  '',
  '',
  '{H1035G=בֵּית לֶ֫חֶם=Bethlehem»Bethlehem@Gen.35.16-Jhn}',
);
const ELIMELECH = tab(
  'Rut.1.2#03=L',
  'אֱֽלִימֶ֡לֶךְ',
  "'eli.Me.lekh",
  '[was] Elimelech',
  '{H0458}',
  'HNpm',
  '',
  '',
  'H0458',
  '',
  '',
  '{H0458=אֱלִימֶ֫לֶךְ=Elimelech»Elimelech@Rut.1.2-}',
);
const WIFE = tab(
  'Rut.1.1#17=L',
  'וְ/אִשְׁתּ֖/וֹ',
  "ve./'ish.T/o",
  'and/ wife/ his',
  'H9002/{H0802H}/H9023',
  'HC/Ncfsc/Sp3ms',
  '',
  '',
  'H0802H',
  '',
  '',
  'H9002=ו=and/{H0802H=אִשָּׁה=: wife»woman:2_wife;_widow}/H9023=Ps3m=his',
);
const SONS = tab(
  'Rut.1.1#19=L',
  'בָנָֽי/ו\\׃',
  'va.Na/v',
  'sons/ his',
  '{H1121A}/H9023\\H9016',
  'HNcmpc/Sp3ms',
  '',
  '',
  'H1121A',
  '',
  '',
  '{H1121A=בֵּן=: child»son:1_child;_son}/H9023=Ps3m=his\\H9016=׃=verseEnd',
);
const HEB_REF = tab(
  '1Sa.20.42(21.1)#01=L',
  'וַ/יָּ֖קָם',
  'va/i.Ya.kom',
  'and/ he arose',
  'H9001/{H6965B}',
  'Hc/Vqw3ms',
  '',
  '',
  'H6965B',
  '',
  '',
  'H9001=ו=&/{H6965B=קוּם=: rise»to arise:1_rise;_get_going}',
);

const word = (line: string) => {
  const r = parseTahotLine(line);
  assert.ok(r.ok);
  assert.notEqual(r.value, null);
  return r.value;
};

void test('prefix + root word: reference, columns and tags', () => {
  const w = word(WAYEHI);
  assert.equal(w?.book, 'Ruth');
  assert.deepEqual([w?.chapter, w?.verse, w?.hebChapter, w?.hebVerse, w?.position], [1, 1, 1, 1, 1]);
  assert.equal(w?.textType, 'L');
  assert.equal(w?.hebrew, 'וַ/יְהִ֗י');
  assert.equal(w?.transliteration, 'va/y.Hi');
  assert.equal(w?.gloss, 'and/ it was');
  assert.equal(w?.strongRaw, 'H9001/{H1961}');
  assert.equal(w?.strong, 'H1961');
  assert.equal(w?.strongBase, 'H1961');
  assert.deepEqual(w?.prefixes, ['H9001']);
  assert.deepEqual(w?.suffixes, []);
  assert.equal(w?.conjoined, false);
  assert.equal(w?.morphRaw, 'Hc/Vqw3ms');
  assert.equal(w?.morph, 'Vqw3ms');
  assert.equal(w?.lemma, 'הָיָה');
  assert.equal(w?.lemmaGloss, 'to be');
  assert.equal(w?.nameId, null);
  assert.equal(w?.isProperName, false);
  assert.equal(w?.nameKind, null);
  assert.ok(w?.expandedRaw.startsWith('H9001=ו=&/'));
});

void test('multi-word name: conjoined tag, place kind, name id', () => {
  const a = word(BETH);
  assert.equal(a?.strong, 'H1035G');
  assert.equal(a?.strongBase, 'H1035');
  assert.equal(a?.conjoined, true);
  assert.deepEqual(a?.prefixes, ['H9006']);
  assert.equal(a?.morph, 'Npl');
  assert.equal(a?.nameKind, 'place');
  assert.equal(a?.isProperName, true);
  assert.equal(a?.lemmaGloss, 'Bethlehem');
  assert.equal(a?.nameId, 'Bethlehem@Gen.35.16-Jhn');

  const b = word(LEHEM);
  assert.equal(b?.conjoined, false);
  assert.equal(b?.morph, 'Npl');
  assert.equal(b?.nameKind, 'place');
  assert.deepEqual(b?.prefixes, []);
});

void test('root-only word: leading Hebrew/Aramaic marker is dropped from morphology', () => {
  const w = word(ELIMELECH);
  assert.equal(w?.morphRaw, 'HNpm');
  assert.equal(w?.morph, 'Npm');
  assert.equal(w?.nameKind, 'person');
  assert.equal(w?.isProperName, true);
  assert.equal(w?.nameId, 'Elimelech@Rut.1.2-');
  assert.equal(w?.lemmaGloss, 'Elimelech');
  assert.equal(w?.position, 3);
  assert.equal(w?.verse, 2);
});

void test('suffix tags and morphology follow the root segment', () => {
  const w = word(WIFE);
  assert.equal(w?.strong, 'H0802H');
  assert.deepEqual(w?.prefixes, ['H9002']);
  assert.deepEqual(w?.suffixes, ['H9023']);
  assert.equal(w?.morph, 'Ncfsc');
  assert.equal(w?.position, 17);
});

void test('punctuation tags after a backslash are not suffixes', () => {
  const w = word(SONS);
  assert.equal(w?.strong, 'H1121A');
  assert.deepEqual(w?.prefixes, []);
  assert.deepEqual(w?.suffixes, ['H9023']);
  assert.equal(w?.morph, 'Ncmpc');
});

void test('bracketed Hebrew reference keeps both numberings', () => {
  const w = word(HEB_REF);
  assert.equal(w?.book, '1Sam');
  assert.deepEqual([w?.chapter, w?.verse], [20, 42]);
  assert.deepEqual([w?.hebChapter, w?.hebVerse], [21, 1]);
  assert.equal(w?.position, 1);
});

void test('a trailing carriage return is ignored', () => {
  const w = word(`${BETH}\r`);
  assert.equal(w?.expandedRaw, 'H9006=מ=from/{H1035G=בֵּית לֶ֫חֶם=Bethlehem»Bethlehem@Gen.35.16-Jhn}+');
  assert.equal(word(`${HEB_REF}\r`)?.expandedRaw, 'H9001=ו=&/{H6965B=קוּם=: rise»to arise:1_rise;_get_going}');
});

void test('multi-digit chapters, verses, positions and bracketed numbers', () => {
  const w = word(tab('Psa.100.10(101.12)#10=L', 'x', 'y', 'z', '{H1961}', 'HVqp'));
  assert.deepEqual([w?.chapter, w?.verse, w?.hebChapter, w?.hebVerse, w?.position], [100, 10, 101, 12, 10]);
});

void test('a conjoined word keeps clean suffix tags', () => {
  const w = word(tab('Rut.1.1#01=L', 'x', 'y', 'z', 'H9002/{H0802H}/H9023+', 'HC/Ncfsc/Sp3ms'));
  assert.equal(w?.conjoined, true);
  assert.deepEqual(w?.suffixes, ['H9023']);
  assert.deepEqual(w?.prefixes, ['H9002']);
});

void test('tags without a braced root have no root strong', () => {
  const w = word(tab('Rut.1.1#01=L', 'x', 'y', 'z', 'H9014', 'HD'));
  assert.equal(w?.strong, null);
  assert.equal(w?.strongBase, null);
  assert.deepEqual(w?.prefixes, []);
  assert.deepEqual(w?.suffixes, []);
  const odd = word(tab('Rut.1.1#01=L', 'x', 'y', 'z', '{Hxyz}', 'HD'));
  assert.equal(odd?.strong, null);
});

void test('morphology is null when the column has no segment for the root', () => {
  const w = word(tab('Rut.1.1#01=L', 'x', 'y', 'z', 'H9001/{H1961}'));
  assert.equal(w?.morph, null);
  assert.equal(w?.isProperName, false);
});

const kind = (morph: string) => word(tab('Rut.1.1#01=L', 'x', 'y', 'z', '{H0001}', morph))?.nameKind;

void test('name kinds follow the root morphology', () => {
  assert.equal(kind('HNpm'), 'person');
  assert.equal(kind('HNpf'), 'person');
  assert.equal(kind('HNpl'), 'place');
  assert.equal(kind('HNg'), 'gentilic');
  assert.equal(kind('HNgmpa'), 'gentilic');
  assert.equal(kind('HNp'), 'other');
  assert.equal(kind('HNpu'), 'other');
  assert.equal(kind('HNcmsa'), null);
  assert.equal(kind('HVqp3ms'), null);
});

void test('missing optional columns yield nulls and empty strings', () => {
  const w = word('Rut.1.1#01=L\tx');
  assert.equal(w?.strongRaw, '');
  assert.equal(w?.strong, null);
  assert.equal(w?.strongBase, null);
  assert.equal(w?.morphRaw, '');
  assert.equal(w?.isProperName, false);
  assert.equal(w?.hebrew, 'x');
  assert.equal(w?.lemma, null);
  assert.equal(w?.lemmaGloss, null);
  assert.equal(w?.gloss, '');
  assert.equal(w?.transliteration, '');
  assert.equal(w?.expandedRaw, '');
  assert.equal(w?.nameId, null);
});

void test('header, comment and blank lines are skipped', () => {
  for (const line of [
    '',
    '=================================================',
    'TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
    '# Rut.1.1 comment',
    'Ref: Eng (+Heb)#Heb.words\tBible reference',
  ]) {
    const r = parseTahotLine(line);
    assert.ok(r.ok, line);
    assert.equal(r.value, null, line);
  }
});

void test('data-like lines that do not parse are issues carrying the line', () => {
  const noWord = parseTahotLine('Rut.1.1\tIn the days when the judges judged');
  assert.ok(!noWord.ok);
  assert.deepEqual(noWord.error, {
    line: 'Rut.1.1\tIn the days when the judges judged',
    reason: 'malformed reference',
  });

  const unknown = parseTahotLine('Xyz.1.1#01=L\tx');
  assert.ok(!unknown.ok);
  assert.deepEqual(unknown.error, { line: 'Xyz.1.1#01=L\tx', reason: 'unknown book code Xyz' });
});
