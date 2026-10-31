import { NozleValidationError } from "./errors";
import { createTransactionId } from "./identifiers";
import { checkEvent, MAX_BATCH_CHUNK_SIZE } from "./track-batch";
import type { TrackBatchEvent, TrackBatchEventResult, TrackBatchOptions, TrackBatchResult } from "./types";

/**
 * Why events left the buffer unsent: `buffer_full` (the queue held `maxQueueSize` events), `rejected` (Engine refused
 * the event; not retried), `failed` (its requests failed for `maxAttempts` flushes) or `closed` (tracked after `close()`).
 */
export type EventBufferErrorCode = "buffer_full" | "rejected" | "failed" | "closed";

export class EventBufferError extends Error {
  readonly code: EventBufferErrorCode;
  /** For `rejected`: Engine's codes by field, for example `{ code: ["value_is_mandatory"] }`. */
  readonly errors?: Record<string, string[]>;

  constructor(code: EventBufferErrorCode, message: string, details: { errors?: Record<string, string[]>; cause?: unknown } = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "EventBufferError";
    this.code = code;
    if (details.errors) this.errors = details.errors;
  }
}

export interface EventBufferOptions {
  /** Events per `/events/batch` request, 1 to 5000 (default 500). A flush starts as soon as this many are waiting. */
  maxBatchSize?: number;
  /** Flushes whatever is waiting this often (default 5000 ms); 0 disables the timer. */
  flushIntervalMs?: number;
  /** Most events held at once, sent or not (default 10 000). When full, a new event is dropped and reported `buffer_full`. */
  maxQueueSize?: number;
  /** Flushes an event may fail in before it is dropped and reported `failed` (default 3). */
  maxAttempts?: number;
  /**
   * Receives every event that leaves the buffer unsent, with the reason in `error.code`. Without it each is emitted
   * as a `NozleTrackingWarning` process warning. It must not throw; anything it throws is ignored.
   */
  onError?: (error: EventBufferError, events: TrackBatchEvent[]) => void;
}

type SendBatch = (events: TrackBatchEvent[], options: TrackBatchOptions) => Promise<TrackBatchResult>;

interface Queued {
  event: TrackBatchEvent & { transactionId: string };
  attempts: number;
}

function integerOption(name: string, value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max)
    throw new NozleValidationError(`createEventBuffer ${name} must be an integer from ${min} to ${max}`);
  return value;
}

/**
 * Queues events in memory and sends them through `trackBatch()` in the background: when `maxBatchSize` are waiting,
 * every `flushIntervalMs`, and before the process exits. Create it with {@link Nozle.createEventBuffer}.
 */
export class EventBuffer {
  private queue: Queued[] = [];
  private inFlight = 0;
  private running?: Promise<void>;
  private queued?: Promise<void>;
  private closing?: Promise<void>;
  private closed = false;
  private readonly timer?: ReturnType<typeof setInterval>;
  private readonly maxBatchSize: number;
  private readonly maxQueueSize: number;
  private readonly maxAttempts: number;
  private readonly onError?: EventBufferOptions["onError"];
  // beforeExit fires again after the work it starts, so a flush that leaves retries runs until the queue is empty.
  private readonly onBeforeExit = () => {
    if (this.queue.length > 0) void this.flush();
  };

  constructor(private readonly sendBatch: SendBatch, options: EventBufferOptions = {}) {
    this.maxBatchSize = integerOption("maxBatchSize", options.maxBatchSize, 500, 1, MAX_BATCH_CHUNK_SIZE);
    this.maxQueueSize = integerOption("maxQueueSize", options.maxQueueSize, 10_000, 1, Number.MAX_SAFE_INTEGER);
    this.maxAttempts = integerOption("maxAttempts", options.maxAttempts, 3, 1, Number.MAX_SAFE_INTEGER);
    const interval = integerOption("flushIntervalMs", options.flushIntervalMs, 5000, 0, 2 ** 31 - 1);
    this.onError = options.onError;
    if (interval > 0) {
      this.timer = setInterval(() => {
        if (this.queue.length > 0) void this.flush();
      }, interval);
      // The timer never keeps the process alive; beforeExit sends what is left.
      this.timer.unref?.();
    }
    if (typeof process !== "undefined" && typeof process.on === "function") process.on("beforeExit", this.onBeforeExit);
  }

  /** Events waiting to be sent, not counting a request in flight. */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Queues one event and returns its transaction ID (yours, or a generated UUID v7) at once, without a request.
   * Every resend carries that ID, so Engine records the event once. Throws `NozleValidationError` for an event
   * `trackBatch()` would refuse. A full or closed buffer drops the event and reports it to `onError` instead of throwing.
   */
  track(event: TrackBatchEvent): string {
    checkEvent(event, "EventBuffer.track event");
    const transactionId = event.transactionId || createTransactionId();
    const queued = { event: { ...event, transactionId }, attempts: 0 };
    if (this.closed) {
      this.report("closed", "The event buffer is closed; the event was dropped", [queued.event]);
    } else if (this.queue.length + this.inFlight >= this.maxQueueSize) {
      this.report("buffer_full", `The event buffer holds ${this.maxQueueSize} events; the new event was dropped`, [queued.event]);
    } else {
      this.queue.push(queued);
      if (this.queue.length >= this.maxBatchSize) void this.flush();
    }
    return transactionId;
  }

  /**
   * Sends every event waiting now and resolves when done; it never rejects. Events whose request failed go back to
   * the front of the queue for the next flush; rejected ones and those out of attempts are reported to `onError`.
   * Only one flush runs at a time: a call during a flush waits for it and then sends what is waiting.
   */
  flush(): Promise<void> {
    if (this.queued) return this.queued;
    if (!this.running) return this.start();
    this.queued = this.running.then(() => {
      this.queued = undefined;
      return this.start();
    });
    return this.queued;
  }

  /** Stops the timer and the exit hook, sends everything (retrying failures up to `maxAttempts`) and refuses later events. */
  close(): Promise<void> {
    this.closing ??= (async () => {
      this.closed = true;
      if (this.timer) clearInterval(this.timer);
      if (typeof process !== "undefined" && typeof process.off === "function") process.off("beforeExit", this.onBeforeExit);
      // Waits for a flush in flight too. Each flush sends an event or spends one of its attempts, so this ends.
      do await this.flush();
      while (this.queue.length > 0);
    })();
    return this.closing;
  }

  private start(): Promise<void> {
    this.running = this.send().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async send(): Promise<void> {
    // A transaction ID may appear once per request: a repeat waits for the next flush, where Engine dedupes it.
    const batch: Queued[] = [];
    const later: Queued[] = [];
    const ids = new Set<string>();
    for (const item of this.queue) {
      (ids.has(item.event.transactionId) ? later : batch).push(item);
      ids.add(item.event.transactionId);
    }
    this.queue = later;
    if (batch.length === 0) return;

    this.inFlight = batch.length;
    let results: TrackBatchEventResult[];
    try {
      results = (await this.sendBatch(batch.map((item) => item.event), { chunkSize: this.maxBatchSize })).results;
    } catch (error) {
      results = batch.map((item, index) => ({ index, transactionId: item.event.transactionId, status: "failed" as const, error }));
    } finally {
      this.inFlight = 0;
    }

    const retry: Queued[] = [];
    const dropped: Queued["event"][] = [];
    let failure: unknown;
    for (const [index, result] of results.entries()) {
      const item = batch[index];
      if (result.status === "rejected") {
        this.report("rejected", `Engine rejected event ${item.event.transactionId}: ${JSON.stringify(result.errors)}`, [item.event], { errors: result.errors });
      } else if (result.status === "failed") {
        failure = result.error;
        item.attempts += 1;
        if (item.attempts >= this.maxAttempts) dropped.push(item.event);
        else retry.push(item);
      }
    }
    // Back to the front, ahead of events tracked during the request; they still count against maxQueueSize.
    this.queue = retry.concat(this.queue);
    if (dropped.length > 0) {
      const detail = failure instanceof Error ? failure.message : String(failure);
      this.report("failed", `${dropped.length} event(s) failed in ${this.maxAttempts} flushes and were dropped: ${detail}`, dropped, { cause: failure });
    }
  }

  private report(code: EventBufferErrorCode, message: string, events: TrackBatchEvent[], details?: { errors?: Record<string, string[]>; cause?: unknown }): void {
    const error = new EventBufferError(code, message, details);
    try {
      if (this.onError) this.onError(error, events);
      else process.emitWarning(`Nozle event buffer: ${message}`, { type: "NozleTrackingWarning", code });
    } catch {
      // A throwing callback, or no process (edge, browser): the buffer keeps working.
    }
  }
}
