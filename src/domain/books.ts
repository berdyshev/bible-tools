import { err, ok, type Result } from './result.ts';
import type { InputError } from './errors.ts';

export type Testament = 'OT' | 'NT';

export type Book = {
  /** OSIS id, e.g. "1Sam". */
  readonly id: string;
  readonly testament: Testament;
  /** English display name, e.g. "1 Samuel". */
  readonly name: string;
  /** Book code used in the STEPBible word files, e.g. "1Sa". */
  readonly sourceCode: string;
  /** Chapter count in English (NRSV) versification. */
  readonly chapters: number;
  /** Chapter count in Hebrew versification, only where it differs. */
  readonly hebChapters?: number;
  /** Extra accepted spellings; the id, name and source code are always accepted. */
  readonly aliases: readonly string[];
};

export const BOOKS: readonly Book[] = [
  { id: 'Gen', testament: 'OT', name: 'Genesis', sourceCode: 'Gen', chapters: 50, aliases: ['Ge', 'Gn'] },
  { id: 'Exod', testament: 'OT', name: 'Exodus', sourceCode: 'Exo', chapters: 40, aliases: ['Ex', 'Exd'] },
  { id: 'Lev', testament: 'OT', name: 'Leviticus', sourceCode: 'Lev', chapters: 27, aliases: ['Le', 'Lv'] },
  {
    id: 'Num',
    testament: 'OT',
    name: 'Numbers',
    sourceCode: 'Num',
    chapters: 36,
    aliases: ['Nu', 'Nm', 'Nb'],
  },
  {
    id: 'Deut',
    testament: 'OT',
    name: 'Deuteronomy',
    sourceCode: 'Deu',
    chapters: 34,
    aliases: ['Dt', 'De'],
  },
  { id: 'Josh', testament: 'OT', name: 'Joshua', sourceCode: 'Jos', chapters: 24, aliases: ['Jsh'] },
  { id: 'Judg', testament: 'OT', name: 'Judges', sourceCode: 'Jdg', chapters: 21, aliases: ['Jg', 'Jdgs'] },
  { id: 'Ruth', testament: 'OT', name: 'Ruth', sourceCode: 'Rut', chapters: 4, aliases: ['Ru', 'Rth'] },
  {
    id: '1Sam',
    testament: 'OT',
    name: '1 Samuel',
    sourceCode: '1Sa',
    chapters: 31,
    aliases: ['1 Sm', 'I Samuel', 'I Sam', 'First Samuel'],
  },
  {
    id: '2Sam',
    testament: 'OT',
    name: '2 Samuel',
    sourceCode: '2Sa',
    chapters: 24,
    aliases: ['2 Sm', 'II Samuel', 'II Sam', 'Second Samuel'],
  },
  {
    id: '1Kgs',
    testament: 'OT',
    name: '1 Kings',
    sourceCode: '1Ki',
    chapters: 22,
    aliases: ['1 Kg', '1 Kgs', 'I Kings', 'First Kings'],
  },
  {
    id: '2Kgs',
    testament: 'OT',
    name: '2 Kings',
    sourceCode: '2Ki',
    chapters: 25,
    aliases: ['2 Kg', '2 Kgs', 'II Kings', 'Second Kings'],
  },
  {
    id: '1Chr',
    testament: 'OT',
    name: '1 Chronicles',
    sourceCode: '1Ch',
    chapters: 29,
    aliases: ['1 Chron', 'I Chronicles', 'First Chronicles'],
  },
  {
    id: '2Chr',
    testament: 'OT',
    name: '2 Chronicles',
    sourceCode: '2Ch',
    chapters: 36,
    aliases: ['2 Chron', 'II Chronicles', 'Second Chronicles'],
  },
  { id: 'Ezra', testament: 'OT', name: 'Ezra', sourceCode: 'Ezr', chapters: 10, aliases: [] },
  { id: 'Neh', testament: 'OT', name: 'Nehemiah', sourceCode: 'Neh', chapters: 13, aliases: ['Ne'] },
  { id: 'Esth', testament: 'OT', name: 'Esther', sourceCode: 'Est', chapters: 10, aliases: ['Es'] },
  { id: 'Job', testament: 'OT', name: 'Job', sourceCode: 'Job', chapters: 42, aliases: ['Jb'] },
  {
    id: 'Ps',
    testament: 'OT',
    name: 'Psalms',
    sourceCode: 'Psa',
    chapters: 150,
    aliases: ['Psalm', 'Pss', 'Psm'],
  },
  { id: 'Prov', testament: 'OT', name: 'Proverbs', sourceCode: 'Pro', chapters: 31, aliases: ['Prv', 'Pr'] },
  {
    id: 'Eccl',
    testament: 'OT',
    name: 'Ecclesiastes',
    sourceCode: 'Ecc',
    chapters: 12,
    aliases: ['Eccles', 'Qoheleth'],
  },
  {
    id: 'Song',
    testament: 'OT',
    name: 'Song of Songs',
    sourceCode: 'Sng',
    chapters: 8,
    aliases: ['Song of Solomon', 'SoS', 'Canticles', 'Cant'],
  },
  { id: 'Isa', testament: 'OT', name: 'Isaiah', sourceCode: 'Isa', chapters: 66, aliases: [] },
  { id: 'Jer', testament: 'OT', name: 'Jeremiah', sourceCode: 'Jer', chapters: 52, aliases: ['Jr'] },
  { id: 'Lam', testament: 'OT', name: 'Lamentations', sourceCode: 'Lam', chapters: 5, aliases: ['La'] },
  { id: 'Ezek', testament: 'OT', name: 'Ezekiel', sourceCode: 'Ezk', chapters: 48, aliases: ['Eze'] },
  { id: 'Dan', testament: 'OT', name: 'Daniel', sourceCode: 'Dan', chapters: 12, aliases: ['Dn'] },
  { id: 'Hos', testament: 'OT', name: 'Hosea', sourceCode: 'Hos', chapters: 14, aliases: ['Ho'] },
  {
    id: 'Joel',
    testament: 'OT',
    name: 'Joel',
    sourceCode: 'Jol',
    chapters: 3,
    hebChapters: 4,
    aliases: ['Jl'],
  },
  { id: 'Amos', testament: 'OT', name: 'Amos', sourceCode: 'Amo', chapters: 9, aliases: ['Am'] },
  { id: 'Obad', testament: 'OT', name: 'Obadiah', sourceCode: 'Oba', chapters: 1, aliases: ['Ob'] },
  { id: 'Jonah', testament: 'OT', name: 'Jonah', sourceCode: 'Jon', chapters: 4, aliases: ['Jnh'] },
  { id: 'Mic', testament: 'OT', name: 'Micah', sourceCode: 'Mic', chapters: 7, aliases: ['Mi'] },
  { id: 'Nah', testament: 'OT', name: 'Nahum', sourceCode: 'Nam', chapters: 3, aliases: ['Na'] },
  { id: 'Hab', testament: 'OT', name: 'Habakkuk', sourceCode: 'Hab', chapters: 3, aliases: ['Hb'] },
  { id: 'Zeph', testament: 'OT', name: 'Zephaniah', sourceCode: 'Zep', chapters: 3, aliases: ['Zp'] },
  { id: 'Hag', testament: 'OT', name: 'Haggai', sourceCode: 'Hag', chapters: 2, aliases: ['Hg'] },
  { id: 'Zech', testament: 'OT', name: 'Zechariah', sourceCode: 'Zec', chapters: 14, aliases: ['Zc'] },
  {
    id: 'Mal',
    testament: 'OT',
    name: 'Malachi',
    sourceCode: 'Mal',
    chapters: 4,
    hebChapters: 3,
    aliases: ['Ml'],
  },
  {
    id: 'Matt',
    testament: 'NT',
    name: 'Matthew',
    sourceCode: 'Mat',
    chapters: 28,
    aliases: ['Mt'],
  },
  {
    id: 'Mark',
    testament: 'NT',
    name: 'Mark',
    sourceCode: 'Mrk',
    chapters: 16,
    aliases: ['Mk', 'Mr'],
  },
  {
    id: 'Luke',
    testament: 'NT',
    name: 'Luke',
    sourceCode: 'Luk',
    chapters: 24,
    aliases: ['Lk'],
  },
  {
    id: 'John',
    testament: 'NT',
    name: 'John',
    sourceCode: 'Jhn',
    chapters: 21,
    aliases: ['Jn'],
  },
  {
    id: 'Acts',
    testament: 'NT',
    name: 'Acts',
    sourceCode: 'Act',
    chapters: 28,
    aliases: ['Ac', 'Acts of the Apostles'],
  },
  {
    id: 'Rom',
    testament: 'NT',
    name: 'Romans',
    sourceCode: 'Rom',
    chapters: 16,
    aliases: ['Ro', 'Rm'],
  },
  {
    id: '1Cor',
    testament: 'NT',
    name: '1 Corinthians',
    sourceCode: '1Co',
    chapters: 16,
    aliases: ['1 Cor', 'I Corinthians', 'First Corinthians'],
  },
  {
    id: '2Cor',
    testament: 'NT',
    name: '2 Corinthians',
    sourceCode: '2Co',
    chapters: 13,
    aliases: ['2 Cor', 'II Corinthians', 'Second Corinthians'],
  },
  {
    id: 'Gal',
    testament: 'NT',
    name: 'Galatians',
    sourceCode: 'Gal',
    chapters: 6,
    aliases: ['Ga'],
  },
  {
    id: 'Eph',
    testament: 'NT',
    name: 'Ephesians',
    sourceCode: 'Eph',
    chapters: 6,
    aliases: ['Ep'],
  },
  {
    id: 'Phil',
    testament: 'NT',
    name: 'Philippians',
    sourceCode: 'Php',
    chapters: 4,
    aliases: ['Pp'],
  },
  {
    id: 'Col',
    testament: 'NT',
    name: 'Colossians',
    sourceCode: 'Col',
    chapters: 4,
    aliases: ['Co'],
  },
  {
    id: '1Thess',
    testament: 'NT',
    name: '1 Thessalonians',
    sourceCode: '1Th',
    chapters: 5,
    aliases: ['1 Thess', 'I Thessalonians', 'First Thessalonians'],
  },
  {
    id: '2Thess',
    testament: 'NT',
    name: '2 Thessalonians',
    sourceCode: '2Th',
    chapters: 3,
    aliases: ['2 Thess', 'II Thessalonians', 'Second Thessalonians'],
  },
  {
    id: '1Tim',
    testament: 'NT',
    name: '1 Timothy',
    sourceCode: '1Ti',
    chapters: 6,
    aliases: ['1 Tim', 'I Timothy', 'First Timothy'],
  },
  {
    id: '2Tim',
    testament: 'NT',
    name: '2 Timothy',
    sourceCode: '2Ti',
    chapters: 4,
    aliases: ['2 Tim', 'II Timothy', 'Second Timothy'],
  },
  {
    id: 'Titus',
    testament: 'NT',
    name: 'Titus',
    sourceCode: 'Tit',
    chapters: 3,
    aliases: [],
  },
  {
    id: 'Phlm',
    testament: 'NT',
    name: 'Philemon',
    sourceCode: 'Phm',
    chapters: 1,
    aliases: ['Philem'],
  },
  {
    id: 'Heb',
    testament: 'NT',
    name: 'Hebrews',
    sourceCode: 'Heb',
    chapters: 13,
    aliases: [],
  },
  {
    id: 'Jas',
    testament: 'NT',
    name: 'James',
    sourceCode: 'Jas',
    chapters: 5,
    aliases: ['Jm'],
  },
  {
    id: '1Pet',
    testament: 'NT',
    name: '1 Peter',
    sourceCode: '1Pe',
    chapters: 5,
    aliases: ['1 Pet', 'I Peter', 'First Peter'],
  },
  {
    id: '2Pet',
    testament: 'NT',
    name: '2 Peter',
    sourceCode: '2Pe',
    chapters: 3,
    aliases: ['2 Pet', 'II Peter', 'Second Peter'],
  },
  {
    id: '1John',
    testament: 'NT',
    name: '1 John',
    sourceCode: '1Jn',
    chapters: 5,
    aliases: ['I John', 'First John'],
  },
  {
    id: '2John',
    testament: 'NT',
    name: '2 John',
    sourceCode: '2Jn',
    chapters: 1,
    aliases: ['II John', 'Second John'],
  },
  {
    id: '3John',
    testament: 'NT',
    name: '3 John',
    sourceCode: '3Jn',
    chapters: 1,
    aliases: ['III John', 'Third John'],
  },
  {
    id: 'Jude',
    testament: 'NT',
    name: 'Jude',
    sourceCode: 'Jud',
    chapters: 1,
    aliases: [],
  },
  {
    id: 'Rev',
    testament: 'NT',
    name: 'Revelation',
    sourceCode: 'Rev',
    chapters: 22,
    aliases: ['Re', 'Rv', 'Revelation of John', 'Apocalypse'],
  },
];

export const BOOK_IDS: readonly string[] = BOOKS.map((b) => b.id);

/** Lower-cases and drops whitespace and dots so "1 Sam.", "1sam" and "1SAM" coincide. */
const key = (s: string): string => s.toLowerCase().replace(/[\s.]+/g, '');

const BY_KEY: ReadonlyMap<string, Book> = new Map(
  BOOKS.flatMap((b) =>
    [b.id, b.name, b.sourceCode, ...b.aliases].map((spelling): [string, Book] => [key(spelling), b]),
  ),
);

export const normalizeBook = (input: string): Result<Book, InputError> => {
  const book = BY_KEY.get(key(input));
  return book === undefined ? err({ kind: 'unknown_book', input, validIds: BOOK_IDS }) : ok(book);
};
