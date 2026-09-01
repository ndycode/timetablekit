# Adding a parser dialect

1. Describe the input layout with synthetic or redistributable data.
2. Add locale aliases or recognition rules at the data boundary.
3. Add a fixture manifest and exact expected normalized output.
4. Add focused tests for success, partial rows, ambiguity, and unsafe values.
5. Run the parser, fixture, typecheck, and export tests.
6. Explain any confidence or warning behavior in the pull request.

Do not add institution-specific personal data. Prefer a small rule that composes with existing normalization over a parser branch that duplicates validation.
