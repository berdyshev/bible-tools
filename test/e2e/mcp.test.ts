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
    'explain_morphology',
    'find_occurrences',
    'get_names',
    'get_original',
    'get_translation',
    'lookup_strong',
    'search_lexicon',
  ]);
  for (const t of tools) {
    assert.equal(t.annotations?.readOnlyHint, true, t.name);
    assert.equal(t.annotations?.idempotentHint, true, t.name);
    assert.equal(t.annotations?.openWorldHint, false, t.name);
  }
});

void test('the server is named bible-tools', () => {
  assert.equal(client.getServerVersion()?.name, 'bible-tools');
});

void test('descriptions stay generic', async () => {
  const { tools } = await client.listTools();
  // get_translation names the translations it serves.
  for (const t of tools.filter((tool) => tool.name !== 'get_translation')) {
    assert.doesNotMatch(t.description ?? '', /German|Russian|Elberfelder|RBO|project name table/i, t.name);
  }
});

void test('successful calls are not errors and carry structured content where declared', async () => {
  const { tools } = await client.listTools();
  const declared = (name: string) => tools.find((t) => t.name === name)?.outputSchema !== undefined;

  const calls = [
    { name: 'get_original', arguments: { ref: 'Ruth 1:1' } },
    { name: 'get_translation', arguments: { ref: 'Ruth 1:1', version: 'kjv' } },
    { name: 'get_names', arguments: { ref: 'Ruth 1:2' } },
    { name: 'lookup_strong', arguments: { strong: 'H7704' } },
    { name: 'lookup_strong', arguments: { strong: 'H7704G' } },
    { name: 'find_occurrences', arguments: { strong: 'H7704G', scope: 'Ruth' } },
    { name: 'find_occurrences', arguments: { strong: 'H7704' } },
    { name: 'search_lexicon', arguments: { query: 'field' } },
    { name: 'search_lexicon', arguments: { query: 'field', language: 'greek' } },
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
      name: 'get_original',
      arguments: { ref: 'Руфь 1:2' },
      text: /^Unknown book "Руфь"\. Use English OSIS ids or names: /,
    },
    {
      name: 'get_original',
      arguments: { ref: 'Ruth 99:1' },
      text: /^Ruth has no chapter 99\. Use a chapter from 1 to 4$/,
    },
    {
      name: 'get_original',
      arguments: { ref: 'Ruth 1:5-2' },
      text: /^Range "Ruth 1:5-2" ends before it starts/,
    },
    {
      name: 'lookup_strong',
      arguments: { strong: 'H99999' },
      text: /^Malformed Strong's number "H99999"\. Use H or G, then a number \(up to 4 digits for H, 5 for G;/,
    },
    {
      name: 'get_translation',
      arguments: { ref: 'Ruth 1:1', version: 'niv' },
      text: /version must be one of "kjv" .*"darby" .*"elb1905" .*"ohienko" .*"rst" /,
    },
    {
      name: 'get_translation',
      arguments: { ref: '3John 1:15', version: 'kjv' },
      text: /^3 John 1 has no verse 15\. Use a verse from 1 to 14\. In KJV numbering this verse is part of 3 John 1:14/,
    },
    {
      name: 'get_original',
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
    verseBounds: boom,
    meta: () => null,
    tipnr: boom,
    occurrences: boom,
    searchLexicon: boom,
    morphologyCode: boom,
    translations: () => [],
    translationVerses: boom,
  });
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const result = await failing.callTool({ name: 'get_original', arguments: { ref: 'Ruth 1:2' } });
    assert.equal(result.isError, true);
    assert.doesNotMatch(textOf(result), /secret/);
    assert.match(textOf(result), /Internal error/);
    assert.match(logged.map((args) => args.map(String).join(' ')).join('\n'), /secret detail/);
  } finally {
    console.error = original;
    await failing.close();
  }
});

void test('resource templates are listed and not enumerated', async () => {
  const { resourceTemplates } = await client.listResourceTemplates();
  assert.deepEqual(resourceTemplates.map((t) => t.uriTemplate).toSorted(), [
    'bible://original/{ref}',
    'bible://strong/{id}',
  ]);
  for (const t of resourceTemplates) assert.equal(t.mimeType, 'text/plain', t.name);
  const original = resourceTemplates.find((t) => t.name === 'original');
  assert.match(original?.description ?? '', /URL-encoded/);
  assert.match(original?.description ?? '', /Ruth\.1\.1/);
  const { resources } = await client.listResources();
  assert.deepEqual(resources, []);
});

void test('resources return the same text as the tools', async () => {
  const cases = [
    { uri: 'bible://original/Ruth%201%3A1', tool: 'get_original', arguments: { ref: 'Ruth 1:1' } },
    { uri: 'bible://original/Ruth.1.1', tool: 'get_original', arguments: { ref: 'Ruth 1:1' } },
    { uri: 'bible://strong/H7704G', tool: 'lookup_strong', arguments: { strong: 'H7704G' } },
    { uri: 'bible://original/John%201%3A1', tool: 'get_original', arguments: { ref: 'John 1:1' } },
    { uri: 'bible://original/John.1.1', tool: 'get_original', arguments: { ref: 'John 1:1' } },
    { uri: 'bible://strong/G3056', tool: 'lookup_strong', arguments: { strong: 'G3056' } },
  ];
  for (const { uri, tool, arguments: args } of cases) {
    const { contents } = await client.readResource({ uri });
    const content = contents[0];
    assert.equal(contents.length, 1, uri);
    assert.equal(content?.mimeType, 'text/plain', uri);
    assert.equal(
      content !== undefined && 'text' in content ? content.text : null,
      textOf(await client.callTool({ name: tool, arguments: args })),
      uri,
    );
  }
});

void test('invalid resource input is an error with the hint', async () => {
  await assert.rejects(
    client.readResource({ uri: 'bible://original/Ruth%2099%3A1' }),
    /Ruth has no chapter 99/,
  );
  await assert.rejects(
    client.readResource({ uri: 'bible://strong/H99999' }),
    /Malformed Strong's number "H99999"/,
  );
  await assert.rejects(
    client.readResource({ uri: 'bible://strong/H9999' }),
    /Strong's number "H9999" was not found/,
  );
});

void test('resource read failures do not leak internals', async () => {
  const failing = await connect({
    verseWords: boom,
    nameWords: boom,
    lexiconEntry: boom,
    senses: boom,
    verseBounds: boom,
    meta: () => null,
    tipnr: boom,
    occurrences: boom,
    searchLexicon: boom,
    morphologyCode: boom,
    translations: () => [],
    translationVerses: boom,
  });
  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(failing.readResource({ uri: 'bible://original/Ruth%201%3A2' }), (e: unknown) => {
      assert.ok(e instanceof Error);
      assert.match(e.message, /Internal error/);
      assert.doesNotMatch(e.message, /secret/);
      return true;
    });
  } finally {
    console.error = original;
    await failing.close();
  }
});

const promptText = async (name: string, args: Record<string, string>): Promise<string> => {
  const { messages } = await client.getPrompt({ name, arguments: args });
  assert.equal(messages.length, 1, name);
  const content = messages[0]?.content;
  if (content?.type !== 'text') throw new Error('prompt message has no text');
  return content.text;
};

void test('prompts are listed with their arguments', async () => {
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).toSorted(), ['verse_analysis', 'word_study']);
  const args = (name: string) =>
    prompts.find((p) => p.name === name)?.arguments?.map((a) => [a.name, a.required]);
  assert.deepEqual(args('word_study'), [['strong', true]]);
  assert.deepEqual(args('verse_analysis'), [['ref', true]]);
  for (const p of prompts) {
    assert.doesNotMatch(p.description ?? '', /German|Russian|Elberfelder|RBO/i, p.name);
  }
});

void test('word_study names the tools in order', async () => {
  const text = await promptText('word_study', { strong: 'H7704G' });
  assert.match(text, /H7704G/);
  const order = ['lookup_strong', 'find_occurrences', 'get_original'].map((tool) => text.indexOf(tool));
  assert.ok(
    order.every((i) => i >= 0),
    text,
  );
  assert.deepEqual(
    order,
    order.toSorted((a, b) => a - b),
  );
  assert.match(text, /menu/);
  assert.match(text, /do not invent/i);
});

void test('the prompts do not say Hebrew or Old Testament and work for a Greek number and verse', async () => {
  const study = await promptText('word_study', { strong: 'G3056' });
  assert.match(study, /^Do a word study of the word G3056\./);
  assert.match(study, /New Testament/);
  const analysis = await promptText('verse_analysis', { ref: 'John 1:1' });
  assert.match(analysis, /^Analyze the original text of John 1:1\./);
  for (const text of [study.split('\n')[0], analysis.split('\n')[0]])
    assert.doesNotMatch(text ?? '', /Hebrew/);
  const { prompts } = await client.listPrompts();
  for (const p of prompts) assert.match(p.description ?? '', /Greek/, p.name);
});

void test('verse_analysis names the tools in order', async () => {
  const text = await promptText('verse_analysis', { ref: 'Ruth 1:1' });
  assert.match(text, /Ruth 1:1/);
  const order = ['get_original', 'get_names', 'lookup_strong'].map((tool) => text.indexOf(tool));
  assert.ok(
    order.every((i) => i >= 0),
    text,
  );
  assert.deepEqual(
    order,
    order.toSorted((a, b) => a - b),
  );
  assert.match(text, /do not invent/i);
});

void test('a prompt without its argument is rejected', async () => {
  await assert.rejects(client.getPrompt({ name: 'word_study', arguments: {} }));
});
