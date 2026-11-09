import { KJV_LINES } from '../domain/kjv.ts';
import { err, ok, type Result } from '../domain/result.ts';

/** Text encodings of the supplied theWord modules. */
export type ModuleEncoding = 'windows-1251' | 'windows-1252' | 'utf-8';

/** A decoded theWord Bible module: one line per KJV verse slot, then `key=value` metadata. */
export type TheWordModule = {
  readonly meta: Readonly<Record<string, string>>;
  /** Exactly `KJV_LINES` raw verse lines; an empty line is a slot without text. */
  readonly lines: readonly string[];
};

/** Why a file is not a theWord Bible module. */
export type ModuleIssue = {
  readonly kind: 'verse_count';
  readonly expected: number;
  /** Verse lines found before the blank line that opens the metadata. */
  readonly found: number;
};

// The first metadata line: a key, then `=`.
const META_KEY_RE = /^[\w.#-]+\s*=/;

/** Decodes module bytes to text, without the BOM. `windows-1252` bytes 0x80-0x9F follow WHATWG, not Latin-1. */
export const decodeText = (bytes: Uint8Array, encoding: ModuleEncoding): string => {
  const decoded = new TextDecoder(encoding).decode(bytes);
  return (encoding === 'windows-1252' ? fixC1(decoded) : decoded).replace(/^\uFEFF/, '');
};

/**
 * Decodes a theWord module. Lines end in CRLF (a lone CR becomes a space); a BOM is dropped. The first
 * 31 102 lines are verses, then a blank line, then metadata: `key=value`, a trailing `\` continues the value
 * on the next line, `#` lines are comments and a repeated key keeps every value, one per line.
 */
export const decodeModule = (
  bytes: Uint8Array,
  encoding: ModuleEncoding,
): Result<TheWordModule, ModuleIssue> => {
  const text = decodeText(bytes, encoding);
  const all = text.split('\r\n').map((line) => line.replaceAll('\r', ' '));
  if (all.length <= KJV_LINES || all[KJV_LINES] !== '') {
    const separator = all.findIndex((line, i) => line === '' && META_KEY_RE.test(all[i + 1] ?? ''));
    return err({ kind: 'verse_count', expected: KJV_LINES, found: separator < 0 ? all.length : separator });
  }
  return ok({ meta: parseMeta(all.slice(KJV_LINES + 1)), lines: all.slice(0, KJV_LINES) });
};

// WHATWG windows-1252 for bytes 0x80-0x9F. Node 24 decodes `windows-1252` as Latin-1, so 0x85 would
// become the control U+0085 instead of `…`.
const WINDOWS_1252_C1 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';

const fixC1 = (text: string): string =>
  text.replace(/[\u0080-\u009F]/g, (c) => WINDOWS_1252_C1[c.charCodeAt(0) - 0x80] ?? c);

const parseMeta = (lines: readonly string[]): Record<string, string> => {
  const meta: Record<string, string> = {};
  let key: string | null = null;
  let value = '';
  const flush = (): void => {
    if (key === null) return;
    const before = meta[key];
    meta[key] = before === undefined ? value : `${before}\n${value}`;
    key = null;
  };
  for (const line of lines) {
    if (key !== null) {
      value = `${value} ${line.trim()}`;
    } else {
      if (line.trim() === '' || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      key = line.slice(0, eq).trim();
      value = line.slice(eq + 1).trim();
    }
    if (value.endsWith('\\')) value = value.slice(0, -1).trimEnd();
    else flush();
  }
  flush();
  return meta;
};

/** A native verse-number marker: `<WTHc:v>` / `<WTGc:v>` tags, or plain `(c:v)` in the text. */
export type NativeRefPattern = 'wt-tag' | 'paren';

/** A plain-text marker the module puts around or before words. */
export type StripMarker =
  /** RST: `^^title^^` around a psalm title. */
  | 'title-carets'
  /** Elberfelder: ` -` at the end of a verse. */
  | 'trailing-dash';

/** How one module's markup becomes plain text. */
export type ModuleRules = {
  /** What `[…]` means in the cleaned text (from `<FI>…<Fi>` or the module's own brackets), or null. */
  readonly bracketMeaning: string | null;
  readonly nativeRefPatterns: readonly NativeRefPattern[];
  /** `<RF>…<Rf>` notes: kept inline as ` ⸨…⸩`, or dropped. */
  readonly notes: 'inline' | 'drop';
  readonly stripMarkers: readonly StripMarker[];
};

/** The supplied modules, by file name. */
export type ModuleId = 'kjv' | 'darby' | 'gerelb' | 'rst' | 'ukrio';

/** Rules for the supplied modules, keyed by file name; ukrio is the normalized module (rst-style refs). */
export const MODULE_RULES: Readonly<Record<ModuleId, ModuleRules>> = {
  kjv: {
    bracketMeaning: 'words added by the translators',
    nativeRefPatterns: [],
    notes: 'inline',
    stripMarkers: [],
  },
  darby: {
    bracketMeaning: 'words added by the translator',
    nativeRefPatterns: [],
    notes: 'inline',
    stripMarkers: [],
  },
  gerelb: {
    bracketMeaning: 'readings of the traditional text that the critical text omits',
    nativeRefPatterns: ['wt-tag'],
    notes: 'inline',
    stripMarkers: ['trailing-dash'],
  },
  rst: {
    bracketMeaning: 'words added by the translators',
    nativeRefPatterns: ['paren'],
    notes: 'inline',
    stripMarkers: ['title-carets'],
  },
  ukrio: {
    bracketMeaning: null,
    nativeRefPatterns: ['paren'],
    notes: 'inline',
    stripMarkers: [],
  },
};

/** A verse line as plain text, with the module's own verse numbers (`c:v`) in line order. */
export type CleanVerse = {
  readonly text: string;
  readonly nativeRefs: readonly string[];
  /** True when the first native ref precedes all text; otherwise the line starts at its own slot number. */
  readonly startsWithRef: boolean;
};

const TOKEN_RE = /<([^<>]*)>|[^<]+|</g;
const WT_RE = /^WT[HG](\d+):(\d+)$/;
const PAREN_REF_RE = /\((\d+):(\d+)\)/g;

/**
 * Cleans one verse line. `<FI>…<Fi>` becomes `[…]` per line (an unmatched `<FI>` brackets to the end of
 * the line, an unmatched `<Fi>` from its start, nesting is flattened); notes become ` ⸨…⸩`; native-ref
 * markers are collected and removed; every other tag is dropped and its content kept.
 */
export const cleanVerse = (line: string, rules: ModuleRules): CleanVerse => {
  const wtRefs = rules.nativeRefPatterns.includes('wt-tag');
  const parenRefs = rules.nativeRefPatterns.includes('paren');
  const nativeRefs: string[] = [];
  let startsWithRef = false;
  const addRef = (chapter: string, verse: string, before: string): void => {
    if (nativeRefs.length === 0) startsWithRef = before.trim() === '';
    nativeRefs.push(`${chapter}:${verse}`);
  };

  let out = '';
  let depth = 0;
  let note: string | null = null;
  for (const [token, tag] of line.matchAll(TOKEN_RE)) {
    if (tag === undefined) {
      if (note !== null) {
        note += token;
        continue;
      }
      let text = token;
      if (parenRefs) {
        text = text.replace(PAREN_REF_RE, (_m: string, c: string, v: string, at: number) => {
          addRef(c, v, out + text.slice(0, at));
          return '';
        });
      }
      out += stripText(text, rules.stripMarkers);
      continue;
    }
    if (tag === 'RF') {
      note = '';
    } else if (tag === 'Rf') {
      out += closeNote(note, rules);
      note = null;
    } else if (note !== null) {
      // Tags inside a note are dropped.
    } else if (tag === 'FI') {
      if (depth === 0) out += '[';
      depth++;
    } else if (tag === 'Fi') {
      if (depth > 0) {
        depth--;
        if (depth === 0) out += ']';
      } else {
        out = `[${out.replace(/[[\]]/g, '')}]`;
      }
    } else {
      const wt = WT_RE.exec(tag);
      if (wt !== null && wtRefs) addRef(wt[1] ?? '', wt[2] ?? '', out);
    }
  }
  if (note !== null) out += closeNote(note, rules);
  if (depth > 0) out += ']';
  return { text: tidy(out, rules.stripMarkers), nativeRefs, startsWithRef };
};

const closeNote = (note: string | null, rules: ModuleRules): string => {
  const body = (note ?? '').replace(/\s+/g, ' ').trim();
  return rules.notes === 'inline' && body !== '' ? ` ⸨${body}⸩` : '';
};

const stripText = (text: string, markers: readonly StripMarker[]): string => {
  let result = text;
  if (markers.includes('title-carets')) result = result.replaceAll('^^', '');
  return result;
};

// A space before punctuation (`acacia[-wood] ,`, `кликав .Вернися`); a letter glued after it gets a space.
// An ellipsis (`...`, `…`) keeps its space: Darby and Elberfelder set ` ...For` for a break in speech.
const SPACED_PUNCT_RE = /\s+([,;:!?]|\.(?!\.))(\p{L})?/gu;

const tidy = (text: string, markers: readonly StripMarker[]): string => {
  let result = text
    .replace(/\s+/g, ' ')
    .replace(/\[\s+/g, '[')
    .replace(/\s+\]/g, ']')
    .replace(/\[\]/g, '')
    .replace(/\]\s+(?=[,.;:!?])/g, ']')
    .replace(/\s+/g, ' ')
    .replace(SPACED_PUNCT_RE, (_m: string, punct: string, letter: string | undefined) =>
      letter === undefined ? punct : `${punct} ${letter}`,
    )
    .trim();
  if (markers.includes('trailing-dash')) result = result.replace(/\s+-$/, '');
  return result;
};
