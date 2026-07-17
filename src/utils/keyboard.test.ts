import { describe, it, expect } from "vitest";
import { shouldIgnoreSpace } from "./keyboard";

describe("shouldIgnoreSpace", () => {
  it("ignores space in form inputs", () => {
    const input = document.createElement("input");
    expect(shouldIgnoreSpace(input)).toBe(true);
  });

  it("ignores space in textarea", () => {
    const textarea = document.createElement("textarea");
    expect(shouldIgnoreSpace(textarea)).toBe(true);
  });

  it("ignores space in contenteditable elements", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(shouldIgnoreSpace(div)).toBe(true);
  });

  it("does not ignore space on normal divs", () => {
    const div = document.createElement("div");
    expect(shouldIgnoreSpace(div)).toBe(false);
  });
});
