import { z } from 'zod/v4';
import type { BibleRepo, TranslationMeta, TranslationVerse } from '../data/repo.ts';
import { BOOKS } from '../domain/books.ts';
import { kjvBounds } from '../domain/kjv.ts';
import { formatSpan, parsePassage, spanOf, spanVerses } from '../domain/ref.ts';
import type { Span } from '../domain/ref.ts';
import type { InputError } from '../domain/errors.ts';
import { err, ok } from '../domain/result.ts';
import { VERSION_IDS, VERSIONS, type VersionId } from '../domain/versions.ts';
import { MAX_CHARS, MAX_VERSES, cappedPassage, type VerseBlock } from './passage.ts';
import { defineTool, describeTool } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

const versionList = VERSIONS.map((v) => `"${v.id}" (${v.title})`).join(', ');

export const inputSchema = z.object({
  ref: z
    .string()
    .min(1)
    .describe(
      'English book name or OSIS id + a verse (`Ruth 1:2`, `John 1:1`), a verse range ' +
        `(\`Ruth 1:1-5\`, up to ${MAX_VERSES} verses; \`Ruth 1:20-2:3\` crosses chapters) or a whole chapter ` +
        '(`Ruth 1`; long passages are cut off with a hint for the next call), in KJV numbering.',
    ),
  version: z
    .enum(VERSION_IDS, { error: `version must be one of ${versionList}` })
    .describe(`The translation: ${versionList}. One version per call.`),
});

export const descriptionParts: DescriptionParts = {
  what:
    'Returns the text of a verse, verse range or chapter in one public-domain or freely licensed translation: King James Version, Darby, Elberfelder 1905 (German), Ohienko (Ukrainian) or Russian Synodal, ' +
    'always in KJV verse numbering; where the translation numbers a verse differently, its own number is added at the end of the line.',
  when: 'Use it to compare how a translation renders a passage; call it once per version you need, since each call returns a single version.',
  output:
    'Output: a header line `Ruth 1:1-3 — KJV (King James Version), KJV numbering` with a legend for the markers the version uses, then one line per verse `1:2 text`, with the own number at the end (`13:1 text  [RST 13:2]`); a verse the version lacks or joins to another is a line with the number only (`8:37`), and the legend then says so. ' +
    '`[…]` means words added by the translators, except in Elberfelder 1905 where it marks readings of the traditional text that the critical text omits; `⸨…⸩` is a note of the module (KJV marginal notes). Elberfelder 1905 shows no verse numbers of its own: its module marks them inconsistently; use get_original with versification "heb" for the Hebrew numbering. ' +
    `A range is capped at ${MAX_VERSES} verses and about ${MAX_CHARS} characters: a longer passage ends with \`truncated — call get_translation again with "Ruth 1:11-22"\`. ` +
    'KJV numbering differs from the English (NRSV) numbering of get_original in a few places: Psalm titles are verse 0 there but part of verse 1 here, and 2 Corinthians 13:12-14, 3 John 1:14-15 and Revelation 12:17-18/13:1 are divided differently.',
  not: "It does not return the original-language words, Strong's numbers or definitions: use get_original for the Hebrew or Greek words, then lookup_strong.",
};

export const description = describeTool(descriptionParts);

const legend = (meta: TranslationMeta, hasEmpty: boolean): string =>
  [
    ...(meta.bracketMeaning === null ? [] : [`[..] = ${meta.bracketMeaning}`]),
    ...(meta.hasNotes ? ['⸨..⸩ = note'] : []),
    ...(meta.markers === null ? [] : [meta.markers]),
    ...(hasEmpty ? ['a verse number with no text = a verse this translation omits or joins to another'] : []),
  ]
    .map((entry) => `; ${entry}`)
    .join('');

const header = (span: Span, meta: TranslationMeta, hasEmpty: boolean): string =>
  `${formatSpan(span)} — ${meta.label} (${meta.title}), KJV numbering${legend(meta, hasEmpty)}`;

// The KJV number starts the line and the module's own number ends it, so the KJV number is always read first.
const verseLine = (chapter: number, verse: number, row: TranslationVerse | undefined, label: string) => {
  const number = `${chapter}:${verse}`;
  if (row === undefined) return number;
  const own = row.nativeRef === null ? '' : `  [${label} ${row.nativeRef}]`;
  return `${number} ${row.text}${own}`;
};

/**
 * A passage in one translation, one line per verse, within the verse and character caps; a cut passage
 * ends with the call that returns the rest.
 */
export const formatTranslation = (
  span: Span,
  meta: TranslationMeta,
  verses: readonly TranslationVerse[],
): string => {
  const byRef = new Map(verses.map((v) => [`${v.chapter}:${v.verse}`, v]));
  const hasEmpty = Array.from(spanVerses(span, kjvBounds(span.book))).some(
    (r) => !byRef.has(`${r.chapter}:${r.verse}`),
  );
  return cappedPassage(
    'get_translation',
    span,
    header(span, meta, hasEmpty),
    blocksOf(span, byRef, meta.label),
  );
};

function* blocksOf(
  span: Span,
  byRef: ReadonlyMap<string, TranslationVerse>,
  label: string,
): Generator<VerseBlock> {
  for (const ref of spanVerses(span, kjvBounds(span.book))) {
    const row = byRef.get(`${ref.chapter}:${ref.verse}`);
    yield { ref, text: verseLine(ref.chapter, ref.verse, row, label) };
  }
}

/**
 * Where a verse that KJV numbering lacks stands in it; the cases where the English numbering of get_original
 * has it. A psalm has a verse 0 there only when it has a title.
 */
const kjvNote = (e: InputError, repo: BibleRepo): InputError => {
  if (e.kind !== 'verse_out_of_range') return e;
  const ref = `${e.book} ${e.chapter}:${e.verse}`;
  const psalms = BOOKS.find((b) => b.id === 'Ps');
  const titled = (chapter: number): boolean =>
    psalms !== undefined &&
    repo.verseBounds({ kind: 'verse', book: psalms, chapter, verse: 1, versification: 'eng' })?.first === 0;
  if (e.book === 'Psalms' && e.verse === 0 && titled(e.chapter))
    return {
      ...e,
      note: `In KJV numbering a psalm title is part of verse 1: use "${e.book} ${e.chapter}:1"`,
    };
  if (ref === 'Revelation 12:18')
    return { ...e, note: 'In KJV numbering this sentence opens Revelation 13:1: use "Revelation 13:1"' };
  if (ref === '3 John 1:15')
    return { ...e, note: 'In KJV numbering this verse is part of 3 John 1:14: use "3 John 1:14"' };
  return e;
};

const metaOf = (repo: BibleRepo, version: VersionId): TranslationMeta => {
  const meta = repo.translations().find((m) => m.id === version);
  if (meta === undefined) throw new Error(`translation "${version}" is not in the database`);
  return meta;
};

export const getTranslation = defineTool({
  name: 'get_translation',
  title: 'Verse text in a translation',
  description,
  input: inputSchema,
  run: ({ ref, version }, repo) => {
    const parsed = parsePassage(ref, 'eng');
    if (!parsed.ok) return parsed;
    const span = spanOf(parsed.value, kjvBounds(parsed.value.book));
    if (!span.ok) return err(kjvNote(span.error, repo));
    const meta = metaOf(repo, version);
    return ok({ text: formatTranslation(span.value, meta, repo.translationVerses(version, span.value)) });
  },
});
