/**
 * Prompt engineering for the vision model.
 *
 * The consumer of the returned text is a TEXT-ONLY LLM agent. It cannot see
 * the image, so the vision model must return an exhaustive description that
 * stands alone: every visible element, all text verbatim, spatial layout,
 * colors, and anything notable. The system prompt below is built around that
 * requirement.
 */

import { invalidInput } from "../errors.js";

export const TASK_PRESETS = ["describe", "ocr", "ui", "layout", "qa"] as const;

export type TaskName = (typeof TASK_PRESETS)[number];

/**
 * The default system prompt used when the caller provides no override.
 * Pushes the vision model toward maximum detail and completeness.
 *
 * focus-hint: the user (or agent) may supply a specific question/instruction in
 * the prompt. The vision model must answer THAT question as the focus of its
 * analysis, not fall back to a generic description — a targeted answer is what
 * the text-only agent actually needs (validated against agent-vision-toolkit).
 */
export function defaultSystemPrompt(): string {
  return [
    "You are a precise image analysis assistant for a text-only AI coding agent.",
    "The agent cannot see this image. Your entire response must be complete, detailed, and standalone so the agent can reason, act, and quote from it without needing the image again.",
    "",
    "FOCUS: When the caller provides a specific question or instruction (the prompt),",
    "make it the focus of your analysis — answer what is asked rather than giving a",
    "generic description. When no specific question is given, describe exhaustively.",
    "",
    "MULTI-IMAGE: When multiple images are provided, analyze EVERY image. Label each",
    "one (Image 1, Image 2, ...) and describe it separately, then note relationships,",
    "differences, or shared context if relevant. Never skip an image or merge two",
    "images into one description without calling out each.",
    "",
    "Your response MUST follow these rules:",
    "1. Describe every visible element. Never omit details because they seem obvious or minor.",
    "2. Quote ALL visible text verbatim — errors, labels, buttons, numbers, code, URLs, timestamps. Reproduce exact wording and formatting.",
    "3. Report spatial layout and relative positions (top/bottom, left/right, columns, overlapping elements).",
    "4. Report colors, sizes, and visual states (selected, disabled, hovered, focused, loading).",
    "5. Identify the type of content (UI screenshot, chart, code, document, photo, diagram, error dialog, terminal output, ...).",
    "6. State anything anomalous, broken, or notable — unexpected text, layout issues, missing elements.",
    "7. If something is unclear, low-resolution, or not fully legible, say so explicitly instead of guessing.",
    "8. Use plain text or simple markdown. Be thorough — prefer a long, complete answer over a short one.",
    "",
    "Never invent content that is not actually visible in the image.",
  ].join("\n");
}

/**
 * Task-specific user-prompt presets. These fill in a detailed instruction
 * when the caller does not supply their own free-form `prompt`.
 */
export function presetFor(task: TaskName): string {
  switch (task) {
    case "describe":
      return (
        "Provide a complete, exhaustive description of this image: every element, " +
        "all visible text verbatim, spatial layout, colors, style, and anything notable. " +
        "Assume the reader is a text-only AI and cannot see the image."
      );
    case "ocr":
      return (
        "Extract every piece of text from this image, verbatim and in reading order. " +
        "Preserve exact wording, case, spacing, and line structure. " +
        "If any text is partially legible, reproduce what you can and mark the uncertain parts."
      );
    case "ui":
      return (
        "Describe this UI as a complete functional spec for a developer. " +
        "Enumerate every component (buttons, inputs, dialogs, menus, status indicators), " +
        "their exact labels, states, positions, and behavior clues. " +
        "Quote all text, including placeholders, tooltips, error messages, and version strings."
      );
    case "layout":
      return (
        "Describe the spatial layout of this image in detail: sections, columns, alignment, " +
        "dimensions, spacing, z-order/overlap, and the position of each element relative to others. " +
        "Cover both visual balance and functional grouping."
      );
    case "qa":
      return (
        "Carefully analyze this image and answer any questions about it as thoroughly as possible. " +
        "Ground every statement in what is actually visible; note uncertainty explicitly."
      );
  }
}

export function isTaskName(value: string): value is TaskName {
  return (TASK_PRESETS as readonly string[]).includes(value);
}

/** Validate a `task` string, throwing a clear error when unknown. */
export function assertTaskName(value: string): TaskName {
  if (!isTaskName(value)) {
    throw invalidInput(
      `Unknown task "${value}". Supported tasks: ${TASK_PRESETS.join(", ")}. ` +
        "For anything else, use a free-form prompt instead.",
    );
  }
  return value;
}
