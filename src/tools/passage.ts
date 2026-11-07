import type { BibleRepo } from '../data/repo.ts';
import type { Book } from '../domain/books.ts';
import { formatSpan, spanFrom, verseOutOfRange } from '../domain/ref.ts';
import type { InputError } from '../domain/errors.ts';
import type { Span, VerseBounds, Versification, VerseRef } from '../domain/ref.ts';

/** Tool output is re-sent on every agent step, so passages are cut at about this many characters. */
export const MAX_CHARS = 2000;

/** The parenthesised label that tells which verse numbering a result uses. */
export const numberingLabel = (versification: Versification): string =>
  versification === 'heb' ? 'Hebrew numbering' : 'English numbering';

export const originalLanguage = (book: Book): 'Hebrew' | 'Greek' =>
  book.testament === 'NT' ? 'Greek' : 'Hebrew';

/** First and last verse of each chapter of `book`, as the span helpers expect it. */
export const boundsIn =
  (repo: BibleRepo, book: Book, versification: Versification) =>
  (chapter: number): VerseBounds | null =>
    repo.verseBounds({ kind: 'verse', book, chapter, verse: 1, versification });

/** The error for a single verse the text does not have. */
export const missingVerse = (repo: BibleRepo, ref: VerseRef): InputError =>
  verseOutOfRange(ref.book, ref.chapter, ref.verse, repo.verseBounds(ref));

/** The closing line of a cut-off passage: which call returns the rest. */
export const continuation = (tool: string, span: Span, next: VerseRef): string =>
  `truncated — call ${tool} again with "${formatSpan(spanFrom(span, next))}"`;
