import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { buildFixtureDbFile } from '../helpers/fixture-db.ts';

const HTTP = fileURLToPath(new URL('../../src/http.ts', import.meta.url));

type Running = { readonly child: ChildProcess; readonly base: string; readonly stderr: () => string };

let dir = '';
let dbPath = '';
const running: ChildProcess[] = [];

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const start = async (extraEnv: Record<string, string> = {}): Promise<Running> => {
  const port = await freePort();
  const child = spawn('node', ['--disable-warning=ExperimentalWarning', HTTP], {
    env: { ...process.env, PORT: String(port), STEPBIBLE_DB: dbPath, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  running.push(child);
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => (stderr += chunk));
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode}): ${stderr}`);
    try {
      if ((await fetch(`${base}/health`)).ok) return { child, base, stderr: () => stderr };
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  throw new Error(`server did not become healthy: ${stderr}`);
};

const JSON_RPC_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
} as const;

const initialize = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  },
});

const post = (base: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`${base}/mcp`, { method: 'POST', headers: { ...JSON_RPC_HEADERS, ...headers }, body: initialize });

let main: Running;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stepbible-http-'));
  dbPath = buildFixtureDbFile(dir);
  main = await start();
});

after(() => {
  for (const child of running) child.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

void test('GET /health answers 200 with JSON', async () => {
  const res = await fetch(`${main.base}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

void test('an MCP client can initialize and list the tools over POST /mcp', async () => {
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${main.base}/mcp`)));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).toSorted(), [
      'explain_morphology',
      'find_occurrences',
      'get_names',
      'get_original',
      'lookup_strong',
      'search_lexicon',
    ]);
    const verse = await client.callTool({ name: 'get_original', arguments: { ref: 'Ruth 1:1' } });
    assert.notEqual(verse.isError, true);
  } finally {
    await client.close();
  }
});

void test('a foreign Origin is rejected with 403', async () => {
  const res = await post(main.base, { origin: 'http://evil.example' });
  assert.equal(res.status, 403);
  await res.arrayBuffer();
});

// fetch() replaces a caller-supplied Host header, so this goes through node:http.
const statusWithHost = (base: string, host: string): Promise<number | undefined> =>
  new Promise((resolve, reject) => {
    const req = request(`${base}/mcp`, { method: 'POST', headers: { ...JSON_RPC_HEADERS, host } }, (res) => {
      res.resume();
      res.once('end', () => resolve(res.statusCode));
    });
    req.once('error', reject);
    req.end(initialize);
  });

void test('a foreign Host is rejected with 403', async () => {
  assert.equal(await statusWithHost(main.base, 'evil.example'), 403);
});

void test('GET and DELETE on /mcp are not allowed in stateless mode', async () => {
  for (const method of ['GET', 'DELETE']) {
    const res = await fetch(`${main.base}/mcp`, { method, headers: { accept: 'text/event-stream' } });
    assert.equal(res.status, 405, method);
    await res.arrayBuffer();
  }
});

void test('the request over RATE_LIMIT within a minute gets 429 with Retry-After', async () => {
  const server = await start({ RATE_LIMIT: '5' });
  for (let i = 1; i <= 5; i++) {
    const res = await post(server.base);
    assert.notEqual(res.status, 429, `request ${i}`);
    await res.arrayBuffer();
  }
  const limited = await post(server.base);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  await limited.arrayBuffer();
  const health = await fetch(`${server.base}/health`);
  assert.equal(health.status, 200);
});

void test('SIGTERM shuts the server down with exit code 0', async () => {
  const server = await start();
  const exited = new Promise<number | null>((resolve) => server.child.once('close', resolve));
  server.child.kill('SIGTERM');
  assert.equal(await exited, 0);
  assert.notEqual(server.stderr(), '');
});
