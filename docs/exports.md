# Export semantics

The core package implements all three exporters. Each exporter consumes the normalized result after a caller has reviewed or corrected it.

## Normalized JSON

JSON preserves the versioned timetable schema, normalized local date and time values, timezone, recurrence range, optional metadata, confidence, warnings, conflicts, and source references. Keys are emitted in a stable order and pretty output is available for inspection.

## CSV

CSV uses a fixed UTF-8 header order and CRLF line endings. Every field is escaped according to CSV rules. A row represents one normalized event. Empty optional values remain empty rather than being replaced with guessed text.

## iCalendar

The `.ics` exporter emits RFC 5545-compatible VCALENDAR output. Each event has a stable UID, a valid `DTSTART`, a valid `DTEND`, and a `VTIMEZONE` block for the selected IANA timezone. Text values escape commas, semicolons, backslashes, and line breaks. Lines are folded at the format boundary. Weekly events use `RRULE:FREQ=WEEKLY` when a valid term range is available. Exact-date events emit concrete dates.

## Time and recurrence rules

The caller supplies a timezone. Local wall-clock input is not silently interpreted in the machine's timezone. If a schedule has only a weekday, the export uses the supplied term or recurrence range to create concrete events. Invalid ranges and end times before start times are rejected before export.

## Verification required

JSON, CSV, and iCalendar have independent unit tests, fixture comparisons, parser-to-export integration tests, and a clean-package consumer smoke check. The exact release evidence is recorded in [the quality report](quality-report.md).
