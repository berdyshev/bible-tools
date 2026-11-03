import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export class DatabaseNotFoundError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Database not found at ${path}: run pnpm data:fetch && pnpm data:build`);
    this.name = 'DatabaseNotFoundError';
    this.path = path;
  }
}

/** Opens the database read-only. This is the single place that checks the file exists. */
export const openDb = (path: string): DatabaseSync => {
  if (!existsSync(path)) throw new DatabaseNotFoundError(path);
  return new DatabaseSync(path, { readOnly: true });
};
