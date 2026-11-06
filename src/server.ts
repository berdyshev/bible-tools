import { McpServer } from '@modelcontextprotocol/server';
import type { BibleRepo } from './data/repo.ts';
import { registerPrompts } from './prompts.ts';
import { registerResources } from './resources.ts';
import { findOccurrences } from './tools/find-occurrences.ts';
import { getNames } from './tools/get-names.ts';
import { getVerse } from './tools/get-verse.ts';
import { lookupStrong } from './tools/lookup-strong.ts';
import { searchLexicon } from './tools/search-lexicon.ts';
import type { Registrable } from './tools/shared.ts';

const attribution = (repo: BibleRepo): string => {
  const sha = repo.meta('stepbible_commit');
  const version = sha === null ? '' : ` (data commit ${sha})`;
  return `Data: STEPBible (https://github.com/STEPBible/STEPBible-Data)${version} by Tyndale House, Cambridge, licensed CC BY 4.0.`;
};

export const instructions = (repo: BibleRepo): string =>
  [
    "Word-level data for the Hebrew Old Testament and the Greek New Testament: original text with transliteration, English gloss, Strong's numbers and morphology, Hebrew and Greek lexicons, and proper names.",
    'References look like "Ruth 1:2" or "John 1:1": an English book name or OSIS id, chapter, verse. Strong\'s numbers look like "H1254", "H7704G" or "G3056" (H is Hebrew, G is Greek; the letter after the digits selects one sense).',
    attribution(repo),
  ].join('\n');

const tools: readonly Registrable[] = [getVerse, lookupStrong, getNames, findOccurrences, searchLexicon];

export const createServer = ({ repo }: { readonly repo: BibleRepo }): McpServer => {
  const server = new McpServer(
    { name: 'stepbible', version: '0.0.0' },
    { instructions: instructions(repo), capabilities: { tools: {}, resources: {}, prompts: {} } },
  );
  for (const tool of tools) tool.register(server, repo);
  registerResources(server, repo);
  registerPrompts(server);
  return server;
};
