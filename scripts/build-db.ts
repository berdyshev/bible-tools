// Parses data/raw/* (STEPBible TAHOT, TAGNT, TBESH, TBESG, TIPNR, TEHMC, TEGMC) and the theWord modules
// listed in data/theword/MANIFEST.json into data/bible.sqlite.
// Usage: node --disable-warning=ExperimentalWarning scripts/build-db.ts
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { refAt } from '../src/domain/kjv.ts';
import { VERSIONS } from '../src/domain/versions.ts';
import { createSchema, load, loadTranslation, type TranslationLine } from '../src/ingest/load.ts';
import { parseManifest } from '../src/ingest/manifest.ts';
import { decodeModule, MODULE_RULES, VERSION_MODULE } from '../src/ingest/theword.ts';

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
const { counts, issues, unlistedStrongs } = load(
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

const THEWORD_DIR = `${DATA_DIR}theword/`;
const manifest = parseManifest(readFileSync(`${THEWORD_DIR}MANIFEST.json`, 'utf8'));
// The note marker must not occur in a module, or a note could not be told from the text.
const NOTE_MARKER_RE = /[⸨⸩]/;
for (const version of VERSIONS) {
  const entry = manifest.modules.find((m) => m.version === version.id);
  if (entry === undefined) throw new Error(`MANIFEST.json lists no module for ${version.id}`);
  const bytes = readFileSync(`${THEWORD_DIR}${entry.file}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== entry.sha256) {
    throw new Error(`${entry.file}: sha256 ${sha256} does not match MANIFEST.json (${entry.sha256})`);
  }
  const decoded = decodeModule(bytes, entry.encoding);
  if (!decoded.ok) {
    throw new Error(`${entry.file}: ${decoded.error.found} verse lines, expected ${decoded.error.expected}`);
  }
  const marked = decoded.value.lines.findIndex((line) => NOTE_MARKER_RE.test(line));
  if (marked >= 0) throw new Error(`${entry.file}: line ${marked + 1} contains the note marker ⸨ or ⸩`);
  const verses = decoded.value.lines.map((line, index): TranslationLine => {
    const ref = refAt(index);
    if (ref === null) throw new Error(`${entry.file}: line ${index + 1} has no KJV verse`);
    return { book: ref.book.id, chapter: ref.chapter, verse: ref.verse, line };
  });
  const rules = MODULE_RULES[VERSION_MODULE[version.id]];
  console.log(`${version.id}=${loadTranslation(db, { version, rules, sha256, lines: verses })}`);
}

const tagged = db.prepare("SELECT count(*) AS n FROM translation_verses WHERE text GLOB '*[<>]*'").get()?.[
  'n'
];
if (tagged !== 0) throw new Error(`${String(tagged)} translation verses still contain < or >`);
db.close();

console.log(
  `words=${counts.words} lexicon=${counts.lexicon} names=${counts.names} morphology=${counts.morphology} issues=${issues.length}`,
);
console.log(
  `strongs without a lexicon entry=${unlistedStrongs.length}${unlistedStrongs.length > 0 ? ` (${unlistedStrongs.slice(0, 10).join(', ')}${unlistedStrongs.length > 10 ? ', …' : ''})` : ''}`,
);
for (const i of issues.slice(0, 10)) console.log(`  ${i.reason}: ${i.line.slice(0, 80)}`);
