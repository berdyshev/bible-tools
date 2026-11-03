import { z } from 'zod/v4';
import type { InputError } from '../domain/errors.ts';
import { parseStrong } from '../domain/strong.ts';
import { err, ok } from '../domain/result.ts';
import type { Result } from '../domain/result.ts';
import type { BibleRepo } from '../data/repo.ts';
import { defineTool, describeTool } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

export const inputSchema = z.object({
  strong: z
    .string()
    .min(1)
    .describe(
      "Hebrew Strong's number as shown by get_verse, e.g. `H1254` or `H7704G` (the letter selects one sense; " +
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
});

export const descriptionParts: DescriptionParts = {
  what: "Returns the lexicon entry (STEPBible TBESH, based on Brown-Driver-Briggs) for one Hebrew Strong's number: lemma, transliteration, part of speech, short gloss, the list of meanings and the other senses of the same word. Prefix tags such as H9003 (`in`) are explained too.",
  when: 'Use it to explain the range of meanings of a Hebrew word and to justify a translation choice. Take the number from get_verse output; accepts `H0376`, `H376` and `H7704G` (the letter selects one sense).',
  output:
    'A bare number that has several senses returns a menu, one line per sense: `strong  lemma  «gloss»`; pick the sense get_verse shows for your verse and call again.',
  not: 'It does not show where else the word occurs and does not decide the meaning in context.',
};

export const description = describeTool(descriptionParts);

export type LexiconSense = {
  readonly strong: string;
  readonly hebrew: string;
  readonly gloss: string;
};

export type LexiconEntryView = LexiconSense & {
  readonly transliteration: string;
  readonly morph: string;
  readonly meaning: string;
};

/** TBESH meanings begin with the tail of the gloss (": country/field"); drop that separator. */
const cleanMeaning = (meaning: string): string => meaning.trim().replace(/^:\s*/, '');

const senseLine = (s: LexiconSense): string => `${s.strong}  ${s.hebrew}  «${s.gloss}»`;

export const formatMenu = (base: string, senses: readonly LexiconSense[]): string =>
  [
    `${base} has ${senses.length} senses; pick the one get_verse shows for your verse and call again:`,
    ...senses.map(senseLine),
  ].join('\n');

export const formatEntry = (entry: LexiconEntryView, others: readonly LexiconSense[]): string => {
  const head = `${entry.strong}  ${entry.hebrew}  ${entry.transliteration}  [${entry.morph}]  «${entry.gloss}»`;
  const more =
    others.length === 0 ? [] : [`Other senses: ${others.map((o) => `${o.strong} «${o.gloss}»`).join('; ')}`];
  return [head, cleanMeaning(entry.meaning), ...more].join('\n');
};

const sense = (s: LexiconSense) => ({ strong: s.strong, lemma: s.hebrew, gloss: s.gloss });

const lookup = (
  input: string,
  repo: BibleRepo,
): Result<{ text: string; structured: z.infer<typeof outputSchema> }, InputError> => {
  const parsed = parseStrong(input);
  if (!parsed.ok) return parsed;
  const { key, sense: letter } = parsed.value;
  const base = key.slice(0, 5);
  const senses = repo.senses(base);

  if (letter === undefined && senses.length > 1) {
    return ok({
      text: formatMenu(base, senses),
      structured: { kind: 'menu', senses: senses.map(sense) },
    });
  }
  const entry = letter === undefined ? (senses[0] ?? null) : repo.lexiconEntry(key);
  if (entry === null) return err({ kind: 'unknown_strong', input });
  const others = senses.filter((s) => s.strong !== entry.strong);
  return ok({
    text: formatEntry(entry, others),
    structured: {
      kind: 'entry',
      entry: {
        strong: entry.strong,
        lemma: entry.hebrew,
        transliteration: entry.transliteration,
        morph: entry.morph,
        gloss: entry.gloss,
        meaning: cleanMeaning(entry.meaning),
      },
      senses: others.map(sense),
    },
  });
};

export const lookupStrong = defineTool({
  name: 'lookup_strong',
  title: 'Hebrew lexicon entry',
  description,
  input: inputSchema,
  output: outputSchema,
  run: ({ strong }, repo) => lookup(strong, repo),
});
