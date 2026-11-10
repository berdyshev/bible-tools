import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hint, type InputError } from '../../src/domain/errors.ts';

const cases: readonly (readonly [string, InputError, string])[] = [
  [
    'unknown_book truncates the id list',
    { kind: 'unknown_book', input: 'Руфь', validIds: ['Gen', 'Exod', 'Lev', 'Num', 'Deut'] },
    'Unknown book "Руфь". Use English OSIS ids or names: Gen, Exod, Lev, …',
  ],
  [
    'unknown_book lists a short id list in full',
    { kind: 'unknown_book', input: 'X', validIds: ['Gen', 'Exod', 'Lev'] },
    'Unknown book "X". Use English OSIS ids or names: Gen, Exod, Lev',
  ],
  [
    'malformed_reference',
    { kind: 'malformed_reference', input: 'Ruth one' },
    'Malformed reference "Ruth one". Use "Book chapter:verse", e.g. "Ruth 1:1"',
  ],
  [
    'chapter_out_of_range',
    { kind: 'chapter_out_of_range', book: 'Ruth', chapter: 9, max: 4 },
    'Ruth has no chapter 9. Use a chapter from 1 to 4',
  ],
  [
    'verse_out_of_range',
    { kind: 'verse_out_of_range', book: 'Ruth', chapter: 1, verse: 99, min: 1, max: 22 },
    'Ruth 1 has no verse 99. Use a verse from 1 to 22',
  ],
  [
    'invalid_range',
    { kind: 'invalid_range', input: 'Ruth 1:5-2' },
    'Range "Ruth 1:5-2" ends before it starts. Use an ascending range, e.g. "Ruth 1:1-5"',
  ],
  [
    'range_not_supported',
    { kind: 'range_not_supported', input: 'Ruth 1:1-3' },
    'Ranges are not supported here: "Ruth 1:1-3". Pass a single verse, e.g. "Ruth 1:1"',
  ],
  [
    'malformed_strong',
    { kind: 'malformed_strong', input: 'X12' },
    'Malformed Strong\'s number "X12". Use H or G, then a number (up to 4 digits for H, 5 for G; zero-padding optional) and an optional sense letter, e.g. "H1254", "H7704G" or "G3056"',
  ],
  [
    'unknown_strong',
    { kind: 'unknown_strong', input: 'H99999' },
    'Strong\'s number "H99999" was not found. Check the number or try search_lexicon',
  ],
  [
    'unknown_strong with the senses of its base',
    { kind: 'unknown_strong', input: 'H7704Z', senses: ['H7704A', 'H7704G'] },
    'Strong\'s number "H7704Z" was not found. Its base number has the senses H7704A, H7704G; use one of them or try search_lexicon',
  ],
  [
    'unknown_strong with an empty list of senses',
    { kind: 'unknown_strong', input: 'H9999Z', senses: [] },
    'Strong\'s number "H9999Z" was not found. Check the number or try search_lexicon',
  ],
  [
    'unknown_morph_code',
    { kind: 'unknown_morph_code', input: 'Xyz' },
    'Morphology code "Xyz" was not found. Use a full code as get_original shows it with morphology: true, e.g. "V-AAI-3S" or "HVqw3ms"; brief lexical codes such as "G:N-M" are not explained',
  ],
  [
    'unknown_morph_code in a compound',
    { kind: 'unknown_morph_code', input: 'Xyz', within: 'HC/Xyz' },
    'Morphology code "Xyz" (in "HC/Xyz") was not found. Use a full code as get_original shows it with morphology: true, e.g. "V-AAI-3S" or "HVqw3ms"; brief lexical codes such as "G:N-M" are not explained',
  ],
  [
    'scope_wrong_testament (Greek number)',
    { kind: 'scope_wrong_testament', input: 'G3056', scope: 'OT', testament: 'NT' },
    'Strong\'s number "G3056" is Greek and occurs only in the New Testament, but the scope "OT" is in the Old Testament. Use scope "NT", a New Testament book or chapter such as "John 1", or leave scope out',
  ],
  [
    'scope_wrong_testament (Hebrew number)',
    { kind: 'scope_wrong_testament', input: 'H7704G', scope: 'John', testament: 'OT' },
    'Strong\'s number "H7704G" is Hebrew and occurs only in the Old Testament, but the scope "John" is in the New Testament. Use scope "OT", an Old Testament book or chapter such as "Ruth 2", or leave scope out',
  ],
  [
    'invalid_scope',
    { kind: 'invalid_scope', input: 'psalms', allowed: ['book', 'chapter', 'verse'] },
    'Invalid scope "psalms". Use one of: book, chapter, verse',
  ],
];

for (const [name, error, expected] of cases) {
  void test(`hint: ${name}`, () => {
    assert.equal(hint(error), expected);
  });
}

void test('hint output is a single line for every kind', () => {
  for (const [, error] of cases) assert.equal(hint(error).includes('\n'), false);
});
