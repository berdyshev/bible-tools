// Parses data/raw/* (STEPBible TAHOT, TAGNT, TBESH, TBESG, TIPNR, TEHMC, TEGMC) into data/bible.sqlite.
// Usage: node --disable-warning=ExperimentalWarning scripts/build-db.ts
import { readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createSchema, load } from '../src/ingest/load.ts';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const DB_PATH = `${DATA_DIR}bible.sqlite`;
const lines = (name: string): string[] => readFileSync(`${DATA_DIR}raw/${name}`, 'utf8').split('\n');

const SOURCES = readFileSync(`${DATA_DIR}SOURCES.md`, 'utf8');
const sha = /commit `([0-9a-f]{40})`/.exec(SOURCES)?.[1];
if (sha === undefined) throw new Error('data/SOURCES.md has no commit SHA; run pnpm data:fetch');

const TAHOT_FILES = ['TAHOT-Gen-Deu.txt', 'TAHOT-Jos-Est.txt', 'TAHOT-Job-Sng.txt', 'TAHOT-Isa-Mal.txt'];
// Mat-Jhn before Act-Rev keeps canonical book order.
const TAGNT_FILES = ['TAGNT-Mat-Jhn.txt', 'TAGNT-Act-Rev.txt'];

rmSync(DB_PATH, { force: true });
const db = new DatabaseSync(DB_PATH);
createSchema(db);
const { counts, issues } = load(
  db,
  {
    tahot: TAHOT_FILES.flatMap(lines),
    tagnt: TAGNT_FILES.flatMap(lines),
    tbesh: [...lines('TBESH.txt'), ...lines('TBESG.txt')],
    tipnr: lines('TIPNR.txt'),
    hebrewMorphology: lines('TEHMC.txt'),
    greekMorphology: lines('TEGMC.txt'),
  },
  {
    stepbible_commit: sha,
    built_at: new Date().toISOString(),
    schema_note:
      'chapter/verse = English (NRSV); heb_chapter/heb_verse = Hebrew versification (equal to chapter/verse in the New Testament)',
  },
);
db.close();

console.log(
  `words=${counts.words} lexicon=${counts.lexicon} names=${counts.names} morphology=${counts.morphology} issues=${issues.length}`,
);
for (const i of issues.slice(0, 10)) console.log(`  ${i.reason}: ${i.line.slice(0, 80)}`);
