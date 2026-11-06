import type { DatabaseSync } from 'node:sqlite';
import type { ParseIssue, ParseOutcome } from './issue.ts';
import { parseMorphologyCodes, type MorphologyCode } from './morphology.ts';
import { baseText, parseTagntLine } from './tagnt.ts';
import { parseTahotLine, type TahotWord } from './tahot.ts';
import { parseTbeshLine } from './tbesh.ts';
import { parseTipnr } from './tipnr.ts';

export type LoadInput = {
  /** Hebrew Old Testament word lines (TAHOT). */
  readonly tahot: Iterable<string>;
  /** Greek New Testament word lines (TAGNT); loaded after the Old Testament. */
  readonly tagnt?: Iterable<string>;
  /** Lexicon lines: TBESH, TBESG or both. */
  readonly tbesh: Iterable<string>;
  readonly tipnr: Iterable<string>;
  /** Hebrew morphology code lines (TEHMC). */
  readonly hebrewMorphology?: Iterable<string>;
  /** Greek morphology code lines (TEGMC). */
  readonly greekMorphology?: Iterable<string>;
};

export type LoadReport = {
  readonly counts: {
    readonly words: number;
    readonly lexicon: number;
    readonly names: number;
    readonly morphology: number;
  };
  readonly issues: readonly ParseIssue[];
};

export const createSchema = (db: DatabaseSync): void => {
  db.exec(`
CREATE TABLE words (
  id INTEGER PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  heb_chapter INTEGER NOT NULL,
  heb_verse INTEGER NOT NULL,
  position INTEGER NOT NULL,
  text_type TEXT NOT NULL,
  original TEXT NOT NULL,
  transliteration TEXT NOT NULL,
  gloss TEXT NOT NULL,
  strong_raw TEXT NOT NULL,
  strong TEXT,
  strong_base TEXT,
  prefixes TEXT NOT NULL,
  suffixes TEXT NOT NULL,
  conjoined INTEGER NOT NULL,
  morph_raw TEXT NOT NULL,
  morph TEXT,
  lemma TEXT,
  lemma_gloss TEXT,
  expanded_raw TEXT NOT NULL,
  name_id TEXT,
  is_proper_name INTEGER NOT NULL,
  name_kind TEXT
);
CREATE INDEX idx_words_ref ON words(book, chapter, verse, position);
CREATE INDEX idx_words_href ON words(book, heb_chapter, heb_verse, position);
CREATE INDEX idx_words_strong ON words(strong);
CREATE INDEX idx_words_base ON words(strong_base);

CREATE TABLE lexicon (
  id INTEGER PRIMARY KEY,
  estrong TEXT NOT NULL,
  dstrong TEXT NOT NULL,
  relation TEXT NOT NULL,
  ustrong TEXT NOT NULL,
  original TEXT NOT NULL,
  transliteration TEXT NOT NULL,
  morph TEXT NOT NULL,
  gloss TEXT NOT NULL,
  meaning_html TEXT NOT NULL,
  meaning TEXT NOT NULL
);
CREATE INDEX idx_lex_d ON lexicon(dstrong);
CREATE INDEX idx_lex_e ON lexicon(estrong);

CREATE TABLE names (
  unique_name TEXT NOT NULL,
  dstrong TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE INDEX idx_names_u ON names(unique_name);
CREATE INDEX idx_names_d ON names(dstrong);

CREATE TABLE morphology (
  code TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  parsing TEXT NOT NULL,
  summary TEXT NOT NULL,
  meaning TEXT NOT NULL,
  example TEXT NOT NULL
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
};

const inTransaction = <T>(db: DatabaseSync, body: () => T): T => {
  db.exec('BEGIN');
  try {
    const value = body();
    db.exec('COMMIT');
    return value;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

/** Feeds every line to `parse`; records unparsable lines as issues and returns the number of records stored. */
const eachRecord = <T>(
  lines: Iterable<string>,
  parse: (line: string) => ParseOutcome<T>,
  issues: ParseIssue[],
  store: (record: T) => void,
): number => {
  let count = 0;
  for (const line of lines) {
    const outcome = parse(line);
    if (!outcome.ok) issues.push(outcome.error);
    else if (outcome.value !== null) {
      store(outcome.value);
      count++;
    }
  }
  return count;
};

/**
 * Feeds the Greek lines to `store`, keeping per verse only the words of the base text. Words are grouped by
 * consecutive reference; returns the number of words stored.
 */
const eachBaseWord = (
  lines: Iterable<string>,
  issues: ParseIssue[],
  store: (word: TahotWord) => void,
): number => {
  let count = 0;
  let verseKey = '';
  let verse: TahotWord[] = [];
  const flush = (): void => {
    for (const word of baseText(verse)) {
      store(word);
      count++;
    }
    verse = [];
  };
  for (const line of lines) {
    const outcome = parseTagntLine(line);
    if (!outcome.ok) issues.push(outcome.error);
    else if (outcome.value !== null) {
      const key = `${outcome.value.book} ${outcome.value.chapter}:${outcome.value.verse}`;
      if (key !== verseKey) flush();
      verseKey = key;
      verse.push(outcome.value);
    }
  }
  flush();
  return count;
};

export const load = (
  db: DatabaseSync,
  input: LoadInput,
  meta: Readonly<Record<string, string>>,
): LoadReport => {
  const issues: ParseIssue[] = [];
  const insWord = db.prepare(
    `INSERT INTO words (book, chapter, verse, heb_chapter, heb_verse, position, text_type, original,
       transliteration, gloss, strong_raw, strong, strong_base, prefixes, suffixes, conjoined, morph_raw,
       morph, lemma, lemma_gloss, expanded_raw, name_id, is_proper_name, name_kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insLex = db.prepare(
    `INSERT INTO lexicon (estrong, dstrong, relation, ustrong, original, transliteration, morph, gloss,
       meaning_html, meaning)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insName = db.prepare(
    'INSERT INTO names (unique_name, dstrong, category, description) VALUES (?, ?, ?, ?)',
  );
  const insMorph = db.prepare(
    'INSERT INTO morphology (code, language, parsing, summary, meaning, example) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');

  const storeWord = (w: TahotWord): void => {
    insWord.run(
      w.book,
      w.chapter,
      w.verse,
      w.hebChapter,
      w.hebVerse,
      w.position,
      w.textType,
      w.original,
      w.transliteration,
      w.gloss,
      w.strongRaw,
      w.strong,
      w.strongBase,
      JSON.stringify(w.prefixes),
      JSON.stringify(w.suffixes),
      w.conjoined ? 1 : 0,
      w.morphRaw,
      w.morph,
      w.lemma,
      w.lemmaGloss,
      w.expandedRaw,
      w.nameId,
      w.isProperName ? 1 : 0,
      w.nameKind,
    );
  };
  // Old Testament first: rows are read back in id order, which must be canonical book order.
  const words = inTransaction(
    db,
    () =>
      eachRecord(input.tahot, parseTahotLine, issues, storeWord) +
      eachBaseWord(input.tagnt ?? [], issues, storeWord),
  );

  const lexicon = inTransaction(db, () =>
    eachRecord(input.tbesh, parseTbeshLine, issues, (e) => {
      insLex.run(
        e.estrong,
        e.dstrong,
        e.relation,
        e.ustrong,
        e.original,
        e.transliteration,
        e.morph,
        e.gloss,
        e.meaningHtml,
        e.meaning,
      );
    }),
  );

  const names = inTransaction(db, () => {
    const parsed = parseTipnr(input.tipnr);
    for (const n of parsed) insName.run(n.uniqueName, n.dstrong, n.category, n.description);
    return parsed.length;
  });

  const morphology = inTransaction(db, () => {
    const codes: MorphologyCode[] = [
      ...parseMorphologyCodes(input.hebrewMorphology ?? [], 'hebrew'),
      ...parseMorphologyCodes(input.greekMorphology ?? [], 'greek'),
    ];
    for (const c of codes) insMorph.run(c.code, c.language, c.parsing, c.summary, c.meaning, c.example);
    return codes.length;
  });

  inTransaction(db, () => {
    for (const [key, value] of Object.entries(meta)) insMeta.run(key, value);
  });

  return { counts: { words, lexicon, names, morphology }, issues };
};
