import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod/v4';
import { createBibleRepo } from '../../src/data/repo.ts';
import { createServer, instructions } from '../../src/server.ts';
import { descriptionParts as namesParts, getNames } from '../../src/tools/get-names.ts';
import { descriptionParts as verseParts, getVerse } from '../../src/tools/get-verse.ts';
import { descriptionParts as strongParts, lookupStrong } from '../../src/tools/lookup-strong.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { connectRaw } from '../helpers/rpc.ts';

const repo = createBibleRepo(fixtureDb());

const tools = [
  { tool: getVerse, name: 'get_verse', title: 'Hebrew words of a verse', parts: verseParts },
  { tool: lookupStrong, name: 'lookup_strong', title: 'Hebrew lexicon entry', parts: strongParts },
  { tool: getNames, name: 'get_names', title: 'Proper names in a verse', parts: namesParts },
];

void test('tools have stable names and titles', () => {
  for (const { tool, name, title } of tools) {
    assert.equal(tool.name, name);
    assert.equal(tool.title, title);
  }
});

void test('every description has what / when / output / not-for sentences and stays generic', () => {
  for (const { tool, parts, name } of tools) {
    for (const [key, sentence] of Object.entries(parts)) {
      assert.ok(sentence.length > 40, `${name}.${key} is too short`);
      assert.ok(sentence.endsWith('.'), `${name}.${key} should end with a full stop`);
    }
    assert.match(parts.not, /^It does not /, name);
    assert.match(parts.output, /output|menu|[`«]/i, name);
    assert.equal(tool.description, `${parts.what} ${parts.when} ${parts.output} ${parts.not}`);
    assert.doesNotMatch(tool.description, /german|russian|elberfelder|rbo|name table/i, name);
  }
});

const header = (text: string): string => text.split('\n')[0] ?? '';

const fieldDescription = (schema: z.ZodObject, field: string): string => {
  const props = z.object({ properties: z.record(z.string(), z.object({ description: z.string() })) });
  return props.parse(z.toJSONSchema(schema)).properties[field]?.description ?? '';
};

void test('argument descriptions carry examples', () => {
  assert.match(fieldDescription(getVerse.input, 'ref'), /`Ruth 1:2`.*not supported/);
  assert.match(fieldDescription(getVerse.input, 'versification'), /"eng".*"heb"/);
  assert.match(fieldDescription(lookupStrong.input, 'strong'), /`H1254`.*`H7704G`.*menu/);
});

void test('the Hebrew numbering is named in the header of verse tools', () => {
  for (const tool of [getVerse, getNames]) {
    const result = tool.call({ ref: 'Ruth 1:2', versification: 'heb' }, repo);
    const block = result.content[0];
    assert.equal(block?.type, 'text');
    assert.match(block?.type === 'text' ? header(block.text) : '', /\(Hebrew numbering\)/);
  }
});

void test('instructions state the data, the formats and the attribution with the data commit', () => {
  const text = instructions(repo);
  assert.match(text, /Hebrew Old Testament/);
  assert.match(text, /"Ruth 1:2"/);
  assert.match(text, /"H7704G"/);
  assert.match(text, /STEPBible.*\(data commit fixture\).*Tyndale House.*CC BY 4\.0/);
});

const listResult = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      annotations: z.object({
        readOnlyHint: z.boolean(),
        idempotentHint: z.boolean(),
        openWorldHint: z.boolean(),
      }),
      outputSchema: z.object({}).loose().optional(),
    }),
  ),
});

void test('the server lists every tool with read-only annotations', async () => {
  const rpc = await connectRaw(createServer({ repo }));
  try {
    const { tools: listed } = listResult.parse((await rpc.request('tools/list')).result);
    assert.deepEqual(listed.map((t) => t.name).toSorted(), ['get_names', 'get_verse', 'lookup_strong']);
    for (const t of listed) {
      assert.deepEqual(t.annotations, { readOnlyHint: true, idempotentHint: true, openWorldHint: false });
    }
    assert.ok(listed.find((t) => t.name === 'lookup_strong')?.outputSchema);
    assert.equal(listed.find((t) => t.name === 'get_verse')?.outputSchema, undefined);
  } finally {
    await rpc.close();
  }
});

const callResult = z.object({
  isError: z.boolean().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string() })),
  structuredContent: z.object({ kind: z.string() }).optional(),
});

void test('tools/call succeeds without isError and returns structured content when declared', async () => {
  const rpc = await connectRaw(createServer({ repo }));
  try {
    const verse = callResult.parse(
      (await rpc.request('tools/call', { name: 'get_verse', arguments: { ref: 'Ruth 1:1' } })).result,
    );
    assert.equal(verse.isError, undefined);
    assert.match(verse.content[0]?.text ?? '', /^Ruth 1:1 /);
    assert.equal(verse.structuredContent, undefined);

    const strong = callResult.parse(
      (await rpc.request('tools/call', { name: 'lookup_strong', arguments: { strong: 'H7704' } })).result,
    );
    assert.equal(strong.isError, undefined);
    assert.equal(strong.structuredContent?.kind, 'menu');
  } finally {
    await rpc.close();
  }
});

void test('input errors reach the client as isError with the hint', async () => {
  const rpc = await connectRaw(createServer({ repo }));
  try {
    const result = callResult.parse(
      (await rpc.request('tools/call', { name: 'get_verse', arguments: { ref: 'Ruth 99:1' } })).result,
    );
    assert.equal(result.isError, true);
    assert.equal(result.content[0]?.text, 'Ruth has no chapter 99. Use a chapter from 1 to 4');
  } finally {
    await rpc.close();
  }
});
