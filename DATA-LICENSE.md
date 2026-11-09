# Data license

The lexical and textual data used by this project comes from
[STEPBible.org](https://www.stepbible.org/) (Tyndale House, Cambridge) and is
published at <https://github.com/STEPBible/STEPBible-Data>.

- License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- Source revision: `5de0a47f35f0fc13dfe1430d104e5db8a4285f9c`
- Files used: TAHOT (Hebrew Old Testament), TAGNT (Greek New Testament), TBESH and
  TBESG (brief Hebrew and Greek lexicons), TIPNR (proper names with all references),
  TEHMC and TEGMC (expansions of the Hebrew and Greek morphology codes).
- Changes: the original tab-separated files are parsed and reformatted into a
  SQLite database. No lexical content is added or edited. From the amalgamated Greek
  text, one reading per verse is selected (the Nestlé-Aland words, or the traditional
  text for verses Nestlé-Aland lacks); the words themselves are unchanged. The
  excerpts under `test/fixtures/raw/` are unchanged lines of these files.

## Translations (theWord modules)

The verse texts served by `get_translation` come from theWord Bible modules vendored in
`data/theword/`, checked at build time against the sha256 sums in `data/theword/MANIFEST.json`.
Changes: the modules are normalized onto the KJV verse grid (edits listed in the manifest and in
`docs/adr/0006-translation-texts.md`); markup tags are removed, added words are shown as `[…]`
and KJV marginal notes as `⸨…⸩`. The excerpts under `test/fixtures/theword/` are lines of the
normalized modules.

### King James Version (`kjv`)

- Text: King James Version, 1769 text; theWord module "KJV" by Costas Stergiou and Jon Graef.
- Licence: public domain, except in the United Kingdom, where it is governed by Crown copyright
  (letters patent); the module states the same.

### Darby (`darby`)

- Text: J. N. Darby, A literal translation of the Old Testament (1890) and the New Testament (1884);
  theWord module by Costas Stergiou.
- Licence: public domain ("Public Domain - Copy Freely", per the module).

### Elberfelder 1905 (`elb1905`)

- Text: Unrevidierte Elberfelder Bibel, 1905; theWord module by Costas Stergiou.
- Licence: public domain. The module's own statement reads "Copyright by R. Bockhaus Verlages" and
  "Public Domain"; the 1905 text is out of copyright.

### Ohienko (`ohienko`)

- Text: Ivan Ohienko (Огієнко), Ukrainian Bible; theWord module by Adam Wood, converted from the
  SWORD Project, re-slotted onto KJV numbering by `scripts/normalize-theword.ts`.
- Licence: [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).
  The module itself states "This work is in the public domain"; this project treats the text
  conservatively as CC BY-SA 4.0. The database therefore is a collection that contains CC BY-SA
  text: the Ohienko text, and adaptations of it, must stay under CC BY-SA 4.0 with this attribution.

### Russian Synodal (`rst`)

- Text: Russian Synodal Translation, 1876; theWord module by Costas Stergiou.
- Licence: public domain.

Any redistribution of the database, or of excerpts served by this project, must
keep these attributions. The MIT license in `LICENSE` applies to the source code only.
