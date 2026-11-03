import { normalizeBook, type Book } from './books.ts';
import type { InputError } from './errors.ts';
import { err, ok, type Result } from './result.ts';

/** English (NRSV) or Hebrew (Leningrad) chapter and verse numbering. */
export type Versification = 'eng' | 'heb';

/** A single verse. */
export type VerseRef = {
  readonly kind: 'verse';
  readonly book: Book;
  readonly chapter: number;
  readonly verse: number;
  readonly versification: Versification;
};

const BOOK = String.raw`(?<book>(?:\d\s*)?\p{L}[\p{L}\s.]*?)`;
const VERSE_RE = new RegExp(String.raw`^${BOOK}\s*(?<chapter>\d+)\s*:\s*(?<verse>\d+)$`, 'u');
// A chapter alone ("Ruth 1") or a verse/chapter range ("Ruth 1:2-3", "Ruth 1:2-2:3").
const SPAN_RE = new RegExp(String.raw`^${BOOK}\s*\d+(?:\s*:\s*\d+(?:\s*[-–—]\s*(?:\d+\s*:\s*)?\d+)?)?$`, 'u');

export const parseRef = (
  input: string,
  versification: Versification = 'eng',
): Result<VerseRef, InputError> => {
  const text = input.trim();
  const verseMatch = VERSE_RE.exec(text);
  const spanMatch = verseMatch === null ? SPAN_RE.exec(text) : null;
  const groups = (verseMatch ?? spanMatch)?.groups;
  const bookText = groups?.['book'];
  if (bookText === undefined) return err({ kind: 'malformed_reference', input });

  const book = normalizeBook(bookText);
  if (!book.ok) return book;
  if (verseMatch === null) return err({ kind: 'range_not_supported', input });

  const chapter = Number(groups?.['chapter']);
  const verse = Number(groups?.['verse']);
  const max = maxChapter(book.value, versification);
  if (chapter < 1 || chapter > max) {
    return err({ kind: 'chapter_out_of_range', book: book.value.name, chapter, max });
  }
  return ok({ kind: 'verse', book: book.value, chapter, verse, versification });
};

export const formatRef = (ref: VerseRef): string => `${ref.book.name} ${ref.chapter}:${ref.verse}`;

const maxChapter = (book: Book, versification: Versification): number =>
  versification === 'heb' ? (book.hebChapters ?? book.chapters) : book.chapters;

/** A run of verses, possibly crossing chapters: `Ruth 1:1-5` or `Ruth 1:20-2:3`. */
export type VerseRange = {
  readonly kind: 'range';
  readonly book: Book;
  readonly chapter: number;
  readonly verse: number;
  readonly endChapter: number;
  readonly endVerse: number;
  readonly versification: Versification;
};

/** A whole chapter, such as `Ruth 1`. */
export type ChapterRef = {
  readonly kind: 'chapter';
  readonly book: Book;
  readonly chapter: number;
  readonly versification: Versification;
};

/** Anything a passage-taking tool accepts. */
export type Passage = VerseRef | VerseRange | ChapterRef;

const PASSAGE_RE = new RegExp(
  String.raw`^${BOOK}\s*(?<chapter>\d+)(?:\s*:\s*(?<verse>\d+)(?:\s*[-–—]\s*(?:(?<endChapter>\d+)\s*:\s*)?(?<endVerse>\d+))?)?$`,
  'u',
);

/** Parses a verse, a verse range (`Ruth 1:1-5`, `Ruth 1:20-2:3`) or a whole chapter (`Ruth 1`). */
export const parsePassage = (
  input: string,
  versification: Versification = 'eng',
): Result<Passage, InputError> => {
  const text = input.trim();
  const groups = PASSAGE_RE.exec(text)?.groups;
  const bookText = groups?.['book'];
  if (bookText === undefined) return err({ kind: 'malformed_reference', input });

  const endVerseText = groups?.['endVerse'];
  if (groups?.['verse'] !== undefined && endVerseText === undefined) return parseRef(text, versification);

  const book = normalizeBook(bookText);
  if (!book.ok) return book;
  const max = maxChapter(book.value, versification);
  const chapter = Number(groups?.['chapter']);
  const endChapter = groups?.['endChapter'] === undefined ? chapter : Number(groups['endChapter']);
  for (const c of [chapter, endChapter]) {
    if (c < 1 || c > max)
      return err({ kind: 'chapter_out_of_range', book: book.value.name, chapter: c, max });
  }
  if (endVerseText === undefined) return ok({ kind: 'chapter', book: book.value, chapter, versification });

  const verse = Number(groups?.['verse']);
  const endVerse = Number(endVerseText);
  if (endChapter < chapter || (endChapter === chapter && endVerse < verse)) {
    return err({ kind: 'invalid_range', input });
  }
  return ok({ kind: 'range', book: book.value, chapter, verse, endChapter, endVerse, versification });
};

/** First and last verse of a passage, both inclusive. */
export type Span = {
  readonly book: Book;
  readonly versification: Versification;
  readonly start: { readonly chapter: number; readonly verse: number };
  readonly end: { readonly chapter: number; readonly verse: number };
};

/** The verse numbers a chapter spans; a superscription makes `first` 0. */
export type VerseBounds = { readonly first: number; readonly last: number };

/** The error for a verse outside `bounds`, the chapter's verse range (null if the text has none). */
export const verseOutOfRange = (
  book: Book,
  chapter: number,
  verse: number,
  bounds: VerseBounds | null,
): InputError => ({
  kind: 'verse_out_of_range',
  book: book.name,
  chapter,
  verse,
  min: bounds?.first ?? 1,
  max: bounds?.last ?? 0,
});

/**
 * The verses a passage covers. `bounds(chapter)` is the chapter's first and last verse number (null if
 * the text has none); a verse outside it is an error.
 */
export const spanOf = (
  passage: Passage,
  bounds: (chapter: number) => VerseBounds | null,
): Result<Span, InputError> => {
  const { book, versification } = passage;
  const startBounds = bounds(passage.chapter);
  const start = {
    chapter: passage.chapter,
    verse: passage.kind === 'chapter' ? (startBounds?.first ?? 1) : passage.verse,
  };
  const end =
    passage.kind === 'verse'
      ? start
      : passage.kind === 'range'
        ? { chapter: passage.endChapter, verse: passage.endVerse }
        : { chapter: passage.chapter, verse: startBounds?.last ?? 0 };
  for (const at of [start, end]) {
    const b = bounds(at.chapter);
    if (b === null || at.verse < b.first || at.verse > b.last)
      return err(verseOutOfRange(book, at.chapter, at.verse, b));
  }
  return ok({ book, versification, start, end });
};

/** The verses of a span in text order. */
export function* spanVerses(
  span: Span,
  bounds: (chapter: number) => VerseBounds | null,
): Generator<VerseRef> {
  const { book, versification, start, end } = span;
  for (let chapter = start.chapter; chapter <= end.chapter; chapter++) {
    const b = bounds(chapter);
    const last = chapter === end.chapter ? end.verse : (b?.last ?? 0);
    for (let verse = chapter === start.chapter ? start.verse : (b?.first ?? 1); verse <= last; verse++) {
      yield { kind: 'verse', book, chapter, verse, versification };
    }
  }
}

/** The span from `from` to the end of `span`. */
export const spanFrom = (span: Span, from: VerseRef): Span => ({
  ...span,
  start: { chapter: from.chapter, verse: from.verse },
});

/** `Ruth 1:2`, `Ruth 1:1-5` or `Ruth 1:20-2:3`: the form the parser accepts. */
export const formatSpan = ({ book, start, end }: Span): string => {
  const first = `${book.name} ${start.chapter}:${start.verse}`;
  if (start.chapter !== end.chapter) return `${first}-${end.chapter}:${end.verse}`;
  return start.verse === end.verse ? first : `${first}-${end.verse}`;
};

/** Where a concordance search looks: the whole Old Testament, one book, or one chapter. */
export type Scope =
  | { readonly kind: 'testament'; readonly testament: 'OT' }
  | { readonly kind: 'book'; readonly book: Book }
  | { readonly kind: 'chapter'; readonly book: Book; readonly chapter: number };

const SCOPE_RE = new RegExp(String.raw`^${BOOK}(?:\s*(?<chapter>\d+))?$`, 'u');
const WHOLE_OT = new Set(['', 'ot', 'all']);
const SCOPE_FORMS = ['OT', 'a book such as "Ruth"', 'a chapter such as "Ruth 2"'] as const;

export const parseScope = (
  input: string,
  versification: Versification = 'eng',
): Result<Scope, InputError> => {
  const text = input.trim();
  if (WHOLE_OT.has(text.toLowerCase())) return ok({ kind: 'testament', testament: 'OT' });

  const groups = SCOPE_RE.exec(text)?.groups;
  const bookText = groups?.['book'];
  if (bookText === undefined) return err({ kind: 'invalid_scope', input, allowed: SCOPE_FORMS });

  const book = normalizeBook(bookText);
  if (!book.ok) return book;
  const chapterText = groups?.['chapter'];
  if (chapterText === undefined) return ok({ kind: 'book', book: book.value });

  const chapter = Number(chapterText);
  const max = maxChapter(book.value, versification);
  if (chapter < 1 || chapter > max) {
    return err({ kind: 'chapter_out_of_range', book: book.value.name, chapter, max });
  }
  return ok({ kind: 'chapter', book: book.value, chapter });
};
