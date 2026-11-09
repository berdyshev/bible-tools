import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { VERSIONS } from '../../src/domain/versions.ts';
import { createSchema, load, loadTranslation, type TranslationLine } from '../../src/ingest/load.ts';
import { MODULE_RULES, VERSION_MODULE } from '../../src/ingest/theword.ts';

const RAW = fileURLToPath(new URL('../fixtures/raw/', import.meta.url));
const THEWORD = fileURLToPath(new URL('../fixtures/theword/', import.meta.url));
const lines = (name: string): string[] => readFileSync(`${RAW}${name}`, 'utf8').split('\n');

/** The rows of a `book chapter verse raw-line` excerpt of a theWord module. */
const translationLines = (version: string): TranslationLine[] =>
  readFileSync(`${THEWORD}${version}.tsv`, 'utf8')
    .split('\n')
    .filter((row) => row !== '')
    .map((row) => {
      const [book = '', chapter = '', verse = '', ...rest] = row.split('\t');
      return { book, chapter: Number(chapter), verse: Number(verse), line: rest.join('\t') };
    });

const populate = (db: DatabaseSync): DatabaseSync => {
  createSchema(db);
  const report = load(
    db,
    {
      tahot: lines('TAHOT-Ruth.txt'),
      tagnt: lines('TAGNT-John1.txt'),
      tbesh: [...lines('TBESH.txt'), ...lines('TBESG.txt')],
      tipnr: lines('TIPNR.txt'),
      hebrewMorphology: lines('TEHMC.txt'),
      greekMorphology: lines('TEGMC.txt'),
    },
    { stepbible_commit: 'fixture' },
  );
  if (report.issues.length > 0) throw new Error(`fixture data has unparsable lines: ${report.issues.length}`);
  for (const version of VERSIONS) {
    loadTranslation(db, {
      version,
      rules: MODULE_RULES[VERSION_MODULE[version.id]],
      sha256: 'fixture',
      lines: translationLines(version.id),
    });
  }
  return db;
};

/** In-memory database with the Ruth and John 1 fixtures and the translation excerpts; build it once per test file. */
export const fixtureDb = (): DatabaseSync => populate(new DatabaseSync(':memory:'));

/** Writes the fixture database to `<dir>/fixture.sqlite` and returns its path. */
export const buildFixtureDbFile = (dir: string): string => {
  const path = `${dir}/fixture.sqlite`;
  const db = new DatabaseSync(path);
  populate(db).close();
  return path;
};
