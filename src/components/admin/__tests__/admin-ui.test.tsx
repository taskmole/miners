import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Chips, DecisionPanel, FoldedSection, StatusBadge, formatShortDate } from "../admin-ui";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("formatShortDate", () => {
  it("returns nothing for missing or broken dates", () => {
    expect(formatShortDate(undefined)).toBe("");
    expect(formatShortDate(null)).toBe("");
    expect(formatShortDate("")).toBe("");
    expect(formatShortDate("not a date")).toBe("");
  });

  it("adds the year only when it is not this year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    expect(formatShortDate("2026-10-19T12:00:00Z")).not.toMatch(/2026/);
    expect(formatShortDate("2025-10-19T12:00:00Z")).toMatch(/2025/);
  });
});

describe("StatusBadge", () => {
  it("labels the known statuses and shows anything else as is", () => {
    render(
      <>
        <StatusBadge status="approved" />
        <StatusBadge status="rejected" />
        <StatusBadge status="returned" />
        <StatusBadge status="something-new" />
      </>,
    );
    for (const label of ["Approved", "Rejected", "Returned", "something-new"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe("DecisionPanel", () => {
  const setup = (props: Partial<Parameters<typeof DecisionPanel>[0]> = {}) => {
    const onConfirm = vi.fn();
    render(
      <DecisionPanel
        label="Why?"
        placeholder="note"
        confirmLabel="Reject pitch"
        onConfirm={onConfirm}
        onCancel={() => {}}
        {...props}
      />,
    );
    const confirm = () => screen.getByRole("button", { name: props.busy ? "Saving..." : "Reject pitch" }) as HTMLButtonElement;
    const type = (text: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
    return { onConfirm, confirm, type };
  };

  it("keeps confirm off until a real note is typed, then sends it trimmed", () => {
    const { onConfirm, confirm, type } = setup();
    expect(confirm().disabled).toBe(true);
    type("   ");
    expect(confirm().disabled).toBe(true);
    type("  too small  ");
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith("too small");
  });

  it("allows an empty note when it is optional", () => {
    const { onConfirm, confirm } = setup({ required: false });
    fireEvent.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("locks both buttons while any decision is saving", () => {
    const { confirm, type } = setup({ locked: true });
    type("note");
    expect(confirm().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Chips", () => {
  it("marks the picked chip and reports taps", () => {
    const onChange = vi.fn();
    render(
      <Chips
        label="City"
        value="all"
        onChange={onChange}
        options={[
          { id: "all", label: "All", count: 3 },
          { id: "madrid", label: "Madrid", count: 1 },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /All/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Madrid/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Madrid/ }));
    expect(onChange).toHaveBeenCalledWith("madrid");
  });
});

describe("FoldedSection", () => {
  it("starts folded and opens on tap", () => {
    render(
      <FoldedSection title="Decided" count={2}>
        <p>Past decision</p>
      </FoldedSection>,
    );
    const toggle = screen.getByRole("button", { name: /Decided/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Past decision")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Past decision")).toBeTruthy();
  });
});
