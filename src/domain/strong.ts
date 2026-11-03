import type { InputError } from './errors.ts';
import { err, ok, type Result } from './result.ts';

export type Strong = {
  readonly lang: 'H' | 'G';
  readonly num: number;
  /** Disambiguation letter, e.g. "G" in H7704G; absent for a bare number. */
  readonly sense?: string;
  /** Canonical form: language, four-digit number, optional sense letter, e.g. "H7704G". */
  readonly key: string;
};

const STRONG_RE = /^([HG])0*([1-9]\d{0,3})([A-Z])?$/;

export const parseStrong = (input: string): Result<Strong, InputError> => {
  const m = STRONG_RE.exec(input.trim().toUpperCase());
  if (m === null) return err({ kind: 'malformed_strong', input });
  const lang = m[1] === 'G' ? 'G' : 'H';
  const num = Number(m[2]);
  const sense = m[3];
  const key = `${lang}${String(num).padStart(4, '0')}${sense ?? ''}`;
  return ok(sense === undefined ? { lang, num, key } : { lang, num, sense, key });
};
