/** Shared scene layer for the diagram generators: styles, element builder, page parts, and CLI. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MEASURED_FONT_FAMILIES, textHeight, textWidth } from "./layout.mjs";

export class SpecError extends Error {}

// Excalidraw 0.18.1 COLOR_PALETTE: open-color indexes 0, 2, 4, 6, 8 per hue.
export const PALETTE = {
  black: "#1e1e1e",
  white: "#ffffff",
  shades: {
    gray: ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
    red: ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
    pink: ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
    grape: ["#f8f0fc", "#eebefa", "#da77f2", "#be4bdb", "#9c36b5"],
    violet: ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
    blue: ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
    cyan: ["#e3fafc", "#99e9f2", "#3bc9db", "#15aabf", "#0c8599"],
    teal: ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
    green: ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
    yellow: ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
    orange: ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
    bronze: ["#f8f1ee", "#eaddd7", "#d2bab0", "#a18072", "#846358"],
  },
};

// Named styles. `clean` is smooth and colored; `sketch` draws rough ink
// outlines without color.
const STYLE_PRESETS = {
  clean: { roughness: 0, fontFamily: 6, codeFontFamily: 3 },
  sketch: { roughness: 1, fontFamily: 5, codeFontFamily: 5 },
};
const DEFAULT_PRESET = "clean";

const DEFAULT_STYLE = {
  fontSize: 20,
  background: PALETTE.white,
  ink: PALETTE.black,
  tone: "gray",
  highlight: "yellow",
};

export const LINE_HEIGHT = 1.25;

// Excalidraw sizes an arrowhead from the length of the end segment: half the
// segment (a quarter for a diamond), up to a fixed maximum per kind. Every end
// segment gets the length for its arrowhead, so arrowheads of one kind have one
// size, and every kind reaches its maximum or 16 px.
export const END_SEGMENT = 32;
const DIAMOND_SEGMENT = 48;

export function endSegment(arrowhead) {
  return arrowhead?.startsWith("diamond") ? DIAMOND_SEGMENT : END_SEGMENT;
}

export function shade(tone, level) {
  const shades = PALETTE.shades[tone];
  if (!shades) throw new SpecError(`Unknown tone "${tone}"`);
  return shades[level - 1];
}

// Fills and strokes of a tone. The sketch style has no colors: white and ink.
export function fillOf(style, tone, level) {
  return style.preset === "sketch" ? PALETTE.white : shade(tone, level);
}

export function strokeOf(style, tone, level) {
  return style.preset === "sketch" ? style.ink : shade(tone, level);
}

// A highlighted row: a stronger fill of its hue, or a gray hatch in sketch.
export function highlightFill(style, hue, level) {
  return style.preset === "sketch"
    ? { backgroundColor: shade("gray", 4), fillStyle: "hachure" }
    : { backgroundColor: shade(hue, level) };
}

// `value` is a preset name, or an object with an optional `preset` and fields
// that override it. `extension` adds the fields of one generator: `defaults`
// for every preset and `presets` per preset name.
export function resolveStyle(value, extension = {}) {
  const fields = typeof value === "string" ? { preset: value } : value ?? {};
  if (typeof fields !== "object" || Array.isArray(fields)) {
    throw new SpecError("style must be a preset name or an object");
  }
  const preset = fields.preset ?? DEFAULT_PRESET;
  if (!Object.hasOwn(STYLE_PRESETS, preset)) {
    throw new SpecError(`style must be "clean" or "sketch", not "${preset}"`);
  }
  const style = {
    ...DEFAULT_STYLE,
    ...extension.defaults,
    ...STYLE_PRESETS[preset],
    ...extension.presets?.[preset],
    ...fields,
    preset,
  };
  for (const key of ["fontFamily", "codeFontFamily"]) {
    if (!MEASURED_FONT_FAMILIES.includes(style[key])) {
      throw new SpecError(`style.${key} must be one of ${MEASURED_FONT_FAMILIES.join(", ")}`);
    }
  }
  shade(style.tone, 1);
  if (![0, 1, 2].includes(style.roughness)) throw new SpecError("style.roughness must be 0, 1, or 2");
  return style;
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

export function asArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SpecError(`${label} must be an array`);
  return value;
}

// Text fields accept a string or an array of lines.
export function textOf(value, label) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((line) => typeof line === "string")) return value.join("\n");
  throw new SpecError(`${label} must be a string or an array of strings`);
}

export function requireId(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new SpecError(`${label} must be a non-empty string`);
  }
  return value;
}

export function measure(text, fontSize, style, fontFamily = style.fontFamily) {
  return { width: textWidth(text, fontSize, { fontFamily }), height: textHeight(text, fontSize) };
}

// Give each arrowhead an end segment of the length that sets its size.
function evenEnds(points, startHead, endHead) {
  const split = (from, to, head) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const target = endSegment(head);
    if (length <= target + 1) return null;
    const ratio = target / length;
    return [to[0] + (from[0] - to[0]) * ratio, to[1] + (from[1] - to[1]) * ratio];
  };
  let result = points;
  if (endHead !== null) {
    const point = split(result.at(-2), result.at(-1), endHead);
    if (point) result = [...result.slice(0, -1), point, result.at(-1)];
  }
  if (startHead !== null) {
    const point = split(result[1], result[0], startHead);
    if (point) result = [result[0], point, ...result.slice(1)];
  }
  return result;
}

// Excalidraw puts an arrow label on the middle point of an odd point list.
// Insert the midpoint of the path length as that middle point, and balance
// both halves with collinear points.
function centerMiddle(points) {
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let segment = 0;
  while (segment < lengths.length - 1 && remaining > lengths[segment]) {
    remaining -= lengths[segment];
    segment += 1;
  }
  const ratio = lengths[segment] === 0 ? 0 : remaining / lengths[segment];
  const [ax, ay] = points[segment];
  const [bx, by] = points[segment + 1];
  const middle = [ax + (bx - ax) * ratio, ay + (by - ay) * ratio];
  const before = [...points.slice(0, segment + 1), middle];
  const after = [middle, ...points.slice(segment + 1)];
  const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  while (before.length < after.length) before.splice(-1, 0, midpoint(before.at(-2), before.at(-1)));
  while (after.length < before.length) after.splice(1, 0, midpoint(after[0], after[1]));
  return [...before, ...after.slice(1)];
}

export class SceneBuilder {
  constructor(style) {
    this.style = style;
    this.elements = [];
  }

  base(id, type, x, y, width, height, extra = {}) {
    const element = {
      id,
      type,
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: this.style.ink,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: this.style.roughness,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: hashSeed(id),
      version: 1,
      versionNonce: hashSeed(`${id}:nonce`),
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
      ...extra,
    };
    this.elements.push(element);
    return element;
  }

  text(id, text, x, y, fontSize, extra = {}) {
    const fontFamily = extra.fontFamily ?? this.style.fontFamily;
    const size = measure(text, fontSize, this.style, fontFamily);
    return this.base(id, "text", x, y, size.width, size.height, {
      strokeWidth: 1,
      text,
      originalText: text,
      fontSize,
      fontFamily,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      autoResize: true,
      lineHeight: LINE_HEIGHT,
      ...extra,
    });
  }

  boundText(container, id, text, fontSize, groupIds) {
    const size = measure(text, fontSize, this.style);
    container.boundElements = [...(container.boundElements ?? []), { id, type: "text" }];
    return this.text(
      id,
      text,
      container.x + (container.width - size.width) / 2,
      container.y + (container.height - size.height) / 2,
      fontSize,
      { textAlign: "center", verticalAlign: "middle", containerId: container.id, groupIds },
    );
  }

  line(id, x, y, width, extra = {}) {
    return this.base(id, "line", x, y, width, 0, {
      points: [[0, 0], [width, 0]],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      ...extra,
    });
  }

  arrow(id, points, semantics, extra = {}, { labelled = false } = {}) {
    points = evenEnds(points, semantics.start, semantics.end);
    if (labelled) points = centerMiddle(points);
    const [startX, startY] = points[0];
    const relative = points.map(([px, py]) => [px - startX, py - startY]);
    const xs = relative.map(([px]) => px);
    const ys = relative.map(([, py]) => py);
    return this.base(id, "arrow", startX, startY, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), {
      strokeStyle: semantics.strokeStyle,
      points: relative,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: semantics.start,
      endArrowhead: semantics.end,
      elbowed: false,
      ...extra,
    });
  }
}

export function bounds(elements) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of elements) {
    const xs = element.points ? element.points.map(([px]) => element.x + px) : [element.x, element.x + element.width];
    const ys = element.points ? element.points.map(([, py]) => element.y + py) : [element.y, element.y + element.height];
    minX = Math.min(minX, ...xs);
    minY = Math.min(minY, ...ys);
    maxX = Math.max(maxX, ...xs);
    maxY = Math.max(maxY, ...ys);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function translate(elements, dx, dy) {
  for (const element of elements) {
    element.x += dx;
    element.y += dy;
  }
}

// The scene title and subtitle at the origin. `height` is the space to leave
// above the content: zero without a title.
export function drawHeading(style, title, subtitle) {
  const builder = new SceneBuilder(style);
  const titleSize = Math.round(style.fontSize * 1.6);
  let height = 0;
  if (title !== "") {
    builder.text("title", title, 0, 0, titleSize);
    height = textHeight(title, titleSize) + 8;
  }
  if (subtitle !== "") {
    builder.text("subtitle", subtitle, 0, height, style.fontSize);
    height += textHeight(subtitle, style.fontSize);
  }
  if (height > 0) height += 32;
  return { elements: builder.elements, height };
}

// Legend items are markers with a label, in rows that wrap at `maxWidth`:
// - { marker: "badge", text, backgroundColor }: a letter in a circle.
// - { marker: "arrow", semantics, strokeColor }: a short connector.
// - { marker: "swatch", fill }: a filled square; `fill` holds its element fields.
function drawLegend(builder, items, left, top, maxWidth) {
  const style = builder.style;
  const fontSize = style.fontSize - 2;
  const markerSize = 28;
  const rowHeight = markerSize + 12;
  let x = left;
  let y = top;
  items.forEach((item, index) => {
    const id = `legend-${index}`;
    const markerWidth = item.marker === "arrow" ? 64 : markerSize;
    const labelWidth = measure(item.label, fontSize, style).width;
    const itemWidth = markerWidth + 10 + labelWidth;
    if (x > left && x + itemWidth > left + maxWidth) {
      x = left;
      y += rowHeight;
    }
    const groupIds = [id];
    if (item.marker === "badge") {
      const badge = builder.base(`${id}-badge`, "ellipse", x, y, markerSize, markerSize, {
        backgroundColor: item.backgroundColor,
        strokeWidth: 1,
        groupIds,
      });
      builder.boundText(badge, `${id}-badge-text`, item.text, fontSize - 2, groupIds);
    } else if (item.marker === "arrow") {
      builder.arrow(`${id}-line`, [[x, y + markerSize / 2], [x + markerWidth, y + markerSize / 2]], item.semantics, {
        strokeColor: item.strokeColor,
        groupIds,
      });
    } else {
      builder.base(`${id}-swatch`, "rectangle", x, y + 2, markerSize, markerSize - 4, {
        ...item.fill,
        strokeWidth: 1,
        groupIds,
      });
    }
    builder.text(`${id}-label`, item.label, x + markerWidth + 10, y + (markerSize - fontSize * LINE_HEIGHT) / 2, fontSize, {
      groupIds,
    });
    x += itemWidth + 36;
  });
}

// Append the legend below the elements, left-aligned with them.
export function appendLegend(elements, style, items) {
  if (items.length === 0) return;
  const box = bounds(elements);
  const legend = new SceneBuilder(style);
  drawLegend(legend, items, box.minX, box.maxY + 36, Math.max(box.width, 600));
  elements.push(...legend.elements);
}

export function sceneDocument(elements, style) {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      viewBackgroundColor: style.background,
      exportBackground: true,
      gridSize: null,
    },
    files: {},
  };
}

function parseArguments(argv) {
  let input = null;
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["-h", "--help"].includes(argument)) return { help: true };
    if (["-o", "--output"].includes(argument)) {
      output = argv[++index];
      if (output === undefined) throw new SpecError(`Missing value for ${argument}`);
    } else if (argument.startsWith("-")) {
      throw new SpecError(`Unknown option: ${argument}`);
    } else if (input === null) {
      input = argument;
    } else {
      throw new SpecError(`Unexpected argument: ${argument}`);
    }
  }
  if (input === null) throw new SpecError("Missing input spec");
  return {
    help: false,
    input,
    output: output ?? input.replace(/(\.json)?$/i, ".excalidraw"),
  };
}

// Run a generator from the command line when `moduleUrl` is the entry point:
// read the JSON spec, build the scene, write it, and print its path and size.
export async function runGenerator(moduleUrl, { usage, build }) {
  if (path.resolve(process.argv[1] ?? "") !== path.resolve(fileURLToPath(moduleUrl))) return;
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) {
      console.log(usage);
      return;
    }
    let spec;
    try {
      spec = JSON.parse(await readFile(parsed.input, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) throw new SpecError(`Invalid JSON in ${parsed.input}: ${error.message}`);
      throw error;
    }
    const scene = await build(spec);
    await writeFile(parsed.output, `${JSON.stringify(scene, null, 2)}\n`);
    const box = bounds(scene.elements);
    console.log(`${path.resolve(parsed.output)} (${Math.ceil(box.width)} × ${Math.ceil(box.height)} px)`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
