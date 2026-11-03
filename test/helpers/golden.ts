import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GOLDEN = fileURLToPath(new URL('../golden/', import.meta.url));

/** Compares `actual` with `test/golden/<name>`; with UPDATE_GOLDEN=1 the file is rewritten instead. */
export const expectGolden = (name: string, actual: string): void => {
  const path = `${GOLDEN}${name}`;
  if (process.env['UPDATE_GOLDEN'] === '1') {
    writeFileSync(path, `${actual}\n`);
    return;
  }
  assert.equal(
    `${actual}\n`,
    readFileSync(path, 'utf8'),
    `golden ${name} differs (UPDATE_GOLDEN=1 rewrites it)`,
  );
};
