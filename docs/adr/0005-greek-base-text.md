# 0005. Greek base text

## Status

Accepted

## Context

TAGNT, the STEPBible word-per-line Greek New Testament, is an amalgam of the Nestlé-Aland text (NA), the traditional text behind the KJV (Textus Receptus and Byzantine) and a few other editions. Each word line carries a type after the reference (`Jhn.1.1#01=NKO`) that records which families have the word: `N` for NA, `K` for the traditional text, `O` for other editions; lower case marks differences too small to change a translation. The file holds 142,095 words; the types seen are `NKO`, `N(k)O`, `K`, `k`, `no`, `KO`, `NK(o)` and a few more.

A tool that returned every word of every edition would print variant readings next to each other and make a verse unreadable. A tool that returned only NA words would silently lose widely cited verses that NA omits (`John 5:4`, `John 7:53-8:11`, `Mark 16:9-20`, `Acts 8:37`).

## Decision

Each verse is stored as a single reading, chosen per verse by a pure function (`baseText` in `src/ingest/tagnt.ts`):

1. Keep the words whose type contains `N` or `n`.
2. If the verse has none, keep its words whose type contains `K` or `k`.
3. If it has neither, keep all of its words.

Words are grouped by consecutive reference; the loader applies the rule to each group.

Measured on the pinned data revision:

| | Count |
| --- | ---: |
| Words in TAGNT | 142,095 |
| Words stored | 138,211 |
| Words with `N` or `n` (the NA text) | 137,645 |
| Verses | 7,958 |
| Verses without any NA word (shown from the traditional text) | 40 |
| Words stored for those verses | 566 |
| Verses with neither NA nor traditional words | 0 |

The 40 verses include `Matthew 17:21`, `Matthew 23:14`, `Mark 15:28`, `Mark 16:9-20`, `Luke 23:17`, `John 5:4`, `John 7:53-8:11`, `Acts 8:37` and `Romans 16:24`. Rule 3 is not reached on this data; it keeps a verse from vanishing if a later revision has one.

`get_original` shows the line `Not in the Nestlé-Aland text; shown from the traditional text.` right after the heading of such a verse. The condition is that none of the verse's stored words has an `N` or `n` type, so it needs no extra column. Old Testament verses never get the note: Hebrew word types contain no `N`.

Word text is stored as the source gives it, trailing punctuation included (`λόγος,`). `get_original` prints it unchanged; `find_occurrences` and `get_names` strip trailing marks when they compare or show forms.

## Alternatives

- All words of all editions: unreadable verses and double counts in `find_occurrences`.
- NA words only: drops the 40 verses above, which readers look up by reference and expect to find.
- A column marking each word's edition and a parameter to choose one: more schema and a second axis in every tool for a need nobody has expressed. The type is already stored in `text_type`, so this stays possible.

## Consequences

- Counts are for the chosen reading, not for the words of any one edition; the 566 traditional-text words sit beside the NA words in the New Testament totals.
- Variants inside a verse that has NA words are not shown. A user who needs them reads the source file.
- A word compounded with another in TAGNT (`G1473=P-1NS + G2532=CONJ`, 250 stored words, 246 of them NA) is stored with its first part as `strong`, the other Strong's numbers in `suffixes`, and the full `strongRaw` and `morphRaw` text. `find_occurrences` matches `strong` and `strong_base` only, so a compounded word counts under its first part: `G2532` (and) does not find the `καὶ` inside `κἀγώ`. `explain_morphology` explains every part of a compound code.
- The loader, not the parser, applies the rule, so the parser stays a per-line function and the rule is unit-tested without a database.

## Follow-ups

- Revisit if a user needs another edition (a parameter that selects by `text_type`).
- Count the second parts of compounds if searches by common function words matter.
