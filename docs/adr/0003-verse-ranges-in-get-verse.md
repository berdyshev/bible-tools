# 0003. Verse ranges in get_verse

## Status

Accepted

## Context

Checking a term across a passage with a single-verse tool takes one call per verse. Tool output is re-sent on every agent step, so a passage tool must also bound its output.

## Decision

- `get_verse` accepts a verse (`Ruth 1:2`), a range (`Ruth 1:1-5`, or across chapters, `Ruth 1:20-2:3`) or a whole chapter (`Ruth 1`). There is no separate `get_passage` tool.
- A range must ascend; a descending range is an input error with a fix hint.
- Output of a range or chapter is grouped by verse, each verse under a `Ruth 1:2` sub-header, with the same word-line format as a single verse. A single verse keeps its existing output.
- Output is capped at 10 verses and 2,000 characters. The cap is applied at a verse boundary and the first verse is always returned. A cut-off passage ends with `truncated — call get_verse again with "Ruth 1:7-12"`, naming the remainder of the requested passage.
- The description documents the range format, the cap and the absence of `get_passage`.

## Alternatives

- A separate `get_passage` tool: a second tool to choose between, with a duplicated description and schema, for identical output.
- Returning the whole passage regardless of size: unbounded output re-sent on every agent step.
- Truncating mid-verse: leaves a continuation point that is not a valid reference.

## Consequences

- The reference parser has a passage variant (`verse`, `range`, `chapter`) next to the verse variant; `parseRef` still accepts single verses only.
- A passage of long verses returns fewer than 10 verses per call, so a chapter takes several calls.

## Follow-ups

- Revisit the character cap if clients report truncation that is too aggressive.
