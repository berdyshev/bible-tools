// Writes the test excerpt (Ruth and John 1) of the STEPBible data from data/raw/ into test/fixtures/raw/,
// and an excerpt of each theWord module in data/theword/ into test/fixtures/theword/<version>.tsv.
// Usage: node scripts/make-fixtures.ts   (requires pnpm data:fetch first)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeBook } from '../src/domain/books.ts';
import { kjvBounds, lineIndex } from '../src/domain/kjv.ts';
import { parseManifest } from '../src/ingest/manifest.ts';
import { decodeModule } from '../src/ingest/theword.ts';
import { parseTagntLine } from '../src/ingest/tagnt.ts';
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

// TAGNT: the same header plus all of John 1.
const tagnt = lines('TAGNT-Mat-Jhn.txt');
const firstGreekWord = tagnt.findIndex((l) => WORD_RE.test(l));
const john1 = tagnt.filter((l) => /^Jhn\.1\.\d+#/.test(l));
write('TAGNT-John1.txt', [...tagnt.slice(0, firstGreekWord), ...john1]);

// Lexicons and morphology code tables: complete, so every sense of a number, every prefix/suffix tag and
// every code resolves.
write('TBESH.txt', lines('TBESH.txt'));
write('TBESG.txt', lines('TBESG.txt'));
write('TEHMC.txt', lines('TEHMC.txt'));
write('TEGMC.txt', lines('TEGMC.txt'));

// TIPNR: name rows whose dStrong is the root of a word in Ruth or John 1, each preceded by the section header that sets its category.
const wordStrongs = new Set<string>();
for (const [parse, text] of [
  [parseTahotLine, ruth],
  [parseTagntLine, john1],
] as const) {
  for (const line of text) {
    const parsed = parse(line);
    const strong = parsed.ok ? parsed.value?.strong : null;
    if (typeof strong === 'string') wordStrongs.add(strong);
  }
}
const SECTION_RE = /^\$=+\s*(PERSON|PLACE|OTHER)/;
const NAME_RE = /^[^\s–$#@\t][^\t=]*@[^\t=]*=([HG]\d{4,5}[A-Za-z]?)\t/;
const tipnr: string[] = [];
let section = '';
let emitted = '';
for (const line of lines('TIPNR.txt')) {
  if (SECTION_RE.test(line)) {
    section = line;
    continue;
  }
  const dstrong = NAME_RE.exec(line)?.[1];
  if (dstrong === undefined || !wordStrongs.has(dstrong)) continue;
  if (section !== emitted) tipnr.push(section);
  emitted = section;
  tipnr.push(line);
}
write('TIPNR.txt', tipnr);

// theWord modules: `book chapter verse raw-line` rows for the verses the tests use.
const THEWORD = fileURLToPath(new URL('../data/theword/', import.meta.url));
const THEWORD_OUT = fileURLToPath(new URL('../test/fixtures/theword/', import.meta.url));
const EXCERPT: readonly (readonly [book: string, chapter: number, from?: number, to?: number])[] = [
  ['Ruth', 1],
  ['Ruth', 2],
  ['Ruth', 3],
  ['Ruth', 4],
  ['Lev', 6, 1, 1],
  ['Num', 7],
  ['Num', 13, 1, 3],
  ['Judg', 16, 9, 9],
  ['1Sam', 20, 42, 42],
  ['Ps', 3],
  ['Ps', 23, 1, 1],
  ['Prov', 4, 27, 27],
  ['Mal', 4, 1, 1],
  ['Matt', 5, 22, 22],
  ['Acts', 8, 37, 37],
  ['Acts', 15, 34, 34],
  ['Rom', 16, 25, 25],
  ['2Cor', 13, 12, 14],
  ['3John', 1, 14, 14],
  ['Rev', 12, 17, 17],
  ['Rev', 13, 1, 1],
];
mkdirSync(THEWORD_OUT, { recursive: true });
const manifest = parseManifest(readFileSync(`${THEWORD}MANIFEST.json`, 'utf8'));
for (const entry of manifest.modules) {
  const decoded = decodeModule(readFileSync(`${THEWORD}${entry.file}`), entry.encoding);
  if (!decoded.ok) throw new Error(`${entry.file}: ${decoded.error.found} verse lines`);
  const rows: string[] = [];
  for (const [id, chapter, from, to] of EXCERPT) {
    const book = normalizeBook(id);
    if (!book.ok) throw new Error(`unknown book ${id}`);
    const last = to ?? kjvBounds(book.value)(chapter)?.last ?? 0;
    for (let verse = from ?? 1; verse <= last; verse++) {
      const index = lineIndex(book.value, chapter, verse);
      const line = index === null ? undefined : decoded.value.lines[index];
      if (line === undefined) throw new Error(`${id} ${chapter}:${verse} is not a KJV verse`);
      if (line.includes('\t')) throw new Error(`${entry.file} ${id} ${chapter}:${verse} contains a tab`);
      rows.push([book.value.id, chapter, verse, line].join('\t'));
    }
  }
  writeFileSync(`${THEWORD_OUT}${entry.version}.tsv`, `${rows.join('\n')}\n`);
  console.log(`theword/${entry.version}.tsv  ${rows.length} lines`);
}
