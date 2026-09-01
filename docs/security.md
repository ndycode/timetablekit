# Security model

The primary threat is untrusted timetable content entering a parser, browser, download, or optional remote provider.

The local path accepts no remote URLs, applies input and resource limits, treats PDF text as data, sanitizes download names, escapes CSV and iCalendar values, and does not persist uploads. The web surface uses security headers and does not expose secrets to the browser. Remote recovery is opt-in, sends minimal unresolved fields, uses a strict schema, and reports provider failure without breaking local parsing.

The project does not promise third-party provider retention behavior. Review the provider terms before enabling remote recovery. Report vulnerabilities privately as described in [SECURITY.md](../SECURITY.md).
