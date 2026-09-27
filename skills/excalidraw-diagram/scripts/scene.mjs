/** Shared scene layer for the diagram generators: styles, element builder, page parts, and CLI. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MEASURED_FONT_FAMILIES, PIXEL_ADVANCE_FAMILIES, textHeight, textWidth } from "./layout.mjs";

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

// The renderer draws a proportional font up to about 3 % wider than the
// advance table, because of kerning and pixel hinting.
const TEXT_WIDTH_MARGIN = 1.04;

export function measure(text, fontSize, style, fontFamily = style.fontFamily) {
  const width = textWidth(text, fontSize, { fontFamily });
  return {
    width: PIXEL_ADVANCE_FAMILIES.has(fontFamily) ? width : width * TEXT_WIDTH_MARGIN,
    height: textHeight(text, fontSize),
  };
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
// Insert `middle`, a point on segment `segment`, as that middle point, and
// balance both halves with collinear points.
function balanceAround(points, segment, middle) {
  const before = [...points.slice(0, segment + 1), middle];
  const after = [middle, ...points.slice(segment + 1)];
  const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  while (before.length < after.length) before.splice(-1, 0, midpoint(before.at(-2), before.at(-1)));
  while (after.length < before.length) after.splice(1, 0, midpoint(after[0], after[1]));
  return [...before, ...after.slice(1)];
}

// Make the midpoint of the path length the middle point.
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
  return balanceAround(points, segment, [ax + (bx - ax) * ratio, ay + (by - ay) * ratio]);
}

// Make the point of the path nearest to `target` the middle point.
function centerAt(points, target) {
  let best = null;
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const [a, b] = [points[segment], points[segment + 1]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const squared = dx * dx + dy * dy;
    const t = squared === 0 ? 0 : Math.min(1, Math.max(0, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dy) / squared));
    const point = [a[0] + dx * t, a[1] + dy * t];
    const gap = Math.hypot(point[0] - target[0], point[1] - target[1]);
    if (best === null || gap < best.gap) best = { segment, point, gap };
  }
  return balanceAround(points, best.segment, best.point);
}

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segmentIntersection([p, p2], [q, q2]) {
  const r = minus(p2, p);
  const s = minus(q2, q);
  const denominator = cross(r, s);
  if (denominator === 0) return null;
  const t = cross(minus(q, p), s) / denominator;
  const u = cross(minus(q, p), r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p[0] + t * r[0], p[1] + t * r[1]];
}

// Port of determineFocusDistance from Excalidraw 0.18.1 for an unrotated
// rectangle: `edge` is the arrow end, `adjacent` the point next to it.
function focusDistance(element, adjacent, edge) {
  const { x, y, width, height } = element;
  const center = [x + width / 2, y + height / 2];
  if (adjacent[0] === edge[0] && adjacent[1] === edge[1]) return 0;
  const sign = -Math.sign(cross(minus(edge, adjacent), minus(edge, center)));
  const direction = minus(edge, adjacent);
  const length = Math.hypot(...direction);
  const reach = Math.max(2 * width, 2 * height);
  const interceptor = [edge, [edge[0] + direction[0] / length * reach, edge[1] + direction[1] / length * reach]];
  const diagonals = [
    [[x - width, y - height], [x + 2 * width, y + 2 * height]],
    [[x + 2 * width, y - height], [x - width, y + 2 * height]],
  ];
  const halfDiagonal = Math.hypot(width, height) / 2;
  const ordered = diagonals
    .map((line) => segmentIntersection(interceptor, line))
    .filter((point) => point !== null)
    .sort((a, b) => distance(a, edge) - distance(b, edge))
    .map((point) => sign * distance(center, point) / halfDiagonal)
    .sort((a, b) => Math.abs(a) - Math.abs(b));
  return ordered[0] ?? 0;
}

// Bind one end of an arrow to a rectangle at the current end point, in two
// formats. Excalidraw 0.18 reads `focus` and `gap`. Later releases, such as
// excalidraw.com, read `fixedPoint` and `mode`: "inside" keeps the end at that
// fraction of the rectangle when the rectangle moves.
export function bindArrow(arrow, end, target) {
  const points = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py]);
  const [edge, adjacent] = end === "start" ? [points[0], points[1]] : [points.at(-1), points.at(-2)];
  arrow[`${end}Binding`] = {
    elementId: target.id,
    focus: focusDistance(target, adjacent, edge),
    gap: 1,
    fixedPoint: [(edge[0] - target.x) / target.width, (edge[1] - target.y) / target.height],
    mode: "inside",
  };
  if (!target.boundElements?.some((bound) => bound.id === arrow.id)) {
    target.boundElements = [...(target.boundElements ?? []), { id: arrow.id, type: "arrow" }];
  }
}

// Where Excalidraw centers a label bound to an arrow: on the middle point, or
// on the middle of the middle segment when the point count is even.
export function arrowLabelCenter(arrow) {
  const points = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py]);
  const middle = Math.floor(points.length / 2);
  if (points.length % 2 === 1) return points[middle];
  return [(points[middle - 1][0] + points[middle][0]) / 2, (points[middle - 1][1] + points[middle][1]) / 2];
}

// Bind a centered label to an arrow, at the point where Excalidraw draws it.
export function labelArrow(builder, arrow, id, text, fontSize) {
  const [centerX, centerY] = arrowLabelCenter(arrow);
  const size = measure(text, fontSize, builder.style);
  arrow.boundElements = [...(arrow.boundElements ?? []), { id, type: "text" }];
  return builder.text(id, text, centerX - size.width / 2, centerY - size.height / 2, fontSize, {
    textAlign: "center",
    verticalAlign: "middle",
    containerId: arrow.id,
  });
}

function placeArrow(arrow, points) {
  const [startX, startY] = points[0];
  arrow.x = startX;
  arrow.y = startY;
  arrow.points = points.map(([px, py]) => [px - startX, py - startY]);
  const xs = arrow.points.map(([px]) => px);
  const ys = arrow.points.map(([, py]) => py);
  arrow.width = Math.max(...xs) - Math.min(...xs);
  arrow.height = Math.max(...ys) - Math.min(...ys);
}

// After an edit of the scene JSON moves shapes, put the ends of every arrow
// bound in the "inside" mode back on their fixed points, as Excalidraw does
// when a user drags a shape. A loop bound at both ends to one shape moves as a
// whole. The label and plate of an arrow (`<id>-label`, `<id>-plate`) follow:
// centered over a two-point arrow, or moved with a loop. A label bound to the
// arrow goes to the point where Excalidraw draws it. Changes the scene in
// place and returns it.
export function rebindScene(scene) {
  const elements = new Map(scene.elements.map((element) => [element.id, element]));
  const fixed = (binding) => {
    const target = elements.get(binding.elementId);
    return [target.x + binding.fixedPoint[0] * target.width, target.y + binding.fixedPoint[1] * target.height];
  };
  for (const arrow of scene.elements) {
    if (arrow.type !== "arrow" || arrow.startBinding?.mode !== "inside" || arrow.endBinding?.mode !== "inside") continue;
    const before = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py]);
    const start = fixed(arrow.startBinding);
    const loop = arrow.startBinding.elementId === arrow.endBinding.elementId;
    const shift = minus(start, before[0]);
    const after = loop
      ? before.map(([px, py]) => [px + shift[0], py + shift[1]])
      : [start, ...before.slice(1, -1), fixed(arrow.endBinding)];
    placeArrow(arrow, after);
    for (const end of ["start", "end"]) bindArrow(arrow, end, elements.get(arrow[`${end}Binding`].elementId));

    const boundLabel = arrow.boundElements?.find((bound) => bound.type === "text");
    if (boundLabel) {
      const text = elements.get(boundLabel.id);
      const [centerX, centerY] = arrowLabelCenter(arrow);
      text.x = centerX - text.width / 2;
      text.y = centerY - text.height / 2;
      continue;
    }
    const label = elements.get(`${arrow.id}-label`);
    if (!label) continue;
    const [dx, dy] = loop || after.length !== 2
      ? shift
      : [(after[0][0] + after[1][0]) / 2 - (label.x + label.width / 2), after[0][1] - before[0][1]];
    for (const element of [label, elements.get(`${arrow.id}-plate`)]) {
      if (!element) continue;
      element.x += dx;
      element.y += dy;
    }
  }
  return scene;
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

  boundText(container, id, text, fontSize, groupIds = []) {
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

  // `fullHeads` inserts points that give each arrowhead a full end segment. An
  // arrow bound at both ends must keep two points: Excalidraw moves only the
  // ends of a longer arrow, and a fixed inner point can fold it back.
  // `labelled` makes the middle of the path the label point; `labelAt` makes
  // the point of the path nearest to it the label point.
  arrow(id, points, semantics, extra = {}, { labelled = false, labelAt = null, fullHeads = true } = {}) {
    if (fullHeads) points = evenEnds(points, semantics.start, semantics.end);
    if (labelAt !== null) points = centerAt(points, labelAt);
    else if (labelled) points = centerMiddle(points);
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

// ELK (the Eclipse Layout Kernel) lays out graphs. The setup script installs it.
export async function loadElk() {
  try {
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    return new ELK();
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      throw new SpecError(`elkjs is not installed.\nRun: ${path.join(path.dirname(fileURLToPath(import.meta.url)), "setup_renderer.sh")}`);
    }
    throw error;
  }
}

// The sides where the flow leaves and enters a node, per ELK direction.
export const FLOW_SIDES = {
  DOWN: ["SOUTH", "NORTH"],
  UP: ["NORTH", "SOUTH"],
  RIGHT: ["EAST", "WEST"],
  LEFT: ["WEST", "EAST"],
};

// ELK 0.12 transposes a compound node's minimum size for vertical layered layouts.
export function elkMinimumSize(direction, width) {
  return direction === "DOWN" || direction === "UP" ? `(0,${width})` : `(${width},0)`;
}

const ZONE_FILLS = ["hachure", "cross-hatch"];

// A zone groups other elements. Draw it before its content. In clean, an
// outer zone is hatched, a nested zone cross-hatched, and a deeper zone pale;
// the label of a hatched zone sits on a plate. In sketch, a zone is a dashed
// ink outline. `depth` is the nesting level, from 0. `plate` puts the label on
// a plate in every zone, so the label can cover lines drawn after the zone.
export function drawZone(builder, id, box, { label, tone, depth = 0, plate = false }) {
  const style = builder.style;
  const sketch = style.preset === "sketch";
  const fillStyle = sketch ? "solid" : ZONE_FILLS[depth] ?? "solid";
  const hatched = fillStyle !== "solid";
  const zone = builder.base(id, "rectangle", box.x, box.y, box.width, box.height, {
    strokeColor: strokeOf(style, tone, 4),
    backgroundColor: sketch ? "transparent" : shade(tone, hatched ? 2 : 1),
    fillStyle,
    strokeWidth: 1,
    strokeStyle: sketch ? "dashed" : "solid",
    roundness: { type: 3 },
  });
  if (label === "") return zone;
  const labelX = box.x + 20;
  const labelY = box.y + 14;
  if (hatched || plate) {
    const size = measure(label, style.fontSize, style);
    builder.base(`${id}-plate`, "rectangle", labelX - 10, labelY - 4, size.width + 20, size.height + 8, {
      strokeColor: sketch ? "transparent" : shade(tone, 4),
      backgroundColor: hatched ? PALETTE.white : style.background,
      strokeWidth: 1,
      roundness: { type: 3 },
    });
  }
  builder.text(`${id}-label`, label, labelX, labelY, style.fontSize);
  return zone;
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
// - { marker: "arrow", semantics, strokeColor, strokeWidth }: a short connector.
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
        strokeWidth: item.strokeWidth ?? 2,
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

// Append a footnote below the elements, left-aligned with them.
export function appendFootnote(elements, style, text) {
  if (text === "") return;
  const box = bounds(elements);
  const footnote = new SceneBuilder(style);
  footnote.text("footnote", text, box.minX, box.maxY + 24, style.fontSize - 2, { strokeColor: strokeOf(style, "gray", 5) });
  elements.push(...footnote.elements);
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
// A scene wider than `widthLimit` gets a warning.
export async function runGenerator(moduleUrl, { usage, build, widthLimit = Infinity }) {
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
    if (box.width > widthLimit) {
      console.error(`WARNING: the scene is wider than ${widthLimit} px; break long labels and names into lines`);
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
