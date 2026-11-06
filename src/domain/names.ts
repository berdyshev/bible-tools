export type NameKind = 'person' | 'place' | 'gentilic' | 'other';

/** The parts of a proper-name word that grouping needs. */
export type NameWord = {
  readonly position: number;
  readonly original: string;
  readonly transliteration: string;
  readonly gloss: string;
  readonly strong: string | null;
  readonly conjoined: boolean;
  readonly lemmaGloss: string | null;
  readonly nameKind: NameKind | null;
};

/** The parts of a TIPNR record that grouping needs. */
export type NameRecord = {
  readonly category: string;
  readonly description: string;
};

/** A word of the verse together with the TIPNR record of its Strong's number, if any. */
export type NameInput = {
  readonly word: NameWord;
  readonly record: NameRecord | null;
};

export type NameGroup = {
  readonly name: string;
  readonly strong: string | null;
  readonly kind: NameKind;
  readonly original: string;
  readonly transliteration: string;
  readonly positions: readonly number[];
  readonly note: string | null;
};

// "Bethlehem_1": a disambiguation id, not a description.
const PLACEHOLDER = /_\d+$/;

export const kindLabel = (kind: NameKind): string => (kind === 'other' ? 'divine name/title' : kind);

const nameOf = (w: NameWord): string => w.lemmaGloss ?? w.gloss.replace(/^.*\//, '').trim();

// The kind comes from this verse's morphology (Judah is a place in Ruth 1:1 although TIPNR
// describes a person), so a description of another category would mislead.
const noteOf = (name: string, kind: NameKind, record: NameRecord | null): string | null =>
  record !== null &&
  record.category === kind &&
  record.description !== name &&
  !PLACEHOLDER.test(record.description)
    ? record.description
    : null;

type Draft = { -readonly [K in keyof NameGroup]: NameGroup[K] } & { positions: number[] };

/** Groups the proper-name words of one verse: conjoined parts merged, repeats listed once with all positions. */
export const groupNames = (inputs: readonly NameInput[]): NameGroup[] => {
  const merged: Draft[] = [];
  let open: Draft | null = null;
  let previousConjoined = false;
  for (const { word, record } of inputs) {
    const kind = word.nameKind;
    if (kind === null) continue;
    if (open !== null && previousConjoined && open.strong === word.strong) {
      open.original += ` ${word.original}`;
      open.transliteration += ` ${word.transliteration}`;
      open.positions.push(word.position);
    } else {
      const name = nameOf(word);
      open = {
        name,
        strong: word.strong,
        kind,
        original: word.original,
        transliteration: word.transliteration,
        positions: [word.position],
        note: noteOf(name, kind, record),
      };
      merged.push(open);
    }
    previousConjoined = word.conjoined;
  }

  const byKey = new Map<string, Draft>();
  for (const group of merged) {
    const key = group.strong ?? group.name;
    const seen = byKey.get(key);
    if (seen === undefined) byKey.set(key, group);
    else seen.positions.push(...group.positions);
  }
  return [...byKey.values()];
};

/** The names of one verse of a passage, as `groupNames` returns them. */
export type NameVerse = {
  readonly chapter: number;
  readonly verse: number;
  readonly groups: readonly NameGroup[];
};

/** A name of a passage: its first form, and each verse it stands in with the word positions there. */
export type PassageName = Omit<NameGroup, 'positions'> & {
  readonly occurrences: readonly {
    readonly chapter: number;
    readonly verse: number;
    readonly positions: readonly number[];
  }[];
};

/** Merges the names of consecutive verses: one entry per Strong's number, in order of first appearance. */
export const mergeNames = (verses: readonly NameVerse[]): PassageName[] => {
  const byKey = new Map<string, { name: PassageName; occurrences: PassageName['occurrences'][number][] }>();
  for (const { chapter, verse, groups } of verses) {
    for (const { positions, ...group } of groups) {
      const key = group.strong ?? group.name;
      const entry = byKey.get(key) ?? { name: { ...group, occurrences: [] }, occurrences: [] };
      entry.occurrences.push({ chapter, verse, positions });
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].map(({ name, occurrences }) => ({ ...name, occurrences }));
};
