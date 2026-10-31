import { gzipSync } from "node:zlib";
import { request, type RequestPolicy } from "./http";
import { apiError, NozleApiError, NozleValidationError } from "./errors";
import { createTransactionId } from "./identifiers";
import { eventTimestamp } from "./track";
import type { TrackBatchEvent, TrackBatchEventResult, TrackBatchOptions, TrackBatchResult } from "./types";

/** Most events Engine 2.28.0+ takes in one `/events/batch` request by default (`LAGO_EVENTS_BATCH_MAX_LENGTH`). */
export const MAX_BATCH_CHUNK_SIZE = 5000;
const DEFAULT_CONCURRENCY = 4;
// One request, plus a resend after each answer that names bad events. Nothing is stored by a rejected request.
const MAX_ROUNDS = 3;

interface Prepared {
  index: number;
  transactionId: string;
  body: Record<string, unknown>;
}

function positiveInteger(name: string, value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new NozleValidationError(`trackBatch ${name} must be an integer from 1 to ${max}`);
  return value;
}

/** Throws `NozleValidationError` for an event `/events/batch` cannot take; `label` names the event in the message. */
export function checkEvent(event: TrackBatchEvent, label: string, index?: number): void {
  if (!event || typeof event !== "object") throw new NozleValidationError(`${label} must be an object`, index);
  if (typeof event.customerId !== "string" || !event.customerId.trim())
    throw new NozleValidationError(`${label} requires customerId`, index);
  if (typeof event.event !== "string" || !event.event.trim())
    throw new NozleValidationError(`${label} requires event`, index);
  if (event.timestamp) {
    try {
      eventTimestamp(event.timestamp);
    } catch (error) {
      throw new NozleValidationError(`${label}: ${(error as Error).message}`, index);
    }
  }
}

function prepare(events: TrackBatchEvent[]): Prepared[] {
  const seen = new Set<string>();
  return events.map((event, index) => {
    checkEvent(event, `trackBatch events[${index}]`, index);
    const transactionId = event.transactionId || createTransactionId();
    if (seen.has(transactionId))
      throw new NozleValidationError(`trackBatch events[${index}] repeats transactionId ${transactionId}`, index);
    seen.add(transactionId);
    const body: Record<string, unknown> = {
      transaction_id: transactionId,
      external_customer_id: event.customerId,
      code: event.event,
      properties: event.metadata ?? {},
    };
    if (event.subscriptionId) body.external_subscription_id = event.subscriptionId;
    if (event.timestamp) body.timestamp = eventTimestamp(event.timestamp);
    return { index, transactionId, body };
  });
}

/** `error_details` keyed by position in the request, as Engine sends it; undefined for any other shape. */
function byPosition(details: unknown, size: number): Map<number, Record<string, string[]>> | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const out = new Map<number, Record<string, string[]>>();
  for (const [key, value] of Object.entries(details)) {
    const position = Number(key);
    if (!/^\d+$/.test(key) || position >= size || !value || typeof value !== "object") return undefined;
    out.set(position, value as Record<string, string[]>);
  }
  return out.size ? out : undefined;
}

/** Engine's answer to a request above its `LAGO_EVENTS_BATCH_MAX_LENGTH`: `{ events: ["too_many_events"] }`. */
function tooManyEvents(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const entries = Object.entries(details);
  return entries.length === 1 && entries[0][0] === "events" && Array.isArray(entries[0][1]) &&
    entries[0][1].length === 1 && entries[0][1][0] === "too_many_events";
}

async function sendChunk(
  baseUrl: string,
  apiKey: string,
  policy: RequestPolicy,
  chunk: Prepared[],
  results: TrackBatchEventResult[],
): Promise<void> {
  let pending = chunk;
  for (let round = 0; pending.length > 0; round += 1) {
    let failure: unknown;
    let refused: Map<number, Record<string, string[]>> | undefined;
    try {
      // Every event carries its transaction ID, so a repeat of this request is recorded once.
      const res = await request(policy, `${baseUrl}/api/v1/events/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Content-Encoding": "gzip" },
        body: gzipSync(JSON.stringify({ events: pending.map((p) => p.body) })),
      }, { idempotent: true });
      if (res.ok) {
        // A 200 stored every event except those Engine refused, listed by position.
        const body = (await res.json().catch(() => ({}))) as { error_details?: unknown };
        refused = byPosition(body?.error_details, pending.length);
        for (const [position, item] of pending.entries()) {
          const errors = refused?.get(position);
          results[item.index] = errors
            ? { index: item.index, transactionId: item.transactionId, status: "rejected", errors }
            : { index: item.index, transactionId: item.transactionId, status: "accepted" };
        }
        return;
      }
      failure = await apiError("trackBatch", res);
      const details = (failure as NozleApiError).errorDetails;
      // An Engine with a lower cap refused the size and stored nothing: send the chunk in halves.
      if (res.status === 422 && pending.length > 1 && tooManyEvents(details)) {
        const half = Math.ceil(pending.length / 2);
        await sendChunk(baseUrl, apiKey, policy, pending.slice(0, half), results);
        return sendChunk(baseUrl, apiKey, policy, pending.slice(half), results);
      }
      refused = byPosition(details, pending.length);
    } catch (error) {
      failure = error;
    }
    if (!refused) return fail(pending, failure, results);
    // Engine stored none (every event refused, or an Engine before 2.28.0 that refuses a request as a whole) and
    // named the bad events. Reject those and resend the rest, which is safe because of their transaction IDs.
    for (const [position, errors] of refused) {
      const item = pending[position];
      results[item.index] = { index: item.index, transactionId: item.transactionId, status: "rejected", errors };
    }
    pending = pending.filter((_, position) => !refused.has(position));
    if (pending.length > 0 && round + 1 >= MAX_ROUNDS) return fail(pending, failure, results);
  }
}

function fail(items: Prepared[], error: unknown, results: TrackBatchEventResult[]): void {
  for (const item of items)
    if (!results[item.index]) results[item.index] = { index: item.index, transactionId: item.transactionId, status: "failed", error };
}

export async function trackBatch(
  baseUrl: string,
  apiKey: string,
  events: TrackBatchEvent[],
  options: TrackBatchOptions | undefined,
  policy: RequestPolicy,
): Promise<TrackBatchResult> {
  if (!Array.isArray(events)) throw new NozleValidationError("trackBatch events must be an array");
  const chunkSize = positiveInteger("chunkSize", options?.chunkSize, MAX_BATCH_CHUNK_SIZE, MAX_BATCH_CHUNK_SIZE);
  const concurrency = positiveInteger("concurrency", options?.concurrency, DEFAULT_CONCURRENCY, 64);
  const prepared = prepare(events);
  const chunks: Prepared[][] = [];
  for (let start = 0; start < prepared.length; start += chunkSize) chunks.push(prepared.slice(start, start + chunkSize));

  const results: TrackBatchEventResult[] = new Array(prepared.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      // A chunk that throws is recorded as failed; it never stops the others.
      await sendChunk(baseUrl, apiKey, policy, chunk, results).catch((error) => fail(chunk, error, results));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));

  const count = (status: TrackBatchEventResult["status"]) => results.filter((r) => r.status === status).length;
  return { total: results.length, accepted: count("accepted"), rejected: count("rejected"), failed: count("failed"), results };
}
