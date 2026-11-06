import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripTrailingPunctuation } from '../../src/domain/punctuation.ts';

void test('trailing Greek marks are removed, however many and in whatever order', () => {
  for (const [input, expected] of [
    ['λόγος,', 'λόγος'],
    ['λόγος.', 'λόγος'],
    ['Ἰωάννης.', 'Ἰωάννης'],
    ['Ἰσαάκ·', 'Ἰσαάκ'],
    ['Ἰσαάκ·', 'Ἰσαάκ'],
    ['τίς;', 'τίς'],
    ['τίς;', 'τίς'],
    ['x:', 'x'],
    ['x!', 'x'],
    ['x?', 'x'],
    ['Βαβυλῶνος.¶', 'Βαβυλῶνος'],
    ['x.,;', 'x'],
  ] as const) {
    assert.equal(stripTrailingPunctuation(input), expected, input);
  }
});

void test('letters, accents, elision marks and marks inside a word stay', () => {
  for (const word of ['λόγος', 'δι᾽', 'ἐγώ', 'a.b', '¶x', ',x', 'x]', '']) {
    assert.equal(stripTrailingPunctuation(word), word, word);
  }
});

void test('Hebrew words and their own punctuation are untouched', () => {
  for (const word of ['שָׂדֶה', 'אֶל־', 'הָאָֽרֶץ׃', 'דָּבָר׀', 'וַ/יְהִ֗י']) {
    assert.equal(stripTrailingPunctuation(word), word, word);
  }
});
