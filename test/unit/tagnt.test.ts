import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseText, isNestleAland, parseTagntLine, type TagntWord } from '../../src/ingest/tagnt.ts';

const row = (ref: string, greek: string, strongMorph: string, rest: Partial<Record<number, string>> = {}) => {
  const cols = [
    ref,
    greek,
    'gloss',
    strongMorph,
    'λήμμα=lemma gloss',
    'NA28',
    '',
    '',
    'es',
    'sub',
    '#01',
    'G0000',
  ];
  for (const [i, v] of Object.entries(rest)) cols[Number(i)] = v ?? '';
  return [...cols, '', '', '', '', ''].join('\t');
};

const parse = (line: string): TagntWord => {
  const r = parseTagntLine(line);
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.value !== null);
  return r.value;
};

void test('a plain word: reference, text type, original, transliteration, Strong and morphology', () => {
  const w = parse(row('Jhn.1.1#01=NKO', 'Ἐν (En)', 'G1722=PREP', { 2: 'In [the]', 4: 'ἐν=in/on/among' }));
  assert.deepEqual(
    [w.book, w.chapter, w.verse, w.hebChapter, w.hebVerse, w.position, w.textType],
    ['John', 1, 1, 1, 1, 1, 'NKO'],
  );
  assert.deepEqual([w.original, w.transliteration, w.gloss], ['Ἐν', 'En', 'In [the]']);
  assert.deepEqual(
    [w.strong, w.strongBase, w.strongRaw, w.morph, w.morphRaw],
    ['G1722', 'G1722', 'G1722', 'PREP', 'PREP'],
  );
  assert.deepEqual([w.lemma, w.lemmaGloss], ['ἐν', 'in/on/among']);
  assert.deepEqual([w.prefixes, w.suffixes, w.conjoined], [[], [], false]);
  assert.deepEqual([w.nameId, w.isProperName, w.nameKind], [null, false, null]);
});

void test('a sense letter stays in the key and not in the base', () => {
  const w = parse(row('Mat.1.1#03=NKO', 'Ἰησοῦ (Iēsou)', 'G2424G=N-GSM-P'));
  assert.deepEqual([w.strong, w.strongBase, w.morph], ['G2424G', 'G2424', 'N-GSM-P']);
});

void test('a five-digit number is kept whole', () => {
  const w = parse(row('Mat.1.1#01=NKO', 'x (x)', 'G20447=N-NSM'));
  assert.deepEqual([w.strong, w.strongBase], ['G20447', 'G20447']);
});

void test('a compound word takes its first part and keeps the others in suffixes', () => {
  const w = parse(row('Mat.2.8#19=NKO', 'κἀγὼ (kagō)', 'G1473=P-1NS + G2532=CONJ'));
  assert.deepEqual([w.strong, w.morph], ['G1473', 'P-1NS']);
  assert.deepEqual(w.suffixes, ['G2532']);
  assert.deepEqual([w.strongRaw, w.morphRaw], ['G1473 + G2532', 'P-1NS + CONJ']);
  assert.equal(w.lemma, 'λήμμα');
});

void test('the lemma column splits on the first equals sign only', () => {
  const w = parse(
    row('Mat.4.6#26=NKO', 'μήποτε (mēpote)', 'G3361=PRT-N + G4218=PRT', { 4: 'μήποτε=lest + πότε=when' }),
  );
  assert.deepEqual([w.lemma, w.lemmaGloss], ['μήποτε', 'lest + πότε=when']);
});

void test('a second numbering in braces, brackets or parentheses is ignored', () => {
  for (const ref of ['Mat.15.6{15.5}#01=k', 'Mat.15.6[15.5]#01=k', 'Mat.15.6(15.5)#01=k']) {
    const w = parse(row(ref, 'καὶ (kai)', 'G2532=CONJ'));
    assert.deepEqual(
      [w.chapter, w.verse, w.hebChapter, w.hebVerse, w.position, w.textType],
      [15, 6, 15, 6, 1, 'k'],
    );
  }
});

void test('word types are kept verbatim', () => {
  for (const type of ['NKO', 'N(k)O', 'no', 'K', 'k', '(k)O']) {
    assert.equal(parse(row(`Jhn.1.1#01=${type}`, 'x (y)', 'G1722=PREP')).textType, type);
  }
});

void test('name kinds come from the last morphology segment', () => {
  const kind = (morph: string) => parse(row('Mat.1.1#01=NKO', 'x (y)', `G0001=${morph}`)).nameKind;
  assert.equal(kind('N-NSM-P'), 'person');
  assert.equal(kind('N-NSF-L'), 'place');
  assert.equal(kind('N-NSF-LI'), 'place');
  assert.equal(kind('N-NPM-PG'), 'gentilic');
  assert.equal(kind('N-NSF-LG'), 'gentilic');
  for (const other of ['N-ASM-T', 'N-NSM', 'N-GSM-C', 'N-GSM-S', 'PREP'])
    assert.equal(kind(other), null, other);
  assert.equal(parse(row('Mat.1.1#01=NKO', 'x (y)', 'G0001=N-NSM-P')).isProperName, true);
  assert.equal(parse(row('Mat.1.1#01=NKO', 'x (y)', 'G0001=N-ASM-T')).isProperName, false);
});

const id = (sub: string) => parse(row('Mat.1.1#01=NKO', 'x (y)', 'G2424G=N-GSM-P', { 9: sub })).nameId;

void test('the name id is the part after the last bar and the arrow', () => {
  assert.equal(id('Jesus»Jesus|Jesus@Mat.1.1'), 'Jesus@Mat.1.1');
  assert.equal(id('Abraham»Abraham|Abraham@Gen.11.26'), 'Abraham@Gen.11.26');
  assert.equal(id('Jacob»Jacob@Mat.1.15-'), 'Jacob@Mat.1.15-');
  assert.equal(id('Christ»Christ'), null);
  assert.equal(id('to be'), null);
});

void test('headers, blanks and comment lines are not data', () => {
  for (const line of ['', '#_Reference\tGreek', 'TAGNT Mat-Jhn - Translators', '\t====', '=====']) {
    const r = parseTagntLine(line);
    assert.ok(r.ok);
    assert.equal(r.value, null, line);
  }
});

const bad = (line: string) => {
  const r = parseTagntLine(line);
  assert.ok(!r.ok, line);
  return r.error.reason;
};

void test('data-looking lines that cannot be read are issues, not silent drops', () => {
  assert.equal(bad('Mat.1.1\tx'), 'malformed reference');
  assert.equal(bad(row('Zzz.1.1#01=NKO', 'x (y)', 'G0001=PREP')), 'unknown book code Zzz');
  assert.equal(bad(row('Mat.1.1#01=NKO', 'no translit', 'G0001=PREP')), 'malformed word column');
  assert.equal(bad(row('Mat.1.1#01=NKO', 'x (y)', 'H0001=PREP')), 'malformed Strong/morphology column');
  assert.equal(
    bad(row('Mat.1.1#01=NKO', 'x (y)', 'G0001=PREP + junk')),
    'malformed Strong/morphology column',
  );
});

void test('isNestleAland is true for N and n anywhere in the type', () => {
  for (const t of ['NKO', 'N(k)O', 'no', 'n', 'NO']) assert.ok(isNestleAland(t), t);
  for (const t of ['K', 'k', 'KO', 'ko', 'O', '(k)O']) assert.ok(!isNestleAland(t), t);
});

const w = (textType: string, position: number) => ({ textType, position });

void test('base text keeps the Nestlé-Aland words of a verse', () => {
  assert.deepEqual(baseText([w('NKO', 1), w('k', 2), w('no', 3), w('K', 4), w('O', 5)]), [
    w('NKO', 1),
    w('no', 3),
  ]);
});

void test('a verse without Nestlé-Aland words falls back to its traditional words', () => {
  assert.deepEqual(baseText([w('KO', 1), w('o', 2), w('k', 3)]), [w('KO', 1), w('k', 3)]);
});

void test('a verse with neither keeps all of its words, and an empty verse stays empty', () => {
  assert.deepEqual(baseText([w('O', 1), w('o', 2)]), [w('O', 1), w('o', 2)]);
  assert.deepEqual(baseText([]), []);
});
