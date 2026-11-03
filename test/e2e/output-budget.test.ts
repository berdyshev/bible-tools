import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createBibleRepo } from '../../src/data/repo.ts';
import { createServer } from '../../src/server.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';

const BUDGET = 2000;
const GOLDEN = fileURLToPath(new URL('../golden/', import.meta.url));

let client: Client;
before(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ repo: createBibleRepo(fixtureDb()) }).connect(serverSide);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
});
after(async () => {
  await client.close();
});

const toolCalls = [
  { name: 'get_verse', arguments: { ref: 'Ruth 1:1' } },
  { name: 'get_verse', arguments: { ref: 'Ruth 1:1-3' } },
  { name: 'get_verse', arguments: { ref: 'Ruth 1' } },
  { name: 'lookup_strong', arguments: { strong: 'H7704' } },
  { name: 'lookup_strong', arguments: { strong: 'H7704G' } },
  { name: 'get_names', arguments: { ref: 'Ruth 1:2' } },
  { name: 'get_names', arguments: { ref: 'Ruth 1' } },
  { name: 'find_occurrences', arguments: { strong: 'H7704G', scope: 'Ruth' } },
  { name: 'find_occurrences', arguments: { strong: 'H7704G', scope: 'OT' } },
  { name: 'search_lexicon', arguments: { query: 'field' } },
];

const resourceUris = [
  'stepbible://verse/Ruth%201%3A1',
  'stepbible://verse/Ruth%201',
  'stepbible://strong/H7704G',
];

const outputs = async (): Promise<{ label: string; text: string }[]> => {
  const all: { label: string; text: string }[] = [];
  for (const call of toolCalls) {
    const result = await client.callTool(call);
    assert.notEqual(result.isError, true, JSON.stringify(call));
    for (const block of result.content) {
      if (block.type === 'text') all.push({ label: JSON.stringify(call), text: block.text });
    }
  }
  for (const uri of resourceUris) {
    const { contents } = await client.readResource({ uri });
    for (const c of contents) if ('text' in c) all.push({ label: uri, text: c.text });
  }
  return all;
};

void test('every tool and resource output fits the budget, and a cut-off one says how to continue', async () => {
  const all = await outputs();
  assert.equal(all.length, toolCalls.length + resourceUris.length);
  for (const { label, text } of all) {
    assert.ok(text.length <= BUDGET, `${label} is ${text.length} characters`);
    if (/truncated/i.test(text)) {
      assert.match(text, /truncated — call \w+ again with "[^"]+"/, `${label} lacks a continuation hint`);
    }
  }
});

void test('at least one typical call is cut off, so the continuation check is exercised', async () => {
  const all = await outputs();
  assert.ok(all.some(({ text }) => /truncated/i.test(text)));
});

void test('golden files stay under the budget', () => {
  const files = readdirSync(GOLDEN).filter((f) => f.endsWith('.txt'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const length = readFileSync(`${GOLDEN}${f}`, 'utf8').length;
    assert.ok(length < BUDGET, `${f} is ${length} characters`);
  }
});
