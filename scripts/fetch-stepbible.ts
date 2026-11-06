// Downloads the STEPBible data files (CC BY 4.0) at a pinned commit into data/raw/ and writes data/SOURCES.md.
// Usage: node scripts/fetch-stepbible.ts   (override the revision with STEPBIBLE_COMMIT=<40-hex sha>)
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';

const DEFAULT_COMMIT = '5de0a47f35f0fc13dfe1430d104e5db8a4285f9c';
const REPO = 'STEPBible/STEPBible-Data';
const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const RAW_DIR = `${DATA_DIR}raw/`;

const commit = z
  .string()
  .regex(/^[0-9a-f]{40}$/, 'STEPBIBLE_COMMIT must be a 40-character lowercase hex SHA')
  .parse(process.env['STEPBIBLE_COMMIT'] ?? DEFAULT_COMMIT);

type Source = { readonly localName: string; readonly repoPath: string; readonly description: string };

const TAHOT_DIR = 'Translators Amalgamated OT+NT/';
const TAHOT_SUFFIX = ' - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt';

const tahot = (range: string, what: string): Source => ({
  localName: `TAHOT-${range}.txt`,
  repoPath: `${TAHOT_DIR}TAHOT ${range}${TAHOT_SUFFIX}`,
  description: `TAHOT (Hebrew OT word-per-line), ${what}`,
});

const tagnt = (range: string, what: string): Source => ({
  localName: `TAGNT-${range}.txt`,
  repoPath: `${TAHOT_DIR}TAGNT ${range} - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt`,
  description: `TAGNT (Greek NT word-per-line), ${what}`,
});

const SOURCES: readonly Source[] = [
  tahot('Gen-Deu', 'Genesis-Deuteronomy'),
  tahot('Jos-Est', 'Joshua-Esther (includes Ruth)'),
  tahot('Job-Sng', 'Job-Song of Songs'),
  tahot('Isa-Mal', 'Isaiah-Malachi'),
  tagnt('Mat-Jhn', 'Matthew-John'),
  tagnt('Act-Rev', 'Acts-Revelation'),
  {
    localName: 'TBESH.txt',
    repoPath:
      'Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt',
    description: 'TBESH (brief Hebrew lexicon, extended Strong numbers)',
  },
  {
    localName: 'TBESG.txt',
    repoPath:
      'Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt',
    description: 'TBESG (brief Greek lexicon, extended Strong numbers)',
  },
  {
    localName: 'TIPNR.txt',
    repoPath:
      'Proper Nouns/TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt',
    description: 'TIPNR (proper names with unique IDs)',
  },
  {
    localName: 'TEHMC.txt',
    repoPath:
      'Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt',
    description: 'TEHMC (expansions of Hebrew morphology codes)',
  },
  {
    localName: 'TEGMC.txt',
    // The double "h" in "Morphhology" is the file's real name.
    repoPath:
      'Morphology codes/TEGMC - Translators Expansion of Greek Morphhology Codes - STEPBible.org CC BY.txt',
    description: 'TEGMC (expansions of Greek morphology codes)',
  },
];

const rawUrl = (repoPath: string): string =>
  `https://raw.githubusercontent.com/${REPO}/${commit}/${repoPath.split('/').map(encodeURIComponent).join('/')}`;

await mkdir(RAW_DIR, { recursive: true });
const rows: string[] = [];
for (const s of SOURCES) {
  const url = rawUrl(s.repoPath);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(`${RAW_DIR}${s.localName}`, buf);
  console.log(`${s.localName}  ${(buf.length / 1e6).toFixed(1)} MB`);
  rows.push(`| ${s.description} | \`data/raw/${s.localName}\` | ${url} | ${buf.length} |`);
}

const date = new Date().toISOString().slice(0, 10);
await writeFile(
  `${DATA_DIR}SOURCES.md`,
  `# Data sources

Downloaded ${date} by \`scripts/fetch-stepbible.ts\` from https://github.com/${REPO} at commit \`${commit}\`.

| Dataset | Local file | URL | Bytes |
| --- | --- | --- | --- |
${rows.join('\n')}

## License (CC BY 4.0)

Data created by www.STEPBible.org based on work at Tyndale House Cambridge,
licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
Source: https://STEPBible.github.io/STEPBible-Data. Reformatted into SQLite (\`data/bible.sqlite\`)
by \`scripts/build-db.ts\`; no content changes.

## Versification

TAHOT's primary reference (\`Book.Chapter.Verse#Word\`) is the English (NRSV) reference.
When the Hebrew (Leningrad) reference differs it is given in parentheses,
e.g. \`1Sa.20.42(21.1)#01=L\` (English 20.42 = Hebrew 21.1). Both are stored in the database
(\`chapter\`/\`verse\` = English, \`heb_chapter\`/\`heb_verse\` = Hebrew; equal when the file gives no bracket).
Psalm titles are verse 0 (English numbering).

TAGNT's primary reference is the English (NRSV) reference too; a second numbering in \`{}\`, \`[]\` or
\`()\` is ignored. The New Testament is stored with \`heb_chapter\`/\`heb_verse\` equal to \`chapter\`/\`verse\`.
`,
);
console.log('wrote data/SOURCES.md');
