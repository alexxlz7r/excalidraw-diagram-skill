import assert from "node:assert/strict";
import test from "node:test";

import { validateExcalidraw } from "../export_excalidraw.mjs";
import { PALETTE, rebindScene } from "../scene.mjs";
import { buildFlow, SpecError } from "../flow.mjs";
import { textWidth } from "../layout.mjs";

function byId(scene) {
  return new Map(scene.elements.map((element) => [element.id, element]));
}

const inside = (inner, outer) =>
  inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

// A small process: entry, one action, one decision, and a terminal outcome.
const review = {
  nodes: [
    { id: "submitted", kind: "start", label: "submitted" },
    { id: "check", label: ["Check", "payment"] },
    { id: "valid", kind: "decision", label: "valid?" },
    { id: "done", kind: "end", label: "paid" },
  ],
  edges: [
    { from: "submitted", to: "check" },
    { from: "check", to: "valid" },
    { from: "valid", to: "done", label: "yes" },
    { from: "valid", to: "check", label: "retry" },
  ],
};

test("text in a proportional font keeps a 4 % margin for the renderer", async () => {
  for (const [style, fontFamily] of [["clean", 6], ["sketch", 5], [{ preset: "clean", fontFamily: 8 }, 8]]) {
    const scene = await buildFlow({ ...review, style });
    const texts = scene.elements.filter((element) => element.type === "text");
    assert.ok(texts.length > 0);
    for (const text of texts) {
      assert.equal(text.fontFamily, fontFamily, text.id);
      const measured = textWidth(text.text, text.fontSize, { fontFamily });
      assert.ok(Math.abs(text.width - measured * 1.04) < 1e-6, `${text.id} in font ${fontFamily}`);
    }
  }
});

test("each node kind has its own shape, and names sit inside actions and decisions", async () => {
  const scene = await buildFlow(review);
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const check = elements.get("check");
  const valid = elements.get("valid");
  assert.equal(check.type, "rectangle");
  assert.deepEqual(check.roundness, { type: 3 });
  assert.equal(valid.type, "diamond");
  assert.equal(valid.roundness, null, "rounded corners would cut the vertices where outcomes leave");

  for (const [node, text] of [[check, "Check\npayment"], [valid, "valid?"]]) {
    const label = elements.get(`${node.id}-text`);
    assert.equal(label.text, text);
    assert.equal(label.containerId, node.id);
    assert.ok(node.boundElements.some((bound) => bound.id === label.id));
    assert.ok(inside(label, node), `${node.id} holds its name`);
  }

  const start = elements.get("submitted");
  const end = elements.get("done");
  for (const circle of [start, end]) {
    assert.equal(circle.type, "ellipse");
    assert.ok(circle.width < check.height, `${circle.id} is a small circle`);
    assert.equal(circle.width, circle.height);
  }
  assert.notEqual(start.backgroundColor, "transparent", "the entry is a filled dot");
  const ring = elements.get("done-dot");
  assert.ok(inside(ring, end) && ring.width < end.width, "the terminal outcome is a dot in a ring");
  for (const circle of [start, end]) {
    const label = elements.get(`${circle.id}-label`);
    assert.equal(label.containerId, null, `${circle.id} has its label beside the circle`);
    assert.ok(!inside(label, circle));
  }
});

function globalPoints(arrow) {
  return arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py]);
}

// The point that an Excalidraw release with fixed-point bindings moves an arrow end to.
function fixedPointOf(binding, elements) {
  const target = elements.get(binding.elementId);
  return [target.x + binding.fixedPoint[0] * target.width, target.y + binding.fixedPoint[1] * target.height];
}

// How far a point is from the outline of a shape, in pixels along the axes.
function outlineDistance(shape, [px, py]) {
  const rx = shape.width / 2;
  const ry = shape.height / 2;
  const dx = Math.abs(px - (shape.x + rx));
  const dy = Math.abs(py - (shape.y + ry));
  if (shape.type === "diamond") return Math.abs(dx / rx + dy / ry - 1) * Math.min(rx, ry);
  if (shape.type === "ellipse") return Math.abs(Math.hypot(dx / rx, dy / ry) - 1) * Math.min(rx, ry);
  return Math.abs(Math.max(dx - rx, dy - ry));
}

const collinear = (points) =>
  points.every(([px]) => px === points[0][0]) || points.every(([, py]) => py === points[0][1]);

test("edges are arrows bound at both ends, from outline to outline", async () => {
  const scene = await buildFlow(review);
  const elements = byId(scene);
  let straight = 0;
  review.edges.forEach((edge, index) => {
    const arrow = elements.get(`e${index + 1}`);
    assert.equal(arrow.type, "arrow");
    assert.equal(arrow.endArrowhead, "arrow");
    const points = globalPoints(arrow);
    for (const [end, point, owner] of [["startBinding", points[0], edge.from], ["endBinding", points.at(-1), edge.to]]) {
      const binding = arrow[end];
      const shape = elements.get(owner);
      assert.equal(binding.elementId, owner);
      assert.equal(binding.mode, "inside");
      assert.ok(fixedPointOf(binding, elements).every((value, axis) => Math.abs(value - point[axis]) < 1e-6),
        `${arrow.id} keeps its ${end} on a move`);
      assert.equal(typeof binding.focus, "number", "Excalidraw 0.18 reads focus and gap");
      assert.equal(typeof binding.gap, "number");
      assert.ok(shape.boundElements.some((bound) => bound.id === arrow.id));
      assert.ok(outlineDistance(shape, point) < 1, `${arrow.id} ${end} sits on the outline of ${owner}`);
    }
    if (collinear(points)) {
      straight += 1;
      assert.equal(points.length, 2, `${arrow.id} is straight, so it has two points and stays straight on a move`);
    }
  });
  assert.ok(straight >= 2, "the forward edges run straight");
});

// Whether a point lies on a polyline.
function onPath(points, [px, py]) {
  return points.slice(1).some((b, index) => {
    const a = points[index];
    const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    const within = Math.min(a[0], b[0]) - 0.5 <= px && px <= Math.max(a[0], b[0]) + 0.5
      && Math.min(a[1], b[1]) - 0.5 <= py && py <= Math.max(a[1], b[1]) + 0.5;
    return within && Math.abs(cross) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) < 0.5;
  });
}

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("edge labels are bound to their arrows, on the path where Excalidraw draws them, and clear of the nodes", async () => {
  const scene = await buildFlow({
    ...review,
    edges: [
      ...review.edges.slice(0, 2),
      { from: "valid", to: "done", label: ["yes, the amount", "matches"] },
      { from: "valid", to: "check", label: "retry" },
    ],
  });
  const elements = byId(scene);
  const shapes = ["submitted", "check", "valid", "done"].map((id) => elements.get(id));
  for (const id of ["e3", "e4"]) {
    const arrow = elements.get(id);
    const label = elements.get(`${id}-label`);
    assert.equal(label.containerId, id);
    assert.ok(arrow.boundElements.some((bound) => bound.id === label.id));
    const [cx, cy] = labelCenter(arrow);
    assert.ok(Math.abs(label.x + label.width / 2 - cx) < 1 && Math.abs(label.y + label.height / 2 - cy) < 1,
      `${id} label sits where Excalidraw draws it`);
    assert.ok(onPath(globalPoints(arrow), [cx, cy]), `${id} label sits on its path`);
    for (const shape of shapes) assert.ok(!overlaps(label, shape), `${id} label is clear of ${shape.id}`);
  }
  assert.equal(elements.get("e3-label").text, "yes, the amount\nmatches");
  assert.equal(elements.has("e1-label"), false, "an edge without a label has no text");
});

// Two decisions, each with a main outcome and a side branch.
const checkout = {
  nodes: [
    { id: "cart", kind: "start" },
    { id: "validate", label: "Validate cart" },
    { id: "stock", kind: "decision", label: "in stock?" },
    { id: "backorder", label: "Offer backorder" },
    { id: "pay", label: "Take payment" },
    { id: "paid", kind: "decision", label: "paid?" },
    { id: "notify", label: ["Notify", "customer"] },
    { id: "ship", label: "Ship" },
    { id: "done", kind: "end" },
    { id: "lost", kind: "end" },
  ],
  edges: [
    { from: "cart", to: "validate", path: "main" },
    { from: "validate", to: "stock", path: "main" },
    { from: "stock", to: "pay", label: "yes", path: "main" },
    { from: "stock", to: "backorder", label: "no" },
    { from: "backorder", to: "pay", label: "accepted" },
    { from: "backorder", to: "lost", label: "declined" },
    { from: "pay", to: "paid", path: "main" },
    { from: "paid", to: "ship", label: "yes", path: "main" },
    { from: "paid", to: "notify", label: "no" },
    { from: "notify", to: "lost" },
    { from: "ship", to: "done", path: "main" },
  ],
};
const mainPath = ["cart", "validate", "stock", "pay", "paid", "ship", "done"];

test("the main path runs straight in the layout direction", async () => {
  for (const [direction, along, across] of [["RIGHT", "x", "y"], ["DOWN", "y", "x"]]) {
    const elements = byId(await buildFlow({ ...checkout, direction }));
    const center = (id, axis) => {
      const shape = elements.get(id);
      return axis === "x" ? shape.x + shape.width / 2 : shape.y + shape.height / 2;
    };
    for (const id of mainPath) {
      assert.ok(Math.abs(center(id, across) - center(mainPath[0], across)) < 1, `${direction}: ${id} stands on the main line`);
    }
    for (const [index, id] of mainPath.slice(1).entries()) {
      assert.ok(center(id, along) > center(mainPath[index], along), `${direction}: ${id} follows ${mainPath[index]}`);
    }
  }
});

test("the path of an edge sets its weight, color, and dash in each style", async () => {
  const edges = [
    { from: "a", to: "b", path: "main" },
    { from: "b", to: "c" },
    { from: "b", to: "d", label: "rejected", path: "failure" },
    { from: "d", to: "a", label: "retry", path: "recovery" },
  ];
  const spec = { nodes: ["a", "b", "c", "d"].map((id) => ({ id })), edges };
  const ink = PALETTE.black;
  const looks = (elements) => ["e1", "e2", "e3", "e4"].map((id) => {
    const { strokeColor, strokeWidth, strokeStyle } = elements.get(id);
    return { strokeColor, strokeWidth, strokeStyle };
  });

  const clean = byId(await buildFlow({ ...spec, style: "clean" }));
  assert.deepEqual(looks(clean), [
    { strokeColor: ink, strokeWidth: 3, strokeStyle: "solid" },
    { strokeColor: ink, strokeWidth: 2, strokeStyle: "solid" },
    { strokeColor: PALETTE.shades.red[4], strokeWidth: 2, strokeStyle: "dashed" },
    { strokeColor: PALETTE.shades.green[4], strokeWidth: 2, strokeStyle: "dashed" },
  ]);
  assert.equal(clean.get("e3-label").strokeColor, ink, "labels stay in ink for contrast");

  const sketch = byId(await buildFlow({ ...spec, style: "sketch" }));
  assert.deepEqual(looks(sketch), [
    { strokeColor: ink, strokeWidth: 3, strokeStyle: "solid" },
    { strokeColor: ink, strokeWidth: 2, strokeStyle: "solid" },
    { strokeColor: ink, strokeWidth: 2, strokeStyle: "dashed" },
    { strokeColor: ink, strokeWidth: 2, strokeStyle: "dotted" },
  ]);
});

test("every decision has at least two outcomes, each with a label", async () => {
  const oneOutcome = { ...review, edges: review.edges.filter((edge) => edge.label !== "retry") };
  await assert.rejects(buildFlow(oneOutcome), (error) =>
    error instanceof SpecError && /decision "valid"/.test(error.message) && /two outcomes/.test(error.message));

  const unlabeled = { ...review, edges: review.edges.map((edge) => (edge.label === "retry" ? { ...edge, label: undefined } : edge)) };
  await assert.rejects(buildFlow(unlabeled), (error) =>
    error instanceof SpecError && /decision "valid"/.test(error.message) && /check/.test(error.message));
});

// A composite state: the edges to and from the group apply to every state in it.
const lifecycle = {
  groups: [{ id: "liquid", label: "LIQUID SET", tone: "blue" }],
  nodes: [
    { id: "market", label: "Market" },
    { id: "idle", label: "Idle", group: "liquid" },
    { id: "active", label: "Active", group: "liquid" },
    { id: "holds", kind: "decision", label: "holds?" },
  ],
  edges: [
    { from: "market", to: "idle", label: "admission" },
    { from: "idle", to: "active", label: "fire" },
    { from: "active", to: "idle", label: "quiet" },
    { from: "liquid", to: "holds", label: "every 4 h" },
    { from: "holds", to: "market", label: "no", path: "failure" },
    { from: "holds", to: "liquid", label: "yes" },
  ],
};

test("a group is a zone around its nodes, and edges can start or end on the zone", async () => {
  for (const style of ["clean", "sketch"]) {
    const scene = await buildFlow({ ...lifecycle, style });
    assert.deepEqual(validateExcalidraw(scene), []);
    const elements = byId(scene);
    const order = new Map(scene.elements.map((element, index) => [element.id, index]));
    const zone = elements.get("group-liquid");
    assert.equal(zone.type, "rectangle");
    for (const id of ["idle", "active"]) {
      assert.ok(inside(elements.get(id), zone), `${style}: the zone holds ${id}`);
      assert.ok(order.get(zone.id) < order.get(id), `${style}: the zone is drawn below ${id}`);
    }
    for (const id of ["market", "holds"]) assert.ok(!overlaps(elements.get(id), zone), `${style}: ${id} is outside the zone`);
    const label = elements.get("group-liquid-label");
    assert.equal(label.text, "LIQUID SET");
    assert.ok(inside(label, zone));
    for (const id of ["idle", "active"]) assert.ok(!overlaps(label, elements.get(id)), `${style}: the zone label is clear of ${id}`);

    const [leave, enter] = [elements.get("e4"), elements.get("e6")];
    assert.equal(leave.startBinding.elementId, zone.id);
    assert.equal(enter.endBinding.elementId, zone.id);
    assert.ok(outlineDistance(zone, globalPoints(leave)[0]) < 1, `${style}: the edge leaves the zone outline`);
    assert.ok(outlineDistance(zone, globalPoints(enter).at(-1)) < 1, `${style}: the edge enters the zone outline`);
  }
});

// Whether a polyline passes through a box: sample every segment each pixel.
function crosses(points, box) {
  return points.slice(1).some((point, index) => {
    const [a, b] = [points[index], point];
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
    for (let step = 0; step <= steps; step += 1) {
      const [px, py] = [a[0] + (b[0] - a[0]) * step / steps, a[1] + (b[1] - a[1]) * step / steps];
      if (px > box.x && px < box.x + box.width && py > box.y && py < box.y + box.height) return true;
    }
    return false;
  });
}

test("a note stands beside its node, across the flow, on a side without edges", async () => {
  const noted = {
    ...checkout,
    nodes: checkout.nodes.map((node) => {
      if (node.id === "stock") return { ...node, note: ["reserved items", "count as sold"] };
      if (node.id === "paid") return { ...node, note: "3-D Secure included" };
      return node;
    }),
  };
  for (const direction of ["RIGHT", "DOWN"]) {
    const scene = await buildFlow({ ...noted, direction });
    const elements = byId(scene);
    const arrows = scene.elements.filter((element) => element.type === "arrow");
    for (const id of ["stock", "paid"]) {
      const node = elements.get(id);
      const note = elements.get(`${id}-note`);
      assert.equal(note.containerId, null);
      if (direction === "RIGHT") {
        assert.ok(note.y >= node.y + node.height || note.y + note.height <= node.y, `${direction}: the note of ${id} is above or below it`);
        assert.ok(Math.abs(note.x + note.width / 2 - (node.x + node.width / 2)) < 1, `${direction}: the note of ${id} is centered`);
      } else {
        assert.ok(note.x >= node.x + node.width || note.x + note.width <= node.x, `${direction}: the note of ${id} is beside it`);
      }
      assert.ok(note.groupIds.some((group) => node.groupIds.includes(group)), `${direction}: the note of ${id} moves with it`);
      for (const arrow of arrows) {
        assert.ok(!crosses(globalPoints(arrow), note), `${direction}: ${arrow.id} does not cross the note of ${id}`);
      }
    }
    assert.equal(elements.get("stock-note").text, "reserved items\ncount as sold");
  }
});

test("nothing enters an entry, and nothing leaves a terminal outcome", async () => {
  const intoStart = { ...review, edges: [...review.edges, { from: "check", to: "submitted" }] };
  await assert.rejects(buildFlow(intoStart), (error) =>
    error instanceof SpecError && /edges\[4\]/.test(error.message) && /start "submitted"/.test(error.message));
  const fromEnd = { ...review, edges: [...review.edges, { from: "done", to: "check" }] };
  await assert.rejects(buildFlow(fromEnd), (error) =>
    error instanceof SpecError && /edges\[4\]/.test(error.message) && /end "done"/.test(error.message));
});

test("invalid specs report where the problem is", async () => {
  const cases = [
    [{ ...review, edges: [...review.edges, { from: "check", to: "nowhere" }] }, /edges\[4\]: unknown node or group "nowhere"/],
    [{ ...lifecycle, nodes: [...lifecycle.nodes, { id: "x", group: "missing" }] }, /nodes\[4\]: unknown group "missing"/],
    [{ ...lifecycle, nodes: [...lifecycle.nodes, { id: "liquid" }] }, /duplicate node "liquid"/],
    [{ ...review, nodes: [...review.nodes, { id: "x", kind: "state" }] }, /nodes\[4\]\.kind/],
    [{ ...review, edges: [...review.edges, { from: "check", to: "valid", path: "happy" }] }, /edges\[4\]\.path/],
    [{ ...review, direction: "SIDEWAYS" }, /direction/],
  ];
  for (const [spec, pattern] of cases) {
    await assert.rejects(buildFlow(spec), (error) => error instanceof SpecError && pattern.test(error.message), String(pattern));
  }
});

// Where Excalidraw draws an arrow label: on the middle point, or on the middle
// of the middle segment when the point count is even.
function labelCenter(arrow) {
  const points = globalPoints(arrow);
  const middle = Math.floor(points.length / 2);
  if (points.length % 2 === 1) return points[middle];
  return [(points[middle - 1][0] + points[middle][0]) / 2, (points[middle - 1][1] + points[middle][1]) / 2];
}

test("after a scene edit moves a node, rebindScene puts edges and their labels back", async () => {
  const scene = await buildFlow(review);
  const elements = byId(scene);
  const straightBefore = new Set(["e1", "e2", "e3", "e4"].filter((id) => elements.get(id).points.length === 2));
  for (const element of scene.elements) {
    if (element.id === "valid" || element.containerId === "valid") {
      element.x += 40;
      element.y += 120;
    }
  }
  rebindScene(scene);
  for (const id of ["e1", "e2", "e3", "e4"]) {
    const arrow = elements.get(id);
    const points = globalPoints(arrow);
    for (const [end, point] of [["startBinding", points[0]], ["endBinding", points.at(-1)]]) {
      const shape = elements.get(arrow[end].elementId);
      assert.ok(outlineDistance(shape, point) < 1, `${id} ${end} is back on the outline of ${shape.id}`);
    }
    if (straightBefore.has(id)) assert.equal(points.length, 2, `${id} keeps two points`);
    const label = elements.get(`${id}-label`);
    if (!label) continue;
    const [cx, cy] = labelCenter(arrow);
    assert.ok(Math.abs(label.x + label.width / 2 - cx) < 1 && Math.abs(label.y + label.height / 2 - cy) < 1,
      `${id} label follows its arrow`);
  }
});

test("the legend shows path samples, and the footnote closes the scene", async () => {
  const scene = await buildFlow({
    ...lifecycle,
    legend: [{ path: "main", label: "usual route" }, { path: "failure", label: "exclusion" }],
    footnote: "Admission and retention run every 4 h.",
  });
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const main = elements.get("legend-0-line");
  const failure = elements.get("legend-1-line");
  assert.deepEqual([main.strokeWidth, main.strokeStyle], [3, "solid"]);
  assert.deepEqual([failure.strokeColor, failure.strokeStyle], [PALETTE.shades.red[4], "dashed"]);
  assert.equal(elements.get("legend-1-label").text, "exclusion");
  const zone = elements.get("group-liquid");
  assert.ok(main.y > zone.y + zone.height, "the legend is below the diagram");
  const footnote = scene.elements.at(-1);
  assert.equal(footnote.id, "footnote");
  assert.ok(footnote.y > main.y, "the footnote is below the legend");

  await assert.rejects(buildFlow({ ...lifecycle, legend: [{ path: "detour", label: "x" }] }),
    (error) => error instanceof SpecError && /legend\[0\]\.path/.test(error.message));
});

test("a dashed node marks a wait, such as a timeout, a queue, or a human step", async () => {
  const elements = byId(await buildFlow({
    ...review,
    nodes: review.nodes.map((node) => (node.id === "check" ? { ...node, dashed: true } : node)),
  }));
  assert.equal(elements.get("check").strokeStyle, "dashed");
  assert.equal(elements.get("valid").strokeStyle, "solid");
});

test("the main path stays straight when it runs into a group with back edges", async () => {
  for (const direction of ["RIGHT", "DOWN"]) {
    const elements = byId(await buildFlow({
      direction,
      groups: [{ id: "liquid_set", label: "LIQUID SET", tone: "blue" }],
      nodes: [
        { id: "market", label: "Market" },
        { id: "admit", kind: "decision", label: "admit?" },
        { id: "liquid", label: "Liquid", group: "liquid_set" },
        { id: "fires", kind: "decision", label: "fires?", group: "liquid_set" },
        { id: "active", label: "Active", group: "liquid_set" },
        { id: "quiet", kind: "decision", label: "quiet?", group: "liquid_set" },
      ],
      edges: [
        { from: "market", to: "admit", path: "main" },
        { from: "admit", to: "liquid", label: "yes", path: "main" },
        { from: "admit", to: "market", label: "no" },
        { from: "liquid", to: "fires", path: "main" },
        { from: "fires", to: "active", label: "yes", path: "main" },
        { from: "fires", to: "liquid", label: "no" },
        { from: "active", to: "quiet" },
        { from: "quiet", to: "active", label: "no" },
        { from: "quiet", to: "liquid", label: "yes", path: "recovery" },
      ],
    }));
    const across = (id) => {
      const shape = elements.get(id);
      return direction === "RIGHT" ? shape.y + shape.height / 2 : shape.x + shape.width / 2;
    };
    for (const id of ["admit", "liquid", "fires", "active"]) {
      assert.ok(Math.abs(across(id) - across("market")) < 1, `${direction}: ${id} stands on the main line`);
  }
  }
});

test("a zone label covers the edges that cross it, on a plate in the background color", async () => {
  for (const style of ["clean", "sketch"]) {
    const scene = await buildFlow({ ...lifecycle, direction: "DOWN", style });
    const order = new Map(scene.elements.map((element, index) => [element.id, index]));
    const elements = byId(scene);
    const plate = elements.get("group-liquid-plate");
    const label = elements.get("group-liquid-label");
    assert.ok(inside(label, plate), `${style}: the plate holds the label`);
    assert.notEqual(plate.backgroundColor, "transparent", `${style}: the plate is opaque`);
    const lastArrow = Math.max(...scene.elements.filter((element) => element.type === "arrow").map((arrow) => order.get(arrow.id)));
    assert.ok(order.get(plate.id) > lastArrow && order.get(label.id) > order.get(plate.id), `${style}: the label is drawn over the edges`);
  }
});

test("the flow runs top to bottom by default, so long flows fit the delivery width", async () => {
  const elements = byId(await buildFlow(review));
  const [check, valid] = [elements.get("check"), elements.get("valid")];
  assert.ok(valid.y > check.y + check.height, "the decision is below the action");
});

// The middle points of the four sides of a shape: its vertices for a diamond.
function vertices(shape) {
  const [cx, cy] = [shape.x + shape.width / 2, shape.y + shape.height / 2];
  return { top: [cx, shape.y], bottom: [cx, shape.y + shape.height], left: [shape.x, cy], right: [shape.x + shape.width, cy] };
}
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1;

test("a decision sends one outcome along the flow and the others from the side vertex toward their target", async () => {
  for (const [direction, along, sides] of [["DOWN", "bottom", ["left", "right"]], ["RIGHT", "right", ["top", "bottom"]]]) {
    const scene = await buildFlow({ ...checkout, direction });
    const elements = byId(scene);
    const center = (shape) => [shape.x + shape.width / 2, shape.y + shape.height / 2];
    const axis = direction === "DOWN" ? 0 : 1;
    const outcomes = checkout.edges.map((edge, index) => ({ ...edge, arrow: elements.get(`e${index + 1}`) }))
      .filter((edge) => edge.from === "stock" || edge.from === "paid");
    for (const { from, to, path, arrow } of outcomes) {
      const decision = elements.get(from);
      const side = path === "main" ? along : sides[center(elements.get(to))[axis] < center(decision)[axis] ? 0 : 1];
      assert.ok(near(globalPoints(arrow)[0], vertices(decision)[side]), `${direction}: ${arrow.id} leaves ${from} at its ${side} vertex`);
    }
  }
});

test("edges meet a circle at the middle of its side", async () => {
  const elements = byId(await buildFlow(checkout));
  const lost = elements.get("lost");
  const ends = checkout.edges.flatMap((edge, index) => (edge.to === "lost" ? [globalPoints(elements.get(`e${index + 1}`)).at(-1)] : []));
  assert.equal(ends.length, 2);
  for (const end of ends) assert.ok(near(end, vertices(lost).top), "the edge ends at the top of the circle");
});

// The fathom coin lifecycle: loops inside a group put several labels in one layer.
const coin = {
  groups: [{ id: "liquid_set", label: "LIQUID SET · admission and retention re-checked every 4 h", tone: "blue" }],
  nodes: [
    { id: "listing", kind: "start", label: "listing" },
    { id: "market", label: "Market", dashed: true },
    { id: "admit", kind: "decision", label: "admit?", note: ["24h quote ≥ 50M", "or trades ≥ 500k"] },
    { id: "liquid", label: ["Liquid", "not active"], group: "liquid_set" },
    { id: "fires", kind: "decision", label: "fires?", group: "liquid_set",
      note: ["every 5m bar:", "cross RV ≥ 10", "or impulse ≥ 20 medTR"] },
    { id: "active", label: "Active", group: "liquid_set" },
    { id: "quiet", kind: "decision", label: "quiet?", group: "liquid_set", note: ["no fire for 12 bars", "(timeout stub)"] },
    { id: "holds", kind: "decision", label: "holds?", note: ["24h quote ≥ 35M", "or trades ≥ 350k", "grace hold_hours = 0"] },
  ],
  edges: [
    { from: "listing", to: "market" },
    { from: "market", to: "admit", path: "main" },
    { from: "admit", to: "liquid", label: "admission", path: "main" },
    { from: "admit", to: "market", label: "no" },
    { from: "liquid", to: "fires", path: "main" },
    { from: "fires", to: "active", label: "activation", path: "main" },
    { from: "fires", to: "liquid", label: "no" },
    { from: "active", to: "quiet" },
    { from: "quiet", to: "active", label: "fire" },
    { from: "quiet", to: "liquid", label: "deactivation", path: "recovery" },
    { from: "liquid_set", to: "holds", label: "every 4 h" },
    { from: "holds", to: "liquid_set", label: "retention" },
    { from: "holds", to: "market", label: "exclusion", path: "failure" },
  ],
};

test("edge labels keep apart, so two labels never read as one phrase", async () => {
  for (const direction of ["DOWN", "RIGHT"]) {
    const scene = await buildFlow({ ...coin, direction });
    const labels = scene.elements.filter((element) => element.containerId && element.id.endsWith("-label"));
    for (const [index, a] of labels.entries()) {
      for (const b of labels.slice(index + 1)) {
        const grown = { x: a.x - 16, y: a.y - 4, width: a.width + 32, height: a.height + 8 };
        assert.ok(!overlaps(grown, b), `${direction}: "${a.text}" and "${b.text}" keep apart`);
      }
    }
  }
});
