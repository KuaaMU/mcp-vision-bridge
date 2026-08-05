import { describe, expect, it } from "vitest";
import { clipboardReader, interpretClipboardStdout } from "./clipboard.js";
import { pngFixture, textFixture } from "../__fixtures__/images.js";

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

describe("interpretClipboardStdout", () => {
  it("returns null for empty output", () => {
    expect(interpretClipboardStdout(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for whitespace-only output (PowerShell \r\n / \n / space)", () => {
    expect(interpretClipboardStdout(Buffer.from("\r\n"))).toBeNull();
    expect(interpretClipboardStdout(Buffer.from("\n"))).toBeNull();
    expect(interpretClipboardStdout(Buffer.from(" "))).toBeNull();
  });

  it("returns null when the clipboard holds non-image content (text)", () => {
    expect(interpretClipboardStdout(textFixture())).toBeNull();
  });

  it("returns the bytes for a real image", () => {
    const png = pngFixture();
    expect(interpretClipboardStdout(png)).toEqual(png);
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
