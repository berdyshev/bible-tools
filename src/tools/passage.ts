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

/** A passage longer than this many verses is cut off at a verse boundary. */
export const MAX_VERSES = 10;

/** One verse of a passage as the tool renders it. */
export type VerseBlock = { readonly ref: VerseRef; readonly text: string };

/**
 * `header`, then the verse blocks, one per line group. Blocks are taken until the next would pass
 * `MAX_VERSES` or `MAX_CHARS`, counting the continuation line that a cut needs, so a cut passage stays
 * within `MAX_CHARS`; the first block is always shown. A cut passage ends with the call that returns the
 * rest.
 */
export const cappedPassage = (
  tool: string,
  span: Span,
  header: string,
  blocks: Iterable<VerseBlock>,
): string => {
  const lines = [header];
  let length = header.length;
  const it = blocks[Symbol.iterator]();
  let current = it.next();
  while (current.done !== true) {
    const block = current.value;
    const next = it.next();
    const tail = next.done === true ? 0 : 1 + continuation(tool, span, next.value.ref).length;
    const shown = lines.length - 1;
    if (shown > 0 && (shown === MAX_VERSES || length + 1 + block.text.length + tail > MAX_CHARS)) {
      lines.push(continuation(tool, span, block.ref));
      break;
    }
    lines.push(block.text);
    length += 1 + block.text.length;
    current = next;
  }
  return lines.join('\n');
};
