import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import { explainMorphology, outputSchema } from '../../src/tools/explain-morphology.ts';
import { getOriginal } from '../../src/tools/get-original.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { expectGolden } from '../helpers/golden.ts';
import { textOf } from '../helpers/tool-text.ts';

const repo = createBibleRepo(fixtureDb());

void test('explain_morphology HVqw3ms matches the golden output', () => {
  const result = explainMorphology.call({ code: 'HVqw3ms' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('explain_morphology.HVqw3ms.txt', textOf(result));
});

void test('explain_morphology V-AAI-3S matches the golden output', () => {
  const result = explainMorphology.call({ code: 'V-AAI-3S' }, repo);
  assert.equal(result.isError, undefined);
  expectGolden('explain_morphology.V-AAI-3S.txt', textOf(result));
});

void test('a Hebrew code works without its letter, and compounds as get_original shows them', () => {
  assert.equal(
    textOf(explainMorphology.call({ code: 'Vqw3ms' }, repo)),
    textOf(explainMorphology.call({ code: 'HVqw3ms' }, repo)),
  );
  const compound = explainMorphology.call({ code: 'Hc/Vqw3ms' }, repo);
  assert.equal(compound.isError, undefined);
  assert.deepEqual(
    outputSchema.parse(compound.structuredContent).parts.map((p) => p.code),
    ['Hc', 'HVqw3ms'],
  );
  assert.equal(
    outputSchema.parse(compound.structuredContent).parts[0]?.summary,
    'Consecutive Conjunction',
    'Hc (lower case) is the consecutive conjunction, a different code from HC',
  );
  assert.equal(
    outputSchema.parse(explainMorphology.call({ code: 'HC/Vqw3ms' }, repo).structuredContent).parts[0]
      ?.summary,
    'Conjunction',
  );
  const prefixed = outputSchema.parse(explainMorphology.call({ code: 'HR/Ncmpc' }, repo).structuredContent);
  assert.deepEqual(
    prefixed.parts.map((p) => p.code),
    ['HR', 'HNcmpc'],
  );
});

/** The morphology code of each word line of a get_original result with `morphology: true`. */
const codesShown = (ref: string): string[] => {
  const text = textOf(getOriginal.call({ ref, morphology: true }, repo));
  return text
    .split('\n')
    .filter((line) => /^\d+\. /.test(line))
    .map((line) => line.split('  ').at(-2) ?? '');
};

void test('every code get_original shows for Ruth 1 and John 1 is explained, end to end', () => {
  for (const ref of ['Ruth 1:1-3', 'Ruth 1:20-22', 'John 1:1', 'John 1:14', 'John 1:42']) {
    const codes = codesShown(ref);
    assert.ok(codes.length > 0, ref);
    for (const code of codes) {
      assert.ok(code.length > 0, ref);
      const result = explainMorphology.call({ code }, repo);
      assert.equal(result.isError, undefined, `${ref}: ${code}`);
    }
  }
});

void test('the codes shown for John 1:1 are the Greek ones', () => {
  assert.deepEqual(codesShown('John 1:1').slice(0, 4), ['PREP', 'N-DSF', 'V-IAI-3S', 'T-NSM']);
});

void test('an unknown or brief lexical code is an input error', () => {
  for (const code of ['G:N-M', 'Zzz', 'V-AAI']) {
    const result = explainMorphology.call({ code }, repo);
    assert.equal(result.isError, true, code);
    assert.match(textOf(result), /was not found/);
  }
});
