import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod/v4';
import { createBibleRepo } from '../../src/data/repo.ts';
import { instructions } from '../../src/server.ts';
import { descriptionParts as namesParts, getNames } from '../../src/tools/get-names.ts';
import { descriptionParts as verseParts, getOriginal } from '../../src/tools/get-original.ts';
import { descriptionParts as strongParts, lookupStrong } from '../../src/tools/lookup-strong.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';

const repo = createBibleRepo(fixtureDb());

const tools = [
  { tool: getOriginal, name: 'get_original', title: 'Original-language words of a verse', parts: verseParts },
  { tool: lookupStrong, name: 'lookup_strong', title: 'Lexicon entry', parts: strongParts },
  { tool: getNames, name: 'get_names', title: 'Proper names in a passage', parts: namesParts },
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
  assert.match(fieldDescription(getOriginal.input, 'ref'), /`Ruth 1:2`.*`Ruth 1:1-5`.*`Ruth 1`/);
  assert.match(fieldDescription(getOriginal.input, 'versification'), /"eng".*"heb"/);
  assert.match(fieldDescription(lookupStrong.input, 'strong'), /`H1254`.*`H7704G`.*menu/);
});

void test('the Hebrew numbering is named in the header of verse tools', () => {
  for (const tool of [getOriginal, getNames]) {
    const result = tool.call({ ref: 'Ruth 1:2', versification: 'heb' }, repo);
    const block = result.content[0];
    assert.equal(block?.type, 'text');
    assert.match(block?.type === 'text' ? header(block.text) : '', /\(Hebrew numbering\)/);
  }
});

void test('instructions state the data, the formats and the attribution with the data commit', () => {
  const text = instructions(repo);
  assert.match(text, /Hebrew Old Testament and the Greek New Testament/);
  assert.match(text, /"Ruth 1:2"/);
  assert.match(text, /"John 1:1"/);
  assert.match(text, /"H7704G"/);
  assert.match(text, /"G3056"/);
  assert.match(text, /STEPBible.*\(data commit fixture\).*Tyndale House.*CC BY 4\.0/);
});
