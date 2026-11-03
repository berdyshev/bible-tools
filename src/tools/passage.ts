import type { BibleRepo } from '../data/repo.ts';
import type { Book } from '../domain/books.ts';
import { formatSpan, spanFrom } from '../domain/ref.ts';
import type { Span, Versification, VerseRef } from '../domain/ref.ts';

/** Tool output is re-sent on every agent step, so passages are cut at about this many characters. */
export const MAX_CHARS = 2000;

/** Highest verse of each chapter of `book`, as the span helpers expect it. */
export const lastVerseIn =
  (repo: BibleRepo, book: Book, versification: Versification) =>
  (chapter: number): number =>
    repo.lastVerse({ kind: 'verse', book, chapter, verse: 1, versification });

/** The closing line of a cut-off passage: which call returns the rest. */
export const continuation = (tool: string, span: Span, next: VerseRef): string =>
  `truncated — call ${tool} again with "${formatSpan(spanFrom(span, next))}"`;
