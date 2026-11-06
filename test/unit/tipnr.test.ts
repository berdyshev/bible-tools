import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTipnr } from '../../src/ingest/tipnr.ts';

const tab = (...cols: string[]): string => cols.join('\t');

// Literal rows and section headers from TIPNR.
const PERSON_HEADER = '$========== PERSON(s)';
const PLACE_HEADER = '$==========PLACE';
const OTHER_HEADER = '$==========OTHER';
const CHILION = tab(
  'Chilion@Rut.1.2-=H3630',
  "Man living before Israel's Monarchy",
  'Elimelech@Rut.1.2- + Naomi@Rut.1.2-',
  'Mahlon@Rut.1.2-',
);
const BETHLEHEM = tab('Bethlehem@Gen.35.16-Jhn=H1035G', 'Bethlehem_1', 'Salma@1Ch.2.51-=H8007H');
const MOAB = tab('Moab@Gen.19.37b-Zep=H4124G', 'Moab', 'Moab@Gen.19.37a');
const SUBROW = tab('– Named', 'Aaron@Exo.4.14-Heb', 'H0175«H0175=אַהֲרֹן', 'Aaron', 'Exo.4.14');
const GREEK = tab('Judah@Luk.3.30=G2455J', 'Man living at the time of Divided Monarchy');

function* crlfLines(): Generator<string> {
  yield `${PLACE_HEADER}\r`;
  yield `${MOAB}\r`;
}

void test('rows take the category of the preceding section header', () => {
  const names = parseTipnr([
    '$==========PERSON(s)',
    CHILION,
    PLACE_HEADER,
    BETHLEHEM,
    MOAB,
    OTHER_HEADER,
    tab('YHWH@Gen.2.4=H3068', 'LORD'),
  ]);
  assert.deepEqual(
    names.map((n) => [n.uniqueName, n.dstrong, n.category]),
    [
      ['Chilion@Rut.1.2-', 'H3630', 'person'],
      ['Bethlehem@Gen.35.16-Jhn', 'H1035G', 'place'],
      ['Moab@Gen.19.37b-Zep', 'H4124G', 'place'],
      ['YHWH@Gen.2.4', 'H3068', 'other'],
    ],
  );
});

void test('description is the second column, trimmed', () => {
  const names = parseTipnr([
    PERSON_HEADER,
    CHILION,
    PLACE_HEADER,
    BETHLEHEM,
    tab('Moab@Gen.19.37a=H4124H', ' padded '),
  ]);
  assert.deepEqual(
    names.map((n) => n.description),
    ["Man living before Israel's Monarchy", 'Bethlehem_1', 'padded'],
  );
});

void test('rows before any header default to person; a space after the equals run is accepted', () => {
  const names = parseTipnr([CHILION, OTHER_HEADER, '$===== OTHER', CHILION]);
  assert.deepEqual(
    names.map((n) => n.category),
    ['person', 'other'],
  );
  const person = parseTipnr([OTHER_HEADER, PERSON_HEADER, CHILION]);
  assert.equal(person[0]?.category, 'person');
});

void test('sub-rows, headers and other lines are dropped', () => {
  const names = parseTipnr([
    '',
    'UnifiedName=uStrong\tDescription\tParents',
    '‖==================\t‖==================',
    PERSON_HEADER,
    SUBROW,
    '@Briefest= High Priest',
    '#Summary=H0001\tx',
    '(?) indicates a decision based on an ambiguity e.g. Jahdai@1Ch.2.47(?)\tTinyURL',
    CHILION,
  ]);
  assert.deepEqual(
    names.map((n) => n.uniqueName),
    ['Chilion@Rut.1.2-'],
  );
});

void test('only lines that start at the margin are headers or rows', () => {
  const names = parseTipnr([`x${PLACE_HEADER}`, ` ${MOAB}`, `#${MOAB}`, `@${MOAB}`, MOAB]);
  assert.deepEqual(
    names.map((n) => [n.uniqueName, n.category]),
    [['Moab@Gen.19.37b-Zep', 'person']],
  );
});

void test('accepts any iterable and ignores trailing carriage returns', () => {
  const names = parseTipnr(crlfLines());
  assert.equal(names.length, 1);
  assert.deepEqual(names[0], {
    uniqueName: 'Moab@Gen.19.37b-Zep',
    dstrong: 'H4124G',
    category: 'place',
    description: 'Moab',
  });
});

void test('rows with Greek Strong numbers are kept, with or without a sense letter', () => {
  const names = parseTipnr([
    PERSON_HEADER,
    tab('Andrew@Mat.4.18-Act=G0406', 'Disciple of Jesus'),
    tab('Elizabeth@Luk.1.5-=G1665G', 'Mother of John'),
    GREEK,
  ]);
  assert.deepEqual(
    names.map((n) => [n.uniqueName, n.dstrong, n.category]),
    [
      ['Andrew@Mat.4.18-Act', 'G0406', 'person'],
      ['Elizabeth@Luk.1.5-', 'G1665G', 'person'],
      ['Judah@Luk.3.30', 'G2455J', 'person'],
    ],
  );
  assert.equal(names[0]?.description, 'Disciple of Jesus');
});
