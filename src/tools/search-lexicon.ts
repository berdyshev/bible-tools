import { z } from 'zod/v4';
import { ok } from '../domain/result.ts';
import { defineTool, describeTool } from './shared.ts';
import type { DescriptionParts } from './shared.ts';

export const DEFAULT_LIMIT = 20;

export const inputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .describe(
      'An English word or phrase to find in lexicon glosses and meanings, e.g. `field` or `kindness`.',
    ),
  language: z
    .enum(['hebrew', 'greek'])
    .optional()
    .describe('Restrict the search to Hebrew or Greek entries. Default: both.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum number of entries to list (default ${DEFAULT_LIMIT}).`),
});

export const outputSchema = z.object({
  query: z.string(),
  results: z.array(z.object({ strong: z.string(), gloss: z.string(), lemma: z.string() })),
  more: z.boolean(),
});

export const descriptionParts: DescriptionParts = {
  what: "Finds Hebrew and Greek lexicon entries (STEPBible TBESH, TBESG) whose English gloss or list of meanings contains a word, and returns their Strong's numbers.",
  when: "Use it to find the Strong's number for a concept (`field`, `kindness`) when you have no verse to read it from, or to see which Hebrew or Greek words share a meaning. Whole-word matches in the gloss come first. Pass `language` to search one language only.",
  output:
    'Output: one line per entry, best match first: `strong  «gloss»  lemma`. Pass a number to lookup_strong for the full entry.',
  not: 'It searches the lexicon only, not Bible text, and does not show where a word occurs: use find_occurrences for that.',
};

export const description = describeTool(descriptionParts);

export type LexiconHit = { readonly strong: string; readonly gloss: string; readonly original: string };

// The lemma comes last: a line that ends in Hebrew letters keeps its left-to-right layout in bidi-aware renderers.
export const formatSearch = (query: string, hits: readonly LexiconHit[], more: boolean): string => {
  if (hits.length === 0) {
    return `No lexicon entries match "${query}". Try a shorter or different English word.`;
  }
  const head = `${hits.length}${more ? '+' : ''} lexicon ${hits.length === 1 && !more ? 'entry' : 'entries'} for "${query}"`;
  return [
    head,
    ...hits.map((h) => `${h.strong}  «${h.gloss}»  ${h.original}`),
    ...(more ? ['More entries match; raise limit or use a more specific word.'] : []),
  ].join('\n');
};

export const searchLexicon = defineTool({
  name: 'search_lexicon',
  title: 'Search the lexicon',
  description,
  input: inputSchema,
  output: outputSchema,
  run: ({ query, language, limit }, repo) => {
    const max = limit ?? DEFAULT_LIMIT;
    // One extra row tells whether the list was cut.
    const found = repo.searchLexicon(query, language, max + 1);
    const entries = found.slice(0, max);
    const more = found.length > max;
    const hits = entries.map((e) => ({ strong: e.strong, gloss: e.gloss, original: e.original }));
    const results = hits.map((h) => ({ strong: h.strong, gloss: h.gloss, lemma: h.original }));
    return ok({ text: formatSearch(query, hits, more), structured: { query, results, more } });
  },
});
