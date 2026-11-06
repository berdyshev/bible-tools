# Test fixtures

`raw/` holds an excerpt of the STEPBible data used by the tests, in the original file format.

- `TAHOT-Ruth.txt`: the file's licence and field-description header, then every word line of Ruth.
- `TAGNT-John1.txt`: the file's licence and field-description header, then every word line of John 1.
- `TBESH.txt`, `TBESG.txt`: the complete Hebrew and Greek lexicons, so every sense of a number and every prefix and suffix tag resolves.
- `TEHMC.txt`, `TEGMC.txt`: the complete Hebrew and Greek morphology code tables.
- `TIPNR.txt`: the proper-name rows whose Strong's number is the root of a word in Ruth or John 1, each preceded by its section header.

## Source and license

Data created by [STEPBible.org](https://www.stepbible.org/) based on work at Tyndale House Cambridge, licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Source:
<https://github.com/STEPBible/STEPBible-Data> at commit `5de0a47f35f0fc13dfe1430d104e5db8a4285f9c`.
Lines are copied unchanged; only a subset of the lines is kept.

## Regenerating

```sh
pnpm data:fetch   # downloads the full files at the pinned commit into data/raw/
pnpm fixtures     # rewrites test/fixtures/raw/ from data/raw/ (deterministic)
```

`test/helpers/fixture-db.ts` loads these files into an in-memory database (`fixtureDb()`) or a SQLite file
(`buildFixtureDbFile(dir)`).
