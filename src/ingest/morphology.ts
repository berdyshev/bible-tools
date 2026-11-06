export type MorphologyLanguage = 'hebrew' | 'greek';

/** One full morphology code with its explanation, from TEHMC (Hebrew) or TEGMC (Greek). */
export type MorphologyCode = {
  /** e.g. "HVqw3ms" or "V-AAI-3S". */
  readonly code: string;
  readonly language: MorphologyLanguage;
  /** The elements of the code, e.g. "Function=Verb; Tense=Aorist; …". */
  readonly parsing: string;
  /** The morphology as a phrase, e.g. "Verb Aorist Active Indicative 3rd Singular". */
  readonly summary: string;
  /** What the form expresses. */
  readonly meaning: string;
  /** How a word in this form might be translated; empty when the entry has none. */
  readonly example: string;
};

const MARKER = 'FULL MORPHOLOGY CODES:';
const HEAD_RE = /^([A-Za-z][\w:/-]*)\t(.*)$/;

const clean = (s: string): string =>
  s
    .trim()
    .replace(/^Example:\s*/, '')
    .replace(/^"(.*)"$/, '$1')
    .trim();

/**
 * Reads the entries that follow the `FULL MORPHOLOGY CODES:` line. An entry is a line `code<TAB>parsing`
 * followed by tab-indented lines (summary, meaning, example) and normally ended by a line `$`; the last
 * entry of a file may lack the `$`. Blocks that do not start with a code are skipped, and when a code
 * repeats the first entry wins.
 */
export const parseMorphologyCodes = (
  lines: Iterable<string>,
  language: MorphologyLanguage,
): MorphologyCode[] => {
  const codes = new Map<string, MorphologyCode>();
  let inCodes = false;
  let block: string[] = [];

  const flush = (): void => {
    const head = HEAD_RE.exec(block[0] ?? '');
    if (head !== null) {
      const code = head[1] ?? '';
      const details: string[] = [];
      for (const line of block.slice(1)) {
        if (!line.startsWith('\t')) break;
        details.push(clean(line));
      }
      if (!codes.has(code)) {
        codes.set(code, {
          code,
          language,
          parsing: (head[2] ?? '').split('\t')[0]?.trim() ?? '',
          summary: details[0] ?? '',
          meaning: details[1] ?? '',
          example: details[2] ?? '',
        });
      }
    }
    block = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!inCodes) {
      inCodes = line.startsWith(MARKER);
    } else if (line.trim() === '$') {
      flush();
    } else {
      block.push(line);
    }
  }
  flush();
  return [...codes.values()];
};
