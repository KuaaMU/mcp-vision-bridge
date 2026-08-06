/**
 * Error hierarchy for mcp-vision-bridge.
 *
 * Errors are categorized so the tool handler can surface a clear, actionable
 * message to the text-only agent (which cannot see the image and must rely on
 * the error text to self-correct).
 */

export class VisionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_input"
      | "image_fetch_failed"
      | "unsupported_mime"
      | "provider_error"
      | "provider_timeout"
      | "clipboard_error"
      | "io_error"
      | "config_error",
  ) {
    super(message);
    this.name = "VisionError";
  }
}

export function invalidInput(message: string): VisionError {
  return new VisionError(message, "invalid_input");
}

export function imageFetchFailed(message: string): VisionError {
  return new VisionError(message, "image_fetch_failed");
}

export function unsupportedMime(message: string): VisionError {
  return new VisionError(message, "unsupported_mime");
}

export function providerError(message: string): VisionError {
  return new VisionError(message, "provider_error");
}

export function providerTimeout(message: string): VisionError {
  return new VisionError(message, "provider_timeout");
}

export function clipboardError(message: string): VisionError {
  return new VisionError(message, "clipboard_error");
}

export function ioError(message: string): VisionError {
  return new VisionError(message, "io_error");
}

export function configError(message: string): VisionError {
  return new VisionError(message, "config_error");
}
