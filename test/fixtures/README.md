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

## Translations

`theword/<version>.tsv` holds lines of the theWord translation modules in `data/theword/` (the
normalized modules listed in `data/theword/MANIFEST.json`), one row per verse:
`book<TAB>chapter<TAB>verse<TAB>raw line`, KJV numbering, the raw line decoded to UTF-8 but otherwise
unchanged. Verses kept: Ruth 1-4, Lev 6:1, Num 7, Num 13:1-3, Judg 16:9, 1Sam 20:42, Ps 3, Ps 23:1,
Prov 4:27, Mal 4:1, Matt 5:22, Acts 8:37, Acts 15:34, Rom 16:25, 2Cor 13:12-14, 3John 1:14, Rev 12:17,
Rev 13:1.

| File          | Text                                                                                | Licence                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `kjv.tsv`     | King James Version (1769), theWord module by Costas Stergiou and Jon Graef          | Public domain outside the United Kingdom; in the UK under Crown copyright                                                          |
| `darby.tsv`   | J. N. Darby, New Translation (1890), theWord module by Costas Stergiou              | Public domain                                                                                                                      |
| `elb1905.tsv` | Unrevidierte Elberfelder Bibel (1905), theWord module by Costas Stergiou            | Public domain                                                                                                                      |
| `ohienko.tsv` | Ivan Ohienko, Ukrainian Bible, theWord module by Adam Wood (from the SWORD Project) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/): this excerpt, like the Ohienko text, is shared under CC BY-SA 4.0 |
| `rst.tsv`     | Russian Synodal Translation (1876), theWord module by Costas Stergiou               | Public domain                                                                                                                      |

See [DATA-LICENSE.md](../../DATA-LICENSE.md).

## Regenerating

```sh
pnpm data:fetch   # downloads the full files at the pinned commit into data/raw/
pnpm fixtures     # rewrites test/fixtures/raw/ from data/raw/ and test/fixtures/theword/ from data/theword/ (deterministic)
```

`test/helpers/fixture-db.ts` loads these files, the translation excerpts included, into an in-memory database (`fixtureDb()`) or a SQLite file
(`buildFixtureDbFile(dir)`).
