import { normalizeBook } from '../domain/books.ts';
import { err, ok } from '../domain/result.ts';
import { strongBase } from '../domain/strong.ts';
import { isNestleAland } from '../domain/text-type.ts';
import type { ParseOutcome } from './issue.ts';
import type { TahotWord } from './tahot.ts';

/** A Greek word in the same shape as a Hebrew one; the New Testament has a single numbering. */
export type TagntWord = TahotWord;

const LINE_START_RE = /^\w{3}\.\d+\.\d+/;
// NRSV numbering is primary; a second numbering in {}, [] or () is ignored.
const REF_RE = /^(\w{3})\.(\d+)\.(\d+)(?:[{[(]\d+\.\d+[}\])])?#(\d+)=(.+)$/;
const WORD_COLUMN_RE = /^(.*) \(([^()]*)\)$/;
const PART_RE = /^(G\d{4,5}[A-Za-z]?)=(\S+)$/;

const issue = (line: string, reason: string): ParseOutcome<never> => err({ line, reason });

const NAME_KINDS: ReadonlyMap<string, 'person' | 'place' | 'gentilic'> = new Map([
  ['P', 'person'],
  ['L', 'place'],
  ['LI', 'place'],
  ['PG', 'gentilic'],
  ['LG', 'gentilic'],
]);

/** The name id after the last `|`, e.g. "Jesus@Mat.1.1"; null when the column names no one. */
const nameIdOf = (subMeaning: string): string | null => {
  const tail = subMeaning.slice(subMeaning.lastIndexOf('|') + 1);
  const id = tail.slice(tail.lastIndexOf('»') + 1);
  return id.includes('@') ? id : null;
};

export const parseTagntLine = (rawLine: string): ParseOutcome<TagntWord> => {
  const line = rawLine.replace(/\r$/, '');
  if (!LINE_START_RE.test(line)) return ok(null);
  const cols = line.split('\t');
  const m = REF_RE.exec(cols[0] ?? '');
  if (m === null) return issue(line, 'malformed reference');
  const [, code = '', c = '', v = '', pos = '', textType = ''] = m;
  const book = normalizeBook(code);
  if (!book.ok) return issue(line, `unknown book code ${code}`);

  const word = WORD_COLUMN_RE.exec(cols[1] ?? '');
  if (word === null) return issue(line, 'malformed word column');

  const parts = (cols[3] ?? '').split(' + ').map((p) => PART_RE.exec(p));
  const first = parts[0];
  if (first === null || first === undefined || parts.some((p) => p === null)) {
    return issue(line, 'malformed Strong/morphology column');
  }
  const strongs = parts.map((p) => p?.[1] ?? '');
  const morphs = parts.map((p) => p?.[2] ?? '');
  const strong = strongs[0] ?? '';
  const morph = morphs[0] ?? '';

  const lemmaColumn = cols[4] ?? '';
  const eq = lemmaColumn.indexOf('=');
  const subMeaning = cols[9] ?? '';
  const nameKind = NAME_KINDS.get(morph.split('-').at(-1) ?? '') ?? null;
  const chapter = Number(c);
  const verse = Number(v);

  return ok({
    book: book.value.id,
    chapter,
    verse,
    hebChapter: chapter,
    hebVerse: verse,
    position: Number(pos),
    textType,
    original: word[1] ?? '',
    transliteration: word[2] ?? '',
    gloss: cols[2] ?? '',
    strongRaw: strongs.join(' + '),
    strong,
    strongBase: strongBase(strong),
    prefixes: [],
    suffixes: strongs.slice(1),
    conjoined: false,
    morphRaw: morphs.join(' + '),
    morph,
    lemma: eq < 0 ? lemmaColumn : lemmaColumn.slice(0, eq),
    lemmaGloss: eq < 0 ? null : lemmaColumn.slice(eq + 1),
    expandedRaw: subMeaning,
    nameId: nameIdOf(subMeaning),
    isProperName: nameKind !== null,
    nameKind,
  });
};

/**
 * The words of one verse that make up the base text: the Nestlé-Aland words; if the verse has none,
 * its traditional (K/k) words; if it has neither, all of its words.
 */
export const baseText = <T extends { readonly textType: string }>(verseWords: readonly T[]): T[] => {
  const nestle = verseWords.filter((w) => isNestleAland(w.textType));
  if (nestle.length > 0) return nestle;
  const traditional = verseWords.filter((w) => /[Kk]/.test(w.textType));
  return traditional.length > 0 ? traditional : [...verseWords];
};
