import { OptionsValidationError, TimetableError } from "./errors.js";
import type { ParseStage } from "./schema/types.js";

export type DeadlineStage = ParseStage;

export class DeadlineTimeoutError extends TimetableError {
  override readonly name = "DeadlineTimeoutError";

  constructor(
    readonly providerId: string | undefined,
    readonly stage: DeadlineStage,
  ) {
    super(
      "PROVIDER_TIMEOUT",
      providerId === undefined
        ? `Parsing timed out during ${stage}.`
        : `The ${providerId} provider timed out during ${stage}.`,
      providerId === undefined ? { stage } : { provider: providerId, stage },
    );
  }
}

function abortedError(): TimetableError {
  return new TimetableError("ABORTED", "Parsing was aborted.");
}

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export class ParseDeadline {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private readonly deadlineAt: number;
  private readonly callerSignal: AbortSignal;
  private readonly onCallerAbort = (): void => {
    this.controller.abort();
  };
  private timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  private deadlineExpired = false;
  private disposed = false;

  constructor(timeoutMs: number, callerSignal: AbortSignal) {
    this.signal = this.controller.signal;
    this.callerSignal = callerSignal;
    this.deadlineAt = Date.now() + timeoutMs;
    try {
      callerSignal.addEventListener("abort", this.onCallerAbort, {
        once: true,
      });
      if (callerSignal.aborted) {
        this.onCallerAbort();
      } else {
        this.armTimer();
      }
    } catch {
      this.disposed = true;
      try {
        callerSignal.removeEventListener("abort", this.onCallerAbort);
      } catch (error) {
        void error;
      }
      throw new OptionsValidationError();
    }
  }

  remainingMs(): number {
    return Math.max(0, this.deadlineAt - Date.now());
  }

  isExpired(): boolean {
    return this.deadlineExpired || this.remainingMs() <= 0;
  }

  assertAvailable(stage: DeadlineStage, providerId?: string): void {
    if (this.callerAborted()) throw abortedError();
    if (this.isExpired()) {
      this.expire();
      throw new DeadlineTimeoutError(providerId, stage);
    }
  }

  run<T>(
    stage: DeadlineStage,
    providerId: string,
    operation: () => PromiseLike<T> | T,
  ): Promise<T> {
    try {
      this.assertAvailable(stage, providerId);
    } catch (error) {
      return Promise.reject(error);
    }
    let operationResult: PromiseLike<T> | T;
    try {
      operationResult = operation();
    } catch (error) {
      return Promise.reject(error);
    }
    const operationPromise = Promise.resolve(operationResult);
    void operationPromise.then(
      () => undefined,
      () => undefined,
    );

    let removeAbortListener = (): void => undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      const onAbort = (): void => {
        let callerAborted = false;
        try {
          callerAborted = this.callerSignal.aborted;
        } catch {
          reject(new OptionsValidationError());
          return;
        }
        reject(
          callerAborted
            ? abortedError()
            : new DeadlineTimeoutError(providerId, stage),
        );
      };
      try {
        this.signal.addEventListener("abort", onAbort, { once: true });
      } catch {
        reject(new OptionsValidationError());
        return;
      }
      removeAbortListener = (): void => {
        try {
          this.signal.removeEventListener("abort", onAbort);
        } catch (error) {
          void error;
        }
      };
      try {
        if (this.signal.aborted) onAbort();
      } catch {
        reject(new OptionsValidationError());
      }
    });

    return Promise.race([operationPromise, timeoutPromise]).finally(() => {
      removeAbortListener();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== undefined) {
      try {
        globalThis.clearTimeout(this.timer);
      } catch (error) {
        void error;
      }
      this.timer = undefined;
    }
    try {
      this.callerSignal.removeEventListener("abort", this.onCallerAbort);
    } catch (error) {
      void error;
    }
    try {
      this.controller.abort();
    } catch (error) {
      void error;
    }
  }

  private callerAborted(): boolean {
    try {
      return this.callerSignal.aborted;
    } catch {
      throw new OptionsValidationError();
    }
  }

  private expire(): void {
    if (this.deadlineExpired) return;
    this.deadlineExpired = true;
    this.controller.abort();
  }

  private armTimer(): void {
    if (this.disposed) return;
    const remaining = this.remainingMs();
    if (remaining <= 0) {
      this.expire();
      return;
    }
    this.timer = globalThis.setTimeout(
      () => {
        this.timer = undefined;
        if (this.remainingMs() <= 0) {
          this.expire();
        } else {
          this.armTimer();
        }
      },
      Math.min(remaining, MAX_TIMER_DELAY_MS),
    );
  }
}

export function createParseDeadline(
  timeoutMs: number,
  callerSignal: AbortSignal,
): ParseDeadline {
  return new ParseDeadline(timeoutMs, callerSignal);
}
