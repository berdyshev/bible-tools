import { z } from 'zod/v4';
import type { Occurrence } from '../data/repo.ts';
import { formatRef, parseScope } from '../domain/ref.ts';
import type { Scope, VerseRef, Versification } from '../domain/ref.ts';
import { err, ok } from '../domain/result.ts';
import { parseStrong } from '../domain/strong.ts';
import { defineTool, describeTool, versificationSchema } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

export const DEFAULT_LIMIT = 50;
/** Upper bound on the characters of the text output, so one call never floods the model's context. */
export const MAX_CHARS = 2000;

export const inputSchema = z.object({
  strong: z
    .string()
    .min(1)
    .describe(
      "Hebrew Strong's number as shown by get_verse, e.g. `H7704G` (one sense) or `H7704` (all senses, grouped by sense). Zero-padding is optional.",
    ),
  scope: z
    .string()
    .optional()
    .describe(
      'Where to look: a book (`Ruth`), a chapter (`Ruth 2`) or `OT` for the whole Old Testament. Default `OT`.',
    ),
  versification: versificationSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      `Maximum number of verses to list (default ${DEFAULT_LIMIT}); the text is also capped at about ${MAX_CHARS} characters.`,
    ),
});

const formSchema = z.object({ transliteration: z.string(), hebrew: z.string() });

export const outputSchema = z.object({
  strong: z.string(),
  scope: z.string(),
  versification: z.enum(['eng', 'heb']),
  total: z.number(),
  verses: z.number(),
  senses: z.array(z.object({ strong: z.string(), gloss: z.string(), count: z.number() })),
  truncated: z.boolean(),
  occurrences: z.array(
    z.object({ ref: z.string(), strong: z.string(), count: z.number(), forms: z.array(formSchema) }),
  ),
});

export const descriptionParts: DescriptionParts = {
  what: "Lists every occurrence of one Hebrew Strong's number (STEPBible TAHOT) in a book, a chapter or the whole Old Testament: a count, then the verses with the word form at each, grouped by book.",
  when: "Use it to check how consistently a term is rendered across a passage: take the Strong's number from get_verse, list its occurrences, and compare the contexts. A bare number such as `H7704` includes all senses and groups them by sense; `H7704G` selects one.",
  output:
    'Output: a count header (`H7704G in Ruth: 16 occurrences in 13 verses`), then one line per book: `Ruth 1:1 transliteration, 1:2 …` with `×2` for a verse where the word repeats and the Hebrew forms at the end. A long list is cut with a hint on how to narrow the scope or continue.',
  not: "It matches the Strong's number only, not English text or related words; use search_lexicon to find a number by meaning and lookup_strong for its definition. It gives no verse text: use get_verse for that.",
};

export const description = describeTool(descriptionParts);

export type Form = z.infer<typeof formSchema>;

/** The words of one sense in one verse. */
export type VerseHit = {
  readonly ref: VerseRef;
  readonly strong: string;
  readonly count: number;
  readonly forms: readonly Form[];
};

const verseKey = (r: VerseRef): string => `${r.book.id} ${r.chapter}:${r.verse}`;

/** Folds the words of a verse into one hit per sense; the input is in text order. */
export const groupByVerse = (occurrences: readonly Occurrence[]): VerseHit[] => {
  const hits = new Map<string, { ref: VerseRef; strong: string; count: number; forms: Form[] }>();
  for (const o of occurrences) {
    const key = `${o.strong} ${verseKey(o.ref)}`;
    const hit = hits.get(key) ?? { ref: o.ref, strong: o.strong, count: 0, forms: [] };
    hit.count += 1;
    if (!hit.forms.some((f) => f.hebrew === o.hebrew)) {
      hit.forms.push({ transliteration: o.transliteration, hebrew: o.hebrew });
    }
    hits.set(key, hit);
  }
  return [...hits.values()];
};

export type SenseGroup = {
  readonly strong: string;
  readonly gloss: string;
  readonly hits: readonly VerseHit[];
  readonly count: number;
};

const verseText = (h: VerseHit, withBook: boolean): string => {
  const place = `${withBook ? `${h.ref.book.name} ` : ''}${h.ref.chapter}:${h.ref.verse}`;
  const forms = h.forms.map((f) => f.transliteration).join(' + ');
  return `${place} ${forms}${h.count > 1 ? ` ×${h.count}` : ''}`;
};

const bookRuns = (hits: readonly VerseHit[]): VerseHit[][] => {
  const runs: VerseHit[][] = [];
  for (const h of hits) {
    const last = runs.at(-1);
    if (last?.[0]?.ref.book.id === h.ref.book.id) last.push(h);
    else runs.push([h]);
  }
  return runs;
};

// Latin text first and the Hebrew forms last on the line, so bidi-aware renderers keep it left-to-right.
const bookLines = (hits: readonly VerseHit[]): string[] =>
  bookRuns(hits).map((run) => {
    const hebrew = [...new Set(run.flatMap((h) => h.forms.map((f) => f.hebrew)))];
    return `${run.map((h, i) => verseText(h, i === 0)).join(', ')} — ${hebrew.join(' ')}`;
  });

export type OccurrenceView = {
  readonly strong: string;
  readonly scopeLabel: string;
  readonly versification: Versification;
  readonly total: number;
  readonly verses: number;
  /** True when the requested number has no sense letter, so the result is grouped by sense. */
  readonly bySense: boolean;
  /** Only the groups with something to show, hits already cut to the displayed set. */
  readonly groups: readonly SenseGroup[];
  readonly omitted: number;
  /** Scope that starts at the first omitted verse's chapter, for the continuation hint. */
  readonly nextScope: string | null;
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export const formatOccurrences = (v: OccurrenceView): string => {
  const numbering = v.versification === 'heb' ? 'Hebrew numbering' : 'English numbering';
  const head =
    v.total === 0
      ? `${v.strong} in ${v.scopeLabel}: no occurrences (${numbering})`
      : `${v.strong} in ${v.scopeLabel}: ${plural(v.total, 'occurrence')} in ${plural(v.verses, 'verse')} (${numbering})`;
  const body = v.groups.flatMap((g) => [
    ...(v.bySense ? [`${g.strong} «${g.gloss}»: ${plural(g.count, 'occurrence')}`] : []),
    ...bookLines(g.hits),
  ]);
  const tail =
    v.omitted === 0
      ? []
      : [
          `Truncated — ${v.omitted} more ${v.omitted === 1 ? 'verse' : 'verses'}; narrow the scope or raise limit` +
            (v.nextScope === null ? '' : `, or call again with scope "${v.nextScope}"`),
        ];
  return [head, ...body, ...tail].join('\n');
};

const scopeLabel = (s: Scope): string => {
  switch (s.kind) {
    case 'testament':
      return 'the Old Testament';
    case 'book':
      return s.book.name;
    case 'chapter':
      return `${s.book.name} ${s.chapter}`;
    default:
      return s satisfies never;
  }
};

/** The first `shown` verse hits across the groups, in group order. */
const take = (groups: readonly SenseGroup[], shown: number): SenseGroup[] => {
  let left = shown;
  return groups.flatMap((g) => {
    const hits = g.hits.slice(0, left);
    left -= hits.length;
    return hits.length === 0 ? [] : [{ ...g, hits }];
  });
};

export const findOccurrences = defineTool({
  name: 'find_occurrences',
  title: 'Occurrences of a Hebrew word',
  description,
  input: inputSchema,
  output: outputSchema,
  run: ({ strong, scope, versification, limit }, repo) => {
    const parsed = parseStrong(strong);
    if (!parsed.ok) return parsed;
    const numbering = versification ?? 'eng';
    const where = parseScope(scope ?? 'OT', numbering);
    if (!where.ok) return where;
    const { key, sense } = parsed.value;
    if (sense === undefined ? repo.senses(key).length === 0 : repo.lexiconEntry(key) === null) {
      return err({ kind: 'unknown_strong', input: strong });
    }

    const hits = groupByVerse(repo.occurrences(parsed.value, where.value, numbering));
    const groups = [...new Set(hits.map((h) => h.strong))].toSorted().map((s): SenseGroup => {
      const own = hits.filter((h) => h.strong === s);
      return {
        strong: s,
        gloss: repo.lexiconEntry(s)?.gloss ?? '',
        hits: own,
        count: own.reduce((n, h) => n + h.count, 0),
      };
    });
    const verses = new Set(hits.map((h) => verseKey(h.ref))).size;
    const total = hits.reduce((n, h) => n + h.count, 0);
    const flat = groups.flatMap((g) => g.hits);
    const entries = flat.length;

    const view = (shown: number): OccurrenceView => {
      const next = flat[shown];
      return {
        strong: key,
        scopeLabel: scopeLabel(where.value),
        versification: numbering,
        total,
        verses,
        bySense: sense === undefined,
        groups: take(groups, shown),
        omitted: entries - shown,
        nextScope: next === undefined ? null : `${next.ref.book.name} ${next.ref.chapter}`,
      };
    };
    let shown = Math.min(limit ?? DEFAULT_LIMIT, entries);
    while (shown > 0 && formatOccurrences(view(shown)).length > MAX_CHARS) shown -= 1;
    const final = view(shown);

    return ok({
      text: formatOccurrences(final),
      structured: {
        strong: key,
        scope: final.scopeLabel,
        versification: numbering,
        total,
        verses,
        senses: groups.map((g) => ({ strong: g.strong, gloss: g.gloss, count: g.count })),
        truncated: final.omitted > 0,
        occurrences: final.groups.flatMap((g) =>
          g.hits.map((h) => ({
            ref: formatRef(h.ref),
            strong: h.strong,
            count: h.count,
            forms: [...h.forms],
          })),
        ),
      },
    });
  },
});
