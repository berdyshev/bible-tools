import type { CallToolResult, McpServer, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { BibleRepo } from '../data/repo.ts';
import { hint } from '../domain/errors.ts';
import type { InputError } from '../domain/errors.ts';
import type { Result } from '../domain/result.ts';

export const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const versificationSchema = z
  .enum(['eng', 'heb'], {
    error: 'versification must be "eng" (English/NRSV, default) or "heb" (Hebrew/Leningrad)',
  })
  .optional()
  .describe('Verse numbering: "eng" (English/NRSV, default) or "heb" (Hebrew/Leningrad).');

type Schema = z.ZodObject;
type Args<In extends Schema> = z.infer<In>;

/** The four sentences every tool description has: what it does, when to use it, its output, and what it is not for. */
export type DescriptionParts = {
  readonly what: string;
  readonly when: string;
  readonly output: string;
  readonly not: string;
};

export const describeTool = (p: DescriptionParts): string => `${p.what} ${p.when} ${p.output} ${p.not}`;

type ToolOutput<Out extends Schema | undefined> = {
  readonly text: string;
  readonly structured?: Out extends Schema ? z.infer<Out> : never;
};

export type ToolSpec<In extends Schema, Out extends Schema | undefined> = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: In;
  readonly output?: Out;
  readonly run: (args: Args<In>, repo: BibleRepo) => Result<ToolOutput<Out>, InputError>;
};

export type Tool<In extends Schema> = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: In;
  /** Runs the handler with the error handling the server applies. */
  readonly call: (args: Args<In>, repo: BibleRepo) => CallToolResult;
  readonly register: (server: McpServer, repo: BibleRepo) => void;
};

export type Registrable = Pick<Tool<Schema>, 'register'>;

const textResult = (text: string, isError: boolean): CallToolResult =>
  isError ? { content: [{ type: 'text', text }], isError } : { content: [{ type: 'text', text }] };

/**
 * Wraps a handler so that the SDK never sees a throw (it would pass the raw message to the client
 * without logging it): expected input errors become `isError` with a fix hint, anything else is
 * logged to stderr and replaced by a generic message.
 */
export const defineTool = <In extends Schema, Out extends Schema | undefined = undefined>(
  spec: ToolSpec<In, Out>,
): Tool<In> => {
  const call = (args: Args<In>, repo: BibleRepo): CallToolResult => {
    try {
      const result = spec.run(args, repo);
      if (!result.ok) return textResult(hint(result.error), true);
      const { text, structured } = result.value;
      return structured === undefined
        ? textResult(text, false)
        : { content: [{ type: 'text', text }], structuredContent: structured };
    } catch (e) {
      console.error(e);
      return textResult(`Internal error while running ${spec.name}; the server log has details.`, true);
    }
  };

  const register = (server: McpServer, repo: BibleRepo): void => {
    // The SDK has already validated the arguments; parsing again hands the handler a typed value
    // without a cast.
    const handler = (raw: unknown): CallToolResult => {
      const args = spec.input.safeParse(raw);
      return args.success
        ? call(args.data, repo)
        : textResult(`Invalid arguments for ${spec.name}: ${z.prettifyError(args.error)}`, true);
    };
    const inputSchema: StandardSchemaWithJSON = spec.input;
    const config = {
      title: spec.title,
      description: spec.description,
      inputSchema,
      annotations: TOOL_ANNOTATIONS,
    };
    const outputSchema: StandardSchemaWithJSON | undefined = spec.output;
    server.registerTool(
      spec.name,
      outputSchema === undefined ? config : { ...config, outputSchema },
      handler,
    );
  };

  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    input: spec.input,
    call,
    register,
  };
};
