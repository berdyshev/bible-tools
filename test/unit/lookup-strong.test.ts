import assert from 'node:assert/strict';
import { test } from 'node:test';
import { description, formatEntry, formatMenu, outputSchema } from '../../src/tools/lookup-strong.ts';

const entry = {
  strong: 'H1234B',
  hebrew: 'אבג',
  gloss: 'thing',
  transliteration: 'a.vag',
  morph: 'H:N-M',
  meaning: '  a thing; stuff \n',
};

void test('formats an entry with trimmed meaning and other senses', () => {
  assert.equal(
    formatEntry(entry, [{ strong: 'H1234A', hebrew: 'x', gloss: 'other' }]),
    'H1234B  אבג  a.vag  [H:N-M]  «thing»\na thing; stuff\nOther senses: H1234A «other»',
  );
});

void test('omits the other-senses line when there are none', () => {
  assert.equal(formatEntry(entry, []), 'H1234B  אבג  a.vag  [H:N-M]  «thing»\na thing; stuff');
});

void test('formats a menu with one line per sense', () => {
  assert.equal(
    formatMenu('H1234', [entry, { strong: 'H1234A', hebrew: 'x', gloss: 'other' }]),
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
