# 0002. SQLite driver

## Status

Accepted

## Context

The server reads a local SQLite database. The database is built once (about 300k rows) and then queried read-only through indexed lookups returning at most a few hundred rows. Two drivers were compared:

| Aspect | `node:sqlite` | better-sqlite3 |
|---|---|---|
| Stability | Experimental in Node 24.12 | Mature |
| Install | Built in | 27 MB package with platform-specific prebuilds |
| Typing | Rows are `Record<string, SQLOutputValue>`; runtime parsing required | Rows are untyped; runtime parsing required |
| Performance | Synchronous | Synchronous |

The prebuilt binaries affect slim container images and `npx` caches. Performance differences are irrelevant at this query size.

## Decision

Use `node:sqlite`, isolated behind `src/data/db.ts` and `src/data/repo.ts`.

## Alternatives

better-sqlite3 (13.x): stable API, but a heavier install and native binaries to ship.

## Consequences

- Node prints an `ExperimentalWarning` on stderr; entry points and scripts suppress it with `--disable-warning=ExperimentalWarning`.
- Row values are validated with zod schemas in the repository layer.

## Follow-ups

- Swap `db.ts` and `repo.ts` to better-sqlite3 if the built-in API changes incompatibly.
