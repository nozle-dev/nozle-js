import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");

describe("Stripe checkout is hosted only", () => {
  it("has no embedded checkout secret in the package source, types or README", () => {
    const files = [
      "README.md",
      ...readdirSync(join(root, "src"))
        .filter((name) => name.endsWith(".ts"))
        .map((name) => join("src", name)),
      join("src", "generated", "openapi.ts"),
    ];
    for (const file of files) {
      const text = readFileSync(join(root, file), "utf8");
      // A Stripe 3-D Secure URL in the generated examples names payment_intent_client_secret; that is not ours.
      expect(text, file).not.toMatch(/(?<!payment_intent_)client_?secret/i);
    }
  });
});
