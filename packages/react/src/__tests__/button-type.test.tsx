import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanCard, UpgradePrompt, UsageAlert } from "../index.js";

describe("component buttons inside an app form", () => {
  it("do not submit the form", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <UpgradePrompt planName="Pro" onUpgrade={() => {}} />
        <PlanCard plan={{ code: "pro", name: "Pro", amount_cents: 2900, amount_currency: "USD", interval: "monthly" }} isCurrent={false} onSelect={() => {}} />
        <UsageAlert features={[{ key: "seats", label: "Seats", percentage: 95 }]} />
      </form>,
    );
    for (const button of screen.getAllByRole("button")) fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
