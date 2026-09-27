#!/usr/bin/env node
/** Generate an Excalidraw use-case map from a compact JSON spec, laid out with ELK. */

import { drawLayoutEdge, layoutGraph } from "./graph_layout.mjs";
import {
  appendFootnote,
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

// A stick figure: the head diameter, the body and leg lengths, and the arm span.
const FIGURE = { head: 16, body: 22, legs: 18, span: 36 };
// Insets of the name in a use case oval.
const OVAL = { padX: 14, padY: 8 };

function normalizeActors(items) {
  const actors = new Map();
  for (const [index, item] of asArray(items, "actors").entries()) {
    const where = `actors[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (actors.has(id)) throw new SpecError(`duplicate actor "${id}"`);
    const side = item.side ?? "left";
    if (side !== "left" && side !== "right") throw new SpecError(`${where}.side must be "left" or "right"`);
    actors.set(id, { id, side, name: textOf(item.name ?? id, `${where}.name`), primary: item.primary === true });
  }
  return actors;
}

function normalizeJourneys(items, style) {
  const journeys = new Map();
  for (const [index, item] of asArray(items, "journeys").entries()) {
    const where = `journeys[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (journeys.has(id)) throw new SpecError(`duplicate journey "${id}"`);
    const tone = item.tone ?? style.tone;
    shade(tone, 1);
    journeys.set(id, { id, label: textOf(item.label ?? id, `${where}.label`), tone });
  }
  return journeys;
}

function normalizeCases(items, journeys, actors, style) {
  const cases = new Map();
  for (const [index, item] of asArray(items, "cases").entries()) {
    const where = `cases[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (cases.has(id) || actors.has(id)) throw new SpecError(`duplicate use case "${id}"`);
    const journey = item.journey ?? null;
    if (journey !== null && !journeys.has(journey)) throw new SpecError(`${where}: unknown journey "${journey}"`);
    cases.set(id, {
      id,
      journey,
      tone: journeys.get(journey)?.tone ?? style.tone,
      name: textOf(item.name ?? id, `${where}.name`),
      primary: item.primary === true,
    });
  }
  if (cases.size === 0) throw new SpecError("cases must hold at least one use case");
  return cases;
}

function normalizeLinks(items, actors, cases) {
  return asArray(items, "links").map((item, index) => {
    const where = `links[${index}]`;
    for (const end of ["from", "to"]) {
      const id = item?.[end];
      if (!actors.has(id) && !cases.has(id)) throw new SpecError(`${where}: unknown actor or use case "${id}"`);
    }
    const actorEnds = [item.from, item.to].filter((id) => actors.has(id)).length;
    if (actorEnds === 2) throw new SpecError(`${where}: an actor joins only use cases`);
    // A link from an actor to the actor's goal is an association: a plain
    // line. A link between two use cases is a dependency, such as includes.
    const association = actorEnds === 1;
    return { id: `l${index + 1}`, from: item.from, to: item.to, association, label: textOf(item.label, `${where}.label`) };
  });
}

export function normalizeSpec(spec) {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) throw new SpecError("spec must be an object");
  const style = resolveStyle(spec.style);
  const actors = normalizeActors(spec.actors);
  const journeys = normalizeJourneys(spec.journeys, style);
  const cases = normalizeCases(spec.cases, journeys, actors, style);
  return {
    style,
    title: textOf(spec.title, "title"),
    subtitle: textOf(spec.subtitle, "subtitle"),
    system: textOf(spec.system, "system"),
    actors,
    journeys,
    cases,
    links: normalizeLinks(spec.links, actors, cases),
    footnote: textOf(spec.footnote, "footnote"),
  };
}

// The box of an actor fits the figure, so lines meet the figure. The name
// stands below it.
const actorSize = { width: FIGURE.span, height: FIGURE.head + FIGURE.body + FIGURE.legs };

// An oval holds a centered box when each side is √2 times longer.
function caseGeometry(useCase, style) {
  const name = measure(useCase.name, style.fontSize, style);
  return {
    width: Math.ceil((name.width + 2 * OVAL.padX) * Math.SQRT2),
    height: Math.ceil((name.height + 2 * OVAL.padY) * Math.SQRT2),
  };
}

function line(builder, id, points, extra) {
  const [x0, y0] = points[0];
  const relative = points.map(([px, py]) => [px - x0, py - y0]);
  const xs = relative.map(([px]) => px);
  const ys = relative.map(([, py]) => py);
  return builder.base(id, "line", x0 + Math.min(...xs), y0 + Math.min(...ys), Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys), {
      points: relative.map(([px, py]) => [px - Math.min(...xs), py - Math.min(...ys)]),
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      ...extra,
    });
}

// A stick figure with the name below. A transparent box over the figure
// takes the bindings; the parts and the name form a group with it.
function drawActor(builder, actor, box) {
  const style = builder.style;
  const groupIds = [`${actor.id}-actor`];
  const stroke = { strokeColor: style.ink, strokeWidth: actor.primary ? 3 : 2, groupIds };
  const centerX = box.x + box.width / 2;
  const top = box.y;
  const neck = top + FIGURE.head;
  const hip = neck + FIGURE.body;
  const half = FIGURE.span / 2;
  builder.base(`${actor.id}-head`, "ellipse", centerX - FIGURE.head / 2, top, FIGURE.head, FIGURE.head, {
    ...stroke,
    backgroundColor: style.background,
  });
  line(builder, `${actor.id}-body`, [[centerX, neck], [centerX, hip]], stroke);
  line(builder, `${actor.id}-arms`, [[centerX - half, neck + 6], [centerX + half, neck + 6]], stroke);
  line(builder, `${actor.id}-legs`, [[centerX - half, hip + FIGURE.legs], [centerX, hip], [centerX + half, hip + FIGURE.legs]], stroke);
  const name = box.beside.get(`${actor.id}-name`);
  builder.text(`${actor.id}-name`, actor.name, name.x, name.y, style.fontSize, { textAlign: "center", groupIds });
  return builder.base(actor.id, "rectangle", box.x, box.y, box.width, box.height, {
    strokeColor: "transparent",
    strokeWidth: 1,
    groupIds,
  });
}

function drawCase(builder, useCase, box) {
  const style = builder.style;
  // A primary use case belongs to the main journey: a strong outline and a
  // stronger fill make it read first.
  const oval = builder.base(useCase.id, "ellipse", box.x, box.y, box.width, box.height, {
    strokeColor: strokeOf(style, useCase.tone, 5),
    backgroundColor: fillOf(style, useCase.tone, useCase.primary ? 2 : 1),
    strokeWidth: useCase.primary ? 3 : 2,
  });
  builder.boundText(oval, `${useCase.id}-text`, useCase.name, style.fontSize);
  return oval;
}

// Actors on the left come first in the layout, then the use cases, then the
// actors on the right. A link between an actor and a use case has no
// direction, so the layout runs it from left to right.
function layoutInput(graph) {
  const { style } = graph;
  const actors = [...graph.actors.values()];
  const left = actors.filter((actor) => actor.side === "left");
  const right = actors.filter((actor) => actor.side === "right");
  const rightIds = new Set(right.map((actor) => actor.id));
  const actorNode = (actor) => ({
    id: actor.id,
    group: null,
    ...actorSize,
    outline: "box",
    branches: false,
    gather: true,
    beside: [{ id: `${actor.id}-name`, ...measure(actor.name, style.fontSize, style), place: "note" }],
  });
  return {
    direction: "RIGHT",
    groups: [
      { id: "system", parent: null, label: graph.system === "" ? null : measure(graph.system, style.fontSize, style) },
      ...[...graph.journeys.values()].map((journey) => ({
        id: `journey-${journey.id}`,
        parent: "system",
        label: measure(journey.label, style.fontSize, style),
      })),
    ],
    nodes: [
      ...left.map(actorNode),
      ...[...graph.cases.values()].map((useCase) => ({
        id: useCase.id,
        group: useCase.journey === null ? "system" : `journey-${useCase.journey}`,
        ...caseGeometry(useCase, style),
        outline: "circle",
        branches: false,
        gather: false,
        beside: [],
      })),
      ...right.map(actorNode),
    ],
    edges: graph.links.map((link) => ({
      id: link.id,
      ...layoutEnds(link, rightIds),
      main: false,
      label: link.label === "" ? null : measure(link.label, labelFontSize(style), style),
    })),
  };
}

// An association runs from left to right: an actor on the right is its end.
function layoutEnds(link, rightIds) {
  return rightIds.has(link.from) ? { from: link.to, to: link.from } : { from: link.from, to: link.to };
}

const labelFontSize = (style) => style.fontSize - 2;
const ASSOCIATION = { strokeStyle: "solid", start: null, end: null };
const DEPENDENCY = { strokeStyle: "dashed", start: null, end: "arrow" };

export async function buildUseCases(spec) {
  const graph = normalizeSpec(spec);
  const { style } = graph;
  const layout = await layoutGraph(layoutInput(graph));

  const body = new SceneBuilder(style);
  const targets = new Map();
  drawZone(body, "system", layout.groups.get("system"), { label: graph.system, tone: style.tone, plate: true });
  for (const journey of graph.journeys.values()) {
    drawZone(body, `journey-${journey.id}`, layout.groups.get(`journey-${journey.id}`), { ...journey, depth: 1, plate: true });
  }
  for (const useCase of graph.cases.values()) targets.set(useCase.id, drawCase(body, useCase, layout.nodes.get(useCase.id)));
  for (const actor of graph.actors.values()) {
    targets.set(actor.id, drawActor(body, actor, layout.nodes.get(actor.id)));
  }
  const rightIds = new Set([...graph.actors.values()].filter((actor) => actor.side === "right").map((actor) => actor.id));
  for (const link of graph.links) {
    const { from, to } = layoutEnds(link, rightIds);
    drawLayoutEdge(body, link.id, layout.edges.get(link.id), {
      semantics: link.association ? ASSOCIATION : DEPENDENCY,
      stroke: { strokeColor: style.ink, strokeWidth: 2 },
    }, { from: targets.get(from), to: targets.get(to), label: link.label, fontSize: labelFontSize(style) });
  }
  // Lines cross the zone labels: draw the labels and their plates over them.
  const zoneIds = ["system", ...[...graph.journeys.keys()].map((id) => `journey-${id}`)];
  const zoneLabels = new Set(zoneIds.flatMap((id) => [`${id}-plate`, `${id}-label`]));
  body.elements.sort((a, b) => Number(zoneLabels.has(a.id)) - Number(zoneLabels.has(b.id)));

  const heading = drawHeading(style, graph.title, graph.subtitle);
  const box = bounds(body.elements);
  translate(body.elements, -box.minX, heading.height - box.minY);
  const elements = [...heading.elements, ...body.elements];
  appendFootnote(elements, style, graph.footnote);
  return sceneDocument(elements, style);
}

await runGenerator(import.meta.url, {
  usage: `Usage: node scripts/use_cases.mjs <spec.json> [-o <scene.excalidraw>]

Builds an Excalidraw use-case map from a JSON spec and prints the scene path
and size. Export the scene with scripts/export_excalidraw.mjs.`,
  build: buildUseCases,
  widthLimit: 1200,
});
