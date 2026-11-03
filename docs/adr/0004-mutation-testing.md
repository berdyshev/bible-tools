# 0004. Mutation testing

## Status

Accepted

## Context

Tests are written with the built-in `node:test` runner and no test-framework dependency. Mutation testing is wanted as a check that the tests detect logic changes, not only that they execute lines. StrykerJS has no `node:test` runner, but `@stryker-mutator/tap-runner` runs each test file as `node <file>` with a coverage hook and parses TAP output, which `node:test` produces. The classic TypeScript compiler API is not available in TypeScript 7, so `@stryker-mutator/typescript-checker` cannot be used.

Acceptance criteria for the tap runner, measured on the current scope (`src/domain/errors.ts`, `src/domain/result.ts`, 2 test files):

- (a) `pnpm test:mutation` exits 0.
- (b) A deliberately weakened copy of a test leaves a targeted mutant `Survived`, while the normal suite reports it `Killed`.
- (c) The projected full run is at most 10 minutes.

## Decision

Use Stryker 10.1.1 with the tap runner (`stryker.config.json`):

- `testRunner: "tap"`, tap test files `test/unit/**/*.test.ts` (database and golden tests are added when they exist).
- `coverageAnalysis: "perTest"` (coverage is per test file), `checkers: []`, `disableTypeChecks: true`.
- `incremental: true` with `reports/stryker-incremental.json`; thresholds high 90, low 80, break 75.
- `mutate`: `src/domain/**`, `src/ingest/**`, `src/data/repo.ts`, `src/tools/**`.
- Scripts: `test:mutation` (`stryker run`) and `test:mutation:full` (`stryker run --force`).

Three settings are required to make it work in this repository:

- `plugins: ["@stryker-mutator/tap-runner"]`. pnpm's strict `node_modules` layout hides the runner from Stryker's default `@stryker-mutator/*` plugin discovery.
- `tsconfigFile` pointing at a file that does not exist. Stryker's tsconfig rewriter calls `ts.parseConfigFileTextToJson`, which TypeScript 7 does not export. The rewriter is a no-op when the file is absent from the sandbox, and nothing else needs the tsconfig because type checks are disabled.
- Default `nodeArgs`. Adding `--test` makes Node spawn the test file in a child process that does not load the coverage hook (`-r`), so every mutant is reported as `NoCoverage`. Test files are run directly, and Node emits TAP when stdout is not a TTY.

Node 24 executes `.ts` natively, so no loader or transform option is needed.

Measured results (macOS dev machine: Intel Core i7-9750H, 12 threads, Node 24.12.0, 11 Stryker workers):

| Item | Result |
|---|---|
| Mutants | 42 (`errors.ts` 36, `result.ts` 6) |
| Killed / survived / no coverage | 41 / 0 / 1 |
| Score | 97.62 (covered 100.00) |
| `pnpm test:mutation:full` wall time | 9.1-10.3 s (Stryker "Done" 6-7 s) |
| Dry run only | 1.8 s |
| `pnpm test:mutation` with a warm incremental file | 4.5 s |
| Marginal cost per mutant | about 0.17 s wall ((9.1 s - 1.8 s) / 42) |

The single `NoCoverage` mutant is the unreachable `default` branch of the exhaustive `switch` in `hint` (`return e satisfies never`), which exists for the type-level exhaustiveness check.

Criteria:

- (a) `pnpm test:mutation` exits 0. Pass.
- (b) With `errors.test.ts` weakened (the `invalid_scope` case asserted only as non-empty), mutant 34 (`e.allowed.join(', ')` changed to `join("")`) was `Survived`; with the normal suite it is `Killed`. Pass.
- (c) Linear extrapolation to 700 mutants is about 2 minutes. A pessimistic projection that triples per-mutant cost (more test files, about 100 static mutants that execute every file, fixture-database setup) is about 6 minutes. Both are within 10 minutes. Pass.

The command runner (`testRunner: "command"`) was not needed and is not configured.

## Alternatives

- Stryker `command` runner over a unit-only script: exit code only, no coverage, and incremental runs receive no test information. Kept as a fallback; not needed.
- A different test framework with a native Stryker runner (Jest, Vitest, Mocha): adds a dependency and transform layer where the built-in runner suffices.
- No mutation testing: loses a check that assertions are specific.
- `@stryker-mutator/typescript-checker`: requires the classic TypeScript API, which TypeScript 7 does not provide.

## Consequences

- Coverage is per test file, so a mutant is attributed to whole files rather than individual tests.
- No type checking of mutants: mutants that do not compile may be reported as `Survived` or `Killed` incidentally, so survivors are reviewed manually.
- The `tsconfigFile` workaround depends on Stryker's current behaviour and may need revisiting on upgrades.
- Mutation runs are manual or pre-release; they are not part of the per-commit gate. Reports are written to `reports/`, and the sandbox to `.stryker-tmp/`, both git-ignored.

## Follow-ups

- Add database and golden test files to `tap.testFiles` as they are created, and re-measure wall time on the full scope.
- Raise the break threshold from 75 to 80 once the milestone with the full test set is complete.
- Drop the `tsconfigFile` workaround if Stryker stops requiring the classic TypeScript API.
