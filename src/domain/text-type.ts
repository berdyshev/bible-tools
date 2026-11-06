/** True for the Nestlé-Aland text of the Greek New Testament: the word type contains N or n. */
export const isNestleAland = (textType: string): boolean => /[Nn]/.test(textType);
