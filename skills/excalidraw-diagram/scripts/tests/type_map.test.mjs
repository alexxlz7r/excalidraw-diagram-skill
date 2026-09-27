import assert from "node:assert/strict";
import test from "node:test";

import { validateExcalidraw } from "../export_excalidraw.mjs";
import { buildTypeMap, PALETTE, SpecError } from "../type_map.mjs";
import { textWidth } from "../layout.mjs";

const dipSpec = {
  groups: [{ id: "high", label: "business rules" }],
  types: [
    { id: "OrderService", group: "high", members: ["repo", "placeOrder(order)"] },
    { id: "OrderRepository", kind: "interface", group: "high", members: ["save(order)"] },
    { id: "MySqlOrderRepository", members: ["save(order)"] },
  ],
  relations: [
    { from: "OrderService", to: "OrderRepository", type: "depends" },
    { from: "MySqlOrderRepository", to: "OrderRepository", type: "implements", label: "implements" },
  ],
};

function byId(scene) {
  return new Map(scene.elements.map((element) => [element.id, element]));
}

function arrowEnd(arrow) {
  const [dx, dy] = arrow.points.at(-1);
  return [arrow.x + dx, arrow.y + dy];
}

test("type map builds a valid scene with UML connectors", async () => {
  const scene = await buildTypeMap(dipSpec);
  assert.deepEqual(validateExcalidraw(scene), []);

  const elements = byId(scene);
  const arrows = scene.elements.filter((element) => element.type === "arrow");
  const realization = arrows.find((arrow) => arrow.id.includes("-implements-"));
  assert.equal(realization.strokeStyle, "dashed");
  assert.equal(realization.endArrowhead, "triangle_outline");
  assert.equal(realization.startBinding.elementId, "MySqlOrderRepository");
  assert.equal(realization.endBinding.elementId, "OrderRepository");

  const dependency = arrows.find((arrow) => arrow.id.includes("-depends-"));
  assert.equal(dependency.strokeStyle, "dashed");
  assert.equal(dependency.endArrowhead, "arrow");

  const interfaceBox = elements.get("OrderRepository");
  const implementation = elements.get("MySqlOrderRepository");
  assert.ok(interfaceBox.y + interfaceBox.height < implementation.y, "parent sits above the implementation");
  const [, endY] = arrowEnd(realization);
  assert.ok(Math.abs(endY - (interfaceBox.y + interfaceBox.height)) < 2, "realization ends at the interface");

  for (const arrow of arrows) {
    for (const binding of [arrow.startBinding, arrow.endBinding]) {
      const target = elements.get(binding.elementId);
      assert.ok(target.boundElements.some((bound) => bound.id === arrow.id));
    }
  }
  assert.equal(elements.get("OrderRepository-badge-text").text, "I");
});

test("connectors keep their ends on the box border when a type moves", async () => {
  const scene = await buildTypeMap({
    direction: "DOWN",
    types: [
      { id: "task", kind: "struct", members: ["pid", "files"] },
      { id: "files", kind: "struct", members: ["count"] },
      { id: "Base" },
    ],
    relations: [
      { from: "task", fromMember: "files", to: "files", type: "navigates" },
      { from: "task", to: "Base", type: "extends" },
    ],
  });
  const elements = byId(scene);
  for (const arrow of scene.elements.filter((element) => element.type === "arrow" && !element.id.startsWith("legend-"))) {
    const ends = [[arrow.startBinding, [arrow.x + arrow.points[0][0], arrow.y + arrow.points[0][1]]],
      [arrow.endBinding, arrowEnd(arrow)]];
    for (const [binding, point] of ends) {
      const target = elements.get(binding.elementId);
      assert.equal(binding.mode, "inside", `${arrow.id}: later releases keep the end at its fixed point`);
      const fixed = [target.x + binding.fixedPoint[0] * target.width, target.y + binding.fixedPoint[1] * target.height];
      assert.ok(Math.hypot(fixed[0] - point[0], fixed[1] - point[1]) < 1e-6, `${arrow.id}: the fixed point is the end`);
      const onBorder = binding.fixedPoint.some((ratio) => Math.abs(ratio) < 1e-6 || Math.abs(ratio - 1) < 1e-6);
      assert.ok(onBorder, `${arrow.id}: the end is on the border of ${target.id}`);
      assert.equal(typeof binding.focus, "number");
    }
  }
  const pointer = scene.elements.find((element) => element.id.includes("-navigates-"));
  assert.notEqual(pointer.startBinding.focus, 0, "Excalidraw 0.18 aims at the member row, not at the center");
});

test("member references start arrows at the member row", async () => {
  const scene = await buildTypeMap({
    direction: "RIGHT",
    types: [
      { id: "task", kind: "struct", members: ["pid", "files"] },
      { id: "files", kind: "struct", members: ["count"] },
    ],
    relations: [{ from: "task", fromMember: "files", to: "files", type: "navigates" }],
  });
  const elements = byId(scene);
  const arrow = scene.elements.find((element) => element.type === "arrow");
  const task = elements.get("task");
  const cell = elements.get("task-member-1-cell");
  assert.ok(Math.abs(arrow.x - (task.x + task.width)) < 1);
  assert.ok(Math.abs(arrow.y - (cell.y + cell.height / 2)) < 1);
  assert.equal(arrow.startArrowhead, "dot");
});

test("pointer chains in vertical layouts stay in one column", async () => {
  const scene = await buildTypeMap({
    direction: "DOWN",
    types: [
      { id: "task", kind: "struct", members: ["pid", "files"] },
      { id: "files", kind: "struct", members: ["count", "fdt"] },
      { id: "fdt", kind: "struct", members: ["fd[0]", "fd[1]"] },
      { id: "stdin", kind: "struct", members: ["f_pos"] },
      { id: "stdout", kind: "struct", members: ["f_pos"] },
    ],
    relations: [
      { from: "task", fromMember: "files", to: "files", type: "navigates" },
      { from: "files", fromMember: "fdt", to: "fdt", type: "navigates" },
      { from: "fdt", fromMember: "fd[0]", to: "stdin", type: "navigates" },
      { from: "fdt", fromMember: "fd[1]", to: "stdout", type: "navigates" },
    ],
  });
  const elements = byId(scene);
  const right = (id) => elements.get(id).x + elements.get(id).width;
  assert.ok(Math.abs(right("task") - right("files")) < 20, "files stays under task");
  assert.ok(Math.abs(right("files") - right("fdt")) < 20, "fdt stays under files");
  assert.ok(Math.abs(elements.get("stdin").y - elements.get("stdout").y) < 1, "sibling targets share a layer");

  const arrows = scene.elements.filter((element) => element.type === "arrow");
  const ends = arrows.map((arrow) => arrowEnd(arrow).map(Math.round).join(","));
  assert.equal(new Set(ends).size, ends.length, "arrowheads do not overlap");
  const loop = arrows.find((arrow) => arrow.startBinding.elementId === "files");
  const [endX, endY] = arrowEnd(loop);
  const fdt = elements.get("fdt");
  const header = elements.get("fdt-header");
  assert.ok(Math.abs(endX - (fdt.x + fdt.width)) < 1, "loop enters the side of the target");
  assert.ok(endY >= header.y && endY <= header.y + header.height, "loop enters beside the header");
});

test("text fields accept arrays of lines and titles sit above the graph", async () => {
  const scene = await buildTypeMap({
    title: "Title",
    subtitle: ["first line", "second line"],
    types: [{ id: "note", kind: "note", text: ["CLONE_FILES:", "shared"] }, { id: "A" }],
    legend: [{ kind: "class", label: "class" }, { tone: "green", label: "role" }, { relation: "implements", label: "implements" }],
  });
  const elements = byId(scene);
  assert.equal(elements.get("note-note").text, "CLONE_FILES:\nshared");
  assert.equal(elements.get("subtitle").text, "first line\nsecond line");
  assert.ok(elements.get("title").fontSize > elements.get("A-name").fontSize);
  assert.ok(elements.get("title").y < elements.get("A").y);
  const legendTop = Math.min(...scene.elements.filter((element) => element.id.startsWith("legend-")).map((element) => element.y));
  assert.ok(legendTop > elements.get("A").y + elements.get("A").height);
  assert.deepEqual(validateExcalidraw(scene), []);
});

test("panels are placed side by side without overlap", async () => {
  const scene = await buildTypeMap({
    title: "DIP",
    panels: [
      { title: "Before", types: [{ id: "A" }, { id: "B" }], relations: [{ from: "A", to: "B", type: "depends" }] },
      { title: "After", types: [{ id: "A" }] },
    ],
  });
  const firstPanel = scene.elements.filter((element) => element.id.startsWith("p1-"));
  const secondPanel = scene.elements.filter((element) => element.id.startsWith("p2-"));
  const firstRight = Math.max(...firstPanel.map((element) => element.x + element.width));
  const secondLeft = Math.min(...secondPanel.map((element) => element.x));
  assert.ok(firstRight < secondLeft);
  assert.equal(new Set(scene.elements.map((element) => element.id)).size, scene.elements.length);
});

test("invalid specs report the offending reference", async () => {
  await assert.rejects(
    buildTypeMap({ types: [{ id: "A" }], relations: [{ from: "A", to: "B" }] }),
    (error) => error instanceof SpecError && /unknown type "B"/.test(error.message),
  );
  await assert.rejects(
    buildTypeMap({ types: [{ id: "A" }, { id: "B" }], relations: [{ from: "A", fromMember: "x", to: "B" }] }),
    /"A" has no member "x"/,
  );
  await assert.rejects(
    buildTypeMap({ types: [{ id: "A", tone: "purple" }] }),
    /Unknown tone "purple"/,
  );
  await assert.rejects(
    buildTypeMap({ types: [{ id: "A" }, { id: "B" }], relations: [{ from: "A", to: "B", type: "uses" }] }),
    /unknown relation "uses"/,
  );
});

test("palette matches Excalidraw picker shades", () => {
  assert.equal(PALETTE.black, "#1e1e1e");
  assert.deepEqual(PALETTE.shades.green, ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"]);
  for (const shades of Object.values(PALETTE.shades)) assert.equal(shades.length, 5);
});

test("groups are at least as wide as their labels in every direction", async () => {
  const label = "a long group label that is wider than its only type";
  for (const direction of ["DOWN", "UP", "RIGHT", "LEFT"]) {
    const scene = await buildTypeMap({
      direction,
      groups: [{ id: "g", label }],
      types: [{ id: "A", group: "g" }],
    });
    const elements = byId(scene);
    const group = elements.get("group-g");
    const text = elements.get("group-g-label");
    assert.ok(group.width >= text.width + 40, `${direction}: group fits its label`);
    assert.ok(group.height < group.width, `${direction}: minimum size is not applied to the height`);
  }
});

test("structs render as records and highlights default to the type tone", async () => {
  const scene = await buildTypeMap({
    types: [
      { id: "file", kind: "struct", tone: "violet", members: [{ text: "f_pos", highlight: true }, "f_op"] },
      { id: "plain", members: [{ text: "field", highlight: true }] },
    ],
    legend: [{ highlight: true, label: "shared" }, { tone: "violet", label: "file" }],
  });
  const elements = byId(scene);
  const file = elements.get("file");
  const header = elements.get("file-header");
  assert.equal(header.x, file.x, "record title bar spans the full width");
  assert.equal(header.width, file.width);
  assert.equal(header.backgroundColor, PALETTE.shades.violet[1]);
  assert.equal(elements.get("file-member-0-cell").backgroundColor, PALETTE.shades.violet[2]);
  assert.equal(elements.get("plain-member-0-highlight").backgroundColor, PALETTE.shades.yellow[1]);
  assert.notEqual(elements.get("legend-0-swatch").backgroundColor, elements.get("legend-1-swatch").backgroundColor);
});

test("bottom alignment puts the last layer of each panel on one line", async () => {
  const scene = await buildTypeMap({
    align: "bottom",
    panels: [
      { title: "Before", types: [{ id: "A" }, { id: "B" }], relations: [{ from: "A", to: "B", type: "depends" }] },
      { title: "After", types: [{ id: "A" }, { id: "I", kind: "interface" }, { id: "B" }],
        relations: [{ from: "A", to: "I", type: "depends" }, { from: "B", to: "I", type: "implements" }] },
    ],
  });
  const elements = byId(scene);
  const bottom = (id) => elements.get(id).y + elements.get(id).height;
  assert.ok(Math.abs(bottom("p1-B") - bottom("p2-B")) < 1);
  assert.equal(elements.get("p1-title").y, elements.get("p2-title").y, "panel titles stay on one line");
});

test("connectors never end on a corner of a type", async () => {
  const scene = await buildTypeMap({
    direction: "DOWN",
    types: [
      { id: "a", kind: "struct", members: ["x", "ptr"] },
      { id: "b", kind: "struct", members: ["y", "ptr"] },
      { id: "c", kind: "struct", members: ["z"] },
      { id: "inode", kind: "struct", members: ["n"] },
    ],
    relations: [
      { from: "a", fromMember: "ptr", to: "inode", type: "navigates" },
      { from: "b", fromMember: "ptr", to: "inode", type: "navigates" },
      { from: "c", to: "inode", type: "depends" },
    ],
  });
  const elements = byId(scene);
  const inode = elements.get("inode");
  for (const arrow of scene.elements.filter((element) => element.type === "arrow")) {
    const [x, y] = arrowEnd(arrow);
    const nearCornerX = Math.min(Math.abs(x - inode.x), Math.abs(x - inode.x - inode.width));
    const nearCornerY = Math.min(Math.abs(y - inode.y), Math.abs(y - inode.y - inode.height));
    assert.ok(nearCornerX > 10 || nearCornerY > 10, `${arrow.id} ends away from the corners`);
  }
});

test("arrowheads and pointer dots share one size", async () => {
  const scene = await buildTypeMap({
    direction: "DOWN",
    types: [
      { id: "task", kind: "struct", members: ["pid", "files"] },
      { id: "files", kind: "struct", members: ["fdt"] },
      { id: "far", kind: "struct", members: ["x"] },
    ],
    relations: [
      { from: "task", fromMember: "files", to: "files", type: "navigates" },
      { from: "task", to: "far", type: "depends", label: "a long dependency" },
    ],
    spacing: { layers: 200 },
  });
  const lengths = [];
  for (const arrow of scene.elements.filter((element) => element.type === "arrow")) {
    const points = arrow.points;
    if (arrow.endArrowhead) lengths.push(Math.hypot(points.at(-1)[0] - points.at(-2)[0], points.at(-1)[1] - points.at(-2)[1]));
    if (arrow.startArrowhead) lengths.push(Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]));
  }
  for (const length of lengths) assert.ok(Math.abs(length - 32) < 1.5, `end segment ${length.toFixed(1)} px`);
});

function endSegments(scene) {
  const lengths = [];
  for (const arrow of scene.elements.filter((element) => element.type === "arrow")) {
    const points = arrow.points;
    const length = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (arrow.endArrowhead) lengths.push([`${arrow.id} end`, length(points.at(-2), points.at(-1)), arrow.endArrowhead]);
    if (arrow.startArrowhead) lengths.push([`${arrow.id} start`, length(points[0], points[1]), arrow.startArrowhead]);
  }
  return lengths;
}

test("connectors inside a group keep full end segments", async () => {
  const scene = await buildTypeMap({
    direction: "DOWN",
    groups: [{ id: "g", label: "group" }],
    types: [
      { id: "Page", group: "g", kind: "struct", members: ["summary", "items"] },
      { id: "Summary", group: "g" },
      { id: "Store", group: "g" },
      { id: "Api", group: "g" },
    ],
    relations: [
      { from: "Page", fromMember: "items", to: "Store", type: "navigates" },
      { from: "Page", to: "Summary", type: "composition", label: "items" },
      { from: "Store", to: "Api", type: "depends" },
    ],
  });
  for (const [where, length, head] of endSegments(scene)) {
    const expected = head.startsWith("diamond") ? 48 : 32;
    assert.ok(Math.abs(length - expected) < 1.5, `${where}: end segment ${length.toFixed(1)} px`);
  }
});

test("diamonds get their full size on bent connectors", async () => {
  const scene = await buildTypeMap({
    direction: "DOWN",
    types: [{ id: "Whole" }, { id: "Left" }, { id: "Right" }, { id: "Other" }],
    relations: [
      { from: "Whole", to: "Left", type: "composition" },
      { from: "Whole", to: "Right", type: "aggregation" },
      { from: "Whole", to: "Other", type: "composition" },
    ],
  });
  for (const [where, length] of endSegments(scene)) {
    assert.ok(Math.abs(length - 48) < 1.5, `${where}: end segment ${length.toFixed(1)} px`);
  }
});

test("labels sit on the middle of the connector path", async () => {
  const scene = await buildTypeMap({
    types: [{ id: "A" }, { id: "B" }],
    relations: [{ from: "A", to: "B", type: "depends", label: "uses" }],
    spacing: { layers: 160 },
  });
  const arrow = scene.elements.find((element) => element.type === "arrow");
  const label = scene.elements.find((element) => element.containerId === arrow.id);
  assert.equal(arrow.points.length % 2, 1, "odd point count puts a point in the middle");
  const [mx, my] = arrow.points[(arrow.points.length - 1) / 2];
  const [startX, startY] = arrow.points[0];
  const [endX, endY] = arrow.points.at(-1);
  assert.ok(Math.abs(my - (startY + endY) / 2) < 1 && Math.abs(mx - (startX + endX) / 2) < 1, "middle point is the path center");
  assert.ok(Math.abs(label.x + label.width / 2 - (arrow.x + mx)) < 1);
  assert.ok(Math.abs(label.y + label.height / 2 - (arrow.y + my)) < 1);
});

const zoneSpec = (style) => ({
  ...(style === undefined ? {} : { style }),
  groups: [
    { id: "backend", label: "backend", tone: "blue" },
    { id: "data", label: "data", parent: "backend", tone: "green" },
    { id: "rows", label: "rows", parent: "data" },
  ],
  types: [
    { id: "OrderRepository", kind: "interface", group: "backend", members: ["+ save(order)", "+ delete(order)"] },
    { id: "SqlOrderRepository", group: "data", members: ["+ save(order)", "- db: Connector", "+ delete(order)"] },
    { id: "Row", kind: "struct", group: "rows", members: ["id", "total"] },
  ],
  relations: [{ from: "SqlOrderRepository", to: "OrderRepository", type: "implements" }],
});

test("clean is the default style: sans labels, monospace members, smooth lines", async () => {
  const elements = byId(await buildTypeMap(zoneSpec()));
  assert.equal(elements.get("SqlOrderRepository-name").fontFamily, 6);
  assert.equal(elements.get("SqlOrderRepository-member-0").fontFamily, 3);
  assert.equal(elements.get("group-backend-label").fontFamily, 6);
  for (const element of elements.values()) assert.equal(element.roughness, 0, element.id);
});

test("members in Cascadia keep their exact width; labels in Comic Shanns keep a margin", async () => {
  const elements = byId(await buildTypeMap(zoneSpec({ preset: "clean", fontFamily: 8 })));
  const member = elements.get("SqlOrderRepository-member-0");
  assert.equal(member.fontFamily, 3);
  assert.equal(member.width, textWidth(member.text, member.fontSize, { fontFamily: 3 }));
  const name = elements.get("SqlOrderRepository-name");
  assert.equal(name.fontFamily, 8);
  assert.ok(Math.abs(name.width - textWidth(name.text, name.fontSize, { fontFamily: 8 }) * 1.04) < 1e-6);
});

test("style selects a preset by name, with optional overrides", async () => {
  const sketch = await buildTypeMap(zoneSpec("sketch"));
  for (const element of sketch.elements) {
    assert.equal(element.roughness, 1, element.id);
    if (element.type === "text") assert.equal(element.fontFamily, 5, element.id);
  }
  const small = byId(await buildTypeMap(zoneSpec({ preset: "sketch", fontSize: 16 })));
  assert.equal(small.get("SqlOrderRepository-member-0").fontSize, 16);
  await assert.rejects(
    () => buildTypeMap(zoneSpec("fancy")),
    (error) => error instanceof SpecError && /style must be "clean" or "sketch"/.test(error.message),
  );
});

test("clean draws a class as stacked compartments: header, fields, methods", async () => {
  const elements = byId(await buildTypeMap(zoneSpec()));
  const header = elements.get("SqlOrderRepository-header");
  const fields = elements.get("SqlOrderRepository-fields");
  const methods = elements.get("SqlOrderRepository-methods");
  assert.equal(header.backgroundColor, PALETTE.shades.orange[1], "a class header is orange");
  assert.equal(elements.get("OrderRepository-header").backgroundColor, PALETTE.shades.blue[1], "an interface header is blue");
  assert.equal(fields.backgroundColor, PALETTE.shades.orange[0]);
  assert.equal(header.y + header.height, fields.y);
  assert.equal(fields.y + fields.height, methods.y);
  const inside = (text, box) => text.y >= box.y && text.y + text.height <= box.y + box.height;
  assert.ok(inside(elements.get("SqlOrderRepository-member-1"), fields), "the field sits in the fields compartment");
  assert.ok(inside(elements.get("SqlOrderRepository-member-0"), methods), "a method sits in the methods compartment");
  assert.ok(inside(elements.get("SqlOrderRepository-member-2"), methods));
  assert.equal(elements.has("OrderRepository-fields"), false, "an interface without fields has no fields compartment");
  for (const box of [header, fields, methods]) assert.equal(box.roundness, null, `${box.id} has sharp corners`);
});

test("sketch draws a class as one rounded box divided by rules, without color", async () => {
  const scene = await buildTypeMap(zoneSpec("sketch"));
  const elements = byId(scene);
  assert.notEqual(elements.get("SqlOrderRepository").roundness, null);
  const rules = (id) => scene.elements.filter((element) => element.type === "line" && element.id.startsWith(`${id}-rule-`));
  assert.equal(rules("SqlOrderRepository").length, 2, "rules under the header and under the fields");
  assert.equal(rules("OrderRepository").length, 1);
  for (const element of scene.elements) {
    assert.ok(["transparent", PALETTE.white].includes(element.backgroundColor), `${element.id} has no color fill`);
    if (element.type !== "text") assert.equal(element.strokeColor, PALETTE.black, `${element.id} is drawn in ink`);
  }
});

test("clean zones hatch below their types, with the title on a solid plate", async () => {
  const scene = await buildTypeMap(zoneSpec());
  const elements = byId(scene);
  const order = new Map(scene.elements.map((element, index) => [element.id, index]));
  assert.equal(elements.get("group-backend").fillStyle, "hachure");
  assert.equal(elements.get("group-backend").backgroundColor, PALETTE.shades.blue[1]);
  assert.equal(elements.get("group-data").fillStyle, "cross-hatch");
  assert.equal(elements.get("group-rows").fillStyle, "solid");
  assert.ok(order.get("group-backend") < order.get("OrderRepository"));
  assert.ok(order.get("group-data") < order.get("SqlOrderRepository"));
  const plate = elements.get("group-backend-plate");
  const label = elements.get("group-backend-label");
  assert.equal(plate.fillStyle, "solid");
  assert.ok(label.x >= plate.x && label.x + label.width <= plate.x + plate.width, "the title fits its plate");
  assert.ok(order.get("group-backend-plate") < order.get("group-backend-label"));
  for (const id of ["OrderRepository", "SqlOrderRepository", "Row"]) {
    assert.notEqual(elements.get(id).backgroundColor, "transparent", `${id} hides the hatch`);
  }
});

test("sketch has no colors, so a tone legend item is an error", async () => {
  await assert.rejects(
    () => buildTypeMap({ ...zoneSpec("sketch"), legend: [{ tone: "blue", label: "backend" }] }),
    (error) => error instanceof SpecError && /sketch/.test(error.message),
  );
});
