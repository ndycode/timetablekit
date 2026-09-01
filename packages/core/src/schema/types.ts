export type SchemaVersion = "1.0";

export type SourceKind = "text" | "csv" | "image" | "pdf";

export type IsoDate = string;
export type LocalTime = string;
export type IsoInstant = string;
export type EventId = string;
export type TimeZone = string;

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type TimetableInput =
  | {
      readonly kind: "text";
      readonly text: string;
      readonly filename?: string;
    }
  | {
      readonly kind: "csv";
      readonly text: string;
      readonly delimiter?: "," | ";" | "\t";
      readonly filename?: string;
    }
  | {
      readonly kind: "image";
      readonly bytes: Readonly<Uint8Array>;
      readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
      readonly filename?: string;
    }
  | {
      readonly kind: "pdf";
      readonly bytes: Readonly<Uint8Array>;
      readonly mimeType: "application/pdf";
      readonly filename?: string;
    };

export type SourceDescriptor = {
  readonly kind: SourceKind;
  readonly filename?: string;
  readonly mimeType?: string;
  readonly pageCount?: number;
};

export type TermRange = {
  readonly startsOn: IsoDate;
  readonly endsOn: IsoDate;
};

export type EventSchedule =
  | {
      readonly kind: "weekly";
      readonly weekdays: readonly Weekday[];
      readonly startsOn?: IsoDate;
      readonly endsOn?: IsoDate;
    }
  | {
      readonly kind: "exact";
      readonly exactDates: readonly IsoDate[];
    };

export type EventField =
  | "title"
  | "code"
  | "eventType"
  | "schedule"
  | "startTime"
  | "endTime"
  | "timezone"
  | "location"
  | "instructor"
  | "notes";

export type FieldValue =
  string | EventSchedule | readonly Weekday[] | readonly IsoDate[];

export type SourceLocation = {
  readonly page?: number;
  readonly line?: number;
  readonly charStart?: number;
  readonly charEnd?: number;
  readonly bounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
};

export type FieldEvidence = {
  readonly source: SourceDescriptor;
  readonly location: SourceLocation;
  readonly excerpt?: string;
};

export type TimetableEvent = {
  readonly id: EventId;
  readonly title: string;
  readonly code?: string;
  readonly eventType?: string;
  readonly schedule: EventSchedule;
  readonly startTime: LocalTime;
  readonly endTime: LocalTime;
  readonly timezone: TimeZone;
  readonly location?: string;
  readonly instructor?: string;
  readonly notes?: string;
  readonly confidence: number;
  readonly fieldConfidence: Partial<Record<EventField, number>>;
  readonly evidence: Partial<Record<EventField, readonly FieldEvidence[]>>;
};

export type WarningCode =
  | "UNSUPPORTED_FILE_TYPE"
  | "UNRECOGNIZED_CSV"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_PAGES"
  | "NO_TEXT_FOUND"
  | "NO_EVENTS_FOUND"
  | "LOW_CONFIDENCE"
  | "UNKNOWN_DAY_LABEL"
  | "UNKNOWN_LOCALE"
  | "AMBIGUOUS_TIME"
  | "MISSING_TITLE"
  | "MISSING_START_TIME"
  | "MISSING_END_TIME"
  | "INVALID_TIME_RANGE"
  | "INVALID_DATE"
  | "INVALID_TERM_RANGE"
  | "INVALID_TIMEZONE"
  | "DUPLICATE_EVENT"
  | "POSSIBLE_DUPLICATE"
  | "SCHEDULE_CONFLICT"
  | "CONFLICT_LIMIT"
  | "OUTSIDE_TERM_RANGE"
  | "OCR_PARTIAL"
  | "UNSUPPORTED_PROVIDER"
  | "PROVIDER_FAILED"
  | "PROVIDER_ABORTED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_OUTPUT_INVALID"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_RECOVERY_SKIPPED"
  | "AI_OUTPUT_INVALID";

export type WarningSeverity = "info" | "warning" | "error";

export type ParseWarning = {
  readonly code: WarningCode;
  readonly severity: WarningSeverity;
  readonly message: string;
  readonly eventId?: EventId;
  readonly field?: EventField;
  readonly source?: SourceLocation;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
};

export type ConflictCode = "SCHEDULE_CONFLICT";

export type ScheduleConflict = {
  readonly code: ConflictCode;
  readonly id: string;
  readonly eventIds: readonly [EventId, EventId];
  readonly occurrence:
    | { readonly kind: "weekday"; readonly weekday: Weekday }
    | { readonly kind: "date"; readonly date: IsoDate };
  readonly overlap: {
    readonly startsAt: LocalTime;
    readonly endsAt: LocalTime;
  };
};

export type ParseStage =
  | "preflight"
  | "extract"
  | "normalize"
  | "segment"
  | "recognize"
  | "assemble"
  | "locale"
  | "deduplicate"
  | "validate"
  | "conflicts"
  | "confidence"
  | "recovery"
  | "finalize";

export type ParseProgress = {
  readonly stage: ParseStage;
  readonly completed: number;
  readonly total?: number;
  readonly message: string;
};

export type ParseStageReport = {
  readonly stage: ParseStage;
  readonly status: "completed" | "skipped" | "failed";
  readonly durationMs: number;
  readonly warningCount: number;
  readonly providerId?: string;
};

export type TimetableParseResult = {
  readonly schemaVersion: SchemaVersion;
  readonly source: SourceDescriptor;
  readonly timezone: TimeZone;
  readonly locale: string;
  readonly term?: TermRange;
  readonly events: readonly TimetableEvent[];
  readonly warnings: readonly ParseWarning[];
  readonly conflicts: readonly ScheduleConflict[];
  readonly parse: {
    readonly durationMs: number;
    readonly deterministicConfidence: number;
    readonly aiRecoveryUsed: boolean;
    readonly providersUsed: readonly string[];
    readonly stageReports: readonly ParseStageReport[];
  };
};

export type ResourceLimits = {
  readonly maxInputBytes: number;
  readonly maxImagePixels: number;
  readonly maxPdfPages: number;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
};

export type ParseOptions = {
  readonly locale: string;
  readonly timezone: TimeZone;
  readonly term?: TermRange;
  readonly evidence?: "none" | "locations" | "snippets";
  readonly limits?: Partial<ResourceLimits>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ParseProgress) => void;
  readonly recovery?: {
    readonly enabled: boolean;
    readonly consent: boolean;
    readonly maxFields?: number;
  };
};

export type TextLine = {
  readonly text: string;
  readonly location: SourceLocation;
};

export type TextPage = {
  readonly pageNumber?: number;
  readonly lines: readonly TextLine[];
};

export type TextDocument = {
  readonly source: SourceDescriptor;
  readonly pages: readonly TextPage[];
};

export type ExtractionArtifact = {
  readonly providerId: string;
  readonly document: TextDocument;
  readonly warnings: readonly ParseWarning[];
};

export type ProviderContext = {
  readonly signal: AbortSignal;
  readonly limits: ResourceLimits;
  readonly reportProgress: (progress: ParseProgress) => void;
};

export interface ExtractionProvider {
  readonly id: string;
  supports(input: TimetableInput): boolean;
  extract(
    input: TimetableInput,
    context: ProviderContext,
  ): Promise<ExtractionArtifact>;
}

export type RasterImage = {
  readonly bytes: Readonly<Uint8Array>;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
  readonly width: number;
  readonly height: number;
  readonly pageNumber?: number;
};

export type OcrPage = {
  readonly providerId: string;
  readonly page: TextPage;
  readonly warningCodes: readonly WarningCode[];
};

export interface OcrProvider {
  readonly id: string;
  recognize(image: RasterImage, context: ProviderContext): Promise<OcrPage>;
}

export type UnresolvedField = {
  readonly eventId: EventId;
  readonly field: EventField;
  readonly candidateText: string;
  readonly evidence: readonly FieldEvidence[];
};

export type RecoveryRequest = {
  readonly schemaVersion: SchemaVersion;
  readonly locale: string;
  readonly timezone: TimeZone;
  readonly unresolved: readonly UnresolvedField[];
};

export type RecoveryPatch = {
  readonly eventId: EventId;
  readonly field: EventField;
  readonly value: FieldValue;
  readonly confidence: number;
};

export type RecoveryResponse = {
  readonly patches: readonly RecoveryPatch[];
};

export interface RecoveryProvider {
  readonly id: string;
  recover(
    request: RecoveryRequest,
    context: ProviderContext,
  ): Promise<RecoveryResponse>;
}

export type TimetableParserConfig = {
  readonly providers?: readonly ExtractionProvider[];
  readonly recoveryProvider?: RecoveryProvider;
  readonly localeRegistry?: LocaleRegistry;
  readonly limits?: Partial<ResourceLimits>;
};

export interface TimetableParser {
  parse(
    input: TimetableInput,
    options?: ParseOptions,
  ): Promise<TimetableParseResult>;
}

export type LocaleDefinition = {
  readonly id: string;
  readonly dayAliases: Readonly<Record<string, Weekday>>;
  readonly dateOrder: "DMY" | "MDY" | "YMD";
};

export interface LocaleRegistry {
  get(id: string): LocaleDefinition;
  with(definition: LocaleDefinition): LocaleRegistry;
}
