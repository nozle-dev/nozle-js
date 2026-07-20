import { describe, expect, it } from "vitest";

import { compareDecimalStrings, formatDecimalString } from "../core/decimal";

describe("exact decimal display helpers", () => {
  it("normalizes long repeated digits in linear time", () => {
    const value = `${"0".repeat(100_000)}123456789012345678.120000000000`;

    expect(formatDecimalString(value)).toBe("123,456,789,012,345,678.12");
    expect(compareDecimalStrings(value, "123456789012345678.12")).toBe(0);
  });

  it("compares signed and sub-unit values without number coercion", () => {
    expect(compareDecimalStrings("0.000000000001", "0.000000000002")).toBe(-1);
    expect(compareDecimalStrings("-2", "-10")).toBe(1);
  });
});
