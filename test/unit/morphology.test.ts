import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMorphologyCodes } from '../../src/ingest/morphology.ts';

const HEADER = [
  'Some intro line',
  'line 1: Codes + expansion\t- before the marker; not data',
  'AC\tFunction=Conjunction ',
  '\tConjunction',
  '$',
  'FULL MORPHOLOGY CODES:',
  '================',
  'These codes are used in the tagged texts.',
  'line 1: Codes + expansion\t- explained in the header',
  '$',
];

// Literal blocks from TEHMC and TEGMC.
const HEBREW = [
  'HVqw3ms\tFunction=Verb ; Stem=Qal (hence Action=Simple; Voice=Active); Form=Consecutive Imperfect',
  '\t"Verb : Qal (Simple, Active) Consecutive Imperfect (Past/present Indicative) Third Singular Masculine"',
  '\t"performing an ACTION OR ACTIVITY that is done, in the past or present by a male person or thing being discussed"',
  '\tExample: he/it did or does rise',
  '$',
];
const GREEK = [
  'V-AAI-3S\tFunction=Verb; Tense=Aorist; Voice=Active; Mood=Indicative; Person=3rd; Number=Singular',
  '\tVerb Aorist Active Indicative 3rd Singular ',
  '\tan ACTION that happened - by a person or thing being discussed ',
  '\t"_he/she/it taught _"',
  '$',
];

const parse = (lines: readonly string[], language: 'hebrew' | 'greek' = 'greek') =>
  parseMorphologyCodes([...HEADER, ...lines], language);

void test('a Hebrew entry: code, parsing, summary, meaning and example without quotes or label', () => {
  assert.deepEqual(parse(HEBREW, 'hebrew'), [
    {
      code: 'HVqw3ms',
      language: 'hebrew',
      parsing: 'Function=Verb ; Stem=Qal (hence Action=Simple; Voice=Active); Form=Consecutive Imperfect',
      summary:
        'Verb : Qal (Simple, Active) Consecutive Imperfect (Past/present Indicative) Third Singular Masculine',
      meaning:
        'performing an ACTION OR ACTIVITY that is done, in the past or present by a male person or thing being discussed',
      example: 'he/it did or does rise',
    },
  ]);
});

void test('a Greek entry is trimmed and keeps its underscores', () => {
  const [entry] = parse(GREEK);
  assert.equal(entry?.code, 'V-AAI-3S');
  assert.equal(entry?.language, 'greek');
  assert.equal(entry?.summary, 'Verb Aorist Active Indicative 3rd Singular');
  assert.equal(entry?.meaning, 'an ACTION that happened - by a person or thing being discussed');
  assert.equal(entry?.example, '_he/she/it taught _');
});

void test('nothing before the FULL MORPHOLOGY CODES line is an entry, and the header block is skipped', () => {
  assert.deepEqual(parse([]), []);
  assert.deepEqual(parseMorphologyCodes([...HEADER.slice(0, 5), ...HEBREW], 'hebrew'), []);
});

void test('entries missing lines get empty strings', () => {
  const [entry] = parse(['AC\tFunction=Conjunction ', '\tConjunction', '$']);
  assert.deepEqual(
    [entry?.parsing, entry?.summary, entry?.meaning, entry?.example],
    ['Function=Conjunction', 'Conjunction', '', ''],
  );
  const [bare] = parse(['AC\tFunction=Conjunction', '$']);
  assert.deepEqual([bare?.summary, bare?.meaning, bare?.example], ['', '', '']);
});

void test('extra columns on the first line are ignored', () => {
  const [entry] = parse(['A-APF\tFunction=Adjective\tGroup#1\tmore', '\tAdjective Accusative', '$']);
  assert.equal(entry?.parsing, 'Function=Adjective');
});

void test('lines that follow the three detail lines without a tab do not belong to the entry', () => {
  const [entry] = parse([...GREEK.slice(0, 4), '\f', 'V-AAI-3S\t-1\tVerb', '\tstray', '$']);
  assert.equal(entry?.example, '_he/she/it taught _');
  assert.equal(parse([...GREEK.slice(0, 4), 'S-2PGSF\tKJV', '\tstray', '$']).length, 1);
});

void test('the first entry of a repeated code wins', () => {
  const second = ['V-AAI-3S\tFunction=Other', '\tOther', '$'];
  const entries = parse([...GREEK, ...second]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.summary, 'Verb Aorist Active Indicative 3rd Singular');
});

void test('the last entry may lack its closing line, and carriage returns are ignored', () => {
  const last = parse([
    ...GREEK,
    'X-NSN\tFunction=Indefinite pronoun',
    '\tIndefinite pronoun\r',
    '\tmeaning\r',
  ]);
  assert.deepEqual(
    last.map((e) => [e.code, e.summary, e.meaning]),
    [
      [
        'V-AAI-3S',
        'Verb Aorist Active Indicative 3rd Singular',
        'an ACTION that happened - by a person or thing being discussed',
      ],
      ['X-NSN', 'Indefinite pronoun', 'meaning'],
    ],
  );
});

void test('blocks that do not start with a code are skipped', () => {
  const junk = ['"1 CODE"\tGroup#1\tspecific Function', '\tx', '$', '', 'prose without a tab', '$'];
  assert.deepEqual(
    parse([...junk, ...GREEK]).map((e) => e.code),
    ['V-AAI-3S'],
  );
});
