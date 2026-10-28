import { afterEach, describe, expect, it, vi } from "vitest";
import { Nozle } from "../client";
import { paginate } from "../paginate";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("paginate", () => {
  it("follows next_cursor until it is null", async () => {
    const pages: Record<string, { rows: number[]; next_cursor: string | null }> = {
      first: { rows: [1, 2], next_cursor: "p2" },
      p2: { rows: [3], next_cursor: null },
    };
    const seen: Array<string | undefined> = [];
    const all: number[] = [];
    for await (const row of paginate((cursor) => { seen.push(cursor); return Promise.resolve(pages[cursor ?? "first"]); }, (page) => page.rows)) all.push(row);
    expect(all).toEqual([1, 2, 3]);
    expect(seen).toEqual([undefined, "p2"]);
  });

  it("credits.iterateOperations sends the cursor of each page and starts at query.cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ customer_id: "c", operations: [{ id: "a" }], next_cursor: "n2" }))
      .mockResolvedValueOnce(json({ customer_id: "c", operations: [{ id: "b" }], next_cursor: null }));
    const ids: string[] = [];
    for await (const op of new Nozle({ apiKey: "sk_test" }).credits.iterateOperations("c", { cursor: "n1", limit: 1 })) ids.push(op.id);
    expect(ids).toEqual(["a", "b"]);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("cursor")).toBe("n1");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("cursor")).toBe("n2");
  });

  it("entities.iterate yields every entity", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ customer_id: "c", entities: [{ external_id: "e1" }], next_cursor: "x" }))
      .mockResolvedValueOnce(json({ customer_id: "c", entities: [{ external_id: "e2" }], next_cursor: null }));
    const ids: string[] = [];
    for await (const entity of new Nozle({ apiKey: "sk_test" }).entities.iterate("c")) ids.push(entity.external_id);
    expect(ids).toEqual(["e1", "e2"]);
  });
});

describe("typed margin results and can() metadata", () => {
  it("returns the Engine shapes", async () => {
    const client = new Nozle({ apiKey: "sk_test" });
    fetchMock.mockResolvedValueOnce(json({ total_revenue_cents: 100, total_cost_cents: 40, total_margin_cents: 60, margin_percent: 60, event_count: 3 }));
    const summary = await client.margin.summary();
    const cents: number = summary.total_margin_cents;
    expect(cents).toBe(60);
    fetchMock.mockResolvedValueOnce(json({ customers: null }));
    const byCustomer = await client.margin.byCustomer();
    expect(byCustomer.customers ?? []).toEqual([]);
  });

  it("sends string, number and boolean metadata to can()", async () => {
    fetchMock.mockResolvedValueOnce(json({ allowed: true }));
    await new Nozle({ apiKey: "sk_test" }).can("c", "f", { model: "gpt", tokens: 5, cached: true });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(JSON.parse(url.searchParams.get("metadata") ?? "")).toEqual({ model: "gpt", tokens: 5, cached: true });
  });
});
