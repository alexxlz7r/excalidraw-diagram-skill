#!/usr/bin/env node
/** Generate an Excalidraw architecture diagram from a compact JSON spec, laid out with ELK. */

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

const KINDS = new Set(["service", "store", "external"]);
// The dash of each link kind: a call or an import, an asynchronous message or
// a lazy load, and a generated artifact.
const LINK_DASHES = { call: "solid", async: "dashed", generated: "dotted" };
const DIRECTIONS = new Set(["DOWN", "RIGHT", "UP", "LEFT"]);

// Insets of the text in a component, the gap between the name and the sub
// lines, and the smallest width.
const BOX = { padX: 16, padY: 12, lineGap: 4, minWidth: 120 };
// The end caps of a store cylinder.
const CAP = 18;

// A role is a category of components, such as app, domain, or storage. Its
// tone colors every component of the role in clean.
function normalizeRoles(items) {
  const roles = new Map();
  for (const [index, item] of asArray(items, "roles").entries()) {
    const where = `roles[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (roles.has(id)) throw new SpecError(`duplicate role "${id}"`);
    if (item.tone === undefined) throw new SpecError(`${where}.tone is required`);
    shade(item.tone, 1);
    roles.set(id, { id, label: textOf(item.label ?? id, `${where}.label`), tone: item.tone });
  }
  return roles;
}

// A zone is a boundary, such as a system, a workspace, a scope, or a
// deployment unit. `parent` nests it in another zone. The result lists
// parents before children, with the nesting depth of each zone.
function normalizeZones(items, style) {
  const zones = new Map();
  for (const [index, item] of asArray(items, "zones").entries()) {
    const where = `zones[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (zones.has(id)) throw new SpecError(`duplicate zone "${id}"`);
    const tone = item.tone ?? style.tone;
    shade(tone, 1);
    zones.set(id, { id, where, label: textOf(item.label, `${where}.label`), tone, parent: item.parent ?? null });
  }
  const depthOf = (zone, seen = new Set()) => {
    if (zone.parent === null) return 0;
    if (seen.has(zone.id)) throw new SpecError(`zone "${zone.id}" is inside itself`);
    const parent = zones.get(zone.parent);
    if (!parent) throw new SpecError(`${zone.where}: unknown parent "${zone.parent}"`);
    return 1 + depthOf(parent, new Set([...seen, zone.id]));
  };
  for (const zone of zones.values()) zone.depth = depthOf(zone);
  return new Map([...zones.values()].sort((a, b) => a.depth - b.depth).map((zone) => [zone.id, zone]));
}

function normalizeComponents(items, roles, zones, style) {
  const components = new Map();
  for (const [index, item] of asArray(items, "components").entries()) {
    const where = `components[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (components.has(id) || zones.has(id)) throw new SpecError(`duplicate component "${id}"`);
    const kind = item.kind ?? "service";
    if (!KINDS.has(kind)) throw new SpecError(`${where}.kind must be one of ${[...KINDS].join(", ")}`);
    const zone = item.zone ?? null;
    if (zone !== null && !zones.has(zone)) throw new SpecError(`${where}: unknown zone "${zone}"`);
    const role = item.role ?? null;
    if (role !== null && !roles.has(role)) throw new SpecError(`${where}: unknown role "${role}"`);
    const tone = item.tone ?? roles.get(role)?.tone ?? style.tone;
    shade(tone, 1);
    components.set(id, {
      id,
      kind,
      zone,
      role,
      tone,
      name: textOf(item.name ?? id, `${where}.name`),
      sub: textOf(item.sub, `${where}.sub`),
      proposed: item.proposed === true,
    });
  }
  if (components.size === 0) throw new SpecError("components must hold at least one component");
  return components;
}

// A link joins two components, or a component and a zone.
function normalizeLinks(items, components, zones) {
  return asArray(items, "links").map((item, index) => {
    const where = `links[${index}]`;
    for (const end of ["from", "to"]) {
      const id = item?.[end];
      if (!components.has(id) && !zones.has(id)) throw new SpecError(`${where}: unknown component or zone "${id}"`);
    }
    const kind = item.kind ?? "call";
    if (!Object.hasOwn(LINK_DASHES, kind)) {
      throw new SpecError(`${where}.kind must be one of ${Object.keys(LINK_DASHES).join(", ")}`);
    }
    if (item.tone !== undefined) shade(item.tone, 1);
    return {
      id: `l${index + 1}`,
      from: item.from,
      to: item.to,
      kind,
      both: item.both === true,
      tone: item.tone ?? null,
      label: textOf(item.label, `${where}.label`),
    };
  });
}

// Legend items: `{ role }` for a role swatch, `{ link, label }` for a link
// sample. Without a `legend`, the legend shows every role in clean and every
// link kind in use when there are two or more.
function normalizeLegend(items, { style, roles, links }) {
  const sketch = style.preset === "sketch";
  const roleItem = (role) => ({
    marker: "swatch",
    label: role.label,
    fill: { backgroundColor: fillOf(style, role.tone, 1), strokeColor: strokeOf(style, role.tone, 5) },
  });
  const linkItem = (kind, label) => {
    const look = linkLook(style, { kind, both: false, tone: null });
    return { marker: "arrow", label, semantics: look.semantics, ...look.stroke };
  };
  if (items === undefined) {
    const kinds = Object.keys(LINK_DASHES).filter((kind) => links.some((link) => link.kind === kind));
    return [
      ...(sketch ? [] : [...roles.values()].map(roleItem)),
      ...(kinds.length > 1 ? kinds.map((kind) => linkItem(kind, kind)) : []),
    ];
  }
  return asArray(items, "legend").map((item, index) => {
    const where = `legend[${index}]`;
    if (item?.role !== undefined) {
      if (sketch) throw new SpecError(`${where}: sketch has no colors, so it cannot show a role`);
      if (!roles.has(item.role)) throw new SpecError(`${where}: unknown role "${item.role}"`);
      return roleItem(roles.get(item.role));
    }
    if (!Object.hasOwn(LINK_DASHES, item?.link)) {
      throw new SpecError(`${where} must be { role } or { link, label } with a link kind: ${Object.keys(LINK_DASHES).join(", ")}`);
    }
    return linkItem(item.link, textOf(item.label ?? item.link, `${where}.label`));
  });
}

export function normalizeSpec(spec) {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) throw new SpecError("spec must be an object");
  const style = resolveStyle(spec.style);
  const direction = spec.direction ?? "DOWN";
  if (!DIRECTIONS.has(direction)) throw new SpecError(`direction must be one of ${[...DIRECTIONS].join(", ")}`);
  const roles = normalizeRoles(spec.roles);
  const zones = normalizeZones(spec.zones, style);
  const components = normalizeComponents(spec.components, roles, zones, style);
  const graph = {
    style,
    direction,
    title: textOf(spec.title, "title"),
    subtitle: textOf(spec.subtitle, "subtitle"),
    roles,
    zones,
    components,
    links: normalizeLinks(spec.links, components, zones),
    footnote: textOf(spec.footnote, "footnote"),
  };
  graph.legend = normalizeLegend(spec.legend, graph);
  return graph;
}

const subFontSize = (style) => style.fontSize - 2;
const labelFontSize = (style) => style.fontSize - 2;

// The name and the sub lines: their sizes and the size of the block.
function textBlock(component, style) {
  const name = measure(component.name, style.fontSize, style);
  const sub = component.sub === "" ? null : measure(component.sub, subFontSize(style), style, style.codeFontFamily);
  return {
    name,
    sub,
    width: Math.max(name.width, sub?.width ?? 0),
    height: name.height + (sub === null ? 0 : BOX.lineGap + sub.height),
  };
}

// The size of a component, and the box that holds its text, relative to the
// top-left corner.
function componentGeometry(component, style) {
  const block = textBlock(component, style);
  const innerWidth = Math.ceil(block.width + 2 * BOX.padX);
  const innerHeight = Math.ceil(block.height + 2 * BOX.padY);
  if (component.kind === "external") {
    // An ellipse holds a centered box when each side is √2 times longer.
    const width = Math.ceil(innerWidth * Math.SQRT2);
    const height = Math.ceil(innerHeight * Math.SQRT2);
    return { width, height, block, content: { top: 0, height } };
  }
  const width = Math.max(BOX.minWidth, innerWidth);
  if (component.kind === "store") {
    return { width, height: innerHeight + CAP + CAP / 2, block, content: { top: CAP, height: innerHeight } };
  }
  return { width, height: innerHeight, block, content: { top: 0, height: innerHeight } };
}

function drawText(builder, component, geometry, box, groupIds) {
  const style = builder.style;
  const { block } = geometry;
  const centerX = box.x + box.width / 2;
  const top = box.y + geometry.content.top + (geometry.content.height - block.height) / 2;
  builder.text(`${component.id}-name`, component.name, centerX - block.name.width / 2, top, style.fontSize, {
    textAlign: "center",
    groupIds,
  });
  if (block.sub !== null) {
    builder.text(`${component.id}-sub`, component.sub, centerX - block.sub.width / 2,
      top + block.name.height + BOX.lineGap, subFontSize(style), {
        fontFamily: style.codeFontFamily,
        textAlign: "center",
        strokeColor: strokeOf(style, "gray", 5),
        groupIds,
      });
  }
}

// A component and its text form a group, so they move together. The element
// with the component ID takes the arrow bindings.
function drawComponent(builder, component, geometry, box) {
  const style = builder.style;
  const groupIds = [`${component.id}-component`];
  // A proposed component does not exist yet: its outline is dashed.
  const colors = {
    strokeColor: strokeOf(style, component.tone, 5),
    backgroundColor: fillOf(style, component.tone, 1),
    strokeStyle: component.proposed ? "dashed" : "solid",
  };
  let target;
  if (component.kind === "store") {
    const { x, y, width, height } = box;
    builder.base(`${component.id}-bottom`, "ellipse", x, y + height - CAP, width, CAP, { ...colors, groupIds });
    builder.base(`${component.id}-body`, "rectangle", x, y + CAP / 2, width, height - CAP, {
      ...colors,
      strokeColor: "transparent",
      groupIds,
    });
    for (const [side, sideX] of [["left", x], ["right", x + width]]) {
      builder.base(`${component.id}-${side}`, "line", sideX, y + CAP / 2, 0, height - CAP, {
        strokeColor: colors.strokeColor,
        strokeStyle: colors.strokeStyle,
        points: [[0, 0], [0, height - CAP]],
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null,
        groupIds,
      });
    }
    builder.base(`${component.id}-top`, "ellipse", x, y, width, CAP, { ...colors, groupIds });
    drawText(builder, component, geometry, box, groupIds);
    // Arrows bind to a transparent box over the whole cylinder.
    target = builder.base(component.id, "rectangle", x, y, width, height, {
      strokeColor: "transparent",
      strokeWidth: 1,
      groupIds,
    });
    return target;
  }
  target = builder.base(component.id, component.kind === "external" ? "ellipse" : "rectangle",
    box.x, box.y, box.width, box.height, {
      ...colors,
      roundness: component.kind === "service" ? { type: 3 } : null,
      groupIds,
    });
  drawText(builder, component, geometry, box, groupIds);
  return target;
}

function linkLook(style, link) {
  return {
    semantics: { strokeStyle: LINK_DASHES[link.kind], start: link.both ? "arrow" : null, end: "arrow" },
    stroke: { strokeColor: link.tone === null ? style.ink : strokeOf(style, link.tone, 5), strokeWidth: 2 },
  };
}

export async function buildArchitecture(spec) {
  const graph = normalizeSpec(spec);
  const { style } = graph;
  const geometries = new Map([...graph.components.values()].map((component) => [
    component.id,
    componentGeometry(component, style),
  ]));
  const layout = await layoutGraph({
    direction: graph.direction,
    groups: [...graph.zones.values()].map((zone) => ({
      id: zone.id,
      parent: zone.parent,
      label: zone.label === "" ? null : measure(zone.label, style.fontSize, style),
    })),
    nodes: [...graph.components.values()].map((component) => ({
      id: component.id,
      group: component.zone,
      width: geometries.get(component.id).width,
      height: geometries.get(component.id).height,
      outline: component.kind === "external" ? "circle" : "box",
      branches: false,
      gather: false,
      beside: [],
    })),
    edges: graph.links.map((link) => ({
      id: link.id,
      from: link.from,
      to: link.to,
      main: false,
      label: link.label === "" ? null : measure(link.label, labelFontSize(style), style),
    })),
  });

  const body = new SceneBuilder(style);
  const targets = new Map();
  for (const zone of graph.zones.values()) {
    targets.set(zone.id, drawZone(body, `zone-${zone.id}`, layout.groups.get(zone.id), { ...zone, plate: true }));
  }
  for (const component of graph.components.values()) {
    targets.set(component.id, drawComponent(body, component, geometries.get(component.id), layout.nodes.get(component.id)));
  }
  for (const link of graph.links) {
    drawLayoutEdge(body, link.id, layout.edges.get(link.id), linkLook(style, link), { from: targets.get(link.from), to: targets.get(link.to), label: link.label, fontSize: labelFontSize(style) });
  }
  // Links into a zone cross its label: draw the label and its plate over them.
  const zoneLabels = new Set([...graph.zones.keys()].flatMap((id) => [`zone-${id}-plate`, `zone-${id}-label`]));
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
  usage: `Usage: node scripts/architecture.mjs <spec.json> [-o <scene.excalidraw>]

Builds an Excalidraw architecture diagram from a JSON spec and prints the
scene path and size. Export the scene with scripts/export_excalidraw.mjs.`,
  build: buildArchitecture,
  widthLimit: 1200,
});
