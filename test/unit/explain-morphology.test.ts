import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBibleRepo } from '../../src/data/repo.ts';
import type { BibleRepo, MorphologyEntry } from '../../src/data/repo.ts';
import {
  description,
  descriptionParts,
  explainMorphology,
  formatMorphology,
  inputSchema,
  outputSchema,
  resolveMorphology,
} from '../../src/tools/explain-morphology.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { textOf } from '../helpers/tool-text.ts';

const entry = (code: string, over: Partial<MorphologyEntry> = {}): MorphologyEntry => ({
  code,
  language: code.startsWith('H') || code.startsWith('A') ? 'hebrew' : 'greek',
  parsing: `parsing of ${code}`,
  summary: `summary of ${code}`,
  meaning: `meaning of ${code}`,
  example: `example of ${code}`,
  ...over,
});

const table = new Map(
  ['HVqw3ms', 'HC', 'HR', 'HNcmpc', 'HNcmsa', 'AC', 'V-AAI-3S', 'P-1NS', 'CONJ'].map(
    (c) => [c, entry(c)] as const,
  ),
);
const stub: BibleRepo = {
  ...createBibleRepo(fixtureDb()),
  morphologyCode: (code) => table.get(code) ?? null,
};

const codesOf = (input: string): string[] | string => {
  const r = resolveMorphology(stub, input);
  return r.ok ? r.value.map((e) => e.code) : JSON.stringify(r.error);
};

void test('a whole code is found exactly, with a Hebrew code also without its letter', () => {
  assert.deepEqual(codesOf('V-AAI-3S'), ['V-AAI-3S']);
  assert.deepEqual(codesOf('HVqw3ms'), ['HVqw3ms']);
  assert.deepEqual(codesOf('Vqw3ms'), ['HVqw3ms']);
});

void test('a compound is explained part by part, adding the missing language letter', () => {
  assert.deepEqual(codesOf('HC/Vqw3ms'), ['HC', 'HVqw3ms']);
  assert.deepEqual(codesOf('HR/Ncmpc'), ['HR', 'HNcmpc']);
  assert.deepEqual(codesOf('C/Vqw3ms'), ['HC', 'HVqw3ms']);
  assert.deepEqual(codesOf('P-1NS + CONJ'), ['P-1NS', 'CONJ']);
  assert.deepEqual(codesOf('HC/R/Ncmpc'), ['HC', 'HR', 'HNcmpc']);
});

void test('Ketiv and Qere readings are both explained, in order', () => {
  assert.deepEqual(codesOf('HVqw3ms//Ncmsa'), ['HVqw3ms', 'HNcmsa']);
  assert.deepEqual(codesOf('HR/Ncmsa//HC/Ncmsa'), ['HR', 'HNcmsa', 'HC', 'HNcmsa']);
});

void test('an Aramaic part is found after the Hebrew spelling fails', () => {
  assert.deepEqual(codesOf('C'), ['HC']);
  const aramaicOnly = { ...stub, morphologyCode: (c: string) => (c === 'AC' ? entry('AC') : null) };
  const r = resolveMorphology(aramaicOnly, 'C');
  assert.ok(r.ok);
  assert.deepEqual(
    r.value.map((e) => e.code),
    ['AC'],
  );
});

const sameLetters = new Map(
  [
    'HC',
    'AC',
    'HR',
    'AR',
    'HVhp3ms',
    'AVhp3ms',
    'HVqcc',
    'AVqcc',
    'HNcmsa',
    'ANcmsa',
    'V-AAI-3S',
    'P-1NS',
    'CONJ',
  ].map((c) => [c, entry(c, { summary: c.startsWith('A') ? `Aramaic ${c}` : `other ${c}` })] as const),
);
const bothLanguages: BibleRepo = { ...stub, morphologyCode: (code) => sameLetters.get(code) ?? null };

const summariesOf = (input: string): string[] => {
  const r = resolveMorphology(bothLanguages, input);
  assert.ok(r.ok, input);
  return r.value.map((e) => e.code);
};

void test('later parts of an Aramaic compound take the Aramaic letter, not the Hebrew one', () => {
  assert.deepEqual(summariesOf('AC/Vhp3ms'), ['AC', 'AVhp3ms']);
  assert.deepEqual(summariesOf('AR/Vqcc'), ['AR', 'AVqcc']);
  assert.deepEqual(summariesOf('AR/C/Ncmsa'), ['AR', 'AC', 'ANcmsa']);
  assert.deepEqual(summariesOf('HC/Vhp3ms'), ['HC', 'HVhp3ms']);
  assert.deepEqual(summariesOf('HR/Vqcc'), ['HR', 'HVqcc']);
});

void test('the letter of the first part also decides the part after a Ketiv and Qere separator', () => {
  assert.deepEqual(summariesOf('AVhp3ms//Ncmsa'), ['AVhp3ms', 'ANcmsa']);
  assert.deepEqual(summariesOf('HVhp3ms//Ncmsa'), ['HVhp3ms', 'HNcmsa']);
});

void test('a first part without a letter is Hebrew and its letter carries on', () => {
  assert.deepEqual(summariesOf('C/Vhp3ms'), ['HC', 'HVhp3ms']);
});

void test('a later part with its own letter is still found', () => {
  assert.deepEqual(summariesOf('AC/HVhp3ms'), ['AC', 'HVhp3ms']);
});

void test('Greek compounds look every part up as written', () => {
  assert.deepEqual(summariesOf('P-1NS + CONJ'), ['P-1NS', 'CONJ']);
  // After a Greek first part a bare Hebrew-looking part is not given a letter.
  const r = resolveMorphology(bothLanguages, 'P-1NS + C');
  assert.ok(!r.ok);
});

void test('an unknown whole code, or any unknown part, is an error naming it', () => {
  assert.deepEqual(codesOf('Xyz'), '{"kind":"unknown_morph_code","input":"Xyz"}');
  assert.deepEqual(codesOf('HC/Xyz'), '{"kind":"unknown_morph_code","input":"Xyz","within":"HC/Xyz"}');
  assert.deepEqual(codesOf('Xyz/HC'), '{"kind":"unknown_morph_code","input":"Xyz","within":"Xyz/HC"}');
  assert.deepEqual(codesOf('HC/'), '{"kind":"unknown_morph_code","input":"","within":"HC/"}');
  assert.deepEqual(codesOf('/'), '{"kind":"unknown_morph_code","input":"","within":"/"}');
  assert.deepEqual(codesOf('V-AAI-3S+CONJ'), '{"kind":"unknown_morph_code","input":"V-AAI-3S+CONJ"}');
});

void test('the text has the code and summary, then the elements that are not empty', () => {
  assert.equal(
    formatMorphology([entry('HVqw3ms')]),
    'HVqw3ms — summary of HVqw3ms\nParsing: parsing of HVqw3ms\nMeaning: meaning of HVqw3ms\nExample: example of HVqw3ms',
  );
  assert.equal(
    formatMorphology([entry('HC', { parsing: '', example: '' })]),
    'HC — summary of HC\nMeaning: meaning of HC',
  );
  assert.equal(formatMorphology([entry('HC', { summary: '', parsing: '', meaning: '', example: '' })]), 'HC');
});

void test('parts are separated by a blank line', () => {
  const text = formatMorphology([
    entry('HC', { meaning: '', parsing: '', example: '' }),
    entry('HVqw3ms', { parsing: '', meaning: '', example: '' }),
  ]);
  assert.equal(text, 'HC — summary of HC\n\nHVqw3ms — summary of HVqw3ms');
});

void test('the tool returns text and the structured parts', () => {
  const result = explainMorphology.call({ code: 'HC/Vqw3ms' }, stub);
  assert.equal(result.isError, undefined);
  const structured = outputSchema.parse(result.structuredContent);
  assert.deepEqual(
    structured.parts.map((p) => p.code),
    ['HC', 'HVqw3ms'],
  );
  assert.deepEqual(structured.parts[1], {
    code: 'HVqw3ms',
    parsing: 'parsing of HVqw3ms',
    summary: 'summary of HVqw3ms',
    meaning: 'meaning of HVqw3ms',
    example: 'example of HVqw3ms',
  });
  assert.equal(textOf(result), formatMorphology(structured.parts.map((p) => entry(p.code))));
});

void test('an unknown code is an error with the fix hint', () => {
  const result = explainMorphology.call({ code: 'G:N-M' }, stub);
  assert.equal(result.isError, true);
  assert.match(
    textOf(result),
    /^Morphology code "G:N-M" was not found\. Use a full code as get_verse shows it/,
  );
});

void test('input is trimmed and bounded to 1..80 characters', () => {
  assert.deepEqual(inputSchema.parse({ code: '  V-AAI-3S  ' }), { code: 'V-AAI-3S' });
  assert.ok(inputSchema.safeParse({ code: 'x'.repeat(80) }).success);
  assert.ok(!inputSchema.safeParse({ code: 'x'.repeat(81) }).success);
  assert.ok(!inputSchema.safeParse({ code: '' }).success);
  assert.ok(!inputSchema.safeParse({ code: '   ' }).success);
  assert.ok(!inputSchema.safeParse({}).success);
});

void test('the tool is named, read-only by construction and described in the usual four parts', () => {
  assert.equal(explainMorphology.name, 'explain_morphology');
  assert.equal(explainMorphology.title, 'Explain a morphology code');
  for (const [key, sentence] of Object.entries(descriptionParts)) {
    assert.ok(sentence.length > 40 && sentence.endsWith('.'), key);
  }
  assert.match(descriptionParts.not, /^It does not /);
  assert.equal(explainMorphology.description, description);
  assert.match(description, /morphology: true/);
});
