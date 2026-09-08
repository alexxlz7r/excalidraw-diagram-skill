/** Deterministic text and container estimates for generated Excalidraw scenes. */

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
  const factor = charWidthFactor ?? (fontFamily === 3 ? 0.6 : null);
  if (factor === null) {
    throw new TypeError("charWidthFactor is required for font families other than 3");
  }
  positiveNumber(factor, "charWidthFactor");
  const longestLine = Math.max(...textLines(text).map((line) => [...line].length));
  return longestLine * fontSize * factor;
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
