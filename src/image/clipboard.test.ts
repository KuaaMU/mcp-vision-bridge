import { describe, expect, it } from "vitest";
import { clipboardReader } from "./clipboard.js";
import { pngFixture } from "../__fixtures__/images.js";

describe("clipboardReader", () => {
  it("returns powershell on Windows", () => {
    const reader = clipboardReader("win32");
    expect(reader?.command).toBe("powershell");
  });

  it("returns pbpaste on macOS", () => {
    const reader = clipboardReader("darwin");
    expect(reader?.command).toBe("pbpaste");
  });

  it("returns xclip on Linux", () => {
    const reader = clipboardReader("linux");
    expect(reader?.command).toBe("xclip");
  });

  it("returns undefined on unsupported platforms", () => {
    expect(clipboardReader("freebsd")).toBeUndefined();
  });
});

it("pngFixture produces a real PNG", () => {
  const bytes = pngFixture();
  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  expect(bytes[0]).toBe(0x89);
  expect(bytes[1]).toBe(0x50);
  expect(bytes[2]).toBe(0x4e);
  expect(bytes[3]).toBe(0x47);
  expect(bytes[4]).toBe(0x0d);
});
