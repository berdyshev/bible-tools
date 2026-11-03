import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';

const user = (text: string) => ({ role: 'user', content: { type: 'text', text } }) as const;

export const wordStudyText = (strong: string): string =>
  [
    `Do a word study of the Hebrew word ${strong}.`,
    `1. Call lookup_strong with "${strong}". If it returns a menu of senses, pick the one that fits and call it again.`,
    "2. Call find_occurrences with that Strong's number across the Old Testament.",
    '3. Call get_verse on two or three representative references from the results.',
    'Then summarize how the word is used. Base the summary only on what the tools returned; do not invent data.',
  ].join('\n');

export const verseAnalysisText = (ref: string): string =>
  [
    `Analyze the Hebrew text of ${ref}.`,
    `1. Call get_verse with "${ref}".`,
    `2. Call get_names with "${ref}" to list the proper names.`,
    '3. Call lookup_strong on the key words to see their range of meanings.',
    'Then explain the wording and the names. Base the analysis only on what the tools returned; do not invent data.',
  ].join('\n');

export const registerPrompts = (server: McpServer): void => {
  server.registerPrompt(
    'word_study',
    {
      title: 'Word study',
      description: 'Study one Hebrew word: its lexicon entry, where it occurs and how it is used.',
      argsSchema: z.object({
        strong: z.string().min(1).describe("Hebrew Strong's number, e.g. `H7704G` or `H1254`."),
      }),
    },
    ({ strong }) => ({ messages: [user(wordStudyText(strong))] }),
  );
  server.registerPrompt(
    'verse_analysis',
    {
      title: 'Verse analysis',
      description: 'Analyze the Hebrew of a verse: its words, proper names and key terms.',
      argsSchema: z.object({
        ref: z.string().min(1).describe('A verse reference, e.g. `Ruth 1:1`.'),
      }),
    },
    ({ ref }) => ({ messages: [user(verseAnalysisText(ref))] }),
  );
};
