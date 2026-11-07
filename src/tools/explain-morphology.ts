import { z } from 'zod/v4';
import type { BibleRepo, MorphologyEntry } from '../data/repo.ts';
import type { InputError } from '../domain/errors.ts';
import { err, ok } from '../domain/result.ts';
import type { Result } from '../domain/result.ts';
import { defineTool, describeTool } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

const MAX_CODE_LENGTH = 80;

export const inputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(MAX_CODE_LENGTH)
    .describe(
      'A morphology code as get_verse shows it with `morphology: true`: Greek `V-AAI-3S`, Hebrew `HVqw3ms`. ' +
        'A compound is explained part by part: `HC/Vqw3ms`, `HR/Ncmpc`, `P-1NS + CONJ`, `HVqp3ms//Ncmsa`.',
    ),
});

const partSchema = z.object({
  code: z.string(),
  parsing: z.string(),
  summary: z.string(),
  meaning: z.string(),
  example: z.string(),
});

export const outputSchema = z.object({ parts: z.array(partSchema) });

export const descriptionParts: DescriptionParts = {
  what: 'Explains a Hebrew or Greek morphology code (STEPBible TEHMC, TEGMC): the grammatical elements it stands for, a plain phrase for the form, what the form expresses and an example of how it might be translated.',
  when: 'Use it on the code that get_verse shows for a word when called with `morphology: true`, to read the tense, voice, mood, person, number, stem or state of the word. Hebrew codes work with or without the leading `H`.',
  output:
    'Output: per code, a line `code — summary`, then `Parsing:`, `Meaning:` and `Example:` lines where the source has them. A compound code (`HC/Vqw3ms` with a prefix, `HVqp3ms//Ncmsa` with a Qere reading, `P-1NS + CONJ` for two Greek words in one) gives one block per part, separated by a blank line.',
  not: 'It does not look at any verse and does not explain the brief lexical codes of the lexicons such as `G:N-M`; use lookup_strong for the lexicon entry.',
};

export const description = describeTool(descriptionParts);

const lookup = (repo: BibleRepo, code: string, prefixes: readonly string[]): MorphologyEntry | null => {
  for (const prefix of prefixes) {
    const entry = repo.morphologyCode(`${prefix}${code}`);
    if (entry !== null) return entry;
  }
  return null;
};

// "//" separates the Ketiv and Qere readings, "/" the parts of a Hebrew word, " + " the Greek words in one.
const PART_SEPARATOR = /\/\/|\/|\s\+\s/;

const unknown = (input: string, within?: string): InputError => ({
  kind: 'unknown_morph_code',
  input,
  ...(within === undefined ? {} : { within }),
});

/**
 * The entries for a code: the whole code if it is one, otherwise each part of a compound in order. Later
 * Hebrew and Aramaic parts lack the language letter that opens the first part, and the same letters
 * stand for different stems in the two languages (`Vhp3ms` is Hiphil in `HVhp3ms` and Haphel in
 * `AVhp3ms`), so the first part decides which letter the rest take.
 */
export const resolveMorphology = (repo: BibleRepo, code: string): Result<MorphologyEntry[], InputError> => {
  const whole = lookup(repo, code, ['', 'H', 'A']);
  if (whole !== null) return ok([whole]);
  const parts = code.split(PART_SEPARATOR).map((p) => p.trim());
  if (parts.length < 2) return err(unknown(code));
  const entries: MorphologyEntry[] = [];
  let later: readonly string[] = ['', 'H', 'A'];
  for (const part of parts) {
    const entry = part === '' ? null : lookup(repo, part, later);
    if (entry === null) return err(unknown(part, code));
    if (entries.length === 0) {
      // The letter that opens a Hebrew (`H`) or Aramaic (`A`) code; Greek codes have none.
      const letter = entry.language === 'hebrew' ? entry.code.slice(0, 1) : null;
      later = letter === null ? [''] : [letter, ''];
    }
    entries.push(entry);
  }
  return ok(entries);
};

const formatPart = (e: MorphologyEntry): string =>
  [
    e.summary === '' ? e.code : `${e.code} — ${e.summary}`,
    ...(e.parsing === '' ? [] : [`Parsing: ${e.parsing}`]),
    ...(e.meaning === '' ? [] : [`Meaning: ${e.meaning}`]),
    ...(e.example === '' ? [] : [`Example: ${e.example}`]),
  ].join('\n');

export const formatMorphology = (entries: readonly MorphologyEntry[]): string =>
  entries.map(formatPart).join('\n\n');

export const explainMorphology = defineTool({
  name: 'explain_morphology',
  title: 'Explain a morphology code',
  description,
  input: inputSchema,
  output: outputSchema,
  run: ({ code }, repo) => {
    const resolved = resolveMorphology(repo, code);
    if (!resolved.ok) return resolved;
    return ok({
      text: formatMorphology(resolved.value),
      structured: {
        parts: resolved.value.map(({ code: part, parsing, summary, meaning, example }) => ({
          code: part,
          parsing,
          summary,
          meaning,
          example,
        })),
      },
    });
  },
});
