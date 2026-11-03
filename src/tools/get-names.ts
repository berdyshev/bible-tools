import { formatRef, formatSpan, parsePassage, spanOf, spanVerses } from '../domain/ref.ts';
import type { Span, VerseRef } from '../domain/ref.ts';
import { err, ok } from '../domain/result.ts';
import { groupNames, kindLabel, mergeNames } from '../domain/names.ts';
import type { NameGroup, NameVerse, PassageName } from '../domain/names.ts';
import type { BibleRepo } from '../data/repo.ts';
import { inputSchema } from './get-verse.ts';
import { MAX_CHARS, continuation, lastVerseIn } from './passage.ts';
import { defineTool, describeTool } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

export const descriptionParts: DescriptionParts = {
  what: "Lists the proper names of an Old Testament verse, verse range or chapter as identified in the Hebrew original (STEPBible morphology): persons, places, gentilics (e.g. Ephrathite) and divine names/titles, each with English name, Strong's number, kind, transliteration, word positions and Hebrew form. Multi-word names (Beth-lehem) are merged and repeated names are listed once, also across a passage.",
  when: 'Use it before translating or checking a verse to know exactly which names occur in it: a translation may hide names inside compounds or derived forms.',
  output:
    'Output: a header line, then one line per name: `- name  strong  (kind)  transliteration  words positions [— description]  hebrew`. ' +
    "For a range such as `Ruth 1:1-5` or a chapter such as `Ruth 1`, names are deduplicated by Strong's number and each lists its places as `at 1:2 w6; 1:5 w1,2` (verse, word positions). " +
    `A passage is capped at about ${MAX_CHARS} characters: a longer one is cut at a verse boundary and ends with \`truncated — call get_names again with "Ruth 1:7-12"\`.`,
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

const formatPassageName = (g: PassageName): string => {
  const note = g.note === null ? '' : ` — ${g.note}`;
  const places = g.occurrences.map((o) => `${o.chapter}:${o.verse} w${o.positions.join(',')}`).join('; ');
  return `- ${g.name}  ${g.strong ?? '—'}  (${kindLabel(g.kind)})  ${g.transliteration}  at ${places}${note}  ${g.hebrew}`;
};

const renderPassage = (span: Span, verses: readonly NameVerse[]): string => {
  const numbering = span.versification === 'heb' ? 'Hebrew numbering' : 'English numbering';
  const header = `${formatSpan(span)} (${numbering}) — proper names (Hebrew original)`;
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
  for (const ref of spanVerses(span, lastVerseIn(repo, span.book, span.versification))) {
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
      const span = spanOf(parsed.value, lastVerseIn(repo, parsed.value.book, parsed.value.versification));
      return span.ok ? ok({ text: formatPassageNames(span.value, versesWithNames(repo, span.value)) }) : span;
    }
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
