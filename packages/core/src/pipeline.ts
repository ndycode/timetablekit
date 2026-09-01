import { DEFAULT_MAX_CONFLICTS, detectConflictsBounded } from "./conflicts.js";
import { TimetableError, ProviderError } from "./errors.js";
import { createLocaleRegistry, EN_PH_LOCALE } from "./locale/registry.js";
import { normalizeCandidates } from "./normalization.js";
import {
  applyRecoveryPatches,
  eventFieldValue,
  isRecoveryResponse,
} from "./recovery.js";
import { parseCsvCandidates } from "./parser/csv-rows.js";
import { parseDocument } from "./parser/rows.js";
import { makeWarning } from "./parser/warnings.js";
import {
  TimetableInputSchema,
  TimetableParseResultSchema,
} from "./schema/runtime.js";
import { validateTimetable } from "./validation.js";
import type {
  ExtractionArtifact,
  EventField,
  LocaleDefinition,
  ParseOptions,
  ParseStage,
  ParseStageReport,
  ParseWarning,
  RecoveryRequest,
  TimetableInput,
  TimetableParseResult,
  TimetableParser,
  TimetableParserConfig,
  TimetableEvent,
  UnresolvedField,
} from "./schema/types.js";
import {
  createProviderContext,
  deterministicProvider,
  inputByteLength,
  isExtractionArtifact,
  providerWarning,
  resolveLimits,
  sourceDescriptor,
  stageProgress,
} from "./providers.js";

const STAGES: readonly ParseStage[] = [
  "preflight",
  "extract",
  "normalize",
  "segment",
  "recognize",
  "assemble",
  "locale",
  "deduplicate",
  "validate",
  "conflicts",
  "confidence",
  "recovery",
  "finalize",
];

function appendAll<T>(target: T[], values: readonly T[]): void {
  for (const value of values) target.push(value);
}

function replaceAll<T>(target: T[], values: readonly T[]): void {
  target.length = 0;
  appendAll(target, values);
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new TimetableError("ABORTED", "Parsing was aborted.");
  }
}

function stageReport(
  stage: ParseStage,
  status: ParseStageReport["status"],
  startedAt: number,
  warningCount: number,
  providerId?: string,
): ParseStageReport {
  return providerId === undefined
    ? {
        stage,
        status,
        durationMs: Math.max(0, Date.now() - startedAt),
        warningCount,
      }
    : {
        stage,
        status,
        durationMs: Math.max(0, Date.now() - startedAt),
        warningCount,
        providerId,
      };
}

function parseOptions(options: ParseOptions | undefined): ParseOptions {
  return options ?? { locale: "en-PH", timezone: "UTC", evidence: "locations" };
}

function localeFor(
  registry: ReturnType<typeof createLocaleRegistry>,
  id: string,
  warnings: ParseWarning[],
): LocaleDefinition {
  try {
    return registry.get(id);
  } catch (error) {
    if (!(error instanceof TimetableError)) {
      throw error;
    }
    warnings.push(
      makeWarning({
        code: "UNKNOWN_LOCALE",
        severity: "warning",
        message: "The requested locale is not registered.",
        details: { locale: id },
      }),
    );
    return EN_PH_LOCALE;
  }
}

function sourceWithPageCount(
  input: TimetableInput,
  artifact: ExtractionArtifact | undefined,
): ReturnType<typeof sourceDescriptor> {
  const source = sourceDescriptor(input);
  const pageCount = artifact?.document.pages.length;
  if (pageCount === undefined || pageCount <= 0) {
    return source;
  }
  return { ...source, pageCount };
}

function unsupportedResult(
  input: TimetableInput,
  options: ParseOptions,
  warnings: readonly ParseWarning[],
  stageReports: readonly ParseStageReport[],
  durationMs: number,
): TimetableParseResult {
  const result: TimetableParseResult = {
    schemaVersion: "1.0",
    source: sourceDescriptor(input),
    timezone: options.timezone,
    locale: options.locale,
    ...(options.term === undefined ? {} : { term: options.term }),
    events: [],
    warnings,
    conflicts: [],
    parse: {
      durationMs,
      deterministicConfidence: 0,
      aiRecoveryUsed: false,
      providersUsed: [],
      stageReports,
    },
  };
  return TimetableParseResultSchema.parse(result);
}

async function extract(
  input: TimetableInput,
  providers: readonly import("./schema/types.js").ExtractionProvider[],
  signal: AbortSignal,
  limits: ReturnType<typeof resolveLimits>,
  reportProgress: (
    stage: ParseStage,
    message: string,
    completed: number,
    total?: number,
  ) => void,
  warnings: ParseWarning[],
): Promise<{
  readonly artifact?: ExtractionArtifact;
  readonly providerId?: string;
}> {
  let foundProvider = false;
  for (const provider of providers) {
    abortIfNeeded(signal);
    let supports = false;
    try {
      supports = provider.supports(input);
    } catch (error) {
      if (error instanceof TimetableError && error.code === "ABORTED")
        throw error;
      warnings.push(
        makeWarning({
          code: "PROVIDER_FAILED",
          severity: "warning",
          message: "An extraction provider could not inspect this source.",
          details: { provider: provider.id },
        }),
      );
      continue;
    }
    if (!supports) continue;
    foundProvider = true;
    try {
      const context = createProviderContext(signal, limits, (progress) =>
        reportProgress(
          progress.stage,
          progress.message,
          progress.completed,
          progress.total,
        ),
      );
      const value = await provider.extract(input, context);
      abortIfNeeded(signal);
      if (!isExtractionArtifact(value)) {
        warnings.push(
          makeWarning({
            code: "PROVIDER_OUTPUT_INVALID",
            severity: "warning",
            message: "An extraction provider returned invalid output.",
            details: { provider: provider.id },
          }),
        );
        continue;
      }
      warnings.push(...value.warnings);
      return { artifact: value, providerId: value.providerId };
    } catch (error) {
      if (error instanceof ProviderError && error.providerCode === "ABORTED")
        throw new TimetableError("ABORTED", "Parsing was aborted.");
      if (error instanceof TimetableError && error.code === "ABORTED")
        throw error;
      const mapped = providerWarning(error, provider.id);
      warnings.push(
        makeWarning({
          code: mapped.code,
          severity: "warning",
          message: mapped.message,
          details: { provider: provider.id },
        }),
      );
    }
  }
  if (!foundProvider) {
    warnings.push(
      makeWarning({
        code: "UNSUPPORTED_PROVIDER",
        severity: "error",
        message: "No configured provider supports this source.",
        details: { source: input.kind },
      }),
    );
  }
  return {};
}

function unresolvedFields(
  events: readonly TimetableEvent[],
  warnings: readonly ParseWarning[],
): readonly UnresolvedField[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const seen = new Set<string>();
  const unresolved: UnresolvedField[] = [];
  for (const warning of warnings) {
    if (warning.eventId === undefined || warning.field === undefined) continue;
    const event = byId.get(warning.eventId);
    if (event === undefined) continue;
    const key = `${event.id}:${warning.field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unresolved.push({
      eventId: event.id,
      field: warning.field,
      candidateText: eventFieldValue(event, warning.field),
      evidence: event.evidence[warning.field] ?? [],
    });
  }
  return unresolved;
}

function conflictWarnings(
  conflicts: ReturnType<typeof detectConflictsBounded>["conflicts"],
): readonly ParseWarning[] {
  return conflicts.map((conflict) =>
    makeWarning({
      code: "SCHEDULE_CONFLICT",
      severity: "error",
      message: "Two events overlap on the same occurrence.",
      details: { conflictId: conflict.id },
    }),
  );
}

function conflictLimitWarning(): ParseWarning {
  return makeWarning({
    code: "CONFLICT_LIMIT",
    severity: "warning",
    message: "Conflict detection was limited by resource bounds.",
    details: { limit: DEFAULT_MAX_CONFLICTS },
  });
}

function confidence(events: readonly TimetableEvent[]): number {
  if (events.length === 0) return 0;
  return (
    events.reduce((sum, event) => sum + event.confidence, 0) / events.length
  );
}

function removePatchedWarnings(
  warnings: readonly ParseWarning[],
  patches: readonly { readonly eventId: string; readonly field: EventField }[],
): readonly ParseWarning[] {
  const patched = new Set(
    patches.map((patch) => `${patch.eventId}:${patch.field}`),
  );
  return warnings.filter(
    (warning) =>
      warning.eventId === undefined ||
      warning.field === undefined ||
      !patched.has(`${warning.eventId}:${warning.field}`),
  );
}

export function createTimetableParser(
  config: TimetableParserConfig = {},
): TimetableParser {
  const providers = config.providers ?? [deterministicProvider()];
  const registry = config.localeRegistry ?? createLocaleRegistry();
  const configuredLimits = resolveLimits(config.limits);
  return {
    async parse(
      input: TimetableInput,
      suppliedOptions?: ParseOptions,
    ): Promise<TimetableParseResult> {
      const startedAt = Date.now();
      TimetableInputSchema.parse(input);
      const options = parseOptions(suppliedOptions);
      const signal = options.signal ?? new AbortController().signal;
      abortIfNeeded(signal);
      const warnings: ParseWarning[] = [];
      const reports: ParseStageReport[] = [];
      const reportProgress = (
        stage: ParseStage,
        message: string,
        completed: number,
        total?: number,
      ): void => {
        abortIfNeeded(signal);
        options.onProgress?.(stageProgress(stage, message, completed, total));
      };
      const preflightAt = Date.now();
      reportProgress("preflight", "Checking input limits and options.", 1, 1);
      const limits = resolveLimits({ ...configuredLimits, ...options.limits });
      if (inputByteLength(input) > limits.maxInputBytes) {
        warnings.push(
          makeWarning({
            code: "FILE_TOO_LARGE",
            severity: "error",
            message: "The input exceeds the configured size limit.",
          }),
        );
        reports.push(stageReport("preflight", "completed", preflightAt, 1));
        reports.push(stageReport("extract", "skipped", Date.now(), 1));
        reports.push(
          stageReport("finalize", "completed", Date.now(), warnings.length),
        );
        return unsupportedResult(
          input,
          options,
          warnings,
          reports,
          Math.max(0, Date.now() - startedAt),
        );
      }
      reports.push(
        stageReport("preflight", "completed", preflightAt, warnings.length),
      );
      const extractionAt = Date.now();
      reportProgress("extract", "Selecting a local extraction provider.", 0, 1);
      const extraction = await extract(
        input,
        providers,
        signal,
        limits,
        reportProgress,
        warnings,
      );
      reports.push(
        stageReport(
          "extract",
          extraction.artifact === undefined ? "failed" : "completed",
          extractionAt,
          warnings.length,
          extraction.providerId,
        ),
      );
      if (extraction.artifact === undefined) {
        reports.push(
          ...STAGES.filter(
            (stage) =>
              !reports.some((entry) => entry.stage === stage) &&
              stage !== "finalize",
          ).map((stage) => stageReport(stage, "skipped", Date.now(), 0)),
        );
        reports.push(
          stageReport("finalize", "completed", Date.now(), warnings.length),
        );
        return unsupportedResult(
          input,
          options,
          warnings,
          reports,
          Math.max(0, Date.now() - startedAt),
        );
      }
      const artifact = extraction.artifact;
      if (
        artifact.document.pages.length === 0 ||
        artifact.document.pages.every((page) =>
          page.lines.every((line) => line.text.trim().length === 0),
        )
      ) {
        warnings.push(
          makeWarning({
            code: "NO_TEXT_FOUND",
            severity: "warning",
            message: "The extraction provider returned no usable text.",
          }),
        );
      }
      const locale = localeFor(registry, options.locale, warnings);
      const evidenceMode = options.evidence ?? "locations";
      const parseAt = Date.now();
      const parsed =
        input.kind === "csv"
          ? parseCsvCandidates(input.text, locale, input.delimiter)
          : parseDocument(artifact.document, locale);
      appendAll(warnings, parsed.warnings);
      reports.push(
        stageReport("normalize", "completed", parseAt, parsed.warnings.length),
      );
      reports.push(stageReport("segment", "completed", parseAt, 0));
      reports.push(stageReport("recognize", "completed", parseAt, 0));
      reports.push(stageReport("assemble", "completed", parseAt, 0));
      reports.push(stageReport("locale", "completed", parseAt, 0));
      const normalized = normalizeCandidates(
        parsed.candidates,
        sourceWithPageCount(input, artifact),
        evidenceMode,
        options.term,
        options.timezone,
      );
      appendAll(warnings, normalized.warnings);
      reports.push(
        stageReport(
          "deduplicate",
          "completed",
          Date.now(),
          normalized.warnings.length,
        ),
      );
      let events = normalized.events;
      let validation = validateAndConflicts(events, options, warnings);
      events = validation.events;
      replaceAll(warnings, validation.warnings);
      reports.push(
        stageReport(
          "validate",
          "completed",
          Date.now(),
          validation.validationWarnings.length,
        ),
      );
      reports.push(
        stageReport(
          "conflicts",
          "completed",
          Date.now(),
          validation.conflicts.length,
        ),
      );
      reports.push(stageReport("confidence", "completed", Date.now(), 0));
      let aiRecoveryUsed = false;
      const recoveryAt = Date.now();
      const recoveryOptions = options.recovery;
      const unresolved = unresolvedFields(events, warnings);
      if (unresolved.length > 0 && recoveryOptions?.enabled === true) {
        if (recoveryOptions.consent !== true) {
          warnings.push(
            makeWarning({
              code: "AI_RECOVERY_SKIPPED",
              severity: "info",
              message:
                "AI recovery was not used because consent was not provided.",
            }),
          );
        } else if (config.recoveryProvider === undefined) {
          warnings.push(
            makeWarning({
              code: "AI_PROVIDER_UNAVAILABLE",
              severity: "warning",
              message:
                "AI recovery is enabled but no recovery provider is configured.",
            }),
          );
        } else {
          const requestedUnresolved = unresolved.slice(
            0,
            recoveryOptions.maxFields ?? 8,
          );
          const requestedFields = new Set(
            requestedUnresolved.map(
              (field) => `${field.eventId}:${field.field}`,
            ),
          );
          const request: RecoveryRequest = {
            schemaVersion: "1.0",
            locale: options.locale,
            timezone: options.timezone,
            unresolved: requestedUnresolved,
          };
          try {
            const context = createProviderContext(signal, limits, (progress) =>
              reportProgress(
                progress.stage,
                progress.message,
                progress.completed,
                progress.total,
              ),
            );
            const response = await config.recoveryProvider.recover(
              request,
              context,
            );
            abortIfNeeded(signal);
            if (!isRecoveryResponse(response)) {
              warnings.push(
                makeWarning({
                  code: "AI_OUTPUT_INVALID",
                  severity: "warning",
                  message: "The recovery provider returned invalid output.",
                }),
              );
            } else {
              const allowedPatches = response.patches.filter((patch) =>
                requestedFields.has(`${patch.eventId}:${patch.field}`),
              );
              const applied = applyRecoveryPatches(events, {
                patches: allowedPatches,
              });
              if (
                applied.invalid > 0 ||
                allowedPatches.length !== response.patches.length
              )
                warnings.push(
                  makeWarning({
                    code: "AI_OUTPUT_INVALID",
                    severity: "warning",
                    message: "Some recovery patches were rejected.",
                  }),
                );
              events = applied.events;
              aiRecoveryUsed = true;
              replaceAll(
                warnings,
                removePatchedWarnings(warnings, applied.appliedPatches),
              );
              validation = validateAndConflicts(events, options, warnings);
              events = validation.events;
              replaceAll(warnings, validation.warnings);
            }
          } catch (error) {
            if (
              error instanceof ProviderError &&
              error.providerCode === "ABORTED"
            )
              throw new TimetableError("ABORTED", "Parsing was aborted.");
            if (error instanceof TimetableError && error.code === "ABORTED")
              throw error;
            warnings.push(
              makeWarning({
                code: "AI_PROVIDER_UNAVAILABLE",
                severity: "warning",
                message: "The recovery provider was unavailable.",
              }),
            );
          }
        }
      }
      reports.push(
        stageReport(
          "recovery",
          "completed",
          recoveryAt,
          warnings.length,
          aiRecoveryUsed ? config.recoveryProvider?.id : undefined,
        ),
      );
      const finalAt = Date.now();
      const providersUsed =
        extraction.providerId === undefined
          ? []
          : [
              extraction.providerId,
              ...(aiRecoveryUsed && config.recoveryProvider !== undefined
                ? [config.recoveryProvider.id]
                : []),
            ];
      const result: TimetableParseResult = {
        schemaVersion: "1.0",
        source: sourceWithPageCount(input, artifact),
        timezone: options.timezone,
        locale: options.locale,
        ...(options.term === undefined ? {} : { term: options.term }),
        events,
        warnings: warnings.sort(compareWarnings),
        conflicts: validation.conflicts,
        parse: {
          durationMs: Math.max(0, finalAt - startedAt),
          deterministicConfidence: confidence(events),
          aiRecoveryUsed,
          providersUsed,
          stageReports: [
            ...reports,
            stageReport("finalize", "completed", finalAt, warnings.length),
          ],
        },
      };
      return TimetableParseResultSchema.parse(result);
    },
  };
}

function validateAndConflicts(
  events: readonly TimetableEvent[],
  options: ParseOptions,
  existing: readonly ParseWarning[],
): {
  readonly events: readonly TimetableEvent[];
  readonly warnings: ParseWarning[];
  readonly validationWarnings: readonly ParseWarning[];
  readonly conflicts: ReturnType<typeof detectConflictsBounded>["conflicts"];
} {
  const validationWarnings = validateTimetable(events, {
    timezone: options.timezone,
    ...(options.term === undefined ? {} : { term: options.term }),
  });
  const detected = detectConflictsBounded(
    events,
    options.term === undefined
      ? { maxConflicts: DEFAULT_MAX_CONFLICTS }
      : { term: options.term, maxConflicts: DEFAULT_MAX_CONFLICTS },
  );
  const warnings = [
    ...existing.filter(
      (warning) =>
        warning.code !== "SCHEDULE_CONFLICT" &&
        warning.code !== "CONFLICT_LIMIT",
    ),
    ...validationWarnings,
    ...conflictWarnings(detected.conflicts),
  ];
  if (detected.truncated) warnings.push(conflictLimitWarning());
  return {
    events,
    warnings,
    validationWarnings,
    conflicts: detected.conflicts,
  };
}

function compareWarnings(left: ParseWarning, right: ParseWarning): number {
  return [
    left.code,
    left.eventId ?? "",
    left.field ?? "",
    left.source?.line ?? 0,
    left.message,
  ]
    .join("\u001f")
    .localeCompare(
      [
        right.code,
        right.eventId ?? "",
        right.field ?? "",
        right.source?.line ?? 0,
        right.message,
      ].join("\u001f"),
    );
}

export async function parseTimetable(
  input: TimetableInput,
  options?: ParseOptions,
): Promise<TimetableParseResult> {
  return createTimetableParser().parse(input, options);
}
