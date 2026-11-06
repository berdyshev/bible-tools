import { normalizeBook } from '../domain/books.ts';
import { err, ok } from '../domain/result.ts';
import { strongBase } from '../domain/strong.ts';
import type { ParseOutcome } from './issue.ts';

export type NameKind = 'person' | 'place' | 'gentilic' | 'other';

export type TahotWord = {
  readonly book: string;
  /** English (NRSV) numbering: the primary reference in TAHOT. */
  readonly chapter: number;
  readonly verse: number;
  /** Hebrew numbering; equals chapter/verse when TAHOT gives no bracketed reference. */
  readonly hebChapter: number;
  readonly hebVerse: number;
  /** Word number within the verse (Ketiv numbering). */
  readonly position: number;
  /** L, Q(K), X, R, ... */
  readonly textType: string;
  readonly original: string;
  readonly transliteration: string;
  readonly gloss: string;
  /** dStrongs column verbatim, e.g. "H9003/{H3117G}". */
  readonly strongRaw: string;
  /** Root dStrong, e.g. "H3117G"; null when the word has no root tag. */
  readonly strong: string | null;
  /** Root Strong without the sense letter, e.g. "H3117". */
  readonly strongBase: string | null;
  readonly prefixes: readonly string[];
  readonly suffixes: readonly string[];
  /** The tag ends with "+": the same tag covers the next word (e.g. Beth- + -lehem). */
  readonly conjoined: boolean;
  readonly morphRaw: string;
  /** Morphology of the root, e.g. "Ncmpc". */
  readonly morph: string | null;
  readonly lemma: string | null;
  readonly lemmaGloss: string | null;
  readonly expandedRaw: string;
  /** TIPNR-style unique name from the expanded tag, e.g. "Chilion@Rut.1.2-". */
  readonly nameId: string | null;
  readonly isProperName: boolean;
  readonly nameKind: NameKind | null;
};

const LINE_START_RE = /^\w{3}\.\d+\.\d+/;
const REF_RE = /^(\w{3})\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#(\d+)=(.+)$/;
const ROOT_TAG_RE = /\{(H[0-9]{4}[A-Za-z]?)=([^=}]*)=([^}]*)\}/;
const STRONG_RE = /H[0-9]{4}[A-Za-z]?/;

const issue = (line: string, reason: string): ParseOutcome<never> => err({ line, reason });

const kindOf = (morph: string | null): NameKind | null => {
  if (morph === null) return null;
  if (morph.startsWith('Ng')) return 'gentilic';
  if (morph.startsWith('Npl')) return 'place';
  if (/^Np[mf]/.test(morph)) return 'person';
  return morph.startsWith('Np') ? 'other' : null;
};

export const parseTahotLine = (rawLine: string): ParseOutcome<TahotWord> => {
  const line = rawLine.replace(/\r$/, '');
  if (!LINE_START_RE.test(line)) return ok(null);
  const cols = line.split('\t');
  const m = REF_RE.exec(cols[0] ?? '');
  if (m === null) return issue(line, 'malformed reference');
  const [, code = '', c = '', v = '', hc, hv, pos = '', textType = ''] = m;
  const book = normalizeBook(code);
  if (!book.ok) return issue(line, `unknown book code ${code}`);
  const chapter = Number(c);
  const verse = Number(v);

  const strongRaw = cols[4] ?? '';
  const morphRaw = cols[5] ?? '';
  const expandedRaw = cols[11] ?? '';

  // Punctuation tags follow '\'; prefix/root/suffix segments are separated by '/'.
  const main = strongRaw.split('\\')[0] ?? '';
  const conjoined = main.endsWith('+');
  const segs = main.replace(/\+$/, '').split('/');
  const found = segs.findIndex((s) => s.includes('{'));
  const rootIdx = found < 0 ? 0 : found;
  const rootSeg = segs[rootIdx] ?? '';
  const strong = rootSeg.includes('{') ? (STRONG_RE.exec(rootSeg)?.[0] ?? null) : null;

  const morphSeg = morphRaw.split('/')[rootIdx];
  const morph = morphSeg === undefined ? null : rootIdx === 0 ? morphSeg.replace(/^[HA]/, '') : morphSeg;
  const nameKind = kindOf(morph);

  const tag = ROOT_TAG_RE.exec(expandedRaw);
  const rest = tag?.[3] ?? '';
  const arrow = rest.indexOf('»');
  const afterArrow = arrow >= 0 ? rest.slice(arrow + 1) : '';

  return ok({
    book: book.value.id,
    chapter,
    verse,
    hebChapter: hc === undefined ? chapter : Number(hc),
    hebVerse: hv === undefined ? verse : Number(hv),
    position: Number(pos),
    textType,
    original: cols[1] ?? '',
    transliteration: cols[2] ?? '',
    gloss: cols[3] ?? '',
    strongRaw,
    strong,
    strongBase: strong === null ? null : strongBase(strong),
    prefixes: segs.slice(0, rootIdx),
    suffixes: segs.slice(rootIdx + 1),
    conjoined,
    morphRaw,
    morph,
    lemma: tag?.[2] ?? null,
    lemmaGloss: tag === null ? null : arrow >= 0 ? rest.slice(0, arrow) : rest,
    expandedRaw,
    nameId: afterArrow.includes('@') ? afterArrow : null,
    isProperName: nameKind !== null,
    nameKind,
  });
};
