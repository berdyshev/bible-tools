# 0006. Translation texts from theWord modules

## Status

Accepted

## Context

Translators compare the original words with existing translations. The server had only STEPBible's original-language data. The maintainer chose five public-domain or freely licensed translations and supplied each as a theWord Bible module (`.ont`): KJV, Darby, Elberfelder 1905, Ohienko and Russian Synodal. A theWord module has one line per verse slot in KJV numbering (31,102 lines, Gen 1:1 is line 1), then a blank line and `key=value` metadata. The supplied modules use different encodings (windows-1251, windows-1252, ASCII) and different markup, and they do not all follow the slot grid (see Normalization).

Provenance, quoted from each module's metadata:

| Version | Module, creator | Licence line in the module | Treated as |
|---|---|---|---|
| `kjv` | `kjv.ont` (`id=b9`), Costas Stergiou, Jon Graef; KJV with Strong's tags | "This work is public domain, except in the United Kingdom, where it is governed by Crown copyright." | public domain outside the UK; UK Crown patent caveat |
| `darby` | `darby.ont` (`id=b25`), Costas Stergiou | "Public Domain - Copy Freely" | public domain |
| `elb1905` | `gerelb.ont` (`id=b50`), Costas Stergiou | "Copyright by R. Bockhaus [sic] Verlages" and "Public Domain" in the same block | public domain: the 1905 text predates the copyright line, and its translators died in 1899 or earlier |
| `ohienko` | `ukrio.ont` (`id=b145`), Adam Wood, from the SWORD Project | "The Ivan Ogienko Ukrainian Bible of 1930 … This work is in the public domain." | CC BY-SA 4.0, conservatively (the translator died in 1972) |
| `rst` | `rst.ont` (`id=b113`), Costas Stergiou; the 1876 text with no Strong's tagging | none (only "1876 Russian Synodal Text") | public domain |

## Decision

- A new tool, `get_translation(ref, version)`, serves one version per call. `version` is one of `kjv`, `darby`, `elb1905`, `ohienko`, `rst`. `ref` uses the `get_original` syntax (verse, range or chapter), with the same caps: at most 10 verses and 2,000 characters, cut at a verse boundary, first verse always shown, then a continuation hint.
- **KJV numbering for every version.** There is no `versification` parameter. Where a version numbers a verse differently, its own number is shown after the text (`[RST 13:2]`, `[Ohienko 5:20]`); a slot the version has no text for is shown as `13:5 —`. Differences from `get_original` (NRSV numbering) are listed in the tool description:
  - Psalm titles: NRSV verse 0, KJV part of verse 1 (116 psalms);
  - `2Cor 13` (KJV 14 verses, NRSV 13), `3John 1` (14 vs 15), `Rev 12` (17 vs 18; NRSV 12:18 is in KJV 13:1).
  - No Old Testament chapter differs in verse count.
- Elberfelder numbers are not shown: the module marks them inconsistently; use `get_original` with versification `heb` for Hebrew numbering.
- KJV verse counts per chapter are factual data from the SWORD Project's `canon_kjv` table (`include/canon.h`), in `src/domain/kjv.ts`. The SWORD Project is not a source of any text.
- **Brackets `[…]`** mean, per version: `kjv`, `darby` and `rst` mark words added by the translators; `elb1905` marks readings of the traditional text that the critical text omits (Matt 5:22 "ohne Grund"); `ohienko` has none. The output header states the meaning.
- **Module notes** (only the KJV's 7,716 marginal notes) stay inline at their position as `⸨…⸩` (U+2E28/U+2E29). The marker never occurs in the source text; the build checks this.
- **Darby's markers** are kept as in the module, with a legend in the output header: `*God` = El, `+God` = Eloah, `*word` = imrah, `*…*` = a word emphatic in the original. Checked against the STEPBible Hebrew: `*God` stands in 220 of 222 verses with H410, `+God` in 56 of 56 with H433, `*word` in 18 of 18 with H565. Darby writes the divine name as "Jehovah".
- **Omitted verses.** A verse slot the module leaves empty, Darby's `- - -` and the Elberfelder editor's remark in its place ("Dieser Vers gehört nicht zum ursprünglichen Text…", Matt 23:14, Acts 8:37) are not stored. The output line is the verse number alone (`8:37`), and the header legend then says that such a line is a verse the translation omits or joins to another.
- **Names and licence** of each version live in `src/domain/versions.ts`; the database stores only what depends on the text (bracket meaning, whether notes occur, module sha256).
- Other markup is removed: Strong's tags and paragraph marks with no text left, formatting and HTML tags with their content kept, RST's `^^` around psalm titles, Elberfelder's trailing ` -`.
- **Storage.** The supplied modules are committed unchanged in `data/theword/original/`. A deterministic script, `scripts/normalize-theword.ts`, writes normalized modules to `data/theword/<id>.ont`, also committed. `data/theword/MANIFEST.json` records, per version, the original and normalized files with their sha256, the original encoding (normalized modules are UTF-8 with a BOM), licence, bracket meaning and every normalization edit. `build-db.ts` fails on a sha256 mismatch or a module that is not 31,102 verse lines; a test re-runs the script and compares hashes.
- The server is renamed `bible-sources`. The package name, the `stepbible://` resource URIs and the public URL are unchanged.

### Normalization

The script brings every module to one format: KJV slots, and the version's own numbers as `(c:v)` markers at the start of a line or mid-line, the way the RST module writes them. The edits are listed with exact counts in `MANIFEST.json` (`edits`):

- `ohienko`: the module puts Ohienko's own verse numbers on the KJV grid, with empty trailing slots and overflow glued onto the last slot of a chapter (`Gen 32:1` holds KJV 31:55; `Joel 3:21` holds Hos 14:1 and all of Hebrew Joel 4). The script re-slots it onto KJV numbering and adds `(c:v)` markers where Ohienko's numbering differs.
- `rst`: `Song 1`, `Ps 90:1-6` and `Isa 3:19-26` re-slotted where the module's text is shifted off its KJV slot (Song 1 by one verse: the module lacks the superscription verse, so KJV 1:1 is empty).
- `elb1905`: `<FI>` brackets balanced per verse line, so that `Mark 16:9-20` and `John 7:53-8:11` are bracketed verse by verse; the original opens a bracket at Mark 16:9 and never closes it until John 8:11.
  Its `<WTHc:v>` (Hebrew numbering) tags are checked against the Hebrew verse map the script uses for Ohienko (`HEB_TO_KJV`, from the STEPBible word table) and set from it where they disagree: `Job 40:1-41:34` (another verse division, one verse behind from 41:10), `2Kgs 12:1` (12:1 for Hebrew 12:2), `Ps 13:6`, `Eccl 6:12`, `Isa 7:25`, `2Kgs 15:38`. In a chapter that has tags, untagged lines whose Hebrew number differs get one (`Deut 29:3-29`, `2Kgs 12:2-21`), and a line that starts in another Hebrew verse gets a leading tag instead of only a mid-line one (`Num 30:1` = Hebrew 30:2).
- `darby`: `<FI>` brackets balanced per verse line (`John 5:3-4`, `Acts 24:6-8` cross verse lines) and the nested pair in `Rom 9:28` flattened.

## Alternatives

- SWORD or eBible sources: rejected by the maintainer; their KJV italics and versification handling differ from theWord's.
- A `translations` parameter on `get_original`: mixes NRSV-numbered word lines with KJV-numbered text, and bloats one tool's output and description.
- Several versions per call with a 10,000-character cap: larger output re-sent on every agent step; the agent can call once per version it needs.
- MCP resources (`bible://translation/{version}/{ref}`): Claude Desktop's model cannot fetch resources on its own.
- Modules as GitHub release assets with a fetch script: a smaller repository, more moving parts.
- Accepting `eng`/`heb` references and mapping them to KJV: needs a full versification mapping (TVTMS).
- Serving `ohienko` on its own slots with a warning: verse text would not match the KJV reference it is shown under.

## Consequences

- Verse numbers in `get_translation` differ from `get_original` in the places listed above; an agent combining the two has to account for them.
- The repository grows by about 25 MB of modules, originals and normalized copies.
- The database contains CC BY-SA text (Ohienko), so it carries that licence's attribution and share-alike terms (`DATA-LICENSE.md`). The code stays MIT.
- KJV notes push about 4.7% of 10-verse KJV windows over 2,000 characters (1.6% without notes); those calls return fewer verses and a continuation hint.
- Normalization is our editorial work on `ohienko`; ambiguous re-slots are listed in the manifest.

## Follow-ups

- `eng`/`heb` references for `get_translation` via the TVTMS mapping.
- MCP resources for translation text.
