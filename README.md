# stepbible-mcp

A read-only [Model Context Protocol](https://modelcontextprotocol.io/) server over
[STEPBible](https://www.stepbible.org/) open data: the Hebrew Old Testament tagged with
Strong's numbers and morphology, a Hebrew lexicon, and a database of proper names.

It is built for Bible translators, students of the original languages and people building
agents that need grounded source-language data instead of guesses.

- Read-only and stateless: no writes, no user accounts, no model calls inside the server.
- Local `stdio` transport.
- Data is loaded into a local SQLite database built from a pinned STEPBible revision.

## Requirements

- Node.js >= 24.12
- pnpm 12

## Tools

No tools are published yet. This list will grow as they are added.

## Development

```sh
pnpm install
pnpm check      # type check
pnpm lint       # oxlint, type-aware
pnpm fmt:check  # oxfmt
pnpm test
```

## Attribution

Lexical and textual data comes from [STEPBible.org](https://www.stepbible.org/), Tyndale House,
Cambridge ([STEPBible-Data](https://github.com/STEPBible/STEPBible-Data)), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source revision
`5de0a47f35f0fc13dfe1430d104e5db8a4285f9c`, reformatted into SQLite. See
[DATA-LICENSE.md](DATA-LICENSE.md).

## License

Code: [MIT](LICENSE). Data: CC BY 4.0, see above.
