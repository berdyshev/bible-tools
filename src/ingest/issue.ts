import type { Result } from '../domain/result.ts';

/** A line that looks like data but cannot be parsed. */
export type ParseIssue = { readonly line: string; readonly reason: string };

/** `ok(null)` marks a header, comment or blank line that carries no record. */
export type ParseOutcome<T> = Result<T | null, ParseIssue>;
