# 0001. Stack and error model

## Status

Accepted

## Context

The server is roughly 800 lines of synchronous logic over a local SQLite file. Requirements:

- Casts and escape hatches must be rejected by tooling, not by review.
- Data crossing a boundary (CLI input, tool arguments, database rows) must be parsed, never asserted.
- Source runs directly on Node 24 with type stripping; there is no build step in development.

## Decision

- TypeScript 7 with strict flags beyond `strict` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, among others).
- zod 4 at every boundary.
- A hand-written `Result<T, E>` plus tagged `InputError` values at parse and lookup boundaries. Formatters take plain domain values and return strings.
- `node:test` with `node:assert/strict`.
- oxlint with type-aware rules (`consistent-type-assertions` set to `never`, `no-unsafe-type-assertion`, `no-explicit-any`, `no-non-null-assertion`, the `no-unsafe-*` family, `strict-boolean-expressions`) and oxfmt for formatting.
- No effect system.

## Alternatives

- Effect 4.1.2: adds a runtime, layers and a second schema system, with no asynchronous, retry or concurrency requirement to justify them.
- Exceptions only: failure modes are absent from function types.
- Biome: the no-cast rule is experimental and there are no type-aware `no-unsafe-*` rules.
- typescript-eslint: its peer range supports TypeScript below 6.1 only, so it cannot run with TypeScript 7.
- vitest: adds a transform layer and a dependency where the built-in runner suffices.

## Consequences

- `Result` is hand-rolled and intentionally small.
- oxfmt is a beta release and is pinned to an exact version.
- The oxlint and tsgolint versions track the TypeScript version.

## Follow-ups

- Revisit an effect system if the HTTP layer gains retries, caching or background work.
- Reassess oxfmt at 1.0.
