import { McpServer } from '@modelcontextprotocol/server';
import type { BibleRepo } from './data/repo.ts';
import { getVerse } from './tools/get-verse.ts';
import type { Registrable } from './tools/shared.ts';

const attribution = (repo: BibleRepo): string => {
  const sha = repo.meta('stepbible_commit');
  const version = sha === null ? '' : ` (data commit ${sha})`;
  return `Data: STEPBible (https://github.com/STEPBible/STEPBible-Data)${version} by Tyndale House, Cambridge, licensed CC BY 4.0.`;
};

export const instructions = (repo: BibleRepo): string =>
  [
    "Word-level data for the Hebrew Old Testament: original text with transliteration, English gloss, Strong's numbers and morphology, a Hebrew lexicon, and proper names.",
    'References look like "Ruth 1:2": an English book name or OSIS id, chapter, verse. Strong\'s numbers look like "H1254" or "H7704G" (the letter selects one sense).',
    attribution(repo),
  ].join('\n');

const tools: readonly Registrable[] = [getVerse];

export const createServer = ({ repo }: { readonly repo: BibleRepo }): McpServer => {
  const server = new McpServer(
    { name: 'stepbible', version: '0.0.0' },
    { instructions: instructions(repo), capabilities: { tools: {} } },
  );
  for (const tool of tools) tool.register(server, repo);
  return server;
};
