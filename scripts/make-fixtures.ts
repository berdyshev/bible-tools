// Writes the test excerpt (Ruth) of the STEPBible data from data/raw/ into test/fixtures/raw/.
// Usage: node scripts/make-fixtures.ts   (requires pnpm data:fetch first)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTahotLine } from '../src/ingest/tahot.ts';

const RAW = fileURLToPath(new URL('../data/raw/', import.meta.url));
const OUT = fileURLToPath(new URL('../test/fixtures/raw/', import.meta.url));

const lines = (name: string): string[] => {
  const all = readFileSync(`${RAW}${name}`, 'utf8').split('\n');
  return all.at(-1) === '' ? all.slice(0, -1) : all;
};
const write = (name: string, content: readonly string[]): void => {
  writeFileSync(`${OUT}${name}`, `${content.join('\n')}\n`);
  console.log(`${name}  ${content.length} lines`);
};

mkdirSync(OUT, { recursive: true });

// TAHOT: the licence/field-description header (everything before the first word line) plus all of Ruth.
const WORD_RE = /^\w{3}\.\d+\.\d+#/;
const tahot = lines('TAHOT-Jos-Est.txt');
const firstWord = tahot.findIndex((l) => WORD_RE.test(l));
const ruth = tahot.filter((l) => l.startsWith('Rut.') && WORD_RE.test(l));
write('TAHOT-Ruth.txt', [...tahot.slice(0, firstWord), ...ruth]);

// TBESH: complete, so every sense of a number and every prefix/suffix tag resolves.
write('TBESH.txt', lines('TBESH.txt'));

// TIPNR: name rows whose dStrong is the root of a word in Ruth, each preceded by the section header that sets its category.
const ruthStrongs = new Set<string>();
for (const line of ruth) {
  const parsed = parseTahotLine(line);
  const strong = parsed.ok ? parsed.value?.strong : null;
  if (typeof strong === 'string') ruthStrongs.add(strong);
}
const SECTION_RE = /^\$=+\s*(PERSON|PLACE|OTHER)/;
const NAME_RE = /^[^\s–$#@\t][^\t=]*@[^\t=]*=(H\d{4}[A-Za-z]?)\t/;
const tipnr: string[] = [];
let section = '';
let emitted = '';
for (const line of lines('TIPNR.txt')) {
  if (SECTION_RE.test(line)) {
    section = line;
    continue;
  }
  const dstrong = NAME_RE.exec(line)?.[1];
  if (dstrong === undefined || !ruthStrongs.has(dstrong)) continue;
  if (section !== emitted) tipnr.push(section);
  emitted = section;
  tipnr.push(line);
}
write('TIPNR.txt', tipnr);
