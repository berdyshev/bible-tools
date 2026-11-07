# stepbible-mcp

A read-only [Model Context Protocol](https://modelcontextprotocol.io/) server over
[STEPBible](https://www.stepbible.org/) open data: the Hebrew Old Testament and the Greek New
Testament tagged with Strong's numbers and morphology, Hebrew and Greek lexicons, explanations of the
morphology codes, and a database of proper names.

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
pnpm data:fetch   # downloads the STEPBible files at the pinned revision into data/raw/ (about 115 MB)
pnpm data:build   # builds data/bible.sqlite (about 130 MB, takes under a minute)
```

The server reads `data/bible.sqlite` by default; set `STEPBIBLE_DB` to use another file.
If the file is missing the server prints one line telling you which commands to run and exits.

## Tools

All tools are read-only and take English book names or OSIS ids (`Ruth`, `1Sam`, `John`, `1Cor`).
Verse numbers follow English (NRSV) versification by default; pass `"versification": "heb"` for
the Hebrew (Leningrad) numbering of the Old Testament. The New Testament has only English numbering.

| Tool            | What it does                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------- |
| `get_verse`     | The original words of a verse, a range (`Ruth 1:1-5`, `John 1:1-5`, up to 10 verses) or a chapter: Hebrew for the Old Testament, Greek for the New Testament, with transliteration, English gloss and Strong's numbers. `morphology: true` adds each word's morphology code. Long passages are cut at a verse boundary with a hint for the next call. |
| `lookup_strong` | The lexicon entry for one Hebrew or Greek Strong's number (`H7704G`, `G3056`), or a menu of its senses. A very long entry is shortened to the output budget. |
| `get_names`     | The proper names (persons, places, gentilics, divine names) in a verse, range or chapter, deduplicated by Strong's number, with kind, word positions per verse and original form. |
| `find_occurrences` | Every occurrence of a Strong's number in a book, chapter or whole testament (`OT`, `NT`), with the word form at each. A Greek word compounded with another counts under its first part only. |
| `search_lexicon` | Finds Hebrew and Greek lexicon entries by an English word in the gloss or meaning, to get a Strong's number. |
| `explain_morphology` | Explains a morphology code as `get_verse` shows it (`V-AAI-3S`, `HVqw3ms`, compounds such as `HC/Vqw3ms`): the grammatical elements, a plain phrase, the meaning and an example. |

Example calls (tool arguments):

```json
{ "name": "get_verse", "arguments": { "ref": "Ruth 1:1" } }
{ "name": "get_verse", "arguments": { "ref": "John 1:1", "morphology": true } }
{ "name": "lookup_strong", "arguments": { "strong": "H7704G" } }
{ "name": "explain_morphology", "arguments": { "code": "V-AAI-3S" } }
{ "name": "get_names", "arguments": { "ref": "Ruth 1:2", "versification": "heb" } }
```

Errors come back as tool results with `isError` set and a hint on how to fix the call.

## Resources

Hosts can attach data as context through two resource templates (plain text, the same
output as the matching tool). They are not listed, since there is nothing sensible to enumerate.

| Template                  | Same as         | Example                         |
| ------------------------- | --------------- | ------------------------------- |
| `stepbible://verse/{ref}` | `get_verse`     | `stepbible://verse/Ruth%201%3A1`, `stepbible://verse/John.1.1` |
| `stepbible://strong/{id}` | `lookup_strong` | `stepbible://strong/H7704G`, `stepbible://strong/G3056` |

`ref` is URL-encoded; `Ruth.1.1` is accepted too. Invalid input is a JSON-RPC error with the
same hint the tools give.

## Prompts

| Prompt           | Argument | What it asks the model to do                                                                      |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `word_study`     | `strong` | `lookup_strong` (pick a sense if a menu comes back), `find_occurrences` over the Old Testament (Hebrew numbers) or the New Testament (Greek numbers), `get_verse` on a few representative references, then summarize the usage without inventing data. |
| `verse_analysis` | `ref`    | `get_verse`, then `get_names`, then `lookup_strong` on the key words.                             |

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

## HTTP

```sh
pnpm start:http
```

Serves the same tools, resources and prompts over stateless Streamable HTTP: every request gets a
fresh server instance and no session is kept.

| Endpoint      | Purpose                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `POST /mcp`   | MCP messages. Limited to 60 requests per minute per client IP (`429` above) |
| `GET /health` | Liveness probe: `{"status":"ok"}`, with no rate limit or header checks      |

`GET` and `DELETE` on `/mcp` answer `405`, as there are no sessions to open or close.

| Variable          | Default                     | Purpose                                        |
| ----------------- | --------------------------- | ---------------------------------------------- |
| `PORT`            | `3000`                      | Listening port on `0.0.0.0`                    |
| `STEPBIBLE_DB`    | `data/bible.sqlite`         | Database file                                  |
| `ALLOWED_HOSTS`   | localhost, 127.0.0.1, [::1] | Comma-separated hostnames accepted in `Host`   |
| `ALLOWED_ORIGINS` | localhost, 127.0.0.1, [::1] | Comma-separated hostnames accepted in `Origin` |

Requests to `/mcp` with any other `Host` or `Origin` answer `403`, so a public deployment must set
`ALLOWED_HOSTS` to its hostname; `/health` keeps answering `200` either way. Requests without an
`Origin` are accepted, as non-browser clients do not send one.

The client IP is the socket address and `X-Forwarded-For` is not trusted, so behind a reverse proxy
all clients share one rate limit.

## Docker

```sh
docker build -t stepbible-mcp .
docker run --rm -p 3000:3000 stepbible-mcp
curl http://localhost:3000/health
```

The build downloads the STEPBible files at the pinned revision (about 115 MB) and builds the database
inside the image, so it needs network access and takes a few minutes; the image is about 500 MB and
holds no raw data files. The container runs as the unprivileged `node` user, listens on `PORT`
(default 3000) and has a health check on `/health`. `docker stop` ends it cleanly with exit code 0.

With the default `ALLOWED_HOSTS` only `localhost` is accepted in the `Host` header. Behind a domain,
pass the hostname (comma-separated for several):

```sh
docker run --rm -p 3000:3000 -e ALLOWED_HOSTS=mcp.example.com stepbible-mcp
```

## Deploy on Render

`render.yaml` is a blueprint for a Docker web service on Render's free tier.

1. Push the repository to GitHub, GitLab or Bitbucket.
2. In the Render dashboard choose **New > Blueprint** and select the repository. Render reads
   `render.yaml`, builds the image and starts the service. Deploys are manual (`autoDeploy: false`).
3. If the service name `stepbible-mcp` was already taken, Render appends a suffix. Then set
   `ALLOWED_HOSTS` to the real hostname of the service (`<service>.onrender.com`) in the service's
   environment settings; requests with another `Host` get `403`. `ALLOWED_ORIGINS` is `claude.ai` so
   that Claude's web app may call the server from the browser.

Render sets `PORT` itself and uses `/health` for its health check.

Free-tier services sleep after 15 minutes without traffic, and the first request after that waits
about a minute for a cold start. To avoid it, ping `https://<service>.onrender.com/health` every
few minutes from an uptime monitor or a scheduled job. All clients share one rate limit of 60
requests per minute, because behind Render's proxy the server only sees the proxy's address.

## Use as a Claude connector

Once the service is up, add it to Claude as a custom connector: in Claude's settings open
**Connectors**, choose **Add custom connector**, enter a name and the URL

```text
https://<service>.onrender.com/mcp
```

and choose no sign-in, as the server needs no account or key. The same URL works for
`claude mcp add --transport http stepbible https://<service>.onrender.com/mcp` in Claude Code.

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
pnpm test:mutation      # Stryker mutation testing of src/ (fails below a score of 80)
pnpm fixtures           # regenerate test/fixtures/raw/ from data/raw/
pnpm inspect            # open the MCP Inspector
```

Source code is TypeScript run directly by Node (type stripping), so there is no build step.

## Data and attribution

Lexical and textual data comes from [STEPBible.org](https://www.stepbible.org/), Tyndale House,
Cambridge ([STEPBible-Data](https://github.com/STEPBible/STEPBible-Data)), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source revision
`5de0a47f35f0fc13dfe1430d104e5db8a4285f9c`, reformatted into SQLite. The files used are TAHOT
(Hebrew Old Testament), TAGNT (Greek New Testament), TBESH and TBESG (brief Hebrew and Greek
lexicons), TIPNR (proper names) and TEHMC and TEGMC (morphology codes). See
[DATA-LICENSE.md](DATA-LICENSE.md).

The Greek text is an amalgam of several editions; one reading per verse is stored, the
Nestlé-Aland text, or the traditional text for the few verses Nestlé-Aland omits. See
[docs/adr/0005-greek-base-text.md](docs/adr/0005-greek-base-text.md).

## License

Code: [MIT](LICENSE). Data: CC BY 4.0, see above.
