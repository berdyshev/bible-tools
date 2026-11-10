#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';
import { DatabaseNotFoundError, openDb } from './data/db.ts';
import { createBibleRepo } from './data/repo.ts';
import { createServer } from './server.ts';

const env = z
  .object({
    BIBLE_DB: z.string().min(1).optional(),
    // The name before the project became bible-tools.
    STEPBIBLE_DB: z.string().min(1).optional(),
  })
  .parse(process.env);

const dbPath =
  env.BIBLE_DB ?? env.STEPBIBLE_DB ?? fileURLToPath(new URL('../data/bible.sqlite', import.meta.url));

try {
  const server = createServer({ repo: createBibleRepo(openDb(dbPath)) });
  // stdout carries protocol messages only; diagnostics go to stderr.
  await server.connect(new StdioServerTransport());
  console.error('bible-tools MCP server ready');
} catch (e) {
  if (e instanceof DatabaseNotFoundError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
