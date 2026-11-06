/** Trailing marks the Greek text carries on a word: comma, full stop, semicolon, colon, middle dot, question mark, exclamation mark, paragraph sign. */
const TRAILING_MARKS = /[,.;:!?··;¶]+$/u;

/**
 * The word without its trailing punctuation, so that `λόγος,` and `λόγος.` count as one form. Letters,
 * accents, elision marks and Hebrew punctuation (sof pasuq, maqaf) are kept.
 */
export const stripTrailingPunctuation = (text: string): string => text.replace(TRAILING_MARKS, '');
