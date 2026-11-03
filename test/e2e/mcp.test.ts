import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { CallToolResult } from '@modelcontextprotocol/client';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { BibleRepo } from '../../src/data/repo.ts';
import { createServer } from '../../src/server.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';

const connect = async (repo: BibleRepo): Promise<Client> => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ repo }).connect(serverSide);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
};

const textOf = (result: { content: CallToolResult['content'] }): string => {
  const block = result.content[0];
  if (block?.type !== 'text') throw new Error('tool result has no text content');
  return block.text;
};

const boom = (): never => {
  throw new Error('SQLITE secret detail');
};

let client: Client;
before(async () => {
  client = await connect(createBibleRepo(fixtureDb()));
});
after(async () => {
  await client.close();
});

void test('the tools are listed with read-only annotations', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).toSorted(), [
    'find_occurrences',
    'get_names',
    'get_verse',
    'lookup_strong',
  ]);
  for (const t of tools) {
    assert.equal(t.annotations?.readOnlyHint, true, t.name);
    assert.equal(t.annotations?.idempotentHint, true, t.name);
    assert.equal(t.annotations?.openWorldHint, false, t.name);
  }
});

void test('descriptions stay generic', async () => {
  const { tools } = await client.listTools();
  for (const t of tools) {
    assert.doesNotMatch(t.description ?? '', /German|Russian|Elberfelder|RBO|project name table/i, t.name);
  }
});

void test('successful calls are not errors and carry structured content where declared', async () => {
  const { tools } = await client.listTools();
  const declared = (name: string) => tools.find((t) => t.name === name)?.outputSchema !== undefined;

  const calls = [
    { name: 'get_verse', arguments: { ref: 'Ruth 1:1' } },
    { name: 'get_names', arguments: { ref: 'Ruth 1:2' } },
    { name: 'lookup_strong', arguments: { strong: 'H7704' } },
    { name: 'lookup_strong', arguments: { strong: 'H7704G' } },
    { name: 'find_occurrences', arguments: { strong: 'H7704G', scope: 'Ruth' } },
    { name: 'find_occurrences', arguments: { strong: 'H7704' } },
  ];
  for (const call of calls) {
    const result = await client.callTool(call);
    assert.notEqual(result.isError, true, call.name);
    assert.ok(textOf(result).length > 0, call.name);
    assert.equal(result.structuredContent !== undefined, declared(call.name), call.name);
  }
});

void test('input errors reach the client with their hint', async () => {
  const cases = [
    {
      name: 'get_verse',
      arguments: { ref: 'Руфь 1:2' },
      text: /^Unknown book "Руфь"\. Use English OSIS ids or names: /,
    },
    {
      name: 'get_verse',
      arguments: { ref: 'Ruth 99:1' },
      text: /^Ruth has no chapter 99\. Use a chapter from 1 to 4$/,
    },
    {
      name: 'get_verse',
      arguments: { ref: 'Ruth 1:2-3' },
      text: /^Ranges are not supported here: "Ruth 1:2-3"/,
    },
    {
      name: 'lookup_strong',
      arguments: { strong: 'H99999' },
      text: /^Malformed Strong's number "H99999"\. Use H or G, then 1–4 digits/,
    },
    {
      name: 'get_verse',
      arguments: { ref: 'Ruth 1:2', versification: 'lxx' },
      text: /versification must be "eng" \(English\/NRSV, default\) or "heb" \(Hebrew\/Leningrad\)/,
    },
  ];
  for (const { name, arguments: args, text } of cases) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.match(textOf(result), text, JSON.stringify(args));
  }
});

void test('a failing repository gives a generic error and the details go to stderr', async () => {
  const failing = await connect({
    verseWords: boom,
    nameWords: boom,
    lexiconEntry: boom,
    senses: boom,
    lastVerse: boom,
    meta: () => null,
    tipnr: boom,
    occurrences: boom,
  });
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const result = await failing.callTool({ name: 'get_verse', arguments: { ref: 'Ruth 1:2' } });
    assert.equal(result.isError, true);
    assert.doesNotMatch(textOf(result), /secret/);
    assert.match(textOf(result), /Internal error/);
    assert.match(logged.map((args) => args.map(String).join(' ')).join('\n'), /secret detail/);
  } finally {
    console.error = original;
    await failing.close();
  }
});
