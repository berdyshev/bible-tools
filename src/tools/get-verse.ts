import { z } from 'zod/v4';
import { formatRef, parseRef } from '../domain/ref.ts';
import type { VerseRef } from '../domain/ref.ts';
import { err, ok } from '../domain/result.ts';
import { defineTool, versificationSchema } from './shared.ts';

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

export const description =
  'Returns the Hebrew original (Leningrad codex, STEPBible TAHOT) of one Old Testament verse, word by word: ' +
  "transliteration, Strong's number, a literal English gloss and the Hebrew text; proper names are marked. " +
  "Use it to see what stands behind a translated word, to justify a literal reading, or to get the Strong's numbers " +
  'for lookup_strong. ' +
  'Output: a header line, then one line per word in reading order: ' +
  '`position. transliteration  strong  gloss  [name: kind]  hebrew`; ' +
  "'/' in a gloss separates prefix, root and suffix (e.g. `and/ name`). " +
  'It does not translate the verse and gives no definitions: use lookup_strong for meanings and get_names ' +
  'for a clean list of the names in a verse.';

/** The parts of a word that a verse line shows. */
export type VerseWord = {
  readonly position: number;
  readonly transliteration: string;
  readonly strong: string | null;
  readonly gloss: string;
  readonly hebrew: string;
  readonly isProperName: boolean;
  readonly nameKind: string | null;
};

// Latin fields come first and the Hebrew last: a line that starts with Hebrew letters is laid out
// right-to-left by bidi-aware renderers and appears reversed.
const formatWord = (w: VerseWord): string => {
  const name = w.isProperName ? `  [name: ${w.nameKind ?? 'unknown'}]` : '';
  return `${w.position}. ${w.transliteration}  ${w.strong ?? '—'}  ${w.gloss}${name}  ${w.hebrew}`;
};

export const formatVerse = (ref: VerseRef, words: readonly VerseWord[]): string => {
  const numbering = ref.versification === 'heb' ? 'Hebrew numbering' : 'English numbering';
  const header = `${formatRef(ref)} (${numbering}) — Hebrew, read right to left; Strong's numbers per STEPBible`;
  return [header, ...words.map(formatWord)].join('\n');
};

export const getVerse = defineTool({
  name: 'get_verse',
  title: 'Hebrew words of a verse',
  description,
  input: inputSchema,
  run: ({ ref, versification }, repo) => {
    const parsed = parseRef(ref, versification ?? 'eng');
    if (!parsed.ok) return parsed;
    const words = repo.verseWords(parsed.value);
    if (words.length === 0) {
      const { book, chapter, verse } = parsed.value;
      return err({
        kind: 'verse_out_of_range',
        book: book.name,
        chapter,
        verse,
        max: repo.lastVerse(parsed.value),
      });
    }
    return ok({ text: formatVerse(parsed.value, words) });
  },
});
