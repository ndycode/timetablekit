# Adding a fixture

Fixtures must be synthetic or have explicit redistribution permission. A fixture has an input file, a manifest, expected normalized JSON, and a provenance note.

Create text fixture files with `pnpm fixture:new <id> --kind text`. Use `--kind csv` for a CSV fixture. Replace the generated input and expected output. Then run:

```sh
pnpm fixtures:validate
pnpm --filter @ndycode/timetablekit test
```

Give each fixture a stable identifier. Keep the expected JSON deterministic. Runtime duration and OCR confidence are not exact golden fields unless the test explicitly permits a tolerance.

Never include real names, student numbers, addresses, private URLs, credentials, or copied schedules. Review the fixture with the secret and privacy checks before opening a pull request.
