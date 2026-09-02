import { DEFAULT_MAX_CONFLICTS, detectConflictsBounded } from "./conflicts.js";
import {
  createParseDeadline,
  DeadlineTimeoutError,
  type ParseDeadline,
} from "./deadline.js";
import {
  OptionsValidationError,
  TimetableError,
  ProviderError,
} from "./errors.js";
import { createLocaleRegistry, EN_PH_LOCALE } from "./locale/registry.js";
import { normalizeCandidates } from "./normalization.js";
import {
  applyRecoveryPatches,
  eventFieldValue,
  recoveryResponseByteLength,
} from "./recovery.js";
import { parseCsvCandidates } from "./parser/csv-rows.js";
import { parseDocument } from "./parser/rows.js";
import { makeWarning } from "./parser/warnings.js";
import {
  TimetableInputSchema,
  ParseOptionsSchema,
  RecoveryResponseSchema,
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
  RecoveryProvider,
  RecoveryResponse,
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
  extractionArtifactByteLength,
  inputByteLength,
  parseExtractionArtifact,
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

function callerSignalAborted(signal: AbortSignal): boolean {
  try {
    return signal.aborted;
  } catch {
    throw new OptionsValidationError();
  }
}

function abortIfNeeded(signal: AbortSignal): void {
  const aborted = callerSignalAborted(signal);
  if (aborted) {
    throw new TimetableError("ABORTED", "Parsing was aborted.");
  }
}

function timeoutWarning(error: DeadlineTimeoutError): ParseWarning {
  return makeWarning({
    code: "PROVIDER_TIMEOUT",
    severity: "warning",
    message: error.message,
    details: error.details,
  });
}

function providerIdOf(value: unknown): string | undefined {
  try {
    if (typeof value !== "object" || value === null) return undefined;
    const candidate = (value as { readonly id?: unknown }).id;
    return typeof candidate === "string" && candidate.length > 0
      ? candidate
      : undefined;
  } catch {
    return undefined;
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

function parseOptions(options: unknown): ParseOptions {
  if (options === undefined) {
    return { locale: "en-PH", timezone: "UTC", evidence: "locations" };
  }
  try {
    return ParseOptionsSchema.parse(options);
  } catch (error) {
    if (error instanceof OptionsValidationError) throw error;
    throw new OptionsValidationError();
  }
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

function documentText(artifact: ExtractionArtifact): string {
  return artifact.document.pages
    .flatMap((page) => page.lines.map((line) => line.text))
    .join("\n");
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

function failStageReport(
  reports: ParseStageReport[],
  stage: ParseStage,
  startedAt: number,
  warningCount: number,
  providerId?: string,
): void {
  const failed = stageReport(
    stage,
    "failed",
    startedAt,
    warningCount,
    providerId,
  );
  const index = reports.findIndex((report) => report.stage === stage);
  if (index < 0) {
    reports.push(failed);
  } else {
    reports[index] = failed;
  }
}

function appendSkippedReports(reports: ParseStageReport[]): void {
  reports.push(
    ...STAGES.filter(
      (stage) =>
        !reports.some((entry) => entry.stage === stage) && stage !== "finalize",
    ).map((stage) => stageReport(stage, "skipped", Date.now(), 0)),
  );
}

function timeoutResult(
  input: TimetableInput,
  options: ParseOptions,
  warnings: ParseWarning[],
  reports: ParseStageReport[],
  startedAt: number,
  error: DeadlineTimeoutError,
  stageStartedAt: number,
): TimetableParseResult {
  warnings.push(timeoutWarning(error));
  failStageReport(
    reports,
    error.stage,
    stageStartedAt,
    warnings.length,
    error.providerId === "unknown" ? undefined : error.providerId,
  );
  appendSkippedReports(reports);
  if (!reports.some((report) => report.stage === "finalize")) {
    reports.push(
      stageReport("finalize", "completed", Date.now(), warnings.length),
    );
  }
  return unsupportedResult(
    input,
    options,
    warnings,
    reports,
    Math.max(0, Date.now() - startedAt),
  );
}

async function extract(
  input: TimetableInput,
  providers: readonly import("./schema/types.js").ExtractionProvider[],
  callerSignal: AbortSignal,
  deadline: ParseDeadline,
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
    abortIfNeeded(callerSignal);
    deadline.assertAvailable("extract", "unknown");
    const providerId = providerIdOf(provider);
    if (providerId === undefined) {
      warnings.push(
        makeWarning({
          code: "PROVIDER_FAILED",
          severity: "warning",
          message: "An extraction provider has invalid identity.",
        }),
      );
      continue;
    }
    deadline.assertAvailable("extract", providerId);
    let supports = false;
    try {
      const supported = provider.supports(input);
      if (typeof supported !== "boolean") {
        throw new TypeError("Provider support result must be boolean.");
      }
      supports = supported;
    } catch (error) {
      if (error instanceof OptionsValidationError) throw error;
      if (deadline.isExpired()) {
        throw new DeadlineTimeoutError(providerId, "extract");
      }
      if (error instanceof TimetableError && error.code === "ABORTED")
        throw error;
      warnings.push(
        makeWarning({
          code: "PROVIDER_FAILED",
          severity: "warning",
          message: "An extraction provider could not inspect this source.",
          details: { provider: providerId },
        }),
      );
      continue;
    }
    if (!supports) continue;
    foundProvider = true;
    try {
      const context = createProviderContext(
        deadline.signal,
        limits,
        (progress) =>
          reportProgress(
            progress.stage,
            progress.message,
            progress.completed,
            progress.total,
          ),
      );
      const value = await deadline.run("extract", providerId, () =>
        provider.extract(input, context),
      );
      abortIfNeeded(callerSignal);
      deadline.assertAvailable("extract", providerId);
      const artifact = parseExtractionArtifact(value, providerId, input.kind);
      if (artifact === undefined) {
        warnings.push(
          makeWarning({
            code: "PROVIDER_OUTPUT_INVALID",
            severity: "warning",
            message: "An extraction provider returned invalid output.",
            details: { provider: providerId },
          }),
        );
        continue;
      }
      const artifactBytes = extractionArtifactByteLength(artifact);
      if (artifactBytes === undefined) {
        warnings.push(
          makeWarning({
            code: "PROVIDER_OUTPUT_INVALID",
            severity: "warning",
            message: "An extraction provider returned unserializable output.",
            details: { provider: providerId },
          }),
        );
        continue;
      }
      if (artifactBytes > limits.maxOutputBytes) {
        throw new ProviderError(
          providerId,
          "RESOURCE_LIMIT",
          "Extraction output exceeds the configured output limit.",
        );
      }
      warnings.push(...artifact.warnings);
      return { artifact, providerId: artifact.providerId };
    } catch (error) {
      if (error instanceof DeadlineTimeoutError) throw error;
      if (error instanceof OptionsValidationError) throw error;
      if (error instanceof ProviderError && error.providerCode === "ABORTED") {
        if (callerSignalAborted(callerSignal))
          throw new TimetableError("ABORTED", "Parsing was aborted.");
        if (deadline.isExpired()) {
          throw new DeadlineTimeoutError(providerId, "extract");
        }
        throw new TimetableError("ABORTED", "Parsing was aborted.");
      }
      if (error instanceof TimetableError && error.code === "ABORTED") {
        if (callerSignalAborted(callerSignal)) throw error;
        if (deadline.isExpired()) {
          throw new DeadlineTimeoutError(providerId, "extract");
        }
        throw error;
      }
      if (deadline.isExpired()) {
        throw new DeadlineTimeoutError(providerId, "extract");
      }
      const mapped = providerWarning(error, providerId);
      warnings.push(
        makeWarning({
          code: mapped.code,
          severity: "warning",
          message: mapped.message,
          details: { provider: providerId },
        }),
      );
    }
  }
  deadline.assertAvailable("extract", "unknown");
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

function dedupeWarnings(warnings: readonly ParseWarning[]): ParseWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = JSON.stringify(warning);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      input = TimetableInputSchema.parse(input);
      const options = parseOptions(suppliedOptions);
      const callerSignal = options.signal ?? new AbortController().signal;
      abortIfNeeded(callerSignal);
      const limits = resolveLimits({ ...configuredLimits, ...options.limits });
      const deadline = createParseDeadline(limits.timeoutMs, callerSignal);
      const warnings: ParseWarning[] = [];
      const reports: ParseStageReport[] = [];
      const stageStartedAt = new Map<ParseStage, number>();
      let activeStage: ParseStage = "preflight";
      let activeStageAt = startedAt;
      const beginStage = (stage: ParseStage): void => {
        activeStage = stage;
        activeStageAt = Date.now();
        stageStartedAt.set(stage, activeStageAt);
      };
      try {
        const reportProgress = (
          stage: ParseStage,
          message: string,
          completed: number,
          total?: number,
        ): void => {
          abortIfNeeded(callerSignal);
          if (deadline.signal.aborted || deadline.isExpired()) return;
          options.onProgress?.(stageProgress(stage, message, completed, total));
        };
        beginStage("preflight");
        const preflightAt = activeStageAt;
        reportProgress("preflight", "Checking input limits and options.", 1, 1);
        const inputBytes = inputByteLength(input);
        deadline.assertAvailable("preflight");
        if (inputBytes > limits.maxInputBytes) {
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
        beginStage("extract");
        const extractionAt = activeStageAt;
        let extraction: Awaited<ReturnType<typeof extract>>;
        try {
          reportProgress(
            "extract",
            "Selecting a local extraction provider.",
            0,
            1,
          );
          extraction = await extract(
            input,
            providers,
            callerSignal,
            deadline,
            limits,
            reportProgress,
            warnings,
          );
        } catch (error) {
          if (!(error instanceof DeadlineTimeoutError)) throw error;
          return timeoutResult(
            input,
            options,
            warnings,
            reports,
            startedAt,
            error,
            stageStartedAt.get("extract") ?? extractionAt,
          );
        }
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
        beginStage("normalize");
        const normalizeAt = activeStageAt;
        deadline.assertAvailable("normalize");
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
        deadline.assertAvailable("normalize");
        const parseAt = normalizeAt;
        const parsed =
          input.kind === "csv"
            ? parseCsvCandidates(
                documentText(artifact),
                locale,
                input.delimiter,
              )
            : parseDocument(artifact.document, locale);
        appendAll(warnings, parsed.warnings);
        deadline.assertAvailable("normalize");
        reports.push(
          stageReport(
            "normalize",
            "completed",
            parseAt,
            parsed.warnings.length,
          ),
        );
        reports.push(stageReport("segment", "completed", parseAt, 0));
        reports.push(stageReport("recognize", "completed", parseAt, 0));
        reports.push(stageReport("assemble", "completed", parseAt, 0));
        reports.push(stageReport("locale", "completed", parseAt, 0));
        beginStage("deduplicate");
        const deduplicateAt = activeStageAt;
        deadline.assertAvailable("deduplicate");
        const normalized = normalizeCandidates(
          parsed.candidates,
          sourceWithPageCount(input, artifact),
          evidenceMode,
          options.term,
          options.timezone,
        );
        appendAll(warnings, normalized.warnings);
        deadline.assertAvailable("deduplicate");
        reports.push(
          stageReport(
            "deduplicate",
            "completed",
            deduplicateAt,
            normalized.warnings.length,
          ),
        );
        let events = normalized.events;
        beginStage("validate");
        let validation = validateAndConflicts(
          events,
          options,
          warnings,
          deadline,
          beginStage,
          (warningCount) => {
            if (reports.some((report) => report.stage === "validate")) return;
            reports.push(
              stageReport(
                "validate",
                "completed",
                stageStartedAt.get("validate") ?? activeStageAt,
                warningCount,
              ),
            );
          },
        );
        events = validation.events;
        replaceAll(warnings, dedupeWarnings(validation.warnings));
        deadline.assertAvailable("conflicts");
        if (
          events.length === 0 &&
          !warnings.some((warning) => warning.code === "NO_TEXT_FOUND")
        ) {
          warnings.push(
            makeWarning({
              code: "NO_EVENTS_FOUND",
              severity: "warning",
              message: "No timetable events were recognized from this input.",
              details: { source: input.kind },
            }),
          );
        }
        deadline.assertAvailable("conflicts");
        if (!reports.some((report) => report.stage === "conflicts")) {
          reports.push(
            stageReport(
              "conflicts",
              "completed",
              stageStartedAt.get("conflicts") ?? activeStageAt,
              validation.conflicts.length,
            ),
          );
        }
        beginStage("confidence");
        deadline.assertAvailable("confidence");
        reports.push(stageReport("confidence", "completed", activeStageAt, 0));
        let aiRecoveryUsed = false;
        beginStage("recovery");
        const recoveryAt = activeStageAt;
        const recoveryOptions = options.recovery;
        const recoveryProvider = config.recoveryProvider;
        const recoveryProviderId = providerIdOf(recoveryProvider);
        let recoveryStatus: ParseStageReport["status"] = "completed";
        let attemptedRecoveryProviderId: string | undefined;
        let deadlineFallback = false;
        const deterministicEvents = events;
        const deterministicValidation = validation;
        const deterministicWarnings = warnings.slice();
        const restoreDeterministic = (): void => {
          events = deterministicEvents;
          validation = deterministicValidation;
          aiRecoveryUsed = false;
          replaceAll(warnings, deterministicWarnings);
        };
        deadline.assertAvailable("recovery");
        const unresolved = unresolvedFields(events, warnings);
        deadline.assertAvailable("recovery");
        if (unresolved.length > 0 && recoveryOptions?.enabled === true) {
          if (recoveryOptions.consent !== true) {
            recoveryStatus = "skipped";
            warnings.push(
              makeWarning({
                code: "AI_RECOVERY_SKIPPED",
                severity: "info",
                message:
                  "AI recovery was not used because consent was not provided.",
              }),
            );
          } else if (recoveryProvider === undefined) {
            recoveryStatus = "skipped";
            warnings.push(
              makeWarning({
                code: "AI_PROVIDER_UNAVAILABLE",
                severity: "warning",
                message:
                  "AI recovery is enabled but no recovery provider is configured.",
              }),
            );
          } else if (recoveryProviderId === undefined) {
            recoveryStatus = "skipped";
            warnings.push(
              makeWarning({
                code: "AI_PROVIDER_UNAVAILABLE",
                severity: "warning",
                message:
                  "The configured recovery provider has invalid identity.",
              }),
            );
          } else {
            let recover: RecoveryProvider["recover"] | undefined;
            try {
              const candidate = (
                recoveryProvider as {
                  readonly recover?: unknown;
                }
              ).recover;
              recover =
                typeof candidate === "function"
                  ? (candidate as RecoveryProvider["recover"])
                  : undefined;
            } catch {
              recover = undefined;
            }
            if (recover === undefined) {
              recoveryStatus = "skipped";
              warnings.push(
                makeWarning({
                  code: "AI_PROVIDER_UNAVAILABLE",
                  severity: "warning",
                  message: "The configured recovery provider is unavailable.",
                }),
              );
            } else {
              attemptedRecoveryProviderId = recoveryProviderId;
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
                deadline.assertAvailable("recovery", recoveryProviderId);
                const context = createProviderContext(
                  deadline.signal,
                  limits,
                  (progress) =>
                    reportProgress(
                      progress.stage,
                      progress.message,
                      progress.completed,
                      progress.total,
                    ),
                );
                const response = await deadline.run(
                  "recovery",
                  recoveryProviderId,
                  () => recover.call(recoveryProvider, request, context),
                );
                abortIfNeeded(callerSignal);
                deadline.assertAvailable("recovery", recoveryProviderId);
                let parsedResponse: RecoveryResponse | undefined;
                try {
                  const parsed = RecoveryResponseSchema.safeParse(response);
                  if (parsed.success) parsedResponse = parsed.data;
                } catch {
                  parsedResponse = undefined;
                }
                const recoveryResponseBytes =
                  parsedResponse === undefined
                    ? undefined
                    : recoveryResponseByteLength(parsedResponse);
                deadline.assertAvailable("recovery", recoveryProviderId);
                if (
                  parsedResponse === undefined ||
                  recoveryResponseBytes === undefined ||
                  recoveryResponseBytes > limits.maxOutputBytes
                ) {
                  recoveryStatus = "failed";
                  warnings.push(
                    makeWarning({
                      code: "AI_OUTPUT_INVALID",
                      severity: "warning",
                      message: "The recovery provider returned invalid output.",
                    }),
                  );
                } else {
                  const allowedPatches = parsedResponse.patches.filter(
                    (patch) =>
                      requestedFields.has(`${patch.eventId}:${patch.field}`),
                  );
                  const applied = applyRecoveryPatches(events, {
                    patches: allowedPatches,
                  });
                  deadline.assertAvailable("recovery", recoveryProviderId);
                  if (
                    applied.invalid > 0 ||
                    allowedPatches.length !== parsedResponse.patches.length
                  )
                    warnings.push(
                      makeWarning({
                        code: "AI_OUTPUT_INVALID",
                        severity: "warning",
                        message: "Some recovery patches were rejected.",
                      }),
                    );
                  if (applied.applied > 0) {
                    events = applied.events;
                    aiRecoveryUsed = true;
                    replaceAll(
                      warnings,
                      removePatchedWarnings(warnings, applied.appliedPatches),
                    );
                    validation = validateAndConflicts(
                      events,
                      options,
                      warnings,
                      deadline,
                      beginStage,
                      (warningCount) => {
                        if (
                          reports.some((report) => report.stage === "validate")
                        )
                          return;
                        reports.push(
                          stageReport(
                            "validate",
                            "completed",
                            stageStartedAt.get("validate") ?? activeStageAt,
                            warningCount,
                          ),
                        );
                      },
                    );
                    events = validation.events;
                    replaceAll(warnings, dedupeWarnings(validation.warnings));
                    deadline.assertAvailable("conflicts");
                  }
                }
                deadline.assertAvailable("recovery", recoveryProviderId);
              } catch (error) {
                if (error instanceof OptionsValidationError) throw error;
                if (error instanceof DeadlineTimeoutError) {
                  restoreDeterministic();
                  deadlineFallback = true;
                  recoveryStatus = "failed";
                  warnings.push(timeoutWarning(error));
                } else if (
                  error instanceof ProviderError &&
                  error.providerCode === "ABORTED"
                ) {
                  if (callerSignalAborted(callerSignal))
                    throw new TimetableError("ABORTED", "Parsing was aborted.");
                  if (deadline.isExpired()) {
                    restoreDeterministic();
                    deadlineFallback = true;
                    recoveryStatus = "failed";
                    warnings.push(
                      timeoutWarning(
                        new DeadlineTimeoutError(
                          recoveryProviderId,
                          "recovery",
                        ),
                      ),
                    );
                  } else {
                    throw new TimetableError("ABORTED", "Parsing was aborted.");
                  }
                } else if (
                  error instanceof TimetableError &&
                  error.code === "ABORTED"
                ) {
                  if (callerSignalAborted(callerSignal)) throw error;
                  if (deadline.isExpired()) {
                    restoreDeterministic();
                    deadlineFallback = true;
                    recoveryStatus = "failed";
                    warnings.push(
                      timeoutWarning(
                        new DeadlineTimeoutError(
                          recoveryProviderId,
                          "recovery",
                        ),
                      ),
                    );
                  } else {
                    throw error;
                  }
                } else {
                  if (deadline.isExpired()) {
                    restoreDeterministic();
                    deadlineFallback = true;
                    recoveryStatus = "failed";
                    warnings.push(
                      timeoutWarning(
                        new DeadlineTimeoutError(
                          recoveryProviderId,
                          "recovery",
                        ),
                      ),
                    );
                  } else {
                    recoveryStatus = "failed";
                    warnings.push(
                      error instanceof ProviderError &&
                        error.providerCode === "TIMEOUT"
                        ? makeWarning({
                            code: "PROVIDER_TIMEOUT",
                            severity: "warning",
                            message: "The recovery provider timed out.",
                            details: {
                              provider: recoveryProviderId,
                              stage: "recovery",
                            },
                          })
                        : makeWarning({
                            code: "AI_PROVIDER_UNAVAILABLE",
                            severity: "warning",
                            message: "The recovery provider was unavailable.",
                          }),
                    );
                  }
                }
              }
            }
          }
        }
        if (!deadlineFallback) deadline.assertAvailable("recovery");
        reports.push(
          stageReport(
            "recovery",
            recoveryStatus,
            recoveryAt,
            warnings.length,
            attemptedRecoveryProviderId,
          ),
        );
        beginStage("finalize");
        if (!deadlineFallback) deadline.assertAvailable("finalize");
        const finalAt = Date.now();
        const providersUsed =
          extraction.providerId === undefined
            ? []
            : [
                extraction.providerId,
                ...(aiRecoveryUsed && recoveryProviderId !== undefined
                  ? [recoveryProviderId]
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
        const parsedResult = TimetableParseResultSchema.parse(result);
        if (!deadlineFallback) deadline.assertAvailable("finalize");
        return parsedResult;
      } catch (error) {
        if (!(error instanceof DeadlineTimeoutError)) throw error;
        return timeoutResult(
          input,
          options,
          warnings,
          reports,
          startedAt,
          error,
          stageStartedAt.get(error.stage) ??
            (error.stage === activeStage ? activeStageAt : Date.now()),
        );
      } finally {
        deadline.dispose();
      }
    },
  };
}

function validateAndConflicts(
  events: readonly TimetableEvent[],
  options: ParseOptions,
  existing: readonly ParseWarning[],
  deadline?: ParseDeadline,
  beginStage?: (stage: ParseStage) => void,
  onValidationComplete?: (warningCount: number) => void,
): {
  readonly events: readonly TimetableEvent[];
  readonly warnings: ParseWarning[];
  readonly validationWarnings: readonly ParseWarning[];
  readonly conflicts: ReturnType<typeof detectConflictsBounded>["conflicts"];
} {
  beginStage?.("validate");
  deadline?.assertAvailable("validate");
  const validationWarnings = validateTimetable(events, {
    timezone: options.timezone,
    ...(options.term === undefined ? {} : { term: options.term }),
  });
  deadline?.assertAvailable("validate");
  onValidationComplete?.(validationWarnings.length);
  beginStage?.("conflicts");
  deadline?.assertAvailable("conflicts");
  const detected = detectConflictsBounded(
    events,
    options.term === undefined
      ? { maxConflicts: DEFAULT_MAX_CONFLICTS }
      : { term: options.term, maxConflicts: DEFAULT_MAX_CONFLICTS },
  );
  deadline?.assertAvailable("conflicts");
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
  deadline?.assertAvailable("conflicts");
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
