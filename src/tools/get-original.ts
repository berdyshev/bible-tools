import { z } from 'zod/v4';
import type { BibleRepo } from '../data/repo.ts';
import { formatRef, formatSpan, parsePassage, spanOf, spanVerses } from '../domain/ref.ts';
import type { Span, VerseRef } from '../domain/ref.ts';
import { err, ok } from '../domain/result.ts';
import { isNestleAland } from '../domain/text-type.ts';
import type { Book } from '../domain/books.ts';
import {
  MAX_CHARS,
  boundsIn,
  continuation,
  missingVerse,
  numberingLabel,
  originalLanguage,
} from './passage.ts';
import { defineTool, describeTool, versificationSchema } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

/** A passage longer than this is cut off at a verse boundary. */
const MAX_VERSES = 10;

export const inputSchema = z.object({
  ref: z
    .string()
    .min(1)
    .describe(
      'English book name or OSIS id + a verse (`Ruth 1:2`, `John 1:1`, `1Sam 3:4`), a verse range ' +
        `(\`Ruth 1:1-5\`, up to ${MAX_VERSES} verses; \`Ruth 1:20-2:3\` crosses chapters) or a whole chapter ` +
        '(`Ruth 1`; long passages are cut off with a hint for the next call).',
    ),
  versification: versificationSchema,
  morphology: z
    .boolean()
    .optional()
    .describe(
      "Show each word's morphology code (e.g. `V-IAI-3S`, `HC/Vqw3ms`) before the original text, for explain_morphology. Default false.",
    ),
});

export const descriptionParts: DescriptionParts = {
  what:
    'Returns the original text of a verse, verse range or chapter, word by word: Hebrew (Leningrad codex, STEPBible TAHOT) for the Old Testament, Greek (STEPBible TAGNT, the Nestlé-Aland text) for the New Testament: ' +
    "transliteration, Strong's number, a literal English gloss and the original text; proper names are marked.",
  when: "Use it to see what stands behind a translated word, to justify a literal reading, or to get the Strong's numbers for lookup_strong.",
  output:
    "Output: a header line, then one line per word in reading order: `position. transliteration  strong  gloss  [name: kind]  original` (with `morphology: true` the morphology code is added before the original, e.g. `3. ēn  G1510  was  V-IAI-3S  ἦν`); in Hebrew '/' in a gloss separates prefix, root and suffix (e.g. `and/ name`). " +
    'A New Testament verse that the Nestlé-Aland text lacks (e.g. `John 5:4`) is shown from the traditional text and says so on a line after its heading. ' +
    `A range such as \`Ruth 1:1-5\` or a chapter such as \`Ruth 1\` is grouped by verse, each with a \`Ruth 1:2\` sub-header, and is capped at ${MAX_VERSES} verses and about ${MAX_CHARS} characters: a longer passage ends with \`truncated — call get_original again with "Ruth 1:7-12"\`.`,
  not: 'It does not translate the verse and gives no definitions: use lookup_strong for meanings and get_names for a clean list of the names in a verse. There is no get_passage tool: pass a range to get_original.',
};

export const description = describeTool(descriptionParts);

/** The parts of a word that a verse line shows. */
export type VerseWord = {
  readonly position: number;
  readonly transliteration: string;
  readonly strong: string | null;
  readonly gloss: string;
  readonly original: string;
  /** STEPBible word type, e.g. "NKO"; only the Greek text's types say whether a word is Nestlé-Aland. */
  readonly textType: string;
  /** Morphology code as the source gives it, e.g. "V-IAI-3S" or "HC/Vqw3ms". */
  readonly morphRaw: string;
  readonly isProperName: boolean;
  readonly nameKind: string | null;
};

// Latin fields come first and the original text last: a line that starts with Hebrew letters is laid out
// right-to-left by bidi-aware renderers and appears reversed.
const formatWord = (w: VerseWord, morphology: boolean): string => {
  const name = w.isProperName ? `  [name: ${w.nameKind ?? 'unknown'}]` : '';
  const code = morphology ? `  ${w.morphRaw === '' ? '—' : w.morphRaw}` : '';
  return `${w.position}. ${w.transliteration}  ${w.strong ?? '—'}  ${w.gloss}${name}${code}  ${w.original}`;
};

const header = (label: string, book: Book, versification: VerseRef['versification']): string => {
  const language = originalLanguage(book) === 'Greek' ? 'Greek' : 'Hebrew, read right to left';
  return `${label} (${numberingLabel(versification)}) — ${language}; Strong's numbers per STEPBible`;
};

const NOT_IN_NA = 'Not in the Nestlé-Aland text; shown from the traditional text.';

/** The words of a New Testament verse that are shown although the Nestlé-Aland text lacks the verse. */
const notInNestleAland = (book: Book, words: readonly VerseWord[]): boolean =>
  book.testament === 'NT' && words.length > 0 && !words.some((w) => isNestleAland(w.textType));

const verseLines = (ref: VerseRef, words: readonly VerseWord[], morphology: boolean): string[] => [
  ...(notInNestleAland(ref.book, words) ? [NOT_IN_NA] : []),
  ...words.map((w) => formatWord(w, morphology)),
];

export const formatVerse = (ref: VerseRef, words: readonly VerseWord[], morphology = false): string =>
  [header(formatRef(ref), ref.book, ref.versification), ...verseLines(ref, words, morphology)].join('\n');

/** A verse of a passage with its words. */
export type PassageVerse = { readonly ref: VerseRef; readonly words: readonly VerseWord[] };

/**
 * A passage grouped by verse, each verse under its own `Ruth 1:2` line. Verses are taken from `verses`
 * until the next one would pass the verse or character cap (the first is always shown); the output
 * then ends with the call that returns the rest.
 */
export const formatPassage = (span: Span, verses: Iterable<PassageVerse>, morphology = false): string => {
  const lines = [header(formatSpan(span), span.book, span.versification)];
  let length = lines[0]?.length ?? 0;
  let shown = 0;
  for (const { ref, words } of verses) {
    const block = [formatRef(ref), ...verseLines(ref, words, morphology)].join('\n');
    if (shown > 0 && (shown === MAX_VERSES || length + 1 + block.length > MAX_CHARS)) {
      lines.push(continuation('get_original', span, ref));
      break;
    }
    lines.push(block);
    length += 1 + block.length;
    shown++;
  }
  return lines.join('\n');
};

function* versesWithWords(repo: BibleRepo, span: Span): Generator<PassageVerse> {
  const last = boundsIn(repo, span.book, span.versification);
  for (const ref of spanVerses(span, last)) {
    const words = repo.verseWords(ref);
    if (words.length > 0) yield { ref, words };
  }
}

export const getOriginal = defineTool({
  name: 'get_original',
  title: 'Original-language words of a verse',
  description,
  input: inputSchema,
  run: ({ ref, versification, morphology }, repo) => {
    const parsed = parsePassage(ref, versification ?? 'eng');
    if (!parsed.ok) return parsed;
    if (parsed.value.kind !== 'verse') {
      const span = spanOf(parsed.value, boundsIn(repo, parsed.value.book, parsed.value.versification));
      return span.ok
        ? ok({ text: formatPassage(span.value, versesWithWords(repo, span.value), morphology === true) })
        : span;
    }
    const words = repo.verseWords(parsed.value);
    if (words.length === 0) {
      return err(missingVerse(repo, parsed.value));
    }
    return ok({ text: formatVerse(parsed.value, words, morphology === true) });
  },
});
