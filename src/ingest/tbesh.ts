import { err, ok } from '../domain/result.ts';
import type { ParseOutcome } from './issue.ts';

/** One row of a brief lexicon: TBESH (Hebrew) and TBESG (Greek) share this layout. */
export type TbeshEntry = {
  /** Extended Strong, e.g. "H0376" or "G20001". */
  readonly estrong: string;
  /** Disambiguated Strong, e.g. "H0376G" or "G3004H". */
  readonly dstrong: string;
  /** Text after "=" in the dStrong column, e.g. "a Meaning of"; empty for a main entry. */
  readonly relation: string;
  readonly ustrong: string;
  readonly original: string;
  readonly transliteration: string;
  /** e.g. "N:N-M-P". */
  readonly morph: string;
  readonly gloss: string;
  readonly meaningHtml: string;
  /** Plain-text meaning. */
  readonly meaning: string;
};

const LINE_START_RE = /^[HG]\d{4,5}[a-z]?\t/;
const DSTRONG_RE = /^([HG]\d{4,5}[A-Za-z]?)\s*=?\s*(.*)$/;

const stripHtml = (s: string): string =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    // Outline markers of the Greek meanings ("__1.").
    .replace(/__/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

export const parseTbeshLine = (rawLine: string): ParseOutcome<TbeshEntry> => {
  const line = rawLine.replace(/\r$/, '');
  if (!LINE_START_RE.test(line)) return ok(null);
  const cols = line.split('\t');
  const m = DSTRONG_RE.exec(cols[1] ?? '');
  if (m === null) return err({ line, reason: 'malformed dStrong column' });
  const meaningHtml = cols.slice(7).join('\t');
  return ok({
    estrong: (cols[0] ?? '').toUpperCase(),
    dstrong: m[1] ?? '',
    relation: (m[2] ?? '').trim(),
    ustrong: cols[2] ?? '',
    original: cols[3] ?? '',
    transliteration: cols[4] ?? '',
    morph: cols[5] ?? '',
    gloss: cols[6] ?? '',
    meaningHtml,
    meaning: stripHtml(meaningHtml),
  });
};
