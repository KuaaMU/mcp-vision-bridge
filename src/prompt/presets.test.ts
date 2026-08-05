import { describe, expect, it } from "vitest";
import {
  defaultSystemPrompt,
  presetFor,
  TASK_PRESETS,
  isTaskName,
  assertTaskName,
} from "./presets.js";

describe("presets", () => {
  it("exposes the five task names", () => {
    expect(TASK_PRESETS).toEqual(["describe", "ocr", "ui", "layout", "qa"]);
  });

  it("each preset is a non-empty, distinct instruction", () => {
    for (const task of TASK_PRESETS) {
      const p = presetFor(task);
      expect(p.length).toBeGreaterThan(50);
    }
    expect(presetFor("describe")).not.toBe(presetFor("ocr"));
  });

  it("the default system prompt demands exhaustive detail", () => {
    const prompt = defaultSystemPrompt();
    expect(prompt).toContain("text-only");
    expect(prompt).toContain("every visible element");
    expect(prompt).toContain("verbatim");
    expect(prompt).toContain("Never invent");
  });
});

describe("isTaskName / assertTaskName", () => {
  it("recognizes valid tasks", () => {
    expect(isTaskName("ocr")).toBe(true);
    expect(assertTaskName("ui")).toBe("ui");
  });

  it("rejects unknown tasks with a clear error", () => {
    expect(isTaskName("bogus")).toBe(false);
    expect(() => assertTaskName("bogus")).toThrowError(/Unknown task "bogus"/);
  });
});
