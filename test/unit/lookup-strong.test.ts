import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CHARS } from '../../src/tools/passage.ts';
import { description, formatEntry, formatMenu, outputSchema } from '../../src/tools/lookup-strong.ts';

const entry = {
  strong: 'H1234B',
  original: 'אבג',
  gloss: 'thing',
  transliteration: 'a.vag',
  morph: 'H:N-M',
  meaning: '  a thing; stuff \n',
};

void test('formats an entry with trimmed meaning and other senses', () => {
  assert.equal(
    formatEntry(entry, [{ strong: 'H1234A', original: 'x', gloss: 'other' }]),
    'H1234B  אבג  a.vag  [H:N-M]  «thing»\na thing; stuff\nOther senses: H1234A «other»',
  );
});

void test('drops the leading gloss separator from the meaning', () => {
  assert.equal(
    formatEntry({ ...entry, meaning: ': country/field\n1) field' }, []),
    'H1234B  אבג  a.vag  [H:N-M]  «thing»\ncountry/field\n1) field',
  );
});

void test('omits the other-senses line when there are none', () => {
  assert.equal(formatEntry(entry, []), 'H1234B  אבג  a.vag  [H:N-M]  «thing»\na thing; stuff');
});

void test('formats a menu with one line per sense', () => {
  assert.equal(
    formatMenu('H1234', [entry, { strong: 'H1234A', original: 'x', gloss: 'other' }]),
    'H1234 has 2 senses; pick the one get_verse shows for your verse and call again:\n' +
      'H1234B  אבג  «thing»\nH1234A  x  «other»',
  );
});

void test('the description is generic', () => {
  assert.doesNotMatch(description, /german|russian|elberfelder|rbo|name table/i);
  assert.match(description, /does not show where else/);
});

void test('the output schema rejects an unknown kind', () => {
  assert.equal(outputSchema.safeParse({ kind: 'other', senses: [] }).success, false);
  assert.equal(outputSchema.safeParse({ kind: 'menu', senses: [] }).success, true);
});

const longMeaning = Array.from({ length: 400 }, (_, i) => `${i + 1}) sense number ${i + 1}`).join('\n');
const others = [{ strong: 'H1234A', original: 'x', gloss: 'other' }];

void test('a long meaning is cut at a line break and marked, within the budget', () => {
  for (const senses of [[], others]) {
    const text = formatEntry({ ...entry, meaning: longMeaning }, senses);
    assert.ok(text.length <= MAX_CHARS, String(text.length));
    assert.ok(text.length > MAX_CHARS - 40, 'uses the budget');
    const lines = text.split('\n');
    const marker = lines.indexOf('… (entry shortened)');
    assert.ok(marker > 1);
    const kept = lines.slice(1, marker);
    assert.deepEqual(kept, longMeaning.split('\n').slice(0, kept.length), 'whole lines only');
    assert.equal(lines.at(-1), senses.length === 0 ? '… (entry shortened)' : 'Other senses: H1234A «other»');
  }
});

void test('a meaning that fits is untouched, even right at the limit', () => {
  const head = 'H1234B  אבג  a.vag  [H:N-M]  «thing»';
  const fits = 'x'.repeat(MAX_CHARS - head.length - 1);
  const text = formatEntry({ ...entry, meaning: fits }, []);
  assert.equal(text, `${head}\n${fits}`);
  assert.equal(text.length, MAX_CHARS);
  assert.ok(formatEntry({ ...entry, meaning: `${fits}x` }, []).endsWith('… (entry shortened)'));
});

void test('a long meaning without a line break is cut hard and marked', () => {
  const text = formatEntry({ ...entry, meaning: 'y'.repeat(5000) }, []);
  assert.ok(text.length <= MAX_CHARS);
  assert.ok(text.endsWith('y\n… (entry shortened)'));
});
