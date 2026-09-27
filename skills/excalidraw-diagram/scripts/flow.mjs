#!/usr/bin/env node
/** Generate an Excalidraw flow or state diagram from a compact JSON spec, laid out with ELK. */

import { drawLayoutEdge, layoutGraph } from "./graph_layout.mjs";
import {
  appendFootnote,
  appendLegend,
  asArray,
  bounds,
  drawHeading,
  drawZone,
  fillOf,
  measure,
  normalizeZones,
  requireId,
  resolveStyle,
  runGenerator,
  SceneBuilder,
  sceneDocument,
  shade,
  SpecError,
  strokeOf,
  textOf,
  translate,
} from "./scene.mjs";

export { SpecError } from "./scene.mjs";

const KINDS = new Set(["step", "decision", "start", "end"]);
const DIRECTIONS = new Set(["RIGHT", "DOWN", "LEFT", "UP"]);
// `main` is the happy path; `failure` and `recovery` are quieter side paths.
const PATHS = new Set(["normal", "main", "failure", "recovery"]);

// `kindTones` is the default tone of steps and decisions in clean.
const STYLE_EXTENSION = { defaults: { kindTones: { step: "blue", decision: "pink" } } };

// Insets of the name in a step, and its smallest width.
const BOX = { padX: 20, padY: 14, minWidth: 120 };
// A diamond holds its name in the middle half of each axis.
const DIAMOND = { padX: 16, padY: 10 };
// Entry and terminal circles: the diameters, and the dot inside the ring.
const CIRCLE = { start: 22, end: 26, dot: 14 };

// The look of each path. A path with a tone uses its dark shade in clean;
// sketch has no colors, so the dash tells the paths apart.
const PATH_LOOKS = {
  normal: { strokeWidth: 2, strokeStyle: "solid", sketchStyle: "solid", tone: null },
  main: { strokeWidth: 3, strokeStyle: "solid", sketchStyle: "solid", tone: null },
  failure: { strokeWidth: 2, strokeStyle: "dashed", sketchStyle: "dashed", tone: "red" },
  recovery: { strokeWidth: 2, strokeStyle: "dashed", sketchStyle: "dotted", tone: "green" },
};

function normalizeNodes(items, groups, style) {
  const nodes = new Map();
  for (const [index, item] of asArray(items, "nodes").entries()) {
    const where = `nodes[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (nodes.has(id) || groups.has(id)) throw new SpecError(`duplicate node "${id}"`);
    const kind = item.kind ?? "step";
    if (!KINDS.has(kind)) throw new SpecError(`${where}.kind must be one of ${[...KINDS].join(", ")}`);
    const tone = item.tone ?? style.kindTones[kind] ?? style.tone;
    shade(tone, 1);
    const group = item.group ?? null;
    if (group !== null && !groups.has(group)) throw new SpecError(`${where}: unknown group "${group}"`);
    nodes.set(id, {
      id,
      kind,
      tone,
      group,
      label: textOf(item.label ?? id, `${where}.label`),
      note: textOf(item.note, `${where}.note`),
      dashed: item.dashed === true,
    });
  }
  if (nodes.size === 0) throw new SpecError("nodes must hold at least one node");
  return nodes;
}

// An edge joins two nodes, or a node and a group: an edge to or from a group
// applies to every node in it.
function normalizeEdges(items, nodes, groups) {
  return asArray(items, "edges").map((item, index) => {
    const where = `edges[${index}]`;
    for (const end of ["from", "to"]) {
      const id = item?.[end];
      if (!nodes.has(id) && !groups.has(id)) throw new SpecError(`${where}: unknown node or group "${id}"`);
    }
    if (nodes.get(item.to)?.kind === "start") throw new SpecError(`${where}: an edge cannot enter the start "${item.to}"`);
    if (nodes.get(item.from)?.kind === "end") throw new SpecError(`${where}: an edge cannot leave the end "${item.from}"`);
    const path = item.path ?? "normal";
    if (!PATHS.has(path)) throw new SpecError(`${where}.path must be one of ${[...PATHS].join(", ")}`);
    return { id: `e${index + 1}`, from: item.from, to: item.to, path, label: textOf(item.label, `${where}.label`) };
  });
}

// A decision needs labeled outcomes: a reader must see which way each answer goes.
function checkDecisions(nodes, edges) {
  for (const node of nodes.values()) {
    if (node.kind !== "decision") continue;
    const outcomes = edges.filter((edge) => edge.from === node.id);
    if (outcomes.length < 2) {
      throw new SpecError(`decision "${node.id}" must have at least two outcomes, not ${outcomes.length}`);
    }
    const unlabeled = outcomes.find((edge) => edge.label === "");
    if (unlabeled) throw new SpecError(`decision "${node.id}": the outcome to "${unlabeled.to}" needs a label`);
  }
}

// Legend items are path samples: `{ path, label }`.
function normalizeLegend(items, style) {
  return asArray(items, "legend").map((item, index) => {
    const where = `legend[${index}]`;
    if (!PATHS.has(item?.path)) throw new SpecError(`${where}.path must be one of ${[...PATHS].join(", ")}`);
    const look = pathLook(style, item.path);
    return { marker: "arrow", label: textOf(item.label, `${where}.label`), ...look.stroke, semantics: look.semantics };
  });
}

export function normalizeSpec(spec) {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) throw new SpecError("spec must be an object");
  const style = resolveStyle(spec.style, STYLE_EXTENSION);
  const direction = spec.direction ?? "DOWN";
  if (!DIRECTIONS.has(direction)) throw new SpecError(`direction must be one of ${[...DIRECTIONS].join(", ")}`);
  const groups = normalizeZones(spec.groups, style, { field: "groups", noun: "group" });
  const nodes = normalizeNodes(spec.nodes, groups, style);
  const edges = normalizeEdges(spec.edges, nodes, groups);
  checkDecisions(nodes, edges);
  return {
    style,
    direction,
    title: textOf(spec.title, "title"),
    subtitle: textOf(spec.subtitle, "subtitle"),
    groups,
    nodes,
    legend: normalizeLegend(spec.legend, style),
    footnote: textOf(spec.footnote, "footnote"),
    edges,
  };
}

// The size of each node shape.
function nodeGeometry(node, style) {
  const text = measure(node.label, style.fontSize, style);
  if (node.kind === "step") {
    return { width: Math.max(BOX.minWidth, Math.ceil(text.width + 2 * BOX.padX)), height: Math.ceil(text.height + 2 * BOX.padY) };
  }
  if (node.kind === "decision") {
    return { width: Math.ceil(2 * (text.width + DIAMOND.padX)), height: Math.ceil(2 * (text.height + DIAMOND.padY)) };
  }
  return { width: CIRCLE[node.kind], height: CIRCLE[node.kind] };
}

const edgeFontSize = (style) => style.fontSize - 2;
const noteFontSize = (style) => style.fontSize - 2;
const OUTLINES = { step: "box", decision: "diamond", start: "circle", end: "circle" };

// The graph for the layout: a circle label goes on the low side, a note on a
// side without edges. A decision sends its other outcomes from its sides.
function layoutInput(graph) {
  const { style } = graph;
  const beside = (node) => {
    const texts = [];
    if (CIRCLE[node.kind] && node.label !== "") {
      texts.push({ id: `${node.id}-label`, ...measure(node.label, style.fontSize, style), place: "low" });
    }
    if (node.note !== "") texts.push({ id: `${node.id}-note`, ...measure(node.note, noteFontSize(style), style), place: "note" });
    return texts;
  };
  return {
    direction: graph.direction,
    groups: [...graph.groups.values()].map((group) => ({
      id: group.id,
      parent: group.parent,
      label: group.label === "" ? null : measure(group.label, style.fontSize, style),
    })),
    nodes: [...graph.nodes.values()].map((node) => ({
      id: node.id,
      group: node.group,
      ...nodeGeometry(node, style),
      outline: OUTLINES[node.kind],
      branches: node.kind === "decision",
      gather: CIRCLE[node.kind] !== undefined,
      beside: beside(node),
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      main: edge.path === "main",
      label: edge.label === "" ? null : measure(edge.label, edgeFontSize(style), style),
    })),
  };
}

// A node with text beside it forms a group, so the text moves with the node.
function drawNode(builder, node, layout) {
  const style = builder.style;
  const { x, y, width, height, beside } = layout;
  const groupIds = beside.size > 0 ? [`${node.id}-node`] : [];
  const note = beside.get(`${node.id}-note`);
  if (note) {
    builder.text(`${node.id}-note`, node.note, note.x, note.y, noteFontSize(style), {
      strokeColor: strokeOf(style, "gray", 5),
      textAlign: note.x + note.width <= x ? "right" : note.x >= x + width ? "left" : "center",
      groupIds,
    });
  }
  if (node.kind === "step" || node.kind === "decision") {
    const shape = builder.base(node.id, node.kind === "step" ? "rectangle" : "diamond", x, y, width, height, {
      strokeColor: strokeOf(style, node.tone, 5),
      backgroundColor: fillOf(style, node.tone, 1),
      strokeStyle: node.dashed ? "dashed" : "solid",
      roundness: node.kind === "step" ? { type: 3 } : null,
      groupIds,
    });
    builder.boundText(shape, `${node.id}-text`, node.label, style.fontSize, groupIds);
    return shape;
  }
  const shape = builder.base(node.id, "ellipse", x, y, width, height, {
    backgroundColor: node.kind === "start" ? style.ink : "transparent",
    groupIds,
  });
  if (node.kind === "end") {
    const inset = (width - CIRCLE.dot) / 2;
    builder.base(`${node.id}-dot`, "ellipse", x + inset, y + inset, CIRCLE.dot, CIRCLE.dot, {
      backgroundColor: style.ink,
      strokeWidth: 1,
      groupIds,
    });
  }
  const label = beside.get(`${node.id}-label`);
  if (label) builder.text(`${node.id}-label`, node.label, label.x, label.y, style.fontSize, { groupIds });
  return shape;
}

function pathLook(style, path) {
  const look = PATH_LOOKS[path];
  return {
    semantics: { strokeStyle: style.preset === "sketch" ? look.sketchStyle : look.strokeStyle, start: null, end: "arrow" },
    stroke: {
      strokeColor: look.tone === null ? style.ink : strokeOf(style, look.tone, 5),
      strokeWidth: look.strokeWidth,
    },
  };
}

export async function buildFlow(spec) {
  const graph = normalizeSpec(spec);
  const { style } = graph;
  const layout = await layoutGraph(layoutInput(graph));

  const body = new SceneBuilder(style);
  const shapes = new Map();
  for (const group of graph.groups.values()) {
    shapes.set(group.id, drawZone(body, `group-${group.id}`, layout.groups.get(group.id), { ...group, plate: true }));
  }
  for (const node of graph.nodes.values()) shapes.set(node.id, drawNode(body, node, layout.nodes.get(node.id)));
  for (const edge of graph.edges) {
    drawLayoutEdge(body, edge.id, layout.edges.get(edge.id), pathLook(style, edge.path), {
      from: shapes.get(edge.from),
      to: shapes.get(edge.to),
      label: edge.label,
      fontSize: edgeFontSize(style),
    });
  }
  // Edges into a zone cross its label: draw the label and its plate over them.
  const zoneLabels = new Set([...graph.groups.keys()].flatMap((id) => [`group-${id}-plate`, `group-${id}-label`]));
  body.elements.sort((a, b) => Number(zoneLabels.has(a.id)) - Number(zoneLabels.has(b.id)));

  const heading = drawHeading(style, graph.title, graph.subtitle);
  const box = bounds(body.elements);
  translate(body.elements, -box.minX, heading.height - box.minY);
  const elements = [...heading.elements, ...body.elements];
  appendLegend(elements, style, graph.legend);
  appendFootnote(elements, style, graph.footnote);
  return sceneDocument(elements, style);
}

await runGenerator(import.meta.url, {
  usage: `Usage: node scripts/flow.mjs <spec.json> [-o <scene.excalidraw>]

Builds an Excalidraw flow or state diagram from a JSON spec and prints the
scene path and size. Export the scene with scripts/export_excalidraw.mjs.`,
  build: buildFlow,
  widthLimit: 1200,
});
