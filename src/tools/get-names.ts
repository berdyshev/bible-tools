import { z } from 'zod/v4';
import { formatRef, formatSpan, parsePassage, spanOf, spanVerses } from '../domain/ref.ts';
import type { Span, VerseRef } from '../domain/ref.ts';
import { err, ok } from '../domain/result.ts';
import { groupNames, kindLabel, mergeNames } from '../domain/names.ts';
import type { NameGroup, NameVerse, PassageName } from '../domain/names.ts';
import type { BibleRepo } from '../data/repo.ts';
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

export const inputSchema = z.object({
  ref: z
    .string()
    .min(1)
    .describe(
      'English book name or OSIS id + a verse (`Ruth 1:2`, `John 1:6`), a verse range (`Ruth 1:1-5`; `Ruth 1:20-2:3` crosses chapters) ' +
        `or a whole chapter (\`Ruth 1\`). There is no verse cap: a long passage is cut at about ${MAX_CHARS} characters with a hint for the next call.`,
    ),
  versification: versificationSchema,
});

export const descriptionParts: DescriptionParts = {
  what: "Lists the proper names of a verse, verse range or chapter as identified in the Hebrew (Old Testament) or Greek (New Testament) original (STEPBible morphology): persons, places, gentilics (e.g. Ephrathite) and, in Hebrew, divine names/titles, each with English name, Strong's number, kind, transliteration, word positions and original form. Multi-word names (Beth-lehem) are merged and repeated names are listed once, also across a passage.",
  when: 'Use it before translating or checking a verse to know exactly which names occur in it: a translation may hide names inside compounds or derived forms.',
  output:
    'Output: a header line, then one line per name: `- name  strong  (kind)  transliteration  words positions [— description]  original`. ' +
    "For a range such as `Ruth 1:1-5` or a chapter such as `Ruth 1`, names are deduplicated by Strong's number and each lists its places as `at 1:2 w6; 1:5 w1,2` (verse, word positions). " +
    `A passage is capped at about ${MAX_CHARS} characters: a longer one is cut at a verse boundary and ends with \`truncated — call get_names again with "Ruth 1:7-12"\`.`,
  not: 'It does not give forms of the names in other languages; use get_verse for the full word-by-word text.',
};

export const description = describeTool(descriptionParts);

// The original text goes last on the line so bidi-aware renderers keep the line left-to-right.
const formatName = (g: NameGroup): string => {
  const note = g.note === null ? '' : ` — ${g.note}`;
  return `- ${g.name}  ${g.strong ?? '—'}  (${kindLabel(g.kind)})  ${g.transliteration}  words ${g.positions.join(',')}${note}  ${g.original}`;
};

export const formatNames = (ref: VerseRef, groups: readonly NameGroup[]): string => {
  const header = `${formatRef(ref)} (${numberingLabel(ref.versification)}) — proper names (${originalLanguage(ref.book)} original)`;
  return [
    header,
    ...(groups.length === 0 ? ['No proper names in this verse.'] : groups.map(formatName)),
  ].join('\n');
};

const formatPassageName = (g: PassageName): string => {
  const note = g.note === null ? '' : ` — ${g.note}`;
  const places = g.occurrences.map((o) => `${o.chapter}:${o.verse} w${o.positions.join(',')}`).join('; ');
  return `- ${g.name}  ${g.strong ?? '—'}  (${kindLabel(g.kind)})  ${g.transliteration}  at ${places}${note}  ${g.original}`;
};

const renderPassage = (span: Span, verses: readonly NameVerse[]): string => {
  const header = `${formatSpan(span)} (${numberingLabel(span.versification)}) — proper names (${originalLanguage(span.book)} original)`;
  const names = mergeNames(verses);
  return [
    header,
    ...(names.length === 0 ? ['No proper names in this passage.'] : names.map(formatPassageName)),
  ].join('\n');
};

/**
 * The names of a passage, merged across verses. Verses are taken from `verses` until adding the next
 * would pass the character cap (the first is always shown); the output then ends with the call that
 * returns the rest.
 */
export const formatPassageNames = (
  span: Span,
  verses: Iterable<NameVerse & { readonly ref: VerseRef }>,
): string => {
  const shown: NameVerse[] = [];
  for (const verse of verses) {
    if (shown.length > 0 && renderPassage(span, [...shown, verse]).length > MAX_CHARS) {
      return `${renderPassage(span, shown)}\n${continuation('get_names', span, verse.ref)}`;
    }
    shown.push(verse);
  }
  return renderPassage(span, shown);
};

function* versesWithNames(repo: BibleRepo, span: Span): Generator<NameVerse & { readonly ref: VerseRef }> {
  for (const ref of spanVerses(span, boundsIn(repo, span.book, span.versification))) {
    const groups = groupNames(
      repo
        .nameWords(ref)
        .map((word) => ({ word, record: word.strong === null ? null : repo.tipnr(word.strong) })),
    );
    yield { ref, chapter: ref.chapter, verse: ref.verse, groups };
  }
}

export const getNames = defineTool({
  name: 'get_names',
  title: 'Proper names in a passage',
  description,
  input: inputSchema,
  run: ({ ref, versification }, repo) => {
    const parsed = parsePassage(ref, versification ?? 'eng');
    if (!parsed.ok) return parsed;
    if (parsed.value.kind !== 'verse') {
      const span = spanOf(parsed.value, boundsIn(repo, parsed.value.book, parsed.value.versification));
      return span.ok ? ok({ text: formatPassageNames(span.value, versesWithNames(repo, span.value)) }) : span;
    }
    const words = repo.nameWords(parsed.value);
    if (words.length === 0 && repo.verseWords(parsed.value).length === 0) {
      return err(missingVerse(repo, parsed.value));
    }
    const groups = groupNames(
      words.map((word) => ({ word, record: word.strong === null ? null : repo.tipnr(word.strong) })),
    );
    return ok({ text: formatNames(parsed.value, groups) });
  },
});
