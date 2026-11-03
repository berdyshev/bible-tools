import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createSchema, load } from '../../src/ingest/load.ts';

const RAW = fileURLToPath(new URL('../fixtures/raw/', import.meta.url));
const lines = (name: string): string[] => readFileSync(`${RAW}${name}`, 'utf8').split('\n');

const populate = (db: DatabaseSync): DatabaseSync => {
  createSchema(db);
  const report = load(
    db,
    { tahot: lines('TAHOT-Ruth.txt'), tbesh: lines('TBESH.txt'), tipnr: lines('TIPNR.txt') },
    { stepbible_commit: 'fixture' },
  );
  if (report.issues.length > 0) throw new Error(`fixture data has unparsable lines: ${report.issues.length}`);
  return db;
};

/** In-memory database with the Ruth fixture; build it once per test file. */
export const fixtureDb = (): DatabaseSync => populate(new DatabaseSync(':memory:'));

/** Writes the fixture database to `<dir>/fixture.sqlite` and returns its path. */
export const buildFixtureDbFile = (dir: string): string => {
  const path = `${dir}/fixture.sqlite`;
  const db = new DatabaseSync(path);
  populate(db).close();
  return path;
};
