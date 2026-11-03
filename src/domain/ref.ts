import { normalizeBook, type Book } from './books.ts';
import type { InputError } from './errors.ts';
import { err, ok, type Result } from './result.ts';

/** English (NRSV) or Hebrew (Leningrad) chapter and verse numbering. */
export type Versification = 'eng' | 'heb';

/**
 * A single verse. `kind` leaves room for a range variant to join a `Ref` union later
 * without changing existing consumers of `VerseRef`.
 */
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
  const max = versification === 'heb' ? (book.value.hebChapters ?? book.value.chapters) : book.value.chapters;
  if (chapter < 1 || chapter > max) {
    return err({ kind: 'chapter_out_of_range', book: book.value.name, chapter, max });
  }
  return ok({ kind: 'verse', book: book.value, chapter, verse, versification });
};

export const formatRef = (ref: VerseRef): string => `${ref.book.name} ${ref.chapter}:${ref.verse}`;

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
  const max = versification === 'heb' ? (book.value.hebChapters ?? book.value.chapters) : book.value.chapters;
  if (chapter < 1 || chapter > max) {
    return err({ kind: 'chapter_out_of_range', book: book.value.name, chapter, max });
  }
  return ok({ kind: 'chapter', book: book.value, chapter });
};
