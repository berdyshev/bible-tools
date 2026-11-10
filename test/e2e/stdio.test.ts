import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';
import { buildFixtureDbFile } from '../helpers/fixture-db.ts';

const STDIO = fileURLToPath(new URL('../../src/stdio.ts', import.meta.url));
// The same flag the entry point's shebang passes.
const NODE_ARGS = ['--disable-warning=ExperimentalWarning', STDIO];
const dir = mkdtempSync(join(tmpdir(), 'bible-stdio-'));
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

void test('a missing database ends with one stderr line, exit 1 and empty stdout', () => {
  const missing = join(dir, 'absent.sqlite');
  const run = spawnSync('node', NODE_ARGS, {
    env: { ...process.env, BIBLE_DB: missing },
    encoding: 'utf8',
  });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  const lines = run.stderr.split('\n').filter((l) => l !== '');
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.includes(missing), true);
  assert.equal(lines[0]?.includes('pnpm data:fetch'), true);
});

const rpcLine = z.object({ jsonrpc: z.literal('2.0'), id: z.number(), result: z.object({}).loose() });

void test('stdout carries only JSON-RPC and the server answers initialize', async () => {
  const child = spawn('node', NODE_ARGS, {
    env: { ...process.env, BIBLE_DB: buildFixtureDbFile(dir) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => (stdout += chunk));
  const exited = new Promise((resolve) => child.on('close', resolve));

  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    },
  };
  child.stdin.write(`${JSON.stringify(initialize)}\n`);
  while (!stdout.includes('\n')) await new Promise((resolve) => setTimeout(resolve, 20));
  child.stdin.end();
  await exited;

  const lines = stdout.split('\n').filter((l) => l !== '');
  assert.equal(lines.length, 1);
  for (const line of lines) {
    const message = rpcLine.parse(JSON.parse(line));
    assert.equal(message.id, 1);
    assert.match(JSON.stringify(message.result), /CC BY 4\.0/);
  }
});
