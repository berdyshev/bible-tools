import { z } from 'zod/v4';
import type { InputError } from '../domain/errors.ts';
import { parseStrong, strongBase } from '../domain/strong.ts';
import { err, ok } from '../domain/result.ts';
import type { Result } from '../domain/result.ts';
import type { BibleRepo } from '../data/repo.ts';
import { MAX_CHARS } from './passage.ts';
import { defineTool, describeTool } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

export const inputSchema = z.object({
  strong: z
    .string()
    .min(1)
    .describe(
      "Strong's number as shown by get_verse, Hebrew or Greek: e.g. `H1254`, `H7704G` or `G3056` (the letter selects one sense; " +
        'zero-padding is optional). A bare number with several senses returns a menu of them.',
    ),
});

const senseSchema = z.object({ strong: z.string(), lemma: z.string(), gloss: z.string() });

export const outputSchema = z.object({
  kind: z.enum(['entry', 'menu']),
  entry: z
    .object({
      strong: z.string(),
      lemma: z.string(),
      transliteration: z.string(),
      morph: z.string(),
      gloss: z.string(),
      meaning: z.string(),
    })
    .optional(),
  senses: z.array(senseSchema),
  /** Set when the entry shown is the base entry of a sense that has none of its own. */
  note: z.string().optional(),
});

export const descriptionParts: DescriptionParts = {
  what: "Returns the lexicon entry for one Hebrew or Greek Strong's number (STEPBible TBESH, based on Brown-Driver-Briggs, or TBESG, based on Abbott-Smith): lemma, transliteration, part of speech, short gloss, the list of meanings and the other senses of the same word. Prefix tags such as H9003 (`in`) are explained too.",
  when: 'Use it to explain the range of meanings of a Hebrew or Greek word and to justify a translation choice. Take the number from get_verse output; accepts `H0376`, `H376`, `H7704G` and `G3056` (the letter selects one sense).',
  output: `A bare number that has several senses returns a menu, one line per sense: \`strong  lemma  «gloss»\`; pick the sense get_verse shows for your verse and call again. A very long entry is cut at a line break to about ${MAX_CHARS} characters and ends with \`… (entry shortened)\`; the structured result keeps the full meaning.`,
  not: 'It does not show where else the word occurs and does not decide the meaning in context.',
};

export const description = describeTool(descriptionParts);

export type LexiconSense = {
  readonly strong: string;
  readonly original: string;
  readonly gloss: string;
};

export type LexiconEntryView = LexiconSense & {
  readonly transliteration: string;
  readonly morph: string;
  readonly meaning: string;
};

/** TBESH meanings begin with the tail of the gloss (": country/field"); drop that separator. */
const cleanMeaning = (meaning: string): string => meaning.trim().replace(/^:\s*/, '');

const senseLine = (s: LexiconSense): string => `${s.strong}  ${s.original}  «${s.gloss}»`;

export const formatMenu = (base: string, senses: readonly LexiconSense[]): string =>
  [
    `${base} has ${senses.length} senses; pick the one get_verse shows for your verse and call again:`,
    ...senses.map(senseLine),
  ].join('\n');

const SHORTENED = '… (entry shortened)';

/** `meaning` cut at the last line break that leaves room for the marker, so the result fits `budget`. */
const shorten = (meaning: string, budget: number): string => {
  if (meaning.length <= budget) return meaning;
  const room = Math.max(budget - SHORTENED.length - 1, 0);
  const lineBreak = meaning.lastIndexOf('\n', room);
  const kept = lineBreak > 0 ? meaning.slice(0, lineBreak) : meaning.slice(0, room);
  return `${kept.trimEnd()}\n${SHORTENED}`;
};

/** The entry as text, within `MAX_CHARS` unless the head, the note and the other senses alone exceed it. */
export const formatEntry = (
  entry: LexiconEntryView,
  others: readonly LexiconSense[],
  note?: string,
): string => {
  const head = `${entry.strong}  ${entry.original}  ${entry.transliteration}  [${entry.morph}]  «${entry.gloss}»`;
  const more = [
    ...(note === undefined ? [] : [note]),
    ...(others.length === 0
      ? []
      : [`Other senses: ${others.map((o) => `${o.strong} «${o.gloss}»`).join('; ')}`]),
  ];
  // The meaning shares the line budget with the head, the other senses and the line breaks around it.
  const budget = MAX_CHARS - [head, ...more].join('\n').length - 1;
  return [head, shorten(cleanMeaning(entry.meaning), budget), ...more].join('\n');
};

const sense = (s: LexiconSense) => ({ strong: s.strong, lemma: s.original, gloss: s.gloss });

const lookup = (
  input: string,
  repo: BibleRepo,
): Result<{ text: string; structured: z.infer<typeof outputSchema> }, InputError> => {
  const parsed = parseStrong(input);
  if (!parsed.ok) return parsed;
  const { key, sense: letter } = parsed.value;
  const base = strongBase(key);
  const senses = repo.senses(base);

  if (letter === undefined && senses.length > 1) {
    return ok({
      text: formatMenu(base, senses),
      structured: { kind: 'menu', senses: senses.map(sense) },
    });
  }
  const exact = letter === undefined ? (senses[0] ?? null) : repo.lexiconEntry(key);
  // TAGNT tags some words with a sense letter the lexicon does not list: G3700G, where the lexicon has
  // only the base number G3700, or H0430J, where it has the senses H0430G, H0430H and H0430I.
  const stand = exact === null && letter !== undefined ? repo.lexiconEntry(base) : null;
  if (exact === null && stand === null && letter !== undefined && senses.length > 1) {
    const note = `${key} has no entry of its own; its base number ${base} has these senses.`;
    return ok({
      text: `${note}\n${formatMenu(base, senses)}`,
      structured: { kind: 'menu', senses: senses.map(sense), note },
    });
  }
  const only = exact === null && stand === null && letter !== undefined ? (senses[0] ?? null) : null;
  const entry = exact ?? stand ?? only;
  if (entry === null) return err({ kind: 'unknown_strong', input });
  const note =
    stand === null && only === null
      ? undefined
      : `${key} has no entry of its own; this is the entry of ${entry.strong}.`;
  const others = senses.filter((s) => s.strong !== entry.strong);
  return ok({
    text: formatEntry(entry, others, note),
    structured: {
      kind: 'entry',
      entry: {
        strong: entry.strong,
        lemma: entry.original,
        transliteration: entry.transliteration,
        morph: entry.morph,
        gloss: entry.gloss,
        meaning: cleanMeaning(entry.meaning),
      },
      senses: others.map(sense),
      ...(note === undefined ? {} : { note }),
    },
  });
};

export const lookupStrong = defineTool({
  name: 'lookup_strong',
  title: 'Lexicon entry',
  description,
  input: inputSchema,
  output: outputSchema,
  run: ({ strong }, repo) => lookup(strong, repo),
});
