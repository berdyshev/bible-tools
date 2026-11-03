import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { z } from 'zod/v4';
import { err, ok } from '../../src/domain/result.ts';
import { defineTool, TOOL_ANNOTATIONS, versificationSchema } from '../../src/tools/shared.ts';
import { fixtureDb } from '../helpers/fixture-db.ts';
import { createBibleRepo } from '../../src/data/repo.ts';

const repo = createBibleRepo(fixtureDb());
const input = z.object({ n: z.number() });
const output = z.object({ doubled: z.number() });

const tool = defineTool({
  name: 'double',
  title: 'Double',
  description: 'Doubles a number.',
  input,
  output,
  run: ({ n }) => {
    if (n < 0) return err({ kind: 'malformed_strong', input: String(n) });
    if (n === 0) throw new Error('secret detail');
    return ok({ text: `result ${n * 2}`, structured: { doubled: n * 2 } });
  },
});

void test('a successful run returns text and structured content without isError', () => {
  assert.deepEqual(tool.call({ n: 2 }, repo), {
    content: [{ type: 'text', text: 'result 4' }],
    structuredContent: { doubled: 4 },
  });
});

void test('a run without structured output returns text only', () => {
  const plain = defineTool({
    name: 'plain',
    title: 'Plain',
    description: 'd',
    input,
    run: () => ok({ text: 'hello' }),
  });
  assert.deepEqual(plain.call({ n: 1 }, repo), { content: [{ type: 'text', text: 'hello' }] });
});

void test('an input error becomes isError with the fix hint', () => {
  assert.deepEqual(tool.call({ n: -1 }, repo), {
    content: [
      {
        type: 'text',
        text: 'Malformed Strong\'s number "-1". Use H or G, then 1–4 digits (zero-padding optional) and an optional sense letter, e.g. "H1254" or "H7704G"',
      },
    ],
    isError: true,
  });
});

void test('an unexpected throw is logged and replaced by a generic message', () => {
  const log = mock.method(console, 'error', () => undefined);
  try {
    const result = tool.call({ n: 0 }, repo);
    assert.equal(result.isError, true);
    assert.deepEqual(result.content, [
      { type: 'text', text: 'Internal error while running double; the server log has details.' },
    ]);
    assert.equal(log.mock.callCount(), 1);
    assert.match(String(log.mock.calls[0]?.arguments[0]), /secret detail/);
  } finally {
    log.mock.restore();
  }
});

void test('tools are read-only and closed-world', () => {
  assert.deepEqual(TOOL_ANNOTATIONS, { readOnlyHint: true, idempotentHint: true, openWorldHint: false });
});

void test('versification accepts eng, heb and nothing; anything else gets the custom message', () => {
  assert.equal(versificationSchema.parse(undefined), undefined);
  assert.equal(versificationSchema.parse('heb'), 'heb');
  assert.equal(versificationSchema.parse('eng'), 'eng');
  const bad = versificationSchema.safeParse('lxx');
  assert.equal(bad.success, false);
  assert.equal(
    bad.error?.issues[0]?.message,
    'versification must be "eng" (English/NRSV, default) or "heb" (Hebrew/Leningrad)',
  );
});
