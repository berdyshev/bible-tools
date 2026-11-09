// Normalizes the theWord modules in data/theword/original/ to one format on the KJV verse grid (line n holds
// the text of KJV verse n; a module's own verse number, where it differs, is a `(c:v)` marker as in the RST
// module) and writes data/theword/<file>.ont (UTF-8 with a BOM, CRLF) plus data/theword/MANIFEST.json.
// Deterministic: the same originals give the same bytes.
// Usage: node scripts/normalize-theword.ts           write the normalized modules and the manifest
//        node scripts/normalize-theword.ts --check   exit 1 if the files on disk differ from a fresh run
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BOOKS, type Book } from '../src/domain/books.ts';
import { KJV_LINES, KJV_VERSES, lineIndex, refAt } from '../src/domain/kjv.ts';
import type { VersionId } from '../src/domain/versions.ts';

const DIR = fileURLToPath(new URL('../data/theword/', import.meta.url));

// ---------------------------------------------------------------------------------------------------------
// Original module encodings

/** Text encodings of the supplied theWord modules. */
export type ModuleEncoding = 'windows-1251' | 'windows-1252' | 'utf-8';

// WHATWG windows-1252 for bytes 0x80-0x9F. Node 24 decodes `windows-1252` as Latin-1, so 0x85 would
// become the control U+0085 instead of `…`.
const WINDOWS_1252_C1 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';

const fixC1 = (text: string): string =>
  text.replace(/[\u0080-\u009F]/g, (c) => WINDOWS_1252_C1[c.charCodeAt(0) - 0x80] ?? c);

/** Decodes original module bytes to text, without the BOM. `windows-1252` bytes 0x80-0x9F follow WHATWG, not Latin-1. */
export const decodeOriginal = (bytes: Uint8Array, encoding: ModuleEncoding): string => {
  const decoded = new TextDecoder(encoding).decode(bytes);
  return (encoding === 'windows-1252' ? fixC1(decoded) : decoded).replace(/^\uFEFF/, '');
};

// ---------------------------------------------------------------------------------------------------------
// Verse references

type Ref = { readonly book: Book; readonly chapter: number; readonly verse: number };

const bookById = (id: string): Book => {
  const book = BOOKS.find((b) => b.id === id);
  if (book === undefined) throw new Error(`unknown book ${id}`);
  return book;
};

const versesOf = (book: Book): readonly number[] => KJV_VERSES[book.id] ?? [];

const indexOf = (book: Book, chapter: number, verse: number): number => {
  const index = lineIndex(book, chapter, verse);
  if (index === null) throw new Error(`${book.id} ${chapter}:${verse} is not a KJV verse`);
  return index;
};

const refName = (book: Book, chapter: number, verse: number): string => `${book.id} ${chapter}:${verse}`;

const lineName = (index: number): string => {
  const ref = refAt(index);
  return ref === null ? `line ${index + 1}` : refName(ref.book, ref.chapter, ref.verse);
};

const REF_RE = /^(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;

/** Parses `Gen 32:1`, `Gen 32:2-33` or `Isa 63:19-64:1` into the verses it covers, in order. */
const parseRange = (text: string): Ref[] => {
  const m = REF_RE.exec(text);
  if (m === null) throw new Error(`bad reference ${text}`);
  const book = bookById(m[1] ?? '');
  const chapter = Number(m[2]);
  const verse = Number(m[3]);
  if (m[5] === undefined) return [{ book, chapter, verse }];
  const toChapter = m[4] === undefined ? chapter : Number(m[4]);
  const toVerse = Number(m[5]);
  const refs: Ref[] = [];
  for (let c = chapter; c <= toChapter; c++) {
    const last = c === toChapter ? toVerse : (versesOf(book)[c - 1] ?? 0);
    for (let v = c === chapter ? verse : 1; v <= last; v++) refs.push({ book, chapter: c, verse: v });
  }
  return refs;
};

/** Compresses sorted line indexes into `Mark 9:45-46, John 5:3-4` style ranges. */
const describeLines = (indexes: readonly number[]): string => {
  const parts: string[] = [];
  let start = -1;
  let prev = -2;
  const flush = (): void => {
    if (start < 0) return;
    const a = refAt(start);
    const z = refAt(prev);
    if (a === null || z === null) return;
    if (start === prev) parts.push(refName(a.book, a.chapter, a.verse));
    else if (a.book.id === z.book.id && a.chapter === z.chapter)
      parts.push(`${refName(a.book, a.chapter, a.verse)}-${z.verse}`);
    else parts.push(`${refName(a.book, a.chapter, a.verse)}-${z.chapter}:${z.verse}`);
  };
  for (const i of indexes) {
    if (i !== prev + 1) {
      flush();
      start = i;
    }
    prev = i;
  }
  flush();
  return parts.join(', ');
};

// ---------------------------------------------------------------------------------------------------------
// Module files

type ModuleFile = { readonly lines: readonly string[]; readonly meta: readonly string[] };

const readModule = (bytes: Uint8Array, encoding: ModuleEncoding, name: string): ModuleFile => {
  const all = decodeOriginal(bytes, encoding).split('\r\n');
  if (all.length <= KJV_LINES || all[KJV_LINES] !== '') throw new Error(`${name}: not 31 102 verse lines`);
  const meta = all.slice(KJV_LINES + 1);
  if (meta.at(-1) === '') meta.pop();
  return { lines: all.slice(0, KJV_LINES), meta };
};

// theWord recognises a UTF-8 module by its BOM.
const encode = (text: string): Uint8Array => new TextEncoder().encode(`\uFEFF${text}`);

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// ---------------------------------------------------------------------------------------------------------
// Elberfelder, Darby: `<FI>…<Fi>` balanced and flat on every verse line

const FI_RE = /<F[Ii]>/g;
const TRAILING_CM_RE = /^([\s\S]*?)((?:<CM>)*)$/;

/** Wraps the whole verse text (before a trailing `<CM>`) in one `<FI>…<Fi>`, dropping inner ones. */
const bracketWholeVerse = (line: string): string => {
  const m = TRAILING_CM_RE.exec(line);
  const text = (m?.[1] ?? line).replace(FI_RE, '').trim();
  return `<FI>${text}<Fi>${m?.[2] ?? ''}`;
};

/**
 * Makes every line's `<FI>…<Fi>` balanced and unnested: a span still open at the end of a line is closed
 * there (before a trailing `<CM>`) and reopened at the start of the next line; inner pairs are dropped.
 * Returns the indexes of the lines it changed.
 */
const balanceAddedWords = (lines: string[]): number[] => {
  const changed: number[] = [];
  let depth = 0;
  lines.forEach((line, i) => {
    let out = depth > 0 ? '<FI>' : '';
    let last = 0;
    for (const m of line.matchAll(FI_RE)) {
      out += line.slice(last, m.index);
      last = m.index + m[0].length;
      if (m[0] === '<FI>') {
        if (depth === 0) out += '<FI>';
        depth++;
      } else {
        if (depth === 0) throw new Error(`${lineName(i)}: <Fi> without <FI>`);
        depth--;
        if (depth === 0) out += '<Fi>';
      }
    }
    out += line.slice(last);
    if (depth > 0) {
      const m = TRAILING_CM_RE.exec(out);
      out = `${m?.[1] ?? out}<Fi>${m?.[2] ?? ''}`;
    }
    if (out !== line) {
      lines[i] = out;
      changed.push(i);
    }
  });
  if (depth !== 0) throw new Error('<FI> still open at the end of the module');
  return changed;
};

const normalizeGerelb = (lines: string[]): string[] => {
  // The module opens `<FI>` at Mark 16:9 and closes it only at John 8:11, so both disputed passages are
  // meant to be bracketed; 1 511 lines in between would be bracketed with them. Each verse of the two
  // passages gets its own pair instead.
  const mark = parseRange('Mark 16:9-20').map((r) => indexOf(r.book, r.chapter, r.verse));
  const john = parseRange('John 7:53-8:11').map((r) => indexOf(r.book, r.chapter, r.verse));
  const open = lines[mark[0] ?? 0] ?? '';
  const close = lines[john.at(-1) ?? 0] ?? '';
  if (!open.startsWith('<FI> ') || !close.endsWith('.<Fi><CM>'))
    throw new Error('gerelb Mark 16:9 / John 8:11 changed');
  for (const i of [...mark, ...john]) lines[i] = bracketWholeVerse(lines[i] ?? '');
  const balanced = balanceAddedWords(lines);
  const renumbered = correctHebrewTags(lines);
  return [
    `<WTHc:v> tags set from the Hebrew verse map (HEB_TO_KJV) where the module's disagreed or were missing in a tagged chapter, a leading tag wherever the line starts in a Hebrew verse other than its KJV number: ${describeLines(renumbered)}`,
    'Mark 16:9-20 and John 7:53-8:11: the <FI> opened at Mark 16:9 and closed at John 8:11 is set per verse',
    `<FI> spans crossing verse lines closed at the line end and reopened on the next line: ${describeLines(balanced)}`,
  ];
};

const WTH_RE = /<WTH(\d+):(\d+)> ?/g;

/**
 * The module's `<WTHc:v>` (Hebrew numbering) tags are partly wrong (Job 40:1-41:34 follow another division,
 * 2Kgs 12:1 says 12:1 for Hebrew 12:2, Num 30:1 has only a mid-line tag although the line starts in Hebrew
 * 30:2). In every Old Testament chapter that has a tag, outside the Psalms, each line gets the tags of the
 * Hebrew verses it holds (`hebrewOf`): a leading tag if the first differs from the KJV number, a mid-line tag
 * for a second one at the position the module put its mid-line tag. In the Psalms only
 * tagged lines are corrected. Returns the indexes of the lines changed.
 */
const correctHebrewTags = (lines: string[]): number[] => {
  const tagged = new Set<string>();
  lines.forEach((line, i) => {
    const ref = refAt(i);
    if (ref !== null && line.includes('<WTH')) tagged.add(`${ref.book.id} ${ref.chapter}`);
  });
  const changed: number[] = [];
  lines.forEach((line, i) => {
    const ref = refAt(i);
    if (ref === null || ref.book.testament !== 'OT') return;
    const hasTag = line.includes('<WTH');
    if (!hasTag && (ref.book.id === 'Ps' || !tagged.has(`${ref.book.id} ${ref.chapter}`))) return;
    const hebrew = hebrewOf(ref.book, ref.chapter, ref.verse);
    let text = '';
    let mid = -1;
    let last = 0;
    for (const m of line.matchAll(WTH_RE)) {
      const before = line.slice(last, m.index);
      text += before;
      if (text.replace(/<[^<>]*>/g, '').trim() !== '') {
        if (mid < 0) mid = text.length;
        if (!text.endsWith(' ')) text += ' ';
      }
      last = m.index + m[0].length;
    }
    text += line.slice(last);
    const [first, second] = hebrew;
    // An untagged line holding two Hebrew verses has no known place for the second tag: left as it is.
    if (!hasTag && second !== undefined) return;
    if (first === undefined || hebrew.length > 2)
      throw new Error(`gerelb ${lineName(i)}: Hebrew ${hebrew.join(', ')}`);
    if (second !== undefined && mid < 0)
      throw new Error(`gerelb ${lineName(i)}: no place for <WTH${second}>`);
    if (second !== undefined && mid >= 0)
      text = `${text.slice(0, mid)}<WTH${second}> ${text.slice(mid).trimStart()}`;
    const out = first === `${ref.chapter}:${ref.verse}` ? text : `<WTH${first}> ${text}`;
    if (out !== line) {
      lines[i] = out;
      changed.push(i);
    }
  });
  return changed;
};

const normalizeDarby = (lines: string[]): string[] => {
  const balanced = balanceAddedWords(lines);
  return [
    `<FI> spans crossing verse lines closed at the line end and reopened on the next line, nested <FI> flattened: ${describeLines(balanced)}`,
  ];
};

// ---------------------------------------------------------------------------------------------------------
// RST: chapters whose lines are shifted against the KJV verses

/** Text of an original verse of the same chapter, or the part before / from an anchor, with a prefix. */
type Piece = {
  readonly from: number;
  readonly before?: string;
  readonly after?: string;
  readonly prefix?: string;
};

type Reslot = {
  readonly chapter: string;
  readonly why: string;
  readonly verses: Readonly<Record<number, readonly Piece[]>>;
};

const RST_RESLOT: readonly Reslot[] = [
  {
    chapter: 'Song 1',
    why: 'Song 1: the module lacks the title verse 1:1 and holds KJV 1:2-17 in lines 1:1-17 (1:17 split over two lines); moved up one line, KJV 1:1 left empty',
    verses: {
      1: [],
      ...Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 2, [{ from: i + 1 }]])),
      17: [{ from: 16 }, { from: 17 }],
    },
  },
  {
    chapter: 'Ps 90',
    why: 'Ps 90:1-6: lines hold Synodal 89:1-6 by number (title alone in 89:1, KJV 90:5-6 in 89:6); joined and split onto the KJV verses',
    verses: {
      1: [{ from: 1 }, { from: 2 }],
      2: [{ from: 3 }],
      3: [{ from: 4 }],
      4: [{ from: 5 }],
      5: [{ from: 6, before: 'утром цветет' }],
      6: [{ from: 6, after: 'утром цветет', prefix: '(89:6) ' }],
    },
  },
  {
    chapter: 'Isa 3',
    why: 'Isa 3:19-26: KJV 3:19-20 in one line and 3:26 over two lines, the lines between shifted by one; re-slotted',
    verses: {
      19: [{ from: 19, before: 'увясла' }],
      20: [{ from: 19, after: 'увясла' }],
      21: [{ from: 20 }],
      22: [{ from: 21 }],
      23: [{ from: 22 }],
      24: [{ from: 23 }],
      25: [{ from: 24 }],
      26: [{ from: 25 }, { from: 26 }],
    },
  },
];

/** The text before (or from) an anchor that occurs exactly once in `text`. */
const cut = (text: string, anchor: string, part: 'before' | 'after', where: string): string => {
  const at = text.indexOf(anchor);
  if (at < 0 || text.indexOf(anchor, at + 1) >= 0)
    throw new Error(`${where}: anchor ${anchor} not found once`);
  return (part === 'before' ? text.slice(0, at) : text.slice(at)).trim();
};

const normalizeRst = (lines: string[]): string[] => {
  for (const { chapter, verses } of RST_RESLOT) {
    const [first] = parseRange(`${chapter}:1`);
    if (first === undefined) continue;
    const at = (v: number): number => indexOf(first.book, first.chapter, v);
    const original = (v: number): string => lines[at(v)] ?? '';
    const next = new Map<number, string>();
    for (const [verse, pieces] of Object.entries(verses)) {
      const text = pieces.map((p) => {
        const where = `rst ${chapter}:${p.from}`;
        const whole = original(p.from);
        const part =
          p.before !== undefined
            ? cut(whole, p.before, 'before', where)
            : p.after !== undefined
              ? cut(whole, p.after, 'after', where)
              : whole.trim();
        return `${p.prefix ?? ''}${part}`;
      });
      next.set(Number(verse), text.join(' '));
    }
    for (const [verse, text] of next) lines[at(verse)] = text;
  }
  return RST_RESLOT.map((r) => r.why);
};

// ---------------------------------------------------------------------------------------------------------
// Ohienko (ukrio): from Ohienko's own numbering onto KJV verses
//
// The module (a SWORD conversion) places each verse by Ohienko's own number into the KJV slot of that number:
// when Ohienko's chapter has fewer verses than the KJV chapter the trailing slots are empty, when it has more
// they are all glued into the chapter's last slot, and chapters the KJV lacks (Joel 4) are glued into the
// book's last slot. In the Old Testament Ohienko numbers like the Hebrew text, with the exceptions below.

/**
 * Hebrew (TAHOT `heb_chapter:heb_verse`) to KJV verse, where they differ; every other Hebrew verse is the KJV
 * verse of the same number. `a-b=c-d` maps verse by verse, `a-b=c` several Hebrew verses into one KJV verse
 * (Psalm titles), `a=c-d` one Hebrew verse over two KJV verses. Derived from the STEPBible word table
 * (`words.heb_chapter/heb_verse` against `chapter/verse`, NRSV verse 0 = KJV verse 1);
 * test/realdb/normalize-theword.test.ts checks it against data/bible.sqlite.
 */
export const HEB_TO_KJV: readonly string[] = `
Gen 32:1=31:55, Gen 32:2-33=32:1-32, Exod 7:26-29=8:1-4, Exod 8:1-28=8:5-32, Exod 21:37=22:1,
Exod 22:1-30=22:2-31, Lev 5:20-26=6:1-7, Lev 6:1-23=6:8-30, Num 17:1-15=16:36-50, Num 17:16-28=17:1-13,
Num 25:19=26:1, Num 30:1=29:40, Num 30:2-17=30:1-16, Deut 13:1=12:32, Deut 13:2-19=13:1-18,
Deut 23:1=22:30, Deut 23:2-26=23:1-25, Deut 28:69=29:1, Deut 29:1-28=29:2-29, 1Sam 21:1=20:42,
1Sam 21:2-16=21:1-15, 1Sam 24:1=23:29, 1Sam 24:2-23=24:1-22, 2Sam 19:1=18:33, 2Sam 19:2-44=19:1-43,
1Kgs 5:1-14=4:21-34, 1Kgs 5:15-32=5:1-18, 1Kgs 18:34=18:33-34, 1Kgs 20:3=20:2-3, 1Kgs 22:21=22:21-22,
1Kgs 22:44-54=22:43-53, 2Kgs 12:1=11:21, 2Kgs 12:2-22=12:1-21, 1Chr 5:27-41=6:1-15, 1Chr 6:1-66=6:16-81,
1Chr 12:5-41=12:4-40, 2Chr 1:18=2:1, 2Chr 2:1-17=2:2-18, 2Chr 13:23=14:1, 2Chr 14:1-14=14:2-15,
Neh 3:33-38=4:1-6, Neh 4:1-17=4:7-23, Neh 7:67=7:67-68, Neh 7:68-72=7:69-73, Neh 10:1=9:38,
Neh 10:2-40=10:1-39, Job 40:25-32=41:1-8, Job 41:1-26=41:9-34, Ps 3:2-9=3:1-8, Ps 4:2-9=4:1-8,
Ps 5:2-13=5:1-12, Ps 6:2-11=6:1-10, Ps 7:2-18=7:1-17, Ps 8:2-10=8:1-9, Ps 9:2-21=9:1-20,
Ps 12:2-9=12:1-8, Ps 13:2-5=13:1-4, Ps 13:6=13:5-6, Ps 18:2-51=18:1-50, Ps 19:2-15=19:1-14,
Ps 20:2-10=20:1-9, Ps 21:2-14=21:1-13, Ps 22:2-32=22:1-31, Ps 30:2-13=30:1-12, Ps 31:2-25=31:1-24,
Ps 34:2-23=34:1-22, Ps 36:2-13=36:1-12, Ps 38:2-23=38:1-22, Ps 39:2-14=39:1-13, Ps 40:2-18=40:1-17,
Ps 41:2-14=41:1-13, Ps 42:2-12=42:1-11, Ps 44:2-27=44:1-26, Ps 45:2-18=45:1-17, Ps 46:2-12=46:1-11,
Ps 47:2-10=47:1-9, Ps 48:2-15=48:1-14, Ps 49:2-21=49:1-20, Ps 51:2-3=51:1, Ps 51:4-21=51:2-19,
Ps 52:2-3=52:1, Ps 52:4-11=52:2-9, Ps 53:2-7=53:1-6, Ps 54:2-3=54:1, Ps 54:4-9=54:2-7,
Ps 55:2-24=55:1-23, Ps 56:2-14=56:1-13, Ps 57:2-12=57:1-11, Ps 58:2-12=58:1-11, Ps 59:2-18=59:1-17,
Ps 60:2-3=60:1, Ps 60:4-14=60:2-12, Ps 61:2-9=61:1-8, Ps 62:2-13=62:1-12, Ps 63:2-12=63:1-11,
Ps 64:2-11=64:1-10, Ps 65:2-14=65:1-13, Ps 67:2-8=67:1-7, Ps 68:2-36=68:1-35, Ps 69:2-37=69:1-36,
Ps 70:2-6=70:1-5, Ps 75:2-11=75:1-10, Ps 76:2-13=76:1-12, Ps 77:2-21=77:1-20, Ps 80:2-20=80:1-19,
Ps 81:2-17=81:1-16, Ps 83:2-19=83:1-18, Ps 84:2-13=84:1-12, Ps 85:2-14=85:1-13, Ps 88:2-19=88:1-18,
Ps 89:2-53=89:1-52, Ps 92:2-16=92:1-15, Ps 102:2-29=102:1-28, Ps 108:2-14=108:1-13, Ps 140:2-14=140:1-13,
Ps 142:2-8=142:1-7, Eccl 4:17=5:1, Eccl 5:1-19=5:2-20, Song 7:1=6:13, Song 7:2-14=7:1-13, Isa 8:23=9:1,
Isa 9:1-20=9:2-21, Isa 63:19=63:19-64:1, Isa 64:1-11=64:2-12, Jer 8:23=9:1, Jer 9:1-25=9:2-26,
Ezek 21:1-5=20:45-49, Ezek 21:6-37=21:1-32, Dan 3:31-33=4:1-3, Dan 4:1-34=4:4-37, Dan 6:1=5:31,
Dan 6:2-29=6:1-28, Hos 2:1-2=1:10-11, Hos 2:3-25=2:1-23, Hos 12:1=11:12, Hos 12:2-15=12:1-14,
Hos 14:1=13:16, Hos 14:2-10=14:1-9, Joel 3:1-5=2:28-32, Joel 4:1-21=3:1-21, Jonah 2:1=1:17,
Jonah 2:2-11=2:1-10, Mic 4:14=5:1, Mic 5:1-14=5:2-15, Nah 2:1=1:15, Nah 2:2-14=2:1-13,
Zech 2:1-4=1:18-21, Zech 2:5-17=2:1-13, Mal 3:19-24=4:1-6
`
  .trim()
  .split(/,\s*/);

/** Hebrew chapter verse counts where they differ from the KJV (`Mal 4:0`: no such chapter), same source. */
export const HEB_CHAPTER_VERSES: readonly string[] = `
Gen 31:54, Gen 32:33, Exod 7:29, Exod 8:28, Exod 21:37, Exod 22:30, Lev 5:26, Lev 6:23, Num 16:35,
Num 17:28, Num 25:19, Num 29:39, Num 30:17, Deut 12:31, Deut 13:19, Deut 22:29, Deut 23:26, Deut 28:69,
Deut 29:28, 1Sam 21:16, 1Sam 23:28, 1Sam 24:23, 2Sam 18:32, 2Sam 19:44, 1Kgs 4:20, 1Kgs 5:32, 1Kgs 22:54,
2Kgs 11:20, 2Kgs 12:22, 1Chr 5:41, 1Chr 6:66, 1Chr 12:41, 2Chr 1:18, 2Chr 2:17, 2Chr 13:23, 2Chr 14:14,
Neh 3:38, Neh 4:17, Neh 7:72, Neh 9:37, Neh 10:40, Job 40:32, Job 41:26, Ps 3:9, Ps 4:9, Ps 5:13,
Ps 6:11, Ps 7:18, Ps 8:10, Ps 9:21, Ps 12:9, Ps 18:51, Ps 19:15, Ps 20:10, Ps 21:14, Ps 22:32, Ps 30:13,
Ps 31:25, Ps 34:23, Ps 36:13, Ps 38:23, Ps 39:14, Ps 40:18, Ps 41:14, Ps 42:12, Ps 44:27, Ps 45:18,
Ps 46:12, Ps 47:10, Ps 48:15, Ps 49:21, Ps 51:21, Ps 52:11, Ps 53:7, Ps 54:9, Ps 55:24, Ps 56:14,
Ps 57:12, Ps 58:12, Ps 59:18, Ps 60:14, Ps 61:9, Ps 62:13, Ps 63:12, Ps 64:11, Ps 65:14, Ps 67:8,
Ps 68:36, Ps 69:37, Ps 70:6, Ps 75:11, Ps 76:13, Ps 77:21, Ps 80:20, Ps 81:17, Ps 83:19, Ps 84:13,
Ps 85:14, Ps 88:19, Ps 89:53, Ps 92:16, Ps 102:29, Ps 108:14, Ps 140:14, Ps 142:8, Eccl 4:17, Eccl 5:19,
Song 6:12, Song 7:14, Isa 8:23, Isa 9:20, Isa 64:11, Jer 8:23, Jer 9:25, Ezek 20:44, Ezek 21:37,
Dan 3:33, Dan 4:34, Dan 5:30, Dan 6:29, Hos 1:9, Hos 2:25, Hos 11:11, Hos 12:15, Hos 13:15, Hos 14:10,
Joel 2:27, Joel 3:5, Joel 4:21, Jonah 1:16, Jonah 2:11, Mic 4:14, Mic 5:14, Nah 1:14, Nah 2:14,
Zech 1:17, Zech 2:17, Mal 3:24, Mal 4:0
`
  .trim()
  .split(/,\s*/);

// Hand-maintained decisions, each checked against the module text and the KJV/Darby/RST verses.

/** Old Testament passages Ohienko numbers like the KJV, not like the Hebrew text. */
const OHIENKO_KJV_NUMBERED: readonly string[] = [
  // Num 26:1 holds the whole KJV 26:1 ("after the plague"), Hebrew 25:19; Num 25 has 18 verses.
  'Num 25:1-18',
  'Num 26:1-65',
  // 22:43 holds Hebrew 22:43-44 ("the high places were not taken away"), as KJV 22:43; to the end as KJV.
  '1Kgs 22:43-53',
  // 12:4 holds Hebrew 12:4-5 (Ishmaiah ... Josabad), as KJV 12:4; 40 verses.
  '1Chr 12:1-40',
  // Neh 7:68 ("their horses ... their mules") is in Ohienko, absent from the Hebrew; 73 verses.
  'Neh 7:1-73',
  // Isa 64:1 ("Oh that thou wouldest rend the heavens") is its own verse, Hebrew 63:19b.
  'Isa 63:1-19',
  'Isa 64:1-12',
  // Malachi has four chapters (Hebrew 3:19-24 = 4:1-6).
  'Mal 3:1-18',
  'Mal 4:1-6',
];

/** Verse counts of Ohienko chapters that follow neither the Hebrew text nor the KJV. */
const OHIENKO_CHAPTER_VERSES: Readonly<Record<string, number>> = {
  '1Kgs 22': 53,
  // Ps 114-116 divided as in the Septuagint: 114 = Hebrew 114 + 115, 115 = Hebrew 116:1-9, 116 = 116:10-19.
  'Ps 114': 26,
  'Ps 115': 9,
  'Ps 116': 10,
  // New Testament chapters numbered unlike the KJV.
  'Acts 19': 40,
  '2Cor 13': 13,
  '3John 1': 15,
  'Rev 12': 18,
};

/** Ohienko verses whose KJV verses the Hebrew map (or identity) does not give: own range = KJV range. */
const OHIENKO_TO_KJV: readonly (readonly [own: string, kjv: string])[] = [
  ['Ps 114:9-26', 'Ps 115:1-18'],
  ['Ps 115:1-9', 'Ps 116:1-9'],
  ['Ps 116:1-10', 'Ps 116:10-19'],
  // 19:40 ends with "And when he had thus spoken, he dismissed the assembly" (KJV 19:41).
  ['Acts 19:40', 'Acts 19:40-41'],
  // 13:12 holds "Greet one another" and "All the saints salute you" (KJV 13:12, 13:13).
  ['2Cor 13:12', '2Cor 13:12-13'],
  ['2Cor 13:13', '2Cor 13:14'],
  // Verse order of the critical text: Ohienko 1:16 is "the other of love" (KJV 1:17), 1:17 is KJV 1:16.
  ['Phil 1:16', 'Phil 1:17'],
  ['Phil 1:17', 'Phil 1:16'],
  ['3John 1:15', '3John 1:14'],
  ['Rev 12:18', 'Rev 13:1'],
];

/** Ohienko verses the module lacks: its slot is empty although the chapter has the verse. */
const OHIENKO_MISSING: readonly string[] = [
  // Hebrew 7:2 = second half of KJV 7:1 ("O LORD my God, in thee do I put my trust").
  'Ps 7:2',
  // Hebrew 51:2 / 52:2 = second half of the KJV 51:1 / 52:1 title ("when Nathan the prophet came", "when Doeg").
  'Ps 51:2',
  'Ps 52:2',
];

/** Slots that start with a duplicate of another slot's verse (a conversion defect): removed. */
const OHIENKO_STRAY_PREFIX: readonly (readonly [slot: string, copyOf: string])[] = [
  ['Ps 41:13', 'Job 41:26'],
  ['Joel 3:21', 'Hos 14:1'],
  ['Amos 3:5', 'Joel 3:5'],
];

/**
 * Where a slot holds more than one KJV verse part, the text that starts each part after the first. Required
 * where one Ohienko verse spans two KJV verses or two Ohienko verses share one KJV verse; elsewhere the split
 * is found by `splitByLength` and an entry here only corrects it.
 */
const OHIENKO_SPLITS: Readonly<Record<string, readonly string[]>> = {
  // Hebrew 18:34 starts in KJV 18:33 ("and said, Fill four barrels with water").
  '1Kgs 18:34': ['І сказав: Повторіть!'],
  // Hebrew 20:3 starts in KJV 20:2 ("and said unto him, Thus saith Benhadad").
  '1Kgs 20:3': ['Срібло твоє'],
  // Hebrew 22:21 ends in KJV 22:22 ("And the LORD said unto him, Wherewith?").
  '1Kgs 22:21': ['І сказав йому Господь: Чим?'],
  // Hebrew 13:6 = KJV 13:5-6.
  'Ps 13:6': ['Я буду співати'],
  // Length alone splits before "що добре воно" ("for it is good"), which ends KJV 54:6.
  'Ps 54:7': ['В добровільному дарі', 'бо мене воно'],
  'Acts 19:40': ['І, промовивши це,'],
  '2Cor 13:12': ['Усі святі вас вітають!'],
  '3John 1:14': ['Мир тобі!'],
  'Rev 12:17': ['І я став на морському піску.'],
};

type Own = { readonly chapter: number; readonly verse: number };
type Target = { readonly chapter: number; readonly verse: number };

const key = (book: Book, chapter: number, verse: number): string => `${book.id} ${chapter}:${verse}`;

const expandMap = (entries: readonly (readonly [string, string])[]): Map<string, Target[]> => {
  const map = new Map<string, Target[]>();
  for (const [left, right] of entries) {
    const from = parseRange(left);
    const to = parseRange(right);
    if (from.length === to.length) {
      from.forEach((f, i) => {
        const t = to[i];
        if (t !== undefined) map.set(key(f.book, f.chapter, f.verse), [t]);
      });
    } else if (to.length === 1 || from.length === 1) {
      for (const f of from) map.set(key(f.book, f.chapter, f.verse), to);
    } else {
      throw new Error(`${left}=${right}: ranges of different lengths`);
    }
  }
  return map;
};

const HEB_MAP = expandMap(
  HEB_TO_KJV.map((e): [string, string] => {
    const [left = '', right = ''] = e.split('=');
    return [left, `${left.split(' ')[0] ?? ''} ${right}`];
  }),
);
const OWN_MAP = expandMap(OHIENKO_TO_KJV);

/** `HEB_TO_KJV` expanded: `Book c:v` (Hebrew) → its KJV verses as `c:v`, for the verses the table lists. */
export const hebrewToKjv = (): Map<string, string[]> =>
  new Map(
    [...HEB_MAP].map(([heb, targets]): [string, string[]] => [
      heb,
      targets.map((t) => `${t.chapter}:${t.verse}`),
    ]),
  );
const HEB_COUNTS = new Map(
  HEB_CHAPTER_VERSES.map((e): [string, number] => {
    const [chapter = '', count = ''] = e.split(':');
    return [chapter, Number(count)];
  }),
);
const KJV_NUMBERED = new Set(
  OHIENKO_KJV_NUMBERED.flatMap((r) => parseRange(r).map((x) => key(x.book, x.chapter, x.verse))),
);
const MISSING = new Set(OHIENKO_MISSING);

const KJV_TO_HEB = new Map<string, string[]>();
for (const [heb, targets] of HEB_MAP) {
  for (const t of targets) {
    const k = key(bookById(heb.split(' ')[0] ?? ''), t.chapter, t.verse);
    KJV_TO_HEB.set(k, [...(KJV_TO_HEB.get(k) ?? []), heb.split(' ')[1] ?? '']);
  }
}

const verseOrder = (cv: string): number => {
  const [c = 0, v = 0] = cv.split(':').map(Number);
  return c * 1000 + v;
};

/** The Hebrew verses (`c:v`, in order) a KJV Old Testament verse holds. */
const hebrewOf = (book: Book, chapter: number, verse: number): string[] => {
  const mapped = KJV_TO_HEB.get(key(book, chapter, verse)) ?? [];
  const hebCount = HEB_COUNTS.get(`${book.id} ${chapter}`) ?? versesOf(book)[chapter - 1] ?? 0;
  const same = verse <= hebCount && !HEB_MAP.has(key(book, chapter, verse)) ? [`${chapter}:${verse}`] : [];
  return [...same, ...mapped].toSorted((a, b) => verseOrder(a) - verseOrder(b));
};

const ownCount = (book: Book, chapter: number): number => {
  const name = `${book.id} ${chapter}`;
  const fixed = OHIENKO_CHAPTER_VERSES[name];
  if (fixed !== undefined) return fixed;
  const kjv = versesOf(book)[chapter - 1] ?? 0;
  if (book.testament === 'NT' || KJV_NUMBERED.has(key(book, chapter, 1))) return kjv;
  return HEB_COUNTS.get(name) ?? kjv;
};

const ownChapters = (book: Book): number[] => {
  const chapters = versesOf(book).map((_, i) => i + 1);
  if (book.testament === 'OT') {
    for (let c = chapters.length + 1; HEB_COUNTS.has(`${book.id} ${c}`); c++) chapters.push(c);
  }
  return chapters.filter((c) => ownCount(book, c) > 0);
};

const targetsOf = (book: Book, own: Own): readonly Target[] => {
  const k = key(book, own.chapter, own.verse);
  const fixed = OWN_MAP.get(k);
  if (fixed !== undefined) return fixed;
  if (book.testament === 'OT' && !KJV_NUMBERED.has(k)) return HEB_MAP.get(k) ?? [own];
  return [own];
};

// Cognate trigram similarity between Ukrainian and Russian text (the RST line of the same KJV verse).
const COGNATE: Readonly<Record<string, string>> = {
  и: 'ы',
  і: 'и',
  ї: 'и',
  є: 'е',
  ґ: 'г',
  ё: 'е',
  э: 'е',
  й: 'и',
  ь: '',
  ъ: '',
  "'": '',
  '’': '',
};
/** Lower-cased Cyrillic/Latin letters with Ukrainian folded onto Russian spelling, words joined by one space. */
const plainOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[иіїєґёэйьъ'’]/g, (c) => COGNATE[c] ?? c)
    .replace(/\(\d+:\d+\)|\^\^|[[\]]/g, '')
    .replace(/[^а-яa-z ]/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
const trigrams = (plain: string): Set<string> => {
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= plain.length; i++) grams.add(plain.slice(i, i + 3));
  return grams;
};
const similarity = (x: ReadonlySet<string>, y: ReadonlySet<string>): number => {
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return both / (x.size + y.size - both);
};

// Cost of ending a part with this character: sentence end < clause end < comma; anything else is a last resort.
const END_COST: Readonly<Record<string, number>> = {
  '.': 0,
  '!': 0,
  '?': 0,
  ';': 0.4,
  ':': 0.4,
  ',': 0.9,
  '-': 0.9,
  '—': 0.9,
};

/**
 * Splits `text` into `expected.length` parts at word boundaries (preferring punctuation), so that the part
 * lengths follow the expected lengths and each part resembles its reference text (dynamic programming).
 */
const splitByLength = (
  text: string,
  expected: readonly number[],
  references: readonly string[],
): string[] => {
  const words = text.split(' ');
  const pos = [0];
  for (const w of words) pos.push((pos.at(-1) ?? 0) + w.length + 1);
  const n = words.length;
  const m = expected.length;
  const total = expected.reduce((a, b) => a + b, 0);
  const scaled = expected.map((e) => (e * text.length) / total);
  let cuts = Array.from({ length: n - 1 }, (_, i) => i + 1).filter(
    (j) => (words[j - 1] ?? '').slice(-1) in END_COST,
  );
  if (cuts.length < m - 1) cuts = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const ends = [...cuts, n];
  const plainWords = words.map(plainOf);
  const referenceGrams = references.map((r) => trigrams(plainOf(r)));
  const starts = [0, ...cuts];
  const best = Array.from({ length: m + 1 }, () => new Map<number, number>());
  const back = Array.from({ length: m + 1 }, () => new Map<number, number>());
  best[0]?.set(0, 0);
  const cost = (i: number, j: number, part: number): number => {
    const length = (pos[j] ?? 0) - (pos[i] ?? 0);
    let c = 2 * Math.log(length / (scaled[part] ?? 1)) ** 2;
    if (j < n) {
      const last = (words[j - 1] ?? '').slice(-1);
      c += END_COST[last] ?? 3;
      const next = (words[j] ?? '').charAt(0);
      if ('.!?'.includes(last) && next === next.toLowerCase()) c += 0.5;
    }
    const piece = trigrams(
      plainWords
        .slice(i, j)
        .filter((w) => w !== '')
        .join(' '),
    );
    return c - 3 * similarity(piece, referenceGrams[part] ?? new Set());
  };
  for (let part = 0; part < m; part++) {
    for (const i of starts) {
      const from = best[part]?.get(i);
      if (i >= n || from === undefined) continue;
      for (const j of ends) {
        if (j <= i) continue;
        if (part < m - 1 === (j === n)) continue;
        if ((pos[j] ?? 0) - (pos[i] ?? 0) > 4 * (scaled[part] ?? 0) + 40 && j !== n) break;
        const c = from + cost(i, j, part);
        if (c < (best[part + 1]?.get(j) ?? Infinity)) {
          best[part + 1]?.set(j, c);
          back[part + 1]?.set(j, i);
        }
      }
    }
  }
  const bounds = [n];
  for (let part = m; part > 0; part--) bounds.unshift(back[part]?.get(bounds[0] ?? 0) ?? 0);
  return Array.from({ length: m }, (_, part) => words.slice(bounds[part], bounds[part + 1]).join(' '));
};

const lineOf = (name: string): number => {
  const [r] = parseRange(name);
  if (r === undefined) throw new Error(name);
  return indexOf(r.book, r.chapter, r.verse);
};

/** A part of an Ohienko verse that lies in one KJV verse. */
type Atom = { readonly own: Own; readonly target: Target; readonly startsOwn: boolean; text: string };

type OhienkoContext = {
  /** RST text of each KJV line (normalized), the reference for `similarity`. */
  readonly russian: readonly string[];
  /** Expected relative length of each KJV verse (mean of the KJV and Darby text lengths). */
  readonly weight: readonly number[];
};

const normalizeOhienko = (lines: string[], context: OhienkoContext): string[] => {
  const original = [...lines];
  const atomsByLine = new Map<number, Atom[]>();
  const stray = new Map(OHIENKO_STRAY_PREFIX.map(([slot, copy]): [string, string] => [slot, copy]));
  let splitSlots = 0;
  for (const book of BOOKS) {
    const counts = versesOf(book);
    const chapters = ownChapters(book);
    counts.forEach((slots, c0) => {
      const chapter = c0 + 1;
      const n = ownCount(book, chapter);
      for (let verse = 1; verse <= slots; verse++) {
        const owns: Own[] = [];
        const last = verse === slots ? n : Math.min(verse, n);
        for (let v = verse; v <= last; v++) owns.push({ chapter, verse: v });
        if (chapter === counts.length && verse === slots) {
          for (const extra of chapters.filter((x) => x > counts.length)) {
            for (let v = 1; v <= ownCount(book, extra); v++) owns.push({ chapter: extra, verse: v });
          }
        }
        const present = owns.filter((o) => !MISSING.has(key(book, o.chapter, o.verse)));
        const slot = refName(book, chapter, verse);
        const index = indexOf(book, chapter, verse);
        let text = (original[index] ?? '').trim();
        const copyOf = stray.get(slot);
        if (copyOf !== undefined) {
          const copy = (original[lineOf(copyOf)] ?? '').trim();
          if (!text.startsWith(`${copy} `)) throw new Error(`ukrio ${slot} does not start with ${copyOf}`);
          text = text.slice(copy.length + 1);
        }
        if (present.length === 0) {
          if (text !== '') throw new Error(`ukrio ${slot}: text in a slot Ohienko has no verse for`);
          continue;
        }
        if (text === '')
          throw new Error(
            `ukrio ${slot}: empty slot for Ohienko ${owns.map((o) => `${o.chapter}:${o.verse}`).join(', ')}`,
          );
        const atoms: Atom[] = present.flatMap((own) =>
          targetsOf(book, own).map((target, i) => ({ own, target, startsOwn: i === 0, text: '' })),
        );
        const anchors = OHIENKO_SPLITS[slot];
        let parts: string[];
        if (anchors !== undefined) {
          if (anchors.length !== atoms.length - 1)
            throw new Error(`ukrio ${slot}: ${atoms.length} parts, ${anchors.length} anchors`);
          parts = [];
          let rest = text;
          for (const anchor of anchors) {
            parts.push(cut(rest, anchor, 'before', `ukrio ${slot}`));
            rest = cut(rest, anchor, 'after', `ukrio ${slot}`);
          }
          parts.push(rest);
        } else if (atoms.length === 1) {
          parts = [text];
        } else {
          const targets = atoms.map((a) => indexOf(book, a.target.chapter, a.target.verse));
          if (new Set(targets).size !== targets.length || atoms.some((a) => !a.startsOwn)) {
            throw new Error(`ukrio ${slot}: parts share a KJV verse; list the split in OHIENKO_SPLITS`);
          }
          parts = splitByLength(
            text,
            targets.map((t) => context.weight[t] ?? 1),
            targets.map((t) => context.russian[t] ?? ''),
          );
        }
        if (atoms.length > 1) splitSlots++;
        atoms.forEach((atom, i) => {
          atom.text = parts[i] ?? '';
          const t = indexOf(book, atom.target.chapter, atom.target.verse);
          atomsByLine.set(t, [...(atomsByLine.get(t) ?? []), atom]);
        });
      }
    });
  }
  const moved: number[] = [];
  for (let index = 0; index < KJV_LINES; index++) {
    const atoms = atomsByLine.get(index) ?? [];
    const ref = refAt(index);
    const text = atoms
      .map((atom, i) => {
        const same = ref !== null && atom.own.chapter === ref.chapter && atom.own.verse === ref.verse;
        const marker = `(${atom.own.chapter}:${atom.own.verse}) `;
        if (i === 0) return same ? atom.text : `${marker}${atom.text}`;
        return atom.startsOwn ? `${marker}${atom.text}` : atom.text;
      })
      .join(' ');
    if (text !== original[index]) moved.push(index);
    lines[index] = text;
  }
  const empty = lines.flatMap((l, i) => (l === '' ? [i] : []));
  return [
    `verses re-slotted from Ohienko's own numbering (Hebrew-style in the Old Testament) onto the KJV verses; (c:v) gives Ohienko's number where it differs, at the line start or mid-line where a KJV verse holds two Ohienko verses (${moved.length} lines changed)`,
    `slots holding several verses split at verse boundaries: ${splitSlots}`,
    `duplicated verse removed from the start of ${OHIENKO_STRAY_PREFIX.map(([s, c]) => `${s} (copy of ${c})`).join(', ')}`,
    `verses absent from the module: Ohienko ${OHIENKO_MISSING.join(', ')}`,
    'Phil 1:16-17: Ohienko verse order swapped to the KJV order',
    `empty lines: ${empty.length === 0 ? 'none' : describeLines(empty)}`,
  ];
};

// ---------------------------------------------------------------------------------------------------------
// Modules and the manifest

type Spec = {
  readonly version: VersionId;
  readonly file: string;
  readonly encoding: ModuleEncoding;
  /** What `<FI>…<Fi>` (or the module's own `[…]`) marks, null if nothing. */
  readonly brackets: string | null;
};

const SPECS: readonly Spec[] = [
  {
    version: 'kjv',
    file: 'kjv.ont',
    encoding: 'windows-1252',
    brackets: 'words added by the translators (<FI>…<Fi>)',
  },
  {
    version: 'darby',
    file: 'darby.ont',
    encoding: 'utf-8',
    brackets: 'words added by the translator (<FI>…<Fi>)',
  },
  {
    version: 'elb1905',
    file: 'gerelb.ont',
    encoding: 'windows-1252',
    brackets: 'readings of the traditional text that the critical text omits (<FI>…<Fi>)',
  },
  { version: 'ohienko', file: 'ukrio.ont', encoding: 'windows-1251', brackets: null },
  {
    version: 'rst',
    file: 'rst.ont',
    encoding: 'windows-1251',
    brackets: 'words added by the translators ([…] in the text)',
  },
];

const metaValue = (meta: readonly string[], name: string): string | null => {
  const start = meta.findIndex((l) => l.startsWith(`${name}=`));
  if (start < 0) return null;
  let value = (meta[start] ?? '').slice(name.length + 1).trim();
  for (let i = start + 1; value.endsWith('\\'); i++)
    value = `${value.slice(0, -1).trim()} ${(meta[i] ?? '').trim()}`;
  return value;
};

const cleanLength = (line: string): number =>
  line
    .replace(/<RF>[\s\S]*?<Rf>/g, '')
    .replace(/<[^<>]*>/g, '')
    .trim().length;

const MARKER_RE: Readonly<Record<'paren' | 'wt-tag', RegExp>> = {
  paren: /\(\d+:\d+\)/,
  'wt-tag': /<WT[HG]\d+:\d+>/,
};

/**
 * Gives every line whose first own-number marker follows text a leading marker with its KJV number, so a
 * reader never has to infer the number of the part before the first marker. After the edits above that part
 * is always in the verse of the KJV number (Ohienko lines get a leading marker whenever it differs, the
 * Elberfelder tags follow the Hebrew map, and the RST lines concerned are psalm titles, 1Sam 20:42, 3John 1:14).
 */
const addLeadingMarkers = (lines: string[], style: 'paren' | 'wt-tag'): number[] => {
  const changed: number[] = [];
  lines.forEach((line, i) => {
    const m = MARKER_RE[style].exec(line);
    if (
      m === null ||
      line
        .slice(0, m.index)
        .replace(/<[^<>]*>/g, '')
        .trim() === ''
    )
      return;
    const ref = refAt(i);
    if (ref === null) return;
    const number = `${ref.chapter}:${ref.verse}`;
    const tag = ref.book.testament === 'OT' ? 'WTH' : 'WTG';
    lines[i] = style === 'paren' ? `(${number}) ${line}` : `<${tag}${number}> ${line}`;
    changed.push(i);
  });
  return changed;
};

type ManifestEntry = {
  readonly version: VersionId;
  readonly file: string;
  readonly sha256: string;
  readonly original: { readonly file: string; readonly sha256: string; readonly encoding: ModuleEncoding };
  readonly theWordId: string | null;
  readonly versionDate: string | null;
  /** The module's `about` text, which carries its licence statement. */
  readonly licence: string | null;
  readonly brackets: string | null;
  readonly edits: readonly string[];
};

type Output = { readonly spec: Spec; readonly bytes: Uint8Array; readonly entry: ManifestEntry };

export const normalizeAll = (): Output[] => {
  const files = new Map(
    SPECS.map((spec): [string, { bytes: Uint8Array; module: ModuleFile }] => {
      const bytes = readFileSync(`${DIR}original/${spec.file}`);
      return [spec.file, { bytes, module: readModule(bytes, spec.encoding, spec.file) }];
    }),
  );
  const get = (file: string): { bytes: Uint8Array; module: ModuleFile } => {
    const found = files.get(file);
    if (found === undefined) throw new Error(file);
    return found;
  };
  const results = new Map<string, { lines: string[]; edits: string[] }>();
  const edit = (file: string, run: (lines: string[]) => string[]): void => {
    const lines = [...get(file).module.lines];
    results.set(file, { lines, edits: run(lines) });
  };
  edit('kjv.ont', () => []);
  edit('darby.ont', normalizeDarby);
  edit('gerelb.ont', normalizeGerelb);
  edit('rst.ont', normalizeRst);
  const rst = results.get('rst.ont')?.lines ?? [];
  const kjv = get('kjv.ont').module.lines;
  const darby = get('darby.ont').module.lines;
  const context: OhienkoContext = {
    russian: rst,
    weight: kjv.map((l, i) => Math.max((cleanLength(l) + cleanLength(darby[i] ?? '')) / 2, 10)),
  };
  edit('ukrio.ont', (lines) => normalizeOhienko(lines, context));
  for (const [file, style] of [
    ['gerelb.ont', 'wt-tag'],
    ['rst.ont', 'paren'],
    ['ukrio.ont', 'paren'],
  ] as const) {
    const result = results.get(file);
    if (result === undefined) continue;
    const led = addLeadingMarkers(result.lines, style);
    if (led.length > 0) {
      result.edits.push(
        `leading own number added where a line had only mid-line markers: ${describeLines(led)}`,
      );
    }
  }

  return SPECS.map((spec) => {
    const { bytes: originalBytes, module } = get(spec.file);
    const { lines, edits } = results.get(spec.file) ?? { lines: [], edits: [] };
    const meta = [
      ...module.meta,
      'normalized.by=scripts/normalize-theword.ts (stepbible-mcp): one line per KJV verse, see MANIFEST.json',
      `normalized.from.sha256=${sha256(originalBytes)}`,
      `normalized.edits=${edits.length === 0 ? 'none' : edits.join('; ')}`,
    ];
    const bytes = encode(`${[...lines, '', ...meta].join('\r\n')}\r\n`);
    const entry: ManifestEntry = {
      version: spec.version,
      file: spec.file,
      sha256: sha256(bytes),
      original: { file: `original/${spec.file}`, sha256: sha256(originalBytes), encoding: spec.encoding },
      theWordId: metaValue(module.meta, 'id'),
      versionDate: metaValue(module.meta, 'version.date'),
      licence: metaValue(module.meta, 'about'),
      brackets: spec.brackets,
      edits,
    };
    return { spec, bytes, entry };
  });
};

const manifestText = (outputs: readonly Output[]): string =>
  `${JSON.stringify({ modules: outputs.map((o) => o.entry) }, null, 2)}\n`;

const main = (): void => {
  const outputs = normalizeAll();
  const manifest = manifestText(outputs);
  if (process.argv.includes('--check')) {
    const stale = [
      ...outputs
        .filter((o) => sha256(readFileSync(`${DIR}${o.spec.file}`)) !== o.entry.sha256)
        .map((o) => o.spec.file),
      ...(readFileSync(`${DIR}MANIFEST.json`, 'utf8') === manifest ? [] : ['MANIFEST.json']),
    ];
    if (stale.length > 0) {
      console.error(`stale: ${stale.join(', ')}; run node scripts/normalize-theword.ts`);
      process.exit(1);
    }
    console.log('normalized modules are up to date');
  } else {
    for (const o of outputs) {
      writeFileSync(`${DIR}${o.spec.file}`, o.bytes);
      console.log(`${o.spec.file}  ${o.entry.sha256}`);
    }
    writeFileSync(`${DIR}MANIFEST.json`, manifest);
  }
};

if (import.meta.main) main();
