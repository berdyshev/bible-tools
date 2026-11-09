export type InputError =
  | { readonly kind: 'unknown_book'; readonly input: string; readonly validIds: readonly string[] }
  | { readonly kind: 'malformed_reference'; readonly input: string }
  | {
      readonly kind: 'chapter_out_of_range';
      readonly book: string;
      readonly chapter: number;
      readonly max: number;
    }
  | {
      readonly kind: 'verse_out_of_range';
      readonly book: string;
      readonly chapter: number;
      readonly verse: number;
      readonly min: number;
      readonly max: number;
    }
  | { readonly kind: 'invalid_range'; readonly input: string }
  | { readonly kind: 'range_not_supported'; readonly input: string }
  | { readonly kind: 'malformed_strong'; readonly input: string }
  | { readonly kind: 'unknown_strong'; readonly input: string; readonly senses?: readonly string[] }
  | { readonly kind: 'unknown_morph_code'; readonly input: string; readonly within?: string }
  | {
      readonly kind: 'scope_wrong_testament';
      readonly input: string;
      readonly scope: string;
      /** The testament the number's language belongs to. */
      readonly testament: 'OT' | 'NT';
    }
  | { readonly kind: 'invalid_scope'; readonly input: string; readonly allowed: readonly string[] };

const SHOWN_IDS = 3;

const preview = (ids: readonly string[]): string =>
  ids.length > SHOWN_IDS ? `${ids.slice(0, SHOWN_IDS).join(', ')}, …` : ids.join(', ');

export const hint = (e: InputError): string => {
  switch (e.kind) {
    case 'unknown_book':
      return `Unknown book "${e.input}". Use English OSIS ids or names: ${preview(e.validIds)}`;
    case 'malformed_reference':
      return `Malformed reference "${e.input}". Use "Book chapter:verse", e.g. "Ruth 1:1"`;
    case 'chapter_out_of_range':
      return `${e.book} has no chapter ${e.chapter}. Use a chapter from 1 to ${e.max}`;
    case 'verse_out_of_range':
      return `${e.book} ${e.chapter} has no verse ${e.verse}. Use a verse from ${e.min} to ${e.max}`;
    case 'invalid_range':
      return `Range "${e.input}" ends before it starts. Use an ascending range, e.g. "Ruth 1:1-5"`;
    case 'range_not_supported':
      return `Ranges are not supported here: "${e.input}". Pass a single verse, e.g. "Ruth 1:1"`;
    case 'malformed_strong':
      return `Malformed Strong's number "${e.input}". Use H or G, then a number (up to 4 digits for H, 5 for G; zero-padding optional) and an optional sense letter, e.g. "H1254", "H7704G" or "G3056"`;
    case 'unknown_strong':
      return e.senses === undefined || e.senses.length === 0
        ? `Strong's number "${e.input}" was not found. Check the number or try search_lexicon`
        : `Strong's number "${e.input}" was not found. Its base number has the senses ${e.senses.join(', ')}; use one of them or try search_lexicon`;
    case 'unknown_morph_code':
      return `Morphology code "${e.input}"${e.within === undefined ? '' : ` (in "${e.within}")`} was not found. Use a full code as get_original shows it with morphology: true, e.g. "V-AAI-3S" or "HVqw3ms"; brief lexical codes such as "G:N-M" are not explained`;
    case 'scope_wrong_testament':
      return e.testament === 'NT'
        ? `Strong's number "${e.input}" is Greek and occurs only in the New Testament, but the scope "${e.scope}" is in the Old Testament. Use scope "NT", a New Testament book or chapter such as "John 1", or leave scope out`
        : `Strong's number "${e.input}" is Hebrew and occurs only in the Old Testament, but the scope "${e.scope}" is in the New Testament. Use scope "OT", an Old Testament book or chapter such as "Ruth 2", or leave scope out`;
    case 'invalid_scope':
      return `Invalid scope "${e.input}". Use one of: ${e.allowed.join(', ')}`;
    default:
      return e satisfies never;
  }
};
