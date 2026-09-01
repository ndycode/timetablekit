# Adding a fixture

Fixtures must be synthetic or have explicit redistribution permission. A fixture has an input file, a manifest, expected normalized JSON, and a provenance note.

Use `pnpm fixture:new` when the helper is available. Give each fixture a stable identifier. Keep the expected JSON deterministic. Runtime duration and OCR confidence are not exact golden fields unless the test explicitly permits a tolerance.

Never include real names, student numbers, addresses, private URLs, credentials, or copied schedules. Review the fixture with the secret and privacy checks before opening a pull request.
