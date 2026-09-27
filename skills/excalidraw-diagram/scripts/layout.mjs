/** Deterministic text and container estimates for generated Excalidraw scenes. */

import { readFileSync } from "node:fs";

// Advance widths in em, measured in the renderer by measure_fonts.mjs.
const METRICS = JSON.parse(readFileSync(new URL("./font-metrics.json", import.meta.url), "utf8"));
const ADVANCES = new Map(Object.entries(METRICS.families).map(([family, { widths }]) => [
  Number(family),
  new Map([...METRICS.characters].map((character, index) => [character, widths[index]])),
]));
// A character outside the measured ranges, such as CJK, counts as 1 em.
const UNKNOWN_ADVANCE = 1;
// The renderer rounds each advance of these families to a whole pixel, so
// their widths are exact.
export const PIXEL_ADVANCE_FAMILIES = new Set([3]);

export const MEASURED_FONT_FAMILIES = [...ADVANCES.keys()];

function positiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive number`);
  }
  return value;
}

function textLines(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  return text.split("\n");
}

export function textWidth(
  text,
  fontSize,
  { fontFamily = 3, charWidthFactor = null } = {},
) {
  positiveNumber(fontSize, "fontSize");
  const lines = textLines(text);
  if (charWidthFactor === null) {
    const advances = ADVANCES.get(fontFamily);
    if (!advances) {
      throw new TypeError(
        `charWidthFactor is required for font family ${fontFamily}; measured families: ${MEASURED_FONT_FAMILIES.join(", ")}`,
      );
    }
    const advance = PIXEL_ADVANCE_FAMILIES.has(fontFamily)
      ? (character) => Math.round((advances.get(character) ?? UNKNOWN_ADVANCE) * fontSize)
      : (character) => (advances.get(character) ?? UNKNOWN_ADVANCE) * fontSize;
    const lineWidth = (line) => [...line].reduce((sum, character) => sum + advance(character), 0);
    return Math.max(...lines.map(lineWidth));
  }
  positiveNumber(charWidthFactor, "charWidthFactor");
  return Math.max(...lines.map((line) => [...line].length)) * fontSize * charWidthFactor;
}

export function textHeight(text, fontSize, { lineHeight = 1.25 } = {}) {
  positiveNumber(fontSize, "fontSize");
  positiveNumber(lineHeight, "lineHeight");
  return textLines(text).length * fontSize * lineHeight;
}

export function boxFor(
  text,
  {
    fontSize = 20,
    fontFamily = 3,
    charWidthFactor = null,
    lineHeight = 1.25,
    horizontalPadding = 22,
    verticalPadding = 15,
    minWidth = 0,
    minHeight = 0,
  } = {},
) {
  positiveNumber(horizontalPadding, "horizontalPadding");
  positiveNumber(verticalPadding, "verticalPadding");
  const contentWidth = textWidth(text, fontSize, { fontFamily, charWidthFactor });
  const contentHeight = textHeight(text, fontSize, { lineHeight });
  return {
    width: Math.ceil(Math.max(minWidth, contentWidth + 2 * horizontalPadding)),
    height: Math.ceil(Math.max(minHeight, contentHeight + 2 * verticalPadding)),
  };
}
