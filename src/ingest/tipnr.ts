export type NameCategory = 'person' | 'place' | 'other';

export type TipnrName = {
  /** e.g. "Chilion@Rut.1.2-". */
  readonly uniqueName: string;
  readonly dstrong: string;
  /** Set by the most recent `$==== PERSON/PLACE/OTHER` section header. */
  readonly category: NameCategory;
  readonly description: string;
};

const SECTION_RE = /^\$=+\s*(PERSON|PLACE|OTHER)/;
const NAME_RE = /^([^\s–$#@\t][^\t=]*@[^\t=]*)=([HG]\d{4,5}[A-Za-z]?)\t([^\t]*)/;

const categoryOf = (section: string): NameCategory =>
  section === 'PLACE' ? 'place' : section === 'OTHER' ? 'other' : 'person';

/**
 * Folds over the file's lines: section headers set the category of the rows that follow.
 * Rows with Hebrew and Greek Strong's numbers are kept; all non-data lines are dropped.
 */
export const parseTipnr = (lines: Iterable<string>): TipnrName[] => {
  const names: TipnrName[] = [];
  let category: NameCategory = 'person';
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const section = SECTION_RE.exec(line);
    if (section !== null) {
      category = categoryOf(section[1] ?? '');
      continue;
    }
    const m = NAME_RE.exec(line);
    if (m !== null) {
      names.push({
        uniqueName: m[1] ?? '',
        dstrong: m[2] ?? '',
        category,
        description: (m[3] ?? '').trim(),
      });
    }
  }
  return names;
};
