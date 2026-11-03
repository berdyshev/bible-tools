import { z } from 'zod/v4';
import { formatRef, parseRef } from '../domain/ref.ts';
import type { VerseRef } from '../domain/ref.ts';
import { err, ok } from '../domain/result.ts';
import { groupNames, kindLabel } from '../domain/names.ts';
import type { NameGroup } from '../domain/names.ts';
import { defineTool, describeTool, versificationSchema } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

export const inputSchema = z.object({
  ref: z
    .string()
    .min(1)
    .describe(
      'One verse: English book name or OSIS id + chapter:verse, e.g. `Ruth 1:2`, `Gen 12:10`, `1Sam 3:4`. ' +
        'Ranges such as `Ruth 1:2-3` are not supported: call once per verse.',
    ),
  versification: versificationSchema,
});

export const descriptionParts: DescriptionParts = {
  what: "Lists the proper names of one Old Testament verse as identified in the Hebrew original (STEPBible morphology): persons, places, gentilics (e.g. Ephrathite) and divine names/titles, each with English name, Strong's number, kind, transliteration, word positions and Hebrew form. Multi-word names (Beth-lehem) are merged and repeated names are listed once.",
  when: 'Use it before translating or checking a verse to know exactly which names occur in it: a translation may hide names inside compounds or derived forms.',
  output:
    'Output: a header line, then one line per name: `- name  strong  (kind)  transliteration  words positions [— description]  hebrew`.',
  not: 'It does not give forms of the names in other languages; use get_verse for the full word-by-word text.',
};

export const description = describeTool(descriptionParts);

// Hebrew goes last on the line so bidi-aware renderers keep the line left-to-right.
const formatName = (g: NameGroup): string => {
  const note = g.note === null ? '' : ` — ${g.note}`;
  return `- ${g.name}  ${g.strong ?? '—'}  (${kindLabel(g.kind)})  ${g.transliteration}  words ${g.positions.join(',')}${note}  ${g.hebrew}`;
};

export const formatNames = (ref: VerseRef, groups: readonly NameGroup[]): string => {
  const numbering = ref.versification === 'heb' ? 'Hebrew numbering' : 'English numbering';
  const header = `${formatRef(ref)} (${numbering}) — proper names (Hebrew original)`;
  return [
    header,
    ...(groups.length === 0 ? ['No proper names in this verse.'] : groups.map(formatName)),
  ].join('\n');
};

export const getNames = defineTool({
  name: 'get_names',
  title: 'Proper names in a verse',
  description,
  input: inputSchema,
  run: ({ ref, versification }, repo) => {
    const parsed = parseRef(ref, versification ?? 'eng');
    if (!parsed.ok) return parsed;
    const words = repo.nameWords(parsed.value);
    if (words.length === 0 && repo.verseWords(parsed.value).length === 0) {
      const { book, chapter, verse } = parsed.value;
      return err({
        kind: 'verse_out_of_range',
        book: book.name,
        chapter,
        verse,
        max: repo.lastVerse(parsed.value),
      });
    }
    const groups = groupNames(
      words.map((word) => ({ word, record: word.strong === null ? null : repo.tipnr(word.strong) })),
    );
    return ok({ text: formatNames(parsed.value, groups) });
  },
});
