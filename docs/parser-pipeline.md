# Parser pipeline

TimetableKit processes input through these stages:

1. Validate the input kind and configured limits.
2. Extract text or receive text from an explicitly configured local provider.
3. Normalize Unicode, whitespace, separators, and line endings.
4. Segment list or grid-like rows.
5. Recognize weekdays, dates, and time ranges.
6. Assemble candidate events.
7. Normalize locale aliases and canonical values.
8. Merge exact duplicates while retaining likely duplicates as warnings.
9. Validate required fields and term boundaries.
10. Detect overlaps and calculate confidence. Conflict output is bounded at
    1,000 entries and reports a `CONFLICT_LIMIT` warning when truncated.
11. Run optional recovery only for unresolved fields after consent.
12. Validate the final versioned result and expose export-ready data.

Each stage reports progress for provider-backed work. The deterministic path is repeatable and does not perform network access.
