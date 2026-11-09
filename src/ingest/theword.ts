import { KJV_LINES } from '../domain/kjv.ts';
import { err, ok, type Result } from '../domain/result.ts';
import type { VersionId } from '../domain/versions.ts';

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

/**
 * Decodes a UTF-8 theWord module. Lines end in CRLF (a lone CR becomes a space); a BOM is dropped. The first
 * 31 102 lines are verses, then a blank line, then metadata: `key=value`, a trailing `\` continues the value
 * on the next line, `#` lines are comments and a repeated key keeps every value, one per line.
 */
export const decodeModule = (bytes: Uint8Array): Result<TheWordModule, ModuleIssue> => {
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  const all = text.split('\r\n').map((line) => line.replaceAll('\r', ' '));
  if (all.length <= KJV_LINES || all[KJV_LINES] !== '') {
    const separator = all.findIndex((line, i) => line === '' && META_KEY_RE.test(all[i + 1] ?? ''));
    return err({ kind: 'verse_count', expected: KJV_LINES, found: separator < 0 ? all.length : separator });
  }
  return ok({ meta: parseMeta(all.slice(KJV_LINES + 1)), lines: all.slice(0, KJV_LINES) });
};

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

/** A native verse-number marker: plain `(c:v)` in the text. */
export type NativeRefPattern = 'paren';

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
  readonly stripMarkers: readonly StripMarker[];
};

/** The supplied modules, by file name. */
export type ModuleId = 'kjv' | 'darby' | 'gerelb' | 'rst' | 'ukrio';

/** Rules for the supplied modules, keyed by file name; ukrio is the normalized module (rst-style refs). */
export const MODULE_RULES: Readonly<Record<ModuleId, ModuleRules>> = {
  kjv: {
    bracketMeaning: 'words added by the translators',
    nativeRefPatterns: [],
    stripMarkers: [],
  },
  darby: {
    bracketMeaning: 'words added by the translator',
    nativeRefPatterns: [],
    stripMarkers: [],
  },
  gerelb: {
    bracketMeaning: 'readings of the traditional text that the critical text omits',
    // The <WTH>/<WTG> tags mark only some of the verses numbered differently, so none is shown.
    nativeRefPatterns: [],
    stripMarkers: ['trailing-dash'],
  },
  rst: {
    bracketMeaning: 'words added by the translators',
    nativeRefPatterns: ['paren'],
    stripMarkers: ['title-carets'],
  },
  ukrio: {
    bracketMeaning: null,
    nativeRefPatterns: ['paren'],
    stripMarkers: [],
  },
};

/** The module each `get_translation` version is read from. */
export const VERSION_MODULE: Readonly<Record<VersionId, ModuleId>> = {
  kjv: 'kjv',
  darby: 'darby',
  elb1905: 'gerelb',
  ohienko: 'ukrio',
  rst: 'rst',
};

/** A verse line as plain text, with the module's own verse numbers (`c:v`) in line order. */
export type CleanVerse = {
  readonly text: string;
  readonly nativeRefs: readonly string[];
};

const TOKEN_RE = /<([^<>]*)>|[^<]+|</g;
const PAREN_REF_RE = /\((\d+):(\d+)\)/g;
// Brackets made from `<FI>…<Fi>`, kept apart from the module's own `[`/`]` until the line is done.
const FI_OPEN = '\uE000';
const FI_CLOSE = '\uE001';
const FI_MARK_RE = /[\uE000\uE001]/g;

/**
 * Cleans one verse line. `<FI>…<Fi>` becomes `[…]` per line (an unmatched `<FI>` brackets to the end of
 * the line, an unmatched `<Fi>` from its start, nesting is flattened); notes become ` ⸨…⸩`; native-ref
 * markers are collected and removed; every other tag is dropped and its content kept.
 */
export const cleanVerse = (line: string, rules: ModuleRules): CleanVerse => {
  const parenRefs = rules.nativeRefPatterns.includes('paren');
  const nativeRefs: string[] = [];

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
        text = text.replace(PAREN_REF_RE, (_m: string, c: string, v: string) => {
          nativeRefs.push(`${c}:${v}`);
          return '';
        });
      }
      out += stripText(text, rules.stripMarkers);
      continue;
    }
    if (tag === 'RF') {
      note = '';
    } else if (tag === 'Rf') {
      out += closeNote(note);
      note = null;
    } else if (note !== null) {
      // Tags inside a note are dropped.
    } else if (tag === 'FI') {
      if (depth === 0) out += FI_OPEN;
      depth++;
    } else if (tag === 'Fi') {
      if (depth > 0) {
        depth--;
        if (depth === 0) out += FI_CLOSE;
      } else {
        out = `${FI_OPEN}${out.replace(FI_MARK_RE, '')}${FI_CLOSE}`;
      }
    }
  }
  if (note !== null) out += closeNote(note);
  if (depth > 0) out += FI_CLOSE;
  const text = out.replaceAll(FI_OPEN, '[').replaceAll(FI_CLOSE, ']');
  return { text: tidy(text, rules.stripMarkers), nativeRefs };
};

/**
 * The module's own numbers for a cleaned line, or null if the line has no marker: `13:2`, or a range from the
 * first marker to the last (`3:1-2`, `12:18-13:1`). Text before a mid-line first marker gets no number: the
 * module does not give one, and it may continue the previous verse rather than start at the slot's number.
 */
export const nativeRange = (clean: CleanVerse): string | null => {
  const first = clean.nativeRefs[0];
  const last = clean.nativeRefs.at(-1);
  if (first === undefined || last === undefined) return null;
  if (first === last) return first;
  const [firstChapter] = first.split(':');
  const [lastChapter, lastVerse] = last.split(':');
  return firstChapter === lastChapter ? `${first}-${lastVerse ?? ''}` : `${first}-${last}`;
};

const closeNote = (note: string | null): string => {
  const body = (note ?? '').replace(/\s+/g, ' ').trim();
  return body !== '' ? ` ⸨${body}⸩` : '';
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
