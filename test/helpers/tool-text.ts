import type { CallToolResult } from '@modelcontextprotocol/server';

/** The text of a tool result's first content block; fails loudly if there is none. */
export const textOf = (result: CallToolResult): string => {
  const block = result.content[0];
  if (block?.type !== 'text') throw new Error('tool result has no text content');
  return block.text;
};
