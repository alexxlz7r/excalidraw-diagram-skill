/** Layered graph layout with ELK for the node-and-edge generators: zones, ports, back edges, and edge labels. */

import { bindArrow, elkMinimumSize, END_SEGMENT, FLOW_SIDES, labelArrow, loadElk, SpecError } from "./scene.mjs";

// Space around the nodes of a zone, and above them for the zone label.
const ZONE = { pad: 24, labelGap: 8, labelMargin: 64 };
// Space between a node and the text beside it.
const BESIDE_GAP = 8;
// Space that ELK keeps on each side of an edge label, so two labels in one
// layer do not read as one phrase.
const LABEL_MARGIN = 16;

// ELK reads spacing from the parent of each node, so the root and every zone
// repeat it. An edge keeps a full arrowhead segment clear of the nodes. Edges
// cross a zone border at ports of the zone; the port spacing keeps them apart.
// Between two layers, parallel runs of edges keep a wider gap, so a solid and
// a dashed line do not read as one.
const CONTAINER_OPTIONS = {
  "elk.spacing.edgeNode": String(END_SEGMENT),
  "elk.layered.spacing.edgeNodeBetweenLayers": String(END_SEGMENT),
  "elk.spacing.edgeEdge": "16",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "20",
  "elk.spacing.portPort": "24",
};

// The two sides across the flow: the low side (above or left) and the high
// side (below or right). Back edges use the low side.
const CROSS_SIDES = { RIGHT: ["NORTH", "SOUTH"], LEFT: ["NORTH", "SOUTH"], DOWN: ["WEST", "EAST"], UP: ["WEST", "EAST"] };
const BESIDE_PLACEMENTS = {
  NORTH: "OUTSIDE V_TOP H_CENTER",
  SOUTH: "OUTSIDE V_BOTTOM H_CENTER",
  WEST: "OUTSIDE V_CENTER H_LEFT",
  EAST: "OUTSIDE V_CENTER H_RIGHT",
};

export const horizontal = (direction) => direction === "RIGHT" || direction === "LEFT";

// The node order sets the flow: an edge to the same or an earlier node runs
// back. A group takes the place of its first node, at any depth. ELK compares
// the model order only among siblings, so it cannot find these edges in
// groups.
function backEdges(graph) {
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const parents = new Map(graph.groups.map((group) => [group.id, group.parent]));
  for (const node of graph.nodes) {
    for (let group = node.group; group !== null; group = parents.get(group)) {
      order.set(group, Math.min(order.get(group) ?? Infinity, order.get(node.id)));
    }
  }
  return new Set(graph.edges.filter((edge) => order.get(edge.to) <= order.get(edge.from)).map((edge) => edge.id));
}

// A branching node sends one edge along the flow: the main edge, or its first
// forward edge.
function straightEdges(graph, back) {
  const straight = new Map();
  for (const node of graph.nodes) {
    if (!node.branches) continue;
    const forward = graph.edges.filter((edge) => edge.from === node.id && !back.has(edge.id));
    const chosen = forward.find((edge) => edge.main) ?? forward[0];
    if (chosen) straight.set(node.id, chosen.id);
  }
  return straight;
}

// A port on a side of a node, at `fraction` of the side length.
function sidePort(id, side, { width, height }, fraction = 0.5) {
  const x = { EAST: width, WEST: 0 }[side] ?? width * fraction;
  const y = { SOUTH: height, NORTH: 0 }[side] ?? height * fraction;
  return { id, x, y, width: 0, height: 0, layoutOptions: { "elk.port.side": side } };
}

// Every edge end at a node gets a port. The draft layout orders the ports on
// a side by the position of the other end, so edges do not cross at a node.
// Forward edges leave on the flow side and enter on the opposite side; back
// edges use the low side. The other edges of a branching node leave from the
// side toward their target. A main edge takes the middle of its side, so a
// straight main path puts the node centers on one line. The edges of a
// gathering node meet at the middle of each side.
function planPorts(graph, context, draft) {
  const { back, straight, nodes } = context;
  const [low, high] = CROSS_SIDES[graph.direction];
  const [outSide, inSide] = FLOW_SIDES[graph.direction];
  const centerOf = (id) => {
    const node = draft.get(id);
    return [node.x + node.width / 2, node.y + node.height / 2];
  };
  const sideOf = (edge, end) => {
    if (back.has(edge.id)) return low;
    if (end === "to") return inSide;
    if (!straight.has(edge.from) || straight.get(edge.from) === edge.id) return outSide;
    const axis = horizontal(graph.direction) ? 1 : 0;
    return centerOf(edge.to)[axis] < centerOf(edge.from)[axis] ? low : high;
  };
  const bySide = new Map();
  for (const edge of graph.edges) {
    for (const [end, nodeId, otherId] of [["from", edge.from, edge.to], ["to", edge.to, edge.from]]) {
      // A port on a zone pulls the nodes in it off the main line.
      if (!nodes.has(nodeId)) continue;
      const side = sideOf(edge, end);
      const axis = side === "EAST" || side === "WEST" ? 1 : 0;
      const key = `${nodeId}:${side}`;
      const item = { id: `${edge.id}.${end}`, main: edge.main && !back.has(edge.id), order: centerOf(otherId)[axis] };
      bySide.set(key, [...(bySide.get(key) ?? []), item]);
    }
  }
  const ports = new Map();
  for (const [key, items] of bySide) {
    const [nodeId, side] = key.split(":");
    items.sort((a, b) => a.order - b.order);
    const main = items.findIndex((item) => item.main);
    const spread = (list, from, to) => list.forEach((item, index) => {
      item.fraction = from + (to - from) * (index + 1) / (list.length + 1);
    });
    if (nodes.get(nodeId).gather) {
      for (const item of items) item.fraction = 0.5;
    } else if (main === -1) {
      spread(items, 0, 1);
    } else {
      spread(items.slice(0, main), 0, 0.5);
      items[main].fraction = 0.5;
      spread(items.slice(main + 1), 0.5, 1);
    }
    const list = ports.get(nodeId) ?? [];
    for (const item of items) list.push(sidePort(item.id, side, nodes.get(nodeId), item.fraction));
    ports.set(nodeId, list);
  }
  return ports;
}

// Text beside a node stands across the flow, so forward edges do not run
// through it. A `low` text goes on the low side. A `note` goes on the high
// side, or on the low side when only the high side has edges.
function besideLabels(node, direction, ports) {
  const [low, high] = CROSS_SIDES[direction];
  const used = (side) => ports.some((port) => port.layoutOptions["elk.port.side"] === side);
  const noteSide = used(high) && !used(low) ? low : high;
  return node.beside.map((text) => ({
    id: text.id,
    // ELK ignores a label without text.
    text: text.id,
    width: text.width,
    height: text.height,
    layoutOptions: { "elk.nodeLabels.placement": BESIDE_PLACEMENTS[text.place === "low" ? low : noteSide] },
  }));
}

// Without a draft, ELK chooses free ports. The draft then orders the ports of
// the final layout.
function buildElkGraph(graph, context, draft = null) {
  const ports = draft === null ? new Map() : planPorts(graph, context, draft);
  const zones = new Map(graph.groups.map((group) => {
    const label = group.label ?? { width: 0, height: 0 };
    const top = ZONE.pad + (group.label ? Math.ceil(label.height) + ZONE.labelGap : 0);
    return [group.id, {
      id: group.id,
      layoutOptions: {
        ...CONTAINER_OPTIONS,
        "elk.padding": `[top=${top},left=${ZONE.pad},bottom=${ZONE.pad},right=${ZONE.pad}]`,
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": elkMinimumSize(graph.direction, Math.ceil(label.width + ZONE.labelMargin)),
      },
      children: [],
    }];
  }));
  const rootChildren = [];
  for (const group of graph.groups) {
    (group.parent === null ? rootChildren : zones.get(group.parent).children).push(zones.get(group.id));
  }
  for (const node of graph.nodes) {
    const child = { id: node.id, width: node.width, height: node.height, layoutOptions: {} };
    if (ports.has(node.id)) {
      child.ports = ports.get(node.id);
      child.layoutOptions["elk.portConstraints"] = "FIXED_POS";
    }
    if (node.beside.length > 0) {
      child.labels = besideLabels(node, graph.direction, ports.get(node.id) ?? []);
      child.layoutOptions["elk.spacing.labelNode"] = String(BESIDE_GAP);
    }
    (node.group === null ? rootChildren : zones.get(node.group).children).push(child);
  }
  const edges = graph.edges.map((edge) => {
    const isBack = context.back.has(edge.id);
    const endOf = (end) => (draft === null || !context.nodes.has(edge[end]) ? edge[end] : `${edge.id}.${end}`);
    // ELK lays out an acyclic graph: a back edge goes in reverse.
    const [source, target] = isBack ? [endOf("to"), endOf("from")] : [endOf("from"), endOf("to")];
    const layoutEdge = { id: edge.id, sources: [source], targets: [target] };
    if (edge.main && !isBack) layoutEdge.layoutOptions = { "elk.layered.priority.straightness": "10" };
    if (edge.label) {
      layoutEdge.labels = [{
        id: `${edge.id}-label`,
        text: `${edge.id}-label`,
        width: edge.label.width + 2 * LABEL_MARGIN,
        height: edge.label.height + 4,
        // ELK reads this option only from the label: the label then sits on
        // the edge, where Excalidraw draws it.
        layoutOptions: { "elk.edgeLabels.inline": "true" },
      }];
    }
    return layoutEdge;
  });
  return {
    id: "root",
    layoutOptions: {
      ...CONTAINER_OPTIONS,
      "elk.algorithm": "layered",
      "elk.direction": graph.direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.json.edgeCoords": "ROOT",
      "elk.json.shapeCoords": "ROOT",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      // Keep the edge order of the spec. A fixed node order keeps a main path
      // in a group off the main line.
      "elk.layered.considerModelOrder.strategy": "EDGES",
      "elk.edgeLabels.placement": "CENTER",
    },
    children: rootChildren,
    edges,
  };
}

// The nodes and groups of a layout by ID, at every depth.
function flattenLayout(layout) {
  const nodes = new Map();
  const pending = [...layout.children];
  while (pending.length > 0) {
    const child = pending.pop();
    nodes.set(child.id, child);
    pending.push(...(child.children ?? []));
  }
  return nodes;
}

function routeOf(edge) {
  const section = edge.sections?.[0];
  if (!section) throw new SpecError(`ELK returned no route for ${edge.id}`);
  const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(({ x, y }) => [x, y]);
  // Drop the bend points that lie on a straight run.
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const [before, after] = [points[index - 1], points[index + 1]];
    return !(before[0] === point[0] && point[0] === after[0]) && !(before[1] === point[1] && point[1] === after[1]);
  });
}

// ELK ends a route on the bounding box. Continue the end segment to the
// outline of a diamond or a circle. Routes are orthogonal.
function clipToOutline(outline, box, adjacent, edge) {
  if (outline !== "diamond" && outline !== "circle") return edge;
  const rx = box.width / 2;
  const ry = box.height / 2;
  const center = [box.x + rx, box.y + ry];
  const profile = (t) => (outline === "diamond" ? 1 - t : Math.sqrt(1 - t * t));
  const axis = adjacent[0] === edge[0] ? 1 : 0;
  const across = 1 - axis;
  const t = Math.abs(edge[across] - center[across]) / (across === 0 ? rx : ry);
  if (t >= 1) return edge;
  const clipped = [...edge];
  clipped[axis] = center[axis] + Math.sign(adjacent[axis] - center[axis]) * (axis === 0 ? rx : ry) * profile(t);
  return clipped;
}

const boxOf = ({ x, y, width, height }) => ({ x, y, width, height });

// A step shorter than this between two parallel segments is a jog: ELK places
// the port on a zone border and the port on the node apart.
const JOG = 24;
// A moved end keeps this distance from the corners of its side and from the
// other edge ends on the side.
const JOG_END = { corner: 12, spacing: 16 };
// A moved segment keeps this distance from parallel segments of other edges.
const JOG_SPACING = 16;

const segmentsOf = (points) => points.slice(1).map((point, index) => [points[index], point]);
const sameSegment = ([a, b], [c, d]) => a[0] === c[0] && a[1] === c[1] && b[0] === d[0] && b[1] === d[1];

// Whether an axis-aligned segment runs through the inside of a box.
function crossesBox([a, b], box) {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return x1 > box.x + 1 && x0 < box.x + box.width - 1 && y1 > box.y + 1 && y0 < box.y + box.height - 1;
}

// Whether two axis-aligned segments run parallel and closer than `gap`.
function runsClose([a, b], [c, d], gap) {
  const axis = a[0] === b[0] ? 0 : 1;
  if ((c[0] === d[0] ? 0 : 1) !== axis) return false;
  const along = 1 - axis;
  const overlap = Math.min(Math.max(a[along], b[along]), Math.max(c[along], d[along]))
    - Math.max(Math.min(a[along], b[along]), Math.min(c[along], d[along]));
  return overlap > 0 && Math.abs(a[axis] - c[axis]) < gap;
}

// Whether a point lies on an axis-aligned segment.
function onSegment(point, [a, b]) {
  return point[0] >= Math.min(a[0], b[0]) - 1 && point[0] <= Math.max(a[0], b[0]) + 1
    && point[1] >= Math.min(a[1], b[1]) - 1 && point[1] <= Math.max(a[1], b[1]) + 1;
}

// Remove jogs: move one of the two parallel segments beside a jog onto the
// line of the other. A move must keep the segment clear of the nodes, of the
// text beside them, and of the parallel segments of other edges. A moved end
// must stay on its side of a box, clear of the corners and of the other edge
// ends there. A label on a moved segment moves with it.
function removeJogs(graph, edges, nodes, boxAt, outlineOf) {
  // The own nodes of an edge are not obstacles: a route ends on them, and a
  // route to a diamond or a circle ends inside the box.
  const obstacles = [...nodes].flatMap(([id, node]) => [
    { id, ...node },
    ...[...node.beside.values()].map((text) => ({ id: `${id} beside`, ...text })),
  ]);
  const endsOn = (id, except) => [...edges].flatMap(([edgeId, { points }]) => {
    if (edgeId === except) return [];
    const edge = graph.edges.find((item) => item.id === edgeId);
    return [[edge.from, points[0]], [edge.to, points.at(-1)]].filter(([end]) => end === id).map(([, point]) => point);
  });
  const endFits = (id, point, axis) => {
    if (outlineOf(id) !== "box") return false;
    const box = boxAt(id);
    const [start, length] = axis === 0 ? [box.x, box.width] : [box.y, box.height];
    return point[axis] >= start + JOG_END.corner && point[axis] <= start + length - JOG_END.corner;
  };
  for (const edge of graph.edges) {
    let changed = true;
    while (changed) {
      changed = false;
      const { points, labelCenter } = edges.get(edge.id);
      for (let index = 1; index + 2 < points.length && !changed; index += 1) {
        const [p, q] = [points[index], points[index + 1]];
        const length = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
        if (length === 0 || length >= JOG) continue;
        // The coordinate that the jog changes: x for a horizontal jog.
        const axis = p[1] === q[1] ? 0 : 1;
        const candidates = [
          // Move the segment after the jog onto the line before it.
          { moved: [index + 1, index + 2], drop: index + 1, to: p[axis], end: index + 2 === points.length - 1 ? "to" : null },
          // Move the segment before the jog onto the line after it.
          { moved: [index - 1, index], drop: index, to: q[axis], end: index - 1 === 0 ? "from" : null },
        ];
        for (const { moved, drop, to, end } of candidates) {
          const next = points.map((point, at) => (moved.includes(at) ? Object.assign([...point], { [axis]: to }) : point));
          next.splice(drop, 1);
          if (end !== null) {
            const id = edge[end];
            const point = end === "to" ? next.at(-1) : next[0];
            if (!endFits(id, point, axis)) continue;
            if (endsOn(id, edge.id).some((other) => Math.hypot(other[0] - point[0], other[1] - point[1]) < JOG_END.spacing)) continue;
          }
          const fresh = segmentsOf(next).filter((segment) => !segmentsOf(points).some((old) => sameSegment(old, segment)));
          const own = new Set([edge.from, edge.to]);
          const blocked = fresh.some((segment) =>
            obstacles.some((box) => !own.has(box.id) && crossesBox(segment, box))
            || [...edges].some(([id, other]) => id !== edge.id
              && segmentsOf(other.points).some((line) => runsClose(segment, line, JOG_SPACING))));
          if (blocked) continue;
          const shift = to - points[moved[0]][axis];
          const carried = labelCenter !== null && onSegment(labelCenter, [points[moved[0]], points[moved[1]]]);
          const label = carried ? Object.assign([...labelCenter], { [axis]: labelCenter[axis] + shift }) : labelCenter;
          edges.set(edge.id, { points: next, labelCenter: label });
          changed = true;
          break;
        }
      }
    }
  }
}

// Lay out a directed graph in layers along `direction`.
//
// - `groups`: `{ id, parent, label }`, parents before children. `label` is the
//   size of the zone label, or null. ELK sizes a zone around its content.
// - `nodes`: `{ id, group, width, height, outline, branches, gather, beside }`
//   in the order of the flow. `outline` is `box`, `diamond`, or `circle`
//   (an ellipse in the box). `branches` gives the node one edge along the flow
//   and sends the others from the sides. `gather` makes the edges meet at the
//   middle of each side, for a node too small to hold several arrowheads
//   apart. `beside` holds text boxes `{ id, width, height, place }` next to
//   the node: `place` is `low` or `note`.
// - `edges`: `{ id, from, to, main, label }` between nodes and groups. `main`
//   marks the main path. `label` is the size of the edge label, or null.
//
// Returns the boxes of the nodes, their beside texts, and the groups, and for
// each edge its points from `from` to `to`, ending on the outlines, and the
// point where ELK kept space for its label.
export async function layoutGraph(graph) {
  const back = backEdges(graph);
  const context = { back, straight: straightEdges(graph, back), nodes: new Map(graph.nodes.map((node) => [node.id, node])) };
  const elk = await loadElk();
  const draft = flattenLayout(await elk.layout(buildElkGraph(graph, context)));
  const layout = await elk.layout(buildElkGraph(graph, context, draft));
  const placed = flattenLayout(layout);

  const nodes = new Map(graph.nodes.map((node) => {
    const box = placed.get(node.id);
    const beside = new Map((box.labels ?? []).map((label) => [label.id, boxOf(label)]));
    return [node.id, { ...boxOf(box), beside }];
  }));
  const groups = new Map(graph.groups.map((group) => [group.id, boxOf(placed.get(group.id))]));
  const outlineOf = (id) => context.nodes.get(id)?.outline ?? "box";
  const boxAt = (id) => nodes.get(id) ?? groups.get(id);
  const edges = new Map();
  for (const layoutEdge of layout.edges) {
    const edge = graph.edges.find((item) => item.id === layoutEdge.id);
    const points = routeOf(layoutEdge);
    if (back.has(edge.id)) points.reverse();
    points[0] = clipToOutline(outlineOf(edge.from), boxAt(edge.from), points[1], points[0]);
    points[points.length - 1] = clipToOutline(outlineOf(edge.to), boxAt(edge.to), points.at(-2), points.at(-1));
    const label = layoutEdge.labels?.[0];
    const labelCenter = label ? [label.x + label.width / 2, label.y + label.height / 2] : null;
    edges.set(edge.id, { points, labelCenter });
  }
  removeJogs(graph, edges, nodes, boxAt, outlineOf);
  return { nodes, groups, edges };
}

// Draw a laid-out edge as an arrow bound to `from` and `to`, with a bound
// label. A straight arrow keeps two points, so it stays straight when a shape
// moves; its label sits at its middle.
export function drawLayoutEdge(builder, id, { points, labelCenter }, look, { from, to, label = "", fontSize }) {
  const straight = points.length === 2;
  const labelled = label !== "";
  const arrow = builder.arrow(id, points, look.semantics, look.stroke, {
    fullHeads: !straight,
    labelAt: labelled && !straight ? labelCenter : null,
  });
  bindArrow(arrow, "start", from);
  bindArrow(arrow, "end", to);
  if (labelled) labelArrow(builder, arrow, `${id}-label`, label, fontSize);
  return arrow;
}
