# API reference

The public package is `@ndycode/timetablekit`. The stable entry points are `parseTimetable`, `createTimetableParser`, `deterministicProvider`, `validateTimetable`, `detectConflicts`, `toJSON`, `toCSV`, and `toICS`.

The parser returns schema version `1.0`. Dates use `YYYY-MM-DD`, times use local `HH:mm`, weekdays use RFC 5545 two-letter values, and timezones use IANA names. See [architecture](architecture.md) for the domain boundary and [export semantics](exports.md) for serialization rules.

Binary providers and remote recovery are optional. The core package stays independent of React, Next.js, Node filesystem APIs, OCR libraries, PDF.js, and network clients.
