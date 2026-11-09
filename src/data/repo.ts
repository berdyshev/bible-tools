import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod/v4';
import { normalizeBook, BOOKS } from '../domain/books.ts';
import type { Span, VerseBounds, VerseRef, Scope, Versification } from '../domain/ref.ts';
import type { Strong } from '../domain/strong.ts';
import { VERSION_IDS, type VersionId } from '../domain/versions.ts';

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
  original: z.string(),
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
  original: z.string(),
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

const morphologyRow = z.object({
  code: z.string(),
  language: z.enum(['hebrew', 'greek']),
  parsing: z.string(),
  summary: z.string(),
  meaning: z.string(),
  example: z.string(),
});

const occurrenceRow = z.object({
  book: z.string().transform((id, ctx) => {
    const book = normalizeBook(id);
    if (book.ok) return book.value;
    ctx.addIssue({ code: 'custom', message: `unknown book id "${id}" in the database` });
    return z.NEVER;
  }),
  chapter: z.number(),
  verse: z.number(),
  position: z.number(),
  transliteration: z.string(),
  original: z.string(),
  strong: z.string(),
});

const translationMetaRow = z.object({
  version: z.enum(VERSION_IDS),
  label: z.string(),
  title: z.string(),
  language: z.string(),
  licence: z.string(),
  attribution: z.string(),
  bracketMeaning: z.string().nullable(),
  hasNotes: bool,
});

const translationVerseRow = z.object({
  chapter: z.number(),
  verse: z.number(),
  nativeRef: z.string().nullable(),
  text: z.string(),
});

/** A translation loaded into the database: its names, licence and the markers its text uses. */
export type TranslationMeta = z.infer<typeof translationMetaRow>;
/** One verse of a translation, in KJV numbering, with the module's own number when it differs. */
export type TranslationVerse = z.infer<typeof translationVerseRow>;

/** One word of the Hebrew text (TAHOT), in English and Hebrew numbering. */
export type Word = z.infer<typeof wordRow>;
/** One TBESH lexicon entry. */
export type LexiconEntry = z.infer<typeof lexiconRow>;
/** One full morphology code with its explanation (TEHMC, TEGMC). */
export type MorphologyEntry = z.infer<typeof morphologyRow>;
/** One TIPNR proper-name record. */
export type TipnrRecord = z.infer<typeof tipnrRow>;

/** One occurrence of a Strong's number: where it stands, numbered in the requested versification. */
export type Occurrence = {
  readonly ref: VerseRef;
  readonly position: number;
  readonly transliteration: string;
  readonly original: string;
  /** Disambiguated key of the sense at this word, e.g. "H7704G". */
  readonly strong: string;
};

export interface BibleRepo {
  /** Words of a verse in text order, numbered by the reference's versification; empty if there are none. */
  verseWords(ref: VerseRef): Word[];
  /** Words of a verse that are proper names (persons, places, gentilics, divine names). */
  nameWords(ref: VerseRef): Word[];
  /** Entry for an exact disambiguated key such as "H7704G"; null if unknown. */
  lexiconEntry(key: string): LexiconEntry | null;
  /** Every sense of a base number such as "H7704", in file order. */
  senses(base: string): LexiconEntry[];
  /** Lowest and highest verse number the text has in the reference's chapter; null if the chapter has none. */
  verseBounds(ref: VerseRef): VerseBounds | null;
  /** Value stored under `key` when the database was built, e.g. "stepbible_commit"; null if absent. */
  meta(key: string): string | null;
  /**
   * Words carrying `strong` within `scope`, in text order. A key with a sense letter matches that
   * sense only; a bare number matches every sense.
   */
  occurrences(strong: Strong, scope: Scope, versification: Versification): Occurrence[];
  /**
   * Entries whose gloss or meaning mentions the English `query`, best first: a whole-word match in
   * the gloss, then any match in the gloss, then a whole-word match in the meaning, then any match
   * there. `language` limits the entries to Hebrew or Greek; at most `limit` are returned.
   */
  searchLexicon(query: string, language: 'hebrew' | 'greek' | undefined, limit: number): LexiconEntry[];
  /** The explanation of a full morphology code such as "HVqw3ms" or "V-AAI-3S", matched exactly; null if unknown. */
  morphologyCode(code: string): MorphologyEntry | null;
  /** First TIPNR record for a disambiguated key; null if the key names no proper noun. */
  tipnr(dstrong: string): TipnrRecord | null;
  /** The translations in the database, in `VERSION_IDS` order. */
  translations(): TranslationMeta[];
  /** The verses of `version` within `span` (KJV numbering) that the translation has, in text order. */
  translationVerses(version: VersionId, span: Span): TranslationVerse[];
}

const WORD_COLUMNS = `book, chapter, verse, heb_chapter AS hebChapter, heb_verse AS hebVerse, position,
  text_type AS textType, original, transliteration, gloss, strong_raw AS strongRaw, strong,
  strong_base AS strongBase, prefixes, suffixes, conjoined, morph, morph_raw AS morphRaw, lemma,
  lemma_gloss AS lemmaGloss, name_id AS nameId, is_proper_name AS isProperName, name_kind AS nameKind`;

const LEXICON_COLUMNS = `dstrong AS strong, estrong AS extendedStrong, ustrong AS unifiedStrong, relation,
  original, transliteration, morph, gloss, meaning`;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const testamentIds = (testament: 'OT' | 'NT'): string[] =>
  BOOKS.filter((b) => b.testament === testament).map((b) => b.id);

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
    `SELECT ${LEXICON_COLUMNS} FROM lexicon WHERE dstrong = ? OR dstrong GLOB ? || '[A-Za-z]' ORDER BY id`,
    lexiconRow,
  );
  const boundsSchema = z.object({ first: z.number().nullable(), last: z.number().nullable() });
  const boundsEng = query(
    'SELECT min(verse) AS first, max(verse) AS last FROM words WHERE book = ? AND chapter = ?',
    boundsSchema,
  );
  const boundsHeb = query(
    'SELECT min(heb_verse) AS first, max(heb_verse) AS last FROM words WHERE book = ? AND heb_chapter = ?',
    boundsSchema,
  );
  const metaByKey = query('SELECT value FROM meta WHERE key = ?', z.object({ value: z.string() }));
  const tipnrByKey = query(
    `SELECT unique_name AS uniqueName, dstrong, category, description FROM names
     WHERE dstrong = ? ORDER BY rowid LIMIT 1`,
    tipnrRow,
  );

  const morphologyByCode = query(
    'SELECT code, language, parsing, summary, meaning, example FROM morphology WHERE code = ?',
    morphologyRow,
  );

  const lexiconSearch = query(
    `SELECT ${LEXICON_COLUMNS} FROM lexicon
     WHERE dstrong LIKE ? AND (instr(lower(gloss), ?) > 0 OR instr(lower(meaning), ?) > 0) ORDER BY id`,
    lexiconRow,
  );

  const translationMetas = query(
    `SELECT version, label, title, language, licence, attribution, bracket_meaning AS bracketMeaning,
       has_notes AS hasNotes FROM translation_meta`,
    translationMetaRow,
  );
  // Chapters have fewer than 1000 verses, so chapter * 1000 + verse orders a book's verses.
  const translationRange = query(
    `SELECT chapter, verse, native_ref AS nativeRef, text FROM translation_verses
     WHERE version = ? AND book = ? AND chapter * 1000 + verse BETWEEN ? AND ?
     ORDER BY chapter, verse`,
    translationVerseRow,
  );

  const occurrenceQuery = (exact: boolean, scope: Scope, versification: Versification) => {
    const heb = versification === 'heb';
    const chapterCol = heb ? 'heb_chapter' : 'chapter';
    const verseCol = heb ? 'heb_verse' : 'verse';
    const where = [exact ? 'strong = ?' : 'strong_base = ?'];
    if (scope.kind === 'testament') {
      where.push(
        `book IN (${testamentIds(scope.testament)
          .map(() => '?')
          .join(', ')})`,
      );
    } else where.push('book = ?');
    if (scope.kind === 'chapter') where.push(`${chapterCol} = ?`);
    // Rows are loaded in canonical book order, so id order is book, chapter, verse, position.
    return query(
      `SELECT book, ${chapterCol} AS chapter, ${verseCol} AS verse, position, transliteration, original, strong
       FROM words WHERE ${where.join(' AND ')} ORDER BY id`,
      occurrenceRow,
    );
  };

  return {
    verseWords: (ref) =>
      (ref.versification === 'heb' ? wordsHeb : wordsEng)(ref.book.id, ref.chapter, ref.verse),
    nameWords: (ref) =>
      (ref.versification === 'heb' ? namesHeb : namesEng)(ref.book.id, ref.chapter, ref.verse),
    verseBounds: (ref) => {
      const row = (ref.versification === 'heb' ? boundsHeb : boundsEng)(ref.book.id, ref.chapter)[0];
      return row === undefined || row.first === null || row.last === null
        ? null
        : { first: row.first, last: row.last };
    },
    meta: (key) => metaByKey(key)[0]?.value ?? null,
    lexiconEntry: (key) => entryByKey(key)[0] ?? null,
    senses: (base) => sensesByBase(base, base),
    occurrences: (strong, scope, versification) => {
      const params: SQLInputValue[] = [strong.key];
      if (scope.kind === 'testament') params.push(...testamentIds(scope.testament));
      else params.push(scope.book.id);
      if (scope.kind === 'chapter') params.push(scope.chapter);
      return occurrenceQuery(
        strong.sense !== undefined,
        scope,
        versification,
      )(...params).map((r) => ({
        ref: { kind: 'verse', book: r.book, chapter: r.chapter, verse: r.verse, versification },
        position: r.position,
        transliteration: r.transliteration,
        original: r.original,
        strong: r.strong,
      }));
    },
    searchLexicon: (text, language, limit) => {
      const needle = text.trim().toLowerCase();
      if (needle === '') return [];
      const prefix = language === 'hebrew' ? 'H%' : language === 'greek' ? 'G%' : '%';
      const pattern = `(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`;
      const word = new RegExp(pattern, 'u');
      const words = new RegExp(pattern, 'gu');
      const rank = (e: LexiconEntry): number => {
        const gloss = e.gloss.toLowerCase();
        if (word.test(gloss)) return 0;
        if (gloss.includes(needle)) return 1;
        return word.test(e.meaning.toLowerCase()) ? 2 : 3;
      };
      return (
        lexiconSearch(prefix, needle, needle)
          .map((entry) => ({
            entry,
            rank: rank(entry),
            mentions: entry.meaning.toLowerCase().match(words)?.length ?? 0,
          }))
          // Within a rank, entries that dwell on the word beat those that mention it once.
          .toSorted((a, b) => (a.rank === b.rank ? b.mentions - a.mentions : a.rank - b.rank))
          .slice(0, limit)
          .map((r) => r.entry)
      );
    },
    morphologyCode: (code) => morphologyByCode(code)[0] ?? null,
    tipnr: (dstrong) => tipnrByKey(dstrong)[0] ?? null,
    translations: () =>
      translationMetas().toSorted((a, b) => VERSION_IDS.indexOf(a.version) - VERSION_IDS.indexOf(b.version)),
    translationVerses: (version, { book, start, end }) =>
      translationRange(version, book.id, start.chapter * 1000 + start.verse, end.chapter * 1000 + end.verse),
  };
};
