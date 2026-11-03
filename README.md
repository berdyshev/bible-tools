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

## Setup

```sh
pnpm install
pnpm data:fetch   # downloads the STEPBible files at the pinned revision into data/raw/
pnpm data:build   # builds data/bible.sqlite
```

The server reads `data/bible.sqlite` by default; set `STEPBIBLE_DB` to use another file.
If the file is missing the server prints one line telling you which commands to run and exits.

## Tools

All tools are read-only and take English book names or OSIS ids (`Ruth`, `1Sam`). Verse
numbers follow English (NRSV) versification by default; pass `"versification": "heb"` for
the Hebrew (Leningrad) numbering.

| Tool            | What it does                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------- |
| `get_verse`     | The Hebrew words of a verse, a range (`Ruth 1:1-5`, up to 10 verses) or a chapter, with transliteration, English gloss and Strong's numbers. Long passages are cut at a verse boundary with a hint for the next call. |
| `lookup_strong` | The lexicon entry for one Hebrew Strong's number, or a menu of its senses.                   |
| `get_names`     | The proper names (persons, places, divine names) in a verse, range or chapter, deduplicated by Strong's number, with kind, word positions per verse and Hebrew form. |
| `find_occurrences` | Every occurrence of a Strong's number in a book, chapter or the whole Old Testament, with the word form at each. |
| `search_lexicon` | Finds Hebrew lexicon entries by an English word in the gloss or meaning, to get a Strong's number. |

Example calls (tool arguments):

```json
{ "name": "get_verse", "arguments": { "ref": "Ruth 1:1" } }
{ "name": "lookup_strong", "arguments": { "strong": "H7704G" } }
{ "name": "get_names", "arguments": { "ref": "Ruth 1:2", "versification": "heb" } }
```

Errors come back as tool results with `isError` set and a hint on how to fix the call.

## Resources

Hosts can attach data as context through two resource templates (plain text, the same
output as the matching tool). They are not listed, since there is nothing sensible to enumerate.

| Template                  | Same as         | Example                         |
| ------------------------- | --------------- | ------------------------------- |
| `stepbible://verse/{ref}` | `get_verse`     | `stepbible://verse/Ruth%201%3A1` |
| `stepbible://strong/{id}` | `lookup_strong` | `stepbible://strong/H7704G`     |

`ref` is URL-encoded; `Ruth.1.1` is accepted too. Invalid input is a JSON-RPC error with the
same hint the tools give.

## Use with Claude Desktop or Claude Code

Use absolute paths for `node` and for `src/stdio.ts`; the `--disable-warning` flag silences
the Node SQLite experimental warning.

```json
{
  "mcpServers": {
    "stepbible": {
      "command": "/absolute/path/to/node",
      "args": [
        "--disable-warning=ExperimentalWarning",
        "/absolute/path/to/stepbible-mcp/src/stdio.ts"
      ],
      "env": { "STEPBIBLE_DB": "/absolute/path/to/stepbible-mcp/data/bible.sqlite" }
    }
  }
}
```

For Claude Code:

```sh
claude mcp add stepbible -- /absolute/path/to/node --disable-warning=ExperimentalWarning /absolute/path/to/stepbible-mcp/src/stdio.ts
```

`env` is optional when the database is at the default location. Find the `node` path with
`which node`.

## MCP Inspector

```sh
pnpm inspect
```

This starts the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) against the
stdio server so you can list the tools and call them from a browser UI.

## Development

```sh
pnpm check              # type check
pnpm lint               # oxlint, type-aware
pnpm fmt                # format (pnpm fmt:check only verifies)
pnpm test               # unit, database, golden and end-to-end tests; no database file needed
pnpm test:realdb        # smoke tests against data/bible.sqlite; skipped when it is absent
pnpm test:mutation      # Stryker mutation testing of src/ (fails below a score of 75)
pnpm fixtures           # regenerate test/fixtures/raw/ from data/raw/
pnpm inspect            # open the MCP Inspector
```

Source code is TypeScript run directly by Node (type stripping), so there is no build step.

## Data and attribution

Lexical and textual data comes from [STEPBible.org](https://www.stepbible.org/), Tyndale House,
Cambridge ([STEPBible-Data](https://github.com/STEPBible/STEPBible-Data)), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source revision
`5de0a47f35f0fc13dfe1430d104e5db8a4285f9c`, reformatted into SQLite. See
[DATA-LICENSE.md](DATA-LICENSE.md).

## License

Code: [MIT](LICENSE). Data: CC BY 4.0, see above.
