import { describe, expect, test } from "bun:test";
import { bindingFromEvent, bindingsCollide } from "../src/lib/shortcuts";

describe("bindingsCollide", () => {
  test("matches bindings case-insensitively", () => {
    expect(bindingsCollide("Mod+K", "mod+k")).toBe(true);
    expect(bindingsCollide("Mod+K", "Mod+J")).toBe(false);
    expect(bindingsCollide("Mod+`", "Mod+`")).toBe(true);
  });

  test("rejects empty bindings", () => {
    expect(bindingsCollide("", "Mod+K")).toBe(false);
    expect(bindingsCollide("Mod+K", "")).toBe(false);
  });
});

describe("bindingFromEvent", () => {
  test("canonicalizes a mod+letter chord", () => {
    const event = { key: "k", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(bindingFromEvent(event)).toBe("Mod+K");
  });

  test("includes shift in the canonical form", () => {
    const event = { key: "P", metaKey: false, ctrlKey: true, shiftKey: true, altKey: false };
    expect(bindingFromEvent(event)).toBe("Mod+Shift+P");
  });

  test("returns null for bare modifiers", () => {
    expect(bindingFromEvent({ key: "Control", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBeNull();
    expect(bindingFromEvent({ key: "Shift", metaKey: false, ctrlKey: false, shiftKey: true, altKey: false })).toBeNull();
    expect(bindingFromEvent({ key: "Alt", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true })).toBeNull();
  });
});