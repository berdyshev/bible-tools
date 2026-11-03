import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod/v4';
import type { VerseRef } from '../domain/ref.ts';

const bool = z.number().transform((n) => n === 1);
const tags = z
  .string()
  .transform((s): unknown => JSON.parse(s))
  .pipe(z.array(z.string()));

const wordRow = z.object({
  book: z.string(),
  chapter: z.number(),
  verse: z.number(),
  hebChapter: z.number(),
  hebVerse: z.number(),
  position: z.number(),
  textType: z.string(),
  hebrew: z.string(),
  transliteration: z.string(),
  gloss: z.string(),
  strongRaw: z.string(),
  strong: z.string().nullable(),
  strongBase: z.string().nullable(),
  prefixes: tags,
  suffixes: tags,
  conjoined: bool,
  morph: z.string().nullable(),
  morphRaw: z.string(),
  lemma: z.string().nullable(),
  lemmaGloss: z.string().nullable(),
  nameId: z.string().nullable(),
  isProperName: bool,
  nameKind: z.enum(['person', 'place', 'gentilic', 'other']).nullable(),
});

const lexiconRow = z.object({
  strong: z.string(),
  extendedStrong: z.string(),
  unifiedStrong: z.string(),
  relation: z.string(),
  hebrew: z.string(),
  transliteration: z.string(),
  morph: z.string(),
  gloss: z.string(),
  meaning: z.string(),
});

const tipnrRow = z.object({
  uniqueName: z.string(),
  dstrong: z.string(),
  category: z.enum(['person', 'place', 'other']),
  description: z.string(),
});

/** One word of the Hebrew text (TAHOT), in English and Hebrew numbering. */
export type HebrewWord = z.infer<typeof wordRow>;
/** One TBESH lexicon entry. */
export type LexiconEntry = z.infer<typeof lexiconRow>;
/** One TIPNR proper-name record. */
export type TipnrRecord = z.infer<typeof tipnrRow>;

export interface BibleRepo {
  /** Words of a verse in text order, numbered by the reference's versification; empty if there are none. */
  verseWords(ref: VerseRef): HebrewWord[];
  /** Words of a verse that are proper names (persons, places, gentilics, divine names). */
  nameWords(ref: VerseRef): HebrewWord[];
  /** Entry for an exact disambiguated key such as "H7704G"; null if unknown. */
  lexiconEntry(key: string): LexiconEntry | null;
  /** Every sense of a base number such as "H7704", in file order. */
  senses(base: string): LexiconEntry[];
  /** First TIPNR record for a disambiguated key; null if the key names no proper noun. */
  tipnr(dstrong: string): TipnrRecord | null;
}

const WORD_COLUMNS = `book, chapter, verse, heb_chapter AS hebChapter, heb_verse AS hebVerse, position,
  text_type AS textType, hebrew, transliteration, gloss, strong_raw AS strongRaw, strong,
  strong_base AS strongBase, prefixes, suffixes, conjoined, morph, morph_raw AS morphRaw, lemma,
  lemma_gloss AS lemmaGloss, name_id AS nameId, is_proper_name AS isProperName, name_kind AS nameKind`;

const LEXICON_COLUMNS = `dstrong AS strong, estrong AS extendedStrong, ustrong AS unifiedStrong, relation,
  hebrew, transliteration, morph, gloss, meaning`;

export const createBibleRepo = (db: DatabaseSync): BibleRepo => {
  const query = <T>(sql: string, schema: z.ZodType<T>) => {
    const stmt = db.prepare(sql);
    return (...params: SQLInputValue[]): T[] => z.array(schema).parse(stmt.all(...params));
  };

  const wordsEng = query(
    `SELECT ${WORD_COLUMNS} FROM words WHERE book = ? AND chapter = ? AND verse = ? ORDER BY id`,
    wordRow,
  );
  const wordsHeb = query(
    `SELECT ${WORD_COLUMNS} FROM words WHERE book = ? AND heb_chapter = ? AND heb_verse = ? ORDER BY id`,
    wordRow,
  );
  const namesEng = query(
    `SELECT ${WORD_COLUMNS} FROM words
     WHERE book = ? AND chapter = ? AND verse = ? AND is_proper_name = 1 ORDER BY id`,
    wordRow,
  );
  const namesHeb = query(
    `SELECT ${WORD_COLUMNS} FROM words
     WHERE book = ? AND heb_chapter = ? AND heb_verse = ? AND is_proper_name = 1 ORDER BY id`,
    wordRow,
  );
  const entryByKey = query(
    `SELECT ${LEXICON_COLUMNS} FROM lexicon WHERE dstrong = ? ORDER BY id LIMIT 1`,
    lexiconRow,
  );
  const sensesByBase = query(
    `SELECT ${LEXICON_COLUMNS} FROM lexicon WHERE substr(dstrong, 1, 5) = ? ORDER BY id`,
    lexiconRow,
  );
  const tipnrByKey = query(
    `SELECT unique_name AS uniqueName, dstrong, category, description FROM names
     WHERE dstrong = ? ORDER BY rowid LIMIT 1`,
    tipnrRow,
  );

  return {
    verseWords: (ref) =>
      (ref.versification === 'heb' ? wordsHeb : wordsEng)(ref.book.id, ref.chapter, ref.verse),
    nameWords: (ref) =>
      (ref.versification === 'heb' ? namesHeb : namesEng)(ref.book.id, ref.chapter, ref.verse),
    lexiconEntry: (key) => entryByKey(key)[0] ?? null,
    senses: (base) => sensesByBase(base),
    tipnr: (dstrong) => tipnrByKey(dstrong)[0] ?? null,
  };
};
