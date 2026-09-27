#!/usr/bin/env node
/** Generate an Excalidraw type map from a compact JSON spec, laid out with ELK. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MEASURED_FONT_FAMILIES, textHeight, textWidth } from "./layout.mjs";

const MODULE_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(MODULE_PATH);

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

const KINDS = {
  class: { badge: "C" },
  interface: { badge: "I" },
  abstract: { badge: "A" },
  struct: { badge: null },
  note: { badge: null },
};

// `reverse` edges run against the layout direction, so parents sit first.
export const RELATIONS = {
  extends: { strokeStyle: "solid", start: null, end: "triangle_outline", reverse: true },
  implements: { strokeStyle: "dashed", start: null, end: "triangle_outline", reverse: true },
  depends: { strokeStyle: "dashed", start: null, end: "arrow", reverse: false },
  association: { strokeStyle: "solid", start: null, end: null, reverse: false },
  navigates: { strokeStyle: "solid", start: null, end: "arrow", reverse: false },
  composition: { strokeStyle: "solid", start: "diamond", end: null, reverse: false },
  aggregation: { strokeStyle: "solid", start: "diamond_outline", end: null, reverse: false },
  annotates: { strokeStyle: "dotted", start: null, end: null, reverse: false },
};

const DIRECTIONS = new Set(["DOWN", "UP", "RIGHT", "LEFT"]);
const SIDES = { left: "WEST", right: "EAST" };

// Named styles. `clean` stacks the compartments of a type as filled boxes and
// hatches the zones; `sketch` draws rough ink outlines without color.
export const STYLE_PRESETS = {
  clean: {
    roughness: 0,
    fontFamily: 6,
    codeFontFamily: 3,
    kindTones: { class: "orange", interface: "blue", abstract: "violet" },
  },
  sketch: {
    roughness: 1,
    fontFamily: 5,
    codeFontFamily: 5,
    kindTones: {},
  },
};
export const DEFAULT_PRESET = "clean";

const DEFAULT_STYLE = {
  fontSize: 20,
  background: PALETTE.white,
  ink: PALETTE.black,
  tone: "gray",
  memberCells: "auto",
  highlight: "yellow",
};

// Insets of the text in a type box.
const BOX = { padX: 12, padY: 8, badgeGap: 10 };

const LINE_HEIGHT = 1.25;
// Excalidraw sizes an arrowhead from the length of the end segment: half the
// segment (a quarter for a diamond), up to a fixed maximum per kind. Every end
// segment gets the length for its arrowhead, so arrowheads of one kind have one
// size, and every kind reaches its maximum or 16 px.
const END_SEGMENT = 32;
const DIAMOND_SEGMENT = 48;
const CELL_PADDING = 6;

function endSegment(arrowhead) {
  return arrowhead?.startsWith("diamond") ? DIAMOND_SEGMENT : END_SEGMENT;
}

function shade(tone, level) {
  const shades = PALETTE.shades[tone];
  if (!shades) throw new SpecError(`Unknown tone "${tone}"`);
  return shades[level - 1];
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

function asArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SpecError(`${label} must be an array`);
  return value;
}

// Text fields accept a string or an array of lines.
function textOf(value, label) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((line) => typeof line === "string")) return value.join("\n");
  throw new SpecError(`${label} must be a string or an array of strings`);
}

function requireId(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new SpecError(`${label} must be a non-empty string`);
  }
  return value;
}

function normalizeMember(member, where, defaultHighlight) {
  if (typeof member === "string" || Array.isArray(member)) {
    return { id: null, text: textOf(member, where), highlight: null };
  }
  if (member && member.text !== undefined) {
    const highlight = member.highlight === true ? defaultHighlight : member.highlight ?? null;
    if (highlight !== null) shade(highlight, 1);
    return { id: member.id ?? null, text: textOf(member.text, `${where}.text`), highlight };
  }
  throw new SpecError(`${where} must be a string, an array of strings, or { text }`);
}

function findMember(type, reference, label) {
  if (reference === undefined || reference === null) return null;
  const members = type.members;
  let index = members.findIndex((member) => member.id === reference);
  if (index < 0) index = members.findIndex((member) => member.text === reference);
  if (index < 0) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`);
    index = members.findIndex((member) => pattern.test(member.text));
  }
  if (index < 0) throw new SpecError(`${label}: "${type.id}" has no member "${reference}"`);
  return index;
}

function sideOf(value, label) {
  if (value === undefined) return null;
  if (!SIDES[value]) throw new SpecError(`${label} must be "left" or "right"`);
  return SIDES[value];
}

function normalizeGraph(graph, style, label) {
  const direction = graph.direction ?? "DOWN";
  if (!DIRECTIONS.has(direction)) {
    throw new SpecError(`${label}: direction must be one of ${[...DIRECTIONS].join(", ")}`);
  }
  const groups = new Map();
  for (const [index, group] of asArray(graph.groups, `${label}.groups`).entries()) {
    const id = requireId(group?.id, `${label}.groups[${index}].id`);
    if (groups.has(id)) throw new SpecError(`${label}: duplicate group "${id}"`);
    const tone = group.tone ?? style.tone;
    shade(tone, 1);
    groups.set(id, {
      id,
      label: textOf(group.label, `${label}.groups[${index}].label`),
      parent: group.parent ?? null,
      tone,
    });
  }
  for (const group of groups.values()) {
    if (group.parent !== null && !groups.has(group.parent)) {
      throw new SpecError(`${label}: group "${group.id}" has unknown parent "${group.parent}"`);
    }
    const seen = new Set([group.id]);
    for (let parent = group.parent; parent !== null; parent = groups.get(parent).parent) {
      if (seen.has(parent)) throw new SpecError(`${label}: group "${group.id}" is nested in itself`);
      seen.add(parent);
    }
  }

  const types = new Map();
  for (const [index, type] of asArray(graph.types, `${label}.types`).entries()) {
    const id = requireId(type?.id, `${label}.types[${index}].id`);
    const where = `${label}.types["${id}"]`;
    if (types.has(id) || groups.has(id)) throw new SpecError(`${label}: duplicate id "${id}"`);
    const kind = type.kind ?? "class";
    if (!KINDS[kind]) throw new SpecError(`${where}: unknown kind "${kind}"`);
    if (type.group !== undefined && !groups.has(type.group)) {
      throw new SpecError(`${where}: unknown group "${type.group}"`);
    }
    const tone = type.tone ?? style.kindTones[kind] ?? style.tone;
    shade(tone, 1);
    if (type.layer !== undefined && (!Number.isInteger(type.layer) || type.layer < 0)) {
      throw new SpecError(`${where}: layer must be a non-negative integer`);
    }
    if (type.place !== undefined && !["first", "last"].includes(type.place)) {
      throw new SpecError(`${where}: place must be "first" or "last"`);
    }
    const cells = type.cells ?? (style.memberCells === "auto" ? kind === "struct" : style.memberCells);
    if (typeof cells !== "boolean") throw new SpecError(`${where}: cells must be true or false`);
    types.set(id, {
      id,
      kind,
      name: kind === "note" ? textOf(type.name, `${where}.name`) : textOf(type.name ?? id, `${where}.name`),
      note: textOf(type.note ?? type.text, `${where}.note`),
      members: asArray(type.members, `${where}.members`)
        .map((member, memberIndex) => normalizeMember(
          member,
          `${where}.members[${memberIndex}]`,
          type.tone === undefined || type.tone === style.tone ? style.highlight : type.tone,
        )),
      cells,
      group: type.group ?? null,
      tone,
      layer: type.layer ?? null,
      place: type.place ?? null,
    });
  }
  if (types.size === 0) throw new SpecError(`${label}: at least one type is required`);

  const relations = [];
  for (const [index, relation] of asArray(graph.relations, `${label}.relations`).entries()) {
    const where = `${label}.relations[${index}]`;
    const from = types.get(relation?.from);
    const to = types.get(relation?.to);
    if (!from) throw new SpecError(`${where}: unknown type "${relation?.from}"`);
    if (!to) throw new SpecError(`${where}: unknown type "${relation?.to}"`);
    const type = relation.type ?? "association";
    if (!RELATIONS[type]) {
      throw new SpecError(`${where}: unknown relation "${type}"; use ${Object.keys(RELATIONS).join(", ")}`);
    }
    if (relation.tone !== undefined) shade(relation.tone, 5);
    const fromMember = findMember(from, relation.fromMember, where);
    relations.push({
      id: `${relation.from}-${type}-${relation.to}-${index}`,
      from: from.id,
      to: to.id,
      type,
      label: textOf(relation.label, `${where}.label`),
      tone: relation.tone ?? null,
      fromMember,
      toMember: findMember(to, relation.toMember, where),
      fromSide: sideOf(relation.fromSide, `${where}.fromSide`),
      toSide: sideOf(relation.toSide, `${where}.toSide`),
      dot: relation.dot ?? (type === "navigates" && fromMember !== null),
    });
  }
  const spacing = { nodes: 50, layers: 56, ...(graph.spacing ?? {}) };
  for (const [key, value] of Object.entries(spacing)) {
    if (!["nodes", "layers"].includes(key)) throw new SpecError(`${label}: unknown spacing "${key}"`);
    if (typeof value !== "number" || value < 0) throw new SpecError(`${label}: spacing.${key} must be a non-negative number`);
  }
  return {
    title: textOf(graph.title, `${label}.title`),
    subtitle: textOf(graph.subtitle, `${label}.subtitle`),
    direction,
    spacing,
    groups,
    types,
    relations,
  };
}

function measure(text, fontSize, style, fontFamily = style.fontFamily) {
  return { width: textWidth(text, fontSize, { fontFamily }), height: textHeight(text, fontSize) };
}

// Fills and strokes of a tone. The sketch style has no colors: white and ink.
function fillOf(style, tone, level) {
  return style.preset === "sketch" ? PALETTE.white : shade(tone, level);
}

function strokeOf(style, tone, level) {
  return style.preset === "sketch" ? style.ink : shade(tone, level);
}

// A highlighted row: a stronger fill of its hue, or a gray hatch in sketch.
function highlightFill(style, hue, level) {
  return style.preset === "sketch"
    ? { backgroundColor: shade("gray", 4), fillStyle: "hachure" }
    : { backgroundColor: shade(hue, level) };
}

function isMethod(text) {
  return text.includes("(");
}

function lineCount(text) {
  return text.split("\n").length;
}

// A type box is a header with the kind badge and the name, then compartments:
// the note, the fields, and the methods. A struct with cells is a record: every
// member gets a cell of its own.
function typeGeometry(type, style) {
  const fontSize = style.fontSize;
  const nameFontSize = fontSize + 2;
  const lineHeight = fontSize * LINE_HEIGHT;
  const hasBadge = KINDS[type.kind].badge !== null;
  const hasHeader = type.name !== "";
  const nameSize = hasHeader ? measure(type.name, nameFontSize, style) : { width: 0, height: 0 };
  const badgeSize = Math.ceil(nameFontSize * LINE_HEIGHT + 6);
  const headerHeight = hasHeader ? Math.ceil(Math.max(hasBadge ? badgeSize : 0, nameSize.height) + 2 * BOX.padY) : 0;
  const headerWidth = hasHeader ? 2 * BOX.padX + (hasBadge ? badgeSize + BOX.badgeGap : 0) + nameSize.width : 0;

  const parts = [];
  if (type.note !== "") parts.push({ id: "note-cell", cell: false, rows: [{ member: null, text: type.note }] });
  if (type.cells) {
    type.members.forEach((member, index) => {
      parts.push({ id: `member-${index}-cell`, cell: true, rows: [{ member: index, text: member.text }] });
    });
  } else {
    const fields = [];
    const methods = [];
    type.members.forEach((member, index) => {
      (isMethod(member.text) ? methods : fields).push({ member: index, text: member.text });
    });
    if (fields.length > 0) parts.push({ id: "fields", cell: false, rows: fields });
    if (methods.length > 0) parts.push({ id: "methods", cell: false, rows: methods });
  }

  const rowTops = [];
  const rowHeights = [];
  let bodyWidth = 0;
  let cursor = headerHeight;
  for (const part of parts) {
    const padY = part.cell ? CELL_PADDING : BOX.padY;
    part.top = cursor;
    let rowCursor = cursor + padY;
    for (const row of part.rows) {
      const fontFamily = row.member === null ? style.fontFamily : style.codeFontFamily;
      row.top = rowCursor;
      row.height = lineCount(row.text) * lineHeight;
      bodyWidth = Math.max(bodyWidth, measure(row.text, fontSize, style, fontFamily).width + 2 * BOX.padX);
      if (row.member !== null) {
        rowTops[row.member] = part.cell ? cursor : rowCursor;
        rowHeights[row.member] = part.cell ? row.height + 2 * padY : row.height;
      }
      rowCursor += row.height;
    }
    part.height = rowCursor + padY - cursor;
    cursor += part.height;
  }
  return {
    width: Math.ceil(Math.max(headerWidth, bodyWidth, 2 * BOX.padX)),
    height: Math.ceil(Math.max(cursor, 2 * BOX.padY)),
    padding: 0,
    fontSize,
    nameFontSize,
    nameSize,
    badgeSize,
    headerHeight,
    hasBadge,
    hasHeader,
    parts,
    rowTops,
    rowHeights,
  };
}

function memberCenterY(geometry, memberIndex) {
  return geometry.rowTops[memberIndex] + geometry.rowHeights[memberIndex] / 2;
}

const FORWARD_SIDE = { RIGHT: "EAST", LEFT: "WEST" };
const BACKWARD_SIDE = { RIGHT: "WEST", LEFT: "EAST" };

// ELK 0.12 transposes a compound node's minimum size for vertical layered layouts.
function minimumSize(direction, width) {
  return direction === "DOWN" || direction === "UP" ? `(0,${width})` : `(${width},0)`;
}

const LAYOUT_SIDES = {
  DOWN: ["SOUTH", "NORTH"],
  UP: ["NORTH", "SOUTH"],
  RIGHT: ["EAST", "WEST"],
  LEFT: ["WEST", "EAST"],
};

function center(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

// Without a draft, ELK chooses free ports; the draft layout then orders the
// final ports so that connectors spread evenly and do not cross at a type.
function buildElkGraph(graph, style, geometries, sides, draft) {
  const ports = new Map();
  const nodes = new Map();
  const usesPartitions = [...graph.types.values()].some((type) => type.layer !== null);

  // ELK reads spacing from the parent of each node, so every group repeats it.
  // Without it, the ELK defaults inside a group shorten the end segments.
  const stub = Math.max(END_SEGMENT, ...graph.relations.map((relation) => endSegment(RELATIONS[relation.type].start)));
  const containerOptions = {
    ...(usesPartitions ? { "elk.partitioning.activate": "true" } : {}),
    "elk.spacing.nodeNode": String(graph.spacing.nodes),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(graph.spacing.layers),
    "elk.spacing.edgeNode": String(END_SEGMENT),
    "elk.spacing.edgeEdge": "16",
    "elk.layered.spacing.edgeNodeBetweenLayers": String(stub),
  };
  for (const group of graph.groups.values()) {
    const label = group.label === "" ? { width: 0, height: 0 } : measure(group.label, style.fontSize, style);
    const labelHeight = group.label === "" ? 0 : label.height + 8;
    nodes.set(group.id, {
      id: group.id,
      layoutOptions: {
        ...containerOptions,
        "elk.padding": `[top=${Math.ceil(24 + labelHeight)},left=24,bottom=24,right=24]`,
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": minimumSize(graph.direction, Math.ceil(label.width + 64)),
      },
      children: [],
    });
  }

  function portFor(type, memberIndex, side) {
    const key = `${type.id}:${memberIndex}:${side}`;
    if (!ports.has(key)) {
      const geometry = geometries.get(type.id);
      ports.set(key, {
        id: `${type.id}.port${ports.size}`,
        owner: type.id,
        x: side === "EAST" ? geometry.width : 0,
        y: memberCenterY(geometry, memberIndex),
        width: 0,
        height: 0,
        layoutOptions: { "elk.port.side": side },
      });
    }
    return ports.get(key).id;
  }

  // A loop connector enters the header of its target, beside the member rows.
  // Each one gets its own port, so arrowheads never share a point.
  const entries = new Map();
  for (const relation of graph.relations) {
    const side = sides?.get(relation.id);
    if (!side?.entry) continue;
    const key = `${relation.to}:${side.to}`;
    entries.set(key, [...(entries.get(key) ?? []), relation]);
  }
  const entryPorts = new Map();
  for (const [key, relations] of entries) {
    const [typeId, side] = key.split(":");
    const geometry = geometries.get(typeId);
    relations.sort((a, b) => sides.get(a.id).order - sides.get(b.id).order);
    relations.forEach((relation, index) => {
      const id = `${typeId}.entry${ports.size}`;
      ports.set(id, {
        id,
        owner: typeId,
        x: side === "EAST" ? geometry.width : 0,
        y: Math.round(geometry.padding + geometry.headerHeight * (index + 1) / (relations.length + 1)),
        width: 0,
        height: 0,
        layoutOptions: { "elk.port.side": side },
      });
      entryPorts.set(relation.id, id);
    });
  }

  const plans = graph.relations.map((relation) => {
    const from = graph.types.get(relation.from);
    const to = graph.types.get(relation.to);
    const side = sides?.get(relation.id);
    let source = relation.fromMember === null || !side
      ? from.id
      : portFor(from, relation.fromMember, side.from);
    let target = entryPorts.get(relation.id) ?? (relation.toMember === null || !side
      ? to.id
      : portFor(to, relation.toMember, side.to));
    let sourceType = from.id;
    let targetType = to.id;
    if (RELATIONS[relation.type].reverse) {
      [source, target] = [target, source];
      [sourceType, targetType] = [targetType, sourceType];
    }
    return { relation, source, target, sourceType, targetType };
  });

  // Connectors without a member port leave and enter a type through ports
  // spread evenly along the side that faces the layout flow. A free port can
  // land on a corner of a narrow type.
  if (draft) {
    const [outSide, inSide] = LAYOUT_SIDES[graph.direction];
    const vertical = outSide === "SOUTH" || outSide === "NORTH";
    const slots = new Map();
    const add = (typeId, side, plan, end, otherId) => {
      const key = `${typeId}:${side}`;
      const other = center(draft.get(otherId));
      slots.set(key, [...(slots.get(key) ?? []), { plan, end, order: vertical ? other.x : other.y }]);
    };
    for (const plan of plans) {
      if (plan.source === plan.sourceType) add(plan.sourceType, outSide, plan, "source", plan.targetType);
      if (plan.target === plan.targetType) add(plan.targetType, inSide, plan, "target", plan.sourceType);
    }
    for (const [key, list] of slots) {
      const [typeId, side] = key.split(":");
      const geometry = geometries.get(typeId);
      list.sort((a, b) => a.order - b.order);
      list.forEach(({ plan, end }, index) => {
        const fraction = (index + 1) / (list.length + 1);
        const id = `${typeId}.side${ports.size}`;
        ports.set(id, {
          id,
          owner: typeId,
          x: vertical ? Math.round(geometry.width * fraction) : (side === "EAST" ? geometry.width : 0),
          y: vertical ? (side === "SOUTH" ? geometry.height : 0) : Math.round(geometry.height * fraction),
          width: 0,
          height: 0,
          layoutOptions: { "elk.port.side": side },
        });
        plan[end] = id;
      });
    }
  }

  const edges = plans.map(({ relation, source, target }) => {
    const edge = { id: relation.id, sources: [source], targets: [target] };
    if (relation.label !== "") {
      const size = measure(relation.label, style.fontSize - 2, style);
      edge.labels = [{ id: `${relation.id}-label`, text: relation.label, width: size.width + 8, height: size.height + 4 }];
    }
    return edge;
  });

  for (const type of graph.types.values()) {
    const geometry = geometries.get(type.id);
    const typePorts = [...ports.values()].filter((port) => port.owner === type.id)
      .map(({ owner, ...port }) => port);
    const layoutOptions = {};
    if (typePorts.length > 0) layoutOptions["elk.portConstraints"] = "FIXED_POS";
    if (type.layer !== null) layoutOptions["elk.partitioning.partition"] = String(type.layer);
    if (type.place !== null) {
      layoutOptions["elk.layered.layering.layerConstraint"] = type.place.toUpperCase();
    }
    const node = { id: type.id, width: geometry.width, height: geometry.height, layoutOptions };
    if (typePorts.length > 0) node.ports = typePorts;
    const parent = type.group === null ? null : nodes.get(type.group);
    if (parent) parent.children.push(node);
    else nodes.set(type.id, node);
  }

  const rootChildren = [];
  for (const group of graph.groups.values()) {
    const node = nodes.get(group.id);
    if (group.parent === null) rootChildren.push(node);
    else nodes.get(group.parent).children.push(node);
  }
  for (const type of graph.types.values()) {
    if (type.group === null) rootChildren.push(nodes.get(type.id));
  }

  return {
    id: "root",
    layoutOptions: {
      ...containerOptions,
      "elk.algorithm": "layered",
      "elk.direction": graph.direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.json.edgeCoords": "ROOT",
      "elk.json.shapeCoords": "ROOT",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.edgeLabels.placement": "CENTER",
      "elk.edgeLabels.inline": "true",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children: rootChildren,
    edges,
  };
}

async function loadElk() {
  try {
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    return new ELK();
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      throw new SpecError(`elkjs is not installed.\nRun: ${path.join(SCRIPT_DIR, "setup_renderer.sh")}`);
    }
    throw error;
  }
}

function flattenLayout(node, into = new Map()) {
  for (const child of node.children ?? []) {
    into.set(child.id, child);
    flattenLayout(child, into);
  }
  return into;
}

// Member connectors leave the side of the row that faces the other type. A
// horizontal layout knows that side in advance; a vertical one reads it from
// the draft layout.
function resolveSides(graph, draft) {
  const sides = new Map();
  const memberRelations = graph.relations.filter((relation) =>
    relation.fromMember !== null || relation.toMember !== null);
  if (memberRelations.length === 0) return sides;
  if (FORWARD_SIDE[graph.direction]) {
    for (const relation of memberRelations) {
      sides.set(relation.id, {
        from: relation.fromSide ?? FORWARD_SIDE[graph.direction],
        to: relation.toSide ?? BACKWARD_SIDE[graph.direction],
        entry: false,
        order: 0,
      });
    }
    return sides;
  }
  const pointerCount = new Map();
  for (const relation of memberRelations) {
    if (relation.fromMember !== null) pointerCount.set(relation.from, (pointerCount.get(relation.from) ?? 0) + 1);
  }
  for (const relation of memberRelations) {
    const source = draft.get(relation.from);
    const target = draft.get(relation.to);
    const offset = Math.abs((target.x + target.width / 2) - (source.x + source.width / 2));
    // Only a type with a single pointer forms a chain link; the targets of
    // several pointers share the next layer and are entered from above.
    const sameColumn = pointerCount.get(relation.from) === 1
      && offset < Math.min(source.width, target.width) / 4;
    let from;
    let to;
    if (sameColumn) {
      // A connector to a type in the same column loops on one side, which
      // keeps the column straight instead of stepping into a staircase.
      from = relation.fromSide ?? relation.toSide ?? "EAST";
      to = relation.toSide ?? from;
    } else {
      const rightward = target.x + target.width / 2 >= source.x + source.width / 2;
      from = relation.fromSide ?? (rightward ? "EAST" : "WEST");
      to = relation.toSide ?? (rightward ? "WEST" : "EAST");
    }
    sides.set(relation.id, {
      from,
      to,
      entry: sameColumn && relation.fromMember !== null && relation.toMember === null,
      order: source.y + (relation.fromMember === null ? source.height / 2 : 0),
    });
  }
  return sides;
}

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

class SceneBuilder {
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

// Clean zones: hachure outside, cross-hatch one level in, a solid pale fill
// deeper. The title sits on a solid plate, never on the hatch.
const ZONE_FILLS = ["hachure", "cross-hatch"];

function drawGroup(builder, group, layout, prefix, depth) {
  const style = builder.style;
  const id = `${prefix}group-${group.id}`;
  const sketch = style.preset === "sketch";
  const fillStyle = sketch ? "solid" : ZONE_FILLS[depth] ?? "solid";
  const hatched = fillStyle !== "solid";
  builder.base(id, "rectangle", layout.x, layout.y, layout.width, layout.height, {
    strokeColor: strokeOf(style, group.tone, 4),
    backgroundColor: sketch ? "transparent" : shade(group.tone, hatched ? 2 : 1),
    fillStyle,
    strokeWidth: 1,
    strokeStyle: sketch ? "dashed" : "solid",
    roundness: { type: 3 },
  });
  if (group.label === "") return;
  const labelX = layout.x + 20;
  const labelY = layout.y + 14;
  if (hatched) {
    const size = measure(group.label, style.fontSize, style);
    builder.base(`${id}-plate`, "rectangle", labelX - 10, labelY - 4, size.width + 20, size.height + 8, {
      strokeColor: shade(group.tone, 4),
      backgroundColor: PALETTE.white,
      strokeWidth: 1,
      roundness: { type: 3 },
    });
  }
  builder.text(`${id}-label`, group.label, labelX, labelY, style.fontSize);
}

// Clean stacks the header and the compartments as filled boxes with sharp
// corners. Sketch draws one rounded outline and divides it with rules.
function drawType(builder, type, geometry, layout, prefix) {
  const style = builder.style;
  const sketch = style.preset === "sketch";
  const groupIds = [`${prefix}type-${type.id}`];
  const { x, y } = layout;
  const outer = builder.base(`${prefix}${type.id}`, "rectangle", x, y, geometry.width, geometry.height, {
    backgroundColor: fillOf(style, type.tone, 1),
    strokeStyle: type.kind === "note" ? "dashed" : "solid",
    roundness: sketch ? { type: 3 } : null,
    groupIds,
  });

  if (geometry.hasHeader) {
    if (!sketch) {
      builder.base(`${prefix}${type.id}-header`, "rectangle", x, y, geometry.width, geometry.headerHeight, {
        backgroundColor: shade(type.tone, 2),
        strokeWidth: 1,
        groupIds,
      });
    }
    let nameX = x + BOX.padX;
    if (geometry.hasBadge) {
      const size = geometry.badgeSize;
      const badge = builder.base(`${prefix}${type.id}-badge`, "ellipse", nameX, y + (geometry.headerHeight - size) / 2, size, size, {
        backgroundColor: PALETTE.white,
        strokeWidth: 1,
        groupIds,
      });
      builder.boundText(badge, `${prefix}${type.id}-badge-text`, KINDS[type.kind].badge, geometry.fontSize - 2, groupIds);
      nameX += size + BOX.badgeGap;
    }
    builder.text(`${prefix}${type.id}-name`, type.name, nameX, y + (geometry.headerHeight - geometry.nameSize.height) / 2,
      geometry.nameFontSize, { groupIds });
  }

  geometry.parts.forEach((part, index) => {
    const top = y + part.top;
    const cellHighlight = part.cell ? type.members[part.rows[0].member].highlight : null;
    if (sketch) {
      if (part.top > 0) builder.line(`${prefix}${type.id}-rule-${index}`, x, top, geometry.width, { groupIds });
      if (cellHighlight !== null) {
        builder.base(`${prefix}${type.id}-${part.id}`, "rectangle", x, top, geometry.width, part.height, {
          ...highlightFill(style, cellHighlight, 3),
          strokeColor: "transparent",
          strokeWidth: 1,
          groupIds,
        });
      }
    } else {
      builder.base(`${prefix}${type.id}-${part.id}`, "rectangle", x, top, geometry.width, part.height, {
        backgroundColor: cellHighlight === null ? shade(type.tone, 1) : shade(cellHighlight, 3),
        strokeWidth: 1,
        groupIds,
      });
    }
    for (const row of part.rows) {
      if (row.member === null) {
        builder.text(`${prefix}${type.id}-note`, row.text, x + BOX.padX, y + row.top, geometry.fontSize, { groupIds });
        continue;
      }
      const id = `${prefix}${type.id}-member-${row.member}`;
      const highlight = type.members[row.member].highlight;
      if (highlight !== null && !part.cell) {
        builder.base(`${id}-highlight`, "rectangle", x + 1, y + row.top, geometry.width - 2, row.height, {
          ...highlightFill(style, highlight, 2),
          strokeColor: "transparent",
          strokeWidth: 1,
          roughness: 0,
          groupIds,
        });
      }
      builder.text(id, row.text, x + BOX.padX, y + row.top, geometry.fontSize, { fontFamily: style.codeFontFamily, groupIds });
    }
  });
  return outer;
}

function sectionPoints(edge) {
  const section = edge.sections?.[0];
  if (!section) throw new SpecError(`ELK returned no route for ${edge.id}`);
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
    .map((point) => [point.x, point.y]);
}

function drawRelation(builder, relation, edge, outers, prefix) {
  const semantics = RELATIONS[relation.type];
  let points = sectionPoints(edge);
  if (semantics.reverse) points = points.reverse();
  const id = `${prefix}${relation.id}`;
  const from = outers.get(relation.from);
  const to = outers.get(relation.to);
  const arrow = builder.arrow(id, points, {
    ...semantics,
    start: relation.dot && semantics.start === null ? "dot" : semantics.start,
  }, {
    strokeColor: relation.tone === null ? builder.style.ink : strokeOf(builder.style, relation.tone, 5),
    startBinding: { elementId: from.id, focus: 0, gap: 1 },
    endBinding: { elementId: to.id, focus: 0, gap: 1 },
  }, { labelled: relation.label !== "" });
  for (const outer of [from, to]) {
    outer.boundElements = [...(outer.boundElements ?? []), { id: arrow.id, type: "arrow" }];
  }
  if (relation.label !== "") {
    // Excalidraw centers an arrow label on the middle point, or on the middle
    // of the middle segment when the point count is even.
    const final = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py]);
    const middle = Math.floor(final.length / 2);
    const [centerX, centerY] = final.length % 2 === 1
      ? final[middle]
      : [(final[middle - 1][0] + final[middle][0]) / 2, (final[middle - 1][1] + final[middle][1]) / 2];
    const fontSize = builder.style.fontSize - 2;
    const size = measure(relation.label, fontSize, builder.style);
    arrow.boundElements = [...(arrow.boundElements ?? []), { id: `${id}-label`, type: "text" }];
    builder.text(`${id}-label`, relation.label, centerX - size.width / 2, centerY - size.height / 2, fontSize, {
      textAlign: "center",
      verticalAlign: "middle",
      containerId: arrow.id,
    });
  }
}

function bounds(elements) {
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

function translate(elements, dx, dy) {
  for (const element of elements) {
    element.x += dx;
    element.y += dy;
  }
}

async function layoutGraph(elk, graph, style, prefix) {
  const geometries = new Map([...graph.types.values()].map((type) => [type.id, typeGeometry(type, style)]));
  const draft = flattenLayout(await elk.layout(buildElkGraph(graph, style, geometries, null, null)));
  const sides = resolveSides(graph, draft);
  const layout = await elk.layout(buildElkGraph(graph, style, geometries, sides, draft));
  const layoutNodes = flattenLayout(layout);
  const builder = new SceneBuilder(style);

  const depth = (group) => (group.parent === null ? 0 : 1 + depth(graph.groups.get(group.parent)));
  const groups = [...graph.groups.values()].sort((a, b) => depth(a) - depth(b));
  for (const group of groups) drawGroup(builder, group, layoutNodes.get(group.id), prefix, depth(group));

  const outers = new Map();
  for (const type of graph.types.values()) {
    outers.set(type.id, drawType(builder, type, geometries.get(type.id), layoutNodes.get(type.id), prefix));
  }
  const edges = new Map(layout.edges.map((edge) => [edge.id, edge]));
  for (const relation of graph.relations) {
    drawRelation(builder, relation, edges.get(relation.id), outers, prefix);
  }
  return builder.elements;
}

function normalizeLegend(items, style) {
  return asArray(items, "legend").map((item, index) => {
    const where = `legend[${index}]`;
    const label = textOf(item?.label, `${where}.label`);
    if (label === "") throw new SpecError(`${where}.label is required`);
    const tone = item.tone ?? style.kindTones[item.kind] ?? style.tone;
    shade(tone, 1);
    if (item.kind !== undefined) {
      if (!KINDS[item.kind]?.badge) throw new SpecError(`${where}.kind must be class, interface, or abstract`);
      return { type: "kind", kind: item.kind, tone, label };
    }
    if (item.relation !== undefined) {
      if (!RELATIONS[item.relation]) throw new SpecError(`${where}: unknown relation "${item.relation}"`);
      return { type: "relation", relation: item.relation, tone: item.tone ?? null, label };
    }
    if (item.highlight !== undefined) {
      const hue = item.highlight === true ? style.highlight : item.highlight;
      shade(hue, 1);
      return { type: "highlight", tone: hue, label };
    }
    if (item.tone !== undefined) {
      if (style.preset === "sketch") {
        throw new SpecError(`${where}: the sketch style has no colors; remove the tone item or use the clean style`);
      }
      return { type: "tone", tone, label };
    }
    throw new SpecError(`${where} needs kind, relation, highlight, or tone`);
  });
}

function drawLegend(builder, items, left, top, maxWidth) {
  const style = builder.style;
  const fontSize = style.fontSize - 2;
  const markerSize = 28;
  const rowHeight = markerSize + 12;
  let x = left;
  let y = top;
  items.forEach((item, index) => {
    const id = `legend-${index}`;
    const markerWidth = item.type === "relation" ? 64 : markerSize;
    const labelWidth = measure(item.label, fontSize, style).width;
    const itemWidth = markerWidth + 10 + labelWidth;
    if (x > left && x + itemWidth > left + maxWidth) {
      x = left;
      y += rowHeight;
    }
    const groupIds = [id];
    if (item.type === "kind") {
      const kind = KINDS[item.kind];
      const badge = builder.base(`${id}-badge`, "ellipse", x, y, markerSize, markerSize, {
        backgroundColor: fillOf(style, item.tone, 2),
        strokeWidth: 1,
        groupIds,
      });
      builder.boundText(badge, `${id}-badge-text`, kind.badge, fontSize - 2, groupIds);
    } else if (item.type === "relation") {
      const semantics = RELATIONS[item.relation];
      builder.arrow(`${id}-line`, [[x, y + markerSize / 2], [x + markerWidth, y + markerSize / 2]], semantics, {
        strokeColor: item.tone === null ? style.ink : strokeOf(style, item.tone, 5),
        groupIds,
      });
    } else {
      // A tone swatch shows a type: title bar color and outline. A highlight
      // swatch shows a highlighted row: a stronger fill without outline.
      builder.base(`${id}-swatch`, "rectangle", x, y + 2, markerSize, markerSize - 4, {
        ...(item.type === "tone" ? { backgroundColor: shade(item.tone, 2) } : highlightFill(style, item.tone, 2)),
        strokeColor: item.type === "tone" ? style.ink : "transparent",
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

// `style` is a preset name, or an object with an optional `preset` and fields
// that override it.
function resolveStyle(value) {
  const fields = typeof value === "string" ? { preset: value } : value ?? {};
  if (typeof fields !== "object" || Array.isArray(fields)) {
    throw new SpecError("style must be a preset name or an object");
  }
  const preset = fields.preset ?? DEFAULT_PRESET;
  if (!Object.hasOwn(STYLE_PRESETS, preset)) {
    throw new SpecError(`style must be "clean" or "sketch", not "${preset}"`);
  }
  const style = { ...DEFAULT_STYLE, ...STYLE_PRESETS[preset], ...fields, preset };
  for (const key of ["fontFamily", "codeFontFamily"]) {
    if (!MEASURED_FONT_FAMILIES.includes(style[key])) {
      throw new SpecError(`style.${key} must be one of ${MEASURED_FONT_FAMILIES.join(", ")}`);
    }
  }
  return style;
}

export function normalizeSpec(spec) {
  if (!spec || typeof spec !== "object") throw new SpecError("Spec must be a JSON object");
  const style = resolveStyle(spec.style);
  shade(style.tone, 1);
  for (const tone of Object.values(style.kindTones)) shade(tone, 1);
  if (![0, 1, 2].includes(style.roughness)) throw new SpecError("style.roughness must be 0, 1, or 2");
  if (!["auto", true, false].includes(style.memberCells)) {
    throw new SpecError('style.memberCells must be "auto", true, or false');
  }
  const single = spec.panels === undefined;
  const panelSpecs = single ? [{ ...spec, title: undefined, subtitle: undefined }] : asArray(spec.panels, "panels");
  if (panelSpecs.length === 0) throw new SpecError("panels must not be empty");
  const panels = panelSpecs.map((panel, index) =>
    normalizeGraph(panel, style, single ? "spec" : `panels[${index}]`));
  if (spec.arrange !== undefined && !["row", "column"].includes(spec.arrange)) {
    throw new SpecError('arrange must be "row" or "column"');
  }
  if (spec.align !== undefined && !["top", "bottom"].includes(spec.align)) {
    throw new SpecError('align must be "top" or "bottom"');
  }
  return {
    title: textOf(spec.title, "title"),
    subtitle: textOf(spec.subtitle, "subtitle"),
    arrange: spec.arrange ?? "row",
    align: spec.align ?? "top",
    legend: normalizeLegend(spec.legend, style),
    style,
    panels,
  };
}

export async function buildTypeMap(spec) {
  const normalized = normalizeSpec(spec);
  const { style } = normalized;
  const elk = await loadElk();
  const panelGap = 96;
  const titleSize = Math.round(style.fontSize * 1.6);
  const panelTitleSize = style.fontSize + 6;
  const subtitleSize = style.fontSize - 2;
  const header = new SceneBuilder(style);
  let headerHeight = 0;
  if (normalized.title !== "") {
    header.text("title", normalized.title, 0, 0, titleSize);
    headerHeight = textHeight(normalized.title, titleSize) + 8;
  }
  if (normalized.subtitle !== "") {
    header.text("subtitle", normalized.subtitle, 0, headerHeight, style.fontSize);
    headerHeight += textHeight(normalized.subtitle, style.fontSize);
  }
  if (headerHeight > 0) headerHeight += 32;

  const elements = [];
  const panelBoxes = [];
  let cursor = 0;
  for (const [index, panel] of normalized.panels.entries()) {
    const prefix = normalized.panels.length === 1 ? "" : `p${index + 1}-`;
    const panelElements = await layoutGraph(elk, panel, style, prefix);
    const box = bounds(panelElements);
    const panelHeader = new SceneBuilder(style);
    let panelHeaderHeight = 0;
    if (panel.title !== "") {
      panelHeader.text(`${prefix}title`, panel.title, 0, 0, panelTitleSize);
      panelHeaderHeight = textHeight(panel.title, panelTitleSize) + 4;
    }
    if (panel.subtitle !== "") {
      panelHeader.text(`${prefix}subtitle`, panel.subtitle, 0, panelHeaderHeight, subtitleSize);
      panelHeaderHeight += textHeight(panel.subtitle, subtitleSize);
    }
    if (panelHeaderHeight > 0) panelHeaderHeight += 20;
    const originX = normalized.arrange === "row" ? cursor : 0;
    const originY = headerHeight + (normalized.arrange === "row" ? 0 : cursor);
    translate(panelElements, originX - box.minX, originY + panelHeaderHeight - box.minY);
    translate(panelHeader.elements, originX, originY);
    elements.push(...panelHeader.elements, ...panelElements);
    const width = Math.max(box.width, ...panelHeader.elements.map((element) => element.width));
    const height = box.height + panelHeaderHeight;
    panelBoxes.push({ x: originX, y: originY, width, height });
    panelBoxes.at(-1).elements = [...panelHeader.elements, ...panelElements];
    panelBoxes.at(-1).graphHeight = box.height;
    cursor += (normalized.arrange === "row" ? width : height) + panelGap;
  }

  // Bottom alignment puts the last layer of every panel on one line, so the
  // matching parts of a before-and-after comparison sit side by side.
  if (normalized.arrange === "row" && normalized.align === "bottom") {
    const bottom = Math.max(...panelBoxes.map((box) => box.y + box.height));
    for (const box of panelBoxes) {
      const shift = bottom - (box.y + box.height);
      const graphElements = box.elements.filter((element) => !/(^|-)(title|subtitle)$/.test(element.id));
      translate(graphElements, 0, shift);
    }
  }

  if (normalized.panels.length > 1) {
    const divider = new SceneBuilder(style);
    const contentBottom = Math.max(...panelBoxes.map((box) => box.y + box.height));
    const contentRight = Math.max(...panelBoxes.map((box) => box.x + box.width));
    panelBoxes.slice(1).forEach((box, index) => {
      const line = normalized.arrange === "row"
        ? [[box.x - panelGap / 2, headerHeight], [box.x - panelGap / 2, contentBottom]]
        : [[0, box.y - panelGap / 2], [contentRight, box.y - panelGap / 2]];
      divider.base(`divider-${index + 1}`, "line", line[0][0], line[0][1], line[1][0] - line[0][0], line[1][1] - line[0][1], {
        strokeColor: strokeOf(style, "gray", 3),
        strokeWidth: 1,
        strokeStyle: "dashed",
        points: [[0, 0], [line[1][0] - line[0][0], line[1][1] - line[0][1]]],
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null,
      });
    });
    elements.push(...divider.elements);
  }
  elements.unshift(...header.elements);

  if (normalized.legend.length > 0) {
    const box = bounds(elements);
    const legend = new SceneBuilder(style);
    drawLegend(legend, normalized.legend, box.minX, box.maxY + 36, Math.max(box.width, 600));
    elements.push(...legend.elements);
  }

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

function usage() {
  return `Usage: node scripts/type_map.mjs <spec.json> [-o <scene.excalidraw>]

Builds an Excalidraw type map from a JSON spec and prints the scene path and
size. Export the scene with scripts/export_excalidraw.mjs.`;
}

export function parseArguments(argv) {
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

async function main() {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) {
      console.log(usage());
      return;
    }
    let spec;
    try {
      spec = JSON.parse(await readFile(parsed.input, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) throw new SpecError(`Invalid JSON in ${parsed.input}: ${error.message}`);
      throw error;
    }
    const scene = await buildTypeMap(spec);
    await writeFile(parsed.output, `${JSON.stringify(scene, null, 2)}\n`);
    const box = bounds(scene.elements);
    console.log(`${path.resolve(parsed.output)} (${Math.ceil(box.width)} × ${Math.ceil(box.height)} px)`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(MODULE_PATH)) {
  await main();
}
