/** The translations `get_translation` serves, in the order they are listed. */
export const VERSION_IDS = ['kjv', 'darby', 'elb1905', 'ohienko', 'rst'] as const;

export type VersionId = (typeof VERSION_IDS)[number];

/** How a translation is named and licensed. */
export type Version = {
  readonly id: VersionId;
  /** Short Latin label shown before a verse's own number, e.g. `[RST 13:2]`. */
  readonly label: string;
  readonly title: string;
  /** ISO 639-3 code of the text's language. */
  readonly language: string;
  readonly licence: string;
  readonly attribution: string;
  /** What the version's own plain-text markers mean, shown in the output header; null if it has none. */
  readonly markers: string | null;
};

export const VERSIONS: readonly Version[] = [
  {
    id: 'kjv',
    label: 'KJV',
    title: 'King James Version',
    language: 'eng',
    licence: 'public domain outside the United Kingdom; in the UK under Crown copyright',
    attribution: 'King James Version (1769 text), theWord module by Costas Stergiou and Jon Graef',
    markers: null,
  },
  {
    id: 'darby',
    label: 'Darby',
    title: 'Darby translation',
    language: 'eng',
    licence: 'public domain',
    attribution: 'J. N. Darby, New Translation (1890), theWord module by Costas Stergiou',
    markers: '*God = El, +God = Eloah, *word = imrah, *..* = emphatic in the original',
  },
  {
    id: 'elb1905',
    label: 'Elb1905',
    title: 'Elberfelder 1905',
    language: 'deu',
    licence: 'public domain',
    attribution: 'Unrevidierte Elberfelder Bibel (1905), theWord module by Costas Stergiou',
    markers: null,
  },
  {
    id: 'ohienko',
    label: 'Ohienko',
    title: 'Ohienko Ukrainian Bible',
    language: 'ukr',
    licence: 'CC BY-SA 4.0',
    attribution:
      'Ivan Ohienko, Ukrainian Bible, theWord module by Adam Wood (from the SWORD Project), re-slotted onto KJV numbering',
    markers: null,
  },
  {
    id: 'rst',
    label: 'RST',
    title: 'Russian Synodal',
    language: 'rus',
    licence: 'public domain',
    attribution: 'Russian Synodal Translation (1876), theWord module by Costas Stergiou',
    markers: null,
  },
];
