import { ProtocolError, ProtocolErrorCode, ResourceTemplate } from '@modelcontextprotocol/server';
import type { CallToolResult, McpServer, ReadResourceResult, Variables } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { BibleRepo } from './data/repo.ts';
import { getOriginal } from './tools/get-original.ts';
import { getTranslation, inputSchema as translationInput } from './tools/get-translation.ts';
import { lookupStrong } from './tools/lookup-strong.ts';

/** `Ruth.1.1` (OSIS style) is read as `Ruth 1:1`; anything else is passed on unchanged. */
const DOTTED_REF = /^(.+)\.(\d+)\.(\d+)$/;

const normalizeRef = (ref: string): string => {
  const m = DOTTED_REF.exec(ref);
  return m === null ? ref : `${m[1]} ${m[2]}:${m[3]}`;
};

/** The template variable, percent-decoded (the SDK hands it over as it appears in the URI). */
const variable = (variables: Variables, name: string): string => {
  const value = variables[name];
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const asRead = (uri: URL, result: CallToolResult): ReadResourceResult => {
  const block = result.content[0];
  const text = block?.type === 'text' ? block.text : '';
  // The tool wrapper already turned expected input errors into a hint and anything unexpected
  // into a generic message, so this text is safe to show.
  if (result.isError === true) throw new ProtocolError(ProtocolErrorCode.InvalidParams, text);
  return { contents: [{ uri: uri.href, mimeType: 'text/plain', text }] };
};

export const registerResources = (server: McpServer, repo: BibleRepo): void => {
  server.registerResource(
    'original',
    new ResourceTemplate('bible://original/{ref}', { list: undefined }),
    {
      title: 'Original-language words of a verse',
      description:
        'The Hebrew (Old Testament) or Greek (New Testament) words of one verse, as returned by get_original. `ref` is URL-encoded, e.g. ' +
        '`bible://original/Ruth%201%3A1` or `bible://original/John%201%3A1`; `Ruth.1.1` is accepted too.',
      mimeType: 'text/plain',
    },
    (uri, variables) =>
      asRead(uri, getOriginal.call({ ref: normalizeRef(variable(variables, 'ref')) }, repo)),
  );
  server.registerResource(
    'strong',
    new ResourceTemplate('bible://strong/{id}', { list: undefined }),
    {
      title: 'Lexicon entry',
      description:
        "The lexicon entry of one Hebrew or Greek Strong's number, as returned by lookup_strong, e.g. " +
        '`bible://strong/H7704G` or `bible://strong/G3056`.',
      mimeType: 'text/plain',
    },
    (uri, variables) => asRead(uri, lookupStrong.call({ strong: variable(variables, 'id') }, repo)),
  );
  server.registerResource(
    'translation',
    new ResourceTemplate('bible://translation/{version}/{ref}', { list: undefined }),
    {
      title: 'Translation of a passage',
      description:
        'One translation of a verse or passage in KJV numbering, as returned by get_translation. `version` is ' +
        `${translationInput.shape.version.options.map((v) => `\`${v}\``).join(', ')}; \`ref\` is URL-encoded, e.g. ` +
        '`bible://translation/kjv/Ruth%201%3A1` or `bible://translation/rst/John.1.1`.',
      mimeType: 'text/plain',
    },
    (uri, variables) => {
      const args = translationInput.safeParse({
        ref: normalizeRef(variable(variables, 'ref')),
        version: variable(variables, 'version'),
      });
      if (!args.success)
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, z.prettifyError(args.error));
      return asRead(uri, getTranslation.call(args.data, repo));
    },
  );
};
