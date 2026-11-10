# bible-tools

A read-only [Model Context Protocol](https://modelcontextprotocol.io/) server over
[STEPBible](https://www.stepbible.org/) open data: the Hebrew Old Testament and the Greek New
Testament tagged with Strong's numbers and morphology, Hebrew and Greek lexicons, explanations of the
morphology codes, and a database of proper names. Alongside them it serves the verse text of five
public-domain or freely licensed translations (KJV, Darby, Elberfelder 1905, Ohienko, Russian Synodal) in KJV numbering.
The server announces itself as `bible-tools`.

It is built for Bible translators, students of the original languages and people building
agents that need grounded source-language data instead of guesses.

- Read-only and stateless: no writes, no user accounts, no model calls inside the server.
- Local `stdio` transport.
- Data is loaded into a local SQLite database built from a pinned STEPBible revision and the
  theWord translation modules vendored in `data/theword/` (checked against the sha256 sums in
  `data/theword/MANIFEST.json`).

## Requirements

- Node.js >= 24.12
- pnpm 12

## Setup

```sh
pnpm install
pnpm data:fetch   # downloads the STEPBible files at the pinned revision into data/raw/ (about 115 MB)
pnpm data:build   # builds data/bible.sqlite (about 127 MB, takes under a minute)
```

The server reads `data/bible.sqlite` by default; set `BIBLE_DB` to use another file.
If the file is missing the server prints one line telling you which commands to run and exits.

## Tools

All tools are read-only and take English book names or OSIS ids (`Ruth`, `1Sam`, `John`, `1Cor`).
Verse numbers follow English (NRSV) versification by default; pass `"versification": "heb"` for
the Hebrew (Leningrad) numbering of the Old Testament. The New Testament has only English numbering.

| Tool            | What it does                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------- |
| `get_original`     | The original words of a verse, a range (`Ruth 1:1-5`, `John 1:1-5`, up to 10 verses) or a chapter: Hebrew for the Old Testament, Greek for the New Testament, with transliteration, English gloss and Strong's numbers. `morphology: true` adds each word's morphology code. Long passages are cut at a verse boundary with a hint for the next call. |
| `get_translation` | The text of a verse, range or chapter in one translation: `kjv`, `darby`, `elb1905`, `ohienko` or `rst`, in KJV numbering, with the version's own verse number at the line end where it differs (`[RST 13:2]`; Elberfelder numbers are not shown, as the module marks them inconsistently). One version and up to 10 verses per call. |
| `lookup_strong` | The lexicon entry for one Hebrew or Greek Strong's number (`H7704G`, `G3056`), or a menu of its senses. A very long entry is shortened to the output budget. |
| `get_names`     | The proper names (persons, places, gentilics, divine names) in a verse, range or chapter, deduplicated by Strong's number, with kind, word positions per verse and original form. |
| `find_occurrences` | Every occurrence of a Strong's number in a book, chapter or whole testament (`OT`, `NT`), with the word form at each. A Greek word compounded with another counts under its first part only. |
| `search_lexicon` | Finds Hebrew and Greek lexicon entries by an English word in the gloss or meaning, to get a Strong's number. |
| `explain_morphology` | Explains a morphology code as `get_original` shows it (`V-AAI-3S`, `HVqw3ms`, compounds such as `HC/Vqw3ms`): the grammatical elements, a plain phrase, the meaning and an example. |

Example calls (tool arguments):

```json
{ "name": "get_original", "arguments": { "ref": "Ruth 1:1" } }
{ "name": "get_original", "arguments": { "ref": "John 1:1", "morphology": true } }
{ "name": "get_translation", "arguments": { "ref": "Num 13:1-3", "version": "rst" } }
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
| `bible://original/{ref}` | `get_original`     | `bible://original/Ruth%201%3A1`, `bible://original/John.1.1` |
| `bible://strong/{id}` | `lookup_strong` | `bible://strong/H7704G`, `bible://strong/G3056` |

`ref` is URL-encoded; `Ruth.1.1` is accepted too. Invalid input is a JSON-RPC error with the
same hint the tools give.

## Prompts

| Prompt           | Argument | What it asks the model to do                                                                      |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `word_study`     | `strong` | `lookup_strong` (pick a sense if a menu comes back), `find_occurrences` over the Old Testament (Hebrew numbers) or the New Testament (Greek numbers), `get_original` on a few representative references, then summarize the usage without inventing data. |
| `verse_analysis` | `ref`    | `get_original`, then `get_names`, then `lookup_strong` on the key words.                             |

## Use with Claude Desktop or Claude Code

Use absolute paths for `node` and for `src/stdio.ts`; the `--disable-warning` flag silences
the Node SQLite experimental warning.

```json
{
  "mcpServers": {
    "bible": {
      "command": "/absolute/path/to/node",
      "args": [
        "--disable-warning=ExperimentalWarning",
        "/absolute/path/to/bible-tools/src/stdio.ts"
      ],
      "env": { "BIBLE_DB": "/absolute/path/to/bible-tools/data/bible.sqlite" }
    }
  }
}
```

For Claude Code:

```sh
claude mcp add bible -- /absolute/path/to/node --disable-warning=ExperimentalWarning /absolute/path/to/bible-tools/src/stdio.ts
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
| `POST /mcp`   | MCP messages. `RATE_LIMIT` per minute for all clients (`429` above)         |
| `GET /health` | Liveness probe: `{"status":"ok"}`, with no rate limit or header checks      |

`GET` and `DELETE` on `/mcp` answer `405`, as there are no sessions to open or close.

| Variable          | Default                     | Purpose                                        |
| ----------------- | --------------------------- | ---------------------------------------------- |
| `PORT`            | `3000`                      | Listening port on `0.0.0.0`                    |
| `BIBLE_DB`        | `data/bible.sqlite`         | Database file (`STEPBIBLE_DB` is still read)   |
| `ALLOWED_HOSTS`   | localhost, 127.0.0.1, [::1] | Comma-separated hostnames accepted in `Host`   |
| `ALLOWED_ORIGINS` | localhost, 127.0.0.1, [::1] | Comma-separated hostnames accepted in `Origin` |
| `RATE_LIMIT`      | `600`                       | Requests per minute to `/mcp`, for all clients |

Requests to `/mcp` with any other `Host` or `Origin` answer `403`, so a public deployment must set
`ALLOWED_HOSTS` to its hostname; `/health` keeps answering `200` either way. Requests without an
`Origin` are accepted, as non-browser clients do not send one.

The rate limit is global, not per client IP: behind a reverse proxy the socket address is the
proxy's, and every claude.ai connector calls from Anthropic's addresses anyway. Forwarded headers
(`X-Forwarded-For`, `CF-Connecting-IP`) are not trusted.

## Docker

```sh
docker build -t bible-tools .
docker run --rm -p 3000:3000 bible-tools
curl http://localhost:3000/health
```

The build downloads the STEPBible files at the pinned revision (about 115 MB), reads the translation
modules from `data/theword/` and builds the database inside the image, so it needs network access and takes a few minutes; the image is about 500 MB and
holds no raw data files. The container runs as the unprivileged `node` user, listens on `PORT`
(default 3000) and has a health check on `/health`. `docker stop` ends it cleanly with exit code 0.

With the default `ALLOWED_HOSTS` only `localhost` is accepted in the `Host` header. Behind a domain,
pass the hostname (comma-separated for several):

```sh
docker run --rm -p 3000:3000 -e ALLOWED_HOSTS=mcp.example.com bible-tools
```

## Deploy on Render

`render.yaml` is a blueprint for a Docker web service on Render's free tier.

1. Push the repository to GitHub, GitLab or Bitbucket.
2. In the Render dashboard choose **New > Blueprint** and select the repository. Render reads
   `render.yaml`, builds the image and starts the service. A push to `main` deploys once CI has passed (`autoDeployTrigger: checksPass`).
3. If the service name `bible-tools` was already taken, Render appends a suffix. Then set
   `ALLOWED_HOSTS` to the real hostname of the service (`<service>.onrender.com`) in the service's
   environment settings; requests with another `Host` get `403`. `ALLOWED_ORIGINS` is set to `claude.ai`:
   a request that carries an `Origin` header is accepted only when the header's hostname is in that list,
   and requests without an `Origin` header are not affected.

Render sets `PORT` itself and uses `/health` for its health check.

Free-tier services sleep after 15 minutes without traffic, and the first request after that waits
about a minute for a cold start. To avoid it, ping `https://<service>.onrender.com/health` every
few minutes from an uptime monitor or a scheduled job. All clients share one rate limit of
`RATE_LIMIT` requests per minute (600 by default).

## Use as a Claude connector

Once the service is up, add it to Claude as a custom connector: in Claude's settings open
**Connectors**, choose **Add custom connector**, enter a name and the URL

```text
https://<service>.onrender.com/mcp
```

and choose no sign-in, as the server needs no account or key. The same URL works for
`claude mcp add --transport http bible https://<service>.onrender.com/mcp` in Claude Code.

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
pnpm fixtures           # regenerate test/fixtures/raw/ from data/raw/ and test/fixtures/theword/ from data/theword/
pnpm inspect            # open the MCP Inspector
```

Source code is TypeScript run directly by Node (type stripping), so there is no build step.

## Alternatives

Other MCP servers cover similar ground. This comparison is based on each project's README and
repository page as of 2026-11-07; the source code was not read, so claims about behaviour are the
projects' own.

| Project | Strengths compared with this server | Trade-offs |
| ------- | ----------------------------------- | ---------- |
| [jeremymikkelsen/bible-translation-mcp](https://github.com/jeremymikkelsen/bible-translation-mcp) | More than 100 English and other translations through the HelloAO API, side-by-side comparison, word-aligned interlinear against the unfoldingWord literal text, full-text search of the texts. | Translations need network access to a third-party API. Greek and Hebrew texts and lexicons are unfoldingWord's, licensed CC BY-SA 4.0 (code MIT). No proper-name tool is listed. |
| [NoveltyDreams/textual-criticism-mcp](https://github.com/NoveltyDreams/textual-criticism-mcp) | Syntax and morphology search over Text-Fabric corpora (BHSA, Nestle 1904) and textual variants with manuscript and edition support, which this server does not have: it stores one Greek reading per verse. | A Python package that downloads about 300 MB of corpora on first use; its README mentions no hosted option. |
| [Divine-Creative-Ministries/bible-cli](https://github.com/Divine-Creative-Ministries/bible-cli) | Far broader: 25 read-only tools on a hosted endpoint (35 locally), translation comparison, cross-references, clause-level syntax search, a Bible-study workflow for agents, and import of licensed translations. It uses the same STEPBible Hebrew, Greek and proper-name data plus further lexicons. | A much larger surface and a bigger tool list for a model to choose from. Its code licence is listed by GitHub as "other"; check it before reuse. |
| [nirajagarwal/bible-mcp](https://github.com/nirajagarwal/bible-mcp) | The widest corpus: English translations, the Septuagint, 600,000+ tagged original-language words, full lexicon entries, cross-references, people and places, early Christian writings and semantic search, with a hosted endpoint. | A database of about 400 MB. Its code is under PolyForm Noncommercial 1.0.0 and its derived data is CC BY-NC, so it cannot be used commercially. |

What this server offers instead: a small, read-only set of seven tools over STEPBible data and five public-domain or freely licensed translations, with
every output bounded to about 2,000 characters and a hint for the next call; both Testaments with
Strong's numbers, morphology and an explanation of every morphology code; proper names with their
kinds; MIT code and openly licensed data that can be used and redeployed with attribution; and a single
Docker image with a health check and a Render blueprint. It has no text search, no cross-references,
no syntax trees and no textual variants.

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

Translations come from theWord Bible modules, vendored in `data/theword/`:

| Version | Text | Licence |
| ------- | ---- | ------- |
| `kjv` | King James Version (1769 text), theWord module by Costas Stergiou and Jon Graef | Public domain outside the United Kingdom; in the UK under Crown copyright |
| `darby` | J. N. Darby, New Translation (1890), theWord module by Costas Stergiou | Public domain |
| `elb1905` | Unrevidierte Elberfelder Bibel (1905), theWord module by Costas Stergiou | Public domain |
| `ohienko` | Ivan Ohienko, Ukrainian Bible, theWord module by Adam Wood (from the SWORD Project), re-slotted onto KJV numbering | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `rst` | Russian Synodal Translation (1876), theWord module by Costas Stergiou | Public domain |

## License

Code: [MIT](LICENSE). Data: STEPBible CC BY 4.0; the translations as listed above (the database
contains the Ohienko text under CC BY-SA 4.0). See [DATA-LICENSE.md](DATA-LICENSE.md).
