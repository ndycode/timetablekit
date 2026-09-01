# TimetableKit Node example

This example uses the public `@ndycode/timetablekit` API from Node.js.

From the repository root, build the core package first:

```bash
pnpm --filter @ndycode/timetablekit build
cd examples/node
pnpm install --ignore-workspace
pnpm start
```

The example keeps its input in the process and prints the normalized JSON result. The local `file:` dependency lets the example run against this workspace without requiring a published package.
