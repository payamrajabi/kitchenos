import { describe, expect, it } from "vitest";
import {
  applyMarkdownLinkPaste,
  isAllowedHttpUrl,
  parseRecipeDescriptionToParts,
  recipeDescriptionPlainSnippet,
} from "../recipe-description-links";

describe("isAllowedHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isAllowedHttpUrl("https://example.com/path")).toBe(true);
    expect(isAllowedHttpUrl("http://localhost:3000")).toBe(true);
  });
  it("rejects non-http schemes", () => {
    expect(isAllowedHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedHttpUrl("data:text/html,hi")).toBe(false);
  });
});

describe("applyMarkdownLinkPaste", () => {
  it("wraps selection in markdown link", () => {
    const r = applyMarkdownLinkPaste({
      value: "Hello world",
      selStart: 0,
      selEnd: 5,
      pasted: "https://a.com",
      maxLen: 250,
    });
    expect(r).toEqual({
      value: "[Hello](https://a.com) world",
      caret: "[Hello](https://a.com)".length,
    });
  });
  it("returns null without selection", () => {
    expect(
      applyMarkdownLinkPaste({
        value: "x",
        selStart: 1,
        selEnd: 1,
        pasted: "https://a.com",
        maxLen: 250,
      }),
    ).toBeNull();
  });
  it("returns null for non-url paste", () => {
    expect(
      applyMarkdownLinkPaste({
        value: "abc",
        selStart: 0,
        selEnd: 3,
        pasted: "not a url",
        maxLen: 250,
      }),
    ).toBeNull();
  });
  it("shrinks label to fit maxLen", () => {
    const value = "x".repeat(240);
    const r = applyMarkdownLinkPaste({
      value,
      selStart: 0,
      selEnd: 10,
      pasted: "https://b.co",
      maxLen: 250,
    });
    expect(r).not.toBeNull();
    expect(r!.value.length).toBeLessThanOrEqual(250);
    expect(r!.value).toContain("https://b.co");
  });
  it("allows unlimited length when maxLen omitted", () => {
    const value = "y".repeat(5000);
    const r = applyMarkdownLinkPaste({
      value,
      selStart: 0,
      selEnd: 4,
      pasted: "https://z.com",
    });
    expect(r).not.toBeNull();
    expect(r!.value).toContain("[yyyy](https://z.com)");
  });
});

describe("parseRecipeDescriptionToParts", () => {
  it("parses markdown links", () => {
    expect(parseRecipeDescriptionToParts("See [here](https://ex.com) now")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", label: "here", href: "https://ex.com" },
      { kind: "text", text: " now" },
    ]);
  });
  it("autolinks bare URLs", () => {
    expect(parseRecipeDescriptionToParts("Go https://x.com ok")).toEqual([
      { kind: "text", text: "Go " },
      { kind: "link", label: "https://x.com", href: "https://x.com" },
      { kind: "text", text: " ok" },
    ]);
  });
});

describe("recipeDescriptionPlainSnippet", () => {
  it("replaces markdown links with label", () => {
    expect(recipeDescriptionPlainSnippet("A [b](https://c.com) d")).toBe("A b d");
  });
});
